---
name: cron-create-durable-noop
description: "CronCreate's `durable: true` param is silently ignored in the current Claude Code harness build — jobs are always session-only despite the schema documenting persistence."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 699fa11b-12a5-47a7-9993-1080e573c8f1
---

CronCreate with `durable: true` does NOT persist to `.claude/scheduled_tasks.json` in the current harness. Verified 2026-07-03: passed `durable: true`, tool response and CronList both showed `[session-only]`, no `scheduled_tasks.json` written at either project or global scope.

**Why:** Documented parameter but not wired through in this build. Silent no-op.

**How to apply:** When true cross-session or cross-restart persistence is required (e.g. multi-hour watch that must survive a /clear or terminal close), do NOT rely on CronCreate. Use OS-level `crontab -e` with a self-contained shell script — the shell script needs no Claude Code runtime, so it survives any Claude state. CronCreate is still fine for in-session recurring reminders that only need to live for the current REPL.

Related: ScheduleWakeup is also session-scoped and appears as a one-shot `[session-only]` entry in CronList — same limitation. See [[reference-claude-code-mcp-cli-flags]] for other Claude Code CLI quirks.
