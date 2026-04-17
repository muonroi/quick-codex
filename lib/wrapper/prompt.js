function lines(values) {
  return values.filter(Boolean).join("\n");
}

function bootstrapLines(projectState) {
  if (!projectState) {
    return [];
  }

  if (projectState.bootstrapPerformed) {
    return [
      "Wrapper bootstrap: Quick Codex scaffold was created before launch."
    ];
  }

  if (projectState.bootstrapPlanned) {
    return [
      "Wrapper bootstrap: Quick Codex scaffold is missing; the live run should create it before broad planning."
    ];
  }

  if (projectState.route === "qc-flow" && projectState.scaffoldPresent) {
    return [
      "Wrapper bootstrap: Quick Codex scaffold already exists in this project."
    ];
  }

  return [];
}

export function compileTaskPrompt({ route, task, reason, projectState = null }) {
  const normalizedTask = task.replace(/\s+/g, " ").trim();
  const bootstrap = bootstrapLines(projectState);

  if (route === "qc-lock") {
    return lines([
      "Wrapper route: qc-lock",
      `Reason: ${reason}`,
      ...bootstrap,
      "",
      `Use $qc-lock for this task: ${normalizedTask}`,
      "Keep the scope tight, name the protected boundaries, verify after each step, and hand control back to qc-flow if a gray area reopens."
    ]);
  }

  if (route === "direct") {
    return lines([
      "Wrapper route: direct",
      `Reason: ${reason}`,
      ...bootstrap,
      "",
      normalizedTask,
      "If the task grows beyond a focused read-only answer or one safe execution step, switch to $qc-flow instead of improvising workflow state in chat."
    ]);
  }

  return lines([
    "Wrapper route: qc-flow",
    `Reason: ${reason}`,
    ...bootstrap,
    "",
    `Use $qc-flow for this task: ${normalizedTask}`,
    "Treat Quick Codex artifacts as the source of truth. If this project only has scaffold files, create or update a task-specific run artifact under .quick-codex-flow/ and align STATE.md before broader planning. Only switch to qc-lock when the remaining work is execution-only."
  ]);
}
