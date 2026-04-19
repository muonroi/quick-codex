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

function extractGrayAreaTriggers(artifact) {
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

function synthesizeClarificationOptions(artifact, triggers) {
  const focus = summarizeGrayAreas(triggers);
  return [
    `Option A: narrow the scope to the confirmed evidence only and keep work bounded while leaving ${focus} out of scope.`,
    `Option B: provide the missing intent or boundary details so qc-flow can resolve ${focus} and continue safely.`,
    `Option C: confirm that more repo research is still expected before planning despite ${focus} remaining open.`
  ];
}

function synthesizeClarificationPrompt(artifact, triggers) {
  const options = synthesizeClarificationOptions(artifact, triggers);
  return [
    `Ask the user to resolve the remaining gray areas before continuing ${artifact.relativeRunPath}.`,
    `Gray areas still open: ${summarizeGrayAreas(triggers)}.`,
    "Options:",
    ...options.map((option, index) => `${index + 1}. ${option}`)
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
  const decision = decideWrapperAction({ artifact, state, sameSession: true, preferBoundaryAction: true });

  if (!continuationPrompt && grayAreaTriggers.length > 0 && !asksUser(decision.prompt)) {
    decision.prompt = synthesizeResearchPrompt(artifact, grayAreaTriggers);
  }

  return {
    flowState,
    artifact,
    decision
  };
}
