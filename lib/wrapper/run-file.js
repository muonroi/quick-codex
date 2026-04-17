import fs from "node:fs";
import path from "node:path";

const FLOW_DIRNAME = ".quick-codex-flow";
const STATE_FILENAME = "STATE.md";

function normalizeRelativePath(targetPath) {
  return targetPath.split(path.sep).join("/");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sectionText(text, heading) {
  const marker = `## ${heading}\n`;
  const start = text.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const sectionStart = start + marker.length;
  const remainder = text.slice(sectionStart);
  const nextHeadingIndex = remainder.search(/^## /m);
  if (nextHeadingIndex === -1) {
    return remainder.trimEnd();
  }
  return remainder.slice(0, nextHeadingIndex).trimEnd();
}

function findBulletValue(section, label) {
  if (!section) {
    return null;
  }
  const regex = new RegExp(`^- ${escapeRegex(label)}: (.+)$`, "m");
  const match = section.match(regex);
  return match ? match[1].trim() : null;
}

function findFirstBullet(section) {
  if (!section) {
    return null;
  }
  const match = section.match(/^- (.+)$/m);
  return match ? match[1].trim() : null;
}

function findBulletAfterLabel(section, label) {
  if (!section) {
    return null;
  }
  const regex = new RegExp(`${escapeRegex(label)}:\\n- (.+)$`, "m");
  const match = section.match(regex);
  return match ? match[1].trim() : null;
}

function stripMarkdownTicks(value) {
  if (!value) {
    return value;
  }
  return value.replace(/^`/, "").replace(/`$/, "");
}

function meaningfulBullets(section) {
  if (!section) {
    return [];
  }
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line && line.toLowerCase() !== "none");
}

function resolveRunPath(dir, run) {
  if (run) {
    return path.isAbsolute(run) ? run : path.resolve(dir, run);
  }

  const statePath = path.join(dir, FLOW_DIRNAME, STATE_FILENAME);
  if (!fs.existsSync(statePath)) {
    throw new Error(`No --run provided and ${path.relative(dir, statePath)} does not exist`);
  }
  const stateText = readText(statePath);
  const match = stateText.match(/Active run:\s*\n- (.+)$/m);
  if (!match || match[1].trim() === "none") {
    throw new Error(`No active run found in ${path.relative(dir, statePath)}`);
  }
  return path.resolve(dir, match[1].trim());
}

function parseArtifact(text, absoluteRunPath, dir) {
  const requirementBaseline = sectionText(text, "Requirement Baseline");
  const resumeDigest = sectionText(text, "Resume Digest");
  const compactSafeSummary = sectionText(text, "Compact-Safe Summary");
  const waveHandoff = sectionText(text, "Wave Handoff");
  const nextWavePack = sectionText(text, "Next Wave Pack");
  const currentStatus = sectionText(text, "Current Status");
  const recommendedNextCommand = sectionText(text, "Recommended Next Command");
  const blockers = sectionText(text, "Blockers");

  return {
    name: text.match(/^# Run: (.+)$/m)?.[1]?.trim() ?? path.basename(absoluteRunPath),
    absoluteRunPath,
    relativeRunPath: normalizeRelativePath(path.relative(dir, absoluteRunPath)),
    goal: findBulletAfterLabel(requirementBaseline, "Original goal") ?? findBulletValue(resumeDigest, "Goal"),
    currentGate: findBulletValue(resumeDigest, "Current gate"),
    currentPhaseWave: findBulletValue(resumeDigest, "Current phase / wave"),
    executionMode: findBulletValue(resumeDigest, "Execution mode"),
    recommendedNextCommand: stripMarkdownTicks(findFirstBullet(recommendedNextCommand) ?? findBulletValue(resumeDigest, "Recommended next command")),
    resumeDigest,
    compactSafeSummary: {
      phaseRelation: findBulletValue(compactSafeSummary, "Phase relation"),
      compactionAction: findBulletValue(compactSafeSummary, "Compaction action"),
      suggestedSessionAction: stripMarkdownTicks(findBulletValue(compactSafeSummary, "Suggested session action")),
      whatToForget: findBulletValue(compactSafeSummary, "What to forget"),
      whatMustRemainLoaded: findBulletValue(compactSafeSummary, "What must remain loaded"),
      nextVerify: stripMarkdownTicks(findBulletValue(compactSafeSummary, "Next verify")),
      resumeWith: stripMarkdownTicks(findBulletValue(compactSafeSummary, "Resume with"))
    },
    waveHandoff: {
      nextTarget: findBulletValue(waveHandoff, "Next target"),
      phaseRelation: findBulletValue(waveHandoff, "Phase relation"),
      suggestedSessionAction: stripMarkdownTicks(findBulletValue(waveHandoff, "Suggested session action")),
      whatToForget: findBulletValue(waveHandoff, "What to forget"),
      whatMustRemainLoaded: findBulletValue(waveHandoff, "What must remain loaded"),
      resumePayload: stripMarkdownTicks(findBulletValue(waveHandoff, "Resume payload"))
    },
    nextWavePack: {
      target: findBulletValue(nextWavePack, "Target"),
      phaseRelation: findBulletValue(nextWavePack, "Phase relation"),
      compactionAction: findBulletValue(nextWavePack, "Compaction action"),
      suggestedSessionAction: stripMarkdownTicks(findBulletValue(nextWavePack, "Suggested session action")),
      waveGoal: findBulletValue(nextWavePack, "Wave goal"),
      doneWhen: findBulletValue(nextWavePack, "Done when"),
      nextVerify: stripMarkdownTicks(findBulletValue(nextWavePack, "Next verify")),
      whatToForget: findBulletValue(nextWavePack, "What to forget"),
      whatMustRemainLoaded: findBulletValue(nextWavePack, "What must remain loaded"),
      resumePayload: stripMarkdownTicks(findBulletValue(nextWavePack, "Resume payload"))
    },
    currentStatus: {
      phase: findBulletValue(currentStatus, "Current phase"),
      wave: findBulletValue(currentStatus, "Current wave"),
      executionState: findBulletValue(currentStatus, "Execution state")
    },
    blockers: meaningfulBullets(blockers)
  };
}

function parseFlowState(text, dir) {
  const activeRunMatch = text.match(/Active run:\s*\n- (.+)$/m);
  const activeLockMatch = text.match(/Active lock:\s*\n- (.+)$/m);
  const currentGateMatch = text.match(/Current gate:\s*\n- (.+)$/m);
  const currentPhaseWaveMatch = text.match(/Current phase \/ wave:\s*\n- (.+)$/m);
  const executionModeMatch = text.match(/Execution mode:\s*\n- (.+)$/m);
  const statusMatch = text.match(/Status:\s*\n- (.+)$/m);

  const activeRun = activeRunMatch?.[1]?.trim() ?? "none";
  const activeLock = activeLockMatch?.[1]?.trim() ?? "none";

  return {
    activeRun,
    activeRunPath: activeRun === "none" ? null : path.resolve(dir, activeRun),
    activeLock,
    activeLockPath: activeLock === "none" ? null : path.resolve(dir, activeLock),
    currentGate: currentGateMatch?.[1]?.trim() ?? null,
    currentPhaseWave: currentPhaseWaveMatch?.[1]?.trim() ?? null,
    executionMode: executionModeMatch?.[1]?.trim() ?? null,
    status: statusMatch?.[1]?.trim() ?? null
  };
}

export function readRunArtifact({ dir, run }) {
  const absoluteRunPath = resolveRunPath(dir, run);
  if (!fs.existsSync(absoluteRunPath)) {
    throw new Error(`Run artifact not found: ${absoluteRunPath}`);
  }
  const text = readText(absoluteRunPath);
  return parseArtifact(text, absoluteRunPath, dir);
}

export function readFlowState(dir) {
  const statePath = path.join(dir, FLOW_DIRNAME, STATE_FILENAME);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return parseFlowState(readText(statePath), dir);
}

export function readActiveRunArtifact(dir) {
  const state = readFlowState(dir);
  if (!state || !state.activeRunPath || state.status === "done") {
    return null;
  }

  try {
    const artifact = readRunArtifact({ dir, run: state.activeRun });
    if (artifact.currentGate === "done") {
      return null;
    }
    return { state, artifact };
  } catch {
    return null;
  }
}
