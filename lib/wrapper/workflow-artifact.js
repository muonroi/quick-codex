import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export function section(text, heading) {
  return text.replace(/\r\n/g, "\n").match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"))?.[1] ?? "";
}

export function stateValue(text, label) {
  const body = section(text, "Current Status");
  return body.match(new RegExp(`^(?:- )?${label}:[ \\t]*([^\\n]+)`, "m"))?.[1]?.trim() ?? null;
}

export function isLeanArtifact(text) {
  return /^Artifact profile: lean\s*$/m.test(text);
}

export function replaceSection(text, heading, body) {
  const normalized = text.replace(/\r\n/g, "\n");
  const pattern = new RegExp(`^## ${heading}\\n[\\s\\S]*?(?=^## |$(?![\\s\\S]))`, "m");
  const content = `## ${heading}\n${body.trim()}\n\n`;
  return pattern.test(normalized) ? normalized.replace(pattern, () => content) : `${normalized.trimEnd()}\n\n${content}`;
}

export function renderCurrentState(metadata) {
  return [
    `Current gate: ${metadata.currentGate}`,
    `Current phase: ${metadata.currentPhase}`,
    `Current wave: ${metadata.currentWave}`,
    `Execution state: ${metadata.executionState}`,
    `Execution mode: ${metadata.executionMode ?? "auto"}`,
    `Blockers: ${metadata.blockers ?? "none"}`,
    `Next verify: ${metadata.nextVerify ?? "none"}`,
    `Recommended next command: ${metadata.recommendedCommands?.[0] ?? "none"}`
  ].join("\n");
}

// A row names an observable path (for example cache-hit or cache-miss), not a
// subjective completion claim. Commands stay sequential and are deduplicated.
export function verificationPlan(text) {
  if ((text.match(/^## Verification Plan\s*$/gm) ?? []).length > 1) throw new Error("Duplicate Verification Plan sections");
  const body = section(text, "Verification Plan");
  if (!body) return [];
  const rows = body.split("\n").filter((line) => line.trim().startsWith("|"));
  if (rows.length < 3) throw new Error("Verification Plan requires Group, Kind, Command rows");
  const cells = (line) => line.trim().slice(1, -1).split("|").map((s) => s.trim());
  const header = cells(rows[0]);
  if (header.join(",") !== "Group,Kind,Command") throw new Error("Verification Plan columns must be Group | Kind | Command");
  const groups = rows.slice(2).map((line) => {
    const values = cells(line);
    if (values.length !== 3 || values.some((s) => !s)) throw new Error("Incomplete verification group");
    const [group, kind, raw] = values;
    const command = raw.replace(/^`(.*)`$/, "$1");
    if (!/^(preflight|build|test|consumer|deployed)$/.test(kind)) throw new Error(`Unknown verification kind: ${kind}`);
    if (command === "..." || /<[^>]+>/.test(command)) throw new Error(`Verification group ${group} needs an executable command`);
    return { group, kind, command };
  });
  if (new Set(groups.map((g) => g.group)).size !== groups.length) throw new Error("Verification group names must be unique");
  return groups;
}

export function orderedVerificationCommands(plan) {
  return [...new Set([...plan.filter((g) => g.kind === "preflight"), ...plan.filter((g) => g.kind === "build"), ...plan.filter((g) => !["preflight", "build"].includes(g.kind))].map((g) => g.command))];
}

// Bind receipts to source bytes, including dirty and untracked source. Workflow
// artifacts are excluded so writing evidence cannot invalidate its own receipt.
export function verificationFingerprint(dir, text, commands) {
  const hash = createHash("sha256").update(JSON.stringify({ commands, plan: section(text, "Verification Plan"), wave: section(text, "Current Execution Wave") }));
  const git = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."], { cwd: dir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (git.error) throw new Error(`Cannot fingerprint verification source: ${git.error.message}`);
  if (git.status !== 0) {
    if (!/not a git repository/i.test(git.stderr ?? "")) throw new Error(`Cannot fingerprint verification source: ${git.stderr}`);
    return { digest: hash.digest("hex"), source: "unversioned" };
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  hash.update(head.stdout ?? "");
  for (const name of [...new Set(git.stdout.split("\0").filter(Boolean))].sort()) {
    if (name.split(/[\\/]/).some((part) => [".quick-codex-flow", ".quick-codex-lock", "node_modules"].includes(part))) continue;
    const file = path.join(dir, name);
    hash.update(name).update("\0");
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(file));
      else if (stat.isFile()) hash.update(fs.readFileSync(file));
      hash.update(String(stat.mode));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("deleted");
    }
  }
  return { digest: hash.digest("hex"), source: "git-worktree" };
}

export function verificationReceipt(text) {
  const body = section(text, "Verification Receipt");
  if (!body) return null;
  try { return JSON.parse(body.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? ""); }
  catch { throw new Error("Invalid Verification Receipt; run verify-wave again"); }
}

export function assertVerificationReceipt({ dir, text, commands, phase, wave }) {
  const receipt = verificationReceipt(text);
  if (!receipt) throw new Error("close-wave requires verify-wave machine evidence for the active verification plan");
  const fingerprint = verificationFingerprint(dir, text, commands);
  if (receipt.phase !== phase || receipt.wave !== wave || receipt.digest !== fingerprint.digest || receipt.stable !== true) {
    throw new Error("Verification evidence is stale or belongs to another wave; run verify-wave again");
  }
  const results = new Map(receipt.results?.map((r) => [r.command, r.status]) ?? []);
  const missing = commands.filter((command) => results.get(command) !== 0);
  if (missing.length) throw new Error(`Unverified verification groups: ${missing.join(", ")}`);
  return receipt;
}
