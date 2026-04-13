#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
const PACKAGE_NAME = PACKAGE_JSON.name;
const PACKAGE_VERSION = PACKAGE_JSON.version;
const SKILLS = ["qc-flow", "qc-lock"];
const LEGACY_SKILLS = ["codex-gsd-flow", "codex-locked-loop"];
const DEFAULT_TARGET = path.join(os.homedir(), ".codex", "skills");
const FLOW_DIRNAME = ".quick-codex-flow";
const UPDATE_CACHE_PATH = path.join(os.homedir(), ".quick-codex", "update-check.json");
const UPDATE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 1500;

function usage() {
  console.log(`Usage:
  quick-codex install [--copy] [--target <dir>]
  quick-codex doctor [--target <dir>]
  quick-codex init [--dir <project-dir>] [--force]
  quick-codex status [--dir <project-dir>] [--run <path>]
  quick-codex resume [--dir <project-dir>] [--run <path>]
  quick-codex doctor-run [--dir <project-dir>] [--run <path>]
  quick-codex upgrade [--copy] [--target <dir>]
  quick-codex uninstall [--target <dir>] [--dir <project-dir>]
  quick-codex --help

Commands:
  install    Install qc-flow and qc-lock into ~/.codex/skills
  doctor     Check package shape, skill files, local install, and lint status
  init       Scaffold AGENTS.md guidance, .quick-codex-flow/, and a sample run artifact
  status     Show the current active run, gate, risks, and next command
  resume     Print the exact next prompt(s) to resume the active run safely
  doctor-run Validate a run artifact and its STATE.md handoff
  upgrade    Reinstall the skills into the target directory
  uninstall  Remove installed skills and optionally remove project scaffolds when --dir is provided
`);
}

function parseArgs(argv) {
  const result = {
    command: null,
    copy: false,
    force: false,
    target: DEFAULT_TARGET,
    dir: process.cwd(),
    dirExplicit: false,
    run: null
  };

  if (argv.length === 0 || ["-h", "--help", "help"].includes(argv[0])) {
    return { ...result, command: "help" };
  }

  result.command = argv[0];
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--copy") {
      result.copy = true;
      continue;
    }
    if (arg === "--force") {
      result.force = true;
      continue;
    }
    if (arg === "--target") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--target requires a directory");
      }
      result.target = path.resolve(argv[i]);
      continue;
    }
    if (arg === "--dir") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--dir requires a directory");
      }
      result.dir = path.resolve(argv[i]);
      result.dirExplicit = true;
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
    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function copyDir(source, dest) {
  fs.cpSync(source, dest, { recursive: true });
}

function installOne(skillName, targetDir, copyMode) {
  const sourceDir = path.join(ROOT_DIR, skillName);
  const destDir = path.join(targetDir, skillName);
  removeIfExists(destDir);
  if (copyMode) {
    copyDir(sourceDir, destDir);
  } else {
    fs.symlinkSync(sourceDir, destDir, "dir");
  }
}

function installCommand({ copy, target }) {
  ensureDir(target);
  for (const legacySkill of LEGACY_SKILLS) {
    removeIfExists(path.join(target, legacySkill));
  }
  for (const skillName of SKILLS) {
    installOne(skillName, target, copy);
  }
  console.log(`Installed ${SKILLS.join(", ")} to ${target} using ${copy ? "copy" : "symlink"} mode.`);
  console.log(`Removed legacy skill names if present: ${LEGACY_SKILLS.join(", ")}.`);
  console.log("Restart Codex to reload the skills.");
}

function removeProjectScaffold(dir) {
  const removed = [];
  const kept = [];
  const flowDir = path.join(dir, FLOW_DIRNAME);
  const snippetPath = path.join(dir, "AGENTS.quick-codex-snippet.md");
  const agentsPath = path.join(dir, "AGENTS.md");
  const snippetTemplatePath = path.join(ROOT_DIR, "templates", "AGENTS.snippet.md");
  const snippetTemplate = fs.readFileSync(snippetTemplatePath, "utf8");

  if (fs.existsSync(flowDir)) {
    removeIfExists(flowDir);
    removed.push(relPathFrom(dir, flowDir));
  }

  if (fs.existsSync(snippetPath)) {
    removeIfExists(snippetPath);
    removed.push(relPathFrom(dir, snippetPath));
  }

  if (fs.existsSync(agentsPath)) {
    const agentsContent = fs.readFileSync(agentsPath, "utf8");
    if (agentsContent === snippetTemplate) {
      removeIfExists(agentsPath);
      removed.push(relPathFrom(dir, agentsPath));
    } else {
      kept.push(relPathFrom(dir, agentsPath));
    }
  }

  return { removed, kept };
}

function uninstallCommand({ target, dir, dirExplicit }) {
  let removed = 0;
  for (const skillName of [...SKILLS, ...LEGACY_SKILLS]) {
    const destDir = path.join(target, skillName);
    if (fs.existsSync(destDir)) {
      removeIfExists(destDir);
      removed += 1;
    }
  }
  console.log(`Removed ${removed} skill install(s) from ${target}.`);

  if (dirExplicit) {
    const projectResult = removeProjectScaffold(dir);
    if (projectResult.removed.length > 0) {
      console.log(`Removed project scaffold from ${dir}:`);
      for (const item of projectResult.removed) {
        console.log(`- ${item}`);
      }
    } else {
      console.log(`No quick-codex project scaffold found under ${dir}.`);
    }
    if (projectResult.kept.length > 0) {
      console.log("Kept project files that may include manual edits:");
      for (const item of projectResult.kept) {
        console.log(`- ${item}`);
      }
    }
  }
}

function runLint() {
  return spawnSync("bash", [path.join("scripts", "lint-skills.sh")], {
    cwd: ROOT_DIR,
    encoding: "utf8"
  });
}

function checkSkillDir(baseDir, skillName) {
  const skillDir = path.join(baseDir, skillName);
  return {
    skillName,
    exists: fs.existsSync(skillDir),
    skillMd: fs.existsSync(path.join(skillDir, "SKILL.md")),
    openaiYaml: fs.existsSync(path.join(skillDir, "agents", "openai.yaml"))
  };
}

function doctorCommand({ target }) {
  console.log(`Package root: ${ROOT_DIR}`);
  console.log(`Install target: ${target}`);

  let hasFailure = false;

  for (const skillName of SKILLS) {
    const packageCheck = checkSkillDir(ROOT_DIR, skillName);
    console.log(`package:${skillName} exists=${packageCheck.exists} skill_md=${packageCheck.skillMd} openai_yaml=${packageCheck.openaiYaml}`);
    if (!packageCheck.exists || !packageCheck.skillMd || !packageCheck.openaiYaml) {
      hasFailure = true;
    }
  }

  for (const skillName of SKILLS) {
    const installCheck = checkSkillDir(target, skillName);
    console.log(`install:${skillName} exists=${installCheck.exists} skill_md=${installCheck.skillMd} openai_yaml=${installCheck.openaiYaml}`);
    if (!installCheck.exists || !installCheck.skillMd || !installCheck.openaiYaml) {
      hasFailure = true;
    }
  }

  for (const legacySkill of LEGACY_SKILLS) {
    const legacyPath = path.join(target, legacySkill);
    console.log(`install_legacy:${legacySkill} exists=${fs.existsSync(legacyPath)}`);
  }

  const lintResult = runLint();
  process.stdout.write(lintResult.stdout ?? "");
  process.stderr.write(lintResult.stderr ?? "");
  if (lintResult.status !== 0) {
    hasFailure = true;
  }

  if (hasFailure) {
    throw new Error("doctor found one or more issues");
  }

  console.log("Doctor passed.");
}

function writeFileIfMissing(targetPath, content) {
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, content, "utf8");
    return "created";
  }
  return "kept";
}

function initCommand({ dir, force }) {
  ensureDir(dir);
  const agentsPath = path.join(dir, "AGENTS.md");
  const snippetPath = path.join(ROOT_DIR, "templates", "AGENTS.snippet.md");
  const snippet = fs.readFileSync(snippetPath, "utf8");

  let agentsResult = "kept";
  if (!fs.existsSync(agentsPath) || force) {
    fs.writeFileSync(agentsPath, snippet, "utf8");
    agentsResult = fs.existsSync(agentsPath) ? "created" : "kept";
  } else {
    const mergePath = path.join(dir, "AGENTS.quick-codex-snippet.md");
    fs.writeFileSync(mergePath, snippet, "utf8");
    agentsResult = `kept existing AGENTS.md, wrote ${path.basename(mergePath)} instead`;
  }

  const flowDir = path.join(dir, ".quick-codex-flow");
  ensureDir(flowDir);
  const flowReadme = path.join(ROOT_DIR, "templates", ".quick-codex-flow", "README.md");
  const sampleRun = path.join(ROOT_DIR, "templates", ".quick-codex-flow", "sample-run.md");
  const stateTemplate = path.join(ROOT_DIR, "templates", ".quick-codex-flow", "STATE.md");

  const readmeResult = writeFileIfMissing(path.join(flowDir, "README.md"), fs.readFileSync(flowReadme, "utf8"));
  const sampleResult = writeFileIfMissing(path.join(flowDir, "sample-run.md"), fs.readFileSync(sampleRun, "utf8"));
  const stateResult = writeFileIfMissing(path.join(flowDir, "STATE.md"), fs.readFileSync(stateTemplate, "utf8"));

  console.log(`AGENTS scaffold: ${agentsResult}`);
  console.log(`.quick-codex-flow/README.md: ${readmeResult}`);
  console.log(`.quick-codex-flow/sample-run.md: ${sampleResult}`);
  console.log(`.quick-codex-flow/STATE.md: ${stateResult}`);
  console.log("");
  console.log("Recommended prompts:");
  console.log('1. Use $qc-flow for this task: <describe the non-trivial task>.');
  console.log('2. Use $qc-flow and resume from .quick-codex-flow/<run-file>.md.');
  console.log('3. Use $qc-lock for this task: execute <phase/wave> from .quick-codex-flow/<run-file>.md.');
  console.log("");
  console.log("Helpful commands:");
  console.log(`- node bin/quick-codex.js status --dir ${dir}`);
  console.log(`- node bin/quick-codex.js resume --dir ${dir}`);
  console.log(`- node bin/quick-codex.js doctor-run --dir ${dir}`);
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function stripBullet(value) {
  return value.replace(/^[-*]\s*/, "").trim();
}

function findLabelValue(text, label) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(`${label}:`)) {
      const sameLine = trimmed.slice(`${label}:`.length).trim();
      if (sameLine.length > 0) {
        return stripBullet(sameLine);
      }
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j].trim();
        if (next.length === 0) {
          continue;
        }
        if (next.startsWith("## ")) {
          return null;
        }
        return stripBullet(next);
      }
    }
  }
  return null;
}

function findResumeDigestField(text, label) {
  const regex = new RegExp(`^- ${label}:\\s*(.+)$`, "m");
  return text.match(regex)?.[1]?.trim() ?? null;
}

function findHeadingValue(text, heading) {
  const lines = text.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  let active = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === headingLine) {
      active = true;
      continue;
    }
    if (active && line.startsWith("## ")) {
      break;
    }
    if (!active || line.length === 0) {
      continue;
    }
    return stripBullet(line);
  }

  return null;
}

function findLabelValueInSection(text, heading, label) {
  const lines = text.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  let active = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed === headingLine) {
      active = true;
      continue;
    }
    if (active && trimmed.startsWith("## ")) {
      break;
    }
    if (!active) {
      continue;
    }
    if (trimmed.startsWith(`${label}:`)) {
      const sameLine = trimmed.slice(`${label}:`.length).trim();
      return sameLine.length > 0 ? stripBullet(sameLine) : null;
    }
  }

  return null;
}

function findSectionBullets(text, heading) {
  const lines = text.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  const values = [];
  let active = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === headingLine) {
      active = true;
      continue;
    }
    if (active && line.startsWith("## ")) {
      break;
    }
    if (active && line.trim().startsWith("- ")) {
      values.push(stripBullet(line.trim()));
    }
  }

  return values;
}

function relPathFrom(baseDir, targetPath) {
  return path.relative(baseDir, targetPath) || ".";
}

function flowDirFor(projectDir) {
  return path.join(projectDir, FLOW_DIRNAME);
}

function stateFileFor(projectDir) {
  return path.join(flowDirFor(projectDir), "STATE.md");
}

function runMetadata(runPath) {
  const text = readTextIfExists(runPath);
  if (text === null) {
    throw new Error(`Run file not found: ${runPath}`);
  }

  return {
    path: runPath,
    text,
    currentGate: findResumeDigestField(text, "Current gate")
      ?? findLabelValue(text, "Current gate")
      ?? findHeadingValue(text, "Current gate"),
    currentPhase: findLabelValueInSection(text, "Current Status", "Current phase")
      ?? findLabelValue(text, "Current phase"),
    currentWave: findLabelValueInSection(text, "Current Status", "Current wave")
      ?? findLabelValue(text, "Current wave"),
    executionState: findLabelValueInSection(text, "Current Status", "Execution state")
      ?? findLabelValue(text, "Execution state"),
    executionMode: findResumeDigestField(text, "Execution mode")
      ?? findLabelValue(text, "Execution mode"),
    status: findLabelValue(text, "Status"),
    blockers: findResumeDigestField(text, "Remaining blockers") ?? findSectionBullets(text, "Blockers")[0] ?? "none",
    nextVerify: findResumeDigestField(text, "Next verify"),
    recommendedCommands: findSectionBullets(text, "Recommended Next Command"),
    stallStatus: findLabelValue(text, "Stall Status") ?? findHeadingValue(text, "Stall Status"),
    approvalStrategy: findLabelValue(text, "Approval Strategy") ?? findHeadingValue(text, "Approval Strategy"),
    burnRisk: findLabelValue(text, "Burn Risk") ?? findHeadingValue(text, "Burn Risk"),
    sessionRisk: findLabelValue(text, "Session Risk") ?? findHeadingValue(text, "Session Risk"),
    contextRisk: findLabelValue(text, "Context Risk") ?? findHeadingValue(text, "Context Risk")
  };
}

function isRunDone(metadata) {
  const gate = metadata.currentGate?.toLowerCase();
  const status = metadata.status?.toLowerCase();
  const executionState = metadata.executionState?.toLowerCase();
  return gate === "done" || status === "done" || executionState === "done";
}

function resolveRunPath(projectDir, explicitRun) {
  if (explicitRun) {
    return path.resolve(projectDir, explicitRun);
  }

  const statePath = stateFileFor(projectDir);
  const stateText = readTextIfExists(statePath);
  if (stateText) {
    const activeRun = findLabelValue(stateText, "Active run");
    if (activeRun) {
      const activeRunPath = path.resolve(projectDir, activeRun);
      if (fs.existsSync(activeRunPath)) {
        const metadata = runMetadata(activeRunPath);
        if (!isRunDone(metadata)) {
          return activeRunPath;
        }
      }
    }
  }

  const flowDir = flowDirFor(projectDir);
  if (!fs.existsSync(flowDir)) {
    throw new Error(`Flow directory not found: ${flowDir}`);
  }

  const candidates = fs
    .readdirSync(flowDir)
    .filter((name) => name.endsWith(".md") && name !== "STATE.md")
    .map((name) => path.join(flowDir, name))
    .filter((candidatePath) => {
      try {
        return !isRunDone(runMetadata(candidatePath));
      } catch {
        return false;
      }
    });

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length === 0) {
    throw new Error(`No active run found under ${flowDir}`);
  }

  throw new Error(`Multiple active runs found under ${flowDir}; use --run to choose one explicitly.`);
}

function statusCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  const digestPhaseWave = findResumeDigestField(metadata.text, "Current phase / wave");
  const [digestPhase, digestWave] = digestPhaseWave
    ? digestPhaseWave.split("/").map((value) => value.trim())
    : [null, null];

  console.log(`Project: ${dir}`);
  console.log(`Active run: ${relPathFrom(dir, runPath)}`);
  console.log(`Current gate: ${metadata.currentGate ?? "unknown"}`);
  console.log(`Execution mode: ${metadata.executionMode ?? "manual"}`);
  console.log(`Current phase / wave: ${metadata.currentPhase ?? digestPhase ?? "?"} / ${metadata.currentWave ?? digestWave ?? "?"}`);
  console.log(`Execution state: ${metadata.executionState ?? "unknown"}`);
  console.log(`Blockers: ${metadata.blockers ?? "none"}`);
  console.log(`Stall status: ${metadata.stallStatus ?? "none"}`);
  console.log(`Approval strategy: ${metadata.approvalStrategy ?? "local-only"}`);
  console.log(`Burn risk: ${metadata.burnRisk ?? "low"}`);
  console.log(`Session risk: ${metadata.sessionRisk ?? "unknown"}`);
  console.log(`Context risk: ${metadata.contextRisk ?? "unknown"}`);
  console.log(`Next verify: ${metadata.nextVerify ?? "not recorded"}`);
  if (metadata.recommendedCommands.length > 0) {
    console.log("Recommended next command:");
    for (const command of metadata.recommendedCommands) {
      console.log(`- ${command}`);
    }
  }
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : []
  };
}

function compareIdentifiers(left, right) {
  const leftNumber = /^\d+$/.test(left);
  const rightNumber = /^\d+$/.test(right);
  if (leftNumber && rightNumber) {
    return Number(left) - Number(right);
  }
  if (leftNumber) {
    return -1;
  }
  if (rightNumber) {
    return 1;
  }
  return left.localeCompare(right);
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);
  if (!left || !right) {
    return leftVersion.localeCompare(rightVersion);
  }

  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }
  if (left.prerelease.length === 0) {
    return 1;
  }
  if (right.prerelease.length === 0) {
    return -1;
  }

  const maxLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < maxLength; i += 1) {
    const leftPart = left.prerelease[i];
    const rightPart = right.prerelease[i];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    const diff = compareIdentifiers(leftPart, rightPart);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function readUpdateCache() {
  return readJsonIfExists(UPDATE_CACHE_PATH);
}

function writeUpdateCache(latestVersion) {
  ensureDir(path.dirname(UPDATE_CACHE_PATH));
  fs.writeFileSync(UPDATE_CACHE_PATH, JSON.stringify({
    packageName: PACKAGE_NAME,
    latestVersion,
    checkedAt: Date.now()
  }, null, 2));
}

function fetchLatestPublishedVersion() {
  return new Promise((resolve) => {
    const request = https.get(`https://registry.npmjs.org/${PACKAGE_NAME}`, {
      headers: {
        Accept: "application/json"
      }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed?.["dist-tags"]?.latest ?? null);
        } catch {
          resolve(null);
        }
      });
    });

    request.setTimeout(UPDATE_CHECK_TIMEOUT_MS, () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

async function latestPublishedVersion() {
  const cached = readUpdateCache();
  if (cached?.latestVersion && Number.isFinite(cached.checkedAt)) {
    if ((Date.now() - cached.checkedAt) < UPDATE_CACHE_TTL_MS) {
      return cached.latestVersion;
    }
  }

  const fetched = await fetchLatestPublishedVersion();
  if (fetched) {
    writeUpdateCache(fetched);
    return fetched;
  }

  return cached?.latestVersion ?? null;
}

function shouldCheckForUpdates(command) {
  if (process.env.CI === "true" || process.env.QUICK_CODEX_NO_UPDATE_CHECK === "1") {
    return false;
  }
  return !["help", "uninstall"].includes(command);
}

function printUpdateNotice(latestVersion) {
  console.log("");
  console.log(`Update available: ${PACKAGE_NAME} ${PACKAGE_VERSION} -> ${latestVersion}`);
  console.log("Refresh the published package and local skill install:");
  console.log(`- npx ${PACKAGE_NAME}@latest upgrade`);
  console.log("If you run from a local checkout, pull the latest repo changes first.");
}

function resumeCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  const relativeRunPath = relPathFrom(dir, runPath);
  const commands = metadata.recommendedCommands.length > 0
    ? metadata.recommendedCommands
    : [`Use $qc-flow and resume from ${relativeRunPath}.`];

  console.log(`Project: ${dir}`);
  console.log(`Active run: ${relativeRunPath}`);
  console.log(`Current gate: ${metadata.currentGate ?? "unknown"}`);
  console.log("Paste one of these next:");
  for (const command of commands) {
    console.log(`- ${command}`);
  }
}

function doctorRunCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  const text = metadata.text;
  const checks = [
    ["Requirement Baseline", text.includes("## Requirement Baseline")],
    ["Resume Digest", text.includes("## Resume Digest")],
    ["Current gate", metadata.currentGate !== null],
    ["Execution mode", metadata.executionMode !== null],
    ["Burn Risk", metadata.burnRisk !== null],
    ["Approval Strategy", metadata.approvalStrategy !== null],
    ["Recommended Next Command", metadata.recommendedCommands.length > 0],
    ["Verification Ledger", text.includes("## Verification Ledger")]
  ];

  let failed = false;
  console.log(`Run: ${relPathFrom(dir, runPath)}`);
  for (const [name, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
    if (!passed) {
      failed = true;
    }
  }

  const stateText = readTextIfExists(stateFileFor(dir));
  if (stateText) {
    const activeRun = findLabelValue(stateText, "Active run");
    const expectedPath = activeRun ? path.resolve(dir, activeRun) : null;
    const stateMatches = expectedPath === runPath;
    console.log(`${stateMatches ? "PASS" : "WARN"}: STATE.md active run ${stateMatches ? "matches" : "does not match"} this run`);
  } else {
    console.log("WARN: STATE.md not found");
  }

  if (failed) {
    throw new Error("doctor-run found one or more issues");
  }

  console.log("Doctor-run passed.");
}

async function maybeShowUpdateNotice(command) {
  if (!shouldCheckForUpdates(command)) {
    return;
  }
  const latestVersion = await latestPublishedVersion();
  if (latestVersion && compareSemver(PACKAGE_VERSION, latestVersion) < 0) {
    printUpdateNotice(latestVersion);
  }
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

  let succeeded = false;
  try {
    switch (args.command) {
      case "help":
        usage();
        break;
      case "install":
        installCommand(args);
        break;
      case "upgrade":
        installCommand(args);
        break;
      case "uninstall":
        uninstallCommand(args);
        break;
      case "doctor":
        doctorCommand(args);
        break;
      case "init":
        initCommand(args);
        break;
      case "status":
        statusCommand(args);
        break;
      case "resume":
        resumeCommand(args);
        break;
      case "doctor-run":
        doctorRunCommand(args);
        break;
      default:
        throw new Error(`Unknown command: ${args.command}`);
    }
    succeeded = true;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }

  if (succeeded) {
    await maybeShowUpdateNotice(args.command);
  }
}

await main();
