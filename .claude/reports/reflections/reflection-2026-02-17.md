# Session Reflection — 2026-02-17 (Session 21)

## Session Focus
Experiment 7b execution (JICM v7 quality assessment) + codebase hardening + commit/push.

## What Went Well

1. **Full experiment execution**: Completed all 9 trials (3 blocks x 3 treatments) of Experiment 7b in a single session, including probe delivery, response capture, and scoring.
2. **Clean experimental methodology**: Session-natural probes (real work facts) proved robust after Experiment 7 discovered that synthetic facts trigger Claude's anti-poisoning defense.
3. **Non-inferiority confirmed**: JICM v7 matches /compact quality (clean trial mean: S=9.5, C=8.5, X=9.25 out of 15), validating the architectural decision to replace the 210s LLM agent.
4. **Comprehensive gitignore cleanup**: Untracked 21 runtime files and added 15 new patterns, preventing future tracking drift for JICM sessions, telemetry, and ephemeral context files.
5. **Context restoration worked**: Successfully resumed mid-experiment across a context window boundary — the v7 checkpoint + session-state provided enough continuity.

## What Could Improve

1. **File-reading confound**: W0 proactively reads source files during quality probes, boosting all methods to 12.0/15 and masking treatment differences. Future experiments need either (a) a "no tool use" instruction in the probe, or (b) probes based on conversational facts that aren't recoverable from files.
2. **Cascade confound**: /compact preserves prior probe answers in compacted context. Sequential within-session trials can't provide independent /compact measurements. Future design: fresh session per trial, or longer inter-trial gaps with substantial intervening work.
3. **Code review agent hallucinations**: The code review agent fabricated findings about code patterns that don't exist in the actual files (signal files, JSON construction, threshold values). Verified via manual read. This is the second time this has happened — the pattern is now documented in MEMORY.md as a hard rule: ALWAYS verify agent findings against actual source.

## Key Discoveries

- **Anti-poisoning defense (B.4)**: Claude detects and resists planted synthetic facts, both when tagged with `[QUALITY-SEED]` markers and when framed naturally. This invalidated Experiment 7's synthetic probe methodology and led to the session-natural probe redesign for 7b.
- **File-reading dominance**: Agent autonomy (reading relevant source files during probes) is the #1 factor in quality scores, swamping treatment differences. This means JICM v7 quality is "good enough" — the agent self-compensates.
- **JSONL array content format**: User messages in the Claude Code JSONL transcript use `[{type: "text", text: "..."}]` array format, not plain strings. The original prep script missed these entirely. Fixed with array-aware jq extraction.

## Patterns Reinforced

- tmux send-keys: text and Enter MUST be separate calls (third session confirming this)
- `git rm --cached` for untracking gitignored files (standard but worth documenting for session-start context)
- jq `--arg` for safe JSON construction (vs string interpolation)

## Metrics

| Metric | Value |
|--------|-------|
| Commits | 1 (5fa4b66) |
| Files changed | 79 (+3634/-3972) |
| Experiment trials | 9 |
| Runtime files untracked | 21 |
| Gitignore patterns added | 15 |
| Bugs found | 1 (JSONL array extraction) |
| Duration | ~4 hours (including experiment execution) |

## Next Session Recommendations

1. Update Experiment 7b report with file-reading confound analysis (already in report)
2. Monitor JICM v7 cycles for stability (2nd session post-deployment)
3. Phase C: Mac Studio Infrastructure (when hardware arrives)
4. Phase E.1: Memory System Comparative Analysis
