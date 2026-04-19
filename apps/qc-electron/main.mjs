import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

import { ElectronSessionManager } from "./session-manager.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDir = process.env.QUICK_CODEX_DIR || process.cwd();

let win = null;
const sessionManager = new ElectronSessionManager();

function emit(channel, payload) {
  win?.webContents.send(channel, payload);
}

app.on("window-all-closed", () => {
  sessionManager.stopSession().catch(() => {});
  app.quit();
});

app.whenReady().then(() => {
  sessionManager.on("output", (payload) => emit("pty:data", payload.chunk));
  sessionManager.on("started", (payload) => emit("session:started", payload));
  sessionManager.on("stopped", (payload) => emit("session:stopped", payload));
  sessionManager.on("status", (payload) => emit("session:status", payload));
  sessionManager.on("session-event", (payload) => emit("session:event", payload));

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#0b0c10",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  const smokeExitMs = Number(process.env.QUICK_CODEX_ELECTRON_SMOKE_EXIT_MS || 0);
  if (Number.isFinite(smokeExitMs) && smokeExitMs > 0) {
    setTimeout(() => {
      sessionManager.stopSession().catch(() => {}).finally(() => {
        app.quit();
      });
    }, smokeExitMs);
  }

  ipcMain.handle("session:start", async (_evt, payload) => {
    const mode = payload?.mode || "passthrough";
    const dir = payload?.dir || defaultDir;
    const maxTurns = Number(payload?.maxTurns || 5);
    const cols = payload?.cols != null ? Number(payload.cols) : null;
    const rows = payload?.rows != null ? Number(payload.rows) : null;
    const result = await sessionManager.startSession({ mode, dir, maxTurns, cols, rows });
    return { ok: true, result };
  });

  ipcMain.handle("session:stop", async () => {
    await sessionManager.stopSession();
    return { ok: true };
  });

  ipcMain.handle("session:submit-task", async (_evt, payload) => {
    const result = await sessionManager.submitTask(payload?.task || "");
    return { ok: true, result };
  });

  ipcMain.handle("session:slash", async (_evt, payload) => {
    const result = await sessionManager.slash(payload?.command || "");
    return { ok: true, result };
  });

  ipcMain.handle("session:status:get", () => {
    return { ok: true, result: sessionManager.snapshot() };
  });

  ipcMain.handle("pty:write", async (_evt, payload) => {
    await sessionManager.writeRaw(String(payload?.text || ""));
    return { ok: true };
  });

  ipcMain.handle("pty:resize", (_evt, payload) => {
    const ok = sessionManager.resize(payload?.cols, payload?.rows);
    return { ok };
  });
});
