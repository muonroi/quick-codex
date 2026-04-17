import fs from "node:fs";
import path from "node:path";

import { decideWrapperAction } from "./decision.js";
import { readActiveRunArtifact } from "./run-file.js";

const DIRECT_ROUTE = "direct";
const QC_FLOW_ROUTE = "qc-flow";
const QC_LOCK_ROUTE = "qc-lock";
const SAMPLE_RUN_BASENAMES = new Set(["sample-run.md"]);
const RESUME_INTENT_PATTERNS = [
  /\bresume\b/i,
  /\bcontinue\b/i,
  /\bactive run\b/i,
  /\bcurrent run\b/i,
  /\bsame task\b/i
];
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "only", "when", "then", "than",
  "make", "wrapper", "quick", "codex", "task", "tasks", "run", "runs", "active", "state", "more",
  "prefers", "prefer", "project", "already", "has"
]);

function tokenize(value) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
  );
}

function overlapCount(taskText, artifactText) {
  const taskTokens = tokenize(taskText);
  const artifactTokens = tokenize(artifactText);
  let count = 0;
  for (const token of taskTokens) {
    if (artifactTokens.has(token)) {
      count += 1;
    }
  }
  return count;
}

function artifactText(artifact) {
  return [
    artifact.name,
    artifact.goal,
    artifact.relativeRunPath,
    artifact.recommendedNextCommand,
    artifact.currentGate,
    artifact.currentPhaseWave
  ].filter(Boolean).join(" ");
}

function isBootstrapSampleArtifact(artifact) {
  return SAMPLE_RUN_BASENAMES.has(path.basename(artifact.relativeRunPath));
}

function workflowFromPrompt(prompt, fallbackRoute) {
  if (/\bUse \$qc-lock\b/i.test(prompt)) {
    return QC_LOCK_ROUTE;
  }
  if (/\bUse \$qc-flow\b/i.test(prompt)) {
    return QC_FLOW_ROUTE;
  }
  return fallbackRoute;
}

function normalizeRepoToken(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function listImmediateRepoNames(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function extractExplicitRepoTargets(task, dir) {
  const patterns = [
    /\b(?:repository|repo)\s+called\s+([a-z0-9][a-z0-9 _-]*)/ig,
    /\b(?:repository|repo)\s+named\s+([a-z0-9][a-z0-9 _-]*)/ig
  ];
  const childDirs = listImmediateRepoNames(dir);
  const childMap = new Map(childDirs.map((name) => [normalizeRepoToken(name), name]));
  const matches = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(task)) !== null) {
      const raw = match[1].trim().replace(/[.,;:!?]+$/, "");
      const normalized = normalizeRepoToken(raw);
      if (!normalized) {
        continue;
      }
      const repoName = childMap.get(normalized) ?? raw;
      matches.push({
        raw,
        normalized,
        repoName
      });
    }
  }
  return matches;
}

export function inspectActiveRunPreference({ dir, task, initialRoute, wrapperState }) {
  if (initialRoute === DIRECT_ROUTE) {
    return null;
  }

  const active = readActiveRunArtifact(dir);
  if (!active) {
    return null;
  }

  if (isBootstrapSampleArtifact(active.artifact)) {
    return null;
  }

  const explicitRepoTargets = extractExplicitRepoTargets(task, dir);
  if (explicitRepoTargets.length > 0) {
    const activeArtifactText = normalizeRepoToken(artifactText(active.artifact));
    const currentProjectToken = normalizeRepoToken(path.basename(dir));
    const mismatchedTarget = explicitRepoTargets.find((target) => (
      target.normalized !== currentProjectToken
      && !activeArtifactText.includes(target.normalized)
    ));
    if (mismatchedTarget) {
      return null;
    }
  }

  const overlap = overlapCount(task, artifactText(active.artifact));
  const resumeIntent = RESUME_INTENT_PATTERNS.some((pattern) => pattern.test(task));

  const suitable = resumeIntent || overlap >= 1;
  if (!suitable) {
    return null;
  }

  const continuation = decideWrapperAction({
    artifact: active.artifact,
    state: wrapperState,
    sameSession: false
  });

  const route = workflowFromPrompt(continuation.prompt, initialRoute);
  const reason = resumeIntent
    ? `The incoming task explicitly reads like a continuation request, so the active run ${active.artifact.relativeRunPath} wins over a generic raw-task prompt.`
    : `The incoming task overlaps with the active run ${active.artifact.relativeRunPath}, so the wrapper prefers artifact continuity over a generic raw-task prompt.`;

  return {
    route,
    activeRun: active.artifact.relativeRunPath,
    activeRunGate: active.artifact.currentGate,
    overlap,
    prompt: continuation.prompt,
    promptSource: "active-run",
    reason,
    mode: continuation.mode,
    resumableSessionId: continuation.resumableSessionId ?? null,
    resumableThreadId: continuation.resumableThreadId ?? null,
    sessionStrategy: continuation.sessionStrategy,
    handoffAction: continuation.handoffAction,
    nativeThreadAction: continuation.nativeThreadAction,
    chatActionEquivalent: continuation.chatActionEquivalent,
    wrapperCommandEquivalent: continuation.wrapperCommandEquivalent,
    summary: [
      `Route: ${route}`,
      `Reason: ${reason}`,
      `Active run: ${active.artifact.relativeRunPath}`,
      `Current gate: ${active.artifact.currentGate ?? "unknown"}`,
      `Prompt: ${continuation.prompt}`
    ].join("\n")
  };
}
