---
name: claude-code-pane-state-signals
description: "How to classify a Claude Code tmux pane's state (active/waiting/paused/menu/ghost-text-autofill) for automated watchers, plus the send-keys gotchas that make naive automation dangerous. KEY correction (2026-07-04): text on the input line does NOT mean human input — most often it's ghost-text autofill needing Tab+Enter."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 699fa11b-12a5-47a7-9993-1080e573c8f1
---

Classifier for a Claude Code tmux pane, ordered by precedence (first match wins):

**1. Actively working — active-verb marker present**
Look for `● <verbing…> (Xm Ys` — the bullet is `●`, the verb ends in `…`, and a wall-clock timer follows. Examples: `Reticulating splines…`, `Ingesting and verifying reconstruction…`, `Building Geneva-1560 epub gold (218)…`. Don't hardcode `Reticulating splines` — Claude Code uses task-specific verbs.

**2. Just-finished, awaiting next turn — past-tense marker**
`✻ Cooked for Xm Ys · N shells still running`, `✻ Cogitated for Xm Ys · …`, `✻ Brewed for Xm Ys · …`, `✻ Churned for Xm Ys · …`. The bullet is `✻` (not `●`) and the verb is past-tense with a duration. This is NOT active work — it's post-turn idle.

**3. Delegating — subagent lines or background-task counter**
`◯ <agent-name>  <headline>  Xm Ys · ↓ N.Nk tokens` in a list above the footer, or `N background tasks` in the footer bar. Legitimate wait state — do not prompt.

**4. Waiting on background shells — `· N shells · ← for agents` in footer, with transcript announcement**
`N shells` alone is not a wait signal (it's just the process count). It's a wait signal ONLY if the last transcript message announced "waiting for X" / "will resume automatically when Y completes." Combined with a past-tense marker, this means work in flight, not premature pause.

**5. Interactive menu — numbered options with menu chrome**
`1. <label> <description>  2. <label> …` followed by `Enter to select · ↑/↓ to navigate · Esc to cancel`. Claude Code menus almost always include a `Type something.` escape hatch (usually option 4). See menu-safe send pattern below.

**6. Paused with ghost-text autofill — input line has text, no active marker**
`❯ <text>` on the input line with no `● <verbing…>` marker. **Text visibility on the input line does NOT indicate submitted human input.** Claude Code offers **autofill/ghost-text suggestions** that render on the input line but are unsubmitted — a human would press `Tab` + `Enter` to accept them. This is the most common state that looks like "Sir composing" but is actually **paused, awaiting Enter**.

Three sub-cases, all treated the same (target is idle, needs a nudge):
- (a) Ghost-text autofill suggestion (most common — Claude Code's inline recommendation for the next prompt)
- (b) Sir mid-composition (rare — humans typically submit within seconds)
- (c) Stale prior fire (text got into the buffer without Enter submitting — starts with the standard continue-prompt string)

**How to send in this case:** the ghost text itself is often the ideal prompt to submit ("the prompt you see is the one that ought to run"). Two send options:
1. **Preferred (ghost-text pass-through):** paste the exact visible text via `send-keys -l '<text>'` + `send-keys Enter`. This mirrors what Tab+Enter would produce, and Claude Code treats it as a fresh submission.
2. **Fallback (generic):** send the standard continue-prompt. Works but ignores the more targeted ghost-text hint.

**Do NOT back off on the assumption that a human is composing** — that heuristic mis-fires because ghost text sits on the input line indefinitely. If the pane has no active-marker and no delegating indicator, send a prompt regardless of input-line contents.

**7. Silent premature pause — bare `❯ `, everything else absent**
Empty input line, no active-verb marker, no subagents, no background-task counter, no menu. Also safe to send the continue-prompt — identical treatment to case 6.

---

**Send-keys gotchas** (critical — these bit me during the 2026-07-03 4h 0:Jarvis watch):

- **`send-keys -l 'text'` + `send-keys Enter` is NOT atomic.** Between the two, the target Claude Code can enter a state that swallows Enter (hooked notification popup, autocomplete overlay, mid-turn queueing). The text lands but Enter doesn't submit. Result: your prompt sits in the input line indefinitely. The right pattern is: send, `sleep 3`, re-capture pane, verify an active-verb marker appeared; if not, report Enter got swallowed and do NOT retry (retrying appends more text to the stuck buffer).

- **Menus consume the first keystroke as selection.** If a numbered menu is up and you `send-keys -l 'continue working…'`, the first `c` may be interpreted as a filter-navigation keystroke, and your subsequent Enter selects the highlighted option (usually option 1). This silently commits a decision. Menu-safe pattern: `send-keys -l '4'` + `send-keys Enter` FIRST to route to "Type something" (dismissing the menu into free-text mode), THEN send the free text + Enter.

- **Text on the input line ≠ submitted human input.** Ghost-text autofill, stale prior fires, and mid-composition all present as "❯ <text>" and cannot be distinguished by visual inspection alone. See classifier Rule 6 — do not back off on assumed-human-composition; the ghost-text case is the majority. If the text starts with the standard continue-prompt string, single Enter submits your own leftover. Otherwise: paste-and-Enter the visible text (preferred, mirrors Tab+Enter) or send the generic continue-prompt (fallback).

- **From sandboxed bash, tmux calls need `env -u TMUX`** — see [[reference-nexus-pipeline-gotchas]]. Never combine text+Enter into one `send-keys` call — always separate calls, never multi-line `-l`.

Used together with [[tmux-watch-layer-pattern]] for the full watcher design.
