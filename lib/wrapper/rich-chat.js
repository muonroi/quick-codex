import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, render, useApp } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";

const h = React.createElement;

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
  const metadata = [
    `route=${response.route ?? "artifact"}`,
    `adapter=${response.adapter ?? "unknown"}`,
    `model=${response.model ?? "default"}`,
    `perm=${response.permissionProfile ?? "safe"}`,
    `approval=${response.approvalPolicy ?? "on-request"}`,
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
  if (response.lastMessage) {
    return String(response.lastMessage).trim();
  }
  if (response.summary) {
    return String(response.summary).trim();
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

function ActivityPane({ entries }) {
  const visible = entries.slice(-18);
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, flexGrow: 1 },
    h(Text, { color: "cyanBright" }, "Activity"),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...visible.map((entry, index) =>
        h(
          Box,
          { key: entry.id ?? `${entry.type}-${index}`, flexDirection: "column", marginBottom: entry.body ? 1 : 0 },
          h(Text, { color: entryTint(entry.type) }, entry.headline),
          entry.body ? h(Text, { dimColor: true, wrap: "truncate" }, entry.body) : null
        )
      )
    )
  );
}

function SidePane({ status, latestDisambiguation, busy, lastProgress }) {
  const statusRows = formatStatus(status);
  const nextHint = status?.activeRun
    ? `Use /continue to resume ${status.activeRun} (${status.activeGate ?? "unknown"}).`
    : "Type a task to route it through the wrapper.";
  const recommended = status?.recommendedNextCommand ? compactText(status.recommendedNextCommand, 120) : "";
  return h(
    Box,
    { width: 42, flexDirection: "column", marginLeft: 1 },
    h(
      Box,
      { flexDirection: "column", borderStyle: "round", borderColor: "green", paddingX: 1, marginBottom: 1 },
      h(Text, { color: "greenBright" }, "Session"),
      ...statusRows.map(([label, value]) =>
        h(
          Text,
          { key: label },
          h(Text, { color: "gray" }, `${label}:`),
          ` ${value}`
        )
      ),
      h(
        Text,
        null,
        h(Text, { color: "gray" }, "State:"),
        ` ${busy ? (lastProgress ? compactText(lastProgress, 40) : "working") : "idle"}`
      )
    ),
    h(
      Box,
      { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1 },
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

function ResponsePane({ response, busy }) {
  const summary = response ? formatResponseSummary(response) : "No result yet";
  const full = response ? responseBody(response) : "";
  const preview = truncateLines(full, 22);
  const body = response
    ? `${preview.text}${preview.truncated && response.outputLastMessagePath ? `\n\nFull output: ${response.outputLastMessagePath}` : ""}`
    : "Submit a task to see the routed result, summary, and stop reason here.";
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "magenta", paddingX: 1, marginTop: 1 },
    h(Text, { color: "magentaBright" }, "Result"),
    h(Text, { color: busy ? "yellow" : "green" }, summary),
    h(Text, { wrap: "truncate" }, body)
  );
}

function Header({ sessionName, bannerLines }) {
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "blue", paddingX: 1, marginBottom: 1 },
    h(Text, { color: "blueBright" }, sessionName),
    ...bannerLines.map((line, index) => h(Text, { key: `banner-${index}`, dimColor: true }, line))
  );
}

function App({ session, bannerLines, sessionName }) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState(() => bannerLines.map((line) => normalizeEntry({ type: "banner", text: line })));
  const [status, setStatus] = useState(session.getStatus());
  const [busy, setBusy] = useState(false);
  const [lastProgress, setLastProgress] = useState("");
  const [latestDisambiguation, setLatestDisambiguation] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);

  useEffect(() => () => {
    session.close().catch(() => {});
  }, [session]);

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
    }, 90);
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
    }, 90);
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
      setLatestDisambiguation(null);
      setLastProgress("");
    }
    setEntries((current) => [...current, normalized]);
    scheduleStatusSync();
  };

  const submit = async (line) => {
    const trimmed = line.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
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
      scheduleStatusSync();
    }
  };

  return h(
    Box,
    { flexDirection: "column" },
    h(Header, { sessionName, bannerLines }),
    h(
      Box,
      null,
      h(ActivityPane, { entries }),
      h(SidePane, { status, latestDisambiguation, busy, lastProgress })
    ),
    h(ResponsePane, { response: lastResponse, busy }),
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
          busy ? h(Spinner, { type: "line" }) : promptLabel
        )
      ),
      h(
        Box,
        { flexGrow: 1 },
        h(TextInput, {
          value: input,
          onChange: setInput,
          onSubmit: submit,
          placeholder: latestDisambiguation ? "Choose a number or type a clearer task…" : "Type a task or slash command…"
        })
      )
    )
  );
}

export async function runRichChatRenderer({ session, bannerLines, sessionName = "Quick Codex rich shell" }) {
  const app = render(h(App, { session, bannerLines, sessionName }));
  await app.waitUntilExit();
}
