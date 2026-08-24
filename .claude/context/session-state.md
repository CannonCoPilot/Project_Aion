# Session State

**Purpose**: Compact status snapshot. Detailed history lives in commit log + scratchpad archive.
**Update**: At checkpoints — task start, blocker, end-of-session.

---

## ACTIVE (2026-08-01) — Palimpsest OriginalDR · GENESIS CAMPAIGN · board **0.8576**, none below 0.70
Background lane `dev-bg-c3014d75`. **216 tests green · 49 commits, ALL UNPUSHED (hold stands).**
Entry points: `ocr-spike/CHAPTER-WORKFLOW.md` (**read § THE ROUND TEMPLATE first**, then § 6b) and
`ocr-spike/CAMPAIGN-STATUS.md` (live state + worst-first queue).

- **Both background passes FINISHED.** Full 50-chapter re-measure: 0.8314 -> 0.8543. The passes were worth
  **+139 cells** against **+3** for hand-attributed geometry in the same period.
- **THE ROUND TEMPLATE written**, synthesized from the ten chapters that crossed 0.90 (the doc had been
  distilled from Genesis 1 and 16 only, which is why per-chapter workload never fell). Economics across +265
  cells: passes **69%**, systemic fixes **25%**, per-chapter hand work **6%** for most of the hours — but
  every systemic fix was DISCOVERED by hand-work. **Hand-work's return is the defect it exposes.**
- **THE SIGNAL-6 SELF-DEFEAT.** My own router said "all four sources fail = edition divergence, a ceiling,
  never chase". Wrong reasoning (S6 is the **1635** edition vs 1609 references, so it CAN fail alone;
  measured arm gap +0.0115 vs -0.0125 for the three 1609 witnesses) and wrong instruction — the bucket held
  **five reference defects worth 20 cells**. Fixed with a **splitting test**, not a better label.
- **FIVE EXCISIONS ENCODED** (`ref_renumber.APPARATUS_EXCISIONS`, 14 new tests): +20 cells, 4 per locus,
  **zero regressions**. All s_dismas infixed marginal apparatus `trim_apparatus` cannot reach (suffix-only;
  1.4x ratio blind to a short gloss). True divergence ceiling is **7 verses**, not 34.
- **TWO NEGATIVES PINNED**: `MAXW = 2200` is NOT a ceiling (tested 2200 vs 3400 — flat, kraken normalizes
  line height); the ch8 modern-passes/archaic-fails signature is NOT a divergence detector (not enriched in
  S6: 8.4% vs S9's 12.9%).
- **NEXT (holding, per Sir)**: the 0.85-0.90 band is **one problem wearing sixteen chapter numbers** — S6 is
  worst in **15 of 16**. Route through recognition. **Do NOT re-run the same passes** (they hardened their
  own residue; MISREAD now 51.5% and is a confusion set = R2 fine-tune territory).
  **Escalate REFL-033 to Sir**: acquire a **1635 reference** so S6 is scored against the edition it prints.
- Reflection: `.claude/reports/reflections/reflection-2026-08-01.md` · proposals REFL-031..034 queued.

---

## Live processes (tmux `aion` session)
Authoritative map: `.claude/scripts/launch-aion.sh` header + `window_target_index()`.
- W0 Jarvis: Master Archon · W1 Protos: warm session for chain forks (Alfred identity)
- W2 Urist: DF Archon · W12 Genie: Research Archon · W13 Jacques: Contract Archon
- W8 Watcher: JICM **console (read-only)**. The watcher itself is the launchd job
  `com.aion.jicm-watcher` (jicm-watcher.sh, v9, registry-driven, all lanes incl. W0) —
  NOT a tmux process, and NOT the retired v7.9 W0-only singleton.
- W10 Styx: host-executor-bridge.sh --daemon · W11 Jarvis-dev: engineering/infrastructure agent
- W14+ chain-*: Alfred fork-resume windows (`_next_chain_index()` starts at 14)

## Notes
- MCPs configured: 3 active (jarvis-rag, jarvis-graphiti, jarvis-pulse) + 4 disabled in `.mcp.json.disabled-2026-05-04` backup. Current session still has 7 loaded (MCP changes apply on next restart).
- JICM threshold: soft **300K** / hard **330K** (`jicm-config.sh`, v9 defaults; Protos lane 140K/160K).
  Override per-session with `JICM_SOFT_TOKENS`/`JICM_HARD_TOKENS` — but the launchd daemon reads
  its plist environment, not your shell.
- Pulse API prod: `localhost:8700`; dev: `localhost:8800`
- Dev DB: `pulse_dev` / pw in `.claude/secrets/credentials.yaml`

---

*Superseded sections (M12 sprint 2026-07-27, M5 R3 2026-07-25, and the 2026-06-15 post-audit / P0–P3 priorities block) archived to `archive/session-state-2026-08-01-superseded.md` on 2026-08-01. Pre-optimization narrative archived earlier to `archive/session-state-2026-05-04-pre-optimization.md`.*
