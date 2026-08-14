---
description: Restart one Archon lane's Claude window in place (reloads launch-time config), leaving every other window untouched
argument-hint: <jaques|genie|dev|w0> [--dry-run] [--force]
allowed-tools: Bash(*/aion-lane-restart.sh*), Bash(*tmux*), Read
---

# /restart-lane

Restart a single Archon lane's Claude process so it reloads **launch-time-only** configuration.

## When you need this

Some config is read once, at process launch, and **cannot** be picked up by a running session:

| Config | Reloaded by `/clear`? | Reloaded by lane restart? |
|---|---|---|
| Workspace trust (`~/.claude.json` `hasTrustDialogAccepted`) | ❌ | ✅ |
| Project `permissions.allow` | ❌ | ✅ |
| Hooks (cached at session start) | ❌ | ✅ |
| `--mcp-config` / `--permission-mode` / model | ❌ | ✅ |
| Conversation context | ✅ (mints a NEW session) | preserved via `--resume` |

`/clear` does **not** restart the process — it mints a new session inside the same one. So
"edit settings.json then /clear" silently changes nothing. That is exactly how W13 stayed in
auto mode on 2026-08-14 with valid rules on disk.

## Usage

```bash
.claude/scripts/aion-lane-restart.sh $ARGUMENTS
```

Always dry-run first:

```bash
.claude/scripts/aion-lane-restart.sh jaques --dry-run
```

## What it does

1. Refuses if the target is the window you are running in, or if a JICM actuation holds the lane.
2. Resolves the lane's **current** session id from the registry — never the uuid baked into the
   window (see below).
3. Waits for the lane to go idle (`--force` skips this and loses the in-flight turn).
4. Preserves context via `jicm-actuate.sh <key> prepare`; **aborts** if that fails.
5. `tmux respawn-window -k` on that one window only, reusing tmux's retained
   `pane_start_command` with the uuid rewritten — so it never duplicates `launch-aion.sh`.
6. Verifies the pane pid actually changed and a live process exists.

## Do NOT just press Enter

Each lane window prints `Press Enter to --resume` when Claude exits. **That path is a trap.**
The uuid in that loop is the lane's *seed*, fixed at launch — but `/clear` mints a new session,
so after any clear it names a stale one. Because the old transcript still exists on disk, the
resume **succeeds silently** and restores days-old context. Observed on jaques 2026-08-14:
loop named `79e6488b` (2 days stale), live session was `f7389f86`.

## Not covered by `launch-aion.sh --restart`

That flag handles only docker/service windows (infra, pulse, proxy, dashboard, pipeline, styx,
watcher, hud, ollama, mlx, litellm) and explicitly leaves Claude windows alone — `--restart all`
says "tmux processes unchanged". Lane restarts previously required re-running the whole
launcher, which is why they were assumed to bounce other windows. They no longer do.

## Note

The lane's original launch command includes an init prompt (`Please load these files into
context: @…CLAUDE.md`), so the restarted lane receives that as its first turn. This is the
launcher's own behaviour and reloads the persona doc.
