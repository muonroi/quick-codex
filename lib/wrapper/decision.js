import { orchestrateDecision } from "./orchestrator.js";

function defaultPromptFromArtifact(artifact) {
  return artifact.nextWavePack.resumePayload
    ?? artifact.waveHandoff.resumePayload
    ?? artifact.compactSafeSummary.resumeWith
    ?? artifact.recommendedNextCommand
    ?? `Use $qc-flow and resume from ${artifact.relativeRunPath}. Treat the run artifact as source of truth.`;
}

function phaseRelation(artifact) {
  return artifact.nextWavePack.phaseRelation
    ?? artifact.waveHandoff.phaseRelation
    ?? artifact.compactSafeSummary.phaseRelation
    ?? "same-phase";
}

function compactionAction(artifact, relation) {
  return artifact.nextWavePack.compactionAction
    ?? artifact.compactSafeSummary.compactionAction
    ?? (relation === "independent-next-phase" ? "clear" : relation === "relock-before-next-phase" ? "relock" : "compact");
}

export function decideWrapperAction({ artifact, state, sameSession = false, preferBoundaryAction = false }) {
  const relation = phaseRelation(artifact);
  const compactAction = compactionAction(artifact, relation);
  const prompt = defaultPromptFromArtifact(artifact);
  const stateEntry = state.runs[artifact.relativeRunPath] ?? null;
  const resumableSessionId = stateEntry?.lastExecSessionId ?? null;
  const resumableThreadId = stateEntry?.lastNativeThreadId ?? null;

  let mode = "fresh-session";
  let reason = "Fresh session is the deterministic default for wrapper-driven continuity.";

  if (relation === "same-phase" && sameSession && (resumableThreadId || resumableSessionId)) {
    if (preferBoundaryAction && resumableThreadId && compactAction === "compact") {
      mode = "fresh-session";
      reason = "Same-phase auto orchestration should prefer the recorded compaction boundary when a native thread is available.";
    } else {
      mode = "resume-session";
      reason = "Same-phase continuation can reuse the previous session when the operator explicitly asks for it.";
    }
  } else if (relation === "relock-before-next-phase") {
    mode = "fresh-session";
    reason = "Relock boundaries should start clean rather than carrying a previous session forward.";
  } else if (relation === "dependent-next-phase") {
    mode = "fresh-session";
    reason = "Dependent next phases should carry only the narrow artifact payload into a fresh session.";
  } else if (relation === "independent-next-phase") {
    mode = "fresh-session";
    reason = "Independent phases should reset session context and resume from proof only.";
  }

  const promptSource = artifact.nextWavePack.resumePayload
    ? "next-wave-pack"
    : artifact.waveHandoff.resumePayload
      ? "wave-handoff"
      : artifact.compactSafeSummary.resumeWith
        ? "compact-safe-summary"
        : "recommended-next-command";

  const orchestration = orchestrateDecision({
    phaseRelation: relation,
    compactionAction: compactAction,
    mode
  });

  if ((orchestration.nativeThreadAction === "thread/resume" || orchestration.nativeThreadAction === "thread/compact/start") && !resumableThreadId) {
    orchestration.nativeThreadAction = null;
  }

  const summary = [
    `Run: ${artifact.relativeRunPath}`,
    `Current gate: ${artifact.currentGate ?? "unknown"}`,
    `Current phase / wave: ${artifact.currentPhaseWave ?? "unknown"}`,
    `Phase relation: ${relation}`,
    `Decision: ${mode}`,
    `Suggested session action: ${artifact.nextWavePack.suggestedSessionAction ?? artifact.waveHandoff.suggestedSessionAction ?? artifact.compactSafeSummary.suggestedSessionAction ?? "not recorded"}`,
    `Prompt source: ${promptSource}`,
    `Reason: ${reason}`,
    `Prompt: ${prompt}`
  ].join("\n");

  return {
    run: artifact.relativeRunPath,
    currentGate: artifact.currentGate,
    currentPhaseWave: artifact.currentPhaseWave,
    phaseRelation: relation,
    compactionAction: compactAction,
    suggestedSessionAction: artifact.nextWavePack.suggestedSessionAction ?? artifact.waveHandoff.suggestedSessionAction ?? artifact.compactSafeSummary.suggestedSessionAction,
    promptSource,
    prompt,
    mode,
    reason,
    resumableSessionId,
    resumableThreadId,
    ...orchestration,
    summary
  };
}

export function buildCheckpointSummary({ artifact, decision, state }) {
  const stateEntry = state.runs[artifact.relativeRunPath] ?? null;
  const summary = [
    `Run: ${artifact.relativeRunPath}`,
    `Decision: ${decision.mode}`,
    `Phase relation: ${decision.phaseRelation}`,
    `Compaction action: ${decision.compactionAction}`,
    `Handoff action: ${decision.handoffAction}`,
    `Chat action equivalent: ${decision.chatActionEquivalent ?? "none"}`,
    `Wrapper command equivalent: ${decision.wrapperCommandEquivalent}`,
    `Suggested session action: ${decision.suggestedSessionAction ?? "not recorded"}`,
    `What to forget: ${artifact.nextWavePack.whatToForget ?? artifact.waveHandoff.whatToForget ?? artifact.compactSafeSummary.whatToForget ?? "not recorded"}`,
    `What must remain loaded: ${artifact.nextWavePack.whatMustRemainLoaded ?? artifact.waveHandoff.whatMustRemainLoaded ?? artifact.compactSafeSummary.whatMustRemainLoaded ?? "not recorded"}`,
    `Native thread action: ${decision.nativeThreadAction ?? "none"}`,
    `Last wrapper thread id: ${stateEntry?.lastNativeThreadId ?? "none"}`,
    `Last wrapper session id: ${stateEntry?.lastExecSessionId ?? "none"}`,
    `Prompt: ${decision.prompt}`
  ].join("\n");

  return {
    run: artifact.relativeRunPath,
    phaseRelation: decision.phaseRelation,
    compactionAction: decision.compactionAction,
    handoffAction: decision.handoffAction,
    nativeThreadAction: decision.nativeThreadAction,
    chatActionEquivalent: decision.chatActionEquivalent,
    wrapperCommandEquivalent: decision.wrapperCommandEquivalent,
    suggestedSessionAction: decision.suggestedSessionAction,
    prompt: decision.prompt,
    lastNativeThreadId: stateEntry?.lastNativeThreadId ?? null,
    lastExecSessionId: stateEntry?.lastExecSessionId ?? null,
    summary
  };
}
