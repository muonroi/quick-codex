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
const DEFAULT_TARGET = path.join(os.homedir(), ".agents", "skills");
const LEGACY_TARGET = path.join(os.homedir(), ".codex", "skills");
const SUPPORTED_DISCOVERY_TARGETS = [DEFAULT_TARGET, LEGACY_TARGET];
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
  quick-codex lock-check [--dir <project-dir>] [--run <path>]
  quick-codex verify-wave [--dir <project-dir>] [--run <path>] [--phase <id>] [--wave <id>] [--allow-shell-verify]
  quick-codex regression-check [--dir <project-dir>] [--run <path>] [--phase <id>] [--wave <id>] [--allow-shell-verify]
  quick-codex close-wave [--dir <project-dir>] [--run <path>] [--phase <id>] [--wave <id>] [--phase-done]
  quick-codex capture-hooks [--dir <project-dir>] [--run <path>] [--input <path>]
  quick-codex sync-experience [--dir <project-dir>] [--run <path>] --tool <name> [--tool-input <json>] [--tool-input-file <path>] [--engine-url <url>] [--timeout-ms <ms>]
  quick-codex checkpoint-digest [--dir <project-dir>] [--run <path>]
  quick-codex snapshot [--dir <project-dir>] [--run <path>]
  quick-codex repair-run [--dir <project-dir>] [--run <path>]
  quick-codex doctor-run [--dir <project-dir>] [--run <path>]
  quick-codex upgrade [--copy] [--target <dir>]
  quick-codex uninstall [--target <dir>] [--dir <project-dir>]
  quick-codex --help

Commands:
  install    Install qc-flow and qc-lock into ~/.agents/skills
  doctor     Check package shape, skill files, local install, and lint status
  init       Scaffold AGENTS.md guidance, .quick-codex-flow/, and a sample run artifact
  status     Show the current active run, gate, risks, experience constraints, and next command
  resume     Print the exact next prompt(s) plus active experience constraints to resume safely
  lock-check Validate that a flow or lock artifact is explicit enough for locked execution
  verify-wave Run the active wave verification commands and append bounded evidence to the run artifact
  regression-check Run protected-boundary verification commands and append bounded evidence to the run artifact
  close-wave Mark the active wave done after verification evidence exists and optionally record phase close
  capture-hooks Capture Experience Engine hook text into the active run's Experience Snapshot
  sync-experience Query Experience Engine /api/intercept for a tool action and sync returned warnings into the active run
  checkpoint-digest  Print the compact-safe handoff for the active run
  snapshot   Alias for checkpoint-digest
  repair-run Refresh resumability sections, Experience Snapshot, and realign STATE.md for the active run
  doctor-run Validate a run artifact, Experience Snapshot, and STATE.md handoff
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
    targetExplicit: false,
    dir: process.cwd(),
    dirExplicit: false,
    run: null,
    phase: null,
    wave: null,
    phaseDone: false,
    input: null,
    tool: null,
    toolInput: null,
    toolInputFile: null,
    engineUrl: null,
    timeoutMs: 3000,
    allowShellVerify: false
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
      result.targetExplicit = true;
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
    if (arg === "--input") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--input requires a path");
      }
      result.input = path.resolve(argv[i]);
      continue;
    }
    if (arg === "--phase") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--phase requires a phase id");
      }
      result.phase = argv[i];
      continue;
    }
    if (arg === "--wave") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--wave requires a wave id");
      }
      result.wave = argv[i];
      continue;
    }
    if (arg === "--phase-done") {
      result.phaseDone = true;
      continue;
    }
    if (arg === "--allow-shell-verify") {
      result.allowShellVerify = true;
      continue;
    }
    if (arg === "--tool") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--tool requires a tool name");
      }
      result.tool = argv[i];
      continue;
    }
    if (arg === "--tool-input") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--tool-input requires a JSON string");
      }
      result.toolInput = argv[i];
      continue;
    }
    if (arg === "--tool-input-file") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--tool-input-file requires a path");
      }
      result.toolInputFile = path.resolve(argv[i]);
      continue;
    }
    if (arg === "--engine-url") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--engine-url requires a URL");
      }
      result.engineUrl = argv[i];
      continue;
    }
    if (arg === "--timeout-ms") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--timeout-ms requires a number");
      }
      result.timeoutMs = Number(argv[i]);
      if (!Number.isFinite(result.timeoutMs) || result.timeoutMs <= 0) {
        throw new Error("--timeout-ms must be a positive number");
      }
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

function alternateDiscoveryTargets(target) {
  const resolvedTarget = path.resolve(target);
  const supportedTargets = uniquePaths(SUPPORTED_DISCOVERY_TARGETS);
  if (!supportedTargets.includes(resolvedTarget)) {
    return [];
  }
  return supportedTargets.filter((entry) => entry !== resolvedTarget);
}

function removeSkillInstallsFromTargets(targets, skillNames) {
  const removed = [];
  for (const baseDir of uniquePaths(targets)) {
    for (const skillName of skillNames) {
      const destDir = path.join(baseDir, skillName);
      if (fs.existsSync(destDir)) {
        removeIfExists(destDir);
        removed.push(destDir);
      }
    }
  }
  return removed;
}

function installCommand({ copy, target }) {
  ensureDir(target);
  for (const legacySkill of LEGACY_SKILLS) {
    removeIfExists(path.join(target, legacySkill));
  }
  const duplicateTargets = alternateDiscoveryTargets(target);
  const removedDuplicates = removeSkillInstallsFromTargets(duplicateTargets, [...SKILLS, ...LEGACY_SKILLS]);
  for (const skillName of SKILLS) {
    installOne(skillName, target, copy);
  }
  console.log(`Installed ${SKILLS.join(", ")} to ${target} using ${copy ? "copy" : "symlink"} mode.`);
  console.log(`Removed legacy skill names if present: ${LEGACY_SKILLS.join(", ")}.`);
  if (removedDuplicates.length > 0) {
    console.log("Removed duplicate installs from other discovery roots:");
    for (const removedPath of removedDuplicates) {
      console.log(`- ${removedPath}`);
    }
  }
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

function uninstallCommand({ target, targetExplicit, dir, dirExplicit }) {
  const uninstallTargets = targetExplicit ? [target] : uniquePaths([target, ...SUPPORTED_DISCOVERY_TARGETS]);
  const removed = removeSkillInstallsFromTargets(uninstallTargets, [...SKILLS, ...LEGACY_SKILLS]);
  console.log(`Removed ${removed.length} skill install(s) from ${uninstallTargets.join(", ")}.`);

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

function uniquePaths(paths) {
  return [...new Set(paths.map((entry) => path.resolve(entry)))];
}

function installDirsForDoctor(target, targetExplicit) {
  if (targetExplicit) {
    return [path.resolve(target)];
  }
  return uniquePaths([target, ...SUPPORTED_DISCOVERY_TARGETS]);
}

function doctorCommand({ target, targetExplicit }) {
  console.log(`Package root: ${ROOT_DIR}`);
  console.log(`Install target: ${target}`);
  console.log(`Supported discovery targets: ${SUPPORTED_DISCOVERY_TARGETS.join(", ")}`);

  let hasFailure = false;

  for (const skillName of SKILLS) {
    const packageCheck = checkSkillDir(ROOT_DIR, skillName);
    console.log(`package:${skillName} exists=${packageCheck.exists} skill_md=${packageCheck.skillMd} openai_yaml=${packageCheck.openaiYaml}`);
    if (!packageCheck.exists || !packageCheck.skillMd || !packageCheck.openaiYaml) {
      hasFailure = true;
    }
  }

  const installDirs = installDirsForDoctor(target, targetExplicit);
  for (const skillName of SKILLS) {
    let foundInDiscoveryPath = false;
    for (const baseDir of installDirs) {
      const installCheck = checkSkillDir(baseDir, skillName);
      console.log(`install:${skillName} dir=${baseDir} exists=${installCheck.exists} skill_md=${installCheck.skillMd} openai_yaml=${installCheck.openaiYaml}`);
      if (installCheck.exists && installCheck.skillMd && installCheck.openaiYaml) {
        foundInDiscoveryPath = true;
      }
    }
    if (!foundInDiscoveryPath) {
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
  console.log(`- node bin/quick-codex.js capture-hooks --dir ${dir} --input /path/to/hooks.txt`);
  console.log(`- node bin/quick-codex.js sync-experience --dir ${dir} --tool Write --tool-input '{\"file_path\":\"src/app.ts\"}'`);
  console.log(`- node bin/quick-codex.js checkpoint-digest --dir ${dir}`);
  console.log(`- node bin/quick-codex.js repair-run --dir ${dir}`);
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

function normalizeHeadings(headings) {
  return Array.isArray(headings) ? headings : [headings];
}

function hasSection(text, headings) {
  const lines = text.split(/\r?\n/);
  return normalizeHeadings(headings).some((heading) => findSectionRange(lines, heading) !== null);
}

function findLabelValueInAnySection(text, headings, label) {
  for (const heading of normalizeHeadings(headings)) {
    const value = findLabelValueInSection(text, heading, label);
    if (value !== null) {
      return value;
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

function findSectionBulletsAny(text, headings) {
  for (const heading of normalizeHeadings(headings)) {
    const values = findSectionBullets(text, heading);
    if (values.length > 0 || hasSection(text, heading)) {
      return values;
    }
  }
  return [];
}

function findSectionLabelBullets(text, heading, label) {
  const lines = text.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  let activeSection = false;
  let activeLabel = false;
  const values = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed === headingLine) {
      activeSection = true;
      activeLabel = false;
      continue;
    }

    if (activeSection && trimmed.startsWith("## ")) {
      break;
    }

    if (!activeSection) {
      continue;
    }

    if (trimmed.startsWith(`${label}:`)) {
      activeLabel = true;
      const sameLine = trimmed.slice(`${label}:`.length).trim();
      if (sameLine.length > 0) {
        values.push(stripBullet(sameLine));
      }
      continue;
    }

    if (activeLabel && /^[A-Za-z].*:$/.test(trimmed)) {
      break;
    }

    if (activeLabel && trimmed.startsWith("- ")) {
      values.push(stripBullet(trimmed));
    }
  }

  return values;
}

function findSectionLabelBulletsAny(text, headings, label) {
  for (const heading of normalizeHeadings(headings)) {
    const values = findSectionLabelBullets(text, heading, label);
    if (values.length > 0 || hasSection(text, heading)) {
      return values;
    }
  }
  return [];
}

function findSectionBulletValue(text, heading, label) {
  const bullets = findSectionBullets(text, heading);
  for (const bullet of bullets) {
    if (bullet.startsWith(`${label}:`)) {
      return bullet.slice(`${label}:`.length).trim();
    }
  }
  return null;
}

function splitMarkdownTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function parseMarkdownTableInSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const range = findSectionRange(lines, heading);
  if (!range) {
    return null;
  }

  const sectionLines = lines.slice(range.start + 1, range.end);
  const tableStart = sectionLines.findIndex((line) => line.trim().startsWith("|"));
  if (tableStart === -1 || tableStart + 1 >= sectionLines.length) {
    return null;
  }

  const headers = splitMarkdownTableLine(sectionLines[tableStart]);
  const separator = splitMarkdownTableLine(sectionLines[tableStart + 1]);
  if (!headers || !separator || headers.length !== separator.length) {
    return null;
  }

  const rows = [];
  let offset = tableStart + 2;
  while (offset < sectionLines.length && sectionLines[offset].trim().startsWith("|")) {
    const values = splitMarkdownTableLine(sectionLines[offset]);
    if (values && values.length === headers.length) {
      rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
    }
    offset += 1;
  }

  return {
    headers,
    beforeLines: sectionLines.slice(0, tableStart),
    afterLines: sectionLines.slice(offset),
    rows
  };
}

function renderMarkdownTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${headers.map((header) => row[header] ?? "").join(" | ")} |`);
  return [headerLine, separatorLine, ...rowLines];
}

function replaceMarkdownTableInSection(text, heading, table) {
  return replaceOrInsertSection(
    text,
    heading,
    [...table.beforeLines, ...renderMarkdownTable(table.headers, table.rows), ...table.afterLines],
    null
  );
}

function normalizeCommandText(value) {
  if (!value) {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function detectArtifactType(runPath, text) {
  if (runPath.includes(".quick-codex-lock") || text.includes("## Locked Plan") || text.includes("## Current Locked Plan")) {
    return "lock";
  }
  return "flow";
}

function defaultResumeCommand(relativeRunPath, artifactType = "flow") {
  if (artifactType === "lock") {
    return `Use $qc-lock for this task: resume from ${relativeRunPath}.`;
  }
  return `Use $qc-flow and resume from ${relativeRunPath}.`;
}

function meaningfulList(values) {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return normalized.filter((value) => !/^(none|n\/a|no .+|not recorded)$/i.test(value));
}

function summarizeList(values, fallback = "none recorded") {
  const meaningful = meaningfulList(values);
  return meaningful.length > 0 ? meaningful.join("; ") : fallback;
}

function normalizeBrainVerdict(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return [
    "allow-compact",
    "allow-clear",
    "relock-first",
    "block-action",
    "unavailable",
    "not-evaluated"
  ].includes(normalized)
    ? normalized
    : null;
}

function normalizeBrainConfidence(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["high", "medium", "low", "n/a"].includes(normalized) ? normalized : "n/a";
}

function brainSessionActionState(metadata) {
  const verdict = normalizeBrainVerdict(
    metadata.waveHandoffBrainSessionActionVerdict
      ?? metadata.summaryBrainSessionActionVerdict
      ?? metadata.nextWavePackBrainSessionActionVerdict
      ?? "not-evaluated"
  ) ?? "not-evaluated";
  return {
    verdict,
    confidence: normalizeBrainConfidence(
      metadata.waveHandoffBrainVerdictConfidence
        ?? metadata.summaryBrainVerdictConfidence
        ?? metadata.nextWavePackBrainVerdictConfidence
        ?? "n/a"
    ),
    rationale: metadata.waveHandoffBrainVerdictRationale
      ?? metadata.summaryBrainVerdictRationale
      ?? metadata.nextWavePackBrainVerdictRationale
      ?? "Experience Engine verdict is not recorded yet; fall back to the protocol baseline.",
    source: metadata.waveHandoffBrainVerdictSource
      ?? metadata.summaryBrainVerdictSource
      ?? metadata.nextWavePackBrainVerdictSource
      ?? "not-recorded"
  };
}

function carryForwardState(metadata) {
  const phaseRelation = metadata.waveHandoffPhaseRelation
    ?? metadata.summaryPhaseRelation
    ?? metadata.nextWavePackPhaseRelation
    ?? (metadata.currentGate === "phase-close" ? "dependent-next-phase" : "same-phase");
  const compactionAction = compactionActionForRelation(phaseRelation);
  const brainVerdict = brainSessionActionState(metadata);
  return {
    phaseRelation,
    compactionAction,
    brainVerdict,
    suggestedSessionAction: metadata.waveHandoffSuggestedSessionAction
      ?? metadata.summarySuggestedSessionAction
      ?? metadata.nextWavePackSuggestedSessionAction
      ?? explicitSuggestedSessionAction({
        phaseRelation,
        compactionAction,
        brainVerdict
      }),
    carryForwardInvariants: summarizeList(uniqueValues([
      metadata.waveHandoffCarryForwardInvariants ?? "",
      metadata.summaryCarryForwardInvariants ?? "",
      metadata.nextWavePackCarryForwardInvariants ?? "",
      ...metadata.currentExecutionWaveInvariantRequirements,
      ...metadata.experienceHookInvariants
    ]), "preserve the active affected area and verified outcomes"),
    whatToForget: metadata.waveHandoffWhatToForget
      ?? metadata.summaryWhatToForget
      ?? metadata.nextWavePackWhatToForget
      ?? "broad chat recap that does not change the next safe move",
    whatMustRemainLoaded: metadata.waveHandoffWhatMustRemainLoaded
      ?? metadata.summaryWhatMustRemainLoaded
      ?? metadata.nextWavePackWhatMustRemainLoaded
      ?? "current phase / wave, next verify, and recommended next command"
  };
}

function compactionActionForRelation(phaseRelation) {
  switch (phaseRelation) {
    case "independent-next-phase":
      return "clear";
    case "relock-before-next-phase":
      return "relock";
    case "same-phase":
    case "dependent-next-phase":
    default:
      return "compact";
  }
}

function defaultSuggestedSessionAction({ phaseRelation, compactionAction, relativeRunPath = ".", nextWavePack = null }) {
  const artifactRef = relativeRunPath === "." ? "the current run artifact" : relativeRunPath;
  if (compactionAction === "clear") {
    return "`/clear` only after this summary is recorded and the next phase is confirmed independent.";
  }
  if (compactionAction === "relock") {
    return `Do not run \`/compact\` or \`/clear\` yet; relock from ${artifactRef} before continuing.`;
  }
  if (nextWavePack) {
    return `\`/compact\` after reviewing this summary and keeping the next-wave pack for ${nextWavePack.target.phase} / ${nextWavePack.target.wave}.`;
  }
  if (phaseRelation === "dependent-next-phase") {
    return "`/compact` after reviewing this summary and keeping only the downstream-relevant carry-forward subset.";
  }
  return "`/compact` after reviewing this summary and resume payload.";
}

function explicitSuggestedSessionAction({ phaseRelation, compactionAction, brainVerdict, relativeRunPath = ".", nextWavePack = null }) {
  const verdict = brainVerdict?.verdict ?? "not-evaluated";
  if (verdict === "relock-first") {
    return `Do not run \`/compact\` or \`/clear\` yet; relock from ${relativeRunPath === "." ? "the current run artifact" : relativeRunPath} before continuing.`;
  }
  if (verdict === "block-action") {
    return "Do not run `/compact` or `/clear` yet; keep the current session, review the blockers and verify path, then refresh the handoff.";
  }
  if (verdict === "allow-clear") {
    return "`/clear` only after this summary is recorded and the next phase is confirmed independent.";
  }
  if (verdict === "allow-compact") {
    return defaultSuggestedSessionAction({ phaseRelation, compactionAction, relativeRunPath, nextWavePack });
  }
  return defaultSuggestedSessionAction({ phaseRelation, compactionAction, relativeRunPath, nextWavePack });
}

function parsePhaseWaveSpec(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length === 0) {
    return null;
  }
  const match = trimmed.match(/([A-Za-z0-9._-]+)\s*\/\s*([A-Za-z0-9._-]+)/);
  if (!match) {
    return null;
  }
  return { phase: match[1], wave: match[2] };
}

function requiresExplicitNextWavePack(metadata) {
  const carryForward = carryForwardState(metadata);
  if (carryForward.phaseRelation !== "same-phase") {
    return false;
  }
  const target = parsePhaseWaveSpec(metadata.nextWavePackTarget ?? metadata.waveHandoffNextTarget ?? "");
  const source = parsePhaseWaveSpec(metadata.waveHandoffSourceCheckpoint ?? "");
  if (!target || !source) {
    return false;
  }
  return target.phase !== source.phase || target.wave !== source.wave;
}

function nextWavePackTargetFromMetadata(metadata) {
  const explicitTarget = parsePhaseWaveSpec(metadata.nextWavePackTarget ?? "");
  if (explicitTarget) {
    return explicitTarget;
  }
  if (!requiresExplicitNextWavePack(metadata)) {
    return null;
  }
  return parsePhaseWaveSpec(metadata.waveHandoffNextTarget ?? "");
}

function nextWavePackState(metadata, relativeRunPath = ".") {
  const target = nextWavePackTargetFromMetadata(metadata);
  if (!target) {
    return null;
  }
  const carryForward = carryForwardState(metadata);
  const phaseRelation = metadata.nextWavePackPhaseRelation ?? carryForward.phaseRelation;
  const compactionAction = compactionActionForRelation(phaseRelation);
  const brainVerdict = {
    verdict: normalizeBrainVerdict(metadata.nextWavePackBrainSessionActionVerdict ?? carryForward.brainVerdict.verdict) ?? "not-evaluated",
    confidence: normalizeBrainConfidence(metadata.nextWavePackBrainVerdictConfidence ?? carryForward.brainVerdict.confidence),
    rationale: metadata.nextWavePackBrainVerdictRationale ?? carryForward.brainVerdict.rationale,
    source: metadata.nextWavePackBrainVerdictSource ?? carryForward.brainVerdict.source
  };
  return {
    target,
    derivedFrom: metadata.nextWavePackDerivedFrom ?? metadata.waveHandoffSourceCheckpoint ?? "not recorded",
    phaseRelation,
    compactionAction,
    brainVerdict,
    waveGoal: metadata.nextWavePackWaveGoal ?? metadata.currentExecutionWavePurpose ?? "not recorded",
    doneWhen: metadata.nextWavePackDoneWhen ?? metadata.currentExecutionWaveDoneWhen ?? "not recorded",
    nextVerify: metadata.nextWavePackNextVerify ?? metadata.nextVerify ?? "not recorded",
    carryForwardInvariants: metadata.nextWavePackCarryForwardInvariants ?? carryForward.carryForwardInvariants,
    whatToForget: metadata.nextWavePackWhatToForget ?? carryForward.whatToForget,
    whatMustRemainLoaded: metadata.nextWavePackWhatMustRemainLoaded ?? carryForward.whatMustRemainLoaded,
    resumePayload: metadata.nextWavePackResumePayload
      ?? metadata.waveHandoffResumePayload
      ?? metadata.recommendedCommands[0]
      ?? defaultResumeCommand(relativeRunPath, metadata.artifactType),
    suggestedSessionAction: metadata.nextWavePackSuggestedSessionAction ?? explicitSuggestedSessionAction({
      phaseRelation,
      compactionAction,
      brainVerdict,
      relativeRunPath,
      nextWavePack: { target }
    })
  };
}

function handoffSufficiency(metadata, relativeRunPath = ".") {
  const carryForward = carryForwardState(metadata);
  const nextWavePack = nextWavePackState(metadata, relativeRunPath);
  const target = nextWavePackTargetFromMetadata(metadata);
  const scoreItems = [
    ["summary phase relation", meaningfulList([metadata.summaryPhaseRelation ?? ""]).length > 0],
    ["summary carry-forward invariants", meaningfulList([metadata.summaryCarryForwardInvariants ?? ""]).length > 0],
    ["summary what to forget", meaningfulList([metadata.summaryWhatToForget ?? ""]).length > 0],
    ["summary what must remain loaded", meaningfulList([metadata.summaryWhatMustRemainLoaded ?? ""]).length > 0],
    ["summary brain verdict", meaningfulList([metadata.summaryBrainSessionActionVerdict ?? ""]).length > 0],
    ["summary brain rationale", meaningfulList([metadata.summaryBrainVerdictRationale ?? ""]).length > 0],
    ["summary suggested session action", meaningfulList([metadata.summarySuggestedSessionAction ?? ""]).length > 0],
    ["wave handoff trigger", meaningfulList([metadata.waveHandoffTrigger ?? ""]).length > 0],
    ["wave handoff source checkpoint", meaningfulList([metadata.waveHandoffSourceCheckpoint ?? ""]).length > 0],
    ["wave handoff next target", meaningfulList([metadata.waveHandoffNextTarget ?? ""]).length > 0],
    ["wave handoff phase relation", meaningfulList([metadata.waveHandoffPhaseRelation ?? ""]).length > 0],
    ["wave handoff sealed decisions", meaningfulList([metadata.waveHandoffSealedDecisions ?? ""]).length > 0],
    ["wave handoff carry-forward invariants", meaningfulList([metadata.waveHandoffCarryForwardInvariants ?? ""]).length > 0],
    ["wave handoff expired context", meaningfulList([metadata.waveHandoffExpiredContext ?? ""]).length > 0],
    ["wave handoff what to forget", meaningfulList([metadata.waveHandoffWhatToForget ?? ""]).length > 0],
    ["wave handoff what must remain loaded", meaningfulList([metadata.waveHandoffWhatMustRemainLoaded ?? ""]).length > 0],
    ["wave handoff brain verdict", meaningfulList([metadata.waveHandoffBrainSessionActionVerdict ?? ""]).length > 0],
    ["wave handoff brain rationale", meaningfulList([metadata.waveHandoffBrainVerdictRationale ?? ""]).length > 0],
    ["wave handoff suggested session action", meaningfulList([metadata.waveHandoffSuggestedSessionAction ?? ""]).length > 0],
    ["wave handoff resume payload", meaningfulList([metadata.waveHandoffResumePayload ?? ""]).length > 0],
    ["next verify", meaningfulList([metadata.nextVerify ?? ""]).length > 0],
    ["recommended next command", metadata.recommendedCommands.length > 0],
    ["phase relation alignment", carryForward.phaseRelation === (metadata.waveHandoffPhaseRelation ?? carryForward.phaseRelation)]
  ];

  const requiresPack = requiresExplicitNextWavePack(metadata);
  if (requiresPack) {
    scoreItems.push(
      ["next-wave pack target", nextWavePack !== null],
      ["next-wave pack phase relation", meaningfulList([metadata.nextWavePackPhaseRelation ?? ""]).length > 0],
      ["next-wave pack next verify", meaningfulList([metadata.nextWavePackNextVerify ?? ""]).length > 0],
      ["next-wave pack brain verdict", meaningfulList([metadata.nextWavePackBrainSessionActionVerdict ?? ""]).length > 0],
      ["next-wave pack brain rationale", meaningfulList([metadata.nextWavePackBrainVerdictRationale ?? ""]).length > 0],
      ["next-wave pack suggested session action", meaningfulList([metadata.nextWavePackSuggestedSessionAction ?? ""]).length > 0],
      ["next-wave pack resume payload", meaningfulList([metadata.nextWavePackResumePayload ?? ""]).length > 0],
      [
        "next-wave pack route alignment",
        Boolean(
          nextWavePack &&
          target &&
          metadata.currentPhase === target.phase &&
          metadata.currentWave === target.wave
        )
      ]
    );
  }

  const missing = scoreItems.filter(([, passed]) => !passed).map(([label]) => label);
  const score = scoreItems.length - missing.length;
  return {
    score,
    maxScore: scoreItems.length,
    missing,
    passed: missing.length === 0,
    phaseRelation: carryForward.phaseRelation,
    compactionAction: carryForward.compactionAction,
    requiresNextWavePack: requiresPack,
    nextWavePack
  };
}

function ignoredWarningsMissingFeedback(values) {
  return meaningfulList(values).filter((value) => !/\[id:[^\]]+\]/.test(value) || !/feedback:\s*(sent|recorded|posted|false)/i.test(value));
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function experienceSnapshotLines(snapshot) {
  return [
    "Active warnings:",
    ...(snapshot.experienceActiveWarnings.length > 0 ? snapshot.experienceActiveWarnings.map((value) => `- ${value}`) : ["- none"]),
    "Why:",
    ...(snapshot.experienceWhy.length > 0 ? snapshot.experienceWhy.map((value) => `- ${value}`) : ["- no relevant Experience Engine warnings have been recorded in this run"]),
    "Decision impact:",
    ...(snapshot.experienceDecisionImpact.length > 0 ? snapshot.experienceDecisionImpact.map((value) => `- ${value}`) : ["- none"]),
    "Experience constraints:",
    ...(snapshot.experienceConstraints.length > 0 ? snapshot.experienceConstraints.map((value) => `- ${value}`) : ["- none"]),
    "Active hook-derived invariants:",
    ...(snapshot.experienceHookInvariants.length > 0 ? snapshot.experienceHookInvariants.map((value) => `- ${value}`) : ["- none"]),
    "Still relevant:",
    ...(snapshot.experienceStillRelevant.length > 0 ? snapshot.experienceStillRelevant.map((value) => `- ${value}`) : ["- no hook-derived carry-forward is active"]),
    "Ignored warnings:",
    ...(snapshot.ignoredWarnings.length > 0 ? snapshot.ignoredWarnings.map((value) => `- ${value}`) : ["- none"])
  ];
}

function readCaptureText(inputPath) {
  if (inputPath) {
    return fs.readFileSync(inputPath, "utf8");
  }
  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }
  throw new Error("capture-hooks requires --input <path> or hook text via stdin");
}

function experienceConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".experience", "config.json"), "utf8"));
  } catch {
    return {};
  }
}

function defaultEngineUrl(expCfg) {
  if (process.env.QUICK_CODEX_EXPERIENCE_URL) {
    return process.env.QUICK_CODEX_EXPERIENCE_URL;
  }
  if (expCfg.serverBaseUrl) {
    return expCfg.serverBaseUrl;
  }
  const port = expCfg.server?.port ?? process.env.EXP_SERVER_PORT ?? 8082;
  return `http://localhost:${port}`;
}

function defaultEngineAuthToken(expCfg) {
  return process.env.QUICK_CODEX_EXPERIENCE_TOKEN ?? expCfg.serverAuthToken ?? expCfg.server?.authToken ?? null;
}

function parseToolInputArgs({ toolInput, toolInputFile }) {
  if (toolInput && toolInputFile) {
    throw new Error("Use either --tool-input or --tool-input-file, not both");
  }
  if (toolInputFile) {
    return JSON.parse(fs.readFileSync(toolInputFile, "utf8"));
  }
  if (toolInput) {
    return JSON.parse(toolInput);
  }
  return {};
}

function parseHookWarnings(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks = [];
  let current = [];

  const isHookStart = (line) => /(?:⚠️|💡)?\s*\[(?:Experience|Suggestion)/.test(line);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      if (current.length > 0) {
        current.push("");
      }
      continue;
    }
    if (isHookStart(line) && current.length > 0) {
      blocks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  const sourceBlocks = blocks.length > 0 ? blocks : [lines.map((line) => line.trim()).filter((line) => line.length > 0)];
  const seen = new Set();
  return sourceBlocks
    .map((block) => {
      const headline = block.find((line) => line.length > 0) ?? null;
      if (!headline) {
        return null;
      }
      const whyLine = block.find((line) => line.startsWith("Why:"));
      const why = whyLine ? whyLine.slice("Why:".length).trim() : null;
      const idMatch = block.join(" ").match(/\[id:([^\s\]]+)\s+col:([^\]]+)\]/);
      const headlineWithoutId = headline.replace(/\s*\[id:[^\]]+\]\s*$/, "").trim();
      const suffix = idMatch ? ` [id:${idMatch[1]} col:${idMatch[2]}]` : "";
      return {
        headline: `${headlineWithoutId}${suffix}`.trim(),
        why,
        pointId: idMatch?.[1] ?? null,
        collection: idMatch?.[2] ?? null
      };
    })
    .filter(Boolean)
    .filter((warning) => {
      const key = warning.pointId && warning.collection
        ? `${warning.collection}:${warning.pointId}`
        : `${warning.headline}::${warning.why || ""}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function mergeExperienceSnapshot(metadata, parsedWarnings, sourceLabel = "quick-codex capture-hooks") {
  const timestamp = new Date().toISOString();
  const warningHeadlines = uniqueValues([
    ...metadata.experienceActiveWarnings,
    ...parsedWarnings.map((warning) => warning.headline)
  ]);
  const whyLines = uniqueValues([
    ...metadata.experienceWhy,
    ...parsedWarnings.map((warning) => warning.why).filter(Boolean)
  ]);
  const constraints = uniqueValues([
    ...metadata.experienceConstraints,
    ...parsedWarnings.map((warning) => warning.why ? `Respect hook rationale: ${warning.why}` : `Review captured warning before the next broad verify: ${warning.headline}`)
  ]);
  const invariants = uniqueValues([
    ...metadata.experienceHookInvariants,
    ...parsedWarnings.map((warning) => warning.why
      ? `Do not continue as if this warning did not happen: ${warning.why}`
      : `Keep this warning active until the run records it as resolved: ${warning.headline}`)
  ]);
  const decisionImpact = uniqueValues([
    ...metadata.experienceDecisionImpact,
    ...parsedWarnings.map((warning) => `Captured via ${sourceLabel} on ${timestamp}: ${warning.headline}`)
  ]);
  const stillRelevant = uniqueValues([
    ...metadata.experienceStillRelevant,
    ...parsedWarnings.map((warning) => `yes - captured on ${timestamp}: ${warning.headline}`)
  ]);

  return {
    experienceActiveWarnings: warningHeadlines,
    experienceWhy: whyLines,
    experienceDecisionImpact: decisionImpact,
    experienceConstraints: constraints,
    experienceHookInvariants: invariants,
    experienceStillRelevant: stillRelevant,
    ignoredWarnings: metadata.ignoredWarnings
  };
}

function applyParsedWarningsToRun({ dir, run, parsedWarnings, sourceLabel }) {
  const runPath = resolveRunPath(dir, run);
  const relativeRunPath = relPathFrom(dir, runPath);
  const metadata = runMetadata(runPath);
  const mergedSnapshot = mergeExperienceSnapshot(metadata, parsedWarnings, sourceLabel);
  let nextText = metadata.text;

  nextText = replaceOrInsertSection(nextText, "Experience Snapshot", experienceSnapshotLines(mergedSnapshot), "Approval Strategy");
  const mergedMetadata = runMetadataFromText(runPath, nextText);
  nextText = replaceOrInsertSection(nextText, "Resume Digest", resumeDigestLines(mergedMetadata, relativeRunPath), "Requirement Baseline");
  nextText = replaceOrInsertSection(nextText, "Compact-Safe Summary", compactSafeSummaryLines(mergedMetadata, relativeRunPath), "Resume Digest");
  fs.writeFileSync(runPath, nextText, "utf8");

  const refreshedMetadata = runMetadata(runPath);
  const statePath = stateFileFor(dir);
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, renderStateFile(relativeRunPath, refreshedMetadata), "utf8");

  return { relativeRunPath, refreshedMetadata };
}

function readJsonlHead(pathToFile, maxLines = 12) {
  try {
    const content = fs.readFileSync(pathToFile, "utf8");
    const lines = content.split("\n").filter(Boolean).slice(0, maxLines);
    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function findRecentCodexSession({ projectDir, now = Date.now(), recentMs = 10 * 60 * 1000 } = {}) {
  const directEnvSession = process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || process.env.GEMINI_SESSION_ID || null;
  if (directEnvSession) {
    return directEnvSession;
  }

  const sessionsRoot = path.join(os.homedir(), ".codex", "sessions");
  if (!fs.existsSync(sessionsRoot)) {
    return null;
  }

  let best = null;

  function considerFile(filePath) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }
    if ((now - stat.mtimeMs) > recentMs) {
      return;
    }

    const entries = readJsonlHead(filePath);
    let sessionId = null;
    let sessionCwd = null;
    for (const entry of entries) {
      const payload = entry?.payload ?? {};
      if (!sessionId && entry?.type === "session_meta" && typeof payload.id === "string") {
        sessionId = payload.id;
      }
      if (!sessionCwd && typeof payload.cwd === "string") {
        sessionCwd = payload.cwd;
      }
    }
    if (!sessionId) {
      return;
    }

    const exactCwd = Boolean(projectDir && sessionCwd && path.resolve(sessionCwd) === path.resolve(projectDir));
    const score = `${exactCwd ? "1" : "0"}:${String(Math.trunc(stat.mtimeMs)).padStart(16, "0")}`;
    if (!best || score > best.score) {
      best = { id: sessionId, score };
    }
  }

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        considerFile(fullPath);
      }
    }
  }

  walk(sessionsRoot);
  return best?.id ?? null;
}

async function fetchExperienceSuggestions({ tool, toolInput, engineUrl, timeoutMs, projectDir }) {
  if (!tool) {
    throw new Error("sync-experience requires --tool <name>");
  }
  const expCfg = experienceConfig();
  const baseUrl = engineUrl ?? defaultEngineUrl(expCfg);
  const authToken = defaultEngineAuthToken(expCfg);
  const sourceSession = findRecentCodexSession({ projectDir });
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/intercept`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        toolName: tool,
        toolInput,
        sourceKind: "quick-codex-cli",
        sourceRuntime: "codex-cli",
        sourceSession,
        cwd: projectDir ?? process.cwd()
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(`sync-experience could not reach Experience Engine at ${baseUrl}: ${error.message}. Use capture-hooks as fallback.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`sync-experience received a non-JSON response from ${baseUrl}`);
  }

  if (!response.ok) {
    throw new Error(`sync-experience failed against ${baseUrl}: ${data.error ?? response.statusText}`);
  }

  return {
    baseUrl,
    sourceSession,
    suggestions: data.suggestions ?? null,
    hasSuggestions: Boolean(data.hasSuggestions && data.suggestions)
  };
}

function parseBrainJsonResult(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0]);
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

function parseBrainVerdictResponse(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase().replace(/[`"'{}\[\]]/g, " ");
  const verdict = [
    "allow-compact",
    "allow-clear",
    "relock-first",
    "block-action"
  ].find((candidate) => normalized.includes(candidate));
  const confidence = ["high", "medium", "low"].find((candidate) => normalized.includes(candidate)) ?? "medium";
  return verdict ? { verdict, confidence } : null;
}

function brainVerdictRationale({ verdict, carryForward, nextWavePack }) {
  switch (verdict) {
    case "allow-compact":
      if (nextWavePack) {
        return `Experience Engine agreed that the next-wave pack for ${nextWavePack.target.phase} / ${nextWavePack.target.wave} is explicit enough to compact safely.`;
      }
      if (carryForward.phaseRelation === "dependent-next-phase") {
        return "Experience Engine agreed that only the downstream-relevant subset needs to survive the next checkpoint.";
      }
      return "Experience Engine agreed that the current handoff keeps enough verified carry-forward state to compact safely.";
    case "allow-clear":
      return "Experience Engine agreed that the next phase is independent enough to clear after the summary is recorded.";
    case "relock-first":
      return "Experience Engine agreed that the run should be relocked before any session action is taken.";
    case "block-action":
      return "Experience Engine judged that the current blockers or verify state make both `/compact` and `/clear` unsafe right now.";
    default:
      return "Experience Engine verdict is not recorded yet; fall back to the protocol baseline.";
  }
}

function protocolAlignedVerdict(compactionAction) {
  switch (compactionAction) {
    case "clear":
      return "allow-clear";
    case "relock":
      return "relock-first";
    case "compact":
    default:
      return "allow-compact";
  }
}

function isBrainVerdictCompatibleWithProtocol(verdict, compactionAction) {
  switch (compactionAction) {
    case "clear":
      return verdict === "allow-clear" || verdict === "block-action" || verdict === "relock-first";
    case "relock":
      return verdict === "relock-first" || verdict === "block-action";
    case "compact":
    default:
      return verdict === "allow-compact" || verdict === "block-action" || verdict === "relock-first";
  }
}

function boundBrainVerdictToProtocol({ verdict, confidence, carryForward, source }) {
  if (isBrainVerdictCompatibleWithProtocol(verdict, carryForward.compactionAction)) {
    return { verdict, confidence, source, overridden: false };
  }
  return {
    verdict: protocolAlignedVerdict(carryForward.compactionAction),
    confidence: "low",
    source: `${source}-guardrailed`,
    overridden: true
  };
}

function buildSessionActionBrainPrompt({ metadata, relativeRunPath, nextWavePack, carryForward }) {
  const phaseWave = phaseWaveFromMetadata(metadata);
  const requirements = metadata.requirementsStillSatisfied.length > 0
    ? metadata.requirementsStillSatisfied.join("; ")
    : "not recorded";
  const blockers = metadata.blockers ?? "none";
  const nextVerify = metadata.nextVerify ?? "not recorded";
  const nextTarget = nextWavePack
    ? `${nextWavePack.target.phase} / ${nextWavePack.target.wave}`
    : (metadata.waveHandoffNextTarget ?? `resume ${phaseWave.phase} / ${phaseWave.wave}`);
  const activeWarnings = summarizeList(metadata.experienceActiveWarnings, "none");
  const constraints = summarizeList(metadata.experienceConstraints, "none");
  const invariants = summarizeList(metadata.experienceHookInvariants, "none");
  const evidenceBasis = summarizeList(metadata.evidenceBasis, "not recorded");
  return [
    "You are the Experience Engine brain deciding whether Quick Codex should recommend `/compact`, `/clear`, or neither.",
    "Reply with exactly one of these strings and nothing else:",
    "allow-compact|high",
    "allow-compact|medium",
    "allow-compact|low",
    "allow-clear|high",
    "allow-clear|medium",
    "allow-clear|low",
    "relock-first|high",
    "relock-first|medium",
    "relock-first|low",
    "block-action|high",
    "block-action|medium",
    "block-action|low",
    "Rules:",
    "- allow-compact only when compact keeps the needed carry-forward state.",
    "- allow-clear only when the next phase is independent and the summary is sufficient.",
    "- relock-first when the artifact should be relocked before any session action.",
    "- block-action when the summary, verify path, or blockers make both `/compact` and `/clear` unsafe.",
    "- Never say to auto-execute slash commands; the operator stays in control.",
    "- Never reply with OK, JSON, prose, or markdown.",
    `Run artifact: ${relativeRunPath}`,
    `Goal: ${metadata.goal ?? "not recorded"}`,
    `Current gate: ${metadata.currentGate ?? "unknown"}`,
    `Current phase / wave: ${phaseWave.phase} / ${phaseWave.wave}`,
    `Phase relation: ${carryForward.phaseRelation}`,
    `Baseline action: ${carryForward.compactionAction}`,
    `Next target: ${nextTarget}`,
    `Requirements still satisfied: ${requirements}`,
    `Blockers: ${blockers}`,
    `Next verify: ${nextVerify}`,
    `What to forget: ${carryForward.whatToForget}`,
    `What must remain loaded: ${carryForward.whatMustRemainLoaded}`,
    `Experience constraints: ${constraints}`,
    `Active hook-derived invariants: ${invariants}`,
    `Active warnings: ${activeWarnings}`,
    `Evidence basis: ${evidenceBasis}`
  ].join("\n");
}

function brainSessionActionFallback({ carryForward, error = null }) {
  return {
    verdict: "unavailable",
    confidence: "low",
    rationale: error
      ? `Experience Engine was unavailable (${error}); fall back to the protocol baseline.`
      : "Experience Engine verdict is unavailable; fall back to the protocol baseline.",
    suggestedAction: defaultSuggestedSessionAction({
      phaseRelation: carryForward.phaseRelation,
      compactionAction: carryForward.compactionAction
    }),
    source: "protocol-fallback"
  };
}

function sessionActionBrainFixture() {
  const raw = process.env.QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE;
  if (!raw) {
    return null;
  }
  const parsed = parseBrainJsonResult(raw);
  if (!parsed) {
    throw new Error("QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE must be valid JSON");
  }
  return parsed;
}

async function fetchSessionActionBrainVerdict({ metadata, relativeRunPath, projectDir }) {
  const fixture = sessionActionBrainFixture();
  const carryForward = carryForwardState(metadata);
  const nextWavePack = nextWavePackState(metadata, relativeRunPath);
  if (fixture) {
    const verdict = normalizeBrainVerdict(fixture.verdict) ?? "unavailable";
    const confidence = normalizeBrainConfidence(fixture.confidence);
    const source = fixture.source ? String(fixture.source) : "fixture";
    const rationale = String(fixture.rationale ?? "Fixture verdict supplied for deterministic testing.");
    return {
      verdict,
      confidence,
      rationale,
      suggestedAction: String(
        fixture.suggestedAction
          ?? explicitSuggestedSessionAction({
            phaseRelation: carryForward.phaseRelation,
            compactionAction: carryForward.compactionAction,
            brainVerdict: { verdict, confidence, rationale, source },
            relativeRunPath,
            nextWavePack
          })
      ),
      source
    };
  }

  if (process.env.QUICK_CODEX_DISABLE_SESSION_ACTION_BRAIN === "1") {
    return brainSessionActionFallback({ carryForward, error: "disabled by QUICK_CODEX_DISABLE_SESSION_ACTION_BRAIN" });
  }

  const expCfg = experienceConfig();
  const baseUrl = defaultEngineUrl(expCfg);
  const authToken = defaultEngineAuthToken(expCfg);
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(`${baseUrl}/api/brain`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: buildSessionActionBrainPrompt({ metadata, relativeRunPath, nextWavePack, carryForward }),
        timeoutMs: Number(process.env.QUICK_CODEX_SESSION_ACTION_BRAIN_TIMEOUT_MS ?? 2500)
      }),
      signal: AbortSignal.timeout(Number(process.env.QUICK_CODEX_SESSION_ACTION_BRAIN_TIMEOUT_MS ?? 3000))
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || !data?.result) {
      return brainSessionActionFallback({ carryForward, error: data?.error ?? response.statusText });
    }
    const parsedJson = parseBrainJsonResult(data.result);
    const parsed = parsedJson
      ? {
        verdict: normalizeBrainVerdict(parsedJson.verdict),
        confidence: normalizeBrainConfidence(parsedJson.confidence)
      }
      : parseBrainVerdictResponse(data.result);
    if (!parsed?.verdict) {
      return brainSessionActionFallback({ carryForward, error: "brain returned non-JSON output" });
    }
    const rawVerdict = normalizeBrainVerdict(parsed.verdict) ?? "unavailable";
    const rawConfidence = normalizeBrainConfidence(parsed.confidence);
    const boundedVerdict = boundBrainVerdictToProtocol({
      verdict: rawVerdict,
      confidence: rawConfidence,
      carryForward,
      source: "experience-engine-brain"
    });
    const verdict = boundedVerdict.verdict;
    const confidence = boundedVerdict.confidence;
    const source = boundedVerdict.source;
    const rationale = boundedVerdict.overridden
      ? `Experience Engine returned ${rawVerdict}, but protocol guardrails keep ${verdict} for phase relation ${carryForward.phaseRelation}.`
      : (parsedJson?.rationale
        ? String(parsedJson.rationale)
        : brainVerdictRationale({ verdict, carryForward, nextWavePack }));
    return {
      verdict,
      confidence,
      rationale,
      suggestedAction: String(
        parsed.suggestedAction
          ?? explicitSuggestedSessionAction({
            phaseRelation: carryForward.phaseRelation,
            compactionAction: carryForward.compactionAction,
            brainVerdict: { verdict, confidence, rationale, source },
            relativeRunPath,
            nextWavePack
          })
      ),
      source
    };
  } catch (error) {
    return brainSessionActionFallback({ carryForward, error: error.message });
  }
}

function relPathFrom(baseDir, targetPath) {
  return path.relative(baseDir, targetPath) || ".";
}

function phaseWaveFromMetadata(metadata) {
  const digestPhaseWave = findResumeDigestField(metadata.text, "Current phase / wave");
  const [digestPhase, digestWave] = digestPhaseWave
    ? digestPhaseWave.split("/").map((value) => value.trim())
    : [null, null];

  return {
    phase: metadata.currentPhase ?? digestPhase ?? "?",
    wave: metadata.currentWave ?? metadata.currentStep ?? digestWave ?? "?"
  };
}

function normalizeStatePointer(value) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (/^(none|n\/a|not recorded)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
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
  return runMetadataStruct(runPath, text);
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
    const activeLock = normalizeStatePointer(findLabelValue(stateText, "Active lock"));
    if (activeLock) {
      const activeLockPath = path.resolve(projectDir, activeLock);
      if (fs.existsSync(activeLockPath)) {
        const metadata = runMetadata(activeLockPath);
        if (!isRunDone(metadata)) {
          return activeLockPath;
        }
      }
    }
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
  const phaseWave = phaseWaveFromMetadata(metadata);

  console.log(`Project: ${dir}`);
  console.log(`Active run: ${relPathFrom(dir, runPath)}`);
  console.log(`Current gate: ${metadata.currentGate ?? "unknown"}`);
  console.log(`Execution mode: ${metadata.executionMode ?? "manual"}`);
  console.log(`Current phase / wave: ${phaseWave.phase} / ${phaseWave.wave}`);
  console.log(`Execution state: ${metadata.executionState ?? metadata.status ?? "unknown"}`);
  console.log(`Blockers: ${metadata.blockers ?? "none"}`);
  console.log(`Stall status: ${metadata.stallStatus ?? "none"}`);
  console.log(`Approval strategy: ${metadata.approvalStrategy ?? "local-only"}`);
  console.log(`Burn risk: ${metadata.burnRisk ?? "low"}`);
  console.log(`Session risk: ${metadata.sessionRisk ?? "unknown"}`);
  console.log(`Context risk: ${metadata.contextRisk ?? "unknown"}`);
  console.log(`Experience constraints: ${summarizeList(metadata.experienceConstraints)}`);
  console.log(`Hook-derived invariants: ${summarizeList(metadata.experienceHookInvariants)}`);
  console.log(`Next verify: ${metadata.nextVerify ?? "not recorded"}`);
  if (metadata.recommendedCommands.length > 0) {
    console.log("Recommended next command:");
    for (const command of metadata.recommendedCommands) {
      console.log(`- ${command}`);
    }
  }
}

function firstMeaningfulLine(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null;
}

function boundedEvidence(commandResult) {
  const stderrLine = firstMeaningfulLine(commandResult.stderr);
  if (stderrLine) {
    return stderrLine;
  }
  const stdoutLine = firstMeaningfulLine(commandResult.stdout);
  if (stdoutLine) {
    return stdoutLine;
  }
  return `exit code ${commandResult.status}`;
}

function shellVerifyAllowed(args) {
  return args.allowShellVerify || process.env.QUICK_CODEX_ALLOW_SHELL_VERIFY === "1";
}

function verifyShellOptInHint() {
  return "Re-run with --allow-shell-verify or set QUICK_CODEX_ALLOW_SHELL_VERIFY=1 if you trust this artifact command.";
}

function tokenizeSafeVerifyCommand(command) {
  const source = String(command ?? "").trim();
  if (!source) {
    return { ok: false, reason: "empty verify command" };
  }
  if (/[\r\n]/.test(source)) {
    return { ok: false, reason: "multi-line verify commands require shell parsing" };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(source)) {
    return { ok: false, reason: "leading environment assignment requires shell parsing" };
  }

  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if ("|&;<>$()".includes(char)) {
      return { ok: false, reason: `shell metacharacter ${char} requires explicit opt-in` };
    }
    current += char;
  }

  if (escaping) {
    return { ok: false, reason: "trailing escape requires shell parsing" };
  }
  if (quote) {
    return { ok: false, reason: "unclosed quote requires shell parsing" };
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  if (tokens.length === 0) {
    return { ok: false, reason: "empty verify command" };
  }
  return { ok: true, tokens };
}

function runVerifyCommand(command, cwd, args) {
  const parsed = tokenizeSafeVerifyCommand(command);
  if (parsed.ok) {
    const [program, ...programArgs] = parsed.tokens;
    return spawnSync(program, programArgs, {
      cwd,
      encoding: "utf8"
    });
  }

  if (!shellVerifyAllowed(args)) {
    return {
      status: 1,
      stdout: "",
      stderr: `Blocked unsafe verify command: ${parsed.reason}. ${verifyShellOptInHint()}`
    };
  }

  return spawnSync("bash", ["-lc", command], {
    cwd,
    encoding: "utf8"
  });
}

function isPlaceholderLedgerEntry(value) {
  return /^(none(?:\s+yet)?|n\/a|not recorded)$/i.test(value.trim());
}

function appendVerificationLedger(text, entries) {
  const existing = findSectionBullets(text, "Verification Ledger");
  return replaceOrInsertSection(
    text,
    "Verification Ledger",
    [
      ...existing.filter((value) => !isPlaceholderLedgerEntry(value)).map((value) => `- ${value}`),
      ...entries.map((value) => `- ${value}`)
    ],
    "Recommended Next Command"
  );
}

function currentPhaseWaveMatches(metadata, phase, wave) {
  const phaseWave = phaseWaveFromMetadata(metadata);
  const phaseMatches = !phase || phaseWave.phase === phase;
  const waveMatches = !wave || phaseWave.wave === wave;
  return phaseMatches && waveMatches;
}

function validateRequestedPhaseWave(metadata, phase, wave) {
  if (currentPhaseWaveMatches(metadata, phase, wave)) {
    return;
  }
  const current = phaseWaveFromMetadata(metadata);
  throw new Error(`Requested phase/wave ${phase ?? current.phase} / ${wave ?? current.wave} does not match the active artifact state ${current.phase} / ${current.wave}`);
}

function findMeaningfulCommands(values) {
  return uniqueValues(values.map(normalizeCommandText)).filter((value) => meaningfulList([value]).length > 0);
}

function lockCheckResultLines(metadata) {
  const grayAreaTriggers = meaningfulList(metadata.grayAreaTriggers);
  const affectedArea = meaningfulList(metadata.affectedArea);
  const protectedBoundaries = meaningfulList(metadata.protectedBoundaries);
  const evidenceBasis = meaningfulList(metadata.evidenceBasis);
  const verifyCommands = findMeaningfulCommands([
    ...metadata.currentExecutionWaveVerify,
    ...metadata.lockCurrentVerify,
    metadata.nextVerify ?? ""
  ]);
  const checks = [
    ["Affected area explicit", affectedArea.length > 0],
    ["Protected boundaries or explicit exclusions", protectedBoundaries.length > 0],
    ["Evidence basis explicit", evidenceBasis.length > 0],
    ["Verify path explicit", verifyCommands.length > 0],
    ["No active gray-area trigger", grayAreaTriggers.length === 0]
  ];
  return { checks, verifyCommands, grayAreaTriggers };
}

function lockCheckCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  const relativeRunPath = relPathFrom(dir, runPath);
  const { checks, verifyCommands, grayAreaTriggers } = lockCheckResultLines(metadata);
  let failed = false;

  console.log(`Run: ${relativeRunPath}`);
  console.log(`Artifact type: ${metadata.artifactType}`);
  for (const [label, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}: ${label}`);
    if (!passed) {
      failed = true;
    }
  }
  if (verifyCommands.length > 0) {
    console.log("Verify commands:");
    for (const command of verifyCommands) {
      console.log(`- ${command}`);
    }
  }
  if (grayAreaTriggers.length > 0) {
    console.log("Active gray-area triggers:");
    for (const trigger of grayAreaTriggers) {
      console.log(`- ${trigger}`);
    }
  }
  if (failed) {
    throw new Error("lock-check found one or more lock-readiness gaps");
  }
  console.log("Lock-check passed.");
}

function commandSetForVerification(metadata, mode) {
  const activeCommands = findMeaningfulCommands([
    ...metadata.currentExecutionWaveVerify,
    ...metadata.lockCurrentVerify
  ]);
  if (activeCommands.length > 0) {
    return activeCommands;
  }
  if (mode === "regression-check") {
    const broaderRegressionCommands = findMeaningfulCommands(
      metadata.latestPhaseCloseVerificationCompleted
        .map(commandFromRecordedVerification)
        .filter(Boolean)
    );
    if (broaderRegressionCommands.length > 0) {
      return broaderRegressionCommands;
    }
    const fallback = findMeaningfulCommands([metadata.nextVerify ?? ""]);
    if (fallback.length > 0) {
      return fallback;
    }
  }
  return [];
}

function executeVerificationCommands(args) {
  const { dir, run, phase, wave, mode } = args;
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  validateRequestedPhaseWave(metadata, phase, wave);
  const relativeRunPath = relPathFrom(dir, runPath);
  const commands = commandSetForVerification(metadata, mode);
  if (commands.length === 0) {
    throw new Error(`${mode} could not find any verification commands in the active artifact`);
  }

  const results = [];
  for (const command of commands) {
    const result = runVerifyCommand(command, dir, args);
    results.push({
      command,
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    });
    if ((result.status ?? 1) !== 0) {
      break;
    }
  }

  const timestamp = new Date().toISOString();
  const phaseWave = phaseWaveFromMetadata(metadata);
  const ledgerEntries = results.map((result) => {
    const outcome = result.status === 0 ? "pass" : "fail";
    return `${timestamp} ${mode} ${phaseWave.phase}/${phaseWave.wave} \`${result.command}\` -> ${outcome} (${boundedEvidence(result)})`;
  });

  let nextText = appendVerificationLedger(metadata.text, ledgerEntries);
  fs.writeFileSync(runPath, nextText, "utf8");

  console.log(`Run: ${relativeRunPath}`);
  for (const result of results) {
    const outcome = result.status === 0 ? "pass" : "fail";
    console.log(`Result: ${outcome}`);
    console.log(`Command or method: ${result.command}`);
    console.log(`Small evidence: ${boundedEvidence(result)}`);
    if (result.status !== 0) {
      console.log("Next action: fix the failing verify or relock before continuing");
      throw new Error(`${mode} failed`);
    }
  }
  console.log("Next action: verification evidence appended to the run artifact");
}

function verifyWaveCommand(args) {
  executeVerificationCommands({ ...args, mode: "verify-wave" });
}

function regressionCheckCommand(args) {
  executeVerificationCommands({ ...args, mode: "regression-check" });
}

function replaceFirstLabelValue(text, label, value) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === `${label}:`) {
      let bulletIndex = i + 1;
      while (bulletIndex < lines.length && lines[bulletIndex].trim().length === 0) {
        bulletIndex += 1;
      }
      if (bulletIndex < lines.length && lines[bulletIndex].trim().startsWith("- ")) {
        lines[bulletIndex] = `- ${value}`;
      } else {
        lines.splice(i + 1, 0, `- ${value}`);
      }
      return `${lines.join("\n").replace(/\n+$/, "")}\n`;
    }
    if (trimmed.startsWith(`${label}:`)) {
      lines[i] = `${label}: ${value}`;
      return `${lines.join("\n").replace(/\n+$/, "")}\n`;
    }
  }
  return text;
}

function commandFromRecordedVerification(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const commandMatch = trimmed.match(/`([^`]+)`/);
  if (!commandMatch) {
    return null;
  }
  return normalizeCommandText(commandMatch[1]);
}

function plannedNextWaveRoute(metadata, currentPhase, currentWave, phaseDone) {
  if (phaseDone || metadata.verifiedPlanWaves.length === 0) {
    return null;
  }

  const currentIndex = metadata.verifiedPlanWaves.findIndex((row) => row.Phase === currentPhase && row.Wave === currentWave);
  if (currentIndex === -1) {
    return null;
  }

  for (let index = currentIndex + 1; index < metadata.verifiedPlanWaves.length; index += 1) {
    const row = metadata.verifiedPlanWaves[index];
    if (row.Phase !== currentPhase) {
      break;
    }
    const status = (row.Status ?? "").trim().toLowerCase();
    if (status === "pending" || status.length === 0) {
      return {
        phase: row.Phase,
        wave: row.Wave,
        change: row.Change,
        doneWhen: row["Done when"],
        verify: row.Verify
      };
    }
  }

  return null;
}

function executionWaveLinesForRoute(route, metadata) {
  const requirements = metadata.currentExecutionWaveRequirements.length > 0
    ? metadata.currentExecutionWaveRequirements
    : metadata.requirementsStillSatisfied;
  const invariantRequirements = metadata.currentExecutionWaveInvariantRequirements.length > 0
    ? metadata.currentExecutionWaveInvariantRequirements
    : requirements;
  const lines = [
    "Phase:",
    `- ${route.phase}`,
    "Wave:",
    `- ${route.wave}`,
    "Purpose:",
    `- ${route.change || `Execute ${route.phase} / ${route.wave}`}`
  ];

  if (requirements.length > 0) {
    lines.push("Covers requirements:", ...requirements.map((value) => `- ${value}`));
  }

  lines.push("Work:", `- ${route.change || `Start ${route.phase} / ${route.wave}`}`);

  if (route.doneWhen) {
    lines.push("Done when:", `- ${route.doneWhen}`);
  }
  if (route.verify) {
    lines.push("Verify:", `- ${route.verify}`);
  }
  if (invariantRequirements.length > 0) {
    lines.push("Invariant requirements:", ...invariantRequirements.map((value) => `- ${value}`));
  }

  return lines;
}

function updateWaveTableStatuses(text, currentPhase, currentWave) {
  const table = parseMarkdownTableInSection(text, "Waves");
  if (!table) {
    return text;
  }

  table.rows = table.rows.map((row) => {
    if (row.Phase === currentPhase && row.Wave === currentWave) {
      return { ...row, Status: "done" };
    }
    return row;
  });

  return replaceMarkdownTableInSection(text, "Waves", table);
}

function verificationLedgerEntries(text) {
  return findSectionBullets(text, "Verification Ledger")
    .map((value) => {
      const match = value.match(/^(?<timestamp>\S+)\s+(?<mode>[A-Za-z-]+)\s+(?<phase>[^/\s]+)\/(?<wave>[^\s]+)\s+`(?<command>.+?)`\s+->\s+(?<outcome>pass|fail)\s+\((?<evidence>.*)\)$/);
      if (!match?.groups) {
        return null;
      }
      return {
        raw: value,
        timestamp: match.groups.timestamp,
        mode: match.groups.mode,
        phase: match.groups.phase,
        wave: match.groups.wave,
        command: match.groups.command,
        outcome: match.groups.outcome,
        evidence: match.groups.evidence
      };
    })
    .filter(Boolean);
}

function currentStatusLines(phase, wave, executionState) {
  return [
    `Current phase: ${phase}`,
    `Current wave: ${wave}`,
    `Execution state: ${executionState}`
  ];
}

function closeWaveRecommendedCommand(relativeRunPath, phase, wave, phaseDone, nextWaveRoute = null) {
  if (phaseDone) {
    return `Use $qc-flow and resume from ${relativeRunPath} to review the phase close for ${phase} and either start the next phase or mark the run done.`;
  }
  if (nextWaveRoute) {
    return `Use $qc-flow and resume from ${relativeRunPath} to review and execute ${nextWaveRoute.phase} / ${nextWaveRoute.wave}.`;
  }
  return `Use $qc-flow and resume from ${relativeRunPath} to lock the next wave after ${phase} / ${wave}.`;
}

function closeWavePhaseRelation(metadata, phase, phaseDone, nextWaveRoute = null) {
  if (nextWaveRoute) {
    return "same-phase";
  }
  if (!phaseDone) {
    return "relock-before-next-phase";
  }

  const hasLaterPhase = metadata.verifiedPlanWaves.some((row) => {
    if (row.Phase === phase) {
      return false;
    }
    const status = (row.Status ?? "").trim().toLowerCase();
    return status === "pending" || status === "in_progress" || status.length === 0;
  });

  return hasLaterPhase ? "dependent-next-phase" : "relock-before-next-phase";
}

function closeWavePhaseCloseLines(metadata, phase, requirementsCovered, requirementsStillSatisfied, verificationEntries, phaseRelation) {
  const covered = requirementsCovered.length > 0 ? requirementsCovered : ["not recorded"];
  const stillSatisfied = requirementsStillSatisfied.length > 0 ? requirementsStillSatisfied : covered;
  const verificationCompleted = verificationEntries.length > 0
    ? verificationEntries.map((entry) => `${entry.mode} ${entry.phase}/${entry.wave} \`${entry.command}\` -> ${entry.outcome}`)
    : ["not recorded"];
  const carryForwardInvariants = stillSatisfied.length > 0 ? stillSatisfied : ["preserve the validated outcomes from the completed phase"];

  return [
    `Phase: ${phase}`,
    "Result:",
    `- Wave ${phase}/${verificationEntries[0]?.wave ?? "unknown"} verified cleanly and is ready for phase close.`,
    "Requirements covered:",
    ...covered.map((value) => `- ${value}`),
    "Verification completed:",
    ...verificationCompleted.map((value) => `- ${value}`),
    "Requirements still satisfied:",
    ...stillSatisfied.map((value) => `- ${value}`),
    "Phase Relation:",
    `- ${phaseRelation}`,
    "Sealed decisions:",
    `- Verification for ${phase} is complete and the current phase output should not be rediscovered.`,
    "Carry-forward invariants:",
    ...carryForwardInvariants.map((value) => `- ${value}`),
    "Expired context:",
    "- Wave-local execution notes from the completed phase no longer need to stay loaded once the proof is captured.",
    "What to forget:",
    "- Broad chat recap and temporary wave-local narration that do not change the next safe route.",
    "What must remain loaded:",
    `- Phase relation ${phaseRelation}, requirements still satisfied, and the next recommended command.`,
    "Carry-forward notes:",
    `- ${phaseRelation === "dependent-next-phase" ? "Carry forward only the downstream-relevant subset into the next phase." : "Choose the next phase explicitly before more execution."}`,
    "Open risks:",
    "- none",
    "Decision:",
    "- next-phase-ready",
    "Why:",
    "- The verification ledger contains passing entries for the active wave and no failing entries for that same phase/wave."
  ];
}

async function closeWaveCommand({ dir, run, phase, wave, phaseDone }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  validateRequestedPhaseWave(metadata, phase, wave);
  const phaseWave = phaseWaveFromMetadata(metadata);
  const relativeRunPath = relPathFrom(dir, runPath);
  const verificationEntries = verificationLedgerEntries(metadata.text)
    .filter((entry) => entry.phase === phaseWave.phase && entry.wave === phaseWave.wave);
  const passingEntries = verificationEntries.filter((entry) => entry.outcome === "pass");
  const failingEntries = verificationEntries.filter((entry) => entry.outcome !== "pass");

  if (passingEntries.length === 0) {
    throw new Error("close-wave requires at least one passing verification ledger entry for the active phase/wave");
  }
  if (failingEntries.length > 0) {
    throw new Error("close-wave cannot complete while the active phase/wave still has failing verification ledger entries");
  }

  const requirementsCovered = uniqueValues(findSectionLabelBullets(metadata.text, "Current Execution Wave", "Covers requirements"));
  const nextRequirementsStillSatisfied = uniqueValues([
    ...metadata.requirementsStillSatisfied,
    ...requirementsCovered
  ]);
  const nextWaveRoute = plannedNextWaveRoute(metadata, phaseWave.phase, phaseWave.wave, phaseDone);
  const phaseRelation = closeWavePhaseRelation(metadata, phaseWave.phase, phaseDone, nextWaveRoute);
  const compactionAction = compactionActionForRelation(phaseRelation);
  const nextGate = phaseDone ? "phase-close" : "execute";
  const nextBlockers = phaseDone || nextWaveRoute ? "none" : `next wave not yet locked after ${phaseWave.phase} / ${phaseWave.wave}`;
  const nextVerify = phaseDone
    ? `review the phase close for ${phaseWave.phase} and decide the next phase or mark the run done`
    : (nextWaveRoute?.verify ?? `lock the next wave after ${phaseWave.phase} / ${phaseWave.wave}`);
  const nextCommand = closeWaveRecommendedCommand(relativeRunPath, phaseWave.phase, phaseWave.wave, phaseDone, nextWaveRoute);
  let nextText = metadata.text;
  nextText = replaceFirstLabelValue(nextText, "Current gate", nextGate);
  nextText = updateWaveTableStatuses(nextText, phaseWave.phase, phaseWave.wave);
  nextText = replaceOrInsertSection(
    nextText,
    "Current Status",
    currentStatusLines(nextWaveRoute?.phase ?? phaseWave.phase, nextWaveRoute?.wave ?? phaseWave.wave, nextWaveRoute ? "pending" : "done"),
    "Latest Phase Close"
  );
  nextText = replaceOrInsertSection(nextText, "Blockers", [`- ${nextBlockers}`], "Verification Ledger");
  nextText = replaceOrInsertSection(
    nextText,
    "Requirements Still Satisfied",
    (nextRequirementsStillSatisfied.length > 0 ? nextRequirementsStillSatisfied : ["not recorded"]).map((value) => `- ${value}`),
    "Blockers"
  );
  nextText = replaceOrInsertSection(nextText, "Recommended Next Command", [`- ${nextCommand}`], "Current Status");
  if (nextWaveRoute) {
    nextText = replaceOrInsertSection(
      nextText,
      "Current Execution Wave",
      executionWaveLinesForRoute(nextWaveRoute, metadata),
      "Verified Plan"
    );
  }
  if (phaseDone) {
    nextText = replaceOrInsertSection(
      nextText,
      "Latest Phase Close",
      closeWavePhaseCloseLines(metadata, phaseWave.phase, requirementsCovered, nextRequirementsStillSatisfied, passingEntries, phaseRelation),
      "Current Execution Wave"
    );
  }

  const nextMetadata = runMetadataFromText(runPath, nextText);
  const preliminaryBrainVerdict = await fetchSessionActionBrainVerdict({
    metadata: nextMetadata,
    relativeRunPath,
    projectDir: dir
  });
  const guardrailedBrainVerdict = boundBrainVerdictToProtocol({
    verdict: preliminaryBrainVerdict.verdict,
    confidence: preliminaryBrainVerdict.confidence,
    carryForward: { phaseRelation, compactionAction },
    source: preliminaryBrainVerdict.source
  });
  const finalBrainVerdict = guardrailedBrainVerdict.overridden
    ? {
      ...preliminaryBrainVerdict,
      verdict: guardrailedBrainVerdict.verdict,
      confidence: guardrailedBrainVerdict.confidence,
      source: guardrailedBrainVerdict.source,
      rationale: `Experience Engine returned ${preliminaryBrainVerdict.verdict}, but protocol guardrails keep ${guardrailedBrainVerdict.verdict} for phase relation ${phaseRelation}.`
    }
    : {
      ...preliminaryBrainVerdict,
      verdict: guardrailedBrainVerdict.verdict,
      confidence: guardrailedBrainVerdict.confidence,
      source: guardrailedBrainVerdict.source
    };
  const explicitSuggestedAction = explicitSuggestedSessionAction({
    phaseRelation,
    compactionAction,
    brainVerdict: finalBrainVerdict,
    relativeRunPath,
    nextWavePack: nextWaveRoute ? { target: { phase: nextWaveRoute.phase, wave: nextWaveRoute.wave } } : null
  });
  const summaryMetadata = {
    ...nextMetadata,
    currentGate: nextGate,
    blockers: nextBlockers,
    nextVerify,
    recommendedCommands: [nextCommand],
    executionState: nextWaveRoute ? "pending" : "done",
    currentPhase: nextWaveRoute?.phase ?? nextMetadata.currentPhase,
    currentWave: nextWaveRoute?.wave ?? nextMetadata.currentWave,
    requirementsStillSatisfied: nextRequirementsStillSatisfied,
    summaryPhaseRelation: phaseRelation,
    summaryBrainSessionActionVerdict: finalBrainVerdict.verdict,
    summaryBrainVerdictConfidence: finalBrainVerdict.confidence,
    summaryBrainVerdictRationale: finalBrainVerdict.rationale,
    summaryBrainVerdictSource: finalBrainVerdict.source,
    summarySuggestedSessionAction: explicitSuggestedAction,
    summaryCarryForwardInvariants: nextRequirementsStillSatisfied.join("; "),
    summaryWhatToForget: "broad chat recap and temporary wave-local narration that do not change the next safe route",
    summaryWhatMustRemainLoaded: nextWaveRoute
      ? `current phase / wave ${nextWaveRoute.phase} / ${nextWaveRoute.wave}, next verify, and recommended next command`
      : `phase relation ${phaseRelation}, requirements still satisfied, and the next recommended command`,
    waveHandoffTrigger: phaseDone ? "phase close" : "completed wave",
    waveHandoffSourceCheckpoint: `${phaseWave.phase} / ${phaseWave.wave}`,
    waveHandoffNextTarget: nextWaveRoute ? `${nextWaveRoute.phase} / ${nextWaveRoute.wave}` : `review phase close for ${phaseWave.phase}`,
    waveHandoffPhaseRelation: phaseRelation,
    waveHandoffBrainSessionActionVerdict: finalBrainVerdict.verdict,
    waveHandoffBrainVerdictConfidence: finalBrainVerdict.confidence,
    waveHandoffBrainVerdictRationale: finalBrainVerdict.rationale,
    waveHandoffBrainVerdictSource: finalBrainVerdict.source,
    waveHandoffSuggestedSessionAction: explicitSuggestedAction,
    waveHandoffSealedDecisions: phaseDone
      ? `Verification for ${phaseWave.phase} is complete and the current phase output should not be rediscovered.`
      : `Wave ${phaseWave.phase} / ${phaseWave.wave} is complete and the next same-phase wave may start without rebuilding earlier proof.`,
    waveHandoffCarryForwardInvariants: nextRequirementsStillSatisfied.join("; "),
    waveHandoffExpiredContext: phaseDone
      ? "wave-local execution notes from the completed phase no longer need to stay loaded once the proof is captured"
      : "the completed wave's temporary implementation narration no longer needs to stay loaded once the route is updated",
    waveHandoffWhatToForget: "broad chat recap and temporary wave-local narration that do not change the next safe route",
    waveHandoffWhatMustRemainLoaded: nextWaveRoute
      ? `current phase / wave ${nextWaveRoute.phase} / ${nextWaveRoute.wave}, next verify, and recommended next command`
      : `phase relation ${phaseRelation}, requirements still satisfied, and the next recommended command`,
    nextWavePackTarget: nextWaveRoute ? `${nextWaveRoute.phase} / ${nextWaveRoute.wave}` : null,
    nextWavePackDerivedFrom: `${phaseWave.phase} / ${phaseWave.wave}`,
    nextWavePackPhaseRelation: nextWaveRoute ? phaseRelation : null,
    nextWavePackCompactionAction: nextWaveRoute ? compactionAction : null,
    nextWavePackBrainSessionActionVerdict: nextWaveRoute ? finalBrainVerdict.verdict : null,
    nextWavePackBrainVerdictConfidence: nextWaveRoute ? finalBrainVerdict.confidence : null,
    nextWavePackBrainVerdictRationale: nextWaveRoute ? finalBrainVerdict.rationale : null,
    nextWavePackBrainVerdictSource: nextWaveRoute ? finalBrainVerdict.source : null,
    nextWavePackSuggestedSessionAction: nextWaveRoute ? explicitSuggestedAction : null,
    nextWavePackWaveGoal: nextWaveRoute?.change ?? null,
    nextWavePackDoneWhen: nextWaveRoute?.doneWhen ?? null,
    nextWavePackNextVerify: nextWaveRoute?.verify ?? null,
    nextWavePackCarryForwardInvariants: nextWaveRoute ? nextRequirementsStillSatisfied.join("; ") : null,
    nextWavePackWhatToForget: nextWaveRoute ? "completed-wave narration that does not change the next same-phase route" : null,
    nextWavePackWhatMustRemainLoaded: nextWaveRoute
      ? `target ${nextWaveRoute.phase} / ${nextWaveRoute.wave}, next verify, and the resume payload`
      : null,
    nextWavePackResumePayload: nextWaveRoute ? nextCommand : null
  };

  nextText = replaceOrInsertSection(nextText, "Resume Digest", resumeDigestLines(summaryMetadata, relativeRunPath), "Requirement Baseline");
  nextText = replaceOrInsertSection(nextText, "Compact-Safe Summary", compactSafeSummaryLines(summaryMetadata, relativeRunPath), "Resume Digest");
  nextText = replaceOrInsertSection(nextText, "Wave Handoff", waveHandoffLines(summaryMetadata, relativeRunPath), "Compact-Safe Summary");
  const nextWavePack = nextWavePackLines(summaryMetadata, relativeRunPath);
  nextText = nextWavePack
    ? replaceOrInsertSection(nextText, "Next Wave Pack", nextWavePack, "Wave Handoff")
    : removeSection(nextText, "Next Wave Pack");
  fs.writeFileSync(runPath, nextText, "utf8");

  const refreshedMetadata = runMetadata(runPath);
  const statePath = stateFileFor(dir);
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, renderStateFile(relativeRunPath, refreshedMetadata), "utf8");

  console.log(`Run: ${relativeRunPath}`);
  console.log(`Closed wave: ${phaseWave.phase} / ${phaseWave.wave}`);
  console.log(`Current gate: ${nextGate}`);
  if (phaseDone) {
    console.log(`Phase close: updated for ${phaseWave.phase}`);
  }
  if (nextWavePack) {
    const target = nextWavePackState(summaryMetadata, relativeRunPath)?.target;
    if (target) {
      console.log(`Next-wave pack: ${target.phase} / ${target.wave}`);
    }
  }
  console.log(`Brain verdict: ${finalBrainVerdict.verdict} (${finalBrainVerdict.confidence})`);
  console.log(`Next action: ${nextCommand}`);
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
    : [defaultResumeCommand(relativeRunPath, metadata.artifactType)];
  const carryForward = carryForwardState(metadata);
  const phaseWave = phaseWaveFromMetadata(metadata);
  const executionState = metadata.executionState ?? metadata.status ?? "unknown";
  const nextWavePack = nextWavePackState(metadata, relativeRunPath);

  console.log(`Project: ${dir}`);
  console.log(`Active run: ${relativeRunPath}`);
  console.log(`Current gate: ${metadata.currentGate ?? "unknown"}`);
  console.log(`Current phase / wave: ${phaseWave.phase} / ${phaseWave.wave}`);
  console.log(`Execution state: ${executionState}`);
  console.log("Keep in view:");
  console.log(`- Next verify: ${metadata.nextVerify ?? "not recorded"}`);
  console.log(`- Phase relation: ${carryForward.phaseRelation}`);
  console.log(`- Baseline action: ${carryForward.compactionAction}`);
  console.log(`- Brain verdict: ${carryForward.brainVerdict.verdict} (${carryForward.brainVerdict.confidence})`);
  console.log(`- Brain rationale: ${carryForward.brainVerdict.rationale}`);
  console.log(`- Explicit suggested action: ${carryForward.suggestedSessionAction}`);
  console.log(`- What to forget: ${carryForward.whatToForget}`);
  console.log(`- What must remain loaded: ${carryForward.whatMustRemainLoaded}`);
  console.log(`- Experience constraints: ${summarizeList(metadata.experienceConstraints)}`);
  console.log(`- Hook-derived invariants: ${summarizeList(metadata.experienceHookInvariants)}`);
  console.log(`- Warnings to respect on next step: ${summarizeList(metadata.experienceActiveWarnings)}`);
  if (metadata.waveHandoffSealedDecisions) {
    console.log(`- Sealed decisions: ${metadata.waveHandoffSealedDecisions}`);
  }
  if (nextWavePack) {
    console.log(`- Next-wave pack: ${nextWavePack.target.phase} / ${nextWavePack.target.wave} -> ${nextWavePack.nextVerify}`);
  }
  console.log("Paste one of these next:");
  for (const command of commands) {
    console.log(`- ${command}`);
  }
}

function checkpointDigestLines(metadata, relativeRunPath, { preferExisting = true } = {}) {
  const hasCarryForwardSummary = meaningfulList([
    metadata.summaryPhaseRelation ?? "",
    metadata.summaryCarryForwardInvariants ?? "",
    metadata.summaryWhatToForget ?? "",
    metadata.summaryWhatMustRemainLoaded ?? "",
    metadata.summaryBrainSessionActionVerdict ?? "",
    metadata.summaryBrainVerdictRationale ?? "",
    metadata.summarySuggestedSessionAction ?? ""
  ]).length === 7;

  if (preferExisting && metadata.compactSafeSummary.length > 0 && hasCarryForwardSummary) {
    return metadata.compactSafeSummary;
  }

  const phaseWave = phaseWaveFromMetadata(metadata);
  const requirements = metadata.requirementsStillSatisfied.length > 0
    ? metadata.requirementsStillSatisfied.join(", ")
    : "not recorded";
  const resumeWith = metadata.recommendedCommands[0]
    ?? defaultResumeCommand(relativeRunPath, metadata.artifactType);
  const carryForward = carryForwardState(metadata);

  return [
    `Goal: ${metadata.goal ?? "not recorded"}`,
    `Current gate: ${metadata.currentGate ?? "unknown"}`,
    `Current phase / wave: ${phaseWave.phase} / ${phaseWave.wave}`,
    `Requirements still satisfied: ${requirements}`,
    `Remaining blockers: ${metadata.blockers ?? "none"}`,
    `Experience constraints: ${summarizeList(metadata.experienceConstraints)}`,
    `Active hook-derived invariants: ${summarizeList(metadata.experienceHookInvariants)}`,
    `Phase relation: ${carryForward.phaseRelation}`,
    `Compaction action: ${carryForward.compactionAction}`,
    `Brain session-action verdict: ${carryForward.brainVerdict.verdict}`,
    `Brain verdict confidence: ${carryForward.brainVerdict.confidence}`,
    `Brain verdict rationale: ${carryForward.brainVerdict.rationale}`,
    `Brain verdict source: ${carryForward.brainVerdict.source}`,
    `Suggested session action: ${carryForward.suggestedSessionAction}`,
    `Carry-forward invariants: ${carryForward.carryForwardInvariants}`,
    `What to forget: ${carryForward.whatToForget}`,
    `What must remain loaded: ${carryForward.whatMustRemainLoaded}`,
    `Next verify: ${metadata.nextVerify ?? "not recorded"}`,
    `Resume with: ${resumeWith}`
  ];
}

function resumeDigestLines(metadata, relativeRunPath) {
  const phaseWave = phaseWaveFromMetadata(metadata);
  const recommendedNextCommand = metadata.recommendedCommands[0]
    ?? defaultResumeCommand(relativeRunPath, metadata.artifactType);

  return [
    `- Goal: ${metadata.goal ?? "not recorded"}`,
    `- Execution mode: ${metadata.executionMode ?? "manual"}`,
    `- Current gate: ${metadata.currentGate ?? "unknown"}`,
    `- Current phase / wave: ${phaseWave.phase} / ${phaseWave.wave}`,
    `- Remaining blockers: ${metadata.blockers ?? "none"}`,
    `- Experience constraints: ${summarizeList(metadata.experienceConstraints)}`,
    `- Active hook-derived invariants: ${summarizeList(metadata.experienceHookInvariants)}`,
    `- Next verify: ${metadata.nextVerify ?? "not recorded"}`,
    `- Recommended next command: ${recommendedNextCommand}`
  ];
}

function compactSafeSummaryLines(metadata, relativeRunPath) {
  return checkpointDigestLines(metadata, relativeRunPath, { preferExisting: false }).map((line) => `- ${line}`);
}

function waveHandoffLines(metadata, relativeRunPath) {
  const phaseWave = phaseWaveFromMetadata(metadata);
  const resumePayload = metadata.waveHandoffResumePayload
    ?? metadata.recommendedCommands[0]
    ?? defaultResumeCommand(relativeRunPath, metadata.artifactType);
  const carryForward = carryForwardState(metadata);

  return [
    `- Trigger: ${metadata.waveHandoffTrigger ?? "resume checkpoint"}`,
    `- Source checkpoint: ${metadata.waveHandoffSourceCheckpoint ?? `${phaseWave.phase} / ${phaseWave.wave}`}`,
    `- Next target: ${metadata.waveHandoffNextTarget ?? `resume ${phaseWave.phase} / ${phaseWave.wave}`}`,
    `- Phase relation: ${carryForward.phaseRelation}`,
    `- Brain session-action verdict: ${carryForward.brainVerdict.verdict}`,
    `- Brain verdict confidence: ${carryForward.brainVerdict.confidence}`,
    `- Brain verdict rationale: ${carryForward.brainVerdict.rationale}`,
    `- Brain verdict source: ${carryForward.brainVerdict.source}`,
    `- Suggested session action: ${carryForward.suggestedSessionAction}`,
    `- Sealed decisions: ${metadata.waveHandoffSealedDecisions ?? `Current gate ${metadata.currentGate ?? "unknown"} and next verify ${metadata.nextVerify ?? "not recorded"} remain the active route.`}`,
    `- Carry-forward invariants: ${carryForward.carryForwardInvariants}`,
    `- Expired context: ${metadata.waveHandoffExpiredContext ?? "broad narration already captured in the run artifact"}`,
    `- What to forget: ${carryForward.whatToForget}`,
    `- What must remain loaded: ${carryForward.whatMustRemainLoaded}`,
    `- Resume payload: ${resumePayload}`
  ];
}

function nextWavePackLines(metadata, relativeRunPath) {
  const pack = nextWavePackState(metadata, relativeRunPath);
  if (!pack) {
    return null;
  }

  return [
    "Target:",
    `- ${pack.target.phase} / ${pack.target.wave}`,
    "Derived from:",
    `- ${pack.derivedFrom}`,
    "Phase relation:",
    `- ${pack.phaseRelation}`,
    "Compaction action:",
    `- ${pack.compactionAction}`,
    "Brain session-action verdict:",
    `- ${pack.brainVerdict.verdict}`,
    "Brain verdict confidence:",
    `- ${pack.brainVerdict.confidence}`,
    "Brain verdict rationale:",
    `- ${pack.brainVerdict.rationale}`,
    "Brain verdict source:",
    `- ${pack.brainVerdict.source}`,
    "Suggested session action:",
    `- ${pack.suggestedSessionAction}`,
    "Wave goal:",
    `- ${pack.waveGoal}`,
    "Done when:",
    `- ${pack.doneWhen}`,
    "Next verify:",
    `- ${pack.nextVerify}`,
    "Carry-forward invariants:",
    `- ${pack.carryForwardInvariants}`,
    "What to forget:",
    `- ${pack.whatToForget}`,
    "What must remain loaded:",
    `- ${pack.whatMustRemainLoaded}`,
    "Resume payload:",
    `- ${pack.resumePayload}`
  ];
}

function defaultExperienceSnapshotLines() {
  return experienceSnapshotLines({
    experienceActiveWarnings: [],
    experienceWhy: [],
    experienceDecisionImpact: [],
    experienceConstraints: [],
    experienceHookInvariants: [],
    experienceStillRelevant: [],
    ignoredWarnings: []
  });
}

function findSectionRange(lines, heading) {
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  return { start, end };
}

function replaceOrInsertSection(text, heading, bodyLines, afterHeading = null) {
  const lines = text.split(/\r?\n/);
  const newSection = [`## ${heading}`, ...bodyLines];
  const existingRange = findSectionRange(lines, heading);

  if (existingRange) {
    lines.splice(existingRange.start, existingRange.end - existingRange.start, ...newSection);
    return `${lines.join("\n").replace(/\n+$/, "")}\n`;
  }

  if (afterHeading) {
    const anchorRange = findSectionRange(lines, afterHeading);
    if (anchorRange) {
      lines.splice(anchorRange.end, 0, "", ...newSection);
      return `${lines.join("\n").replace(/\n+$/, "")}\n`;
    }
  }

  lines.push("", ...newSection);
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function removeSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const range = findSectionRange(lines, heading);
  if (!range) {
    return text;
  }
  const deleteStart = range.start > 0 && lines[range.start - 1].trim() === "" ? range.start - 1 : range.start;
  lines.splice(deleteStart, range.end - deleteStart);
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function inferStateStatus(metadata) {
  if (isRunDone(metadata)) {
    return "done";
  }
  if ((metadata.executionState ?? "").toLowerCase() === "blocked" || (metadata.blockers ?? "").toLowerCase() !== "none") {
    return "blocked";
  }
  return "active";
}

function renderStateFile(relativeRunPath, metadata) {
  const activeLock = metadata.artifactType === "lock" ? relativeRunPath : "none";
  const phaseWave = phaseWaveFromMetadata(metadata);
  return `# Quick Codex Flow State

Active run:
- ${relativeRunPath}

Active lock:
- ${activeLock}

Current gate:
- ${metadata.currentGate ?? "unknown"}

Current phase / wave:
- ${phaseWave.phase} / ${phaseWave.wave}

Execution mode:
- ${metadata.executionMode ?? "manual"}

Status:
- ${inferStateStatus(metadata)}
`;
}

function checkpointDigestCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  const relativeRunPath = relPathFrom(dir, runPath);
  const lines = checkpointDigestLines(metadata, relativeRunPath);
  const carryForward = carryForwardState(metadata);
  const nextWavePack = nextWavePackState(metadata, relativeRunPath);
  const waveHandoff = metadata.artifactType === "flow"
    ? (metadata.waveHandoff.length > 0 ? metadata.waveHandoff : waveHandoffLines(metadata, relativeRunPath).map((line) => line.replace(/^- /, "")))
    : [];

  console.log(`Project: ${dir}`);
  console.log(`Active run: ${relativeRunPath}`);
  console.log("Resume card:");
  for (const line of lines) {
    console.log(`- ${line}`);
  }
  if (waveHandoff.length > 0) {
    console.log("Deliberate compaction:");
    console.log(`- Phase relation: ${carryForward.phaseRelation}`);
    console.log(`- Baseline action: ${carryForward.compactionAction}`);
    console.log(`- Brain verdict: ${carryForward.brainVerdict.verdict} (${carryForward.brainVerdict.confidence})`);
    console.log(`- Brain rationale: ${carryForward.brainVerdict.rationale}`);
    console.log(`- Explicit suggested action: ${carryForward.suggestedSessionAction}`);
    console.log(`- Sealed decisions: ${metadata.waveHandoffSealedDecisions ?? "not recorded"}`);
    console.log(`- What to forget: ${carryForward.whatToForget}`);
    console.log(`- What must remain loaded: ${carryForward.whatMustRemainLoaded}`);
    console.log(`- Resume payload: ${metadata.waveHandoffResumePayload ?? metadata.recommendedCommands[0] ?? defaultResumeCommand(relativeRunPath, metadata.artifactType)}`);
  }
  if (nextWavePack) {
    console.log("Next-wave pack:");
    console.log(`- Target: ${nextWavePack.target.phase} / ${nextWavePack.target.wave}`);
    console.log(`- Baseline action: ${nextWavePack.compactionAction}`);
    console.log(`- Brain verdict: ${nextWavePack.brainVerdict.verdict} (${nextWavePack.brainVerdict.confidence})`);
    console.log(`- Brain rationale: ${nextWavePack.brainVerdict.rationale}`);
    console.log(`- Explicit suggested action: ${nextWavePack.suggestedSessionAction}`);
    console.log(`- Next verify: ${nextWavePack.nextVerify}`);
    console.log(`- Resume payload: ${nextWavePack.resumePayload}`);
  }
}

function captureHooksCommand({ dir, run, input }) {
  const captureText = readCaptureText(input);
  const parsedWarnings = parseHookWarnings(captureText);
  if (parsedWarnings.length === 0) {
    throw new Error("capture-hooks did not find any hook warnings in the provided input");
  }
  const { relativeRunPath } = applyParsedWarningsToRun({ dir, run, parsedWarnings, sourceLabel: "quick-codex capture-hooks" });
  console.log(`Captured ${parsedWarnings.length} hook warning(s) into ${relativeRunPath}`);
  for (const warning of parsedWarnings) {
    console.log(`- ${warning.headline}`);
  }
}

async function syncExperienceCommand({ dir, run, tool, toolInput, toolInputFile, engineUrl, timeoutMs }) {
  const parsedToolInput = parseToolInputArgs({ toolInput, toolInputFile });
  const result = await fetchExperienceSuggestions({
    tool,
    toolInput: parsedToolInput,
    engineUrl,
    timeoutMs,
    projectDir: dir
  });

  if (!result.hasSuggestions || !result.suggestions) {
    console.log(`No Experience Engine suggestions to sync for tool ${tool} from ${result.baseUrl}.`);
    return;
  }

  const parsedWarnings = parseHookWarnings(result.suggestions);
  if (parsedWarnings.length === 0) {
    throw new Error("sync-experience received suggestions, but could not parse any warning blocks");
  }

  const { relativeRunPath } = applyParsedWarningsToRun({ dir, run, parsedWarnings, sourceLabel: "quick-codex sync-experience" });
  console.log(`Synced ${parsedWarnings.length} Experience Engine warning(s) into ${relativeRunPath}`);
  console.log(`Source: ${result.baseUrl}/api/intercept`);
  for (const warning of parsedWarnings) {
    console.log(`- ${warning.headline}`);
  }
}

function runMetadataFromText(runPath, text) {
  return runMetadataStruct(runPath, text);
}

function runMetadataStruct(runPath, text) {
  const artifactType = detectArtifactType(runPath, text);
  const lockHeadings = ["Locked Plan", "Current Locked Plan"];
  const lockCurrentStep = findLabelValueInAnySection(text, lockHeadings, "Current step")
    ?? findLabelValue(text, "Current step");
  const lockCurrentVerify = findSectionLabelBulletsAny(text, lockHeadings, "Current verify");
  const lockRecommendedCommands = findSectionLabelBulletsAny(text, lockHeadings, "Recommended next command");
  const lockBlockers = findSectionLabelBulletsAny(text, lockHeadings, "Blockers");
  const lockRequirementsStillSatisfied = findSectionLabelBulletsAny(text, lockHeadings, "Requirements still satisfied");
  const lockVerificationEvidence = findSectionLabelBulletsAny(text, lockHeadings, "Verification evidence");
  const lockExperienceInputs = findSectionLabelBulletsAny(text, lockHeadings, "Experience inputs");

  return {
    path: runPath,
    text,
    artifactType,
    goal: findResumeDigestField(text, "Goal")
      ?? findLabelValue(text, "Original goal"),
    currentGate: findResumeDigestField(text, "Current gate")
      ?? findLabelValue(text, "Current gate")
      ?? findHeadingValue(text, "Current gate")
      ?? (artifactType === "lock" ? "execute" : null),
    currentPhase: findLabelValueInSection(text, "Current Status", "Current phase")
      ?? findLabelValue(text, "Current phase")
      ?? (artifactType === "lock" ? findLabelValue(text, "Phase") : null),
    currentWave: findLabelValueInSection(text, "Current Status", "Current wave")
      ?? findLabelValue(text, "Current wave")
      ?? (artifactType === "lock" ? lockCurrentStep : null),
    currentStep: lockCurrentStep,
    executionState: findLabelValueInSection(text, "Current Status", "Execution state")
      ?? findLabelValue(text, "Execution state")
      ?? (artifactType === "lock" ? findLabelValue(text, "Status") : null),
    executionMode: findResumeDigestField(text, "Execution mode")
      ?? findLabelValue(text, "Execution mode"),
    status: findLabelValue(text, "Status"),
    blockers: findResumeDigestField(text, "Remaining blockers")
      ?? findSectionBullets(text, "Blockers")[0]
      ?? lockBlockers[0]
      ?? "none",
    nextVerify: findResumeDigestField(text, "Next verify")
      ?? lockCurrentVerify[0]
      ?? null,
    recommendedCommands: uniqueValues([
      ...findSectionBullets(text, "Recommended Next Command"),
      ...lockRecommendedCommands
    ]),
    stallStatus: findLabelValue(text, "Stall Status") ?? findHeadingValue(text, "Stall Status"),
    approvalStrategy: findLabelValue(text, "Approval Strategy") ?? findHeadingValue(text, "Approval Strategy"),
    burnRisk: findLabelValue(text, "Burn Risk") ?? findHeadingValue(text, "Burn Risk"),
    sessionRisk: findLabelValue(text, "Session Risk") ?? findHeadingValue(text, "Session Risk"),
    contextRisk: findLabelValue(text, "Context Risk") ?? findHeadingValue(text, "Context Risk"),
    compactSafeSummary: findSectionBullets(text, "Compact-Safe Summary"),
    waveHandoff: findSectionBullets(text, "Wave Handoff"),
    requirementsStillSatisfied: uniqueValues([
      ...findSectionBullets(text, "Requirements Still Satisfied"),
      ...lockRequirementsStillSatisfied
    ]),
    verificationEvidence: uniqueValues([
      ...lockVerificationEvidence,
      ...(artifactType === "lock" ? findSectionBullets(text, "Verification Ledger") : [])
    ]),
    affectedArea: uniqueValues([
      ...findSectionLabelBullets(text, "Requirement Baseline", "Affected area / blast radius"),
      ...findSectionLabelBullets(text, "Requirement Baseline", "Affected area"),
      ...findSectionLabelBulletsAny(text, lockHeadings, "Affected area")
    ]),
    protectedBoundaries: uniqueValues([
      ...findSectionLabelBullets(text, "Requirement Baseline", "Out of scope"),
      ...findSectionLabelBullets(text, "Requirement Baseline", "Protected boundaries"),
      ...findSectionLabelBulletsAny(text, lockHeadings, "Protected boundaries"),
      ...findSectionLabelBullets(text, "Current Execution Wave", "Invariant requirements")
    ]),
    evidenceBasis: uniqueValues([
      ...findSectionBullets(text, "Evidence Basis"),
      ...findSectionLabelBulletsAny(text, lockHeadings, "Evidence basis")
    ]),
    grayAreaTriggers: findSectionLabelBullets(text, "Clarify State", "Gray-area triggers"),
    currentExecutionWavePurpose: findSectionLabelBullets(text, "Current Execution Wave", "Purpose")[0] ?? null,
    currentExecutionWaveDoneWhen: findSectionLabelBullets(text, "Current Execution Wave", "Done when")[0] ?? null,
    currentExecutionWaveVerify: findSectionLabelBullets(text, "Current Execution Wave", "Verify"),
    currentExecutionWaveRequirements: findSectionLabelBullets(text, "Current Execution Wave", "Covers requirements"),
    currentExecutionWaveInvariantRequirements: findSectionLabelBullets(text, "Current Execution Wave", "Invariant requirements"),
    latestPhaseCloseVerificationCompleted: findSectionLabelBullets(text, "Latest Phase Close", "Verification completed"),
    verifiedPlanWaves: parseMarkdownTableInSection(text, "Waves")?.rows ?? [],
    lockCurrentVerify,
    hasExperienceSnapshot: text.includes("## Experience Snapshot"),
    experienceConstraints: uniqueValues([
      ...findSectionLabelBullets(text, "Experience Snapshot", "Experience constraints"),
      ...(artifactType === "lock" ? lockExperienceInputs : [])
    ]),
    experienceHookInvariants: findSectionLabelBullets(text, "Experience Snapshot", "Active hook-derived invariants"),
    experienceActiveWarnings: uniqueValues([
      ...findSectionLabelBullets(text, "Experience Snapshot", "Active warnings"),
      ...(artifactType === "lock" ? lockExperienceInputs : [])
    ]),
    experienceWhy: findSectionLabelBullets(text, "Experience Snapshot", "Why"),
    experienceDecisionImpact: findSectionLabelBullets(text, "Experience Snapshot", "Decision impact"),
    experienceStillRelevant: findSectionLabelBullets(text, "Experience Snapshot", "Still relevant"),
    ignoredWarnings: findSectionLabelBullets(text, "Experience Snapshot", "Ignored warnings"),
    digestExperienceConstraints: findResumeDigestField(text, "Experience constraints"),
    digestHookInvariants: findResumeDigestField(text, "Active hook-derived invariants"),
    summaryPhaseRelation: findSectionBulletValue(text, "Compact-Safe Summary", "Phase relation"),
    summaryBrainSessionActionVerdict: findSectionBulletValue(text, "Compact-Safe Summary", "Brain session-action verdict"),
    summaryBrainVerdictConfidence: findSectionBulletValue(text, "Compact-Safe Summary", "Brain verdict confidence"),
    summaryBrainVerdictRationale: findSectionBulletValue(text, "Compact-Safe Summary", "Brain verdict rationale"),
    summaryBrainVerdictSource: findSectionBulletValue(text, "Compact-Safe Summary", "Brain verdict source"),
    summarySuggestedSessionAction: findSectionBulletValue(text, "Compact-Safe Summary", "Suggested session action"),
    summaryCarryForwardInvariants: findSectionBulletValue(text, "Compact-Safe Summary", "Carry-forward invariants"),
    summaryWhatToForget: findSectionBulletValue(text, "Compact-Safe Summary", "What to forget"),
    summaryWhatMustRemainLoaded: findSectionBulletValue(text, "Compact-Safe Summary", "What must remain loaded"),
    summaryExperienceConstraints: findSectionBulletValue(text, "Compact-Safe Summary", "Experience constraints"),
    summaryHookInvariants: findSectionBulletValue(text, "Compact-Safe Summary", "Active hook-derived invariants"),
    waveHandoffTrigger: findSectionBulletValue(text, "Wave Handoff", "Trigger"),
    waveHandoffSourceCheckpoint: findSectionBulletValue(text, "Wave Handoff", "Source checkpoint"),
    waveHandoffNextTarget: findSectionBulletValue(text, "Wave Handoff", "Next target"),
    waveHandoffPhaseRelation: findSectionBulletValue(text, "Wave Handoff", "Phase relation"),
    waveHandoffBrainSessionActionVerdict: findSectionBulletValue(text, "Wave Handoff", "Brain session-action verdict"),
    waveHandoffBrainVerdictConfidence: findSectionBulletValue(text, "Wave Handoff", "Brain verdict confidence"),
    waveHandoffBrainVerdictRationale: findSectionBulletValue(text, "Wave Handoff", "Brain verdict rationale"),
    waveHandoffBrainVerdictSource: findSectionBulletValue(text, "Wave Handoff", "Brain verdict source"),
    waveHandoffSuggestedSessionAction: findSectionBulletValue(text, "Wave Handoff", "Suggested session action"),
    waveHandoffSealedDecisions: findSectionBulletValue(text, "Wave Handoff", "Sealed decisions"),
    waveHandoffCarryForwardInvariants: findSectionBulletValue(text, "Wave Handoff", "Carry-forward invariants"),
    waveHandoffExpiredContext: findSectionBulletValue(text, "Wave Handoff", "Expired context"),
    waveHandoffWhatToForget: findSectionBulletValue(text, "Wave Handoff", "What to forget"),
    waveHandoffWhatMustRemainLoaded: findSectionBulletValue(text, "Wave Handoff", "What must remain loaded"),
    waveHandoffResumePayload: findSectionBulletValue(text, "Wave Handoff", "Resume payload"),
    nextWavePackTarget: findSectionLabelBullets(text, "Next Wave Pack", "Target")[0] ?? null,
    nextWavePackDerivedFrom: findSectionLabelBullets(text, "Next Wave Pack", "Derived from")[0] ?? null,
    nextWavePackPhaseRelation: findSectionLabelBullets(text, "Next Wave Pack", "Phase relation")[0] ?? null,
    nextWavePackCompactionAction: findSectionLabelBullets(text, "Next Wave Pack", "Compaction action")[0] ?? null,
    nextWavePackBrainSessionActionVerdict: findSectionLabelBullets(text, "Next Wave Pack", "Brain session-action verdict")[0] ?? null,
    nextWavePackBrainVerdictConfidence: findSectionLabelBullets(text, "Next Wave Pack", "Brain verdict confidence")[0] ?? null,
    nextWavePackBrainVerdictRationale: findSectionLabelBullets(text, "Next Wave Pack", "Brain verdict rationale")[0] ?? null,
    nextWavePackBrainVerdictSource: findSectionLabelBullets(text, "Next Wave Pack", "Brain verdict source")[0] ?? null,
    nextWavePackSuggestedSessionAction: findSectionLabelBullets(text, "Next Wave Pack", "Suggested session action")[0] ?? null,
    nextWavePackWaveGoal: findSectionLabelBullets(text, "Next Wave Pack", "Wave goal")[0] ?? null,
    nextWavePackDoneWhen: findSectionLabelBullets(text, "Next Wave Pack", "Done when")[0] ?? null,
    nextWavePackNextVerify: findSectionLabelBullets(text, "Next Wave Pack", "Next verify")[0] ?? null,
    nextWavePackCarryForwardInvariants: findSectionLabelBullets(text, "Next Wave Pack", "Carry-forward invariants")[0] ?? null,
    nextWavePackWhatToForget: findSectionLabelBullets(text, "Next Wave Pack", "What to forget")[0] ?? null,
    nextWavePackWhatMustRemainLoaded: findSectionLabelBullets(text, "Next Wave Pack", "What must remain loaded")[0] ?? null,
    nextWavePackResumePayload: findSectionLabelBullets(text, "Next Wave Pack", "Resume payload")[0] ?? null
  };
}

async function repairRunCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const relativeRunPath = relPathFrom(dir, runPath);
  const metadata = runMetadata(runPath);
  const statePath = stateFileFor(dir);
  ensureDir(path.dirname(statePath));

  if (metadata.artifactType === "lock") {
    const currentStateText = readTextIfExists(statePath);
    const existingActiveRun = normalizeStatePointer(findLabelValue(currentStateText ?? "", "Active run")) ?? relativeRunPath;
    const stateBody = `# Quick Codex Flow State

Active run:
- ${existingActiveRun}

Active lock:
- ${relativeRunPath}

Current gate:
- ${metadata.currentGate ?? "unknown"}

Current phase / wave:
- ${phaseWaveFromMetadata(metadata).phase} / ${phaseWaveFromMetadata(metadata).wave}

Execution mode:
- ${metadata.executionMode ?? "manual"}

Status:
- ${inferStateStatus(metadata)}
`;
    fs.writeFileSync(statePath, stateBody, "utf8");
    console.log(`Repaired lock artifact pointer: ${relativeRunPath}`);
    console.log("Refreshed:");
    console.log(`- ${relPathFrom(dir, statePath)}`);
    console.log("- lock artifacts keep their compact bridge shape; flow-only sections were not synthesized");
    return;
  }

  let nextText = metadata.text;
  const repairedMetadata = {
    ...metadata,
    nextVerify: metadata.nextVerify
      ?? metadata.currentExecutionWaveVerify[0]
      ?? "review the current verify path before continuing",
    recommendedCommands: metadata.recommendedCommands.length > 0
      ? metadata.recommendedCommands
      : [defaultResumeCommand(relativeRunPath, metadata.artifactType)]
  };
  const brainVerdict = await fetchSessionActionBrainVerdict({
    metadata: repairedMetadata,
    relativeRunPath,
    projectDir: dir
  });
  const enrichedMetadata = {
    ...repairedMetadata,
    summaryBrainSessionActionVerdict: brainVerdict.verdict,
    summaryBrainVerdictConfidence: brainVerdict.confidence,
    summaryBrainVerdictRationale: brainVerdict.rationale,
    summaryBrainVerdictSource: brainVerdict.source,
    summarySuggestedSessionAction: brainVerdict.suggestedAction,
    waveHandoffBrainSessionActionVerdict: brainVerdict.verdict,
    waveHandoffBrainVerdictConfidence: brainVerdict.confidence,
    waveHandoffBrainVerdictRationale: brainVerdict.rationale,
    waveHandoffBrainVerdictSource: brainVerdict.source,
    waveHandoffSuggestedSessionAction: brainVerdict.suggestedAction,
    nextWavePackBrainSessionActionVerdict: nextWavePackTargetFromMetadata(repairedMetadata) ? brainVerdict.verdict : null,
    nextWavePackBrainVerdictConfidence: nextWavePackTargetFromMetadata(repairedMetadata) ? brainVerdict.confidence : null,
    nextWavePackBrainVerdictRationale: nextWavePackTargetFromMetadata(repairedMetadata) ? brainVerdict.rationale : null,
    nextWavePackBrainVerdictSource: nextWavePackTargetFromMetadata(repairedMetadata) ? brainVerdict.source : null,
    nextWavePackSuggestedSessionAction: nextWavePackTargetFromMetadata(repairedMetadata) ? brainVerdict.suggestedAction : null
  };

  nextText = replaceOrInsertSection(nextText, "Resume Digest", resumeDigestLines(enrichedMetadata, relativeRunPath), "Requirement Baseline");
  nextText = replaceOrInsertSection(nextText, "Compact-Safe Summary", compactSafeSummaryLines(enrichedMetadata, relativeRunPath), "Resume Digest");
  nextText = replaceOrInsertSection(nextText, "Wave Handoff", waveHandoffLines(enrichedMetadata, relativeRunPath), "Compact-Safe Summary");
  const normalizedMetadata = runMetadataFromText(runPath, nextText);
  const nextWavePack = nextWavePackLines(normalizedMetadata, relativeRunPath);
  nextText = nextWavePack
    ? replaceOrInsertSection(nextText, "Next Wave Pack", nextWavePack, "Wave Handoff")
    : removeSection(nextText, "Next Wave Pack");
  nextText = replaceOrInsertSection(nextText, "Experience Snapshot", metadata.hasExperienceSnapshot
    ? experienceSnapshotLines(enrichedMetadata)
    : defaultExperienceSnapshotLines(), "Approval Strategy");
  fs.writeFileSync(runPath, nextText, "utf8");

  const refreshedMetadata = runMetadata(runPath);
  fs.writeFileSync(statePath, renderStateFile(relativeRunPath, refreshedMetadata), "utf8");

  console.log(`Repaired run: ${relativeRunPath}`);
  console.log("Refreshed:");
  console.log("- Resume Digest");
  console.log("- Compact-Safe Summary");
  console.log("- Wave Handoff");
  if (nextWavePack) {
    console.log("- Next Wave Pack");
  }
  console.log("- Experience Snapshot");
  console.log(`- ${relPathFrom(dir, statePath)}`);
}

function doctorRunCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  const relativeRunPath = relPathFrom(dir, runPath);
  const text = metadata.text;
  const lockHeadings = ["Locked Plan", "Current Locked Plan"];
  const handoffScore = metadata.artifactType === "flow"
    ? handoffSufficiency(metadata, relativeRunPath)
    : null;
  const requiresExperienceCarryForward = meaningfulList([
    ...metadata.experienceActiveWarnings,
    ...metadata.experienceDecisionImpact,
    ...metadata.experienceConstraints,
    ...metadata.experienceHookInvariants,
    ...metadata.experienceStillRelevant
  ]).length > 0;
  const missingIgnoredWarningFeedback = ignoredWarningsMissingFeedback(metadata.ignoredWarnings);
  const flowChecks = [
    ["Requirement Baseline", text.includes("## Requirement Baseline")],
    ["Resume Digest", text.includes("## Resume Digest")],
    ["Compact-Safe Summary", text.includes("## Compact-Safe Summary")],
    ["Wave Handoff", text.includes("## Wave Handoff")],
    ["Experience Snapshot", metadata.hasExperienceSnapshot],
    ["Current gate", metadata.currentGate !== null],
    ["Execution mode", metadata.executionMode !== null],
    ["Burn Risk", metadata.burnRisk !== null],
    ["Approval Strategy", metadata.approvalStrategy !== null],
    [
      "Handoff sufficiency score",
      handoffScore?.passed ?? false
    ],
    [
      "Experience carry-forward",
      !requiresExperienceCarryForward || (
        meaningfulList([metadata.digestExperienceConstraints ?? ""]).length > 0 &&
        meaningfulList([metadata.digestHookInvariants ?? ""]).length > 0 &&
        meaningfulList([metadata.summaryExperienceConstraints ?? ""]).length > 0 &&
        meaningfulList([metadata.summaryHookInvariants ?? ""]).length > 0
      )
    ],
    ["Ignored warning feedback ids", missingIgnoredWarningFeedback.length === 0],
    ["Recommended Next Command", metadata.recommendedCommands.length > 0],
    ["Verification Ledger", text.includes("## Verification Ledger")]
  ];
  const lockChecks = [
    ["Requirement Baseline", text.includes("## Requirement Baseline")],
    ["Locked Plan", hasSection(text, lockHeadings)],
    ["Current gate", metadata.currentGate !== null],
    ["Current execution position", metadata.currentPhase !== null && (metadata.currentStep !== null || metadata.currentWave !== null)],
    ["Current verify", metadata.nextVerify !== null],
    ["Recommended Next Command", metadata.recommendedCommands.length > 0],
    ["Blockers", hasSection(text, "Blockers") || findSectionLabelBulletsAny(text, lockHeadings, "Blockers").length > 0],
    ["Verification evidence", metadata.verificationEvidence.length > 0],
    ["Requirements still satisfied", metadata.requirementsStillSatisfied.length > 0],
    ["Ignored warning feedback ids", missingIgnoredWarningFeedback.length === 0]
  ];
  const checks = metadata.artifactType === "lock" ? lockChecks : flowChecks;

  let failed = false;
  console.log(`Run: ${relativeRunPath}`);
  for (const [name, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
    if (!passed) {
      failed = true;
    }
  }
  if (handoffScore) {
    console.log(`Handoff sufficiency: ${handoffScore.score}/${handoffScore.maxScore} (${handoffScore.phaseRelation} -> ${handoffScore.compactionAction})`);
    if (handoffScore.requiresNextWavePack) {
      console.log("Handoff mode: same-phase next-wave pack required");
    }
    if (handoffScore.missing.length > 0) {
      console.log("Handoff sufficiency gaps:");
      for (const gap of handoffScore.missing) {
        console.log(`- ${gap}`);
      }
    }
  }
  if (missingIgnoredWarningFeedback.length > 0) {
    console.log("Missing ignored-warning feedback markers:");
    for (const warning of missingIgnoredWarningFeedback) {
      console.log(`- ${warning}`);
    }
  }

  const stateText = readTextIfExists(stateFileFor(dir));
  if (stateText) {
    const activeRun = normalizeStatePointer(findLabelValue(stateText, "Active run"));
    const activeLock = normalizeStatePointer(findLabelValue(stateText, "Active lock"));
    const completedInactiveLock = metadata.artifactType === "lock" && isRunDone(metadata) && activeLock === null;
    const expectedPointer = metadata.artifactType === "lock"
      ? (completedInactiveLock ? runPath : (activeLock ?? activeRun))
      : activeRun;
    const expectedPath = expectedPointer ? path.resolve(dir, expectedPointer) : null;
    const stateMatches = expectedPath === runPath;
    const pointerLabel = metadata.artifactType === "lock" ? "lock pointer" : "active run";
    if (completedInactiveLock) {
      console.log("PASS: STATE.md has no active lock pointer because this lock artifact is already complete");
    } else {
      console.log(`${stateMatches ? "PASS" : "WARN"}: STATE.md ${pointerLabel} ${stateMatches ? "matches" : "does not match"} this run`);
    }
  } else {
    console.log("WARN: STATE.md not found");
  }

  if (failed) {
    console.log(`Suggested fix: node bin/quick-codex.js repair-run --dir ${dir} --run ${relativeRunPath}`);
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
      case "lock-check":
        lockCheckCommand(args);
        break;
      case "verify-wave":
        verifyWaveCommand(args);
        break;
      case "regression-check":
        regressionCheckCommand(args);
        break;
      case "close-wave":
        await closeWaveCommand(args);
        break;
      case "capture-hooks":
        captureHooksCommand(args);
        break;
      case "sync-experience":
        await syncExperienceCommand(args);
        break;
      case "checkpoint-digest":
      case "snapshot":
        checkpointDigestCommand(args);
        break;
      case "repair-run":
        await repairRunCommand(args);
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
