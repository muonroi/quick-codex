import fs from "node:fs";
import path from "node:path";

const FLOW_DIRNAME = ".quick-codex-flow";
const CONFIG_FILENAME = "wrapper-config.json";

function configPath(dir) {
  return path.join(dir, FLOW_DIRNAME, CONFIG_FILENAME);
}

function mergeDefaults(source = {}) {
  const defaults = source.defaults ?? {};
  const chat = defaults.chat ?? {};
  return {
    version: 1,
    defaults: {
      permissionProfile: defaults.permissionProfile ?? "safe",
      approvalMode: defaults.approvalMode ?? null,
      executionProfile: defaults.executionProfile ?? "follow-safe",
      chat: {
        follow: chat.follow ?? true,
        maxTurns: chat.maxTurns ?? 5
      }
    }
  };
}

export function defaultWrapperConfig() {
  return mergeDefaults();
}

export function loadWrapperConfig(dir) {
  const filePath = configPath(dir);
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      ...defaultWrapperConfig()
    };
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    path: filePath,
    ...mergeDefaults(parsed)
  };
}
