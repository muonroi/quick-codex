import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { createFileExclusive, writeFileAtomic } from "./atomic-fs.js";

const FLOW_DIRNAME = ".quick-codex-flow";
const SESSIONS_DIRNAME = "sessions";
const LOCK_DIRNAME = ".quick-codex-lock";
const MANIFEST_FILENAME = ".session.json";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function assertSafeIdentity(value, label = "session identity") {
  if (typeof value !== "string" || !SAFE_ID.test(value) || value === "." || value === "..") {
    throw new Error(`Unsafe ${label}: ${String(value)}`);
  }
  return value;
}

function assertContained(parent, target) {
  const relative = path.relative(parent, target);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`Session path escapes its namespace: ${target}`);
}

function storagePaths(dir) {
  const projectDir = path.resolve(dir);
  const flowRoot = path.join(projectDir, FLOW_DIRNAME);
  return {
    projectDir,
    flowRoot,
    sessionsRoot: path.join(flowRoot, SESSIONS_DIRNAME)
  };
}

function readManifest(manifestPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      throw new Error("manifest is not an object");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw new Error(`Could not read session manifest ${manifestPath}: ${error.message}`);
  }
}

function sessionRootFor(sessionsRoot, id) {
  const root = path.resolve(sessionsRoot, id);
  assertContained(sessionsRoot, root);
  return root;
}

function buildContext({ projectDir, sessionsRoot, kind, id, root, source, ownerNonce = null, parent = null, relativeRunPath = null }) {
  const context = {
    kind,
    id,
    root,
    statePath: path.join(root, "STATE.md"),
    runsDir: path.join(root, "runs"),
    locksDir: kind === "legacy" ? path.join(projectDir, LOCK_DIRNAME) : path.join(root, "locks"),
    wrapperStatePath: path.join(root, "wrapper-state.json"),
    projectRoadmapPath: path.join(root, "PROJECT-ROADMAP.md"),
    backlogPath: path.join(root, "BACKLOG.md"),
    manifestPath: kind === "legacy" ? null : path.join(root, MANIFEST_FILENAME),
    relativeRunPath,
    source,
    ownerNonce,
    parent
  };
  return Object.freeze(context);
}

function writeManifestExclusive(root, manifest) {
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, MANIFEST_FILENAME);
  try {
    createFileExclusive(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
    const existing = readManifest(manifestPath);
    if (!existing || existing.id !== manifest.id || existing.kind !== manifest.kind) {
      throw new Error(`Session namespace has an incompatible manifest: ${root}`);
    }
    if (existing.ownerNonce !== manifest.ownerNonce) {
      throw new Error(`Session namespace ${manifest.id} is owned by another nonce`);
    }
    return existing;
  }
}

function materializeFinalContext({ projectDir, sessionsRoot, id, source, parent = null, ownerNonce = randomUUID(), requireNewRoot = false }) {
  const root = sessionRootFor(sessionsRoot, id);
  if (requireNewRoot) {
    fs.mkdirSync(sessionsRoot, { recursive: true });
    try {
      fs.mkdirSync(root, { recursive: false });
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      if (!readManifest(path.join(root, MANIFEST_FILENAME))) {
        throw new Error(`Cannot fork into an existing session namespace: ${id}`);
      }
    }
  }
  const manifest = writeManifestExclusive(root, {
    id,
    kind: "session",
    source,
    ownerNonce,
    parent
  });
  return buildContext({
    projectDir,
    sessionsRoot,
    kind: "session",
    id,
    root,
    source: manifest.source,
    ownerNonce: manifest.ownerNonce,
    parent: manifest.parent ?? null
  });
}

function legacyContext({ projectDir, run = null }) {
  const root = path.join(projectDir, FLOW_DIRNAME);
  return buildContext({
    projectDir,
    sessionsRoot: path.join(root, SESSIONS_DIRNAME),
    kind: "legacy",
    id: "legacy",
    root,
    source: "legacy",
    relativeRunPath: run ? normalizePath(path.relative(root, path.resolve(projectDir, run))) : null
  });
}

function runOwner({ projectDir, sessionsRoot, run }) {
  if (!run) {
    return null;
  }
  const absoluteRunPath = path.resolve(projectDir, run);
  const sessionRelative = path.relative(sessionsRoot, absoluteRunPath);
  const [id, ...remainder] = sessionRelative.split(path.sep);
  if (id && remainder.length > 0 && !sessionRelative.startsWith(`..${path.sep}`) && sessionRelative !== ".." && !path.isAbsolute(sessionRelative)) {
    const sessionId = assertSafeIdentity(id);
    const manifest = readManifest(path.join(sessionRootFor(sessionsRoot, sessionId), MANIFEST_FILENAME));
    if (!manifest || manifest.kind !== "session" || manifest.id !== sessionId || !manifest.ownerNonce) {
      throw new Error(`--run session namespace has no valid owner manifest: ${run}`);
    }
    return {
      id: sessionId,
      ownerNonce: manifest.ownerNonce,
      relativeRunPath: normalizePath(remainder.join(path.sep))
    };
  }

  const flowRoot = path.join(projectDir, FLOW_DIRNAME);
  const lockRoot = path.join(projectDir, LOCK_DIRNAME);
  for (const legacyRoot of [flowRoot, lockRoot]) {
    const relative = path.relative(legacyRoot, absoluteRunPath);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
      return { legacy: true, relativeRunPath: normalizePath(path.relative(projectDir, absoluteRunPath)) };
    }
  }
  throw new Error(`--run must point inside a known session or legacy namespace: ${run}`);
}

function trustedIdentity(env) {
  return env.CODEX_THREAD_ID ?? env.CODEX_SESSION_ID ?? null;
}

export function createProvisionalContext({ dir, env = process.env, parent = null } = {}) {
  const { projectDir, sessionsRoot } = storagePaths(dir);
  fs.mkdirSync(sessionsRoot, { recursive: true });
  const ownerNonce = randomUUID();
  const id = `pending-${randomUUID()}`;
  const root = sessionRootFor(sessionsRoot, id);
  fs.mkdirSync(root, { recursive: false });
  const manifest = {
    id,
    kind: "provisional",
    source: "provisional",
    ownerNonce,
    parent: parent?.id ?? parent ?? null
  };
  writeManifestExclusive(root, manifest);
  return buildContext({
    projectDir,
    sessionsRoot,
    kind: "provisional",
    id,
    root,
    source: manifest.source,
    ownerNonce,
    parent: manifest.parent
  });
}

export function resolveSessionContext({ dir, run = null, sessionId = null, legacy = false, createProvisional = false, env = process.env, ownerNonce = null } = {}) {
  const { projectDir, sessionsRoot } = storagePaths(dir);
  const owner = runOwner({ projectDir, sessionsRoot, run });
  const requestedId = sessionId == null ? null : assertSafeIdentity(sessionId);

  if (owner?.legacy) {
    if (requestedId) {
      throw new Error("--run and --session must agree; the selected --run is legacy");
    }
    return legacyContext({ projectDir, run });
  }

  if (owner?.id && requestedId && owner.id !== requestedId) {
    throw new Error(`--run and --session must agree; ${owner.id} does not match ${requestedId}`);
  }

  const id = owner?.id ?? requestedId ?? trustedIdentity(env);
  if (id) {
    const source = owner?.id ? "explicit-run" : requestedId ? "explicit-session" : "trusted-environment";
    const context = materializeFinalContext({
      projectDir,
      sessionsRoot,
      id: assertSafeIdentity(id),
      source,
      ownerNonce: owner?.ownerNonce ?? ownerNonce ?? randomUUID()
    });
    return Object.freeze({ ...context, relativeRunPath: owner?.relativeRunPath ?? null });
  }

  if (legacy) {
    return legacyContext({ projectDir, run });
  }
  if (createProvisional) {
    return createProvisionalContext({ dir: projectDir, env });
  }
  throw new Error("No session identity is available. Provide --session, --run, or a trusted Codex thread ID.");
}

export function promoteSessionContext({ context, threadId } = {}) {
  if (!context || context.kind !== "provisional") {
    throw new Error("Only a provisional session context can be promoted");
  }
  const id = assertSafeIdentity(threadId, "thread identity");
  const { projectDir, sessionsRoot } = storagePaths(path.resolve(context.root, "..", "..", ".."));
  assertContained(sessionsRoot, context.root);
  const currentManifest = readManifest(context.manifestPath);
  if (!currentManifest || currentManifest.ownerNonce !== context.ownerNonce) {
    throw new Error("Provisional session ownership changed before promotion");
  }

  const targetRoot = sessionRootFor(sessionsRoot, id);
  const targetManifestPath = path.join(targetRoot, MANIFEST_FILENAME);
  const targetManifest = readManifest(targetManifestPath);
  if (targetManifest) {
    if (targetManifest.ownerNonce !== context.ownerNonce) {
      throw new Error(`Final namespace ${id} is owned by another nonce`);
    }
    return buildContext({
      projectDir,
      sessionsRoot,
      kind: "session",
      id,
      root: targetRoot,
      source: targetManifest.source,
      ownerNonce: targetManifest.ownerNonce,
      parent: targetManifest.parent ?? null
    });
  }

  fs.renameSync(context.root, targetRoot);
  const promotedManifest = {
    ...currentManifest,
    id,
    kind: "session",
    source: "promotion"
  };
  writeFileAtomic(path.join(targetRoot, MANIFEST_FILENAME), `${JSON.stringify(promotedManifest, null, 2)}\n`);
  return buildContext({
    projectDir,
    sessionsRoot,
    kind: "session",
    id,
    root: targetRoot,
    source: promotedManifest.source,
    ownerNonce: promotedManifest.ownerNonce,
    parent: promotedManifest.parent ?? null
  });
}

export function forkSessionContext({ dir, parent, threadId } = {}) {
  const id = assertSafeIdentity(threadId, "thread identity");
  const parentId = parent?.id ?? parent;
  if (parentId != null) {
    assertSafeIdentity(parentId, "parent identity");
  }
  const { projectDir, sessionsRoot } = storagePaths(dir);
  return materializeFinalContext({
    projectDir,
    sessionsRoot,
    id,
    source: "fork",
    parent: parentId ?? null,
    requireNewRoot: true
  });
}
