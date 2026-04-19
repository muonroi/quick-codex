import {
  buildCheckpointSummary,
  classifyAutoFollowStop,
  compileTaskPrompt,
  enforceQcFlowProtocol,
  enforceQcLockProtocol,
  ensureProjectBootstrap,
  inspectActiveRunPreference,
  loadWrapperConfig,
  loadWrapperState,
  readActiveLockArtifact,
  NativeRemoteSession,
  NativeSessionObserver,
  readActiveRunArtifact,
  resolveAutoContinuation,
  resolveExperienceModelRoute,
  resolveExperienceTaskRoute,
  resolvePermissionPolicy,
  routeTask
} from "./wrapper/index.js";

export function createQuickCodexHostApi(overrides = {}) {
  return Object.freeze({
    buildCheckpointSummary,
    classifyAutoFollowStop,
    compileTaskPrompt,
    createNativeSession: (options) => new NativeRemoteSession(options),
    createNativeSessionObserver: () => new NativeSessionObserver(),
    enforceQcFlowProtocol,
    enforceQcLockProtocol,
    ensureProjectBootstrap,
    inspectActiveRunPreference,
    loadWrapperConfig,
    loadWrapperState,
    readActiveLockArtifact,
    readActiveRunArtifact,
    resolveAutoContinuation,
    resolveExperienceModelRoute,
    resolveExperienceTaskRoute,
    resolvePermissionPolicy,
    routeTask,
    ...overrides
  });
}

export const defaultQuickCodexHostApi = createQuickCodexHostApi();
