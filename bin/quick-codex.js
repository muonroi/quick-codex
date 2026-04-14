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
  install    Install qc-flow and qc-lock into ~/.codex/skills
  doctor     Check package shape, skill files, local install, and lint status
  init       Scaffold AGENTS.md guidance, .quick-codex-flow/, and a sample run artifact
  status     Show the current active run, gate, risks, experience constraints, and next command
  resume     Print the exact next prompt(s) plus active experience constraints to resume safely
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
    dir: process.cwd(),
    dirExplicit: false,
    run: null,
    input: null,
    tool: null,
    toolInput: null,
    toolInputFile: null,
    engineUrl: null,
    timeoutMs: 3000
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
    if (arg === "--input") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--input requires a path");
      }
      result.input = path.resolve(argv[i]);
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

function findSectionBulletValue(text, heading, label) {
  const bullets = findSectionBullets(text, heading);
  for (const bullet of bullets) {
    if (bullet.startsWith(`${label}:`)) {
      return bullet.slice(`${label}:`.length).trim();
    }
  }
  return null;
}

function detectArtifactType(runPath, text) {
  if (runPath.includes(".quick-codex-lock") || text.includes("## Locked Plan")) {
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

  console.log(`Project: ${dir}`);
  console.log(`Active run: ${relativeRunPath}`);
  console.log(`Current gate: ${metadata.currentGate ?? "unknown"}`);
  console.log("Do not forget:");
  console.log(`- Experience constraints: ${summarizeList(metadata.experienceConstraints)}`);
  console.log(`- Hook-derived invariants: ${summarizeList(metadata.experienceHookInvariants)}`);
  console.log(`- Warnings to respect on next step: ${summarizeList(metadata.experienceActiveWarnings)}`);
  console.log("Paste one of these next:");
  for (const command of commands) {
    console.log(`- ${command}`);
  }
}

function checkpointDigestLines(metadata, relativeRunPath, { preferExisting = true } = {}) {
  if (preferExisting && metadata.compactSafeSummary.length > 0) {
    return metadata.compactSafeSummary;
  }

  const phaseWave = phaseWaveFromMetadata(metadata);
  const requirements = metadata.requirementsStillSatisfied.length > 0
    ? metadata.requirementsStillSatisfied.join(", ")
    : "not recorded";
  const resumeWith = metadata.recommendedCommands[0]
    ?? defaultResumeCommand(relativeRunPath, metadata.artifactType);

  return [
    `Goal: ${metadata.goal ?? "not recorded"}`,
    `Current gate: ${metadata.currentGate ?? "unknown"}`,
    `Current phase / wave: ${phaseWave.phase} / ${phaseWave.wave}`,
    `Requirements still satisfied: ${requirements}`,
    `Remaining blockers: ${metadata.blockers ?? "none"}`,
    `Experience constraints: ${summarizeList(metadata.experienceConstraints)}`,
    `Active hook-derived invariants: ${summarizeList(metadata.experienceHookInvariants)}`,
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

  console.log(`Project: ${dir}`);
  console.log(`Active run: ${relativeRunPath}`);
  console.log("Compact-safe handoff:");
  for (const line of lines) {
    console.log(`- ${line}`);
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
  const lockCurrentStep = findLabelValueInSection(text, "Locked Plan", "Current step")
    ?? findLabelValue(text, "Current step");
  const lockCurrentVerify = findSectionLabelBullets(text, "Locked Plan", "Current verify");
  const lockRecommendedCommands = findSectionLabelBullets(text, "Locked Plan", "Recommended next command");
  const lockBlockers = findSectionLabelBullets(text, "Locked Plan", "Blockers");
  const lockRequirementsStillSatisfied = findSectionLabelBullets(text, "Locked Plan", "Requirements still satisfied");
  const lockVerificationEvidence = findSectionLabelBullets(text, "Locked Plan", "Verification evidence");
  const lockExperienceInputs = findSectionLabelBullets(text, "Locked Plan", "Experience inputs");

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
    requirementsStillSatisfied: uniqueValues([
      ...findSectionBullets(text, "Requirements Still Satisfied"),
      ...lockRequirementsStillSatisfied
    ]),
    verificationEvidence: lockVerificationEvidence,
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
    summaryExperienceConstraints: findSectionBulletValue(text, "Compact-Safe Summary", "Experience constraints"),
    summaryHookInvariants: findSectionBulletValue(text, "Compact-Safe Summary", "Active hook-derived invariants")
  };
}

function repairRunCommand({ dir, run }) {
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

  nextText = replaceOrInsertSection(nextText, "Resume Digest", resumeDigestLines(metadata, relativeRunPath), "Requirement Baseline");
  nextText = replaceOrInsertSection(nextText, "Compact-Safe Summary", compactSafeSummaryLines(metadata, relativeRunPath), "Resume Digest");
  nextText = replaceOrInsertSection(nextText, "Experience Snapshot", metadata.hasExperienceSnapshot
    ? experienceSnapshotLines(metadata)
    : defaultExperienceSnapshotLines(), "Approval Strategy");
  fs.writeFileSync(runPath, nextText, "utf8");

  const repairedMetadata = runMetadata(runPath);
  fs.writeFileSync(statePath, renderStateFile(relativeRunPath, repairedMetadata), "utf8");

  console.log(`Repaired run: ${relativeRunPath}`);
  console.log("Refreshed:");
  console.log("- Resume Digest");
  console.log("- Compact-Safe Summary");
  console.log("- Experience Snapshot");
  console.log(`- ${relPathFrom(dir, statePath)}`);
}

function doctorRunCommand({ dir, run }) {
  const runPath = resolveRunPath(dir, run);
  const metadata = runMetadata(runPath);
  const text = metadata.text;
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
    ["Experience Snapshot", metadata.hasExperienceSnapshot],
    ["Current gate", metadata.currentGate !== null],
    ["Execution mode", metadata.executionMode !== null],
    ["Burn Risk", metadata.burnRisk !== null],
    ["Approval Strategy", metadata.approvalStrategy !== null],
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
    ["Locked Plan", text.includes("## Locked Plan")],
    ["Current gate", metadata.currentGate !== null],
    ["Current execution position", metadata.currentPhase !== null && (metadata.currentStep !== null || metadata.currentWave !== null)],
    ["Current verify", metadata.nextVerify !== null],
    ["Recommended Next Command", metadata.recommendedCommands.length > 0],
    ["Blockers", text.includes("Blockers:")],
    ["Verification evidence", metadata.verificationEvidence.length > 0],
    ["Requirements still satisfied", metadata.requirementsStillSatisfied.length > 0],
    ["Ignored warning feedback ids", missingIgnoredWarningFeedback.length === 0]
  ];
  const checks = metadata.artifactType === "lock" ? lockChecks : flowChecks;

  let failed = false;
  console.log(`Run: ${relPathFrom(dir, runPath)}`);
  for (const [name, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}: ${name}`);
    if (!passed) {
      failed = true;
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
    const expectedPointer = metadata.artifactType === "lock"
      ? (activeLock ?? activeRun)
      : activeRun;
    const expectedPath = expectedPointer ? path.resolve(dir, expectedPointer) : null;
    const stateMatches = expectedPath === runPath;
    const pointerLabel = metadata.artifactType === "lock" ? "lock pointer" : "active run";
    console.log(`${stateMatches ? "PASS" : "WARN"}: STATE.md ${pointerLabel} ${stateMatches ? "matches" : "does not match"} this run`);
  } else {
    console.log("WARN: STATE.md not found");
  }

  if (failed) {
    console.log(`Suggested fix: node bin/quick-codex.js repair-run --dir ${dir} --run ${relPathFrom(dir, runPath)}`);
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
        repairRunCommand(args);
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
