const DEFAULT_ROLES = [
  "correctness-invariants",
  "compatibility-blast-radius",
  "adversarial-verification"
];

const ROLE_SCOPES = {
  "correctness-invariants": "Check correctness, required outcomes, invariants, and gate-specific acceptance criteria.",
  "compatibility-blast-radius": "Check compatibility, protected boundaries, ownership, and downstream blast radius.",
  "adversarial-verification": "Challenge the conclusion with negative cases and verify that deterministic evidence is sufficient."
};

const RESOLVED_DISPOSITIONS = new Set(["resolved", "waived"]);

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function reviewerSection(text) {
  const source = String(text ?? "");
  const marker = /^## Reviewer Panels\r?\n/m.exec(source);
  if (!marker) return null;
  const remainder = source.slice(marker.index + marker[0].length);
  const nextHeading = remainder.search(/^## /m);
  return nextHeading === -1 ? remainder.trimEnd() : remainder.slice(0, nextHeading).trimEnd();
}

function markdownCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replaceAll("\\|", "|").trim());
}

function reviewerRole(index) {
  return DEFAULT_ROLES[index] ?? `independent-review-${index + 1}`;
}

export function buildReviewerAssignments({ gate, count = 3 } = {}) {
  const normalizedGate = normalized(gate);
  if (!normalizedGate) {
    throw new Error("Reviewer panel gate is required");
  }
  if (!Number.isInteger(count) || count < 2) {
    throw new Error("Reviewer panel count must be an integer of at least 2");
  }

  return Array.from({ length: count }, (_, index) => {
    const role = reviewerRole(index);
    return {
      id: `${normalizedGate}-reviewer-${index + 1}`,
      role,
      scope: ROLE_SCOPES[role] ?? `Perform independent review ${index + 1} for ${normalizedGate}.`,
      status: "assigned",
      verdict: "pending",
      evidenceRef: "none",
      disposition: "pending"
    };
  });
}

export function aggregateReviewerResults(panel) {
  const reviewers = Array.isArray(panel) ? panel : [];
  const blockers = [];
  if (reviewers.length < 2) {
    blockers.push("at least two independent reviewers are required");
  }

  const seenRoles = new Set();
  const seenIds = new Set();
  for (const reviewer of reviewers) {
    const id = String(reviewer?.id ?? "unknown-reviewer");
    if (seenIds.has(id)) {
      blockers.push(`${id}: duplicate reviewer id`);
    } else {
      seenIds.add(id);
    }
    const role = normalized(reviewer?.role);
    if (!role) {
      blockers.push(`${id}: reviewer role is missing`);
    } else if (seenRoles.has(role)) {
      blockers.push(`${id}: duplicate reviewer role ${role}`);
    } else {
      seenRoles.add(role);
    }

    const status = normalized(reviewer?.status);
    const verdict = normalized(reviewer?.verdict);
    const disposition = normalized(reviewer?.disposition);
    if (status !== "completed") {
      blockers.push(`${id}: reviewer is not completed`);
      continue;
    }
    const evidenceRef = normalized(reviewer?.evidenceRef);
    if (!evidenceRef || ["none", "pending", "not recorded"].includes(evidenceRef)) {
      blockers.push(`${id}: evidence reference is missing`);
    }
    if (!["pass", "block", "partial"].includes(verdict)) {
      blockers.push(`${id}: reviewer verdict is missing or invalid`);
    } else if (verdict !== "pass" && !RESOLVED_DISPOSITIONS.has(disposition)) {
      blockers.push(`${id}: ${verdict || "missing"} verdict is unresolved`);
    }
  }

  if (blockers.length === 0) {
    return { status: "pass", blockers: [] };
  }
  const hasUnfinished = blockers.some((blocker) => blocker.includes("not completed"));
  return { status: hasUnfinished ? "pending" : "blocked", blockers };
}

export function reviewerPanelForGate(metadata, gate, checkpoint = null) {
  const normalizedGate = normalized(gate);
  const candidates = (metadata?.reviewerPanels ?? []).filter((panel) => normalized(panel?.gate) === normalizedGate);
  if (checkpoint !== null) {
    return candidates.filter((panel) => String(panel?.checkpoint ?? "any") === String(checkpoint)).at(-1) ?? null;
  }
  return candidates.at(-1) ?? null;
}

export function reviewerGateViolation(metadata, gate, checkpoint = null) {
  if (!metadata?.hasReviewerPanelSection) {
    return null;
  }
  const panel = reviewerPanelForGate(metadata, gate, checkpoint);
  if (!panel || panel.legacy) {
    return `Reviewer panel for ${gate} is required`;
  }
  const aggregate = aggregateReviewerResults(panel.reviewers);
  if (aggregate.status === "pass") {
    return null;
  }
  return `Reviewer panel for ${gate} is ${aggregate.status}: ${aggregate.blockers.join("; ")}`;
}

export function reviewerPanelSummary(metadata, gate = null) {
  const panels = gate ? [reviewerPanelForGate(metadata, gate)].filter(Boolean) : (metadata?.reviewerPanels ?? []);
  if (panels.length === 0) {
    return metadata?.hasReviewerPanelSection ? "none assigned" : "legacy single-reviewer compatibility";
  }
  return panels.map((panel) => {
    const aggregate = panel.legacy
      ? { status: normalized(panel.reviewers?.[0]?.status) === "completed" ? "pass" : "pending" }
      : aggregateReviewerResults(panel.reviewers);
    const completed = (panel.reviewers ?? []).filter((reviewer) => normalized(reviewer.status) === "completed").length;
    const checkpoint = panel.checkpoint && !["any", "legacy"].includes(panel.checkpoint) ? `@${panel.checkpoint}` : "";
    return `${panel.gate}${checkpoint}: ${aggregate.status} (${completed}/${panel.reviewers?.length ?? 0} completed)${panel.legacy ? " [legacy]" : ""}`;
  }).join("; ");
}

export function parseReviewerPanels(text, legacyDelegations = []) {
  const section = reviewerSection(text);
  if (section === null) {
    const legacyPanels = legacyDelegations
      .filter((delegation) => delegation?.gate && delegation?.status)
      .map((delegation) => ({
        gate: normalized(delegation.gate),
        checkpoint: "legacy",
        legacy: true,
        aggregateSynthesis: "legacy single-reviewer compatibility",
        reviewers: [{
          id: `legacy-${normalized(delegation.gate)}-reviewer`,
          role: normalized(delegation.role) || "legacy-delegation",
          scope: delegation.scope ?? "legacy delegated checkpoint",
          status: normalized(delegation.status),
          verdict: normalized(delegation.verdict) || "pending",
          evidenceRef: delegation.evidenceRef ?? "legacy delegation section",
          disposition: delegation.disposition ?? "legacy"
        }]
      }));
    return { hasReviewerPanelSection: false, reviewerPanels: legacyPanels };
  }

  const lines = section.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\|\s*Gate\s*\|(?:\s*Checkpoint\s*\|)?\s*ID\s*\|/i.test(line));
  if (headerIndex === -1 || !lines[headerIndex + 1]?.includes("---")) {
    return { hasReviewerPanelSection: true, reviewerPanels: [] };
  }
  const headers = markdownCells(lines[headerIndex]);
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) break;
    const cells = markdownCells(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    if (record.Gate && record.ID) rows.push(record);
  }

  const grouped = new Map();
  for (const row of rows) {
    const gate = normalized(row.Gate);
    const checkpoint = row.Checkpoint || "any";
    const groupKey = `${gate}\u0000${checkpoint}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, { gate, checkpoint, reviewers: [] });
    grouped.get(groupKey).reviewers.push({
      id: row.ID,
      role: row.Role,
      scope: row.Scope,
      status: normalized(row.Status),
      verdict: normalized(row.Verdict),
      evidenceRef: row["Evidence Ref"],
      disposition: normalized(row.Disposition)
    });
  }
  const synthesis = new Map(
    lines
      .filter((line) => /^- [^:]+: /.test(line))
      .map((line) => line.slice(2).split(/:\s+/, 2))
      .map(([gate, value]) => [normalized(gate), value])
  );
  return {
    hasReviewerPanelSection: true,
    reviewerPanels: [...grouped.values()].map(({ gate, checkpoint, reviewers }) => ({
      gate,
      checkpoint,
      legacy: false,
      aggregateSynthesis: synthesis.get(normalized(`${gate}@${checkpoint}`)) ?? synthesis.get(gate) ?? "pending",
      reviewers
    }))
  };
}

export function renderReviewerPanelSection(panels) {
  const normalizedPanels = Array.isArray(panels) ? panels.filter((panel) => !panel?.legacy) : [];
  const synthesisLines = normalizedPanels.length === 0
    ? ["- none assigned"]
    : normalizedPanels.map((panel) => {
      const aggregate = aggregateReviewerResults(panel.reviewers);
      return `- ${panel.gate}@${panel.checkpoint ?? "any"}: ${aggregate.status}${aggregate.blockers.length > 0 ? ` — ${aggregate.blockers.join("; ")}` : " — all required reviewers passed"}`;
    });
  const rows = normalizedPanels.flatMap((panel) => (panel.reviewers ?? []).map((reviewer) => [
    panel.gate,
    panel.checkpoint ?? "any",
    reviewer.id,
    reviewer.role,
    reviewer.scope,
    reviewer.status,
    reviewer.verdict,
    reviewer.evidenceRef,
    reviewer.disposition
  ]));
  return [
    "Aggregate synthesis:",
    ...synthesisLines,
    "",
    "| Gate | Checkpoint | ID | Role | Scope | Status | Verdict | Evidence Ref | Disposition |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((cells) => `| ${cells.map((cell) => String(cell ?? "").replaceAll("|", "\\|")).join(" | ")} |`)
  ];
}

export { DEFAULT_ROLES };
