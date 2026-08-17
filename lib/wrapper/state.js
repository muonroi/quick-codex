import fs from "node:fs";
import path from "node:path";

import { writeFileAtomic } from "./atomic-fs.js";

const STATE_DIRNAME = ".quick-codex-flow";
const STATE_FILENAME = "wrapper-state.json";

function statePath(dir, context = null) {
  return context?.wrapperStatePath ?? path.join(dir, STATE_DIRNAME, STATE_FILENAME);
}

export function loadWrapperState(dir, context = null) {
  const filePath = statePath(dir, context);
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      version: 1,
      runs: {}
    };
  }
  return {
    path: filePath,
    ...JSON.parse(fs.readFileSync(filePath, "utf8"))
  };
}

export function saveWrapperState(dir, state, { artifact, decision, execution, context = null }) {
  const filePath = state.path ?? statePath(dir, context);
  const previous = state.runs[artifact.relativeRunPath] ?? {};
  const modelRoute = decision.modelRoute
    ? {
        taskHash: decision.modelRoute.taskHash ?? null,
        tier: decision.modelRoute.tier ?? null,
        model: decision.modelRoute.model ?? null,
        reasoningEffort: decision.modelRoute.reasoningEffort ?? null,
        source: decision.modelRoute.source ?? null,
        reason: decision.modelRoute.reason ?? null,
        confidence: decision.modelRoute.confidence ?? null,
        requestedTask: decision.modelRoute.requestedTask ?? null,
        feedback: execution.routeFeedback ?? null
      }
    : previous.lastModelRoute ?? null;
  const nextState = {
    version: 1,
    runs: {
      ...state.runs,
      [artifact.relativeRunPath]: {
        lastMode: decision.mode,
        lastPermissionProfile: decision.policy?.permissionProfile ?? previous.lastPermissionProfile ?? null,
        lastApprovalPolicy: decision.policy?.approvalPolicy ?? previous.lastApprovalPolicy ?? null,
        lastSandboxMode: decision.policy?.sandboxMode ?? previous.lastSandboxMode ?? null,
        lastBypassApprovalsAndSandbox: decision.policy?.bypassApprovalsAndSandbox ?? previous.lastBypassApprovalsAndSandbox ?? false,
        lastExecSessionId: execution.sessionId ?? previous.lastExecSessionId ?? null,
        lastNativeThreadId: execution.threadId ?? previous.lastNativeThreadId ?? null,
        lastModel: decision.model ?? previous.lastModel ?? null,
        lastReasoningEffort: decision.reasoningEffort ?? previous.lastReasoningEffort ?? null,
        lastModelRoute: modelRoute,
        lastPrompt: decision.prompt,
        updatedAt: new Date().toISOString()
      }
    }
  };
  writeFileAtomic(filePath, `${JSON.stringify(nextState, null, 2)}\n`);
  return { ...nextState, path: filePath };
}
