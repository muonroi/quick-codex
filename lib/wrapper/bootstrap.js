import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUICK_CODEX_CLI = path.resolve(__dirname, "../../bin/quick-codex.js");
const FLOW_DIRNAME = ".quick-codex-flow";
const STATE_FILENAME = "STATE.md";

function flowStatePath(dir) {
  return path.join(dir, FLOW_DIRNAME, STATE_FILENAME);
}

export function inspectProjectBootstrap({ dir, route }) {
  const statePath = flowStatePath(dir);
  const scaffoldPresent = fs.existsSync(statePath);

  if (route !== "qc-flow") {
    return {
      route,
      scaffoldPresent,
      bootstrapRequired: false,
      summary: "Bootstrap is only relevant for qc-flow raw-task launches."
    };
  }

  if (scaffoldPresent) {
    return {
      route,
      scaffoldPresent: true,
      bootstrapRequired: false,
      summary: "Quick Codex scaffold already exists in this project."
    };
  }

  return {
    route,
    scaffoldPresent: false,
    bootstrapRequired: true,
    summary: "Quick Codex scaffold is missing and should be created before the first broad qc-flow launch."
  };
}

export function ensureProjectBootstrap({ dir, route, dryRun = false }) {
  const inspection = inspectProjectBootstrap({ dir, route });
  if (!inspection.bootstrapRequired) {
    return {
      ...inspection,
      bootstrapPerformed: false,
      bootstrapPlanned: false,
      stdout: "",
      stderr: "",
      status: 0
    };
  }

  if (dryRun) {
    return {
      ...inspection,
      bootstrapPerformed: false,
      bootstrapPlanned: true,
      summary: "Quick Codex scaffold is missing; wrapper would create it before a live qc-flow raw-task launch.",
      stdout: "",
      stderr: "",
      status: 0
    };
  }

  const result = spawnSync(process.execPath, [QUICK_CODEX_CLI, "init", "--dir", dir], {
    cwd: dir,
    env: {
      ...process.env,
      QUICK_CODEX_NO_UPDATE_CHECK: "1"
    },
    encoding: "utf8"
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(`quick-codex init failed for wrapper bootstrap: ${result.stderr || result.stdout}`.trim());
  }

  return {
    ...inspection,
    bootstrapRequired: false,
    scaffoldPresent: true,
    bootstrapPerformed: true,
    bootstrapPlanned: false,
    summary: "Quick Codex scaffold was created before the live qc-flow raw-task launch.",
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 0
  };
}
