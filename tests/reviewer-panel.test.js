import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateReviewerResults,
  buildReviewerAssignments,
  parseReviewerPanels,
  renderReviewerPanelSection,
  reviewedArtifactDigest,
  reviewerGateViolation
} from "../lib/wrapper/reviewer-panel.js";

function complete(panel, verdict = "pass") {
  return panel.map((row) => ({
    ...row,
    status: "completed",
    verdict,
    evidenceRef: `evidence/${row.id}.md`,
    disposition: verdict === "pass" ? "accepted" : "pending"
  }));
}

test("a three-role panel advances only when every distinct reviewer passes", () => {
  const panel = buildReviewerAssignments({ gate: "plan-check" });

  assert.deepEqual(panel.map((row) => row.role), [
    "correctness-invariants",
    "compatibility-blast-radius",
    "adversarial-verification"
  ]);
  assert.deepEqual(aggregateReviewerResults(complete(panel)), {
    status: "pass",
    blockers: []
  });
});

test("a blocker or duplicate role keeps the gate closed without majority voting", () => {
  const blocked = complete(buildReviewerAssignments({ gate: "phase-close" }));
  blocked[0] = { ...blocked[0], verdict: "block", disposition: "pending" };
  assert.equal(aggregateReviewerResults(blocked).status, "blocked");

  const duplicate = complete(buildReviewerAssignments({ gate: "wave-close" }));
  duplicate[2] = { ...duplicate[2], role: duplicate[1].role };
  assert.equal(aggregateReviewerResults(duplicate).status, "blocked");

  const duplicateIdentity = complete(buildReviewerAssignments({ gate: "wave-close" }));
  duplicateIdentity[2] = { ...duplicateIdentity[2], id: duplicateIdentity[1].id };
  assert.equal(aggregateReviewerResults(duplicateIdentity).status, "blocked");
});

test("a completed reviewer without an evidence reference cannot clear the gate", () => {
  const panel = complete(buildReviewerAssignments({ gate: "plan-check" }));
  panel[1] = { ...panel[1], evidenceRef: "none" };
  assert.equal(aggregateReviewerResults(panel).status, "blocked");

  const missingVerdict = complete(buildReviewerAssignments({ gate: "plan-check" }));
  missingVerdict[1] = { ...missingVerdict[1], verdict: "pending", disposition: "waived" };
  assert.equal(aggregateReviewerResults(missingVerdict).status, "blocked");
});

test("a parent disposition may resolve a non-pass verdict but unfinished reviewers remain blocking", () => {
  const panel = complete(buildReviewerAssignments({ gate: "feature-close" }));
  panel[0] = { ...panel[0], verdict: "partial", disposition: "waived" };
  assert.equal(aggregateReviewerResults(panel).status, "pass");

  panel[1] = { ...panel[1], status: "assigned", verdict: "pending" };
  assert.equal(aggregateReviewerResults(panel).status, "pending");
});

test("reviewer gate violation is strict for panel-aware artifacts and permissive for legacy artifacts", () => {
  const metadata = {
    hasReviewerPanelSection: true,
    reviewerPanels: []
  };
  const artifactDigest = reviewedArtifactDigest(metadata, "plan-check");
  const reviewers = complete(buildReviewerAssignments({ gate: "plan-check" })).map((reviewer) => ({
    ...reviewer,
    artifactDigest,
    resultDigest: artifactDigest
  }));
  metadata.reviewerPanels = [{ gate: "plan-check", artifactDigest, reviewers }];
  assert.equal(reviewerGateViolation(metadata, "plan-check"), null);

  metadata.reviewerPanels[0].reviewers[2] = {
    ...metadata.reviewerPanels[0].reviewers[2],
    verdict: "block",
    disposition: "pending"
  };
  assert.match(reviewerGateViolation(metadata, "plan-check"), /blocked/i);
  assert.equal(reviewerGateViolation({ hasReviewerPanelSection: false }, "plan-check"), null);
});

test("completed reviewer results become stale when the reviewed plan or evidence changes", () => {
  const metadata = {
    hasReviewerPanelSection: true,
    verifiedPlan: "P1 / W1: implement the reviewed plan",
    evidenceBasis: "repository evidence A",
    verificationLedger: "verify-wave P1/W1 -> pass",
    reviewerPanels: []
  };
  const artifactDigest = reviewedArtifactDigest(metadata, "plan-check", "plan");
  const reviewers = complete(buildReviewerAssignments({ gate: "plan-check" })).map((reviewer) => ({
    ...reviewer,
    artifactDigest,
    resultDigest: artifactDigest
  }));
  metadata.reviewerPanels = [{ gate: "plan-check", checkpoint: "plan", artifactDigest, reviewers }];

  assert.equal(reviewerGateViolation(metadata, "plan-check", "plan"), null);
  assert.match(
    reviewerGateViolation({ ...metadata, verifiedPlan: "P1 / W1: changed after review" }, "plan-check", "plan"),
    /reviewed artifact digest is stale/i
  );
  assert.match(
    reviewerGateViolation({ ...metadata, evidenceBasis: "repository evidence B" }, "plan-check", "plan"),
    /reviewed artifact digest is stale/i
  );
});

test("reviewer count is explicit, unique, and never smaller than two", () => {
  assert.throws(() => buildReviewerAssignments({ gate: "plan-check", count: 1 }), /at least 2/i);
  const panel = buildReviewerAssignments({ gate: "plan-check", count: 4 });
  assert.equal(new Set(panel.map((row) => row.role)).size, 4);
});

test("reviewer panel markdown round-trips bounded scopes containing table separators", () => {
  const reviewers = buildReviewerAssignments({ gate: "plan-check" });
  reviewers[0] = { ...reviewers[0], scope: "inspect lib | tests" };
  const artifactDigest = "sha256:reviewed-artifact";
  reviewers[0] = { ...reviewers[0], resultDigest: artifactDigest };
  const text = `## Reviewer Panels\n${renderReviewerPanelSection([{ gate: "plan-check", artifactDigest, reviewers }]).join("\n")}\n\n## Next\n`;
  const parsed = parseReviewerPanels(text);
  assert.equal(parsed.reviewerPanels[0].reviewers[0].scope, "inspect lib | tests");
  assert.equal(parsed.reviewerPanels[0].artifactDigest, artifactDigest);
  assert.equal(parsed.reviewerPanels[0].reviewers[0].resultDigest, artifactDigest);
  const crlf = parseReviewerPanels(text.replaceAll("\n", "\r\n"));
  assert.equal(crlf.hasReviewerPanelSection, true);
  assert.equal(crlf.reviewerPanels[0].reviewers.length, 3);
});
