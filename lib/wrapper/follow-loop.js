import { decideWrapperAction } from "./decision.js";
import { readActiveRunArtifact, readFlowState, readRunArtifact } from "./run-file.js";

const ASK_USER_PATTERNS = [
  /\bask the user\b/i,
  /\bconfirm with the user\b/i,
  /\bdiscuss with the user\b/i,
  /\bclarify with the user\b/i,
  /\bwait for user\b/i,
  /\buser confirmation\b/i
];

function checkpointSnapshot(artifact) {
  if (!artifact) {
    return null;
  }
  return {
    currentGate: artifact.currentGate ?? null,
    currentPhaseWave: artifact.currentPhaseWave ?? null,
    executionState: artifact.currentStatus?.executionState ?? null,
    recommendedNextCommand: artifact.recommendedNextCommand ?? null
  };
}

export function checkpointAdvanced(previousArtifact, nextArtifact) {
  if (!nextArtifact) {
    return false;
  }
  if (!previousArtifact) {
    return true;
  }

  const previous = checkpointSnapshot(previousArtifact);
  const next = checkpointSnapshot(nextArtifact);
  return previous.currentGate !== next.currentGate
    || previous.currentPhaseWave !== next.currentPhaseWave
    || previous.executionState !== next.executionState
    || previous.recommendedNextCommand !== next.recommendedNextCommand;
}

function asksUser(value) {
  return Boolean(value) && ASK_USER_PATTERNS.some((pattern) => pattern.test(value));
}

function explicitContinuationPrompt(artifact) {
  const prompt = artifact?.nextWavePack?.resumePayload
    ?? artifact?.waveHandoff?.resumePayload
    ?? artifact?.compactSafeSummary?.resumeWith
    ?? artifact?.recommendedNextCommand
    ?? null;
  if (!prompt) {
    return null;
  }
  const normalized = String(prompt).trim();
  const genericFlowResume = `Use $qc-flow and resume from ${artifact?.relativeRunPath}.`;
  const genericLockResume = `Use $qc-lock for this task: resume from ${artifact?.relativeRunPath}.`;
  if (normalized === genericFlowResume || normalized === genericLockResume) {
    return null;
  }
  return normalized;
}

function delegationStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["idle", "required", "assigned", "completed", "blocked"].includes(normalized) ? normalized : null;
}

function activeDelegation(artifact) {
  const state = artifact?.delegationState ?? {};
  const activeOrder = [
    String(state.activeCheckpoint ?? "").trim().toLowerCase(),
    String(state.waitingOn ?? "").trim().toLowerCase(),
    "research",
    "plan-check",
    "goal-audit"
  ];
  for (const type of activeOrder) {
    if (!["research", "plan-check", "goal-audit"].includes(type)) {
      continue;
    }
    const record = type === "research"
      ? artifact?.researchDelegation
      : type === "plan-check"
        ? artifact?.planCheckDelegation
        : artifact?.goalAuditDelegation;
    const status = delegationStatus(record?.delegateStatus ?? (type === "research"
      ? state.research
      : type === "plan-check"
        ? state.planCheck
        : state.goalAudit));
    if (status === "required" || status === "assigned") {
      return {
        type,
        status,
        workerPrompt: record?.workerPrompt ?? null,
        recommendedTransition: record?.recommendedTransition ?? null
      };
    }
  }
  return null;
}

function parseGrayAreaRows(artifact) {
  return String(artifact?.grayAreaRegister ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^(\|[-\s|]+|\|\s*ID\s*\|)/i.test(line))
    .map((line) => line.split("|").map((part) => part.trim()).filter(Boolean))
    .map((parts) => ({
      id: parts[0] ?? "",
      type: parts[1] ?? "",
      question: parts[2] ?? "",
      resolutionPath: parts[4] ?? "",
      status: (parts[5] ?? "").toLowerCase()
    }));
}

function extractGrayAreaTriggers(artifact) {
  const registerLines = parseGrayAreaRows(artifact)
    .filter((row) => row.question && ["ask-user", "research"].includes(row.status))
    .map((row) => `${row.id || row.type}: ${row.question}${row.resolutionPath ? ` (${row.resolutionPath})` : ""}`);
  if (registerLines.length > 0) {
    return registerLines;
  }

  const section = artifact?.clarifyState ?? "";
  const match = section.match(/Gray-area triggers:\s*\n([\s\S]*?)(?:\n[A-Z][^:\n]+:\s*\n|\n## |\s*$)/);
  const block = match ? match[1] : "";
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line && line.toLowerCase() !== "none");
}

function summarizeGrayAreas(triggers) {
  return triggers.length > 0
    ? triggers.join("; ")
    : "unresolved repo gray areas";
}

function synthesizeResearchPrompt(artifact, triggers) {
  return `Use $qc-flow and resume from ${artifact.relativeRunPath}. Continue focused research to resolve the remaining gray areas before planning. Gray areas: ${summarizeGrayAreas(triggers)}. Update Clarify State, Context sufficiency, Evidence Basis, and Research Pack with concrete repo evidence.`;
}

function workflowStage(artifact) {
  return artifact?.workflowState?.currentStage?.toLowerCase()
    ?? artifact?.currentGate?.toLowerCase()
    ?? "clarify";
}

function hasMeaningfulRoadmap(artifact) {
  const roadmap = String(artifact?.deliveryRoadmap ?? "").trim();
  if (!roadmap) {
    return false;
  }
  const normalized = roadmap.toLowerCase();
  return normalized !== "pending delivery roadmap."
    && normalized !== "pending roadmap."
    && normalized !== "not started."
    && /\|\s*p\d+\s*\|/i.test(roadmap);
}

function hasMeaningfulPlan(artifact) {
  const plan = String(artifact?.verifiedPlan ?? "").trim();
  if (!plan) {
    return false;
  }
  const normalized = plan.toLowerCase();
  return normalized !== "pending verified plan."
    && normalized !== "not started."
    && normalized !== "pending plan."
    && normalized !== "pending verified phase plan."
    && normalized !== "pending phase plan.";
}

function synthesizeWorkflowPrompt(artifact) {
  const stage = workflowStage(artifact);
  if (stage === "discuss" || stage === "clarify") {
    return `Use $qc-flow and resume from ${artifact.relativeRunPath}. Stay in discuss/clarify. Resolve goal, constraints, success conditions, and affected-area exclusions first. Update Workflow State, Clarify State, Gray Area Register, Resume Digest, and Recommended Next Command before moving on.`;
  }
  if (stage === "explore") {
    return `Use $qc-flow and resume from ${artifact.relativeRunPath}. Stay in explore. Map affected area, blast radius, protected boundaries, and candidate approaches. Update Workflow State, Clarify State, Gray Area Register, and Delivery Roadmap readiness before moving on.`;
  }
  if (stage === "research") {
    return `Use $qc-flow and resume from ${artifact.relativeRunPath}. Stay in research. Fill only the missing repo facts that block roadmap or planning. Update Workflow State, Evidence Basis, Research Pack, and Gray Area Register with concrete evidence.`;
  }
  if (stage === "roadmap" || !hasMeaningfulRoadmap(artifact)) {
    return `Use $qc-flow and resume from ${artifact.relativeRunPath}. Create or refine the Delivery Roadmap before phase planning. Make the roadmap explicit with phases, dependencies, verification checkpoints, current roadmap phase, and next required transition.`;
  }
  if (stage === "plan" || stage === "plan-check" || !hasMeaningfulPlan(artifact)) {
    return `Use $qc-flow and resume from ${artifact.relativeRunPath}. Stay in phase-plan / plan-check. Create or verify the phase-local plan from the current roadmap phase, then update Workflow State, Verified Plan, Resume Digest, and Recommended Next Command.`;
  }
  return null;
}

function synthesizeClarificationOptions(artifact, triggers) {
  return triggers.flatMap((trigger, index) => ([
    `[${index + 1}.A Recommended] Resolve "${trigger}" by choosing the narrower, already-supported scope so qc-flow can continue without guessing.`,
    `[${index + 1}.B] Provide the missing intent, boundary, or contract details for "${trigger}" so qc-flow can continue the current run safely.`,
    `[${index + 1}.C] Tell qc-flow to keep exploring/researching "${trigger}" before any roadmap, plan, or execution step continues.`
  ]));
}

function synthesizeClarificationPrompt(artifact, triggers) {
  const options = synthesizeClarificationOptions(artifact, triggers);
  return [
    `Ask the user to resolve the remaining gray areas before continuing ${artifact.relativeRunPath}.`,
    `Gray areas still open: ${summarizeGrayAreas(triggers)}.`,
    "Hard rule: do not guess. Do not continue to roadmap, plan, or execution until every gray area is cleared.",
    "Options:",
    ...options.map((option, index) => `${index + 1}. ${option}`),
    "4. Enter a custom answer if none of the suggested options fit."
  ].join("\n");
}

export function classifyAutoFollowStop({ previousArtifact = null, artifact, flowState, decision }) {
  if (flowState?.status === "done") {
    return {
      shouldStop: true,
      stopReason: "completed",
      checkpointAdvanced: checkpointAdvanced(previousArtifact, artifact)
    };
  }
  if (!artifact) {
    return {
      shouldStop: true,
      stopReason: "no-active-artifact",
      checkpointAdvanced: false
    };
  }

  const progressed = checkpointAdvanced(previousArtifact, artifact);
  const continuationPrompt = explicitContinuationPrompt(artifact);
  const grayAreaTriggers = extractGrayAreaTriggers(artifact);
  const grayAreaRows = parseGrayAreaRows(artifact);
  const askUserGrayAreas = grayAreaRows.filter((row) => row.question && row.status === "ask-user");
  const pendingDelegation = activeDelegation(artifact);
  const hasActionableContinuation = Boolean(continuationPrompt) && !asksUser(continuationPrompt);

  if (flowState?.status === "done" || artifact.currentGate === "done") {
    return {
      shouldStop: true,
      stopReason: "completed",
      checkpointAdvanced: progressed
    };
  }

  if (decision.handoffAction === "relock-first") {
    return {
      shouldStop: true,
      stopReason: "relock",
      checkpointAdvanced: progressed
    };
  }

  if (askUserGrayAreas.length > 0) {
    return {
      shouldStop: true,
      stopReason: "ask-user",
      checkpointAdvanced: progressed,
      prompt: synthesizeClarificationPrompt(
        artifact,
        askUserGrayAreas.map((row) => `${row.id || row.type}: ${row.question}${row.resolutionPath ? ` (${row.resolutionPath})` : ""}`)
      ),
      options: synthesizeClarificationOptions(
        artifact,
        askUserGrayAreas.map((row) => `${row.id || row.type}: ${row.question}${row.resolutionPath ? ` (${row.resolutionPath})` : ""}`)
      )
    };
  }

  if (pendingDelegation) {
    return {
      shouldStop: true,
      stopReason: "delegation-pending",
      checkpointAdvanced: progressed,
      prompt: pendingDelegation.workerPrompt
        ?? `Use $qc-flow and resume from ${artifact.relativeRunPath}. Stay at the blocking ${pendingDelegation.type} checkpoint and do not advance until its result is merged into the run artifact.`,
      delegation: pendingDelegation
    };
  }

  if (asksUser(decision.prompt) || asksUser(continuationPrompt)) {
    return {
      shouldStop: true,
      stopReason: "ask-user",
      checkpointAdvanced: progressed
    };
  }

  if (grayAreaTriggers.length > 0 && !hasActionableContinuation && previousArtifact && !progressed) {
    return {
      shouldStop: true,
      stopReason: "ask-user",
      checkpointAdvanced: false,
      prompt: synthesizeClarificationPrompt(artifact, grayAreaTriggers),
      options: synthesizeClarificationOptions(artifact, grayAreaTriggers)
    };
  }

  if ((artifact.blockers ?? []).length > 0 && !hasActionableContinuation) {
    return {
      shouldStop: true,
      stopReason: "blocker",
      checkpointAdvanced: progressed
    };
  }

  if (previousArtifact && !progressed) {
    return {
      shouldStop: true,
      stopReason: "no-checkpoint-progress",
      checkpointAdvanced: false
    };
  }

  return {
    shouldStop: false,
    stopReason: null,
    checkpointAdvanced: progressed
  };
}

export function resolveAutoContinuation({ dir, run = null, state }) {
  const flowState = readFlowState(dir);
  const artifact = run
    ? readRunArtifact({ dir, run })
    : readActiveRunArtifact(dir)?.artifact ?? null;

  if (!artifact) {
    return {
      flowState,
      artifact: null,
      decision: null
    };
  }

  const grayAreaTriggers = extractGrayAreaTriggers(artifact);
  const continuationPrompt = explicitContinuationPrompt(artifact);
  const pendingDelegation = activeDelegation(artifact);
  const decision = decideWrapperAction({ artifact, state, sameSession: true, preferBoundaryAction: true });
  const workflowPrompt = synthesizeWorkflowPrompt(artifact);

  if (pendingDelegation) {
    decision.prompt = pendingDelegation.workerPrompt
      ?? `Use $qc-flow and resume from ${artifact.relativeRunPath}. Stay at the blocking ${pendingDelegation.type} checkpoint and do not advance until its result is merged into the run artifact.`;
  } else if (!continuationPrompt && grayAreaTriggers.length > 0 && !asksUser(decision.prompt)) {
    decision.prompt = synthesizeResearchPrompt(artifact, grayAreaTriggers);
  } else if (!continuationPrompt && workflowPrompt && !asksUser(decision.prompt)) {
    decision.prompt = workflowPrompt;
  }

  return {
    flowState,
    artifact,
    decision
  };
}
