/* global Terminal, FitAddon */

const term = new Terminal({
  convertEol: true,
  cursorBlink: true,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 13,
  theme: {
    background: "#0b0c10",
    foreground: "rgba(255,255,255,0.92)",
    cursor: "#68d391"
  }
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

const modeSelect = document.getElementById("mode");
const dirInput = document.getElementById("dir");
const maxTurnsInput = document.getElementById("maxTurns");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const taskInput = document.getElementById("task");
const sendBtn = document.getElementById("send");
const inputBar = document.getElementById("inputbar");

dirInput.value = (window.localStorage.getItem("qc_dir") || "").trim();

function writeSystem(line) {
  term.writeln(`\x1b[38;5;243m[qc]\x1b[0m ${line}`);
}

function updateUiForMode() {
  const mode = modeSelect.value;
  // In passthrough mode, the terminal itself is the input surface.
  // In orchestrated mode, we keep a separate task box to avoid fighting the native Codex TUI.
  const showTaskBox = mode !== "passthrough";
  inputBar.style.display = showTaskBox ? "flex" : "none";
  // Re-fit so the PTY dimensions match the new layout.
  setTimeout(() => {
    fitAddon.fit();
    resizePty().catch(() => {});
  }, 0);
}

async function resizePty() {
  const cols = term.cols || 120;
  const rows = term.rows || 40;
  await window.qc.resize(cols, rows);
}

window.addEventListener("resize", () => {
  fitAddon.fit();
  resizePty().catch(() => {});
});

const postOutputHooks = [
  // Hook signature: (chunk) => ({ chunk, drop? } | chunk)
  // Keep default identity hook for future orchestration (redaction, stream grouping, etc).
  (chunk) => chunk
];

function applyPostOutputHooks(chunk) {
  let current = chunk;
  for (const hook of postOutputHooks) {
    const next = hook(current);
    if (next && typeof next === "object" && Object.prototype.hasOwnProperty.call(next, "chunk")) {
      if (next.drop) return null;
      current = next.chunk;
      continue;
    }
    current = next;
  }
  return current;
}

window.qc.onData((data) => {
  const next = applyPostOutputHooks(data);
  if (next == null) return;
  term.write(String(next));
});

window.qc.onExit((data) => {
  writeSystem(`process exited (code=${data.exitCode})`);
});

window.qc.onStarted((data) => {
  writeSystem(`session started mode=${data.mode} dir=${data.dir}`);
  resizePty().catch(() => {});
});

window.qc.onStopped(() => {
  writeSystem("session stopped");
});

async function startSession() {
  const dir = dirInput.value.trim();
  if (dir) {
    window.localStorage.setItem("qc_dir", dir);
  }
  const mode = modeSelect.value;
  const maxTurns = Number(maxTurnsInput.value || 5);
  await window.qc.startSession({ mode, dir: dir || undefined, maxTurns });
}

async function stopSession() {
  await window.qc.stopSession();
}

const preInputHooks = [
  // Hook signature: ({ text, source }) => ({ text, handled? } | null)
  ({ text }) => {
    const trimmed = String(text || "").trim();
    if (!trimmed.startsWith("/qc")) return { text };
    const parts = trimmed.split(/\s+/);
    const cmd = parts[1] || "help";
    const rest = parts.slice(2).join(" ");

    if (cmd === "help") {
      writeSystem("Commands:");
      writeSystem("/qc help");
      writeSystem("/qc start | /qc stop");
      writeSystem("/qc mode passthrough|orchestrated");
      writeSystem("/qc dir <path>");
      writeSystem("/qc turns <n>");
      writeSystem("In passthrough mode: type directly into the terminal.");
      writeSystem("In orchestrated mode: use the task box.");
      return { handled: true, text: "" };
    }
    if (cmd === "mode") {
      const next = (rest || "").trim();
      if (!["passthrough", "orchestrated"].includes(next)) {
        writeSystem("Usage: /qc mode passthrough|orchestrated");
        return { handled: true, text: "" };
      }
      modeSelect.value = next;
      updateUiForMode();
      writeSystem(`mode=${next}`);
      return { handled: true, text: "" };
    }
    if (cmd === "dir") {
      if (!rest.trim()) {
        writeSystem("Usage: /qc dir <path>");
        return { handled: true, text: "" };
      }
      dirInput.value = rest.trim();
      window.localStorage.setItem("qc_dir", dirInput.value);
      writeSystem(`dir=${dirInput.value}`);
      return { handled: true, text: "" };
    }
    if (cmd === "turns") {
      const next = Number(rest.trim());
      if (!Number.isFinite(next) || next < 1) {
        writeSystem("Usage: /qc turns <positive-integer>");
        return { handled: true, text: "" };
      }
      maxTurnsInput.value = String(next);
      writeSystem(`maxTurns=${next}`);
      return { handled: true, text: "" };
    }
    if (cmd === "start") {
      startSession().catch((e) => writeSystem(`start failed: ${e.message}`));
      return { handled: true, text: "" };
    }
    if (cmd === "stop") {
      stopSession().catch((e) => writeSystem(`stop failed: ${e.message}`));
      return { handled: true, text: "" };
    }

    writeSystem("Unknown /qc command. Use /qc help.");
    return { handled: true, text: "" };
  }
];

function applyPreInputHooks(text, source) {
  let current = { text: String(text || ""), source, handled: false };
  for (const hook of preInputHooks) {
    const next = hook(current);
    if (next == null) return null;
    if (next.handled) return { ...current, ...next, handled: true };
    current = { ...current, ...next };
  }
  return current;
}

async function sendTask() {
  const text = taskInput.value.trim();
  if (!text) return;

  const pre = applyPreInputHooks(text, "taskbox");
  if (!pre) return;
  if (pre.handled) {
    taskInput.value = "";
    return;
  }

  const mode = modeSelect.value;
  if (mode === "orchestrated") {
    // In orchestrated mode we restart the wrapper follow-loop with the new task payload.
    const dir = dirInput.value.trim();
    const maxTurns = Number(maxTurnsInput.value || 5);
    await window.qc.startSession({ mode, dir: dir || undefined, maxTurns, task: pre.text });
    taskInput.value = "";
    return;
  }

  // Passthrough: write straight into PTY.
  await window.qc.write(`${pre.text}\r`);
  taskInput.value = "";
}

startBtn.addEventListener("click", () => startSession().catch((e) => writeSystem(`start failed: ${e.message}`)));
stopBtn.addEventListener("click", () => stopSession().catch((e) => writeSystem(`stop failed: ${e.message}`)));
sendBtn.addEventListener("click", () => sendTask().catch((e) => writeSystem(`send failed: ${e.message}`)));

taskInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendTask().catch((e) => writeSystem(`send failed: ${e.message}`));
  }
});

term.onData((data) => {
  const mode = modeSelect.value;
  if (mode !== "passthrough") {
    // Don't fight the native Codex TUI in orchestrated mode.
    return;
  }

  const pre = applyPreInputHooks(data, "terminal");
  if (!pre) return;
  if (pre.handled) return;
  window.qc.write(pre.text).catch(() => {});
});

modeSelect.addEventListener("change", updateUiForMode);
updateUiForMode();

writeSystem("ready.");
writeSystem("passthrough: type directly into the terminal. /qc help for controls.");
writeSystem("orchestrated: Start, then use the task box to submit a task to the qc native follow-loop.");
