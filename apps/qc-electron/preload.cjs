const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qc", {
  startSession: (payload) => ipcRenderer.invoke("session:start", payload),
  stopSession: () => ipcRenderer.invoke("session:stop"),
  write: (text) => ipcRenderer.invoke("pty:write", { text }),
  resize: (cols, rows) => ipcRenderer.invoke("pty:resize", { cols, rows }),
  onData: (handler) => {
    ipcRenderer.on("pty:data", (_evt, data) => handler(data));
  },
  onExit: (handler) => {
    ipcRenderer.on("pty:exit", (_evt, data) => handler(data));
  },
  onStarted: (handler) => {
    ipcRenderer.on("session:started", (_evt, data) => handler(data));
  },
  onStopped: (handler) => {
    ipcRenderer.on("session:stopped", () => handler());
  }
});

