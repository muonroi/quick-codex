function nativeThreadAction(decision) {
  if (decision.mode === "resume-session") {
    return "thread/resume";
  }
  if (decision.compactionAction === "clear") {
    return "thread/start";
  }
  if (decision.compactionAction === "compact") {
    return "thread/compact/start";
  }
  return null;
}

function chatActionEquivalent(decision) {
  if (decision.mode === "resume-session") {
    return null;
  }
  if (decision.compactionAction === "compact") {
    return "/compact";
  }
  return null;
}

function handoffAction(decision) {
  if (decision.mode === "resume-session") {
    return "resume-session";
  }
  if (decision.phaseRelation === "relock-before-next-phase" || decision.compactionAction === "relock") {
    return "relock-first";
  }
  if (decision.compactionAction === "clear") {
    return "clear-session";
  }
  if (decision.compactionAction === "compact") {
    return "compact-session";
  }
  return "fresh-session";
}

function wrapperCommandEquivalent(decision) {
  if (decision.mode === "resume-session") {
    return "continue --same-session";
  }
  return "start";
}

export function orchestrateDecision(decision) {
  return {
    sessionStrategy: decision.mode,
    handoffAction: handoffAction(decision),
    nativeThreadAction: nativeThreadAction(decision),
    chatActionEquivalent: chatActionEquivalent(decision),
    wrapperCommandEquivalent: wrapperCommandEquivalent(decision)
  };
}

export function rawTaskOrchestration() {
  return {
    sessionStrategy: "fresh-session",
    handoffAction: "launch-task",
    nativeThreadAction: null,
    chatActionEquivalent: null,
    wrapperCommandEquivalent: "run"
  };
}
