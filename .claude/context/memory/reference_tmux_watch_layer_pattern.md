---
name: tmux-watch-layer-pattern
description: "Three-layer redundancy pattern (ScheduleWakeup + CronCreate + OS crontab) for bounded-duration watches over another Claude Code tmux session, with failure-mode independence analysis."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 699fa11b-12a5-47a7-9993-1080e573c8f1
---

Pattern for building a bounded-duration automated watch over another Claude Code tmux session (e.g. "watch 0:Jarvis for 4h, prompt him if he pauses"). Applied 2026-07-03 for a 4-hour W0:Jarvis watch; held together, though the primary/backup risk asymmetry produced an unintended emergent behavior worth understanding.

**Three layers, ordered by cost and independence:**

| Layer | Mechanism | Cache | Fires when THIS session dies? | Fires when terminal closes? |
|---|---|---|---|---|
| L1 primary | `ScheduleWakeup` every 30 min | warm (cheap) | ❌ no | ❌ no |
| L2 in-session backup | `CronCreate` (nominal `durable: true`) hourly | warm | ❌ no (see [[cron-create-durable-noop]]) | ❌ no |
| L3 independent backup | OS `crontab -e` hourly, calling a self-contained shell script | cold (no Claude involved) | ✅ yes | ✅ yes |

**Independence is a property of the failure modes that must overlap, not of any single layer's uptime.** L1 and L2 both die with the session, so they are ONE independent failure mode. L3 dies only with the host. Two independent failure modes must both hit for the watch to lose coverage.

**Self-defusing termination:**
Watch expiry is encoded in an `expires-at` epoch file. The shell script guards on it (`if now > expires; exit 0`). Deleting the file OR removing the OS crontab line both defuse L3. L1 self-terminates after the final scheduled poll. L2 needs an explicit `CronDelete`. Cleanup order at watch end: remove OS crontab line, CronDelete L2 id, delete expires-at file, leave `watch-*.log` and `watch-*-heartbeat.txt` for audit.

**Off-minute jitter:** always use non-`:00` / `:30` cron minutes (e.g. `17 * * * *`) to avoid the LLM-fleet thundering-herd on Anthropic's edge. See CronCreate schema for details.

**Emergent behavior observed 2026-07-03 (worth designing around next time):**
The primary (L1) was written conservatively — Rule 3 backed off from ANY input-line text, on the theory Sir might be composing. The backup shell script (L3) was written simply — classify as `active/delegating/paused` with no "user composing" awareness. Result: L1 fired 8 times and sent ZERO full continue-prompts (every state was either active, delegating, or "input has text so back off"). L3 fired ~7 times and sent 5 continue-prompts. The backup became the actor; the primary became the reporting layer. This worked out fine because the "input has text" cases were mostly ghost-text autofill (see below), NOT Sir composing. But the design accidentally landed on "primary is conservative, backup is aggressive" — no principled asymmetry.

**2026-07-04 correction — input-line text is NOT a back-off signal.** After the second watch, Sir clarified: Claude Code renders **autofill/ghost-text suggestions** on the input line (a human accepts them with Tab+Enter). Text on the input line most commonly means the target is **paused waiting for a nudge**, NOT that a human is composing. The L3 script's simple "text-agnostic pause classifier" was accidentally correct. See [[claude-code-pane-state-signals]] Rule 6 for the corrected classifier — do not back off on input text; send regardless.

**Next-time refinement (revised):**
(a) Make BOTH layers use the same text-agnostic classifier — active/delegating/paused only, no "input has text" special-case; (b) enhance the send to *paste the ghost text* when present (mirrors Tab+Enter user acceptance) with the standard continue-prompt as fallback; (c) add a "verify submission by re-capturing after 3s" step to both layers so send-failures (stuck buffer) are visible instead of silently piling up.

**Related:** [[claude-code-pane-state-signals]] for the pane classifier; [[cron-create-durable-noop]] for the L2 durability gotcha; [[reference-nexus-pipeline-gotchas]] for the `env -u TMUX` sandbox gotcha.
