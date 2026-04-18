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

  if (flowState?.status === "done" || artifact.currentGate === "done") {
    return {
      shouldStop: true,
      stopReason: "completed",
      checkpointAdvanced: progressed
    };
  }

  if ((artifact.blockers ?? []).length > 0) {
    return {
      shouldStop: true,
      stopReason: "blocker",
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

  if (asksUser(decision.prompt) || asksUser(artifact.recommendedNextCommand)) {
    return {
      shouldStop: true,
      stopReason: "ask-user",
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

  return {
    flowState,
    artifact,
    decision: decideWrapperAction({ artifact, state, sameSession: true, preferBoundaryAction: true })
  };
}
