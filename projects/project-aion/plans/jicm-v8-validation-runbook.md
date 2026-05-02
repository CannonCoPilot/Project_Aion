# JICM v8 Prototype Validation Runbook

**Purpose**: User-executable validation procedure for the JICM v8 portable architecture prototype deployed in Jarvis-Dev. Executes Stage 1 (regression-catch) of the two-stage validation gating pattern.

**Created**: 2026-05-01
**Author**: Jarvis (autonomous synthesis)
**Audience**: User (Nate) — three short tests, ~10 minutes total
**Status**: READY for execution; agent rate-limit is irrelevant (no agents required)

**Design doc**: `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/jicm-portable-architecture.md`
**Audit doc**: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/designs/jicm-v7-audit-2026-05-01.md`
**Pattern**: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/two-stage-validation-gating.md`

---

## 0. Why This Runbook Exists

JICM v8 replaces the v7 external watcher process (`jicm-watcher.sh`, tmux W1) with a portable in-process gate (`jicm-gate.sh`, UserPromptSubmit hook). Three behaviors must be verified before promoting from Jarvis-Dev to Jarvis production:

1. **Baseline state-file write** — the hook must observe context tokens and persist them on every prompt
2. **Soft nudge** — at 30% (default) the hook injects a one-time advisory `additionalContext` and sets a sticky flag
3. **Hard halt** — at 65% (default) the hook returns `decision:"block"` with a `systemMessage` instructing the user to `/clear`

The thresholds are configurable via env, so we test them by forcing 1% and 2% trigger points — a trivial first prompt will exceed both.

---

## 1. Prerequisites

| Item | Path | Verification |
|------|------|--------------|
| Hook 1 (gate) | `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/hooks/jicm-gate.sh` | `ls -la $_` should show `0755` |
| Hook 2 (precompact) | `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/hooks/jicm-precompact.sh` | `ls -la $_` should show `0755` |
| Status line | `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/scripts/jarvis-statusline-v8.sh` | `ls -la $_` should show `0755` |
| settings.json registration | `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/settings.json` | `jq '.statusLine, .hooks.UserPromptSubmit[0]' $_` should show statusLine block + jicm-gate.sh as the FIRST UPS hook |
| `jq` | system | `command -v jq` |

**Quick prerequisite check** (run from `/Users/nathanielcannon/Claude/Jarvis-Dev`):

```bash
ls -la .claude/hooks/jicm-gate.sh .claude/hooks/jicm-precompact.sh .claude/scripts/jarvis-statusline-v8.sh \
  && jq -e '.statusLine and (.hooks.UserPromptSubmit[0].hooks[0].command | contains("jicm-gate"))' .claude/settings.json \
  && command -v jq >/dev/null \
  && echo "PREREQS OK"
```

Expected output ends with `PREREQS OK`. If any line fails, stop here and report which.

---

## 2. Test Setup

All three tests run inside a **fresh Claude Code session** in the Jarvis-Dev workspace. Open a new terminal window and:

```bash
cd /Users/nathanielcannon/Claude/Jarvis-Dev
claude --dangerously-skip-permissions --permission-mode bypassPermissions
```

**Do NOT** use `--continue` or `--resume` — we want a fresh session each test so the sticky-flag behavior (Test 2) can be cleanly observed.

Between tests, **exit Claude Code** (Ctrl+C twice or `/exit`), then **delete the per-session sticky flag** so the next test starts clean:

```bash
rm -f /Users/nathanielcannon/Claude/Jarvis-Dev/.claude/context/.jicm-nudge-shown \
      /Users/nathanielcannon/Claude/Jarvis-Dev/.claude/context/.jicm-state-hook.json
```

---

## 3. Test 1 — Baseline (verify state-file write)

**Goal**: Confirm the hook fires on UserPromptSubmit and writes `.jicm-state-hook.json`.

**Setup**: Fresh Claude Code session; no env overrides.

**Action**: Type any trivial prompt:

```
hello
```

**Verification** (in a separate terminal):

```bash
cat /Users/nathanielcannon/Claude/Jarvis-Dev/.claude/context/.jicm-state-hook.json | jq .
```

**Expected**:
- File EXISTS
- JSON parses cleanly
- Contains keys: `total_input_tokens`, `context_window_size`, `used_percentage`, `cache_read_input_tokens`, `cache_creation_input_tokens`, plus a `timestamp` or similar
- `used_percentage` is a small decimal (probably <5% on a fresh session)
- `total_input_tokens` is non-zero

**PASS criteria**: file written; numeric fields populated; `used_percentage` < 30 (so neither soft nor hard fired)

**FAIL signals** to escalate:
- File missing → hook didn't run; check `.claude/logs/jicm-gate.log`
- File present but empty → jq missing or stdin empty; check `command -v jq`
- File present but malformed → bug in jq pipeline; capture exact content
- `used_percentage` is null/missing → hook isn't reading the right stdin path; check Claude Code source for `context_window` field placement

**Cleanup**: exit Claude, run the cleanup `rm` command from §2.

---

## 4. Test 2 — Soft Nudge (verify advisory + sticky flag)

**Goal**: Force the soft threshold to fire on the first prompt and confirm the nudge is shown exactly once per session.

**Setup**: Fresh Claude Code session, with environment override:

```bash
cd /Users/nathanielcannon/Claude/Jarvis-Dev
JICM_SOFT_PCT=1 JICM_HARD_PCT=99 claude --dangerously-skip-permissions --permission-mode bypassPermissions
```

`JICM_SOFT_PCT=1` makes any context above 1% trigger the soft nudge. `JICM_HARD_PCT=99` keeps the hard halt out of the way.

**Action 2a — first prompt**:

```
hello
```

**Expected response**: Claude's reply should include (or be preceded by) an additional-context advisory message — something like "Context approaching threshold — consider wrapping up or invoking /jicm." The exact wording is defined in jicm-gate.sh.

**Verification 2a**:

```bash
ls -la /Users/nathanielcannon/Claude/Jarvis-Dev/.claude/context/.jicm-nudge-shown
cat /Users/nathanielcannon/Claude/Jarvis-Dev/.claude/context/.jicm-state-hook.json | jq '.used_percentage, .threshold_state // "?"'
```

**Expected**:
- `.jicm-nudge-shown` EXISTS (sticky flag set)
- `.jicm-state-hook.json` shows `used_percentage > 1` and a state field indicating soft-threshold-triggered

**Action 2b — second prompt** (in same session):

```
hello again
```

**Expected response**: NO additional nudge (sticky flag suppresses repeat).

**Verification 2b**: response should not contain the nudge text. The `.jicm-nudge-shown` file is still there, unmodified.

**PASS criteria**: nudge shown once on Action 2a; suppressed on Action 2b; sticky flag persists; no `decision:"block"` was returned (Claude responded normally).

**FAIL signals** to escalate:
- Nudge not visible → hook output may be malformed JSON; check `.claude/logs/jicm-gate.log` for jq errors
- Nudge shown twice → sticky-flag logic broken
- Hook blocks the prompt → wrong threshold path taken; check JICM_SOFT_PCT vs JICM_HARD_PCT values

**Cleanup**: exit Claude; run cleanup `rm` from §2.

---

## 5. Test 3 — Hard Halt (verify decision:block + /clear instruction)

**Goal**: Force the hard threshold to fire and confirm Claude is blocked from running with a clear remediation message.

**Setup**: Fresh Claude Code session, with override:

```bash
cd /Users/nathanielcannon/Claude/Jarvis-Dev
JICM_HARD_PCT=2 claude --dangerously-skip-permissions --permission-mode bypassPermissions
```

`JICM_HARD_PCT=2` makes any context above 2% trigger the hard halt. (Soft default 30% means the hard halt path is what fires.)

**Action**:

```
hello
```

**Expected response**: Claude does NOT process the prompt. Instead, a system message appears stating something like: "JICM-HALT: context at X% (hard threshold 2%). Run /clear to compress and continue." (Exact wording from jicm-gate.sh.)

**Verification**:

```bash
cat /Users/nathanielcannon/Claude/Jarvis-Dev/.claude/context/.jicm-state-hook.json | jq '.threshold_state, .used_percentage'
```

**Expected**:
- `threshold_state` indicates HARD_HALT (or equivalent)
- `used_percentage > 2`
- The compressed-context-ready file may or may not have been written depending on whether jicm-prep-context.sh was invoked synchronously by the hook (per design doc); check `.claude/context/.compressed-context-ready.md` timestamp

**PASS criteria**: prompt blocked; remediation message visible; state file shows hard-halt verdict.

**Action — recovery test**: type `/clear` in the same session.

**Expected**: Claude clears context. session-start.sh hook (with `source=clear`) detects the JICM state, reads the compressed-context-ready file (if present), and injects it as additionalContext on the next prompt — Jarvis resumes work without losing the task.

**Verification**: after `/clear`, type `where were we?` — Jarvis should reference the compressed checkpoint, not act as a fresh session.

**FAIL signals** to escalate:
- Prompt processed normally → `decision:"block"` not honored; check Claude Code version supports the contract
- Block message but no instruction to /clear → systemMessage text malformed
- After /clear, Jarvis acts as fresh session → restoration chain broken; check session-start.sh expects the v8 state file shape

**Cleanup**: exit Claude; run cleanup `rm` from §2.

---

## 6. Stage 1 Verdict Decision

After running Tests 1, 2, 3:

| Outcome | Verdict | Action |
|---------|---------|--------|
| All 3 PASS | `STAGE_1_CLEAR` | Wait observation window (48h on Jarvis-Dev under realistic use), then proceed to Stage 2 plan in design doc §5 |
| Any 1 FAIL | `STAGE_1_HALT` | Rollback hook registration in settings.json; capture failure logs; iterate on jicm-gate.sh |
| Mixed pass + non-blocking warnings | `STAGE_1_DEFERRED` | Re-run after fix; do not promote |

**Rollback procedure** (if Stage 1 HALTs):

```bash
cd /Users/nathanielcannon/Claude/Jarvis-Dev
# Disable v8 by removing the gate hook from settings.json:
jq 'del(.statusLine) | .hooks.UserPromptSubmit |= map(select(.hooks[0].command | contains("jicm-gate") | not))' \
   .claude/settings.json > .claude/settings.json.tmp \
   && mv .claude/settings.json.tmp .claude/settings.json

# Verify rollback:
jq '.hooks.UserPromptSubmit[].hooks[].command' .claude/settings.json | grep -c jicm-gate
# Expected: 0
```

---

## 7. Stage 2 Preview

Stage 2 is the formal sign-off and runs over a longer window of normal Jarvis-Dev use. Pre-registered axes (per design doc §5):

| Axis | Predicted effect | Measurement window |
|------|------------------|---------------------|
| JICM cycle correctness under real workload | Compression + restoration chain works on real long sessions | 7-14 days |
| Cache stability vs v7 | Δ ≤5pp from v7 baseline | continuous via `.jicm-state-hook.json` log |
| User-perceived friction | Soft nudge does not feel intrusive; hard halt is rare or never seen at default thresholds | qualitative report |
| Status-line accuracy | 9 panels render correctly; no truncation/jitter | every prompt |
| Failure recovery | A simulated jq-missing or stdin-malformed scenario degrades gracefully (pass-through) | scripted fault injection at Stage 2 end |

Stage 2 PASS promotes the v8 architecture from Jarvis-Dev to Jarvis production by replicating the three artifacts + settings.json changes, then disabling the v7 watcher process.

---

## 8. Files Touched (read these on issue)

If anything in §3-§5 fails, the diagnostic chain is:

1. `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/logs/jicm-gate.log` — every hook invocation logs here
2. `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/hooks/jicm-gate.sh` — the hook itself (~252 lines)
3. `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/settings.json` — registration
4. `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/scripts/jicm-prep-context.sh` — compression script (inherited from v7, unchanged)
5. `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/hooks/session-start.sh` — restoration chain (inherited from v7)
6. `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/jicm-portable-architecture.md` — design intent and decision rationale

---

*JICM v8 Prototype Validation Runbook v1.0 — Stage 1 of two-stage validation gating*
