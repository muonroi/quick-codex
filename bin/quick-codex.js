#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SKILLS = ["qc-flow", "qc-lock"];
const LEGACY_SKILLS = ["codex-gsd-flow", "codex-locked-loop"];
const DEFAULT_TARGET = path.join(os.homedir(), ".codex", "skills");
const BUDGET_MODES = new Set(["lean", "balanced", "deep"]);

function usage() {
  console.log(`Usage:
  quick-codex install [--copy] [--target <dir>]
  quick-codex doctor [--target <dir>]
  quick-codex init [--dir <project-dir>] [--force] [--budget-mode <lean|balanced|deep>]
  quick-codex upgrade [--copy] [--target <dir>]
  quick-codex uninstall [--target <dir>]
  quick-codex --help

Commands:
  install    Install qc-flow and qc-lock into ~/.codex/skills
  doctor     Check package shape, skill files, local install, and lint status
  init       Scaffold AGENTS.md guidance, .quick-codex-flow/, and a sample run artifact
  upgrade    Reinstall the skills into the target directory
  uninstall  Remove installed skills from the target directory
`);
}

function parseArgs(argv) {
  const result = {
    command: null,
    copy: false,
    force: false,
    target: DEFAULT_TARGET,
    dir: process.cwd(),
    budgetMode: "balanced"
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
      continue;
    }
    if (arg === "--budget-mode") {
      i += 1;
      if (i >= argv.length) {
        throw new Error("--budget-mode requires one of: lean, balanced, deep");
      }
      const mode = argv[i];
      if (!BUDGET_MODES.has(mode)) {
        throw new Error(`Invalid --budget-mode: ${mode}`);
      }
      result.budgetMode = mode;
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

function uninstallCommand({ target }) {
  let removed = 0;
  for (const skillName of [...SKILLS, ...LEGACY_SKILLS]) {
    const destDir = path.join(target, skillName);
    if (fs.existsSync(destDir)) {
      removeIfExists(destDir);
      removed += 1;
    }
  }
  console.log(`Removed ${removed} skill install(s) from ${target}.`);
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

function renderBudgetTemplate(content, budgetMode) {
  return content.replaceAll("{{BUDGET_MODE}}", budgetMode);
}

function printRecommendedPrompts(budgetMode) {
  console.log("");
  console.log(`Budget mode scaffolded: ${budgetMode}`);
  console.log("Recommended prompts:");
  console.log(`1. Use $qc-flow for this task in ${budgetMode} mode: <describe the non-trivial task>.`);
  console.log(`2. Prefer: Use $qc-flow and resume from .quick-codex-flow/<run-file>.md in ${budgetMode} mode.`);
  console.log(`3. Fallback after a clean session: Use $qc-flow to continue the active run from .quick-codex-flow/STATE.md in ${budgetMode} mode.`);
  console.log("4. Use $qc-lock for this task: execute <phase/wave> from .quick-codex-flow/<run-file>.md.");
}

function initCommand({ dir, force, budgetMode }) {
  ensureDir(dir);
  const agentsPath = path.join(dir, "AGENTS.md");
  const snippetPath = path.join(ROOT_DIR, "templates", "AGENTS.snippet.md");
  const snippet = renderBudgetTemplate(fs.readFileSync(snippetPath, "utf8"), budgetMode);

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
  const sampleRunContent = fs.readFileSync(sampleRun, "utf8").replace("- balanced\nWhy:\n- this sample shows the default profile without quota pressure", `- ${budgetMode}\nWhy:\n- this sample reflects the scaffolded budget profile`);
  const sampleResult = writeFileIfMissing(path.join(flowDir, "sample-run.md"), sampleRunContent);
  const stateResult = writeFileIfMissing(path.join(flowDir, "STATE.md"), fs.readFileSync(stateTemplate, "utf8"));

  console.log(`AGENTS scaffold: ${agentsResult}`);
  console.log(`.quick-codex-flow/README.md: ${readmeResult}`);
  console.log(`.quick-codex-flow/sample-run.md: ${sampleResult}`);
  console.log(`.quick-codex-flow/STATE.md: ${stateResult}`);
  printRecommendedPrompts(budgetMode);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

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
      default:
        throw new Error(`Unknown command: ${args.command}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
