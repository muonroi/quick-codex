import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";

const h = React.createElement;

function useTerminalDimensions() {
  const { stdout } = useStdout();
  const resolve = () => {
    const target = stdout ?? process.stdout;
    return [
      Number(target?.columns || process.stdout?.columns || 80),
      Number(target?.rows || process.stdout?.rows || 40)
    ];
  };
  const [dimensions, setDimensions] = useState(resolve);

  useEffect(() => {
    const target = stdout ?? process.stdout;
    if (!target || !target.isTTY || typeof target.on !== "function") {
      return;
    }
    const onResize = () => setDimensions(resolve());
    target.on("resize", onResize);
    return () => {
      if (typeof target.off === "function") {
        target.off("resize", onResize);
      } else if (typeof target.removeListener === "function") {
        target.removeListener("resize", onResize);
      }
    };
  }, [stdout]);

  return dimensions;
}

function compactText(value, max = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function entryTint(type) {
  switch (type) {
    case "progress":
      return "cyan";
    case "response":
      return "green";
    case "error":
      return "red";
    case "disambiguation":
      return "yellow";
    case "banner":
      return "magenta";
    default:
      return "white";
  }
}

function isMilestoneProgress(text) {
  const value = String(text ?? "");
  if (!value) {
    return false;
  }
  return /^(\[wrapper\]\s*)?(route=|model=|reason=|bootstrap=|continuation run=|follow-stop=|follow-turn=|analyzing task=|launching adapter=|native-(bridge|slash|choice)=)/.test(value);
}

function formatStatus(status = {}) {
  return [
    ["Dir", status.dir ?? "-"],
    ["Profile", status.executionProfile ?? "-"],
    ["Follow", status.follow ? "on" : "off"],
    ["Max turns", String(status.maxTurns ?? 0)],
    ["Run", status.activeRun ?? "none"],
    ["Gate", status.activeGate ?? "-"],
    ["Route", status.routeOverride ?? "auto"],
    ["Perm", status.permissionProfile ?? "safe"],
    ["Approval", status.approvalMode ?? "on-request"],
    ["Thread", status.activeThreadId ?? "none"],
    ["Model", status.activeModel ?? "default"]
  ];
}

function formatResponseSummary(response) {
  const trace = response?.trace ?? null;
  const model = trace?.model?.selected ?? response.model ?? "default";
  const adapter = trace?.adapter ?? response.adapter ?? "unknown";
  const route = trace?.route ?? response.route ?? "artifact";
  const metadata = [
    `route=${route}`,
    `adapter=${adapter}`,
    `model=${model}`,
    `perm=${trace?.policy?.permissionProfile ?? response.permissionProfile ?? "safe"}`,
    `approval=${trace?.policy?.approvalPolicy ?? response.approvalPolicy ?? "on-request"}`,
    `turns=${response.turnsExecuted ?? 1}`
  ];
  if (response.stoppedBecause) {
    metadata.push(`stop=${response.stoppedBecause}`);
  }
  if (response.threadId) {
    metadata.push(`thread=${response.threadId}`);
  }
  return metadata.join(" | ");
}

function responseBody(response) {
  if (!response) {
    return "";
  }
  if (response.final?.text) {
    // Preserve Codex output as-is; only normalize Windows newlines for stable TUI rendering.
    return String(response.final.text).replace(/\r/g, "");
  }
  if (response.lastMessage) {
    return String(response.lastMessage).replace(/\r/g, "");
  }
  if (response.summary) {
    return String(response.summary).replace(/\r/g, "");
  }
  return "(No final assistant message was captured.)";
}

function truncateLines(text, maxLines = 24) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  if (lines.length <= maxLines) {
    return { text: lines.join("\n"), truncated: false, total: lines.length };
  }
  const head = lines.slice(0, maxLines).join("\n");
  return { text: `${head}\n\n… (${lines.length - maxLines} more lines truncated)`, truncated: true, total: lines.length };
}

function truncateWithTail(text, headLines = 10, tailLines = 10) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const total = lines.length;
  if (total <= headLines + tailLines + 2) {
    return { text: lines.join("\n"), truncated: false, total };
  }
  const head = lines.slice(0, headLines).join("\n");
  const tail = lines.slice(Math.max(headLines, total - tailLines)).join("\n");
  return {
    text: `${head}\n\n… (${total - headLines - tailLines} lines omitted) …\n\n${tail}`,
    truncated: true,
    total
  };
}

function clampInt(value, min, max) {
  const parsed = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(max, Math.max(min, parsed));
}

function sliceTextLines(text, offset, maxLines) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const total = lines.length;
  const safeMax = Math.max(1, maxLines);
  const maxOffset = Math.max(0, total - safeMax);
  const safeOffset = clampInt(offset, 0, maxOffset);
  const window = lines.slice(safeOffset, safeOffset + safeMax).join("\n");
  return { window, total, offset: safeOffset, maxOffset };
}

function formatTraceLine(trace) {
  if (!trace) {
    return "";
  }
  const parts = [];
  if (trace.route) parts.push(`route=${trace.route}`);
  if (trace.routeSource) parts.push(`source=${trace.routeSource}`);
  if (trace.model?.selected) parts.push(`model=${trace.model.selected}`);
  if (trace.model?.reasoningEffort) parts.push(`reasoning=${trace.model.reasoningEffort}`);
  if (trace.adapter) parts.push(`adapter=${trace.adapter}`);
  if (trace.sessionStrategy) parts.push(`session=${trace.sessionStrategy}`);
  if (trace.handoffAction) parts.push(`handoff=${trace.handoffAction}`);
  return parts.join(" | ");
}

function formatArtifactLine(snapshot) {
  if (!snapshot) {
    return "";
  }
  const parts = [];
  if (snapshot.run) parts.push(`run=${snapshot.run}`);
  if (snapshot.gate) parts.push(`gate=${snapshot.gate}`);
  if (snapshot.phaseWave) parts.push(`phase=${snapshot.phaseWave}`);
  return parts.join(" | ");
}

function normalizeEntry(entry) {
  const id = entry.id ?? null;
  if (entry.type === "response") {
    const full = responseBody(entry.response);
    const preview = truncateLines(full, 26);
    return {
      id,
      type: "response",
      headline: formatResponseSummary(entry.response),
      body: compactText(preview.text, 280),
      response: entry.response
    };
  }

  if (entry.type === "disambiguation") {
    return {
      id,
      type: "disambiguation",
      headline: "Task needs clarification",
      body: compactText(entry.text, 280),
      decision: entry.decision
    };
  }

  return {
    id,
    type: entry.type,
    headline: compactText(entry.text, 220),
    body: entry.body ? compactText(entry.body, 280) : ""
  };
}

function ActivityPane({ entries, height }) {
  const visible = entries.slice(-10);
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, flexGrow: 1, height },
    h(Text, { color: "cyanBright" }, "Activity"),
    h(
      Box,
      { flexDirection: "column" },
      ...visible.map((entry, index) =>
        h(
          Box,
          { key: entry.id ?? `${entry.type}-${index}`, flexDirection: "column" },
          h(Text, { color: entryTint(entry.type), wrap: "truncate" }, entry.headline),
          entry.body ? h(Text, { dimColor: true, wrap: "truncate" }, entry.body) : null
        )
      )
    )
  );
}

function SidePane({ status, latestDisambiguation, busy, lastProgress, height }) {
  const statusRows = formatStatus(status);
  const nextHint = status?.activeRun
    ? `Use /continue to resume ${status.activeRun} (${status.activeGate ?? "unknown"}).`
    : "Type a task to route it through the wrapper.";
  const recommended = status?.recommendedNextCommand ? compactText(status.recommendedNextCommand, 120) : "";
  return h(
    Box,
    { width: 42, flexDirection: "column", marginLeft: 1, height },
    h(
      Box,
      { flexDirection: "column", borderStyle: "round", borderColor: "green", paddingX: 1 },
      h(Text, { color: "greenBright" }, "Session"),
      ...statusRows.map(([label, value]) =>
        h(
          Text,
          { key: label },
          h(Text, { color: "gray" }, `${label}:`),
          ` ${compactText(value, 26)}`
        )
      ),
      h(
        Text,
        null,
        h(Text, { color: "gray" }, "State:"),
        h(Text, { wrap: "truncate" }, ` ${busy ? (lastProgress ? compactText(lastProgress, 32) : "working") : "idle"}`)
      )
    ),
    h(
      Box,
      { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, marginTop: 1 },
      h(Text, { color: "yellowBright" }, "Next Action"),
      latestDisambiguation
        ? [
            h(Text, { key: "hint", dimColor: true }, "Enter a number or type a clearer task."),
            h(
              Box,
              { key: "options", flexDirection: "column", marginTop: 1 },
              ...latestDisambiguation.options.map((option, index) =>
                h(
                  Box,
                  { key: option.id ?? `${index + 1}`, flexDirection: "column", marginBottom: 1 },
                  h(Text, { color: "yellow" }, `${index + 1}. ${option.label}${option.route ? ` [${option.route}]` : ""}`),
                  option.description ? h(Text, { dimColor: true }, compactText(option.description, 56)) : null
                )
              )
            )
          ]
        : [
            h(Text, { key: "hint", dimColor: true }, nextHint),
            recommended ? h(Text, { key: "recommended", dimColor: true }, `Next: ${recommended}`) : null,
            h(Text, { key: "slash-hint", dimColor: true }, "Slash commands:"),
            h(Text, { key: "slash-line-1" }, "/help  /status  /continue  /route"),
            h(Text, { key: "slash-line-2" }, "/perm  /approval  /mode  /follow"),
            h(Text, { key: "slash-line-3" }, "/turns  /task"),
            h(Text, { key: "slash-note", dimColor: true }, "Or just type a normal task below.")
          ]
    )
  );
}

function ResponsePane({ response, busy, mode = "short", scrollOffset = 0, viewportLines = 12, height = null, metaWidth = 42 }) {
  const summary = response ? formatResponseSummary(response) : "No result yet";
  const traceLine = response?.trace ? formatTraceLine(response.trace) : "";
  const artifactLine = response?.artifactSnapshot ? formatArtifactLine(response.artifactSnapshot) : "";

  const output = response ? responseBody(response) : "";
  const windowed = sliceTextLines(output, scrollOffset, viewportLines);
  const body = response
    ? windowed.window
    : "Submit a task to see the routed result and raw assistant output here.";

  return h(
    Box,
    { flexDirection: "row", height },
    h(
      Box,
      { flexDirection: "column", borderStyle: "round", borderColor: "magenta", paddingX: 1, flexGrow: 1 },
      h(Text, { color: "magentaBright", bold: true }, "Output"),
      response
        ? h(
            Text,
            { dimColor: true, wrap: "truncate" },
            `Scroll: PgUp/PgDn or Ctrl+Up/Ctrl+Down, Home/End (${windowed.offset + 1}-${Math.min(windowed.offset + viewportLines, windowed.total)} of ${windowed.total})`
          )
        : null,
      h(Text, { color: "white", wrap: "wrap" }, body)
    ),
    h(
      Box,
      { width: metaWidth, flexDirection: "column", borderStyle: "round", borderColor: "blue", paddingX: 1, marginLeft: 1 },
      h(Text, { color: "blueBright", bold: true }, "Meta"),
      h(Text, { color: busy ? "yellow" : "green", wrap: "truncate" }, summary),
      traceLine ? h(Text, { color: "cyan", wrap: "truncate" }, traceLine) : h(Text, { dimColor: true }, "trace: -"),
      artifactLine ? h(Text, { color: "yellow", wrap: "truncate" }, artifactLine) : h(Text, { dimColor: true }, "artifact: -"),
      h(Text, { dimColor: true, wrap: "truncate" }, `mode=${mode}`)
    )
  );
}

function Header({ sessionName, bannerLines }) {
  const safeBanner = (bannerLines ?? []).slice(0, 3);
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "blue", paddingX: 1 },
    h(Text, { color: "blueBright" }, sessionName),
    ...safeBanner.map((line, index) => h(Text, { key: `banner-${index}`, dimColor: true, wrap: "truncate" }, line))
  );
}

function App({ session, bannerLines, sessionName }) {
  const { exit } = useApp();
  const [termWidth, termHeight] = useTerminalDimensions();
  const [input, setInput] = useState("");
  // Keep banner in the header only; duplicating it in Activity causes vertical growth + "pushed-up" layout.
  const [entries, setEntries] = useState(() => []);
  const [status, setStatus] = useState(session.getStatus());
  const [busy, setBusy] = useState(false);
  const [busySeconds, setBusySeconds] = useState(0);
  const [resultMode, setResultMode] = useState("short"); // short | full
  const [resultScroll, setResultScroll] = useState(0);
  const [lastProgress, setLastProgress] = useState("");
  const [latestDisambiguation, setLatestDisambiguation] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);

  const busySince = useRef(0);

  useEffect(() => () => {
    session.close().catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!busy) {
      setBusySeconds(0);
      return;
    }
    const timer = setInterval(() => {
      const elapsed = busySince.current ? Math.floor((Date.now() - busySince.current) / 1000) : 0;
      setBusySeconds(elapsed);
    }, 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const statusTimer = useRef(null);
  const pendingStatus = useRef(false);
  const progressTimer = useRef(null);
  const pendingProgress = useRef("");
  const entrySeq = useRef(0);

  const scheduleStatusSync = () => {
    pendingStatus.current = true;
    if (statusTimer.current) {
      return;
    }
    statusTimer.current = setTimeout(() => {
      statusTimer.current = null;
      if (!pendingStatus.current) {
        return;
      }
      pendingStatus.current = false;
      setStatus(session.getStatus());
    }, 250);
  };

  const scheduleProgressSync = (text) => {
    pendingProgress.current = text;
    if (progressTimer.current) {
      return;
    }
    progressTimer.current = setTimeout(() => {
      progressTimer.current = null;
      setLastProgress(pendingProgress.current);
      scheduleStatusSync();
    }, 250);
  };

  const promptLabel = useMemo(() => (busy ? "working>" : "codex>"), [busy]);

  const appendEntry = (entry) => {
    const normalized = normalizeEntry({ ...entry, id: entry.id ?? `${Date.now()}-${(entrySeq.current += 1)}` });
    if (entry.type === "progress") {
      // Progress can be very chatty (follow loops + exec tickers). Keeping it out of the Activity
      // pane avoids full-screen reflow flicker on fast streams.
      scheduleProgressSync(entry.text);
      if (isMilestoneProgress(entry.text)) {
        setEntries((current) => [...current, normalized]);
      }
      return;
    }
    if (entry.type === "disambiguation") {
      setLatestDisambiguation(entry.decision);
    }
    if (entry.type === "response") {
      setLastResponse(entry.response);
      // Default to the bottom so the operator sees the conclusion immediately.
      setResultScroll(1e9);
      setLatestDisambiguation(null);
      setLastProgress("");
    }
    setEntries((current) => [...current, normalized]);
    scheduleStatusSync();
  };

  // Result scrolling (only meaningful in /result full).
  const headerLines = 2 + 1 + Math.min(3, (bannerLines ?? []).length); // border + title + banner cap
  const inputLines = 3; // bordered input row
  const responseChromeLines = 5; // Result title + summary + optional trace + optional artifact + label
  const responseHeight = Math.max(10, Math.min(18, Number(process.env.QUICK_CODEX_TUI_RESULT_HEIGHT ?? 14) || 14));
  const remaining = Math.max(8, (termHeight || 40) - headerLines - responseHeight - inputLines - 2 /* gutters */);
  const mainHeight = remaining;
  const viewportLines = Math.max(6, Math.min(22, responseHeight - responseChromeLines));

  useInput((_, key) => {
    if (!lastResponse || busy) {
      return;
    }
    const page = viewportLines;
    if (key.pageDown) {
      setResultScroll((current) => current + page);
      return;
    }
    if (key.pageUp) {
      setResultScroll((current) => Math.max(0, current - page));
      return;
    }
    if (key.ctrl && key.downArrow) {
      setResultScroll((current) => current + 3);
      return;
    }
    if (key.ctrl && key.upArrow) {
      setResultScroll((current) => Math.max(0, current - 3));
      return;
    }
    if (key.home) {
      setResultScroll(0);
      return;
    }
    if (key.end) {
      setResultScroll(1e9);
    }
  });

  const submit = async (line) => {
    const trimmed = line.trim();
    if (!trimmed || busy) {
      return;
    }
    if (trimmed === "/result") {
      appendEntry({ type: "progress", text: `resultMode=${resultMode}` });
      return;
    }
    if (trimmed.startsWith("/result ")) {
      const mode = trimmed.slice("/result ".length).trim().toLowerCase();
      if (mode === "short" || mode === "full") {
        setResultMode(mode);
        setResultScroll(0);
        appendEntry({ type: "progress", text: `resultMode=${mode}` });
      } else {
        appendEntry({ type: "error", text: "Usage: /result short|full" });
      }
      return;
    }
    setBusy(true);
    busySince.current = Date.now();
    setInput("");
    try {
      const result = await session.submit(trimmed, appendEntry);
      scheduleStatusSync();
      if (result.exit) {
        await session.close();
        exit();
      }
    } catch (error) {
      appendEntry({ type: "error", text: error.message });
    } finally {
      setBusy(false);
      busySince.current = 0;
      scheduleStatusSync();
    }
  };

  return h(
    Box,
    { flexDirection: "column", width: termWidth || undefined },
    h(Header, { sessionName, bannerLines }),
    h(
      Box,
      { marginTop: 1, height: mainHeight },
      h(ActivityPane, { entries, height: mainHeight }),
      h(SidePane, { status, latestDisambiguation, busy, lastProgress, height: mainHeight })
    ),
    h(ResponsePane, { response: lastResponse, busy, mode: resultMode, scrollOffset: resultScroll, viewportLines, height: responseHeight, metaWidth: 42 }),
    h(
      Box,
      { borderStyle: "round", borderColor: "white", paddingX: 1, marginTop: 1 },
      h(
        Box,
        // Fixed-width prompt indicator to prevent the input field from shifting while the spinner animates.
        { marginRight: 1, width: 10 },
        h(
          Text,
          { color: busy ? "yellow" : "cyan" },
          busy ? `work(${busySeconds}s)>` : promptLabel
        )
      ),
      h(
        Box,
        { flexGrow: 1 },
        h(TextInput, {
          value: input,
          onChange: setInput,
          onSubmit: submit,
          placeholder: latestDisambiguation ? "Choose a number or type a clearer task…" : "Type a task or slash command… (/result full)"
        })
      )
    )
  );
}

export async function runRichChatRenderer({ session, bannerLines, sessionName = "Quick Codex rich shell" }) {
  const app = render(h(App, { session, bannerLines, sessionName }));
  await app.waitUntilExit();
}
