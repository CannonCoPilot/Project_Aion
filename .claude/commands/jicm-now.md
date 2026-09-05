---
description: Fire a JICM cycle NOW (synchronous) instead of signalling the watcher and waiting
allowed-tools: Bash
---

# /jicm-now — operator-triggered JICM cycle

`/jicm` and `/intelligent-compress` raise a signal and wait for the watcher daemon to poll it
(10s), then wait through prepare → clear → resume. Measured end-to-end on 2026-09-03: ~22 minutes.
`/jicm-now` skips the waiting and arms the cycle immediately for **your own lane**.

Run:

```bash
bash .claude/scripts/jicm-now.sh $ARGUMENTS
```

## Flags
- `--dry-run` — print the resolved plan (key, tmux target, transcript, steps) and touch nothing.
- `--key <k>` — act on another lane. Omit it: the key is derived from the caller.
- `--force` — skips **only** the IDLE wait. It does **not** bypass the save-gate, ever.

## What it guards
- **Refuses** if a cycle is already actuating that key, rather than racing the daemon. Liveness
  is checked against the lock's PID owner token, not argv.
- **Aborts** if the save-gate says NOT READY. That gate is never overridden.
- **Clears** the stale `clear-now` / `over-threshold` signals first, so the watcher does not
  arm a second actuator into a lane that was just cleared.

## What it is not
It is not a second implementation of the cycle. It is a guarded front-end over
`jicm-actuate.sh --fire`, which remains the single writer of prep → clear → resume.

## Expect
After it prints `actuator armed`, **reply once and stop** — the actuator waits to observe idle
before it can `/clear` the session. Anything you start after that returns into a dead session.
