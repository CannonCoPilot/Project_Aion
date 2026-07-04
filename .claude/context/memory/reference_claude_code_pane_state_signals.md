---
name: claude-code-pane-state-signals
description: "How to classify a Claude Code tmux pane's state (active/waiting/paused/menu/composing) for automated watchers, plus the send-keys gotchas that make naive automation dangerous."
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

**6. Sir composing / stale prior fire — input line has text, no active marker**
`❯ <text>` on the input line with no `● <verbing…>` marker. Either Sir is at the keyboard mid-composition, or a prior automated fire's text is stuck un-submitted. Distinguish by content: if the text starts with the standard continue-prompt string, it's stuck-stale; otherwise treat as Sir composing and DO NOT touch.

**7. Silent premature pause — bare `❯ `, everything else absent**
Empty input line, no active-verb marker, no subagents, no background-task counter, no menu. This is the only state where sending the continue-prompt is safe.

---

**Send-keys gotchas** (critical — these bit me during the 2026-07-03 4h 0:Jarvis watch):

- **`send-keys -l 'text'` + `send-keys Enter` is NOT atomic.** Between the two, the target Claude Code can enter a state that swallows Enter (hooked notification popup, autocomplete overlay, mid-turn queueing). The text lands but Enter doesn't submit. Result: your prompt sits in the input line indefinitely. The right pattern is: send, `sleep 3`, re-capture pane, verify an active-verb marker appeared; if not, report Enter got swallowed and do NOT retry (retrying appends more text to the stuck buffer).

- **Menus consume the first keystroke as selection.** If a numbered menu is up and you `send-keys -l 'continue working…'`, the first `c` may be interpreted as a filter-navigation keystroke, and your subsequent Enter selects the highlighted option (usually option 1). This silently commits a decision. Menu-safe pattern: `send-keys -l '4'` + `send-keys Enter` FIRST to route to "Type something" (dismissing the menu into free-text mode), THEN send the free text + Enter.

- **Stale input from a prior fire looks the same as Sir composing.** Distinguish by string match — if the text starts with the standard continue-prompt string, it's your own leftover; safe to send single Enter to submit. Any other content: back off.

- **From sandboxed bash, tmux calls need `env -u TMUX`** — see [[reference-nexus-pipeline-gotchas]]. Never combine text+Enter into one `send-keys` call — always separate calls, never multi-line `-l`.

Used together with [[tmux-watch-layer-pattern]] for the full watcher design.
