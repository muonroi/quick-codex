import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workspaceSiblingElectronHostBin = path.resolve(repoRoot, "..", "quick-codex-electron", "scripts", "run-electron.mjs");

function makeRequire(fromPath) {
  return createRequire(path.join(fromPath, "__quick_codex_resolve__.cjs"));
}

function tryResolve(specifier, searchFrom) {
  try {
    return makeRequire(searchFrom).resolve(specifier);
  } catch {
    return null;
  }
}

export function resolveElectronHostBin({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.QUICK_CODEX_ELECTRON_HOST_BIN) {
    return env.QUICK_CODEX_ELECTRON_HOST_BIN;
  }

  const resolvedPackageScript = tryResolve("@quick-codex/qc-electron/scripts/run-electron.mjs", cwd)
    ?? tryResolve("@quick-codex/qc-electron/scripts/run-electron.mjs", repoRoot);
  if (resolvedPackageScript) {
    return resolvedPackageScript;
  }

  const siblingScript = tryResolve("./scripts/run-electron.mjs", path.resolve(repoRoot, "..", "quick-codex-electron"));
  if (siblingScript) {
    return siblingScript;
  }

  if (tryResolve("./scripts/run-electron.mjs", path.dirname(path.dirname(workspaceSiblingElectronHostBin)))) {
    return workspaceSiblingElectronHostBin;
  }

  throw new Error(
    "Could not resolve the Electron host. Install @quick-codex/qc-electron, keep a sibling quick-codex-electron workspace repo, or set QUICK_CODEX_ELECTRON_HOST_BIN."
  );
}

export function resolveElectronHostAppDir(options = {}) {
  return path.dirname(path.dirname(resolveElectronHostBin(options)));
}
