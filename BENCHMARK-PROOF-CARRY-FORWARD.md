# Benchmark Proof — Carry-Forward Footprint

This document captures one concrete proof scenario from [BENCHMARKS.md](./BENCHMARKS.md).

It is intentionally narrow.
The goal is to show that deliberate compaction now leaves a smaller, deterministic carry-forward payload for the next route instead of forcing the operator to drag the whole artifact forward.

## Scenario

Benchmark:
- `Carry-Forward Footprint`

Pain point:
- "I do not want to keep hauling the whole transcript or artifact into the next wave just to stay safe."

Repo under test:
- `quick-codex`

Fixture under test:
- the same-phase routed flow fixture in [tests/test-helpers.js](./tests/test-helpers.js), closed through `quick-codex close-wave`

## Commands Used

Local steps:
1. create the routed fixture project from `routedWaveRun`
2. run:

```bash
node bin/quick-codex.js close-wave --dir <temp-project> --run .quick-codex-flow/sample.md --phase P1 --wave W1
```

3. validate the resulting artifact:

```bash
node bin/quick-codex.js doctor-run --dir <temp-project> --run .quick-codex-flow/sample.md
```

## Observed Measurements

Measured on the generated artifact after same-phase close-wave routing:

- full artifact footprint: `182` lines, `4469` bytes
- `Compact-Safe Summary`: `15` lines, `710` bytes
- `Wave Handoff`: `12` lines, `690` bytes
- `Next Wave Pack`: `23` lines, `525` bytes

Observed validation result:

- `doctor-run` reported `Handoff sufficiency: 22/22 (same-phase -> compact)`
- `doctor-run` also reported `Handoff mode: same-phase next-wave pack required`

## Why These Numbers Matter

This is a token-footprint proxy, not a direct Codex billing measurement.

It still shows a concrete continuity win:
- the next-wave packet is much smaller than the whole artifact
- the compact surfaces still preserve the next verify and resume payload
- the validator can reject an under-specified same-phase handoff instead of trusting generic prose

## What This Proves

This proof supports a narrow claim:

`Quick Codex now turns same-phase compaction into a smaller, explicit carry-forward packet with validator-backed route sufficiency.`

More specifically:
- `close-wave` can auto-generate `Next Wave Pack` when the next same-phase route is already known
- `doctor-run` can score whether the handoff is sufficient instead of only checking section presence
- the compact carry-forward surfaces are materially smaller than the whole artifact

## What This Does Not Yet Prove

This proof does not yet prove:
- direct Codex token billing savings
- model-quality retention across many consecutive compactions
- measured productivity lift across multiple real repos

Those need broader benchmark runs beyond this local fixture.
