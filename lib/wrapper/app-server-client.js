import fs from "node:fs";
import { spawn } from "node:child_process";
import readline from "node:readline";

function resolveCodexBin() {
  return process.env.QUICK_CODEX_WRAP_CODEX_BIN || "codex";
}

function buildPolicyCliArgs(policy = null) {
  if (!policy) {
    return [];
  }
  if (policy.bypassApprovalsAndSandbox) {
    return ["--dangerously-bypass-approvals-and-sandbox"];
  }
  return [
    "-c", `approval_policy="${policy.approvalPolicy}"`,
    "-c", `sandbox_mode="${policy.sandboxMode}"`
  ];
}

function resolveAppServerInvocation(model = null, policy = null, reasoningEffort = null) {
  const override = process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN;
  const policyArgs = buildPolicyCliArgs(policy);
  const modelArgs = model ? ["-m", model] : [];
  const reasoningArgs = reasoningEffort ? ["-c", `model_reasoning_effort="${reasoningEffort}"`] : [];
  if (override) {
    return {
      command: override,
      args: [...policyArgs, ...modelArgs, ...reasoningArgs]
    };
  }

  return {
    command: resolveCodexBin(),
    args: [...policyArgs, ...modelArgs, ...reasoningArgs, "app-server", "--listen", "stdio://"]
  };
}

function buildInitializeParams() {
  return {
    clientInfo: {
      name: "quick-codex-wrap",
      version: "0.1.0"
    },
    capabilities: {
      experimentalApi: true
    }
  };
}

function buildThreadStartParams({ dir, clear, policy }) {
  return {
    approvalPolicy: policy.approvalPolicy,
    cwd: dir,
    personality: "pragmatic",
    sandbox: policy.sandboxMode,
    sessionStartSource: clear ? "clear" : "startup"
  };
}

function buildThreadResumeParams({ dir, threadId, policy }) {
  return {
    approvalPolicy: policy.approvalPolicy,
    cwd: dir,
    personality: "pragmatic",
    sandbox: policy.sandboxMode,
    threadId
  };
}

function buildThreadCompactStartParams({ threadId }) {
  return { threadId };
}

function buildTurnStartParams({ dir, prompt, threadId }) {
  return {
    cwd: dir,
    threadId,
    input: [{
      type: "text",
      text: prompt,
      text_elements: []
    }]
  };
}

function maybeFinalAgentMessage(item) {
  if (!item || item.type !== "agentMessage" || typeof item.text !== "string") {
    return null;
  }
  if (item.phase === "final_answer") {
    return item.text;
  }
  return null;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function policySignature(policy = null) {
  if (!policy) {
    return "default";
  }
  return JSON.stringify({
    permissionProfile: policy.permissionProfile ?? null,
    approvalPolicy: policy.approvalPolicy ?? null,
    sandboxMode: policy.sandboxMode ?? null,
    bypassApprovalsAndSandbox: policy.bypassApprovalsAndSandbox ?? false
  });
}

function waitForClose(child) {
  return new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export class CodexAppServerSession {
  constructor({ dir, invocation = resolveAppServerInvocation(), policy = null } = {}) {
    this.dir = dir;
    this.invocation = invocation;
    this.policy = policy;
    this.child = null;
    this.rl = null;
    this.closePromise = null;
    this.pending = new Map();
    this.notifications = [];
    this.stderr = "";
    this.requestId = 0;
    this.initialized = false;
    this.closed = false;
    this.activeThreadId = null;
    this.activeTurnId = null;
    this.currentOperation = null;
    this.currentModel = null;
    this.currentReasoningEffort = null;
    this.currentPolicySignature = null;
  }

  resetRuntimeState() {
    this.child = null;
    this.rl = null;
    this.closePromise = null;
    this.pending = new Map();
    this.notifications = [];
    this.stderr = "";
    this.requestId = 0;
    this.initialized = false;
    this.closed = false;
    this.activeThreadId = null;
    this.activeTurnId = null;
    this.currentOperation = null;
    this.currentPolicySignature = null;
  }

  ensureOperation(label) {
    if (this.currentOperation) {
      throw new Error(`App server already has an active operation: ${this.currentOperation.label}`);
    }
    const operation = {
      label,
      phase: "booting",
      turnCompleted: createDeferred(),
      compactionCompleted: createDeferred(),
      finalMessage: null,
      lastAgentMessage: null,
      activeTurnId: null,
      compactionTurnId: null
    };
    this.currentOperation = operation;
    return operation;
  }

  clearOperation(operation) {
    if (this.currentOperation === operation) {
      this.currentOperation = null;
    }
  }

  failPending(error) {
    for (const deferred of this.pending.values()) {
      deferred.reject(error);
    }
    this.pending.clear();
    if (this.currentOperation) {
      this.currentOperation.turnCompleted.reject(error);
      this.currentOperation.compactionCompleted.reject(error);
      this.currentOperation = null;
    }
  }

  send(method, params = null) {
    if (!this.child || this.closed) {
      throw new Error("App server session is not active.");
    }
    this.requestId += 1;
    const id = `quick-codex-wrap-${this.requestId}`;
    const deferred = createDeferred();
    this.pending.set(id, deferred);
    this.child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    })}\n`, "utf8");
    return deferred.promise;
  }

  notify(method, params = null) {
    if (!this.child || this.closed) {
      throw new Error("App server session is not active.");
    }
    this.child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method,
      params
    })}\n`, "utf8");
  }

  handleMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const deferred = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        deferred.reject(new Error(message.error.message ?? `App server request failed for ${message.id}`));
        return;
      }
      deferred.resolve(message.result ?? null);
      return;
    }

    if (message.method === "thread/started") {
      this.activeThreadId = message.params?.thread?.id ?? this.activeThreadId;
      return;
    }

    const operation = this.currentOperation;
    if (!operation) {
      return;
    }

    if (operation.phase === "compacting" && message.method === "thread/compacted") {
      operation.compactionCompleted.resolve(message.params ?? null);
      return;
    }

    if (operation.phase === "compacting" && message.method === "turn/started") {
      operation.compactionTurnId = message.params?.turn?.id ?? operation.compactionTurnId;
    }

    if (message.method === "item/completed") {
      const item = message.params?.item ?? null;
      const maybeFinal = maybeFinalAgentMessage(item);
      if (item?.type === "agentMessage" && typeof item.text === "string") {
        operation.lastAgentMessage = item.text;
      }
      if (maybeFinal) {
        operation.finalMessage = maybeFinal;
      }
      return;
    }

    if (message.method === "turn/completed") {
      this.activeThreadId = message.params?.threadId ?? this.activeThreadId;
      this.activeTurnId = message.params?.turn?.id ?? this.activeTurnId;
      operation.activeTurnId = message.params?.turn?.id ?? operation.activeTurnId;
      if (message.params?.turn?.status === "failed") {
        const error = new Error(message.params?.turn?.error?.message ?? "App server turn failed");
        if (operation.phase === "compacting") {
          operation.compactionCompleted.reject(error);
          return;
        }
        operation.turnCompleted.reject(error);
        return;
      }
      if (operation.phase === "compacting") {
        if (!operation.compactionTurnId || operation.compactionTurnId === message.params?.turn?.id) {
          operation.compactionCompleted.resolve(message.params ?? null);
        }
        return;
      }
      operation.turnCompleted.resolve(message.params ?? null);
    }
  }

  async start(model = null, policy = this.policy, reasoningEffort = null) {
    const nextPolicySignature = policySignature(policy);
    if (this.initialized && this.currentModel === (model ?? null) && this.currentReasoningEffort === (reasoningEffort ?? null) && this.currentPolicySignature === nextPolicySignature) {
      return;
    }
    if (this.initialized && (this.currentModel !== (model ?? null) || this.currentReasoningEffort !== (reasoningEffort ?? null) || this.currentPolicySignature !== nextPolicySignature)) {
      await this.close();
      this.resetRuntimeState();
    }

    this.policy = policy;
    this.invocation = resolveAppServerInvocation(model ?? null, policy, reasoningEffort ?? null);
    this.currentModel = model ?? null;
    this.currentReasoningEffort = reasoningEffort ?? null;
    this.currentPolicySignature = nextPolicySignature;

    this.child = spawn(this.invocation.command, this.invocation.args, {
      cwd: this.dir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.closePromise = waitForClose(this.child);

    this.rl = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity
    });

    this.rl.on("line", (line) => {
      if (!line.trim()) {
        return;
      }

      this.notifications.push(line);

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      this.handleMessage(message);
    });

    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });

    this.child.once("error", (error) => {
      this.failPending(error);
    });

    this.child.once("close", (code, signal) => {
      this.closed = true;
      if (this.pending.size > 0 || this.currentOperation) {
        this.failPending(new Error(`App server exited before completing the protocol (code=${code ?? "null"}, signal=${signal ?? "null"})`));
      }
    });

    await this.send("initialize", buildInitializeParams());
    this.notify("initialized");
    this.initialized = true;
  }

  async ensureThread({ dir, nativeAction, threadId, policy }) {
    if (nativeAction === "thread/resume") {
      if (!threadId) {
        throw new Error("Native thread resume requires a saved thread id.");
      }
      if (this.activeThreadId !== threadId) {
        const response = await this.send("thread/resume", buildThreadResumeParams({ dir, threadId, policy }));
        this.activeThreadId = response?.thread?.id ?? this.activeThreadId ?? threadId;
      }
      return;
    }

    if (nativeAction === "thread/compact/start") {
      if (!threadId) {
        throw new Error("Native thread compaction requires a saved thread id.");
      }
      if (this.activeThreadId !== threadId) {
        const response = await this.send("thread/resume", buildThreadResumeParams({ dir, threadId, policy }));
        this.activeThreadId = response?.thread?.id ?? this.activeThreadId ?? threadId;
      }
      return;
    }

    const response = await this.send("thread/start", buildThreadStartParams({
      dir,
      clear: nativeAction === "thread/start",
      policy
    }));
    this.activeThreadId = response?.thread?.id ?? this.activeThreadId;
  }

  async runDecision({ dir, decision, policy, outputLastMessage = null }) {
    await this.start(decision.model ?? null, policy, decision.reasoningEffort ?? null);

    const nativeAction = decision.nativeThreadAction;
    const operation = this.ensureOperation(nativeAction ?? "turn/start");
    const notificationStart = this.notifications.length;
    const stderrStart = this.stderr.length;
    const targetThreadId = decision.resumableThreadId ?? this.activeThreadId ?? null;

    try {
      await this.ensureThread({ dir, nativeAction, threadId: targetThreadId, policy });

      if ((nativeAction === "thread/resume" || nativeAction === "thread/compact/start") && !this.activeThreadId) {
        throw new Error("App server did not expose an active thread id for the requested native action.");
      }

      if (nativeAction === "thread/compact/start") {
        operation.phase = "compacting";
        await this.send("thread/compact/start", buildThreadCompactStartParams({ threadId: this.activeThreadId }));
        await operation.compactionCompleted.promise;
      }

      operation.phase = "turn";
      const turnResponse = await this.send("turn/start", buildTurnStartParams({
        dir,
        prompt: decision.prompt,
        threadId: this.activeThreadId
      }));
      operation.activeTurnId = turnResponse?.turn?.id ?? operation.activeTurnId;

      await operation.turnCompleted.promise;

      const messageText = operation.finalMessage ?? operation.lastAgentMessage ?? "";
      if (outputLastMessage) {
        fs.writeFileSync(outputLastMessage, `${messageText}\n`, "utf8");
      }

      return {
        dryRun: false,
        adapter: "app-server",
        command: [this.invocation.command, ...this.invocation.args],
        model: decision.model ?? null,
        reasoningEffort: decision.reasoningEffort ?? null,
        lastMessage: messageText,
        permissionProfile: policy.permissionProfile,
        approvalPolicy: policy.approvalPolicy,
        sandboxMode: policy.sandboxMode,
        bypassApprovalsAndSandbox: policy.bypassApprovalsAndSandbox,
        nativeThreadAction: nativeAction,
        threadId: this.activeThreadId,
        turnId: operation.activeTurnId ?? this.activeTurnId ?? null,
        sessionId: null,
        stdout: this.notifications.slice(notificationStart).join("\n"),
        stderr: this.stderr.slice(stderrStart),
        status: 0
      };
    } finally {
      this.clearOperation(operation);
    }
  }

  async close() {
    if (!this.child || this.closed) {
      return;
    }
    this.rl?.close();
    this.child.kill("SIGTERM");
    await this.closePromise;
  }
}

export async function runCodexAppServerCommand({
  dir,
  decision,
  policy,
  dryRun = false,
  outputLastMessage = null,
  session = null
}) {
  const invocation = resolveAppServerInvocation(decision.model ?? null, policy, decision.reasoningEffort ?? null);
  const nativeAction = decision.nativeThreadAction;
  const threadId = decision.resumableThreadId ?? null;
  const command = [invocation.command, ...invocation.args];

  if (dryRun) {
    return {
      dryRun: true,
      adapter: "app-server",
      command,
      model: decision.model ?? null,
      reasoningEffort: decision.reasoningEffort ?? null,
      permissionProfile: policy.permissionProfile,
      approvalPolicy: policy.approvalPolicy,
      sandboxMode: policy.sandboxMode,
      bypassApprovalsAndSandbox: policy.bypassApprovalsAndSandbox,
      nativeThreadAction: nativeAction,
      threadId,
      turnId: null,
      sessionId: null,
      stdout: "",
      stderr: "",
      status: 0
    };
  }

  if (session) {
    return session.runDecision({
      dir,
      decision,
      policy,
      outputLastMessage
    });
  }

  const singleShotSession = new CodexAppServerSession({ dir, invocation, policy });
  try {
    return await singleShotSession.runDecision({
      dir,
      decision,
      policy,
      outputLastMessage
    });
  } finally {
    await singleShotSession.close();
  }
}
