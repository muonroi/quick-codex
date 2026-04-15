# Shared Continuity Contract

Quick Codex uses multiple artifact surfaces to preserve task continuity.

This document defines:
- which continuity layers exist
- which fields belong to each layer
- which surface is the canonical owner for each field group
- how CLI recovery and scaffolded guidance should treat those surfaces

The goal is interoperability, not identical file shapes.
`qc-flow`, `qc-lock`, CLI recovery, `STATE.md`, and scaffolded `AGENTS.md` do not need the same schema.
They do need a shared contract for what continuity state exists and where that state is authoritative.

## Continuity Layers

| Layer | Purpose | Required core fields |
|---|---|---|
| `C1 baseline continuity` | Preserve the stable task contract across turns and relocks | goal, required outcomes, affected area, out of scope |
| `C2 state continuity` | Preserve the current position in the workflow | current gate, current phase / wave, execution mode, current status, blockers |
| `C3 resume continuity` | Preserve the exact next safe move after interruption | recommended next command, next verify, compact-safe handoff, active-run pointer |
| `C4 risk continuity` | Preserve the reasons to narrow, stop, or escalate | session risk, context risk, burn risk, stall status, approval strategy |
| `C5 experience continuity` | Preserve active experience-derived constraints and invariants | experience constraints, hook-derived invariants, active warnings and ignored warnings when relevant |
| `C6 proof continuity` | Preserve what has already been verified and what still holds | verification ledger, requirements still satisfied, phase-close or checkpoint evidence when present |

## Deterministic Carry-Forward Protocol

Proactive compaction is a continuity protocol, not a claim that the model keeps latent working memory forever.

Quick Codex should treat carry-forward as three nested scopes:
- `global continuity`
  - stable goal, required outcomes, global constraints, and cross-phase invariants
- `phase-local continuity`
  - current phase purpose, active affected area, phase proof, and phase-to-phase dependency state
- `wave-local continuity`
  - the active step, narrow verify path, temporary implementation notes, and wave-scoped hypotheses

Checkpoint rules:
- after a verified wave, drop wave-local detail unless it is still needed for the next route
- after a phase close with `independent-next-phase`, keep only global continuity and the minimum proof needed to justify the transition
- after a phase close with `dependent-next-phase`, keep global continuity plus the specific phase-local subset required downstream
- after a checkpoint that is `relock-before-next-phase`, stop automatic continuation and require a new plan or lock

`single is good, better together` rule:
- `single is good`: the protocol alone must still produce a safe baseline action even when Experience Engine is absent, unreachable, or noisy
- `better together`: when Experience Engine is available, it may add a `brain session-action verdict` that confirms or vetoes the baseline action inside protocol guardrails
- the brain verdict may make the workflow stricter, but it must not bypass protocol guardrails or invent an action family the protocol already ruled out

Compaction-action rules:
- `same-phase` -> `compact`
- `dependent-next-phase` -> downstream-only `compact`
- `independent-next-phase` -> `clear`
- `relock-before-next-phase` -> `relock`

The contract therefore needs an explicit carry-forward payload, not just broad recap prose.

### `Wave Handoff` minimum fields

`Wave Handoff` is the canonical `qc-flow` payload for deliberate compaction.

It must capture:
- source checkpoint
- next target
- phase relation
- brain session-action verdict
- brain verdict confidence
- brain verdict rationale
- sealed decisions
- carry-forward invariants
- expired context
- what to forget
- what must remain loaded
- resume payload or exact resume command

### `Phase Relation` values

`Phase Relation` must classify how aggressively the next checkpoint may compact:
- `same-phase`
- `dependent-next-phase`
- `independent-next-phase`
- `relock-before-next-phase`

Meaning:
- `same-phase` -> keep the current phase-local continuity plus the minimum next-wave payload
- `dependent-next-phase` -> keep only the downstream-relevant phase subset
- `independent-next-phase` -> clear phase-local detail and keep only global continuity plus proof
- `relock-before-next-phase` -> do not auto-continue; the next phase needs a fresh lock or plan check

### `Next Wave Pack`

`Next Wave Pack` is the canonical same-phase projection of `Wave Handoff`.

Emit it only when:
- the current checkpoint already resolved the next wave deterministically
- `Phase Relation` is `same-phase`
- the next target is narrower than rereading the whole execution-wave narrative

It must capture:
- target
- derived from
- phase relation
- compaction action
- brain session-action verdict
- brain verdict confidence
- brain verdict rationale
- wave goal
- done when
- next verify
- carry-forward invariants
- what to forget
- what must remain loaded
- resume payload

## Surface Roles

| Surface | Role |
|---|---|
| `.quick-codex-flow/<run>.md` | Canonical continuity surface for planning, resume, risk, experience, and proof |
| `.quick-codex-lock/<task>.md` | Canonical continuity surface for locked execution detail inside the current phase |
| Native Codex planner | Ephemeral operator-visible mirror of current progress; never canonical over the run artifact |
| `.quick-codex-flow/STATE.md` | Active-run pointer only; not a substitute for the run artifact |
| CLI recovery (`status`, `resume`, `checkpoint-digest`, `repair-run`, `doctor-run`) | Read, print, repair, and validate the shared continuity subset by artifact type |
| Scaffolded `AGENTS.md` | Entry guidance only; teaches where continuity state lives without duplicating the full contract |

Native planner rules:
- use it to mirror the current gate, active phase or wave, and the next safe checkpoint when the Codex build exposes it
- keep it shorter than the run artifact and treat it as disposable UI state
- resync it after relock, wave close, phase close, or any blocker that changes the active route
- if it disagrees with the run artifact, the run artifact wins
- when the active route is a deliberate compaction checkpoint, the planner should also mirror the action family: `compact`, `clear`, or `relock`
- the planner should make phase-checkpoint intent visible enough that the operator does not need to open the artifact just to learn whether the next action is `/compact`, `/clear`, or relock
- the planner should mirror the verified roadmap for one feature or issue; when no later phase remains, it should surface feature close rather than inventing more roadmap steps

## Canonical Ownership Matrix

Legend:
- `owner` = canonical author of the field group
- `bridge` = must expose enough state to interoperate with the shared contract
- `read` = CLI or guidance must read or teach this field group
- `pointer` = limited to indirection, not full state
- `teach` = explains where the authoritative state lives

| Continuity layer | `qc-flow` run | `qc-lock` run | CLI recovery | `STATE.md` | `AGENTS.md` |
|---|---|---|---|---|---|
| `C1 baseline continuity` | owner | bridge | read | none | teach |
| `C2 state continuity` | owner | bridge | read | pointer | teach |
| `C3 resume continuity` | owner | bridge | read | pointer | teach |
| `C4 risk continuity` | owner | bridge when execution-local | read | none | teach |
| `C5 experience continuity` | owner | bridge when active | read | none | teach |
| `C6 proof continuity` | owner | bridge | read | none | none |

## Required Core Field Matrix

Legend:
- `required` = this surface must carry or derive the field explicitly
- `bridge` = this surface may use a surface-local shape, but it must expose equivalent meaning
- `read` = this surface must be able to consume or print the field
- `pointer` = this surface may only reference the owner surface
- `teach` = this surface only explains where the field lives

| Core field | Layer | `qc-flow` run | `qc-lock` run | CLI recovery | `STATE.md` | `AGENTS.md` |
|---|---|---|---|---|---|---|
| goal | `C1` | required | bridge | read | none | teach |
| required outcomes | `C1` | required | bridge | read | none | teach |
| affected area | `C1` | required | bridge | read | none | teach |
| out of scope or protected boundaries | `C1` | required | bridge | read | none | teach |
| current gate | `C2` | required | bridge | read | pointer | teach |
| current execution position | `C2` | required | bridge | read | pointer | teach |
| execution mode | `C2` | required | optional | read when present | pointer | teach |
| blockers | `C2` | required | bridge | read | optional summary | none |
| next verify | `C3` | required | bridge | read | none | teach |
| recommended next command | `C3` | required | bridge | read | none | teach |
| compact-safe handoff | `C3` | required | optional | read when present | none | none |
| wave handoff | `C3` | required | optional bridge | read | none | none |
| phase relation | `C3` | required | optional bridge | read | none | teach |
| carry-forward invariants | `C3` | required | optional bridge | read | none | teach |
| expired context / what to forget | `C3` | required | optional bridge | read | none | none |
| what must remain loaded | `C3` | required | optional bridge | read | none | none |
| session, context, and burn risk | `C4` | required | bridge when execution-local | read | none | teach |
| stall or approval state | `C4` | required | bridge when execution-local | read | none | none |
| experience constraints | `C5` | required | bridge when active | read | none | teach |
| hook-derived invariants | `C5` | required | bridge when active | read | none | teach |
| active warning or ignored-warning references | `C5` | required when relevant | bridge when relevant | read when present | none | none |
| requirements still satisfied | `C6` | required | bridge | read | none | none |
| verification ledger or equivalent proof | `C6` | required | bridge | read | none | none |

## Artifact-Type Required Subsets

The shared contract is enforced through minimum required subsets, not one global markdown shape.

### `qc-flow` required subset

`qc-flow` remains the canonical full-fidelity continuity artifact.

It must carry:
- goal
- required outcomes
- affected area
- out of scope
- current gate
- current phase or wave
- execution mode
- blockers
- next verify
- recommended next command
- compact-safe handoff
- wave handoff
- phase relation
- carry-forward invariants
- expired context / what to forget
- what must remain loaded
- enough risk state to justify continue versus stop
- enough experience state to preserve active constraints
- requirements still satisfied
- verification ledger

### `qc-lock` required subset

`qc-lock` is a bridge artifact for locked execution, not a second `qc-flow` run.

It must carry or derive:
- goal
- phase and current step
- affected area
- protected boundaries or explicit out-of-scope equivalent
- blockers when present
- current verify path
- execution-local risks
- enough proof to justify the current step status

It may omit:
- compact-safe prose summaries
- extended research narration
- global workflow commentary that still belongs to `qc-flow`

### CLI recovery required subset

CLI recovery must normalize the shared fields without assuming identical section names.

It must be able to:
- recover current execution position from `phase / wave`, `phase / step`, or equivalent locked-step state
- print or validate the next verify path
- print or validate the recommended next command
- print or validate the `Wave Handoff` payload when present
- print or validate `Next Wave Pack` when the route stays in the same phase
- validate that `Phase Relation` matches the intended resume or stop behavior when present
- score or gap-check handoff sufficiency instead of only checking that sections exist
- detect missing baseline, state, risk, or proof fields by artifact type
- treat stale pointer state as a warning, not as the canonical source of truth

### `STATE.md` required subset

`STATE.md` is intentionally small and should only carry:
- active run path
- current gate
- current execution position
- execution mode
- status

It must never become the only copy of risk, proof, or experience state.

### Scaffolded `AGENTS.md` required subset

Scaffolded `AGENTS.md` must teach:
- which skill to start with
- where run continuity lives
- where lock continuity lives
- that `STATE.md` is only a pointer
- that `AGENTS.md` is guidance, not authoritative task state

## Adoption Surface Map

The contract is adopted through a small set of authoritative files.
This map freezes where each continuity layer should land next.

| Surface | Primary files | Continuity layers touched | Ownership rule | Compatibility note |
|---|---|---|---|---|
| `qc-flow` run contract | `qc-flow/SKILL.md`, `qc-flow/references/run-file-template.md`, `templates/.quick-codex-flow/sample-run.md` | `C1`, `C2`, `C3`, `C4`, `C5`, `C6` | full owner | remains the richest continuity artifact and should not be reduced to the lock subset |
| `qc-lock` locked execution contract | `qc-lock/SKILL.md`, `qc-lock/references/locked-plan-template.md` | `C1`, `C2`, `C3`, `C4`, `C5`, `C6` bridge subset | execution-local owner, bridge-only for global continuity | should expose equivalent meaning without copying `qc-flow` section layout |
| CLI recovery and validation | `bin/quick-codex.js` | reads `C1` through `C6` by artifact type | recovery reader and validator | must normalize field meaning from flow or lock artifacts instead of assuming one markdown schema |
| active-run pointer | `templates/.quick-codex-flow/STATE.md`, live `.quick-codex-flow/STATE.md` | pointer subset of `C2` and `C3` | pointer only | stale pointer state must never override the canonical artifact |
| scaffold and user-facing guidance | `templates/AGENTS.snippet.md`, `README.md`, `QUICKSTART.md` | teaches `C1` through `C5` ownership boundaries | teach-only | should point to owner surfaces and avoid duplicating the full contract |

### Layer-to-File Adoption Notes

`C1 baseline continuity`:
- owned in `qc-flow/references/run-file-template.md`
- bridged in `qc-lock/references/locked-plan-template.md`
- taught in `templates/AGENTS.snippet.md`

`C2 state continuity`:
- owned in `qc-flow` run artifacts and pointer-reflected in `.quick-codex-flow/STATE.md`
- bridged in `qc-lock` through phase and step state
- recovered in `bin/quick-codex.js`

`C3 resume continuity`:
- owned in `Resume Digest`, `Compact-Safe Summary`, and `Recommended Next Command`
- owned in `Wave Handoff` for deliberate compaction checkpoints
- owned in `Next Wave Pack` when the next same-phase route is already explicit
- bridged in `qc-lock` through current verify path and next locked step
- surfaced in `README.md` and `QUICKSTART.md` as operator guidance, not as the source of truth

`C4 risk continuity`:
- owned in `qc-flow` risk sections
- bridged in `qc-lock` only when the risk is execution-local
- consumed by CLI recovery when deciding whether an artifact is trustworthy enough to resume

`C5 experience continuity`:
- owned in `Experience Snapshot`
- bridged in `qc-lock` only when a live lock is constrained by active warnings or invariants
- taught briefly in scaffold guidance so users know where experience carry-forward belongs

`C6 proof continuity`:
- owned in `Verification Ledger`, `Requirements Still Satisfied`, and phase-close evidence
- bridged in `qc-lock` through locked-step proof and completion evidence
- validated in CLI recovery by artifact type

## Verification And Migration Rules

### Artifact-Type-Aware Doctor Rules

`doctor-run` should validate the shared contract by artifact type instead of by one global markdown shape.

For `qc-flow` runs, it should require:
- the full `qc-flow` required subset
- continuity carry-forward sections such as `Resume Digest`, `Compact-Safe Summary`, and `Experience Snapshot`
- `Wave Handoff` and `Phase Relation` when the run has crossed a verified wave, phase close, broad verify checkpoint, or deliberate pause
- proof that `Recommended Next Command` and `Verification Ledger` are still present and coherent

For `qc-lock` artifacts, it should require:
- locked execution baseline and scope boundaries
- current step or equivalent execution position
- current verify path
- blockers and execution-local risks when present
- enough proof to justify each completed or active step

For `STATE.md`, it should require:
- an active run path
- current gate
- current execution position
- execution mode
- status

If `STATE.md` diverges from the canonical artifact:
- warn on stale pointer state
- prefer the canonical artifact
- do not silently rewrite the owner artifact from pointer state alone

For scaffold guidance:
- verify presence of continuity-owner guidance in templates and user-facing docs
- do not treat guidance docs as canonical execution state

### Migration Rules

Migration should preserve compatibility while tightening continuity semantics.

Rules:
- existing `qc-flow` runs remain valid if they still satisfy the required `qc-flow` subset
- older `qc-flow` runs may be repaired forward by adding missing carry-forward or experience sections without changing their planning history
- existing `qc-lock` artifacts should gain bridge fields incrementally instead of being rewritten into `qc-flow` format
- `STATE.md` may stay minimal and should never be expanded to carry risk, proof, or experience history
- scaffold docs should point to owner artifacts instead of duplicating the contract text

### Smoke Verify Path

Minimum verify path for the contract rollout:
- lint skill and template shape
- verify continuity-contract anchors and touched-file guidance
- run `doctor-run` on a representative `qc-flow` artifact
- verify that a representative `Wave Handoff` survives deliberate-compaction readback
- once `qc-lock` adoption lands, add a lock-aware doctor smoke check

## Implementation Order

Recommended adoption order:
1. update `qc-lock` templates and skill guidance so the bridge subset matches the shared contract
2. update CLI recovery and validation to read and validate artifact-type-specific continuity fields
3. update scaffold and user-facing docs only where they need to point at the new owners and recovery behavior
4. add proof artifacts and benchmark coverage after the runtime surfaces are aligned

## Surface-Specific Contract Rules

### `qc-flow` run files

`qc-flow` remains the richest continuity surface.

It should own:
- full baseline continuity
- full state continuity
- full resume continuity
- full risk continuity
- full experience continuity
- full proof continuity

It should remain the source of truth when chat state and artifact state diverge.

### `qc-lock` run files

`qc-lock` should not be forced to mirror the full `qc-flow` shape.

It must still expose a bridgeable subset:
- stable baseline
- current phase and current step status
- affected area and protected boundaries
- current verify path
- blockers and active risks
- enough completion evidence to support resume and handoff

`qc-lock` owns execution-local detail, not global workflow narration.

### CLI recovery surfaces

CLI recovery must validate by artifact type.

Rules:
- do not assume every artifact is a `qc-flow` run
- read the shared subset first
- print the next safe move without requiring one exact section layout everywhere
- distinguish `required core continuity fields` from `surface-local fields`
- treat stale or missing shared fields as continuity failures
- prefer the canonical owner when pointer state and artifact state diverge

### `.quick-codex-flow/STATE.md`

`STATE.md` is intentionally small.

It should only carry:
- active run path
- current gate
- current phase / wave
- execution mode
- status

It is a pointer surface, not a history surface.

### Scaffolded `AGENTS.md`

Scaffolded `AGENTS.md` should stay short.

It should teach:
- which skill to start with
- that run and lock artifacts are the continuity source of truth
- that `STATE.md` is only the active-run pointer
- that `AGENTS.md` itself is not the authoritative execution state

It should not duplicate the full field matrix.

## Compatibility Rules

- Do not require every surface to own every continuity field.
- Define validation by artifact type, not by one global markdown shape.
- Existing `qc-flow` artifacts remain valid if they satisfy the current shared core fields.
- Existing `qc-lock` artifacts should gain bridgeable continuity fields without being rewritten into `qc-flow` runs.
- `AGENTS.md` should point to the owner surfaces instead of becoming a second run artifact.
- New CLI recovery work should prefer the shared layers `C1` through `C6` over surface-specific section names.

## Required Core vs Surface-Local Fields

Required core continuity fields:
- goal
- required outcomes
- affected area
- out of scope or protected boundaries
- current execution position
- next verify
- recommended next command
- enough risk state to justify continue vs stop
- enough proof state to justify trust in the artifact

Surface-local fields:
- extended research reasoning
- verbose execution notes
- detailed step lists
- narrative carry-forward prose
- AGENTS-specific teaching text
- pointer-only convenience summaries such as `STATE.md` status lines

## What This Phase Enables

Once this contract is accepted, later phases can safely:
- unify `qc-flow` and `qc-lock` continuity without flattening them into one file type
- make CLI recovery artifact-type-aware
- add policy continuity without abusing `AGENTS.md`
- add stronger proof for continuity claims
