# Retry Detection Pattern

**Status**: Active
**Created**: 2026-03-13
**Purpose**: Break out of stuck loops when Claude repeatedly fails to satisfy a request

## Problem

When Claude gets a mental model wrong, subsequent attempts tend to be variations of the same flawed approach. The user has to ask 3-4+ times, each time getting essentially the same wrong answer tweaked slightly. Claude doesn't naturally recognize it's stuck — it needs an external signal.

## Solution

A `UserPromptSubmit` hook that monitors user messages for retry/correction patterns. After 3 consecutive retry signals on the same topic, it injects a context nudge telling Claude to step back, re-read the original request, question its assumptions, and try a fundamentally different approach.

## Architecture

```
User submits prompt
        │
        ▼
UserPromptSubmit hook fires
        │
        ▼
retry-detector.py
  ├── reads prompt from stdin (JSON)
  ├── loads state from ~/.claude/data/retry-state.json
  ├── classifies message: retry | satisfaction | reset | neutral
  ├── tracks file paths for topic fingerprinting
  ├── on retry_count >= 3 → injects nudge via additionalContext
  └── saves updated state
```

## Key Files

| File | Purpose |
|------|---------|
| `~/.claude/hooks/retry-detector.py` | Hook script (~200 lines Python, no deps) |
| `~/.claude/data/retry-state.json` | Rolling state (auto-created, auto-expires) |
| `~/.claude/settings.json` | Hook registration (`hooks.UserPromptSubmit`) |

## Message Classification

The detector classifies each user message into one of four categories:

| Classification | Meaning | Effect on Counter |
|---------------|---------|-------------------|
| **retry** | Correction/rework request ("try again", "wrong", "not what I asked") | +1 |
| **satisfaction** | Approval of previous attempt ("looks good", "perfect", "yes") | Reset to 0 |
| **reset** | Topic change ("moving on", "next thing", "different question") | Reset to 0 |
| **neutral** | Normal conversation, new detailed requests | No change |

## Topic Change Detection

The detector tracks file paths mentioned in messages. If the user starts referencing completely different files, the counter resets — they've moved on to a new topic.

## Auto-Expiration

State expires after 30 minutes of inactivity. Prevents stale state from a previous session from contaminating a new one.

## The Nudge

When triggered, Claude receives:

```xml
<retry-detector count="3">
The user has asked you to rework this 3+ times. Your current mental model
may be the problem, not just the output.

Before responding:
1. Re-read the ORIGINAL request — what did they actually ask for?
2. What assumption have you been making that could be wrong?
3. Consider a fundamentally different approach, not a variation of the same one.
4. If you're unsure what they want, ASK — don't guess again.
</retry-detector>
```

## Design Decisions

- **No LLM**: Pattern matching is sufficient for detecting retry language. Keeps it fast and free.
- **Python over bash**: JSON state management and regex are cleaner in Python. No external dependencies.
- **Threshold of 3**: First retry could be a minor tweak. Second could be clarification. Third means the approach is wrong.
- **No reset on nudge**: Keeps nudging on 4th, 5th attempts. The nudge should be persistent until the user is satisfied.
- **30-minute expiry**: Sessions that go idle shouldn't carry stale retry state forward.
- **File path fingerprinting**: Simple but effective topic detection. If you're talking about different files, you're on a different topic.

## Tuning

Adjustable constants at the top of `retry-detector.py`:

| Constant | Default | Purpose |
|----------|---------|---------|
| `RETRY_THRESHOLD` | 3 | How many retries before nudge fires |
| `EXPIRE_MINUTES` | 30 | State expiry for idle sessions |
| `RETRY_PATTERNS` | (list) | Regex patterns that signal a retry |
| `RESET_PATTERNS` | (list) | Regex patterns that signal topic change |
| `SATISFACTION_PATTERNS` | (list) | Regex patterns that signal approval |

## Limitations

- Won't catch subtle dissatisfaction (user doesn't use retry language)
- Topic detection is file-path based — purely conversational topics without file references are harder to track
- Can't distinguish "do it again" (positive repetition) from "try again" (correction) in all cases — weighted toward correction context
