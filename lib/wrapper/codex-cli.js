import fs from "node:fs";
import { spawn } from "node:child_process";

import { runCodexAppServerCommand } from "./app-server-client.js";

function candidateSessionIdFromObject(value, parentKey = "") {
  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    if (!parentKey || /(session|conversation|thread)/i.test(parentKey)) {
      return value;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = candidateSessionIdFromObject(item, parentKey);
      if (match) {
        return match;
      }
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    const match = candidateSessionIdFromObject(nested, key);
    if (match) {
      return match;
    }
  }
  return null;
}

function extractSessionId(stdout) {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      const match = candidateSessionIdFromObject(parsed);
      if (match) {
        return match;
      }
    } catch {
      // Ignore non-JSON lines in mixed stdout.
    }
  }
  return null;
}

function resolveCodexBin() {
  return process.env.QUICK_CODEX_WRAP_CODEX_BIN || "codex";
}

function baseArgs(dir) {
  return ["--skip-git-repo-check", "--cd", dir, "--json"];
}

function shouldUseAppServer(decision) {
  if (decision.nativeThreadAction === "thread/start") {
    return true;
  }
  if (decision.nativeThreadAction === "thread/compact/start" && decision.resumableThreadId) {
    return true;
  }
  if (decision.nativeThreadAction === "thread/resume" && decision.resumableThreadId) {
    return true;
  }
  return false;
}

async function runCodexExecCommand({ dir, decision, dryRun = false, outputLastMessage = null, preferredMode = null, onProgress = null }) {
  const codexBin = resolveCodexBin();
  const mode = preferredMode ?? decision.mode;
  const command = [codexBin, "exec"];

  if (mode === "resume-session" && decision.resumableSessionId) {
    command.push("resume", decision.resumableSessionId);
  }

  if (decision.policy?.bypassApprovalsAndSandbox) {
    command.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (decision.policy) {
    command.push("-c", `approval_policy="${decision.policy.approvalPolicy}"`);
    command.push("--sandbox", decision.policy.sandboxMode);
  }

  if (decision.model) {
    command.push("-m", decision.model);
  }
  if (decision.reasoningEffort) {
    command.push("-c", `model_reasoning_effort="${decision.reasoningEffort}"`);
  }
  command.push(...baseArgs(dir));
  if (outputLastMessage) {
    command.push("--output-last-message", outputLastMessage);
  }
  command.push(decision.prompt);

  if (dryRun) {
    return {
      dryRun: true,
      adapter: "exec",
      command,
      model: decision.model ?? null,
      reasoningEffort: decision.reasoningEffort ?? null,
      permissionProfile: decision.policy?.permissionProfile ?? null,
      approvalPolicy: decision.policy?.approvalPolicy ?? null,
      sandboxMode: decision.policy?.sandboxMode ?? null,
      bypassApprovalsAndSandbox: decision.policy?.bypassApprovalsAndSandbox ?? false,
      sessionId: decision.resumableSessionId ?? null,
      threadId: null,
      stdout: "",
      stderr: "",
      status: 0
    };
  }

  const child = spawn(command[0], command.slice(1), {
    cwd: dir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const startedAt = Date.now();
  const ticker = onProgress ? setInterval(() => {
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    onProgress(`waiting exec... ${elapsedSeconds}s elapsed`);
  }, 1200) : null;
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  if (ticker) {
    clearInterval(ticker);
  }

  let lastMessage = null;
  if (outputLastMessage && fs.existsSync(outputLastMessage)) {
    lastMessage = fs.readFileSync(outputLastMessage, "utf8").trimEnd() || null;
  }

  return {
    dryRun: false,
    adapter: "exec",
    command,
    model: decision.model ?? null,
    reasoningEffort: decision.reasoningEffort ?? null,
    permissionProfile: decision.policy?.permissionProfile ?? null,
    approvalPolicy: decision.policy?.approvalPolicy ?? null,
    sandboxMode: decision.policy?.sandboxMode ?? null,
    bypassApprovalsAndSandbox: decision.policy?.bypassApprovalsAndSandbox ?? false,
    lastMessage,
    sessionId: process.env.QUICK_CODEX_WRAP_FAKE_SESSION_ID || extractSessionId(stdout),
    threadId: null,
    stdout,
    stderr,
    status: result.code ?? 1
  };
}

export async function runCodexCommand({
  dir,
  decision,
  dryRun = false,
  outputLastMessage = null,
  preferredMode = null,
  appServerSession = null,
  onProgress = null
}) {
  if (shouldUseAppServer(decision)) {
    return runCodexAppServerCommand({
      dir,
      decision,
      policy: decision.policy,
      dryRun,
      outputLastMessage,
      session: appServerSession
    });
  }

  return runCodexExecCommand({
    dir,
    decision,
    dryRun,
    outputLastMessage,
    preferredMode,
    onProgress
  });
}
