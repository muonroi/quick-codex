#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NativeRemoteSession } from "../lib/wrapper/index.js";

function now() {
  return new Date().toISOString();
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-remote-smoke-"));
}

async function main() {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const tmpdir = mkTmpDir();
  const logPath = path.join(tmpdir, "smoke-log.jsonl");
  const logFd = fs.openSync(logPath, "a");

  const writeLog = (entry) => {
    fs.writeSync(logFd, `${JSON.stringify({ at: now(), ...entry })}\n`, "utf8");
  };

  const onProgress = (msg) => {
    writeLog({ event: "progress", msg });
    process.stderr.write(`[smoke] ${msg}\n`);
  };

  const session = new NativeRemoteSession({
    dir,
    stdioMode: "pty",
    forwardOutput: process.env.QC_SMOKE_FORWARD_OUTPUT === "1"
  });

  let ok = false;
  try {
    writeLog({ event: "start", dir });
    await session.start({ onProgress });

    await session.slash("/status", { onProgress });

    // Generate a resume token via /compact, then prove /clear + /resume works.
    await session.slash("/compact", { onProgress });
    const sessionId = session.observer.snapshot.sessionId;
    writeLog({ event: "compact-session-id", sessionId: sessionId ?? null });

    await session.slash("/clear", { onProgress });

    if (sessionId) {
      await session.slash(`/resume ${sessionId}`, { onProgress });
    } else {
      // Fallback: best effort resume of last saved session if /compact did not emit a session id.
      await session.slash("/resume --last", { onProgress });
    }

    ok = true;
    writeLog({ event: "ok" });
  } catch (error) {
    writeLog({ event: "error", message: error?.message ?? String(error), stack: error?.stack ?? null });
    try {
      const observerDump = session?.observer?.toJSON ? session.observer.toJSON() : null;
      if (observerDump) {
        const tailEvents = observerDump.events.slice(-40);
        writeLog({
          event: "observer-tail",
          snapshot: observerDump.snapshot,
          events: tailEvents
        });
      }
    } catch {
      // ignore
    }
  } finally {
    try {
      await session.stop();
    } catch (error) {
      writeLog({ event: "stop-error", message: error?.message ?? String(error) });
    }
    fs.closeSync(logFd);
  }

  process.stdout.write(`${JSON.stringify({ ok, tmpdir, logPath })}\n`);
  process.stdout.write(`TMPDIR=${tmpdir}\nLOG=${logPath}\n`);
  process.exit(ok ? 0 : 1);
}

main();
