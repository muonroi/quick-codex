import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";
import pty from "node-pty";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDir = process.env.QUICK_CODEX_DIR || process.cwd();
const wrapperBin = path.resolve(__dirname, "../../bin/quick-codex-wrap.js");

let win = null;
let proc = null;
let currentMode = "passthrough"; // passthrough | orchestrated

function spawnSession({ mode, dir, task, maxTurns = 5, args = [] }) {
  stopSession();
  currentMode = mode;

  const cwd = dir || defaultDir;

  // Mode semantics:
  // - passthrough: run raw codex; user types directly (native UI, no wrapper mediation)
  // - orchestrated: run quick-codex-wrap native follow loop; user types task in app input, wrapper drives Codex
  let command = null;
  let commandArgs = [];
  if (mode === "passthrough") {
    // Use shim-resolved `codex` by default; user can override QUICK_CODEX_BIN.
    const codexBin = process.env.QUICK_CODEX_BIN || "codex";
    command = codexBin;
    commandArgs = [...args];
  } else {
    const nodeBin = process.execPath;
    command = nodeBin;
    commandArgs = [
      wrapperBin,
      "chat",
      "--ui",
      "native",
      "--follow",
      "--max-turns",
      String(maxTurns),
      "--dir",
      cwd
    ];
    if (task) commandArgs.push("--task", task);
  }

  proc = pty.spawn(command, commandArgs, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd,
    env: process.env
  });

  proc.onData((data) => {
    win?.webContents.send("pty:data", data);
  });

  proc.onExit(({ exitCode }) => {
    win?.webContents.send("pty:exit", { exitCode });
    proc = null;
  });

  win?.webContents.send("session:started", { mode, dir: cwd });
}

function stopSession() {
  if (!proc) return;
  try {
    proc.kill();
  } catch {
    // ignore
  }
  proc = null;
  win?.webContents.send("session:stopped");
}

app.on("window-all-closed", () => {
  stopSession();
  app.quit();
});

app.whenReady().then(() => {
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

  ipcMain.handle("session:start", (_evt, payload) => {
    const mode = payload?.mode || "passthrough";
    const dir = payload?.dir || defaultDir;
    const task = payload?.task || null;
    const maxTurns = Number(payload?.maxTurns || 5);
    spawnSession({ mode, dir, task, maxTurns, args: payload?.args || [] });
    return { ok: true };
  });

  ipcMain.handle("session:stop", () => {
    stopSession();
    return { ok: true };
  });

  ipcMain.handle("pty:write", (_evt, payload) => {
    if (!proc) return { ok: false, error: "no-process" };
    const text = String(payload?.text || "");
    // In orchestrated mode, direct typing into the PTY is discouraged (wrapper owns injection).
    // Still allow it for escape hatches.
    proc.write(text);
    return { ok: true };
  });

  ipcMain.handle("pty:resize", (_evt, payload) => {
    if (!proc) return { ok: false, error: "no-process" };
    const cols = Math.max(20, Math.min(400, Number(payload?.cols || 120)));
    const rows = Math.max(10, Math.min(200, Number(payload?.rows || 40)));
    try {
      proc.resize(cols, rows);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "resize-failed" };
    }
  });
});
