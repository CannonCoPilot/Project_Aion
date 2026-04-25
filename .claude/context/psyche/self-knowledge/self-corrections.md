# Self-Corrections Log
# Tracks Jarvis self-identified mistakes and course corrections for AC-05 reflection
#
# Format: date | category | what-happened | what-should-have-happened | lesson
# Categories: approach, tool-use, efficiency, architecture, judgment

# 2026-02-18 — File created by AC-06 self-evolution (session 24)
# Pattern: Docker-compose discrepancies were evaluated but NOT changed — correct restraint
# Pattern: JICM v7 context restoration worked well — no self-corrections needed this session

# 2026-02-22 | efficiency | Queried DB with assumed column names (entity_type, hf_id_other) causing 3 failures before discovering actual schema via information_schema | Should always run schema discovery before ad-hoc queries on unfamiliar tables | Lesson: check information_schema.columns first on any table you haven't queried before
# 2026-02-22 | efficiency | Initial ground truth queries didn't filter by world_id, mixing data from World 1 (Namoram, 5K HFs) and World 2 (Ormon, 50K HFs) causing confusion about which world wars and linked figures belonged to | Should always include world_id filter when querying multi-world schemas | Lesson: multi-tenant/multi-world schemas require explicit tenant filtering from the first query
# 2026-02-22 | tool-use | Used 'qwen3:8b' (Ollama model name) with LiteLLM proxy which uses alias 'qwen3-8b-nothink' — got 400 error | Should check /v1/models endpoint first when using LiteLLM | Lesson: LiteLLM model aliases differ from Ollama names; always verify with /v1/models

# 2026-03-22 | judgment | Declared game "completely stalled" and "FPS-dead" after a few minutes of no tick advancement under Prism ARM emulation with 37 hostile undead | Should have waited 5+ minutes with periodic tick checks; the game WAS advancing at <1 tick/sec | Lesson: Under Prism x86 emulation with heavy combat, ticks-per-minute (not per-second) is normal; patience required before declaring failure
# 2026-04-24T23:41:20Z | judgment | JICM checkpoint inferred stale task: '(session-state.md last updated 4422m ago — may be stale, prefer conversation for current task)' — matches COMPLETE items in current-plans.md | Derive current task from recent conversation only
# 2026-04-24T23:42:00Z | judgment | JICM checkpoint inferred stale task: '(session-state.md last updated 4423m ago — may be stale, prefer conversation for current task)' — matches COMPLETE items in current-plans.md | Derive current task from recent conversation only
# 2026-04-24T23:43:48Z | judgment | JICM checkpoint inferred stale task: '(session-state.md last updated 4424m ago — may be stale, prefer conversation for current task)' — matches COMPLETE items in current-plans.md | Derive current task from recent conversation only
# 2026-04-24T23:47:16Z | judgment | JICM checkpoint inferred stale task: '(session-state.md last updated 4428m ago — may be stale, prefer conversation for current task)' — matches COMPLETE items in current-plans.md | Derive current task from recent conversation only
