# Wrapper Frontdoor MVP

`quick-codex-wrap` is the thin wrapper-oriented CLI surface for putting Quick Codex in front of raw Codex prompts and artifact-driven continuity.

Scope of the MVP:
- accept a raw task and route it to `qc-flow`, `qc-lock`, or a direct prompt path
- prefer a suitable non-done active run artifact over a generic raw-task prompt when the incoming task clearly continues that work
- expose an `auto` entrypoint that orchestrates either raw-task routing or artifact-driven continuation without manual command selection
- expose an optional `auto --follow` loop that rereads the artifact after each turn and continues only when a real checkpoint advances
- auto-bootstrap Quick Codex project scaffold for fresh `qc-flow` raw-task runs
- compile the wrapper-selected Quick Codex prompt before launch
- read `.quick-codex-flow/<run>.md` directly
- classify the next session action from `Phase relation`, `Compaction action`, `Wave Handoff`, and `Next Wave Pack`
- launch `codex exec` from the artifact payload
- optionally resume the last wrapper-tracked exec session when the operator explicitly requests `--same-session`

Why this exists:
- `quick-codex` owns continuity state
- Codex CLI owns live session state
- a wrapper is required if you want Quick Codex routing and phase boundaries to become real launch/session boundaries instead of leaving the operator to choose skills, `/compact`, or `/clear` manually

Current commands:

```text
quick-codex-wrap prompt --task "<task>"
quick-codex-wrap run --task "<task>"
quick-codex-wrap chat [--dir /path/to/project] [--max-turns 5]
quick-codex-wrap chat [--dir /path/to/project] [--ui rich]
quick-codex-wrap chat [--dir /path/to/project] [--ui native] [--native-guarded-slash /status|/compact|/clear]
quick-codex-wrap auto [--task "<task>"]
quick-codex-wrap auto [--run .quick-codex-flow/<run>.md] --follow --max-turns 3
quick-codex-wrap decide
quick-codex-wrap checkpoint
quick-codex-wrap start
quick-codex-wrap continue
codex "<task>"
codex
codex --qc-chat --qc-dir /path/to/project
codex --qc-auto --task "<task>"
codex --qc-full --qc-autonomous --qc-task "<task>"
codex --qc-readonly --qc-manual --qc-task "<task>"
codex --qc-ui plain
codex --qc-ui native
codex --qc-ui native --qc-native-guarded-slash /status
codex --qc-ui native --qc-native-guarded-slash /compact
codex --qc-ui native --qc-native-guarded-slash /clear
codex --qc-auto --run .quick-codex-flow/<run>.md --follow --max-turns 3
codex --qc-auto --qc-task "<task>" --qc-json
codex --qc-auto --qc-dir /path/to/project --qc-run-file .quick-codex-flow/<run>.md --qc-follow --qc-max-turns 3 --qc-json
codex --qc-fast --qc-task "<task>" --qc-json
codex --qc-safe --qc-task "<task>" --qc-json
codex --qc-follow-safe --qc-dir /path/to/project --qc-run-file .quick-codex-flow/<run>.md --qc-json
codex --qc-force-flow --qc-task "research the repo and plan the work" --qc-json
codex --qc-force-lock --qc-task "fix one narrow bug in README.md" --qc-json
codex --qc-force-direct --qc-task "explain the wrapper architecture" --qc-json
codex --qc-help
codex --qc-bypass
```

State file:
- `.quick-codex-flow/wrapper-state.json`
- `.quick-codex-flow/wrapper-config.json`

Current orchestration model:
- `auto --task ...` is the unified frontdoor for raw tasks
- `auto --run ...` or plain `auto` on a project with an active flow run is the unified artifact-driven continuation path
- `auto --follow` keeps rereading the active artifact after each turn and only launches the next turn when the artifact reaches a new checkpoint
- `auto --follow` now preserves the artifact boundary decision: same-phase checkpoints with a saved native thread use `thread/compact/start` by default instead of silently downgrading to `thread/resume`
- `auto --follow` now keeps one persistent `codex app-server` session alive across compact/clear/resume turns, so native thread orchestration can chain multiple checkpoints without respawning the app-server process between turns
- when Experience Engine model routing is enabled, wrapper launch paths call `POST /api/route-model`, pass the returned `model` down to `codex exec` or `codex app-server`, and post `POST /api/route-feedback` after executed turns
- when the model router also returns `reasoningEffort`, wrapper launch paths pass it down as `-c model_reasoning_effort="..."`, so Codex keeps model and reasoning level in sync
- when Experience Engine task routing is enabled, raw-task launches first try `POST /api/route-task` with task text plus active-run context, then fall back to the local task router if the endpoint is unavailable
- manual route overrides are available on top of both layers, so `--qc-force-flow`, `--qc-force-lock`, `--qc-force-direct`, and shell `/route <mode>` bypass brain and heuristic routing completely
- the local task router now folds Unicode text before keyword checks, so Vietnamese task text still routes sensibly during fallback or shell-first usage
- persistent app-server follow mode now restarts the underlying app-server process only when the routed model changes, then resumes the saved thread on the fresh process
- `chat` opens an interactive wrapper shell that treats every entered line as a new wrapper task, so the thin wrapper stays on the path before the model sees each message
- the interactive shell now has renderer modes:
  - `rich`: Ink-based TUI for real terminals with activity, session, and result panes
  - `plain`: line-oriented fallback for non-TTY, CI, tests, or explicit `--ui plain`
- `--qc-ui <auto|plain|rich|native>` maps through the shim to `--ui <auto|plain|rich|native>`
- wrapper permission policy now resolves from explicit flags first, then shell-local overrides, then `.quick-codex-flow/wrapper-config.json`, then built-in defaults
- wrapper continuity maps artifact handoff data into machine-usable fields such as `sessionStrategy`, `handoffAction`, `nativeThreadAction`, `chatActionEquivalent`, and `wrapperCommandEquivalent`
- `clear-session` now uses native `codex app-server -> thread/start(clear)`
- `resume-session` now uses native `codex app-server -> thread/resume` when the wrapper has a saved thread id and falls back to `codex exec resume` only for older wrapper state that has not been upgraded yet
- `compact-session` now uses native `codex app-server -> thread/compact/start` when the wrapper has a saved thread id and then launches the next turn on that compacted thread
- the follow loop stops on `completed`, `blocker`, `relock`, `ask-user`, `no-checkpoint-progress`, or `max-turns-reached`
- `quick-codex install-codex-shim` can install a `codex`-compatible launcher so `codex --qc-auto`, `codex --qc-run`, `codex --qc-prompt`, and related `--qc-*` flags route into the wrapper
- the shim now also treats a plain prompt such as `codex "fix the wrapper follow loop"` as the default wrapper entrypoint, mapped to the follow-safe profile
- bare `codex` now launches the interactive wrapper shell by default, while `codex --qc-bypass` is the explicit escape hatch for the raw Codex TUI
- `codex --qc-bypass ...` is the explicit passthrough escape hatch when you want raw Codex behavior
- the shim now also exposes a small qc-profile option surface so wrapper-specific flags do not need to mix with raw wrapper names:
  - `--qc-task -> --task`
  - `--qc-dir -> --dir`
  - `--qc-run-file -> --run`
  - `--qc-approval -> --approval-mode`
  - `--qc-follow -> --follow`
  - `--qc-max-turns -> --max-turns`
  - `--qc-json -> --json`
  - `--qc-dry-run -> --dry-run`
  - `--qc-same-session -> --same-session`
  - `--qc-output-last-message -> --output-last-message`
- the shim also exposes preset profiles that imply a wrapper command and policy defaults when you do not want to spell out the full surface:
  - `--qc-fast`: default to `run` for task input or `start` for run-file input; no follow loop
  - `--qc-safe`: default to `auto`; one-turn continuity without follow; permission profile = `safe`
  - `--qc-follow-safe`: default to `auto --follow --max-turns 5`
- qc-only overlay and alias flags now also default into the wrapper surface, so `codex --qc-full --qc-task "<task>"` no longer needs an extra `--qc-auto`
- additional permission overlays are available on the shim:
  - `--qc-full`: `danger-full-access` + `never` approvals
  - `--qc-yolo`: bypass approvals and sandbox
  - `--qc-readonly`: `read-only` + `on-request` approvals
  - `--qc-manual`: approval mode = `on-request`
  - `--qc-autonomous`: approval mode = `never`
  - `--qc-untrusted`: approval mode = `untrusted`
- `codex --qc-help` now prints the entire shim surface locally in the terminal, including commands, profiles, aliases, and copy-paste examples
- the interactive shell now supports slash-command completion for `/perm`, `/approval`, `/mode`, `/status`, and exit commands
- the interactive shell now supports `/route <auto|flow|lock|direct>` as a persistent routing override for the current shell session
- the interactive shell now also supports explicit command-style task control:
  - `/task <text>`
  - `/follow <on|off>`
  - `/turns <n>`
  - `Tab` completion covers these commands and known option values
- when `route-task` returns `needs_disambiguation`, the interactive shell renders numbered choices plus a free-text path instead of guessing the route silently

Current limitations:
- raw-task routing still falls back to heuristics when Experience Engine task routing is disabled or unavailable, so it should be treated as a thin frontdoor rather than a perfect classifier
- routing safety now has three layers: brain route when the server is alive, heuristic fallback when the server is unavailable, and explicit manual override when the operator wants to force the route
- active-run preference is also heuristic; it currently relies on active state, explicit continuation language, and light token overlap
- bootstrap sample artifacts such as `.quick-codex-flow/sample-run.md` are intentionally excluded from auto-resume preference
- auto-bootstrap only prepares the standard Quick Codex scaffold; Codex still has to create or update the task-specific run artifact during planning
- the wrapper can shape prompts and session launches, but it does not have direct API control over hidden Codex planning modes
- the interactive shell is line-oriented and wrapper-driven; it is not a protocol-level clone of the stock Codex TUI
- the rich TUI improves situational awareness, but it is still a wrapper renderer layered on top of Quick Codex orchestration rather than a stock Codex protocol clone
- `--ui native` is now available as an experimental guarded path that boots the stock Codex TUI through a wrapper-owned remote app-server bridge; this first slice preserves the native UI and slash commands, but it does not yet reapply per-message wrapper routing once the native session is open
- the native bridge now exposes `NativeSessionObserver` and `NativeSessionController` primitives plus a pipe-mode observation path in `launchNativeCodexSession`
- guarded slash injection is now wired for explicit native command paths: `quick-codex-wrap chat --ui native --native-guarded-slash /status`, `... /compact`, and `... /clear`
- later waves still need to promote this from `/clear` into the remaining continuity set such as `/resume`
- repo defaults are file-based today; edit `.quick-codex-flow/wrapper-config.json` to change the default shell mode, max turns, or permission profile for that project
- repo defaults can also pin `approvalMode` and `executionProfile`, not only permission profile
- `auto --follow` currently depends on flow-artifact checkpoint changes; lock-artifact follow automation is still future work
- native thread orchestration now covers `clear-session`, `resume-session`, and `compact-session`; older wrapper state without a saved thread id still limits how much of that path can be forced natively
- session-id extraction from `codex exec --json` is still heuristic for legacy fallback paths
- `checkpoint-digest` is not used as the machine interface; the wrapper reads the run file directly because the run file is canonical continuity state
- Experience Engine model routing remains optional; the wrapper only uses it when explicitly enabled or when the Experience Engine URL is injected into the wrapper environment
