# Benchmark Proof: Brain-Advised Session Action

Goal:
- prove the `single is good, better together` rule for deliberate session actions
- show that Quick Codex keeps a safe protocol baseline by itself
- show that Experience Engine can add a guarded brain verdict on top of that baseline

## Setup

Environment:
- local Quick Codex checkout
- Experience Engine reachable through the configured Tailscale proxy endpoint
- local `~/.experience/config.json` pointing `serverBaseUrl` at the VPS-hosted Experience Engine and carrying the matching auth token

Verification of the upstream advisor:
- `ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i /tmp/muonroi_vps_rsa phila@100.79.164.25 "curl -s http://localhost:8082/health"`
  - result: `status: ok`
- `curl -s -X POST http://100.79.164.25:8082/api/brain -H 'Authorization: Bearer <configured-token>' -H 'Content-Type: application/json' -d '{"prompt":"Reply with exactly the word ok","timeoutMs":4000}'`
  - result: `{ "ok": true, "result": "ok" }`

This proves the advisor endpoint is reachable before Quick Codex calls it.

## Scenario A: Same-Phase Checkpoint

Purpose:
- verify that a completed wave with an explicit same-phase route gets a compact-style brain verdict and preserves the `Next Wave Pack`

Command:

```bash
node bin/quick-codex.js close-wave \
  --dir /tmp/qc-brain-e2e-NmN7kt \
  --run .quick-codex-flow/sample.md \
  --phase P1 \
  --wave W1
```

Observed CLI result:
- `Brain verdict: allow-compact (low)`
- `Next-wave pack: P1 / W2`

Observed artifact result:
- `Compact-Safe Summary -> Brain session-action verdict: allow-compact`
- `Compact-Safe Summary -> Brain verdict source: experience-engine-brain`
- `Compact-Safe Summary -> Suggested session action: /compact after reviewing this summary and keeping the next-wave pack for P1 / W2.`
- `Next Wave Pack -> Brain session-action verdict: allow-compact`
- `Next Wave Pack -> Suggested session action: /compact after reviewing this summary and keeping the next-wave pack for P1 / W2.`

What this proves:
- the advisor is actually being called
- the artifact records the advisor output instead of keeping it in chat only
- the same-phase route still keeps the deterministic next-wave packet

## Scenario B: Phase Close / Relock Checkpoint

Purpose:
- verify that a completed phase does not drift into a compact-style operator action when the protocol baseline requires relock

Command:

```bash
node bin/quick-codex.js close-wave \
  --dir /tmp/qc-brain-phase-suuYBH \
  --run .quick-codex-flow/sample.md \
  --phase P1 \
  --wave W1 \
  --phase-done
```

Observed CLI result:
- `Brain verdict: relock-first (medium)`
- `Current gate: phase-close`

Observed artifact result:
- `Compact-Safe Summary -> Phase relation: relock-before-next-phase`
- `Compact-Safe Summary -> Brain session-action verdict: relock-first`
- `Compact-Safe Summary -> Suggested session action: Do not run /compact or /clear yet; relock from .quick-codex-flow/sample.md before continuing.`
- `Wave Handoff -> Brain session-action verdict: relock-first`
- `Wave Handoff -> Suggested session action: Do not run /compact or /clear yet; relock from .quick-codex-flow/sample.md before continuing.`

What this proves:
- the advisor path can support the stricter relock route
- the final operator-facing action stays aligned with protocol guardrails
- the artifact is self-consistent at the risky phase boundary

## Interpretation

`single is good`:
- if Experience Engine is unavailable, Quick Codex still has `Phase Relation`, `Compaction action`, and a safe protocol-derived `Suggested session action`

`better together`:
- when Experience Engine is available, Quick Codex adds:
  - `Brain session-action verdict`
  - `Brain verdict confidence`
  - `Brain verdict rationale`
  - `Brain verdict source`
- the final `Suggested session action` remains protocol-guarded rather than letting the advisor bypass the contract
- model choice and cost routing stay upstream in Experience Engine, so Quick Codex does not hardcode one SiliconFlow tier or pay the advisor cost when the protocol baseline is already sufficient

## Conclusion

This proof supports the product claim that Quick Codex is:
- safe and usable on its own
- sharper when paired with Experience Engine
- intentionally built so the advisor layer improves the checkpoint decision without owning the whole workflow
