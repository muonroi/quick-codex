import { spawn } from "node:child_process";
import process from "node:process";

// Electron (Chromium) refuses to run as root unless --no-sandbox is provided.
// We only add it when needed so local (non-root) developer machines keep the sandbox.
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const extraArgs = [];

if (isRoot) {
  extraArgs.push("--no-sandbox");
}

// Common Linux/WSL stability flags.
if (process.platform === "linux") {
  extraArgs.push("--disable-gpu");
}

// If there's no display, prefer running via `npm run dev:xvfb`.
if (process.platform === "linux") {
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!hasDisplay) {
    // Keep this message short; it prints to the terminal in dev workflows.
    // eslint-disable-next-line no-console
    console.error("[qc-electron] No DISPLAY/WAYLAND_DISPLAY detected. Try: npm run dev:xvfb");
  }
}

const child = spawn(
  process.platform === "win32" ? "electron.cmd" : "electron",
  [...extraArgs, "."],
  { stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
