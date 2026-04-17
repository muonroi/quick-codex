const DIRECT_ROUTE = "direct";
const FLOW_ROUTE = "qc-flow";
const LOCK_ROUTE = "qc-lock";

const READ_ONLY_PATTERNS = [
  /^(what|why|how|explain|summarize|compare|review|describe)\b/i,
  /\b(question|explanation|summary|overview|walk through)\b/i,
  /\b(giai thich|tom tat|so sanh|mo ta|phan tich|tong quan|huong dan)\b/i,
  /\b(la gi|tai sao|nhu the nao)\b/i
];

const IMPLEMENTATION_PATTERNS = [
  /\b(fix|debug|refactor|rename|update|add|remove|implement|wire|create|extend|replace)\b/i,
  /\b(test|failing|error|bug|regression)\b/i,
  /\b(sua|go loi|doi ten|cap nhat|them|xoa|trien khai|noi day|mo rong|thay the)\b/i,
  /\b(loi|bug|kiem thu|viet test)\b/i
];

const NARROW_SCOPE_PATTERNS = [
  /\b(single|one|small|narrow|tight|focused)\b/i,
  /\b(file|module|command|test|function)\b/i,
  /`[^`]+\.[a-z0-9]+`/i,
  /\b[a-z0-9/_-]+\.(js|ts|md|json|yaml|yml)\b/i,
  /\b(readme|tep|tep tin|tap tin|file|module|lenh|ham|tai lieu)\b/i
];

const BROAD_SCOPE_PATTERNS = [
  /\b(multi-step|multi file|multi-file|across files|architecture|system design)\b/i,
  /\b(nhieu buoc|nhieu file|qua nhieu file|kien truc|thiet ke he thong)\b/i
];

function asciiFold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizedTask(task) {
  return asciiFold(task).replace(/\s+/g, " ").trim().toLowerCase();
}

function looksReadOnly(task) {
  return READ_ONLY_PATTERNS.some((pattern) => pattern.test(task))
    && !IMPLEMENTATION_PATTERNS.some((pattern) => pattern.test(task));
}

function looksNarrowExecution(task) {
  return IMPLEMENTATION_PATTERNS.some((pattern) => pattern.test(task))
    && NARROW_SCOPE_PATTERNS.some((pattern) => pattern.test(task))
    && !BROAD_SCOPE_PATTERNS.some((pattern) => pattern.test(task));
}

export function routeTask({ task }) {
  const normalized = normalizedTask(task ?? "");
  if (!normalized) {
    throw new Error("--task requires non-empty text");
  }

  if (looksReadOnly(normalized)) {
    return {
      route: DIRECT_ROUTE,
      reason: "The task reads like a read-only question, so a direct Codex prompt is sufficient unless the scope expands."
    };
  }

  if (looksNarrowExecution(normalized)) {
    return {
      route: LOCK_ROUTE,
      reason: "The task looks like a narrow execution change with concrete implementation cues, so wrapper routing prefers qc-lock."
    };
  }

  return {
    route: FLOW_ROUTE,
    reason: "The task is broader or more ambiguous, so wrapper routing prefers qc-flow for clarify, affected-area mapping, and planning."
  };
}
