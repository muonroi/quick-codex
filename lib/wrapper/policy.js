const PERMISSION_PROFILE_PRESETS = {
  safe: {
    permissionProfile: "safe",
    sandboxMode: "workspace-write",
    approvalPolicy: "on-request",
    bypassApprovalsAndSandbox: false
  },
  full: {
    permissionProfile: "full",
    sandboxMode: "danger-full-access",
    approvalPolicy: "never",
    bypassApprovalsAndSandbox: false
  },
  yolo: {
    permissionProfile: "yolo",
    sandboxMode: "danger-full-access",
    approvalPolicy: "never",
    bypassApprovalsAndSandbox: true
  },
  readonly: {
    permissionProfile: "readonly",
    sandboxMode: "read-only",
    approvalPolicy: "on-request",
    bypassApprovalsAndSandbox: false
  }
};

const APPROVAL_MODE_ALIASES = {
  manual: "on-request",
  "manual-accept": "on-request",
  autonomous: "never",
  auto: "never",
  readonly: "on-request",
  "on-request": "on-request",
  untrusted: "untrusted",
  never: "never"
};

function normalizeApprovalMode(value) {
  if (!value) {
    return null;
  }
  const normalized = APPROVAL_MODE_ALIASES[String(value).trim().toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported approval mode: ${value}`);
  }
  return normalized;
}

function normalizePermissionProfile(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PERMISSION_PROFILE_PRESETS, normalized)) {
    throw new Error(`Unsupported permission profile: ${value}`);
  }
  return normalized;
}

function normalizeExecutionProfile(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!["fast", "safe", "follow-safe"].includes(normalized)) {
    throw new Error(`Unsupported execution profile: ${value}`);
  }
  return normalized;
}

export function permissionProfileNames() {
  return Object.keys(PERMISSION_PROFILE_PRESETS);
}

export function approvalModeNames() {
  return ["manual", "autonomous", "untrusted", "on-request", "never"];
}

export function executionProfileNames() {
  return ["fast", "safe", "follow-safe"];
}

export function resolveExecutionProfile({
  explicitExecutionProfile = null,
  wrapperConfig = null
} = {}) {
  return normalizeExecutionProfile(
    explicitExecutionProfile
      ?? wrapperConfig?.defaults?.executionProfile
      ?? "follow-safe"
  );
}

export function resolvePermissionPolicy({
  explicitPermissionProfile = null,
  explicitApprovalMode = null,
  wrapperConfig = null
} = {}) {
  const permissionProfile = normalizePermissionProfile(
    explicitPermissionProfile
      ?? wrapperConfig?.defaults?.permissionProfile
      ?? "safe"
  );
  const approvalPolicy = normalizeApprovalMode(
    explicitApprovalMode
      ?? wrapperConfig?.defaults?.approvalMode
      ?? PERMISSION_PROFILE_PRESETS[permissionProfile].approvalPolicy
  );
  const preset = PERMISSION_PROFILE_PRESETS[permissionProfile];
  return {
    permissionProfile,
    approvalPolicy,
    sandboxMode: preset.sandboxMode,
    bypassApprovalsAndSandbox: preset.bypassApprovalsAndSandbox,
    source: {
      permissionProfile: explicitPermissionProfile ? "cli" : (wrapperConfig?.path ? "repo-config" : "default"),
      approvalPolicy: explicitApprovalMode ? "cli" : (wrapperConfig?.defaults?.approvalMode ? "repo-config" : "profile-default")
    }
  };
}
