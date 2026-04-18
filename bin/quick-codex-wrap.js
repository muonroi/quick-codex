#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import {
  approvalModeNames,
  buildCheckpointSummary,
  classifyAutoFollowStop,
  compileTaskPrompt,
  CodexAppServerSession,
  decideWrapperAction,
  executionProfileNames,
  ensureProjectBootstrap,
  loadWrapperConfig,
  resolveAutoContinuation,
  resolveExecutionProfile,
  resolveExperienceModelRoute,
  resolveExperienceTaskRoute,
  resolvePermissionPolicy,
  sendExperienceRouteFeedback,
  inspectActiveRunPreference,
  inspectProjectBootstrap,
  loadWrapperState,
  permissionProfileNames,
  readActiveRunArtifact,
  readFlowState,
  rawTaskOrchestration,
  readRunArtifact,
  routeTask,
  launchNativeCodexSession,
  runCodexCommand,
  saveWrapperState
} from "../lib/wrapper/index.js";

function usage() {
  console.log(`Usage:
  quick-codex-wrap prompt --task <text> [--route-override <auto|qc-flow|qc-lock|direct>] [--json]
  quick-codex-wrap run --task <text> [--dir <project-dir>] [--route-override <auto|qc-flow|qc-lock|direct>] [--permission-profile <safe|full|yolo|readonly>] [--approval-mode <manual|autonomous|untrusted>] [--dry-run] [--json] [--output-last-message <file>]
  quick-codex-wrap chat [--dir <project-dir>] [--task <text>] [--route-override <auto|qc-flow|qc-lock|direct>] [--permission-profile <safe|full|yolo|readonly>] [--approval-mode <manual|autonomous|untrusted>] [--ui <auto|plain|rich|native>] [--native-guarded-slash </status|/compact|/clear|/resume <session-id-or-name|--last>>] [--follow] [--max-turns <n>] [--json]
  quick-codex-wrap auto [--dir <project-dir>] [--run <path>] [--task <text>] [--route-override <auto|qc-flow|qc-lock|direct>] [--permission-profile <safe|full|yolo|readonly>] [--approval-mode <manual|autonomous|untrusted>] [--dry-run] [--json] [--follow] [--max-turns <n>] [--output-last-message <file>]
  quick-codex-wrap decide [--dir <project-dir>] [--run <path>] [--json]
  quick-codex-wrap checkpoint [--dir <project-dir>] [--run <path>] [--json]
  quick-codex-wrap start [--dir <project-dir>] [--run <path>] [--permission-profile <safe|full|yolo|readonly>] [--approval-mode <manual|autonomous|untrusted>] [--dry-run] [--json] [--output-last-message <file>]
  quick-codex-wrap continue [--dir <project-dir>] [--run <path>] [--permission-profile <safe|full|yolo|readonly>] [--approval-mode <manual|autonomous|untrusted>] [--dry-run] [--json] [--same-session] [--output-last-message <file>]
  quick-codex-wrap --help

Commands:
  prompt      Classify a raw task and print the wrapper-selected Quick Codex prompt
  run         Launch a raw task through the wrapper-selected Quick Codex route
  chat        Open an interactive wrapper shell that routes each entered message before it reaches Codex
  auto        Orchestrate either a raw task or the active artifact through the wrapper-selected continuity path
  decide      Inspect the active run artifact and print the wrapper decision
  checkpoint  Print a machine-friendly carry-forward summary for the active run
  start       Launch a fresh non-interactive Codex run from the artifact payload
  continue    Continue from wrapper state; resumes the last session only when --same-session is provided
`);
}

function shellHelpText() {
  return [
    "Interactive wrapper shell",
    "",
    "Commands:",
    "  /help                Show this help",
    "  /status              Show wrapper shell state",
    "  /continue            Continue from the active run artifact (if present)",
    "  /task <text>         Submit a task explicitly through the thin wrapper",
    "  /route <mode>        Set routing mode: auto | flow | lock | direct",
    "  /perm <profile>      Set permission profile: safe | full | yolo | readonly",
    "  /approval <mode>     Set approval mode: manual | autonomous | untrusted",
    "  /mode <profile>      Set execution profile: fast | safe | follow-safe",
    "  /follow <on|off>     Toggle follow-loop chaining",
    "  /turns <n>           Set max follow turns",
    "  /exit, /quit         Exit the shell",
    "",
    "Any other line is treated as a user task and routed through the thin wrapper.",
    "Default shell policy comes from .quick-codex-flow/wrapper-config.json when present.",
    "Press Tab to complete slash commands and known profile names.",
    "Use --ui native for the experimental stock-Codex bridge, or --ui plain to disable the rich TUI."
  ].join("\n");
}

function normalizeRouteOverride(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return null;
  }
  if (normalized === "flow" || normalized === "qc-flow") {
    return "qc-flow";
  }
  if (normalized === "lock" || normalized === "quick" || normalized === "qc-lock") {
    return "qc-lock";
  }
  if (normalized === "direct") {
    return "direct";
  }
  throw new Error("--route-override must be one of: auto, qc-flow, qc-lock, direct");
}

function normalizeUiRenderer(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return "auto";
  }
  if (normalized === "plain" || normalized === "rich" || normalized === "native") {
    return normalized;
  }
  throw new Error("--ui must be one of: auto, plain, rich, native");
}

function parseArgs(argv) {
  const result = {
    command: null,
    dir: process.cwd(),
    run: null,
    json: false,
    dryRun: false,
    follow: false,
    followExplicit: false,
    maxTurns: 3,
    maxTurnsExplicit: false,
    sameSession: false,
    outputLastMessage: null,
    task: null,
    routeOverride: null,
    ui: null,
    nativeGuardedSlash: null,
    permissionProfile: null,
    approvalMode: null
  };

  if (argv.length === 0 || ["-h", "--help", "help"].includes(argv[0])) {
    result.command = "help";
    return result;
  }

  result.command = argv[0];
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--dir requires a directory");
      }
      result.dir = path.resolve(argv[i]);
      continue;
    }
    if (arg === "--run") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--run requires a path");
      }
      result.run = argv[i];
      continue;
    }
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--follow") {
      result.follow = true;
      result.followExplicit = true;
      continue;
    }
    if (arg === "--max-turns") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--max-turns requires a number");
      }
      result.maxTurns = Number(argv[i]);
      result.maxTurnsExplicit = true;
      if (!Number.isInteger(result.maxTurns) || result.maxTurns < 1) {
        throw new Error("--max-turns must be a positive integer");
      }
      continue;
    }
    if (arg === "--same-session") {
      result.sameSession = true;
      continue;
    }
    if (arg === "--output-last-message") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--output-last-message requires a file path");
      }
      result.outputLastMessage = path.resolve(argv[i]);
      continue;
    }
    if (arg === "--task") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--task requires text");
      }
      result.task = argv[i];
      continue;
    }
    if (arg === "--route-override") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--route-override requires a value");
      }
      result.routeOverride = normalizeRouteOverride(argv[i]);
      continue;
    }
    if (arg === "--permission-profile") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--permission-profile requires a value");
      }
      result.permissionProfile = argv[i];
      continue;
    }
    if (arg === "--ui") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--ui requires a value");
      }
      result.ui = normalizeUiRenderer(argv[i]);
      continue;
    }
    if (arg === "--approval-mode") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--approval-mode requires a value");
      }
      result.approvalMode = argv[i];
      continue;
    }
    if (arg === "--native-guarded-slash") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--native-guarded-slash requires a slash command");
      }
      result.nativeGuardedSlash = argv[i];
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return result;
}

function print(value, asJson) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (typeof value === "string") {
    console.log(value);
    return;
  }

  console.log(value.summary);
}

function shellStatus({ args, runtime, turnCount, shellState, wrapperConfig }) {
  const flowState = readFlowState(args.dir);
  const activeRun = flowState?.activeRun && flowState.activeRun !== "none"
    ? flowState.activeRun
    : null;
  let artifact = null;
  if (activeRun) {
    try {
      artifact = readRunArtifact({ dir: args.dir, run: activeRun });
    } catch {
      artifact = null;
    }
  }
  return {
    dir: args.dir,
    configPath: wrapperConfig.path,
    executionProfile: shellState.executionProfile,
    follow: shellState.follow,
    maxTurns: shellState.maxTurns,
    uiRenderer: shellState.uiRenderer,
    routeOverride: shellState.routeOverride ?? null,
    permissionProfile: shellState.permissionProfile,
    approvalMode: shellState.approvalMode,
    turnsSubmitted: turnCount,
    activeThreadId: runtime.appServerSession?.activeThreadId ?? null,
    activeModel: runtime.appServerSession?.currentModel ?? null,
    flowStatus: flowState?.status ?? null,
    activeRun,
    activeGate: artifact?.currentGate ?? flowState?.currentGate ?? null,
    activePhaseWave: artifact?.currentPhaseWave ?? flowState?.currentPhaseWave ?? null,
    recommendedNextCommand: artifact?.recommendedNextCommand ?? null
  };
}

function ensureOutputPath(filePath) {
  if (!filePath) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function formatShellStatus(status, asJson) {
  if (asJson) {
    return JSON.stringify(status, null, 2);
  }
  return [
    `dir=${status.dir}`,
    `configPath=${status.configPath}`,
    `executionProfile=${status.executionProfile}`,
    `follow=${status.follow}`,
    `maxTurns=${status.maxTurns}`,
    `uiRenderer=${status.uiRenderer}`,
    `routeOverride=${status.routeOverride ?? "auto"}`,
    `permissionProfile=${status.permissionProfile}`,
    `approvalMode=${status.approvalMode}`,
    `turnsSubmitted=${status.turnsSubmitted}`,
    `activeThreadId=${status.activeThreadId ?? "none"}`,
    `activeModel=${status.activeModel ?? "default"}`,
    `activeRun=${status.activeRun ?? "none"}`,
    `flowStatus=${status.flowStatus ?? "unknown"}`,
    `activeGate=${status.activeGate ?? "unknown"}`,
    `activePhaseWave=${status.activePhaseWave ?? "unknown"}`,
    `recommendedNextCommand=${status.recommendedNextCommand ?? "none"}`
  ].join("\n");
}

function shellProgressLogger(onEntry) {
  return (message) => {
    onEntry({ type: "progress", text: message });
  };
}

function summarizeRouteSelection(decision) {
  const parts = [
    `route=${decision.route ?? "artifact"}`,
    `source=${decision.routeSource ?? decision.promptSource ?? "unknown"}`
  ];
  if (decision.taskRouting?.confidence != null) {
    parts.push(`confidence=${decision.taskRouting.confidence}`);
  }
  if (decision.taskRouting?.source && decision.taskRouting.source !== decision.routeSource) {
    parts.push(`brain=${decision.taskRouting.source}`);
  }
  return parts.join(" | ");
}

function saveWrapperStateIfPossible({ dir, state, artifact, decision, execution }) {
  if (!artifact) {
    return null;
  }
  return saveWrapperState(dir, state, {
    artifact,
    decision,
    execution
  });
}

function postTaskArtifact(dir, explicitRun = null) {
  if (explicitRun) {
    return readRunArtifact({ dir, run: explicitRun });
  }
  return readActiveRunArtifact(dir)?.artifact ?? null;
}

function buildTaskAutoResponse({ decision, bootstrapState, execution, wrapperStatePath = null }) {
  return {
    ...execution,
    route: decision.route,
    routeSource: decision.routeSource ?? null,
    model: decision.model ?? null,
    modelRouting: decision.modelRoute ?? null,
    taskRouting: decision.taskRouting ?? null,
    routeFeedback: execution.routeFeedback ?? null,
    permissionProfile: decision.policy?.permissionProfile ?? execution.permissionProfile ?? null,
    approvalPolicy: decision.policy?.approvalPolicy ?? execution.approvalPolicy ?? null,
    sandboxMode: decision.policy?.sandboxMode ?? execution.sandboxMode ?? null,
    bypassApprovalsAndSandbox: decision.policy?.bypassApprovalsAndSandbox ?? execution.bypassApprovalsAndSandbox ?? false,
    activeRun: decision.activeRun ?? null,
    wrapperStatePath,
    outputLastMessagePath: execution.outputLastMessagePath ?? null,
    bootstrap: {
      required: bootstrapState.bootstrapRequired,
      planned: bootstrapState.bootstrapPlanned,
      performed: bootstrapState.bootstrapPerformed,
      scaffoldPresent: bootstrapState.scaffoldPresent,
      summary: bootstrapState.summary
    },
    promptSource: decision.promptSource,
    prompt: decision.prompt,
    reason: decision.reason,
    sessionStrategy: decision.sessionStrategy,
    handoffAction: decision.handoffAction,
    nativeThreadAction: decision.nativeThreadAction,
    chatActionEquivalent: decision.chatActionEquivalent,
    wrapperCommandEquivalent: decision.wrapperCommandEquivalent,
    summary: [
      `Route: ${decision.route}`,
      `Model: ${decision.model ?? "default codex profile"}`,
      `Permission profile: ${decision.policy?.permissionProfile ?? "safe"}`,
      `Approval policy: ${decision.policy?.approvalPolicy ?? "on-request"}`,
      `Bootstrap: ${bootstrapState.summary}`,
      `Codex command: ${execution.command.join(" ")}`,
      `Prompt source: ${decision.promptSource}`,
      `Prompt preview: ${decision.prompt}`
    ].join("\n")
  };
}

function buildArtifactAutoResponse({ artifact, decision, execution, wrapperStatePath = null }) {
  return {
    ...execution,
    run: artifact.relativeRunPath,
    routeSource: decision.routeSource ?? null,
    model: decision.model ?? null,
    modelRouting: decision.modelRoute ?? null,
    routeFeedback: execution.routeFeedback ?? null,
    permissionProfile: decision.policy?.permissionProfile ?? execution.permissionProfile ?? null,
    approvalPolicy: decision.policy?.approvalPolicy ?? execution.approvalPolicy ?? null,
    sandboxMode: decision.policy?.sandboxMode ?? execution.sandboxMode ?? null,
    bypassApprovalsAndSandbox: decision.policy?.bypassApprovalsAndSandbox ?? execution.bypassApprovalsAndSandbox ?? false,
    decision: decision.mode,
    wrapperStatePath,
    outputLastMessagePath: execution.outputLastMessagePath ?? null,
    sessionStrategy: decision.sessionStrategy,
    handoffAction: decision.handoffAction,
    nativeThreadAction: decision.nativeThreadAction,
    chatActionEquivalent: decision.chatActionEquivalent,
    wrapperCommandEquivalent: decision.wrapperCommandEquivalent,
    summary: [
      `Run: ${artifact.relativeRunPath}`,
      `Model: ${decision.model ?? "default codex profile"}`,
      `Permission profile: ${decision.policy?.permissionProfile ?? "safe"}`,
      `Approval policy: ${decision.policy?.approvalPolicy ?? "on-request"}`,
      `Decision: ${decision.mode}`,
      `Codex command: ${execution.command.join(" ")}`,
      `Prompt source: ${decision.promptSource}`,
      `Prompt preview: ${decision.prompt}`
    ].join("\n")
  };
}

async function executeRoutedDecision({
  dir,
  task = null,
  artifact = null,
  decision,
  policy,
  dryRun = false,
  outputLastMessage = null,
  preferredMode = null,
  appServerSession = null,
  onProgress = null
}) {
  const modelRoute = await resolveExperienceModelRoute({
    dir,
    task,
    artifact,
    decision
  });
  const routedDecision = {
    ...decision,
    policy,
    model: modelRoute.applied ? modelRoute.model : decision.model ?? null,
    reasoningEffort: modelRoute.applied ? (modelRoute.reasoningEffort ?? decision.reasoningEffort ?? null) : (decision.reasoningEffort ?? null),
    modelRoute
  };
  onProgress?.(`model=${routedDecision.model ?? "default"} | reasoning=${routedDecision.reasoningEffort ?? "default"} | modelRoute=${modelRoute.applied ? (modelRoute.source ?? "brain") : "fallback-default"}`);
  const startedAt = Date.now();

  try {
    onProgress?.(`launching adapter=${routedDecision.nativeThreadAction ? "app-server" : "exec"} | handoff=${routedDecision.handoffAction ?? "launch-task"} | session=${routedDecision.sessionStrategy ?? routedDecision.mode}`);
    const execution = await runCodexCommand({
      dir,
      decision: routedDecision,
      dryRun,
      outputLastMessage,
      preferredMode,
      appServerSession
    });
    const routeFeedback = dryRun
      ? {
          sent: false,
          skippedReason: "Dry-run launches do not emit route-feedback."
        }
      : await sendExperienceRouteFeedback({
          route: modelRoute,
          outcome: execution.status === 0 ? "success" : "fail",
          durationMs: Date.now() - startedAt
        });
    return {
      decision: routedDecision,
      execution: {
        ...execution,
        routeFeedback
      }
    };
  } catch (error) {
    const routeFeedback = dryRun
      ? {
          sent: false,
          skippedReason: "Dry-run launches do not emit route-feedback."
        }
      : await sendExperienceRouteFeedback({
          route: modelRoute,
          outcome: "fail",
          durationMs: Date.now() - startedAt
        });
    error.routeFeedback = routeFeedback;
    throw error;
  }
}

async function executePreparedTaskDecision(args, baseDecision, runtime = null, onProgress = null) {
  if (baseDecision.needsDisambiguation) {
    return {
      decision: baseDecision,
      bootstrapState: null,
      execution: null,
      artifactBeforeTurn: null,
      response: {
        ...baseDecision,
        followRequested: false,
        turnsExecuted: 0,
        stoppedBecause: "needs-disambiguation",
        turns: []
      }
    };
  }

  const bootstrapState = ensureProjectBootstrap({
    dir: args.dir,
    route: baseDecision.route,
    dryRun: args.dryRun
  });
  onProgress?.(summarizeRouteSelection(baseDecision));
  onProgress?.(`reason=${baseDecision.reason}`);
  onProgress?.(`bootstrap=${bootstrapState.summary}`);
  const prompt = baseDecision.promptSource === "active-run"
    ? baseDecision.prompt
    : compileTaskPrompt({
        route: baseDecision.route,
        task: args.task,
        reason: baseDecision.reason,
        projectState: bootstrapState
      });
  const decision = {
    ...baseDecision,
    projectState: bootstrapState,
    prompt
  };
  const state = loadWrapperState(args.dir);
  ensureOutputPath(args.outputLastMessage);
  const wrapperConfig = loadWrapperConfig(args.dir);
  const policy = resolvePermissionPolicy({
    explicitPermissionProfile: args.permissionProfile,
    explicitApprovalMode: args.approvalMode,
    wrapperConfig
  });
  const routed = await executeRoutedDecision({
    dir: args.dir,
    task: args.task,
    decision,
    policy,
    dryRun: args.dryRun,
    outputLastMessage: args.outputLastMessage,
    appServerSession: runtime?.appServerSession ?? null,
    onProgress
  });
  const execution = {
    ...routed.execution,
    outputLastMessagePath: args.outputLastMessage ?? null
  };
  const artifact = postTaskArtifact(args.dir, decision.activeRun ?? null);
  const persisted = saveWrapperStateIfPossible({
    dir: args.dir,
    state,
    artifact,
    decision: routed.decision,
    execution
  });
  return {
    decision: routed.decision,
    bootstrapState,
    execution,
    artifactBeforeTurn: decision.activeRun ? readRunArtifact({ dir: args.dir, run: decision.activeRun }) : null,
    response: buildTaskAutoResponse({
      decision: routed.decision,
      bootstrapState,
      execution,
      wrapperStatePath: persisted?.path ?? null
    })
  };
}

async function executeTaskAuto(args, runtime = null) {
  const baseDecision = await taskDecisionFromArgs(args);
  return executePreparedTaskDecision(args, baseDecision, runtime);
}

async function runAutoTask(args, runtime = null) {
  return maybeFollowAuto(args, await executeTaskAuto(args, runtime), runtime);
}

async function executeArtifactAuto(args, artifactOverride = null, runtime = null, onProgress = null) {
  const artifact = artifactOverride ?? readRunArtifact({ dir: args.dir, run: args.run });
  const state = loadWrapperState(args.dir);
  const wrapperConfig = loadWrapperConfig(args.dir);
  const policy = resolvePermissionPolicy({
    explicitPermissionProfile: args.permissionProfile,
    explicitApprovalMode: args.approvalMode,
    wrapperConfig
  });
  const decision = decideWrapperAction({ artifact, state, sameSession: true, preferBoundaryAction: true });
  onProgress?.(`continuation run=${artifact.relativeRunPath} | gate=${artifact.currentGate ?? "unknown"} | phase=${artifact.currentPhaseWave ?? "unknown"} | handoff=${decision.handoffAction ?? "launch-task"}`);
  ensureOutputPath(args.outputLastMessage);
  const routed = await executeRoutedDecision({
    dir: args.dir,
    artifact,
    decision,
    policy,
    dryRun: args.dryRun,
    outputLastMessage: args.outputLastMessage,
    appServerSession: runtime?.appServerSession ?? null,
    onProgress
  });
  const execution = {
    ...routed.execution,
    outputLastMessagePath: args.outputLastMessage ?? null
  };
  const nextState = saveWrapperState(args.dir, state, {
    artifact,
    decision: routed.decision,
    execution
  });
  return {
    artifact,
    decision: routed.decision,
    execution,
    response: buildArtifactAutoResponse({
      artifact,
      decision: routed.decision,
      execution,
      wrapperStatePath: nextState.path
    })
  };
}

async function maybeFollowAuto(args, seed, runtime = null, onProgress = null) {
  if (seed.response?.needsDisambiguation) {
    return seed.response;
  }
  const turns = [{
    turn: 1,
    run: seed.artifactBeforeTurn?.relativeRunPath ?? seed.response.activeRun ?? seed.response.run ?? null,
    prompt: seed.decision.prompt,
    adapter: seed.response.adapter ?? null,
    handoffAction: seed.decision.handoffAction,
    nativeThreadAction: seed.decision.nativeThreadAction ?? null,
    sessionStrategy: seed.decision.sessionStrategy,
    threadId: seed.response.threadId ?? null
  }];

  if (!args.follow) {
    return {
      ...seed.response,
      followRequested: false,
      turnsExecuted: 1,
      stoppedBecause: null,
      turns
    };
  }

  if (args.dryRun) {
    return {
      ...seed.response,
      followRequested: true,
      turnsExecuted: 1,
      stoppedBecause: "dry-run",
      turns
    };
  }

  let previousArtifact = seed.artifactBeforeTurn ?? null;
  let lastResponse = seed.response;

  for (let turn = 2; turn <= args.maxTurns; turn += 1) {
    const state = loadWrapperState(args.dir);
    const continuation = resolveAutoContinuation({
      dir: args.dir,
      run: seed.response.run ?? seed.response.activeRun ?? null,
      state
    });

    const stop = classifyAutoFollowStop({
      previousArtifact,
      artifact: continuation.artifact,
      flowState: continuation.flowState,
      decision: continuation.decision ?? {
        handoffAction: null,
        prompt: continuation.artifact?.recommendedNextCommand ?? null
      }
    });

    if (stop.shouldStop) {
      onProgress?.(`follow-stop=${stop.stopReason}`);
      return {
        ...lastResponse,
        followRequested: true,
        turnsExecuted: turns.length,
        stoppedBecause: stop.stopReason,
        turns
      };
    }

    onProgress?.(`follow-turn=${turn}/${args.maxTurns} | nextRun=${continuation.artifact.relativeRunPath} | checkpoint-advanced=true`);
    const continued = await executeArtifactAuto({
      ...args,
      run: continuation.artifact.relativeRunPath
    }, continuation.artifact, runtime, onProgress);
    previousArtifact = continuation.artifact;
    lastResponse = continued.response;
    turns.push({
      turn,
      run: continued.artifact.relativeRunPath,
      prompt: continued.decision.prompt,
      adapter: continued.response.adapter ?? null,
      handoffAction: continued.decision.handoffAction,
      nativeThreadAction: continued.decision.nativeThreadAction ?? null,
      sessionStrategy: continued.decision.sessionStrategy,
      threadId: continued.response.threadId ?? null
    });
  }

  return {
    ...lastResponse,
    followRequested: true,
    turnsExecuted: turns.length,
    stoppedBecause: "max-turns-reached",
    turns
  };
}

function renderShellResponse(response, asJson) {
  if (asJson) {
    return JSON.stringify(response, null, 2);
  }

  const metadata = [
    `route=${response.route ?? "artifact"}`,
    `adapter=${response.adapter ?? "unknown"}`,
    `model=${response.model ?? "default"}`,
    `perm=${response.permissionProfile ?? "safe"}`,
    `approval=${response.approvalPolicy ?? "on-request"}`,
    `turns=${response.turnsExecuted ?? 1}`
  ];
  if (response.stoppedBecause) {
    metadata.push(`stop=${response.stoppedBecause}`);
  }
  if (response.threadId) {
    metadata.push(`thread=${response.threadId}`);
  }
  const lines = [`[wrapper] ${metadata.join(" | ")}`];
  if (response.lastMessage) {
    lines.push(response.lastMessage);
    return lines.join("\n");
  }
  if (response.summary) {
    lines.push(response.summary);
    return lines.join("\n");
  }
  lines.push("(No final assistant message was captured.)");
  return lines.join("\n");
}

function shellCompleter(line) {
  const trimmed = line.trimStart();
  const fragments = trimmed.split(/\s+/);
  const command = fragments[0] ?? "";
  const fragment = fragments[fragments.length - 1] ?? "";
  const commands = ["/help", "/status", "/continue", "/task", "/route", "/perm", "/approval", "/mode", "/follow", "/turns", "/exit", "/quit"];

  if (!trimmed.startsWith("/")) {
    return [[], line];
  }

  if (fragments.length <= 1 && !line.endsWith(" ")) {
    const matches = commands.filter((entry) => entry.startsWith(trimmed || "/"));
    return [matches.length > 0 ? matches : commands, fragment];
  }

  let options = [];
  if (command === "/route") {
    options = ["auto", "flow", "lock", "direct"];
  } else if (command === "/perm") {
    options = permissionProfileNames();
  } else if (command === "/approval") {
    options = approvalModeNames();
  } else if (command === "/mode") {
    options = executionProfileNames();
  } else if (command === "/follow") {
    options = ["on", "off"];
  }
  const matches = options.filter((entry) => entry.startsWith(fragment));
  return [matches.length > 0 ? matches : options, fragment];
}

function resolveShellState({ args, wrapperConfig }) {
  const executionProfile = resolveExecutionProfile({
    wrapperConfig
  });
  const policy = resolvePermissionPolicy({
    explicitPermissionProfile: args.permissionProfile,
    explicitApprovalMode: args.approvalMode,
    wrapperConfig
  });
  return {
    executionProfile,
    follow: args.followExplicit ? args.follow : wrapperConfig.defaults.chat.follow,
    maxTurns: args.maxTurnsExplicit ? args.maxTurns : wrapperConfig.defaults.chat.maxTurns,
    uiRenderer: args.ui ?? wrapperConfig.defaults.chat.uiRenderer,
    routeOverride: args.routeOverride,
    permissionProfile: policy.permissionProfile,
    approvalMode: policy.approvalPolicy
  };
}

function resolveChatUiRenderer({ args, shellState }) {
  const requested = args.ui ?? process.env.QUICK_CODEX_WRAP_UI ?? shellState.uiRenderer ?? "auto";
  if (requested === "plain" || requested === "rich" || requested === "native") {
    return requested;
  }
  return (process.stdin.isTTY && process.stdout.isTTY && !args.json) ? "rich" : "plain";
}

async function runNativeChatShell(args) {
  const wrapperConfig = loadWrapperConfig(args.dir);
  const policy = resolvePermissionPolicy({
    explicitPermissionProfile: args.permissionProfile,
    explicitApprovalMode: args.approvalMode,
    wrapperConfig
  });
  console.log("[wrapper] launching experimental native Codex bridge");
  console.log("[wrapper] note: this keeps the stock Codex TUI and slash commands, but per-message wrapper mediation is not enabled in this first slice.");
  const result = await launchNativeCodexSession({
    dir: args.dir,
    policy,
    prompt: args.task ?? null,
    stdioMode: args.nativeGuardedSlash ? "pty" : "inherit",
    forwardOutput: args.nativeGuardedSlash ? true : null,
    guardedSlashCommand: args.nativeGuardedSlash,
    onProgress: (entry) => console.log(`[wrapper] ${entry}`)
  });
  if (result.status !== 0) {
    throw new Error(`Native Codex bridge exited with status ${result.status}.`);
  }
}

function applyShellCommand({ line, shellState }) {
  const trimmed = line.trim();
  const [command, ...parts] = trimmed.split(/\s+/);
  const value = parts.join(" ").trim();
  if (command === "/task") {
    if (!value) {
      return { handled: true, message: "Usage: /task <text>" };
    }
    return { handled: false, task: value };
  }
  if (command === "/route") {
    if (!value) {
      return { handled: true, message: `routeOverride=${shellState.routeOverride ?? "auto"}` };
    }
    shellState.routeOverride = normalizeRouteOverride(value);
    return { handled: true, message: `routeOverride=${shellState.routeOverride ?? "auto"}` };
  }
  if (command === "/perm") {
    if (!value) {
      return { handled: true, message: `permissionProfile=${shellState.permissionProfile}` };
    }
    const policy = resolvePermissionPolicy({
      explicitPermissionProfile: value,
      explicitApprovalMode: shellState.approvalMode
    });
    shellState.permissionProfile = policy.permissionProfile;
    shellState.approvalMode = policy.approvalPolicy;
    return { handled: true, message: `permissionProfile=${policy.permissionProfile}\napprovalMode=${policy.approvalPolicy}` };
  }
  if (command === "/approval") {
    if (!value) {
      return { handled: true, message: `approvalMode=${shellState.approvalMode}` };
    }
    const policy = resolvePermissionPolicy({
      explicitPermissionProfile: shellState.permissionProfile,
      explicitApprovalMode: value
    });
    shellState.approvalMode = policy.approvalPolicy;
    return { handled: true, message: `approvalMode=${policy.approvalPolicy}` };
  }
  if (command === "/mode") {
    if (!value) {
      return { handled: true, message: `executionProfile=${shellState.executionProfile}` };
    }
    shellState.executionProfile = resolveExecutionProfile({
      explicitExecutionProfile: value
    });
    shellState.follow = shellState.executionProfile === "follow-safe";
    return { handled: true, message: `executionProfile=${shellState.executionProfile}\nfollow=${shellState.follow}` };
  }
  if (command === "/follow") {
    if (!value) {
      return { handled: true, message: `follow=${shellState.follow}` };
    }
    if (!["on", "off"].includes(value)) {
      throw new Error("Unsupported follow mode. Use /follow on or /follow off.");
    }
    shellState.follow = value === "on";
    return { handled: true, message: `follow=${shellState.follow}` };
  }
  if (command === "/turns") {
    if (!value) {
      return { handled: true, message: `maxTurns=${shellState.maxTurns}` };
    }
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1) {
      throw new Error("Unsupported max turn value. Use /turns <positive-integer>.");
    }
    shellState.maxTurns = next;
    return { handled: true, message: `maxTurns=${shellState.maxTurns}` };
  }
  return { handled: false };
}

function buildTaskDecision({
  args,
  task,
  route,
  reason,
  promptSource = "task-router",
  routeSource = "task-router",
  taskRouting = null
}) {
  const projectState = inspectProjectBootstrap({
    dir: args.dir,
    route
  });
  const prompt = compileTaskPrompt({
    route,
    task,
    reason,
    projectState
  });

  return {
    route,
    projectState,
    prompt,
    promptSource,
    routeSource,
    reason,
    taskRouting,
    mode: "fresh-session",
    ...rawTaskOrchestration(),
    summary: [
      `Route: ${route}`,
      `Route source: ${routeSource}`,
      `Reason: ${reason}`,
      `Route override: ${args.routeOverride ?? "auto"}`,
      `Bootstrap: ${projectState.summary}`,
      `Prompt: ${prompt}`
    ].join("\n")
  };
}

function defaultDisambiguationOptions(activeRunPreference = null) {
  const options = [
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
      description: "Treat the task as a tight execution change with explicit verification."
    },
    {
      id: "explain-only",
      label: "Explain or analyze",
      route: "direct",
      description: "Answer directly without opening workflow state unless scope expands."
    }
  ];

  if (activeRunPreference) {
    options.push({
      id: "continue-active-run",
      label: "Continue the active run",
      route: "continue-active-run",
      description: `Resume ${activeRunPreference.activeRun} instead of starting a fresh route.`
    });
  }

  options.push({
    id: "free-text",
    label: "Enter a different task",
    route: "free-text",
    description: "Type a clearer or more specific task if none of the options fit."
  });
  return options;
}

function buildDisambiguationResponse({
  task,
  heuristic,
  taskRouting,
  activeRunPreference
}) {
  const options = taskRouting?.options?.length
    ? taskRouting.options
    : defaultDisambiguationOptions(activeRunPreference);
  return {
    route: null,
    prompt: null,
    promptSource: "needs-disambiguation",
    routeSource: taskRouting?.source ?? "experience-task-router",
    reason: taskRouting?.reason
      ?? "The task is still ambiguous enough that the wrapper should not guess between planning, execution, or explanation yet.",
    needsDisambiguation: true,
    task,
    heuristic,
    taskRouting,
    activeRunPreference,
    options,
    summary: [
      "Task routing requires clarification before the wrapper can pick qc-flow, qc-lock, or direct safely.",
      `Task: ${task}`,
      `Heuristic fallback: ${heuristic.route}`,
      `Reason: ${taskRouting?.reason ?? "No disambiguation rationale was returned."}`,
      "Options:",
      ...options.map((option, index) => `${index + 1}. ${option.label}${option.route ? ` [${option.route}]` : ""} - ${option.description}`),
      "Choose in the interactive shell, or rerun with a clearer task."
    ].join("\n")
  };
}

function buildDisambiguationChoiceDecision({
  args,
  task,
  option,
  activeRunPreference,
  taskRouting
}) {
  if (option.route === "continue-active-run" && activeRunPreference) {
    return {
      ...activeRunPreference,
      routeSource: "disambiguation-user",
      reason: `The user selected "${option.label}", so the wrapper continues the active run ${activeRunPreference.activeRun}.`,
      taskRouting: {
        ...taskRouting,
        userChoice: option.id ?? option.route
      },
      summary: [
        `Route: ${activeRunPreference.route}`,
        "Route source: disambiguation-user",
        `Reason: The user selected "${option.label}".`,
        `Active run: ${activeRunPreference.activeRun}`,
        `Prompt: ${activeRunPreference.prompt}`
      ].join("\n")
    };
  }

  return buildTaskDecision({
    args,
    task,
    route: option.route,
    reason: `The user selected "${option.label}", so the wrapper routes the task explicitly as ${option.route}.`,
    promptSource: "disambiguation-user",
    routeSource: "disambiguation-user",
    taskRouting: {
      ...taskRouting,
      userChoice: option.id ?? option.route
    }
  });
}

function createChatSession(args) {
  const wrapperConfig = loadWrapperConfig(args.dir);
  const shellState = resolveShellState({ args, wrapperConfig });
  const runtime = {
    appServerSession: new CodexAppServerSession({ dir: args.dir })
  };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-"));
  let turnCount = 0;
  let pendingDisambiguation = null;

  return {
    bannerLines: [
      `Dir: ${args.dir}`,
      `Mode: ${shellState.executionProfile} | Follow: ${shellState.follow ? "on" : "off"} | Max turns: ${shellState.maxTurns}`,
      `UI: ${resolveChatUiRenderer({ args, shellState })} | Route override: ${shellState.routeOverride ?? "auto"}`,
      `Permission: ${shellState.permissionProfile} | Approval: ${shellState.approvalMode}`,
      "Type /help for shell commands, /exit to quit."
    ],
    getStatus() {
      return shellStatus({ args, runtime, turnCount, shellState, wrapperConfig });
    },
    async submit(line, onEntry = () => {}) {
      const emit = (entry) => onEntry(entry);
      const trimmed = line.trim();
      if (!trimmed) {
        return { exit: false };
      }
      if (trimmed === "/exit" || trimmed === "/quit") {
        return { exit: true };
      }
      if (trimmed === "/help") {
        emit({ type: "text", text: shellHelpText() });
        return { exit: false };
      }

      if (pendingDisambiguation) {
        if (pendingDisambiguation.awaitingFreeText) {
          pendingDisambiguation.awaitingFreeText = false;
          pendingDisambiguation = null;
        } else if (/^\d+$/.test(trimmed)) {
          const index = Number(trimmed) - 1;
          const option = pendingDisambiguation.options[index];
          if (!option) {
            emit({ type: "text", text: `Choose 1-${pendingDisambiguation.options.length}, or type a clearer task instead.` });
            return { exit: false };
          }
          if (option.route === "free-text") {
            pendingDisambiguation.awaitingFreeText = true;
            emit({ type: "text", text: "Type a clearer task on the next line." });
            return { exit: false };
          }
          const pending = pendingDisambiguation;
          const forcedDecision = buildDisambiguationChoiceDecision({
            args,
            task: pending.task,
            option,
            activeRunPreference: pending.activeRunPreference,
            taskRouting: pending.taskRouting
          });
          pendingDisambiguation = null;
          turnCount += 1;
          const turnArgs = {
            ...args,
            follow: shellState.follow,
            maxTurns: shellState.maxTurns,
            task: pending.task,
            routeOverride: shellState.routeOverride,
            permissionProfile: shellState.permissionProfile,
            approvalMode: shellState.approvalMode,
            outputLastMessage: path.join(tempDir, `turn-${turnCount}.txt`)
          };
          const response = await maybeFollowAuto(
            turnArgs,
            await executePreparedTaskDecision(turnArgs, forcedDecision, runtime, shellProgressLogger(emit)),
            runtime,
            shellProgressLogger(emit)
          );
          emit({ type: "response", response });
          return { exit: false };
        }
        pendingDisambiguation = null;
      }

      const shellCommand = applyShellCommand({ line: trimmed, shellState });
      if (shellCommand.handled) {
        emit({ type: "text", text: shellCommand.message });
        return { exit: false };
      }
      if (trimmed === "/status") {
        const status = shellStatus({ args, runtime, turnCount, shellState, wrapperConfig });
        emit({ type: "status", text: formatShellStatus(status, args.json), data: status });
        return { exit: false };
      }
      if (trimmed === "/continue") {
        const flowState = readFlowState(args.dir);
        const activeRun = flowState?.activeRun && flowState.activeRun !== "none"
          ? flowState.activeRun
          : null;
        if (!activeRun) {
          emit({ type: "text", text: "No active run artifact found. Start a task first or point to a run-file with --run." });
          return { exit: false };
        }
        let artifact;
        try {
          artifact = readRunArtifact({ dir: args.dir, run: activeRun });
        } catch (error) {
          emit({ type: "text", text: `Active run artifact is unreadable: ${error.message}` });
          return { exit: false };
        }
        if (flowState?.status === "done" || artifact.currentGate === "done") {
          emit({ type: "text", text: `Active run is already done (${activeRun}). Start a new task to create the next run.` });
          return { exit: false };
        }
        turnCount += 1;
        const progress = shellProgressLogger(emit);
        progress(`turn=${turnCount} | profile=${shellState.executionProfile} | follow=${shellState.follow ? "on" : "off"} | maxTurns=${shellState.maxTurns}`);
        progress(`continuing activeRun=${artifact.relativeRunPath} | gate=${artifact.currentGate ?? "unknown"} | phase=${artifact.currentPhaseWave ?? "unknown"}`);
        const turnArgs = {
          ...args,
          follow: shellState.follow,
          maxTurns: shellState.maxTurns,
          task: "(continue)",
          routeOverride: shellState.routeOverride,
          permissionProfile: shellState.permissionProfile,
          approvalMode: shellState.approvalMode,
          outputLastMessage: path.join(tempDir, `turn-${turnCount}.txt`)
        };
        const response = await maybeFollowAuto(
          turnArgs,
          await executeArtifactAuto(turnArgs, artifact, runtime, progress),
          runtime,
          progress
        );
        emit({ type: "response", response });
        return { exit: false };
      }

      const taskText = shellCommand.task ?? trimmed;
      const progress = shellProgressLogger(emit);
      progress(`turn=${turnCount + 1} | profile=${shellState.executionProfile} | follow=${shellState.follow ? "on" : "off"} | maxTurns=${shellState.maxTurns}`);
      progress(`analyzing task="${taskText.slice(0, 120)}${taskText.length > 120 ? "..." : ""}"`);
      const decisionProbe = await taskDecisionFromArgs({
        ...args,
        task: taskText,
        routeOverride: shellState.routeOverride
      });
      if (decisionProbe.needsDisambiguation) {
        pendingDisambiguation = {
          ...decisionProbe,
          awaitingFreeText: false
        };
        emit({
          type: "disambiguation",
          text: `${decisionProbe.summary}\nChoose an option number, or type a clearer task directly.`,
          decision: pendingDisambiguation
        });
        return { exit: false };
      }

      turnCount += 1;
      const turnArgs = {
        ...args,
        follow: shellState.follow,
        maxTurns: shellState.maxTurns,
        task: taskText,
        routeOverride: shellState.routeOverride,
        permissionProfile: shellState.permissionProfile,
        approvalMode: shellState.approvalMode,
        outputLastMessage: path.join(tempDir, `turn-${turnCount}.txt`)
      };
      const response = await maybeFollowAuto(
        turnArgs,
        await executePreparedTaskDecision(turnArgs, decisionProbe, runtime, progress),
        runtime,
        progress
      );
      emit({ type: "response", response });
      return { exit: false };
    },
    async close() {
      await runtime.appServerSession.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

function renderPlainShellEntry(entry, asJson) {
  if (entry.type === "progress") {
    console.log(`[wrapper] ${entry.text}`);
    return;
  }
  if (entry.type === "response") {
    console.log(renderShellResponse(entry.response, asJson));
    return;
  }
  console.log(entry.text);
}

async function runPlainChatShell(args, session) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: shellCompleter,
    terminal: process.stdin.isTTY ?? true
  });

  console.log("Quick Codex interactive shell");
  session.bannerLines.forEach((line) => console.log(line));

  try {
    if (rl.terminal) {
      process.stdout.write("codex> ");
    }
    for await (const line of rl) {
      try {
        const result = await session.submit(line, (entry) => renderPlainShellEntry(entry, args.json));
        if (result.exit) {
          break;
        }
      } catch (error) {
        console.error(error.message);
      }
      if (rl.terminal) {
        process.stdout.write("codex> ");
      }
    }
  } finally {
    rl.close();
    await session.close();
  }
}

async function runChatShell(args) {
  const renderer = resolveChatUiRenderer({
    args,
    shellState: {
      uiRenderer: args.ui ?? loadWrapperConfig(args.dir).defaults.chat.uiRenderer
    }
  });

  if (renderer === "native") {
    await runNativeChatShell(args);
    return;
  }

  const session = createChatSession(args);
  if (renderer === "rich") {
    try {
      const { runRichChatRenderer } = await import("../lib/wrapper/rich-chat.js");
      await runRichChatRenderer({
        session,
        bannerLines: session.bannerLines
      });
      return;
    } catch (error) {
      console.warn(`[wrapper] rich-ui fallback: ${error.message}`);
    }
  }

  await runPlainChatShell(args, session);
}

async function taskDecisionFromArgs(args) {
  if (args.routeOverride) {
    return buildTaskDecision({
      args,
      task: args.task,
      route: args.routeOverride,
      reason: `The user forced ${args.routeOverride} with a manual route override, so the wrapper bypasses brain and heuristic routing for this task.`,
      promptSource: "manual-route-override",
      routeSource: "manual-route-override",
      taskRouting: {
        enabled: false,
        applied: true,
        skippedReason: "A manual route override bypassed Experience Engine and heuristic routing."
      }
    });
  }
  const heuristic = routeTask({ task: args.task });
  const wrapperState = loadWrapperState(args.dir);
  const activeRun = readActiveRunArtifact(args.dir);
  const activeRunPreference = inspectActiveRunPreference({
    dir: args.dir,
    task: args.task,
    initialRoute: heuristic.route,
    wrapperState
  });
  const taskRouting = await resolveExperienceTaskRoute({
    dir: args.dir,
    task: args.task,
    localRoute: heuristic,
    activeArtifact: activeRun?.artifact ?? null,
    activeRunPreference
  });

  if (taskRouting.applied && taskRouting.needsDisambiguation) {
    return buildDisambiguationResponse({
      task: args.task,
      heuristic,
      taskRouting,
      activeRunPreference
    });
  }

  if (taskRouting.applied && taskRouting.route === "continue-active-run" && activeRunPreference) {
    return {
      ...activeRunPreference,
      routeSource: taskRouting.source ?? "experience-task-router",
      reason: taskRouting.reason
        ?? `Experience Engine task routing selected the active run ${activeRunPreference.activeRun} instead of a fresh route.`,
      taskRouting
    };
  }

  if (taskRouting.applied && taskRouting.route) {
    return buildTaskDecision({
      args,
      task: args.task,
      route: taskRouting.route,
      reason: taskRouting.reason
        ?? `Experience Engine task routing selected ${taskRouting.route}.`,
      promptSource: "experience-task-router",
      routeSource: taskRouting.source ?? "experience-task-router",
      taskRouting
    });
  }

  if (activeRunPreference) {
    return {
      ...activeRunPreference,
      routeSource: taskRouting.enabled ? "active-run-fallback" : "active-run",
      taskRouting
    };
  }

  return buildTaskDecision({
    args,
    task: args.task,
    route: heuristic.route,
    reason: heuristic.reason,
    promptSource: "task-router",
    routeSource: taskRouting.enabled ? "heuristic-fallback" : "task-router",
    taskRouting
  });
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
    return;
  }

  if (args.command === "help") {
    usage();
    return;
  }

  if (args.command === "prompt") {
    const decision = await taskDecisionFromArgs(args);
    print(decision, args.json);
    return;
  }

  if (args.command === "run") {
    const baseDecision = await taskDecisionFromArgs(args);
    if (baseDecision.needsDisambiguation) {
      print(baseDecision, args.json);
      return;
    }
    const bootstrapState = ensureProjectBootstrap({
      dir: args.dir,
      route: baseDecision.route,
      dryRun: args.dryRun
    });
    const prompt = baseDecision.promptSource === "active-run"
      ? baseDecision.prompt
      : compileTaskPrompt({
          route: baseDecision.route,
          task: args.task,
          reason: baseDecision.reason,
          projectState: bootstrapState
        });
    const decision = {
      ...baseDecision,
      projectState: bootstrapState,
      prompt
    };
    ensureOutputPath(args.outputLastMessage);
    const wrapperConfig = loadWrapperConfig(args.dir);
    const policy = resolvePermissionPolicy({
      explicitPermissionProfile: args.permissionProfile,
      explicitApprovalMode: args.approvalMode,
      wrapperConfig
    });
    const routed = await executeRoutedDecision({
      dir: args.dir,
      task: args.task,
      decision,
      policy,
      dryRun: args.dryRun,
      outputLastMessage: args.outputLastMessage
    });
    const execution = routed.execution;
    const response = {
      ...execution,
      route: routed.decision.route,
      routeSource: routed.decision.routeSource ?? null,
      model: routed.decision.model ?? null,
      modelRouting: routed.decision.modelRoute ?? null,
      taskRouting: routed.decision.taskRouting ?? null,
      routeFeedback: execution.routeFeedback ?? null,
      permissionProfile: routed.decision.policy?.permissionProfile ?? execution.permissionProfile ?? null,
      approvalPolicy: routed.decision.policy?.approvalPolicy ?? execution.approvalPolicy ?? null,
      sandboxMode: routed.decision.policy?.sandboxMode ?? execution.sandboxMode ?? null,
      bypassApprovalsAndSandbox: routed.decision.policy?.bypassApprovalsAndSandbox ?? execution.bypassApprovalsAndSandbox ?? false,
      activeRun: routed.decision.activeRun ?? null,
      bootstrap: {
        required: bootstrapState.bootstrapRequired,
        planned: bootstrapState.bootstrapPlanned,
        performed: bootstrapState.bootstrapPerformed,
        scaffoldPresent: bootstrapState.scaffoldPresent,
        summary: bootstrapState.summary
      },
      promptSource: routed.decision.promptSource,
      prompt: routed.decision.prompt,
      reason: routed.decision.reason,
      sessionStrategy: routed.decision.sessionStrategy,
      handoffAction: routed.decision.handoffAction,
      nativeThreadAction: routed.decision.nativeThreadAction,
      chatActionEquivalent: routed.decision.chatActionEquivalent,
      wrapperCommandEquivalent: routed.decision.wrapperCommandEquivalent,
      summary: [
        `Route: ${routed.decision.route}`,
        `Model: ${routed.decision.model ?? "default codex profile"}`,
        `Permission profile: ${routed.decision.policy?.permissionProfile ?? "safe"}`,
        `Approval policy: ${routed.decision.policy?.approvalPolicy ?? "on-request"}`,
        `Bootstrap: ${bootstrapState.summary}`,
        `Codex command: ${execution.command.join(" ")}`,
        `Prompt source: ${routed.decision.promptSource}`,
        `Prompt preview: ${routed.decision.prompt}`
      ].join("\n")
    };
    print(response, args.json);
    return;
  }

  if (args.command === "chat") {
    await runChatShell({
      ...args,
      dryRun: false
    });
    return;
  }

  if (args.command === "auto") {
    const runtime = {
      appServerSession: args.follow ? new CodexAppServerSession({ dir: args.dir }) : null
    };
    try {
      if (args.task) {
        const response = await runAutoTask(args, runtime);
        print(response, args.json);
        return;
      }

      const execution = await executeArtifactAuto(args, null, runtime);
      const response = await maybeFollowAuto(args, {
        artifactBeforeTurn: execution.artifact,
        decision: execution.decision,
        response: execution.response
      }, runtime);
      print(response, args.json);
      return;
    } finally {
      await runtime.appServerSession?.close();
    }
  }

  const artifact = readRunArtifact({ dir: args.dir, run: args.run });
  const state = loadWrapperState(args.dir);
  const wrapperConfig = loadWrapperConfig(args.dir);
  const policy = resolvePermissionPolicy({
    explicitPermissionProfile: args.permissionProfile,
    explicitApprovalMode: args.approvalMode,
    wrapperConfig
  });
  const decision = decideWrapperAction({ artifact, state, sameSession: args.sameSession });

  switch (args.command) {
    case "decide": {
      print(decision, args.json);
      return;
    }
    case "checkpoint": {
      const checkpoint = buildCheckpointSummary({ artifact, decision, state });
      print(checkpoint, args.json);
      return;
    }
    case "start":
    case "continue": {
      ensureOutputPath(args.outputLastMessage);
      const routed = await executeRoutedDecision({
        dir: args.dir,
        artifact,
        decision,
        policy,
        dryRun: args.dryRun,
        outputLastMessage: args.outputLastMessage,
        preferredMode: args.command === "start" ? "fresh" : null
      });
      const execution = routed.execution;
      const nextState = saveWrapperState(args.dir, state, {
        artifact,
        decision: routed.decision,
        execution
      });
      const response = {
        ...execution,
        run: artifact.relativeRunPath,
        routeSource: routed.decision.routeSource ?? null,
        model: routed.decision.model ?? null,
        modelRouting: routed.decision.modelRoute ?? null,
        routeFeedback: execution.routeFeedback ?? null,
        permissionProfile: routed.decision.policy?.permissionProfile ?? execution.permissionProfile ?? null,
        approvalPolicy: routed.decision.policy?.approvalPolicy ?? execution.approvalPolicy ?? null,
        sandboxMode: routed.decision.policy?.sandboxMode ?? execution.sandboxMode ?? null,
        bypassApprovalsAndSandbox: routed.decision.policy?.bypassApprovalsAndSandbox ?? execution.bypassApprovalsAndSandbox ?? false,
        decision: routed.decision.mode,
        wrapperStatePath: nextState.path,
        sessionStrategy: routed.decision.sessionStrategy,
        handoffAction: routed.decision.handoffAction,
        nativeThreadAction: routed.decision.nativeThreadAction,
        chatActionEquivalent: routed.decision.chatActionEquivalent,
        wrapperCommandEquivalent: routed.decision.wrapperCommandEquivalent,
        summary: [
          `Run: ${artifact.relativeRunPath}`,
          `Model: ${routed.decision.model ?? "default codex profile"}`,
          `Permission profile: ${routed.decision.policy?.permissionProfile ?? "safe"}`,
          `Approval policy: ${routed.decision.policy?.approvalPolicy ?? "on-request"}`,
          `Decision: ${routed.decision.mode}`,
          `Codex command: ${execution.command.join(" ")}`,
          `Prompt source: ${routed.decision.promptSource}`,
          `Prompt preview: ${routed.decision.prompt}`
        ].join("\n")
      };
      print(response, args.json);
      return;
    }
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
