#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wrapBin = process.env.QUICK_CODEX_WRAP_BIN || path.join(__dirname, "quick-codex-wrap.js");

const QC_COMMAND_FLAGS = new Map([
  ["--qc-chat", "chat"],
  ["--qc-prompt", "prompt"],
  ["--qc-run", "run"],
  ["--qc-auto", "auto"],
  ["--qc-decide", "decide"],
  ["--qc-checkpoint", "checkpoint"],
  ["--qc-start", "start"],
  ["--qc-continue", "continue"]
]);

const QC_OPTION_ALIASES = new Map([
  ["--qc-task", { target: "--task", takesValue: true }],
  ["--qc-dir", { target: "--dir", takesValue: true }],
  ["--qc-run-file", { target: "--run", takesValue: true }],
  ["--qc-output-last-message", { target: "--output-last-message", takesValue: true }],
  ["--qc-max-turns", { target: "--max-turns", takesValue: true }],
  ["--qc-approval", { target: "--approval-mode", takesValue: true }],
  ["--qc-ui", { target: "--ui", takesValue: true }],
  ["--qc-follow", { target: "--follow", takesValue: false }],
  ["--qc-json", { target: "--json", takesValue: false }],
  ["--qc-dry-run", { target: "--dry-run", takesValue: false }],
  ["--qc-same-session", { target: "--same-session", takesValue: false }]
]);

const QC_PROFILE_FLAGS = new Map([
  ["--qc-fast", "fast"],
  ["--qc-safe", "safe"],
  ["--qc-follow-safe", "follow-safe"]
]);

const QC_ROUTE_OVERRIDE_FLAGS = new Map([
  ["--qc-force-flow", "qc-flow"],
  ["--qc-force-lock", "qc-lock"],
  ["--qc-force-direct", "direct"]
]);

const QC_PERMISSION_FLAGS = new Map([
  ["--qc-safe", "safe"],
  ["--qc-full", "full"],
  ["--qc-yolo", "yolo"],
  ["--qc-readonly", "readonly"]
]);

const QC_APPROVAL_FLAGS = new Map([
  ["--qc-manual", "manual"],
  ["--qc-autonomous", "autonomous"],
  ["--qc-untrusted", "untrusted"]
]);

const CODEX_SUBCOMMANDS = new Set([
  "exec",
  "review",
  "login",
  "logout",
  "mcp",
  "marketplace",
  "mcp-server",
  "app-server",
  "completion",
  "sandbox",
  "debug",
  "apply",
  "resume",
  "fork",
  "cloud",
  "exec-server",
  "features",
  "help"
]);

function qcHelpText() {
  return `Quick Codex shim help

Commands:
  codex --qc-chat
  codex --qc-prompt
  codex --qc-run
  codex --qc-auto
  codex --qc-decide
  codex --qc-checkpoint
  codex --qc-start
  codex --qc-continue

Profiles:
  --qc-fast
  Default: run for task input, start for run-file input, no follow loop

  --qc-safe
  Default: auto, one-turn continuity without follow, permission profile = safe

  --qc-follow-safe
  Default: auto --follow --max-turns 5

Permission profiles:
  --qc-safe
  workspace-write + on-request approvals

  --qc-full
  danger-full-access + never approvals

  --qc-yolo
  bypass approvals and sandbox

  --qc-readonly
  read-only + on-request approvals

Approval overrides:
  --qc-manual
  Maps to approval mode: on-request

  --qc-autonomous
  Maps to approval mode: never

  --qc-untrusted
  Maps to approval mode: untrusted

Default launch behavior:
  codex "<task>"
  Treats the plain prompt as wrapper input and routes it through the default follow-safe profile

  codex
  Launches the interactive thin-wrapper shell so each submitted message is routed before it reaches Codex

  codex --qc-full --qc-task "<task>"
  Any qc-only overlay or alias flag without an explicit qc mode now defaults to wrapper auto mode when a task or run-file is present, or wrapper chat when no task is provided

Manual route overrides:
  --qc-force-flow
  Force wrapper task routing to qc-flow, bypassing both brain and heuristic routing

  --qc-force-lock
  Force wrapper task routing to qc-lock, bypassing both brain and heuristic routing

  --qc-force-direct
  Force wrapper task routing to direct, bypassing both brain and heuristic routing

Escape hatch:
  codex --qc-bypass ...
  Sends the full invocation straight to the real Codex binary

Alias options:
  --qc-task <text>
  Maps to: --task

  --qc-dir <path>
  Maps to: --dir

  --qc-run-file <path>
  Maps to: --run

  --qc-follow
  Maps to: --follow

  --qc-approval <mode>
  Maps to: --approval-mode

  --qc-ui <auto|plain|rich>
  Maps to: --ui

  --qc-max-turns <n>
  Maps to: --max-turns

  --qc-json
  Maps to: --json

  --qc-dry-run
  Maps to: --dry-run

  --qc-same-session
  Maps to: --same-session

  --qc-output-last-message <path>
  Maps to: --output-last-message

Examples:
  codex --qc-help
  codex
  codex "fix the wrapper follow loop"
  codex --qc-chat --qc-dir /path/to/project
  codex --qc-fast --qc-task "fix a narrow bug" --qc-json
  codex --qc-safe --qc-task "continue the active wrapper work" --qc-json
  codex --qc-full --qc-autonomous --qc-task "run end-to-end in this repo" --qc-json
  codex --qc-readonly --qc-manual --qc-task "inspect and explain this repo" --qc-json
  codex --qc-auto --qc-task "continue the active wrapper work" --qc-json
  codex --qc-follow-safe --qc-dir /path/to/project --qc-run-file .quick-codex-flow/sample.md --qc-json
  codex --qc-force-flow --qc-task "research the repo and plan the work" --qc-json
  codex --qc-force-direct --qc-task "explain the wrapper architecture" --qc-json
  codex --qc-auto --qc-dir /path/to/project --qc-run-file .quick-codex-flow/sample.md --qc-follow --qc-max-turns 3 --qc-json
`;
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveRealCodexBin() {
  if (process.env.QUICK_CODEX_REAL_CODEX_BIN) {
    return process.env.QUICK_CODEX_REAL_CODEX_BIN;
  }

  const currentScript = fs.realpathSync(__filename);
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, "codex");
    if (!fs.existsSync(candidate) || !isExecutable(candidate)) {
      continue;
    }
    const resolved = fs.realpathSync(candidate);
    if (resolved !== currentScript) {
      return candidate;
    }
  }
  throw new Error("Could not resolve the real codex binary. Set QUICK_CODEX_REAL_CODEX_BIN first.");
}

function inspectWrapperArgs(args) {
  return {
    hasTask: args.includes("--task"),
    hasRun: args.includes("--run"),
    hasFollow: args.includes("--follow"),
    hasMaxTurns: args.includes("--max-turns")
  };
}

function isOptionToken(value) {
  return typeof value === "string" && value.startsWith("-");
}

function looksLikePlainPrompt(argv) {
  if (argv.length === 0) {
    return false;
  }
  const first = argv[0];
  if (isOptionToken(first) || CODEX_SUBCOMMANDS.has(first)) {
    return false;
  }
  return true;
}

function defaultCommandForProfile(profile, args) {
  if (profile === "fast") {
    if (args.hasTask) {
      return "run";
    }
    if (args.hasRun) {
      return "start";
    }
  }
  return "auto";
}

function applyProfilePreset(profile, passthrough) {
  const nextArgs = [...passthrough];
  const inspected = inspectWrapperArgs(nextArgs);
  if (profile === "follow-safe") {
    if (!inspected.hasFollow) {
      nextArgs.push("--follow");
    }
    if (!inspected.hasMaxTurns) {
      nextArgs.push("--max-turns", "5");
    }
  }
  return nextArgs;
}

function splitShimArgs(argv) {
  let command = null;
  let profile = null;
  let routeOverride = null;
  let permissionProfile = null;
  let approvalMode = null;
  let help = false;
  let bypass = false;
  let qcSurfaceUsed = false;
  const passthrough = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--qc-help") {
      help = true;
      continue;
    }
    if (arg === "--qc-bypass" || arg === "--qc-plain") {
      bypass = true;
      continue;
    }
    if (QC_COMMAND_FLAGS.has(arg)) {
      qcSurfaceUsed = true;
      if (command) {
        throw new Error(`Only one --qc-* mode flag is allowed at a time. Received both ${command} and ${arg}.`);
      }
      command = QC_COMMAND_FLAGS.get(arg);
      continue;
    }

    if (QC_PROFILE_FLAGS.has(arg)) {
      qcSurfaceUsed = true;
      if (profile) {
        throw new Error(`Only one qc profile preset is allowed at a time. Received both ${profile} and ${arg}.`);
      }
      profile = QC_PROFILE_FLAGS.get(arg);
      permissionProfile ??= QC_PERMISSION_FLAGS.get(arg) ?? null;
      continue;
    }

    if (QC_ROUTE_OVERRIDE_FLAGS.has(arg)) {
      qcSurfaceUsed = true;
      if (routeOverride && routeOverride !== QC_ROUTE_OVERRIDE_FLAGS.get(arg)) {
        throw new Error(`Only one qc route override is allowed at a time. Received both ${routeOverride} and ${arg}.`);
      }
      routeOverride = QC_ROUTE_OVERRIDE_FLAGS.get(arg);
      continue;
    }

    if (QC_PERMISSION_FLAGS.has(arg)) {
      qcSurfaceUsed = true;
      if (permissionProfile && permissionProfile !== QC_PERMISSION_FLAGS.get(arg)) {
        throw new Error(`Only one qc permission profile is allowed at a time. Received both ${permissionProfile} and ${arg}.`);
      }
      permissionProfile = QC_PERMISSION_FLAGS.get(arg);
      continue;
    }

    if (QC_APPROVAL_FLAGS.has(arg)) {
      qcSurfaceUsed = true;
      if (approvalMode && approvalMode !== QC_APPROVAL_FLAGS.get(arg)) {
        throw new Error(`Only one qc approval override is allowed at a time. Received both ${approvalMode} and ${arg}.`);
      }
      approvalMode = QC_APPROVAL_FLAGS.get(arg);
      continue;
    }

    if (QC_OPTION_ALIASES.has(arg)) {
      qcSurfaceUsed = true;
      const alias = QC_OPTION_ALIASES.get(arg);
      passthrough.push(alias.target);
      if (alias.takesValue) {
        index += 1;
        if (index >= argv.length) {
          throw new Error(`${arg} requires a value.`);
        }
        passthrough.push(argv[index]);
      }
      continue;
    }

    passthrough.push(arg);
  }
  if (!help && !bypass && !command && !profile && looksLikePlainPrompt(passthrough)) {
    profile = "follow-safe";
    permissionProfile ??= "safe";
    passthrough.unshift("--task");
  }
  const profilePassthrough = profile ? applyProfilePreset(profile, passthrough) : passthrough;
  if (permissionProfile) {
    profilePassthrough.push("--permission-profile", permissionProfile);
  }
  if (routeOverride) {
    profilePassthrough.push("--route-override", routeOverride);
  }
  if (approvalMode) {
    profilePassthrough.push("--approval-mode", approvalMode);
  }
  const inspected = inspectWrapperArgs(profilePassthrough);
  const resolvedCommand = command
    ?? (profile ? defaultCommandForProfile(profile, inspected) : null)
    ?? (qcSurfaceUsed
      ? (inspected.hasTask || inspected.hasRun ? "auto" : "chat")
      : null);
  return {
    command: resolvedCommand,
    bypass,
    help,
    profile,
    routeOverride,
    passthrough: profilePassthrough
  };
}

function runProcess(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env
  });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

function main() {
  const originalArgs = process.argv.slice(2);
  const { command, bypass, help, passthrough } = splitShimArgs(originalArgs);

  if (help) {
    process.stdout.write(qcHelpText());
    return;
  }

  if (bypass) {
    runProcess(resolveRealCodexBin(), passthrough);
    return;
  }

  if (!command) {
    if (originalArgs.length === 0) {
      runProcess(process.execPath, [wrapBin, "chat"]);
      return;
    }
    runProcess(resolveRealCodexBin(), passthrough);
    return;
  }

  runProcess(process.execPath, [wrapBin, command, ...passthrough]);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
