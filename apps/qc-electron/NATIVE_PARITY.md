# Electron Host Native Parity

This document is the truth table for how close `apps/qc-electron/` is to stock Codex native behavior.

It exists to answer one narrow question before Quick Codex automation grows on top:

> Can the Electron host keep enough native Codex behavior that it is safe to treat it as the main automation boundary?

## Status Legend

- `proven-electron`: proven through Electron-host tests or smoke
- `proven-lower-layer`: proven in wrapper-native bridge tests, but not yet re-proven end-to-end through Electron host
- `manual-e2e`: requires real interactive Codex verification today
- `gap`: not proven yet

## Parity Matrix

| Behavior | Current status | Proof basis | Notes |
|----------|----------------|-------------|-------|
| Slash commands (`/status`, `/compact`, `/clear`, `/resume`) | `proven-electron` for session-manager forwarding; `proven-lower-layer` for guarded native execution | `tests/electron-host.test.js`, `tests/wrapper.test.js` | Electron host can forward slash commands into the live native session. Guarded native slash semantics are already proven in the wrapper-native bridge. |
| Autocomplete | `manual-e2e` | no safe local unit proof | Autocomplete belongs to the native Codex UI loop. Electron host must prove it in a real session. |
| Modal / menu selection | `proven-lower-layer` for reasoning/rate-limit modal handling; `manual-e2e` for Electron-host parity | `tests/wrapper.test.js` | Native bridge logic already detects and handles boot reasoning menus and guarded-clear modal edge cases, but Electron host still needs real-session proof. |
| Model / reasoning switching | `proven-electron` | `tests/electron-host.test.js` | Session-manager restarts the live native session only when routed model/reasoning changes. |
| Session resume behavior | `proven-lower-layer` for guarded `/resume`; `manual-e2e` for Electron-host resume UX parity | `tests/wrapper.test.js` | Resume semantics are proven in the native bridge, but Electron-host resume parity still needs a real session. |
| Copy / paste + multiline input | `manual-e2e` | no safe local unit proof | Electron host uses xterm passthrough, but real native parity still needs an interactive check. |
| Terminal resize / scroll behavior | `proven-electron` for resize forwarding; `manual-e2e` for scroll UX parity | `tests/electron-host.test.js`, `npm run smoke:xvfb` | Resize IPC is proven. Scrollback feel and viewport behavior still need live interaction. |

## Automated Verification

Run these first:

```bash
node --test tests/electron-host.test.js
cd apps/qc-electron && npm run smoke:xvfb
```

What they prove:

- session-manager keeps one live native session across orchestrated messages when model/reasoning does not change
- model/reasoning routing restarts the native session when needed
- raw passthrough writes delegate into the native session controller
- slash forwarding delegates into the active native session
- resize requests are forwarded to the live native session
- Electron host still boots and exits cleanly under xvfb

What they do **not** prove:

- native Codex autocomplete UX
- native menus or popups as rendered inside Electron
- clipboard ergonomics
- scrollback ergonomics

## Manual / E2E Checklist

Use this list in a real native Codex session inside Electron host.

Recommended mode:

```bash
cd apps/qc-electron
npm run dev
```

Then verify:

1. `passthrough` mode
   - type directly into Codex and confirm native slash autocomplete still appears
   - open `/model`, change the model, then select a reasoning level
   - confirm multiline input still behaves like stock Codex
   - confirm paste works for both single-line and multiline text
   - resize the window and confirm Codex viewport redraw stays stable
   - scroll up/down in long output and confirm xterm viewport behavior remains usable

2. `orchestrated` mode
   - start one session and send a task through the task box
   - confirm routed model switches still land in a usable native prompt
   - use local `/qc slash /status`, `/qc slash /compact`, `/qc slash /clear`, `/qc slash /resume --last`
   - confirm the live native session remains usable after each guarded slash

3. Resume-specific proof
   - clear or compact the session, then resume the saved thread
   - confirm the restored session lands in a stable prompt and accepts further native input

## Current Verdict

- Electron host is already strong enough to act as the native-session control boundary.
- It is **not** yet honest to claim full native parity without the manual/e2e checklist above.
- The next safe milestone is to finish this checklist and record the verdict back into the current run artifact.
