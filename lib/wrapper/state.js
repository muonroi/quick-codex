import fs from "node:fs";
import path from "node:path";

const STATE_DIRNAME = ".quick-codex-flow";
const STATE_FILENAME = "wrapper-state.json";

function statePath(dir) {
  return path.join(dir, STATE_DIRNAME, STATE_FILENAME);
}

export function loadWrapperState(dir) {
  const filePath = statePath(dir);
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

export function saveWrapperState(dir, state, { artifact, decision, execution }) {
  const filePath = state.path ?? statePath(dir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
  fs.writeFileSync(filePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  return { ...nextState, path: filePath };
}
