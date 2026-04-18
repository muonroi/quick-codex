import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import net from "node:net";
import readline from "node:readline";
import { spawn as spawnPty } from "node-pty";

function resolveCodexBin() {
  return process.env.QUICK_CODEX_REAL_CODEX_BIN
    || process.env.QUICK_CODEX_WRAP_CODEX_BIN
    || "codex";
}

function resolveNativeSubmitSequence(mode) {
  const override = process.env.QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ;
  if (override != null) {
    return override;
  }
  if (mode === "pty") {
    return "\u001b[13u";
  }
  return "\n";
}

function resolveNativePtySubmitDelayMs(text) {
  const normalized = String(text ?? "").trim();
  if (!normalized || normalized.startsWith("/")) {
    return 0;
  }
  const override = process.env.QUICK_CODEX_WRAP_NATIVE_PTY_SUBMIT_DELAY_MS;
  if (override != null) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 120;
}

function buildPolicyCliArgs(policy = null) {
  if (!policy) {
    return [];
  }
  if (policy.bypassApprovalsAndSandbox) {
    return ["--dangerously-bypass-approvals-and-sandbox"];
  }
  return [
    "-a", policy.approvalPolicy,
    "--sandbox", policy.sandboxMode
  ];
}

function buildConfigArgs({ model = null, reasoningEffort = null } = {}) {
  const args = [];
  if (model) {
    args.push("-m", model);
  }
  if (reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
  }
  return args;
}

function resolveAppServerInvocation({ remoteUrl, policy = null, model = null, reasoningEffort = null }) {
  const override = process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN;
  const policyArgs = policy?.bypassApprovalsAndSandbox
    ? ["--dangerously-bypass-approvals-and-sandbox"]
    : policy
      ? ["-c", `approval_policy="${policy.approvalPolicy}"`, "-c", `sandbox_mode="${policy.sandboxMode}"`]
      : [];
  const configArgs = buildConfigArgs({ model, reasoningEffort });
  if (override) {
    return {
      command: override,
      args: [...policyArgs, ...configArgs, "--listen", remoteUrl]
    };
  }
  return {
    command: resolveCodexBin(),
    args: [...policyArgs, ...configArgs, "app-server", "--listen", remoteUrl]
  };
}

function buildNativeCodexCommand({ dir, remoteUrl, policy = null, model = null, reasoningEffort = null, prompt = null }) {
  const args = [
    ...buildPolicyCliArgs(policy),
    ...buildConfigArgs({ model, reasoningEffort }),
    "--remote", remoteUrl,
    "--no-alt-screen",
    "-C", dir
  ];
  if (prompt) {
    args.push(prompt);
  }
  return [resolveCodexBin(), ...args];
}

function waitForClose(child) {
  return new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

function waitForPtyClose(child) {
  return new Promise((resolve) => {
    child.onExit(({ exitCode, signal }) => resolve({ code: exitCode, signal }));
  });
}

function onceError(child) {
  return new Promise((_, reject) => {
    child.once("error", reject);
  });
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function terminateQuietly(child) {
  if (!child || child.exitCode != null || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    waitForClose(child),
    new Promise((resolve) => setTimeout(resolve, 1200))
  ]);
  if (child.exitCode == null && !child.killed) {
    child.kill("SIGKILL");
  }
}

function stripAnsi(text) {
  return String(text ?? "")
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\u009b[0-?]*[ -/]*[@-~]/g, "");
}

function collapseForMatch(text) {
  return String(text ?? "").toLowerCase().replace(/\s+/g, "");
}

function collapseForModal(text) {
  // Codex TUI often loses whitespace/newlines when ANSI cursor moves are stripped.
  // Also remove punctuation to keep modal detection resilient (e.g. "you'd" vs "youd").
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveBootModalKind(collapsedRecentText) {
  const haystack = String(collapsedRecentText ?? "");
  if (!haystack) {
    return null;
  }
  // Codex first-run upgrade prompt.
  if ((haystack.includes("introducinggpt54") || (haystack.includes("introducing") && haystack.includes("gpt54")))
    && haystack.includes("choosehowyoudlikecodextoproceed")
    && haystack.includes("trynewmodel")) {
    return "boot-model-upgrade";
  }
  // Reasoning level chooser for a selected model.
  if (haystack.includes("selectreasoninglevelfor")
    && haystack.includes("pressentertoconfirmoresctogoback")
    && (haystack.includes("mediumdefault") || haystack.includes("greaterreasoningdepth") || haystack.includes("low"))) {
    return "boot-reasoning-level";
  }
  return null;
}

function detectPromptReady(normalizedText) {
  const normalized = String(normalizedText ?? "");
  if (!normalized) {
    return false;
  }
  const tail = normalized.slice(-260);
  // Most stable marker across Codex TUI variants.
  if (/(^|\s)codex>\s*/i.test(normalized) || /(^|\s)codex>\s*/i.test(tail)) {
    return true;
  }
  // Fallback for prompt markers that appear at the end (avoid matching menu rows like "› 1. ...").
  if (/(^|\s)(?:›|>)\s*$/.test(tail)) {
    return true;
  }
  // Prompt marker followed by an input start (slash command or user message).
  if (/(^|\s)(?:›|>)\s*(?:\/|\w)/.test(tail)) {
    return true;
  }
  return false;
}

function extractSessionId(text) {
  const match = String(text ?? "").match(/codex resume ([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

const GUARDED_SLASH_SPECS = new Map([
  ["/status", {
    kind: "proof",
    timeoutMs: 4000
  }],
  ["/compact", {
    kind: "continuity",
    timeoutMs: 8000
  }],
  ["/clear", {
    kind: "continuity",
    timeoutMs: 8000
  }],
  ["/resume", {
    kind: "continuity",
    timeoutMs: 12000
  }]
]);

function resolveGuardedSlashSpec(command) {
  const normalized = String(command ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const commandKey = normalized.startsWith("/resume ")
    ? "/resume"
    : normalized;
  if (normalized === "/resume") {
    throw new Error("Guarded native /resume requires a session id, saved-session name, or --last.");
  }
  const spec = GUARDED_SLASH_SPECS.get(commandKey);
  if (!spec) {
    throw new Error(`Unsupported guarded native slash command: ${normalized}`);
  }
  return {
    commandKey,
    command: normalized,
    ...spec
  };
}

function collapseSlashCommand(command) {
  return collapseForMatch(String(command ?? "").replace(/\s+/g, ""));
}

function extractPromptContent(text) {
  const match = stripAnsi(text ?? "").replace(/\r/g, "\n").match(/(?:^|[\n ])(?:›|>)\s*(.+)$/s);
  return match ? match[1] : String(text ?? "");
}

function hasSlashResidue(text, command) {
  const collapsedText = collapseForMatch(extractPromptContent(text));
  const collapsedCommand = collapseSlashCommand(command);
  if (!collapsedText || !collapsedCommand) {
    return false;
  }
  const variants = new Set([
    collapsedCommand,
    collapsedCommand.replace(/^\//, "")
  ]);
  if (/^\/resume(?:\s|$)/.test(String(command ?? "").trim().toLowerCase()) && collapsedCommand.length > 6) {
    variants.add(collapsedCommand.slice(2));
    variants.add(collapsedCommand.replace(/^\//, "").slice(2));
  }
  return [...variants].some((variant) => variant && collapsedText.startsWith(variant));
}

function isSlashEchoPrompt(event, command) {
  if (!event || event.type !== "prompt-ready") {
    return false;
  }
  return hasSlashResidue(event.text ?? "", command);
}

function needsPostTurnSettlePrompt(spec, event) {
  if (!event || event.type !== "turn-settled") {
    return false;
  }
  if (spec.commandKey !== "/resume") {
    return false;
  }
  // /resume often prints a "codex resume <id>" line before the TUI restores a clean prompt.
  // Always require a follow-up prompt-ready event so guarded resume cannot settle early.
  return true;
}

function isTaskEchoPrompt(event, task) {
  if (!event || event.type !== "prompt-ready") {
    return false;
  }
  const promptContent = extractPromptContent(event.text ?? "");
  return collapseForMatch(promptContent).startsWith(collapseForMatch(task));
}

export async function sendNativeTaskWithRetry({
  controller,
  observer,
  task,
  timeoutMs = 20000,
  maxSubmitRetries = 3,
  onProgress = null
}) {
  if (!controller?.isControllable?.()) {
    throw new Error("Native task submission requires a controllable native session.");
  }
  const normalizedTask = String(task ?? "").trim();
  if (!normalizedTask) {
    throw new Error("Native task submission requires a non-empty task.");
  }

  onProgress?.(`native-task=await-ready | retries=${maxSubmitRetries}`);
  await waitForPromptReady(observer, timeoutMs, {
    controller,
    onProgress
  });

  controller.sendText(normalizedTask);
  const injected = observer.record("task-injected", {
    text: normalizedTask
  });
  onProgress?.("native-task=sent");

  let minEventIndex = injected.index;
  let submitRetries = 0;

  while (true) {
    const candidate = await waitForObserverEvent(
      observer,
      (event) => event.index > minEventIndex
        && (event.type === "native-busy" || event.type === "prompt-ready"),
      timeoutMs,
      "Timed out waiting for native task submission to start."
    );

    if (candidate.type === "native-busy") {
      observer.record("task-started", {
        retries: submitRetries,
        text: candidate.text ?? null
      });
      onProgress?.(`native-task=started | retries=${submitRetries}`);
      return {
        retries: submitRetries,
        startedBy: "native-busy",
        startedText: candidate.text ?? null
      };
    }

    if (candidate.type === "prompt-ready" && isTaskEchoPrompt(candidate, normalizedTask)) {
      if (submitRetries >= maxSubmitRetries) {
        throw new Error(`Native task remained in the composer after ${submitRetries} retries.`);
      }
      submitRetries += 1;
      minEventIndex = candidate.index;
      observer.record("task-submit-retry", {
        retries: submitRetries,
        text: candidate.text ?? normalizedTask
      });
      onProgress?.(`native-task=retry-submit | retry=${submitRetries}`);

      await new Promise((resolve) => setTimeout(resolve, 120 * submitRetries));
      controller.submit();
      continue;
    }

    minEventIndex = candidate.index;
  }
}

export class NativeSessionObserver extends EventEmitter {
  constructor() {
    super();
    this.events = [];
    this.snapshot = {
      bridgeState: "idle",
      codexState: "idle",
      busy: false,
      promptReady: false,
      turnSettled: false,
      sessionId: null,
      lastText: "",
      recentText: "",
      modalChoiceArmed: false,
      lastEvent: null
    };
  }

  record(type, payload = {}) {
    const event = {
      index: this.events.length,
      type,
      at: Date.now(),
      ...payload
    };
    this.events.push(event);
    this.snapshot.lastEvent = type;
    if (payload.text) {
      this.snapshot.lastText = payload.text;
    }
    this.emit(type, event);
    this.emit("event", event);
    return event;
  }

  markBridgeState(state, extra = {}) {
    this.snapshot.bridgeState = state;
    return this.record(`bridge-${state}`, extra);
  }

  markCodexState(state, extra = {}) {
    this.snapshot.codexState = state;
    if (state === "running") {
      this.snapshot.busy = true;
      this.snapshot.promptReady = false;
      this.snapshot.turnSettled = false;
    }
    if (state === "ready") {
      this.snapshot.busy = false;
      this.snapshot.promptReady = true;
    }
    if (state === "settled") {
      this.snapshot.busy = false;
      this.snapshot.turnSettled = true;
    }
    return this.record(`codex-${state}`, extra);
  }

  ingestChunk(source, chunk) {
    const raw = String(chunk ?? "");
    const text = stripAnsi(raw).replace(/\r/g, "\n");
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return;
    }

    const indicatesBusy = /working|starting mcp|booting mcp|esc to interrupt/i.test(normalized);
    const collapsedRecentModalText = collapseForModal(`${this.snapshot.recentText} ${normalized}`.trim().slice(-800));
    const bootModalKind = resolveBootModalKind(collapsedRecentModalText);
    const indicatesPrompt = detectPromptReady(normalized);

    this.snapshot.lastText = normalized;
    this.snapshot.recentText = `${this.snapshot.recentText} ${normalized}`.trim().slice(-800);
    this.record("native-output", {
      source,
      text: normalized
    });

    if (indicatesBusy) {
      this.snapshot.busy = true;
      this.snapshot.promptReady = false;
      this.snapshot.turnSettled = false;
      this.record("native-busy", {
        source,
        text: normalized
      });
    }

    if (bootModalKind && !this.snapshot.modalChoiceArmed) {
      this.snapshot.modalChoiceArmed = true;
      this.record("automation-choice-required", {
        source,
        kind: bootModalKind,
        text: this.snapshot.recentText
      });
    }

    if (indicatesPrompt && !indicatesBusy && !bootModalKind) {
      this.snapshot.busy = false;
      this.snapshot.promptReady = true;
      this.record("prompt-ready", {
        source,
        text: normalized
      });
    }

    const modalVisible = collapsedRecentModalText.includes("approachingratelimits")
      && collapsedRecentModalText.includes("keepcurrentmodel")
      && collapsedRecentModalText.includes("pressentertoconfirmoresctogoback");
    if (modalVisible && !this.snapshot.modalChoiceArmed) {
      this.snapshot.modalChoiceArmed = true;
      this.record("automation-choice-required", {
        source,
        kind: "rate-limit-keep-current-model",
        text: this.snapshot.recentText
      });
    }
    if (!modalVisible && !bootModalKind) {
      this.snapshot.modalChoiceArmed = false;
    }

    const sessionId = extractSessionId(normalized);
    if (sessionId) {
      this.snapshot.sessionId = sessionId;
      this.snapshot.busy = false;
      this.snapshot.turnSettled = true;
      this.record("turn-settled", {
        source,
        text: normalized,
        sessionId
      });
    }
  }

  toJSON() {
    return {
      snapshot: { ...this.snapshot },
      events: [...this.events]
    };
  }
}

function waitForObserverEvent(observer, predicate, timeoutMs, errorMessage) {
  const existing = observer.events.find(predicate);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.off("event", handleEvent);
      reject(new Error(errorMessage));
    }, timeoutMs);

    const handleEvent = (event) => {
      if (!predicate(event)) {
        return;
      }
      clearTimeout(timer);
      observer.off("event", handleEvent);
      resolve(event);
    };

    observer.on("event", handleEvent);
  });
}

function waitForPromptReady(observer, timeoutMs = 4000, { controller = null, onProgress = null } = {}) {
  const settleDelayMs = 250;
  const lastBusyEvent = [...observer.events].reverse().find((event) => event.type === "native-busy");
  let minPromptIndex = lastBusyEvent ? lastBusyEvent.index : -1;
  let candidate = null;
  let settleTimer = null;
  let rateLimitChoiceHandled = false;
  let bootUpgradeChoiceHandled = false;
  let bootReasoningChoiceHandled = false;

  const isPromptStable = (event) => {
    if (!event || event.type !== "prompt-ready" || event.index <= minPromptIndex) {
      return false;
    }
    return !observer.events.some((entry) => entry.type === "native-busy" && entry.index > event.index);
  };

  const existing = [...observer.events].reverse().find(isPromptStable);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      observer.off("event", handleEvent);
    };

    const timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for native Codex prompt readiness."));
    }, timeoutMs);

    const armCandidate = (event) => {
      candidate = event;
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(() => {
        cleanup();
        resolve(candidate);
      }, settleDelayMs);
    };

    const handleEvent = (event) => {
      if (event.type === "native-busy") {
        minPromptIndex = event.index;
        candidate = null;
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        return;
      }
      if (event.type === "automation-choice-required"
        && event.kind === "rate-limit-keep-current-model"
        && controller?.isControllable()
        && !rateLimitChoiceHandled) {
        rateLimitChoiceHandled = true;
        candidate = null;
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        observer.record("automation-choice-sent", {
          kind: event.kind,
          text: controller.mode === "pipe" ? "2" : "down+enter"
        });
        onProgress?.("native-choice=keep-current-model");
        if (controller.mode === "pipe") {
          // Test harnesses and non-TTY streams can still accept numeric selection.
          controller.sendText("2", { submit: false });
        } else {
          // Default selection is option 1 -> move to option 2 ("Keep current model") and confirm.
          controller.sendRaw("\u001b[B");
          controller.submit();
        }
        return;
      }
      if (event.type === "automation-choice-required"
        && event.kind === "boot-model-upgrade"
        && controller?.isControllable()
        && !bootUpgradeChoiceHandled) {
        bootUpgradeChoiceHandled = true;
        candidate = null;
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        const choice = String(process.env.QUICK_CODEX_WRAP_NATIVE_UPGRADE_CHOICE || "new").toLowerCase();
        observer.record("automation-choice-sent", {
          kind: event.kind,
          text: choice
        });
        onProgress?.(`native-choice=model-upgrade:${choice}`);
        if (choice === "existing") {
          // Menu default is "Try new model" -> move down once then confirm.
          controller.sendRaw("\u001b[B");
        }
        controller.submit();
        return;
      }
      if (event.type === "automation-choice-required"
        && event.kind === "boot-reasoning-level"
        && controller?.isControllable()
        && !bootReasoningChoiceHandled) {
        bootReasoningChoiceHandled = true;
        candidate = null;
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        const choice = String(process.env.QUICK_CODEX_WRAP_NATIVE_REASONING_CHOICE || "default").toLowerCase();
        observer.record("automation-choice-sent", {
          kind: event.kind,
          text: choice
        });
        onProgress?.(`native-choice=reasoning:${choice}`);
        // Current implementation: accept highlighted option.
        controller.submit();
        return;
      }
      if (event.type === "prompt-ready" && event.index > minPromptIndex) {
        armCandidate(event);
      }
    };

    observer.on("event", handleEvent);
  });
}

async function injectGuardedSlashCommand({
  controller,
  observer,
  command,
  timeoutMs = null,
  onProgress = null
}) {
  const spec = resolveGuardedSlashSpec(command);
  if (!spec) {
    return null;
  }
  if (!controller.isControllable()) {
    throw new Error("Guarded slash injection requires a controllable native session.");
  }
  const effectiveTimeoutMs = timeoutMs ?? spec.timeoutMs;

  onProgress?.(`native-slash=await-ready | command=${spec.command} | kind=${spec.kind}`);
  await waitForPromptReady(observer, effectiveTimeoutMs, {
    controller,
    onProgress
  });
  controller.sendSlashCommand(spec.command);
  const injected = observer.record("slash-injected", {
    command: spec.command,
    kind: spec.kind,
    text: spec.command
  });
  onProgress?.(`native-slash=sent | command=${spec.command} | kind=${spec.kind}`);
  let settled = null;
  let minEventIndex = injected.index;
  let submitRetries = 0;
  let rateLimitChoiceHandled = false;

  while (!settled) {
    const candidate = await waitForObserverEvent(
      observer,
      (event) => event.index > minEventIndex
        && (event.type === "prompt-ready" || event.type === "turn-settled" || event.type === "automation-choice-required"),
      effectiveTimeoutMs,
      `Timed out waiting for guarded slash ${spec.command} to settle.`
    );
    if (candidate.type === "automation-choice-required"
      && candidate.kind === "rate-limit-keep-current-model"
      && controller?.isControllable()
      && !rateLimitChoiceHandled) {
      rateLimitChoiceHandled = true;
      minEventIndex = candidate.index;
      observer.record("automation-choice-sent", {
        kind: candidate.kind,
        text: controller.mode === "pipe" ? "2" : "down+enter"
      });
      onProgress?.("native-choice=keep-current-model");
      if (controller.mode === "pipe") {
        controller.sendText("2", { submit: false });
      } else {
        controller.sendRaw("\u001b[B");
        controller.submit();
      }
      continue;
    }
    if (needsPostTurnSettlePrompt(spec, candidate)) {
      minEventIndex = candidate.index;
      observer.record("slash-await-followup-prompt", {
        command: spec.command,
        kind: spec.kind,
        text: candidate.text ?? spec.command
      });
      onProgress?.(`native-slash=await-followup-prompt | command=${spec.command} | kind=${spec.kind}`);
      continue;
    }
    if (isSlashEchoPrompt(candidate, spec.command)) {
      if (submitRetries >= 1) {
        throw new Error(`Guarded slash ${spec.command} remained in the composer after a retry.`);
      }
      submitRetries += 1;
      minEventIndex = candidate.index;
      observer.record("slash-submit-retry", {
        command: spec.command,
        kind: spec.kind,
        retry: submitRetries,
        text: candidate.text ?? spec.command
      });
      onProgress?.(`native-slash=retry-submit | command=${spec.command} | kind=${spec.kind} | retry=${submitRetries}`);
      controller.submit();
      continue;
    }
    settled = candidate;
  }
  observer.record("slash-settled", {
    command: spec.command,
    kind: spec.kind,
    settledBy: settled.type,
    submitRetries,
    text: settled.text ?? spec.command
  });
  onProgress?.(`native-slash=settled | command=${spec.command} | kind=${spec.kind} | via=${settled.type} | retries=${submitRetries}`);
  return {
    command: spec.command,
    kind: spec.kind,
    settledBy: settled.type,
    submitRetries,
    settledText: settled.text ?? null
  };
}

export class NativeSessionController {
  constructor({ stdin = null, writer = null, mode = "inherit", submitSequence = null } = {}) {
    this.stdin = stdin;
    this.writer = writer;
    this.mode = mode;
    this.submitSequence = submitSequence ?? resolveNativeSubmitSequence(mode);
  }

  isControllable() {
    if (this.mode === "pipe") {
      return Boolean(this.stdin) && !this.stdin.destroyed;
    }
    if (this.mode === "pty") {
      return typeof this.writer === "function";
    }
    return false;
  }

  sendRaw(chars) {
    if (!this.isControllable()) {
      throw new Error("Native session stdin is not controllable in the current mode.");
    }
    if (this.mode === "pty") {
      this.writer(chars);
      return;
    }
    this.stdin.write(chars, "utf8");
  }

  sendText(text, { submit = true } = {}) {
    if (this.mode === "pty" && submit) {
      this.sendRaw(text);
      const submitDelayMs = resolveNativePtySubmitDelayMs(text);
      if (submitDelayMs > 0) {
        setTimeout(() => {
          try {
            this.sendRaw(this.submitSequence);
          } catch {
            // Ignore submit races during PTY teardown.
          }
        }, submitDelayMs);
        return;
      }
      this.sendRaw(this.submitSequence);
      return;
    }
    const submitChars = submit ? this.submitSequence : "";
    this.sendRaw(`${text}${submitChars}`);
  }

  submit() {
    this.sendRaw(this.submitSequence);
  }

  sendSlashCommand(command) {
    const normalized = String(command ?? "").trim();
    if (!normalized.startsWith("/")) {
      throw new Error("Slash commands must start with '/'.");
    }
    this.sendText(normalized);
  }
}

export class NativeRemoteSession {
  constructor({
    dir,
    policy = null,
    model = null,
    reasoningEffort = null,
    stdioMode = "pty",
    forwardOutput = false,
    observer = new NativeSessionObserver()
  } = {}) {
    if (!dir) {
      throw new Error("NativeRemoteSession requires a working directory.");
    }
    this.dir = dir;
    this.policy = policy;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
    this.stdioMode = stdioMode;
    this.forwardOutput = forwardOutput;
    this.observer = observer;

    this.remoteUrl = null;
    this.bridgeChild = null;
    this.codexChild = null;
    this.controller = null;
    this.started = false;
  }

  async start({ onProgress = null } = {}) {
    if (this.started) {
      return this;
    }
    const port = await allocatePort();
    this.remoteUrl = `ws://127.0.0.1:${port}`;

    const bridge = resolveAppServerInvocation({
      remoteUrl: this.remoteUrl,
      policy: this.policy,
      model: this.model,
      reasoningEffort: this.reasoningEffort
    });
    const command = buildNativeCodexCommand({
      dir: this.dir,
      remoteUrl: this.remoteUrl,
      policy: this.policy,
      model: this.model,
      reasoningEffort: this.reasoningEffort,
      prompt: null
    });

    this.observer.markBridgeState("booting", { text: `remote=${this.remoteUrl}` });
    onProgress?.(`native-bridge=booting | remote=${this.remoteUrl}`);
    this.bridgeChild = spawn(bridge.command, bridge.args, {
      cwd: this.dir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.bridgeChild.stdout.setEncoding("utf8");
    this.bridgeChild.stderr.setEncoding("utf8");
    this.bridgeChild.stderr.on("data", (chunk) => {
      this.observer.ingestChunk("bridge-stderr", chunk);
    });

    await Promise.race([waitForReady(this.bridgeChild, this.observer), onceError(this.bridgeChild)]);
    this.observer.markBridgeState("ready", { text: `remote=${this.remoteUrl}` });
    onProgress?.(`native-bridge=ready | remote=${this.remoteUrl}`);

    const usePipe = this.stdioMode === "pipe";
    const usePty = this.stdioMode === "pty";
    if (!usePipe && !usePty) {
      throw new Error(`Unsupported native session stdioMode=${this.stdioMode} (expected 'pty' or 'pipe').`);
    }

    this.codexChild = usePty
      ? spawnPty(command[0], command.slice(1), {
          cwd: this.dir,
          env: process.env,
          cols: process.stdout.columns || 120,
          rows: process.stdout.rows || 40,
          name: process.env.TERM || "xterm-256color"
        })
      : spawn(command[0], command.slice(1), {
          cwd: this.dir,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"]
        });

    this.controller = new NativeSessionController({
      stdin: usePipe ? this.codexChild.stdin : null,
      writer: usePty ? (value) => this.codexChild.write(value) : null,
      mode: this.stdioMode
    });
    this.observer.markCodexState("running", { text: `mode=${this.stdioMode}` });

    if (usePipe) {
      attachObservedPipe(this.codexChild, "stdout", process.stdout, this.observer, { forwardOutput: this.forwardOutput });
      attachObservedPipe(this.codexChild, "stderr", process.stderr, this.observer, { forwardOutput: this.forwardOutput });
    }
    if (usePty) {
      attachObservedPty(this.codexChild, process.stdout, this.observer, { forwardOutput: this.forwardOutput });
    }

    // Ensure the session is in an interactable prompt state (dismiss boot menus first).
    await waitForPromptReady(this.observer, 30000, {
      controller: this.controller,
      onProgress
    });
    this.observer.markCodexState("ready", { text: "prompt-ready" });

    this.started = true;
    return this;
  }

  async slash(command, { timeoutMs = null, onProgress = null } = {}) {
    if (!this.started) {
      throw new Error("NativeRemoteSession is not started.");
    }
    return injectGuardedSlashCommand({
      controller: this.controller,
      observer: this.observer,
      command,
      timeoutMs,
      onProgress
    });
  }

  async task(task, { timeoutMs = 20000, maxSubmitRetries = 3, onProgress = null } = {}) {
    if (!this.started) {
      throw new Error("NativeRemoteSession is not started.");
    }
    return sendNativeTaskWithRetry({
      controller: this.controller,
      observer: this.observer,
      task,
      timeoutMs,
      maxSubmitRetries,
      onProgress
    });
  }

  async stop() {
    if (!this.bridgeChild && !this.codexChild) {
      return;
    }
    try {
      if (this.codexChild) {
        try {
          if (typeof this.codexChild.kill === "function") {
            this.codexChild.kill("SIGTERM");
          }
        } catch {
          // Ignore shutdown races.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      await terminateQuietly(this.bridgeChild);
      this.bridgeChild = null;
      this.codexChild = null;
      this.controller = null;
      this.started = false;
    }
  }
}

function waitForReady(child, observer, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const done = (fn, value) => {
      clearTimeout(timer);
      stdoutRl.close();
      stderrRl.close();
      fn(value);
    };

    const stdoutRl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity
    });
    const stderrRl = readline.createInterface({
      input: child.stderr,
      crlfDelay: Infinity
    });

    const timer = setTimeout(() => {
      done(reject, new Error("Timed out waiting for native app-server bridge readiness."));
    }, timeoutMs);

    const handleLine = (source, line) => {
      const normalized = line.trim();
      if (normalized) {
        observer.ingestChunk(source, normalized);
      }
      if (/listening on:|readyz:|healthz:|APP_SERVER_READY/i.test(line)) {
        observer.markBridgeState("ready", {
          text: normalized || line
        });
        done(resolve, line);
      }
    };

    stdoutRl.on("line", (line) => handleLine("bridge-stdout", line));
    stderrRl.on("line", (line) => handleLine("bridge-stderr", line));

    child.once("error", (error) => done(reject, error));
    child.once("exit", (code) => {
      done(reject, new Error(`Native app-server bridge exited before ready (code ${code ?? "unknown"}).`));
    });
  });
}

function attachObservedPipe(child, streamName, targetStream, observer, { forwardOutput = true } = {}) {
  if (!child[streamName]) {
    return;
  }
  child[streamName].setEncoding("utf8");
  child[streamName].on("data", (chunk) => {
    observer.ingestChunk(streamName, chunk);
    if (forwardOutput && targetStream) {
      targetStream.write(chunk);
    }
  });
}

function attachObservedPty(child, targetStream, observer, { forwardOutput = true } = {}) {
  child.onData((chunk) => {
    observer.ingestChunk("pty-output", chunk);
    if (forwardOutput && targetStream) {
      targetStream.write(chunk);
    }
  });
}

export async function launchNativeCodexSession({
  dir,
  policy = null,
  model = null,
  reasoningEffort = null,
  prompt = null,
  dryRun = false,
  onProgress = null,
  stdioMode = "inherit",
  forwardOutput = true,
  observer = new NativeSessionObserver(),
  guardedSlashCommand = null,
  guardedSlashTimeoutMs = null
}) {
  const port = await allocatePort();
  const remoteUrl = `ws://127.0.0.1:${port}`;
  const bridge = resolveAppServerInvocation({
    remoteUrl,
    policy,
    model,
    reasoningEffort
  });
  const command = buildNativeCodexCommand({
    dir,
    remoteUrl,
    policy,
    model,
    reasoningEffort,
    prompt
  });

  if (dryRun) {
    const controllerAvailable = stdioMode === "pipe" || stdioMode === "pty";
    return {
      dryRun: true,
      adapter: "native-remote",
      bridgeCommand: [bridge.command, ...bridge.args],
      command,
      remoteUrl,
      model,
      reasoningEffort,
      permissionProfile: policy?.permissionProfile ?? null,
      approvalPolicy: policy?.approvalPolicy ?? null,
      sandboxMode: policy?.sandboxMode ?? null,
      bypassApprovalsAndSandbox: policy?.bypassApprovalsAndSandbox ?? false,
      controllerAvailable,
      controllerMode: controllerAvailable ? stdioMode : "inherit",
      guardedSlash: guardedSlashCommand
        ? {
            ...resolveGuardedSlashSpec(guardedSlashCommand),
            planned: true
          }
        : null,
      observer: observer.toJSON(),
      status: 0
    };
  }

  observer.markBridgeState("booting", { text: `remote=${remoteUrl}` });
  onProgress?.(`native-bridge=booting | remote=${remoteUrl}`);
  const bridgeChild = spawn(bridge.command, bridge.args, {
    cwd: dir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  bridgeChild.stdout.setEncoding("utf8");
  bridgeChild.stderr.setEncoding("utf8");

  let bridgeStderr = "";
  bridgeChild.stderr.on("data", (chunk) => {
    bridgeStderr += chunk;
    observer.ingestChunk("bridge-stderr", chunk);
  });

  let executionResult = null;
  try {
    await Promise.race([waitForReady(bridgeChild, observer), onceError(bridgeChild)]);
    onProgress?.(`native-bridge=ready | remote=${remoteUrl}`);

    const usePipe = stdioMode === "pipe";
    const usePty = stdioMode === "pty";
    const codexChild = usePty
      ? spawnPty(command[0], command.slice(1), {
          cwd: dir,
          env: process.env,
          cols: process.stdout.columns || 120,
          rows: process.stdout.rows || 40,
          name: process.env.TERM || "xterm-256color"
        })
      : spawn(command[0], command.slice(1), {
          cwd: dir,
          env: process.env,
          stdio: usePipe
            ? ["pipe", "pipe", "pipe"]
            : "inherit"
        });
    const controller = new NativeSessionController({
      stdin: usePipe ? codexChild.stdin : null,
      writer: usePty ? (value) => codexChild.write(value) : null,
      mode: stdioMode
    });
    observer.markCodexState("running", {
      text: `mode=${stdioMode}`
    });

    if (usePipe) {
      attachObservedPipe(codexChild, "stdout", process.stdout, observer, { forwardOutput });
      attachObservedPipe(codexChild, "stderr", process.stderr, observer, { forwardOutput });
    }
    if (usePty) {
      attachObservedPty(codexChild, process.stdout, observer, { forwardOutput });
    }

    const guardedSlash = await injectGuardedSlashCommand({
      controller,
      observer,
      command: guardedSlashCommand,
      timeoutMs: guardedSlashTimeoutMs,
      onProgress
    });

    const result = usePty
      ? await waitForPtyClose(codexChild)
      : await Promise.race([waitForClose(codexChild), onceError(codexChild)]);
    observer.markCodexState(result.code === 0 ? "settled" : "exited", {
      text: `status=${result.code ?? 1}`,
      status: result.code ?? 1
    });
    onProgress?.(`native-bridge=complete | status=${result.code ?? 1}`);
    executionResult = {
      dryRun: false,
      adapter: "native-remote",
      bridgeCommand: [bridge.command, ...bridge.args],
      command,
      remoteUrl,
      model,
      reasoningEffort,
      permissionProfile: policy?.permissionProfile ?? null,
      approvalPolicy: policy?.approvalPolicy ?? null,
      sandboxMode: policy?.sandboxMode ?? null,
      bypassApprovalsAndSandbox: policy?.bypassApprovalsAndSandbox ?? false,
      controllerAvailable: usePipe || usePty,
      controllerMode: stdioMode,
      guardedSlash,
      stderr: bridgeStderr,
      status: result.code ?? 1
    };
  } finally {
    observer.markBridgeState("stopping");
    await terminateQuietly(bridgeChild);
    observer.markBridgeState("stopped");
  }
  return {
    ...executionResult,
    observer: observer.toJSON()
  };
}
