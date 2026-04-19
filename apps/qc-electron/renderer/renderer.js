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

dirInput.value = (window.localStorage.getItem("qc_dir") || "").trim();

function writeSystem(line) {
  term.writeln(`\x1b[38;5;243m[qc]\x1b[0m ${line}`);
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

window.qc.onData((data) => {
  term.write(data);
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

async function sendTask() {
  const text = taskInput.value.trim();
  if (!text) return;

  // App-level commands: start orchestrated run from a task without retyping flags.
  if (text.startsWith("/qc ")) {
    const cmd = text.slice(4).trim();
    if (cmd === "start") {
      modeSelect.value = "orchestrated";
      await startSession();
      taskInput.value = "";
      return;
    }
    if (cmd === "stop") {
      await stopSession();
      taskInput.value = "";
      return;
    }
  }

  const mode = modeSelect.value;
  if (mode === "orchestrated") {
    // In orchestrated mode we restart the wrapper follow-loop with the new task payload.
    const dir = dirInput.value.trim();
    const maxTurns = Number(maxTurnsInput.value || 5);
    await window.qc.startSession({ mode, dir: dir || undefined, maxTurns, task: text });
    taskInput.value = "";
    return;
  }

  // Passthrough: write straight into PTY.
  await window.qc.write(`${text}\r`);
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

writeSystem("ready. Choose a mode and click Start.");
writeSystem("Tip: orchestrated mode restarts the qc native follow-loop per submitted task.");

