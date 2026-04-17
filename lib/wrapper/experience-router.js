import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXPERIENCE_CONFIG_PATH = path.join(os.homedir(), ".experience", "config.json");

function readExperienceConfig() {
  try {
    return JSON.parse(fs.readFileSync(EXPERIENCE_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function defaultEngineUrl(config) {
  if (process.env.QUICK_CODEX_EXPERIENCE_URL) {
    return process.env.QUICK_CODEX_EXPERIENCE_URL;
  }
  if (config.serverBaseUrl) {
    return config.serverBaseUrl;
  }
  const port = config.server?.port ?? process.env.EXP_SERVER_PORT ?? 8082;
  return `http://localhost:${port}`;
}

function defaultEngineAuthToken(config) {
  return process.env.QUICK_CODEX_EXPERIENCE_TOKEN ?? config.serverAuthToken ?? config.server?.authToken ?? null;
}

function hasConfiguredEngine(config) {
  return Boolean(defaultEngineUrl(config) && defaultEngineAuthToken(config));
}

function shouldUseRouter(config) {
  if (process.env.QUICK_CODEX_WRAP_DISABLE_MODEL_ROUTER === "1") {
    return false;
  }
  if (process.env.QUICK_CODEX_WRAP_ENABLE_MODEL_ROUTER === "1") {
    return true;
  }
  if (process.env.QUICK_CODEX_EXPERIENCE_URL) {
    return true;
  }
  return config.routing === true || hasConfiguredEngine(config);
}

function shouldUseTaskRouter(config) {
  if (process.env.QUICK_CODEX_WRAP_DISABLE_TASK_ROUTER === "1") {
    return false;
  }
  if (process.env.QUICK_CODEX_WRAP_ENABLE_TASK_ROUTER === "1") {
    return true;
  }
  if (process.env.QUICK_CODEX_EXPERIENCE_URL) {
    return true;
  }
  return config.routing === true || hasConfiguredEngine(config);
}

function stripTicks(value) {
  return String(value ?? "").replace(/^`/, "").replace(/`$/, "").trim();
}

function collapseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildRouteTaskText({ task, artifact, decision }) {
  if (task && String(task).trim()) {
    return collapseWhitespace(task).slice(0, 2000);
  }

  const parts = [
    artifact?.goal ? `Goal: ${artifact.goal}` : null,
    artifact?.currentPhaseWave ? `Phase/wave: ${artifact.currentPhaseWave}` : null,
    artifact?.nextWavePack?.waveGoal ? `Wave goal: ${artifact.nextWavePack.waveGoal}` : null,
    artifact?.nextWavePack?.doneWhen ? `Done when: ${artifact.nextWavePack.doneWhen}` : null,
    artifact?.recommendedNextCommand ? `Next command: ${stripTicks(artifact.recommendedNextCommand)}` : null,
    decision?.prompt ? `Prompt: ${stripTicks(decision.prompt)}` : null
  ].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return collapseWhitespace(parts.join(" | ")).slice(0, 2000);
}

function buildRouteContext({ dir, artifact, decision }) {
  return {
    projectSlug: path.basename(dir),
    phase: artifact?.currentPhaseWave ?? decision?.currentPhaseWave ?? null,
    gate: artifact?.currentGate ?? decision?.currentGate ?? null,
    domain: decision?.route ?? "quick-codex-wrapper",
    run: artifact?.relativeRunPath ?? null
  };
}

function normalizeTaskRoute(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "qc-flow" || normalized === "flow") {
    return "qc-flow";
  }
  if (normalized === "qc-lock" || normalized === "lock" || normalized === "quick") {
    return "qc-lock";
  }
  if (normalized === "direct") {
    return "direct";
  }
  if (normalized === "continue-active-run" || normalized === "continue") {
    return "continue-active-run";
  }
  return null;
}

function normalizeDisambiguationOptions(options, fallbackHasActiveRun = false) {
  if (!Array.isArray(options) || options.length === 0) {
    const base = [
      {
        id: "plan-research",
        label: "Plan and research first",
        route: "qc-flow",
        description: "Clarify the goal, inspect the repo, and plan before coding."
      },
      {
        id: "implement-now",
        label: "Implement a narrow change",
        route: "qc-lock",
        description: "Treat the request as a tight execution task with explicit verification."
      },
      {
        id: "explain-only",
        label: "Explain or analyze",
        route: "direct",
        description: "Answer directly without opening a workflow run unless scope expands."
      }
    ];
    if (fallbackHasActiveRun) {
      base.push({
        id: "continue-active-run",
        label: "Continue the active run",
        route: "continue-active-run",
        description: "Resume the current artifact instead of starting a fresh route."
      });
    }
    base.push({
      id: "free-text",
      label: "Enter a different task",
      route: "free-text",
      description: "Type a clearer or more specific task if none of the options fit."
    });
    return base;
  }

  return options.map((option, index) => ({
    id: option.id ?? `option-${index + 1}`,
    label: option.label ?? `Option ${index + 1}`,
    route: normalizeTaskRoute(option.route) ?? (option.freeText ? "free-text" : null),
    description: option.description ?? option.reason ?? ""
  }));
}

function buildTaskRouteContext({ dir, task, localRoute, activeArtifact, activeRunPreference }) {
  return {
    projectSlug: path.basename(dir),
    localRoute: localRoute?.route ?? null,
    localReason: localRoute?.reason ?? null,
    activeRun: activeArtifact ? {
      run: activeArtifact.relativeRunPath,
      goal: activeArtifact.goal ?? null,
      gate: activeArtifact.currentGate ?? null,
      phaseWave: activeArtifact.currentPhaseWave ?? null,
      recommendedNextCommand: activeArtifact.recommendedNextCommand ?? null,
      blockers: activeArtifact.blockers ?? []
    } : null,
    activeRunCandidate: activeRunPreference ? {
      run: activeRunPreference.activeRun ?? null,
      route: activeRunPreference.route ?? null,
      gate: activeRunPreference.activeRunGate ?? null,
      overlap: activeRunPreference.overlap ?? null
    } : null,
    taskPreview: collapseWhitespace(task).slice(0, 500)
  };
}

export async function resolveExperienceTaskRoute({
  dir,
  task,
  localRoute = null,
  activeArtifact = null,
  activeRunPreference = null
}) {
  const config = readExperienceConfig();
  if (!shouldUseTaskRouter(config)) {
    return {
      enabled: false,
      applied: false,
      skippedReason: "Experience Engine task router is not enabled for this wrapper session."
    };
  }

  const taskText = collapseWhitespace(task ?? "").slice(0, 2000);
  if (!taskText) {
    return {
      enabled: true,
      applied: false,
      skippedReason: "No routeable task text was available for task routing."
    };
  }

  const baseUrl = defaultEngineUrl(config);
  const authToken = defaultEngineAuthToken(config);
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(`${baseUrl}/api/route-task`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        task: taskText,
        runtime: "codex",
        context: buildTaskRouteContext({ dir, task: taskText, localRoute, activeArtifact, activeRunPreference })
      }),
      signal: AbortSignal.timeout(Number(process.env.QUICK_CODEX_WRAP_TASK_ROUTER_TIMEOUT_MS ?? 7000))
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return {
        enabled: true,
        applied: false,
        baseUrl,
        requestedTask: taskText,
        error: data?.error ?? response.statusText
      };
    }

    const route = normalizeTaskRoute(data.route);
    const needsDisambiguation = data.needs_disambiguation === true || data.needsDisambiguation === true;
    const options = normalizeDisambiguationOptions(data.options, Boolean(activeRunPreference));
    const applied = Boolean(route || needsDisambiguation);
    return {
      enabled: true,
      applied,
      baseUrl,
      requestedTask: taskText,
      route,
      confidence: data.confidence ?? null,
      source: data.source ?? response.headers.get("X-Route-Source") ?? null,
      reason: data.reason ?? null,
      needsDisambiguation,
      options
    };
  } catch (error) {
    return {
      enabled: true,
      applied: false,
      baseUrl,
      requestedTask: taskText,
      error: error.message
    };
  }
}

export async function resolveExperienceModelRoute({ dir, task = null, artifact = null, decision = null }) {
  const config = readExperienceConfig();
  if (!shouldUseRouter(config)) {
    return {
      enabled: false,
      applied: false,
      skippedReason: "Experience Engine model router is not enabled for this wrapper session."
    };
  }

  const taskText = buildRouteTaskText({ task, artifact, decision });
  if (!taskText) {
    return {
      enabled: true,
      applied: false,
      skippedReason: "No routeable task text was available for model routing."
    };
  }

  const baseUrl = defaultEngineUrl(config);
  const authToken = defaultEngineAuthToken(config);
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(`${baseUrl}/api/route-model`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        task: taskText,
        runtime: "codex",
        context: buildRouteContext({ dir, artifact, decision })
      }),
      signal: AbortSignal.timeout(Number(process.env.QUICK_CODEX_WRAP_MODEL_ROUTER_TIMEOUT_MS ?? 4000))
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return {
        enabled: true,
        applied: false,
        baseUrl,
        requestedTask: taskText,
        error: data?.error ?? response.statusText
      };
    }
    return {
      enabled: true,
      applied: Boolean(data.model),
      baseUrl,
      requestedTask: taskText,
      taskHash: data.taskHash ?? null,
      tier: data.tier ?? null,
      model: data.model ?? null,
      reasoningEffort: data.reasoningEffort ?? data.reasoning_effort ?? null,
      confidence: data.confidence ?? null,
      source: data.source ?? null,
      reason: data.reason ?? null
    };
  } catch (error) {
    return {
      enabled: true,
      applied: false,
      baseUrl,
      requestedTask: taskText,
      error: error.message
    };
  }
}

export async function sendExperienceRouteFeedback({ route, outcome, durationMs }) {
  if (!route?.enabled || !route?.taskHash || !route?.baseUrl) {
    return {
      sent: false,
      skippedReason: "No routed task hash is available for route-feedback."
    };
  }

  const config = readExperienceConfig();
  const authToken = defaultEngineAuthToken(config);
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(`${route.baseUrl}/api/route-feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        taskHash: route.taskHash,
        tier: route.tier ?? null,
        model: route.model ?? null,
        outcome,
        retryCount: 0,
        duration: durationMs ?? null
      }),
      signal: AbortSignal.timeout(Number(process.env.QUICK_CODEX_WRAP_ROUTE_FEEDBACK_TIMEOUT_MS ?? 2000))
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        sent: false,
        error: data?.error ?? response.statusText
      };
    }
    return {
      sent: true,
      outcome,
      ok: data?.ok ?? true
    };
  } catch (error) {
    return {
      sent: false,
      error: error.message
    };
  }
}
