import { EventEmitter } from "node:events";

import {
  compileTaskPrompt,
  ensureProjectBootstrap,
  inspectActiveRunPreference,
  loadWrapperConfig,
  loadWrapperState,
  NativeRemoteSession,
  NativeSessionObserver,
  readActiveRunArtifact,
  resolveExperienceModelRoute,
  resolveExperienceTaskRoute,
  resolvePermissionPolicy,
  routeTask
} from "../../lib/wrapper/index.js";

function clip(value, max = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function normalizeMode(value) {
  return value === "orchestrated" ? "orchestrated" : "passthrough";
}

export class ElectronSessionManager extends EventEmitter {
  constructor({
    createNativeSession = (options) => new NativeRemoteSession(options),
    wrapperApi = {
      compileTaskPrompt,
      ensureProjectBootstrap,
      inspectActiveRunPreference,
      loadWrapperConfig,
      loadWrapperState,
      readActiveRunArtifact,
      resolveExperienceModelRoute,
      resolveExperienceTaskRoute,
      resolvePermissionPolicy,
      routeTask
    }
  } = {}) {
    super();
    this.createNativeSession = createNativeSession;
    this.wrapperApi = wrapperApi;
    this.session = null;
    this.observer = null;
    this.mode = "passthrough";
    this.dir = process.cwd();
    this.maxTurns = 5;
    this.policy = null;
    this.wrapperConfig = null;
    this.currentModel = null;
    this.currentReasoningEffort = null;
    this.pendingTask = false;
    this.lastDecision = null;
    this.lastRouteTask = null;
  }

  snapshot() {
    return {
      mode: this.mode,
      dir: this.dir,
      maxTurns: this.maxTurns,
      started: Boolean(this.session),
      pendingTask: this.pendingTask,
      model: this.currentModel,
      reasoningEffort: this.currentReasoningEffort,
      policy: this.policy,
      observer: this.observer?.toJSON().snapshot ?? null,
      lastDecision: this.lastDecision,
      lastRouteTask: this.lastRouteTask
    };
  }

  async startSession({ mode = "passthrough", dir, maxTurns = 5, cols = null, rows = null } = {}) {
    await this.stopSession();

    this.mode = normalizeMode(mode);
    this.dir = dir ?? this.dir;
    this.maxTurns = maxTurns;
    this.wrapperConfig = this.wrapperApi.loadWrapperConfig(this.dir);
    this.policy = this.wrapperApi.resolvePermissionPolicy({ wrapperConfig: this.wrapperConfig });
    this.observer = new NativeSessionObserver();
    this.observer.on("event", (event) => {
      this.emit("session-event", {
        type: "observer",
        event
      });
    });

    this.session = this.createNativeSession({
      dir: this.dir,
      policy: this.policy,
      stdioMode: "pty",
      forwardOutput: false,
      observer: this.observer,
      cols,
      rows,
      onOutputChunk: (chunk, meta) => {
        this.emit("output", {
          chunk,
          source: meta?.source ?? "pty-output"
        });
      }
    });

    await this.session.start({
      onProgress: (entry) => {
        this.emit("session-event", {
          type: "progress",
          entry
        });
      }
    });

    this.currentModel = null;
    this.currentReasoningEffort = null;
    this.lastDecision = null;
    this.lastRouteTask = null;

    const payload = this.snapshot();
    this.emit("started", payload);
    this.emit("status", payload);
    return payload;
  }

  async stopSession() {
    if (!this.session) {
      return;
    }
    await this.session.stop();
    this.session = null;
    this.observer = null;
    this.pendingTask = false;
    this.emit("stopped", this.snapshot());
  }

  resize(cols, rows) {
    if (!this.session) {
      return false;
    }
    const nextCols = Math.max(20, Math.min(400, Number(cols || 120)));
    const nextRows = Math.max(10, Math.min(200, Number(rows || 40)));
    return this.session.resize(nextCols, nextRows);
  }

  async writeRaw(text) {
    if (!this.session?.controller?.isControllable()) {
      throw new Error("No controllable native session is active.");
    }
    this.session.controller.sendRaw(String(text ?? ""));
  }

  async slash(command) {
    if (!this.session) {
      throw new Error("No native session is active.");
    }
    const result = await this.session.slash(command, {
      onProgress: (entry) => {
        this.emit("session-event", {
          type: "progress",
          entry
        });
      }
    });
    this.emit("session-event", {
      type: "slash-result",
      result
    });
    return result;
  }

  async submitTask(task) {
    if (!this.session) {
      await this.startSession({
        mode: this.mode,
        dir: this.dir,
        maxTurns: this.maxTurns
      });
    }
    if (this.mode !== "orchestrated") {
      throw new Error("submitTask is only available in orchestrated mode.");
    }

    const routed = await this.#buildTaskDecision(task);
    this.lastDecision = routed.decision;
    this.lastRouteTask = routed.taskRoute;
    this.emit("session-event", {
      type: "task-route",
      task: clip(task),
      route: routed.decision.route,
      routeSource: routed.decision.routeSource,
      reason: routed.decision.reason,
      activeRun: routed.decision.activeRun ?? null,
      promptSource: routed.decision.promptSource
    });

    if (routed.modelRoute?.applied) {
      this.emit("session-event", {
        type: "model-route",
        model: routed.modelRoute.model,
        reasoningEffort: routed.modelRoute.reasoningEffort ?? null,
        source: routed.modelRoute.source ?? null,
        reason: routed.modelRoute.reason ?? null
      });
    }

    await this.#ensureSessionModel({
      model: routed.decision.model,
      reasoningEffort: routed.decision.reasoningEffort
    });

    this.pendingTask = true;
    this.emit("status", this.snapshot());
    const result = await this.session.task(routed.decision.prompt, {
      onProgress: (entry) => {
        this.emit("session-event", {
          type: "progress",
          entry
        });
      }
    });
    this.pendingTask = false;
    this.emit("session-event", {
      type: "task-result",
      result,
      route: routed.decision.route,
      model: routed.decision.model ?? "default"
    });
    this.emit("status", this.snapshot());
    return {
      routed: routed.decision,
      modelRoute: routed.modelRoute,
      result
    };
  }

  async #buildTaskDecision(task) {
    const normalizedTask = String(task ?? "").trim();
    if (!normalizedTask) {
      throw new Error("Task text is required.");
    }

    const wrapperState = this.wrapperApi.loadWrapperState(this.dir);
    const localRoute = this.wrapperApi.routeTask({ task: normalizedTask });
    const activeArtifact = this.wrapperApi.readActiveRunArtifact(this.dir);
    const activeRunPreference = this.wrapperApi.inspectActiveRunPreference({
      dir: this.dir,
      task: normalizedTask,
      initialRoute: localRoute.route,
      wrapperState
    });
    const taskRoute = await this.wrapperApi.resolveExperienceTaskRoute({
      dir: this.dir,
      task: normalizedTask,
      localRoute,
      activeArtifact: activeArtifact?.artifact ?? null,
      activeRunPreference
    });

    if (taskRoute.needsDisambiguation) {
      this.emit("session-event", {
        type: "task-disambiguation",
        task: clip(normalizedTask),
        reason: taskRoute.reason ?? "Task routing requires clarification.",
        options: taskRoute.options ?? []
      });
      throw new Error("Task routing requires disambiguation before submission.");
    }

    const route = taskRoute.applied && taskRoute.route
      ? taskRoute.route
      : activeRunPreference?.route
        ? activeRunPreference.route
        : localRoute.route;
    const routeSource = taskRoute.applied && taskRoute.route
      ? taskRoute.source ?? "experience-task-router"
      : activeRunPreference?.route
        ? "active-run"
        : "heuristic-fallback";
    const reason = taskRoute.applied && taskRoute.route
      ? (taskRoute.reason ?? localRoute.reason)
      : activeRunPreference?.reason
        ? activeRunPreference.reason
        : localRoute.reason;

    const projectState = this.wrapperApi.ensureProjectBootstrap({
      dir: this.dir,
      route,
      dryRun: false
    });
    const prompt = activeRunPreference?.route
      ? activeRunPreference.prompt
      : this.wrapperApi.compileTaskPrompt({
          route,
          task: normalizedTask,
          reason,
          projectState
        });

    const decision = {
      task: normalizedTask,
      route,
      routeSource,
      reason,
      prompt,
      promptSource: activeRunPreference?.route ? "active-run" : "task-router",
      activeRun: activeRunPreference?.activeRun ?? null,
      currentGate: activeRunPreference?.activeRunGate ?? null,
      model: null,
      reasoningEffort: null
    };

    const modelRoute = await this.wrapperApi.resolveExperienceModelRoute({
      dir: this.dir,
      task: normalizedTask,
      artifact: activeArtifact?.artifact ?? null,
      decision
    });
    if (modelRoute.applied) {
      decision.model = modelRoute.model ?? null;
      decision.reasoningEffort = modelRoute.reasoningEffort ?? null;
    }

    return {
      decision,
      taskRoute,
      modelRoute
    };
  }

  async #ensureSessionModel({ model = null, reasoningEffort = null }) {
    const nextModel = model ?? null;
    const nextReasoning = reasoningEffort ?? null;
    if (!this.session) {
      throw new Error("No native session is active.");
    }
    if (this.currentModel === nextModel && this.currentReasoningEffort === nextReasoning) {
      return;
    }

    await this.session.stop();
    this.observer = new NativeSessionObserver();
    this.observer.on("event", (event) => {
      this.emit("session-event", {
        type: "observer",
        event
      });
    });
    this.session = this.createNativeSession({
      dir: this.dir,
      policy: this.policy,
      model: nextModel,
      reasoningEffort: nextReasoning,
      stdioMode: "pty",
      forwardOutput: false,
      observer: this.observer,
      onOutputChunk: (chunk, meta) => {
        this.emit("output", {
          chunk,
          source: meta?.source ?? "pty-output"
        });
      }
    });
    await this.session.start({
      onProgress: (entry) => {
        this.emit("session-event", {
          type: "progress",
          entry
        });
      }
    });

    this.currentModel = nextModel;
    this.currentReasoningEffort = nextReasoning;
    this.emit("session-event", {
      type: "session-model-ready",
      model: this.currentModel ?? "default",
      reasoningEffort: this.currentReasoningEffort ?? "default"
    });
  }
}
