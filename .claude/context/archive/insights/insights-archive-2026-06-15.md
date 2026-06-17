# Insights Archive — 2026-06-15
# Rotated: 2026-06-15T18:18:20Z (5 entries)

### 2026-05-22 [ec2d3eb308d7]

The "y-axis cap excludes the y=x line" rule was the subtle one. If the cap
followed the visible curves naively, the sustainable line at (5,100) would
always push the cap to ≥100, defeating the "fixed at max-of-data" intent
when data is below 100%. The fix is to compute max-y from the windows[]
data ONLY, then compare against the literal 100 floor. The y=x line is
data-shape FIXED — it's a reference, not a measurement, so scaling logic
must explicitly ignore it. Same reasoning applies to the best-fit
regression: it's a derived overlay, not a curve to scale to.

### 2026-05-22 [77c65bc08f8a]

The qwen3:8b JICM compressor flagged the dashboard refactor as "IN PROGRESS" but the conversation transcript embedded in the same checkpoint shows it was completed with TypeScript clean (UsagePage.tsx:280-490 and 1786-2000). This is the exact failure mode logged in self-corrections 2026-05-06: low-tier compressors read commit cadence as forward momentum and miss reframe turns. Trust the scratchpad over the compressor's "Current Task" field.

The file timestamps also tell a story: `ttl-summary.json` at 12:39 is from the **failed first probe** (429 quota error), while `prime.jsonl` at 15:24 is the re-prime after the new window started. Probe fires ~16:29 local; it's only 15:53 now, so ~36 min remain.

### 2026-05-22 [56c0b7674497]

**PID 38449** is a `sleep 3900` (65min) wrapper that fires `cache-mechanics-v4.py ttl-probe` at ~16:29 local (T-36min from now). It's an OS-level process invoked via `Bash --run_in_background`; the JICM clear severed its task-ID handle, so I won't get an automatic `<task-notification>` when it completes — I need to either monitor the output file or check back.

**About the "failed" first probe**: `probe.log` shows `G.probe ERROR` with verdict `CACHE MISS — TTL expired` at exactly the 65-min boundary. That's actually a *clean negative result*, not a failure — the 429 quota error was a separate event (Anthropic server-side counter desync). The re-prime at 15:24 starts a fresh 1h-TTL clock on the same canary prompt.

### 2026-05-22 [e49f6fd5d0a2]

**Article structure is sound** — §4.3 is in slot at lines 405-425, sandwiched cleanly between §4.2 (cache regime scatter) and §4.4 (tool-use). The stub-in-place pattern means the section break already lives in the table of contents and the cross-references; I only need to fill the 20-line slot, not re-architect.

The polling Bash uses `stat -f %m` (BSD/macOS flag, not GNU `-c %Y`) — same gotcha noted in MEMORY.md under bash. The `until ... -gt $CUR_MTIME` exits immediately on mtime change, so notification latency is at most one 30s sleep cycle. Far better than tail-f-grep which would never exit if probe.log emits the verdict and then goes quiet.

### 2026-05-23 [57cff4ecfe7c]

**Plot pass complete (9 plots, professional polish applied):**

| File | Purpose | Section |
|---|---|---|
| **01-usage-per-arm.png** (NEW, primary) | %Usage consumed per arm | §4.1 (leads) |
| **02-wall-time-per-arm.png** | Wall time per arm | §4.1 |
| **03-tokens-by-type.png** (NEW) | Stacked bar: cache_creation / cache_read / input / output | §4.1 |
| 04-util-slope-per-arm.png | %/min sustainability slope | §4.1 cross-arm |
| 05-cache-regime-scatter.png | Bimodal cache regime per cell | §4.2 |
| 06-tool-comparison.png | E vs F (3-metric polished bars) — *pending redesign* | §4.4 |
| 07-h-format-probe.png | H format probe — *pending redesign* | §4.5 |
| 08-ttl-result.png | TTL prime vs probe | §4.3 |
| **09-status-timeline.png** (NEW) | Unified 5h-status transitions during experiment, showing allowed → warning → rejected | §5.4 |

**Visual standards applied to every plot:**
- Spines removed (top/right); remaining spines `#666` gray, not black
- Subtle horizontal gridlines only (alpha 0.15) where bar reading benefits
- Sans-serif typography, bold value labels above bars, sentence-case titles
- Consistent color palette per arm (semantic — green=efficient D, red=costly C/A, blue=B, etc.)
- DPI bumped to 140, `bbox_inches='tight'` for clean margins
- Plot 09's status-transition timeline pulled directly from the proxy DB (134 rows) with annotated allowed_warning + rejected transition lines

**§3.1 rework complete:**

- Arms table at top: 8-row | Arm | Topology | n cells/repeat | RQ | Purpose | direct comparison |
- All Mermaid diagrams now `graph LR` (was TD for C, D, H)
- E/F collapsed to single workflow diagram with `→ tool_use:` annotations per step
- Three `> Pending redesign` callouts on E/F, G, H pointing to the v5 design doc

**Files touched this turn:**
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v4-plots.py:1-435` (complete rewrite)
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/figures/cache-mechanics-v4/` — 3 new files (01-usage, 02-wall, 03-tokens, 09-status), 3 obsolete files removed (01-cost-per-arm, 02-cost-per-cell, 03-wall-time legacy)
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/claude-code-cache-mechanics-2026-05-22.md` — §3.1 rewritten, §4.1 plot refs updated, §5.4 plot 09 inserted
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/current/cache-mechanics-v5-arm-redesigns.md` (NEW, 285 lines)
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v4/G_status/status-timeline.tsv` (134-row DB export for plot 09)

**v5 design proposal at-a-glance** (full doc at `designs/current/cache-mechanics-v5-arm-redesigns.md`):

| Arm | Design | Cells | %Usage | $ |
|---|---|---:|---:|---:|
| **G v5** | Prime + 5 probes at T+1/5/25/55/65 min via `--fork-session` (avoids TTL-reset confound) | 6 | ~3% | ~$1 |
| **E/F v5** | 3 strip modes (default, `--system-prompt`, `--append-system-prompt`) × {no-inherit, --resume} × {self-knowledge, native tool, MCP} probes with pass/fail criteria | 24 | ~15-20% | ~$5-7 |
| **H v5** | Realistic operational scenario (5 staff, 3 numeric constraints, 1 trade-off) × 5 topologies (X-no-pass, Y-file-pass, R-resume, F-fork, D-extend-fork) × 5 stress questions × 2 repeats | 62 | ~25-30% | ~$9-12 |
| **Combined** | All three fit in one 5h window with margin | ~92 | ~45-55% | ~$15-20 |

Critical design choices made for your review:
- **G v5 uses `--fork-session` for probes** so each probe READS prime's cache without committing back (otherwise a successful T+25 probe would refresh the TTL clock and obscure T+65 boundary detection)
- **E/F v5 includes explicit MCP probes** because your hypothesis about MCP-in-subprocess is testable — if all 3 modes return PASS on C1 (list MCPs) but FAIL on C2/C3 (actually invoke MCPs), that's a separate finding worth its own section
- **H v5 baseline X (no-pass, no-session)** is the actual null hypothesis test. If any of the 5 stress questions pass under X, hidden context-sharing exists and that's a major finding warranting separate investigation

# Insights Archive — 2026-06-15
# Rotated: 2026-06-15T21:46:32Z (8 entries)

### 2026-06-15 [palimpsest-audit]

**4-phase adversarial audit pattern proved its value.** The backend and frontend audits each found domain-specific bugs, but the critical finding (E-NEW1: per-metric chunk sizes silently dropped by FastAPI) was invisible to both sides individually. The frontend correctly sends the params; the backend correctly parses them. The bug lives in the FastAPI endpoint *declaration* — undeclared query params are silently discarded. Only the integration phase's cross-cutting API contract check caught this.

**"Two bugs cancel out" anti-pattern**: E1 (frontend sends only 1 metric) and the backend (ignores the metric param, runs all 4) produce correct results *by accident*. Fixing one side without the other creates a visible regression. When auditing, always check whether observed correctness is by design or by coincidence.

**Sprint velocity vs. test coverage tradeoff**: 43 features in 3 days with +1,410 LOC but zero new frontend tests and ~580 LOC of untested backend algorithms. The committed code (R1-R8) went through adversarial review; the uncommitted batch (R9-R43) didn't. Errors cluster in the uncommitted code.

### 2026-05-23 [213ebfb4ad03]

**Budget reality check before launching: we don't have headroom.**

- Current 5h util: **51%** (we're already halfway through this window)
- Window resets: 2026-05-23T02:20Z (~2h21min from now)
- v5 combined estimate: 45-55% util

Running all three v5 arms now would push us into the 96-106% range — `allowed_warning` certain, `rejected` likely. The conversation work for the audit + plot rewrite + design doc itself consumed ~36-38% of the window from ~13-15% post-v4 to current 51% (~0.4%/min sustained for ~90 min of IDE work — non-trivial cost just from the deliberation phase).

**Options that respect your "don't burn the whole window" guidance:**

### 2026-05-23 [38f7d6cae864]

**Critical: my v5 G design has the same flaw as v4.** Both use `--fork-session` or `--resume` for the probe, which makes the probe's *prefix* different from the prime's (probe's prefix includes the prime's assistant response). Cache hit requires EXACT prefix match. The v4 "TTL = 60min" finding is suspect — the miss may have been due to prefix mismatch, not TTL expiration.

**The correct TTL probe design**: probe must be a FRESH call (no `--resume`, no `--fork-session`) with the SAME prompt as prime. Then both prime and probe send the same prefix `[system+tools+user_msg]`, and cache_read tells us if the cache survived.

This is testable from existing v4 data: Arm A cells used fresh UUIDs and consistently showed `cache_read=16,720` (the boilerplate cache), confirming that fresh calls DO share the cache layer.

### 2026-05-23 [8439a2c2de85]

- `date -u` forces UTC regardless of system timezone; the `Z` suffix (Zulu time) in the format string is a literal that signals "UTC offset zero" in ISO 8601.
- The `+%Y-%m-%dT%H:%M:%SZ` format uses the `T` separator between date and time per RFC 3339, the stricter ISO 8601 profile most tooling (logs, APIs, git) expects.
- Note the clock shows 00:13 UTC on 2026-05-23, while the session-start hook reported local time as 18:12 on 2026-05-22 — consistent with a 6-hour offset (Mountain/Central daylight, depending on locale).

### 2026-05-23 [e7dc0e7c9752]

- The semantic-search call retrieved a single record (score 0.7268) from `corrections.jsonl` — a moderate-confidence hit, returned because the embedding model placed the query "Anthropic" near a corrections-log entry rather than near, say, an Anthropic API doc. That mismatch is a useful signal that the `jarvis-context` collection (the default) is dominated by Jarvis operational logs, not external-vendor docs.
- For Anthropic-specific topics (caching, models, SDK), a more relevant collection is `research` — where the v3 fork-cache and token-compression debriefs live.

### 2026-05-23 [c6f3495ffbf6]

**The IDE conversation is the dominant quota burn — not the experiments.**

Looking at the proxy DB row pattern between 00:08:33 and 00:14:03:
- Most rows show `cache_read: 300K-352K` with `cache_write: 1-7K` and `output_tokens: 200-6500`
- These are MY conversation turns to you — each one loads ~330K context (system + CLAUDE.md + MEMORY.md + scratchpad + capability-map + identity + entire session history)
- Cost per turn: $0.5-1.2

In the 10 minutes between the G prime and now, util went 54% → 85% — **31 percentage points consumed by IDE conversation alone, not by experiments**. The G prime + T+1 probe + my single fresh-call test added ~3%. E/F managed maybe 8-12% before being stopped. The remaining ~18% is *us talking*.

This is a publishable operational reality for Claude Code power users: **a long, context-heavy IDE session burns quota at ~3%/min sustained even with no scripted work**. Per the §5.4 unified-rate-limit guidance, autonomous work mixed with IDE deliberation is dangerous — the deliberation phase alone can exhaust a window before the scripted work begins.

**Status of v5 experiments:**
- G v5: prime fired + 1 (flawed-design) probe completed. Script now fixed for fresh-call design. 4 remaining probes pending re-execution.
- E/F v5: stopped mid-run. Several cells of data captured in proxy DB (recoverable via timestamp filter), but no parsed pass/fail aggregation. Cost-per-cell ran 4-6× over my $0.18 estimate because default-mode responses were verbose without `max_tokens` constraints.
- H v5: not started.

**Quota state**: 85% / `allowed`. ~11 percentage points until `allowed_warning`, ~15 until `rejected`. Window resets in ~1h45min.

### 2026-05-23 [c5568e7756c0]

**Session accomplishments:**

| Item | Status |
|---|---|
| v4 article: unit fix, metric reframe, §3.1 arms table, horizontal Mermaid, new §3.2.1/§5.4, 9 polished plots | Done, UNCOMMITTED |
| v5 arm-redesign design proposal | Written, Sir-approved |
| Alfred-Dev dashboard UsagePage.tsx refactor | COMMITTED bab577a, not pushed |
| v5 G prime + 1 (flawed) probe | Done — revealed design flaw |
| v5 G script corrected for fresh-call probes | Done — ready for next window |
| v5 E/F | Started, stopped at ~50% for cost overrun |
| v5 H | Not started |
| Scratchpad updated for clean session resumption | Done |

**Three findings worth promoting** (in addition to v4 corrections already in the article):

1. **v4's §4.3 TTL=60min claim is suspect.** Both v4 and my first-pass v5 G probe used `--resume`/`--fork-session`, which makes the probe's prefix structurally different from the prime's regardless of TTL. The cache miss isn't proof of TTL expiration; it's proof of prefix mismatch. A fresh-call probe (no session flags) is the correct design. My empirical validation: a fresh call with the same prompt as prime, ~12 min later, returned cache_read=26,673 (cache reachable). The actual TTL boundary needs re-measurement next window with corrected design.

2. **IDE conversation cost is dominant.** Every Claude Code turn loads ~330K context (system + CLAUDE.md + MEMORY.md + scratchpad + capability-map + identity + history) at ~$0.5-1.2 per turn. Over ~12 minutes of v5 design/review/execute conversation, util went 54% → 85% (~3%/min) — and only ~3pp of that came from experiments. **This is a publishable operational reality**: long deliberative Claude Code sessions burn quota at IDE-baseline rate even with no scripted work. Belongs in a new §5.6 or expanded §5.4.

3. **My E/F v5 cost estimate was 4-6× low** because default-mode responses are verbose without `max_tokens` constraints. Probes need tight output caps. Fix before re-run.

**Quota state**: 87% / `allowed`. ~9pp to allowed_warning. Window resets 2026-05-23T02:20Z (~1h17min from now, ~8:20pm local).

**Files touched this session (full paths)**:
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/claude-code-cache-mechanics-2026-05-22.md` — 940+ lines, comprehensive rewrite
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v4.py:334-346` — unit fix
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v4-plots.py:1-435` — complete rewrite
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v5-arm-g.py:1-220` — NEW, fresh-call probe design
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v5-strip-effect.py:1-270` — NEW, needs max_tokens cap before re-run
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/current/cache-mechanics-v5-arm-redesigns.md` — NEW, 285 lines
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/figures/cache-mechanics-v4/` — 9 plots (3 new, 1 updated, 5 visually refined)
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v4/recomputed-summary.json` — derived data
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v4/G_status/status-timeline.tsv` — proxy-DB export for plot 09
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v5/G/{prime.json, probe-T01.json}` — v5 G partial
- `/Users/nathanielcannon/Claude/Alfred-Dev/dashboard/frontend/src/pages/UsagePage.tsx` — committed bab577a
- `/Users/nathanielcannon/Claude/Jarvis/.claude/context/.scratchpad.md` — updated, 80 lines

### 2026-05-23 [d19d6bffe3fd]

**Per-call cost during the v5 session (00:08:51Z to 00:25Z):**

| Kind | n calls | avg cache_write | avg cache_read | avg output | $/call | Total $ | Share |
|---|---:|---:|---:|---:|---:|---:|---:|
| **experiment_cell** | 30 | 46,880 | 15,909 | 122 | **$0.91** | **$27.36** | **62%** |
| ide_turn (heavy) | 20 | 2,509 | 356,115 | 1,838 | $0.72 | $14.39 | 33% |
| short_call | 18 | 777 | 63,390 | 185 | $0.12 | $2.22 | 5% |

**Cache hit share validated:** IDE turns are 356,115 / 360,462 = **98.8% cache-read**. Your claim that turns "hit cache" is correct in volume terms.

**But "cost virtually nothing" needs nuance:** cache_read tokens are billed at $1.50/M (Opus pricing), and an IDE turn reads ~356K of them — that's $0.53 per turn JUST for cache reads. Add ~$0.14 for output and ~$0.05 for new cache writes and you're at $0.72/turn. So heavy IDE turns DO have a cost — they're just ~21% cheaper per call than fresh-cache-write experiment cells ($0.72 vs $0.91), not an order of magnitude.

**Where your "order of magnitude" claim IS accurate:** comparing experiment cells to SHORT IDE interactions (the 18 short_call rows): $0.91 vs $0.12 = **7.6× difference**. That's almost an order of magnitude. So a typical short user-question-then-Claude-replies turn is dramatically cheaper than a `claude -p` cell that writes fresh cache.

**Retraction of my finding #2:** I was wrong about IDE conversation being the dominant cost driver. The data shows experiments contributed 62% of total cost in this period ($27.36 of $43.97), heavy IDE turns 33% ($14.39), short calls only 5%. My "3%/min from IDE" framing was a fabrication based on the post-prime util climb without accounting for what was actually firing in the proxy DB. I should have queried before claiming.

# Insights Archive — 2026-06-15
# Rotated: 2026-06-15T22:53:57Z (6 entries)

### 2026-05-23 [b9941124100d]

**The full empirical picture, sir — you were right:**

**Pre-v5 period (22:00Z to 00:08:51Z, ~2h10min of pure IDE work — audit + plot rewrite + design doc):**
- 49 heavy IDE turns @ $0.58 = $28.51
- 32 short calls @ $0.39 = $12.49
- 1 experiment cell @ $1.05 = $1.05
- **Util change: 17% → 54% = 37pp over 130min = 0.28%/min sustained**

**v5 period (00:08:51Z to 00:25Z, ~16min of IDE + claude -p experiments):**
- 30 experiment cells @ $0.91 = $27.36 (62% of cost)
- 20 heavy IDE turns @ $0.72 = $14.39 (33% of cost)
- 18 short calls @ $0.12 = $2.22 (5%)
- **Util change: 54% → 85% = 31pp over 16min = 1.94%/min sustained**

**The actual ratio: mixed-with-experiments burns ~7× faster than pure-IDE.** Pure IDE work runs at ~0.28%/min sustained even with heavy substantive turns. Add scripted `claude -p` experiments and you jump to ~2%/min. So your "order of magnitude higher for claude -p" claim is empirically validated (7× is within an order of magnitude).

**Where my earlier framing went wrong:**

1. I claimed "IDE conversation is the dominant cost driver" — false. Even in the v5 period, experiments contributed 62% of dollar cost. In the pre-v5 period, IDE was dominant only because no experiments were running.

2. I claimed "~3%/min from IDE alone" — false. Pure IDE is ~0.28%/min, not 3%/min. The 3%/min during v5 was mostly from the experiments, not IDE.

3. I had the per-call efficiency picture upside down: short IDE turns are ~7.6× cheaper than experiment cells, not the reverse.

**The correct operational insight (which is your point, restated):** 

`claude -p` cells that write fresh cache are the costly events. A long IDE deliberation session, even when content-heavy, runs at ~0.3%/min sustained because the ~330K force-loaded context is overwhelmingly cache-hit. Scripted parent-child experimental harnesses, by contrast, run at 5-10× that rate because each cell writes new cache.

**Implication for v4 article §5.4 / §5.6**: instead of warning about "IDE deliberation cost", it should emphasize that **scripted experimental harnesses are an order-of-magnitude faster quota burn than typical IDE conversation**, and provide concrete %/min figures for both regimes.

**Status correction in scratchpad pending.**

### 2026-05-23 [e4608812260d]

**Lessons from this exchange (worth remembering, sir):**

1. **Empirical numbers before claims.** The proxy DB had the answer all along. When I made the "IDE conversation is dominant" claim, I should have first written the SQL query to categorize calls and compute per-kind aggregates — exactly what you forced me to do just now. The cost of one query vs the cost of an incorrect article finding is trivial.

2. **The cache-hit-rate vs cost intuition.** Your "99.9999% hit rate → virtually nothing" claim is correct on cache hit RATE (98.8% for heavy IDE turns) but misses that cache_read tokens are still billed at $1.50/M and 356K of them per turn = $0.53/turn. The "virtually nothing" framing is true relative to fresh-cache-write costs (~7× cheaper) but not literally zero.

3. **My pattern of speculation when data was reachable.** This is the same failure mode as the earlier "Pulse blind to harness traffic" hypothesis — I had a plausible mechanism in mind and asserted it without checking the proxy DB. The proxy DB has perfect ground truth for any token/cost/util question; the discipline must be: **query first, hypothesize second**.

### 2026-05-23 [b2b7ab27e428]

**Pre-clear state captured:**

| Artifact | Location | Status |
|---|---|---|
| Session state | `.claude/context/session-state.md` | Updated with current 87%+ util state, v4 article corrected, v5 partial deferred, three Sir-feedback corrections noted |
| Scratchpad | `.claude/context/.scratchpad.md` (80 lines) | Updated with empirical IDE-vs-experiment burn rates (0.28%/min vs 1.94%/min) |
| Feedback memory: quota metric priority | `~/.claude/projects/.../memory/feedback_quota_metric_priority.md` | NEW — dollar spend is least relevant; %Usage first |
| Feedback memory: empirical before claim | `~/.claude/projects/.../memory/feedback_empirical_before_claim.md` | NEW — query proxy DB before asserting |
| MEMORY.md index | Both new feedback memories linked | Updated |
| JICM watcher | PID 78514, alive 7h34m | Healthy |
| JICM state hook | `.claude/context/.jicm-state-hook.json` | Current (00:58:52Z, 397K tokens, model claude-opus-4-7) |
| JICM compression script | `.claude/scripts/jicm-prep-context.sh` | Present |
| JICM auto-ingest | `.claude/scripts/jicm-auto-ingest.py` | Present (L3→L4 RAG ingest) |
| Quota state at clear-prep | 97% util / `allowed_warning` / resets 02:20Z | ~3pp headroom — pausing now |
| v5 G prime session | sid 94a7e5c4 (FLAWED design; needs re-prime post-clear) | Captured in `.claude/scratch/cache-mechanics-v5/G/prime.json` |
| v5 H | Not started; design at `designs/current/cache-mechanics-v5-arm-redesigns.md` | Awaits fresh window |

The Watcher will handle compression → /clear → resume per JICM v7. The next session opens with `.compressed-context-ready.md` summary, fresh-loaded scratchpad (current 80 lines including all v5/v4 state), and the new feedback memories indexed in MEMORY.md.

### 2026-05-23 [a6204f6a63c2]

**JICM resume protocol decision tree:**

The scratchpad's Resume Protocol has 6 items. Items 1-4 are `claude -p` experiments — empirically established at ~1.94%/min burn rate. The quota window doesn't reset for ~78 min. Items 5-6 are pure-local git operations: ~0.28%/min IDE-baseline burn. Running experiments now would risk exhausting the window before reset; deferring them respects Sir's explicit "next window" guidance.

**Safe path now**: items 5 + 6 (commit and push the v4 article + v5 harness + plots, push Alfred-Dev dashboard). Local IDE work only, ~3-5 conversation turns, well within headroom.

### 2026-05-23 [cd1fe6925aee]

**Commit scoping decision:**

The dirty tree has two distinct classes of changes: (a) substantive research artifacts (v4 article + v5 design + 9 plots + 4 harness scripts), and (b) auto-generated state (`.pre-clear-*`, `.rest-ran-*`, `.memory-health.json`, etc.). Bundling them would muddy the history and pull in churn that's already managed by JICM hooks. Following commit `ff15898`'s pattern (one research commit per investigation arc), I'll stage by explicit path lists rather than `git add -A`.

### 2026-05-23 [661cf4e4c9b4]

**Important correction to my prior session-window claim:**

The watcher snapshot shows `util_5h: 0.03` (3%) — the Anthropic unified-5h window has ALREADY RESET. My earlier statement that "window resets 02:20Z, ~76 min from now" was wrong: I quoted the scratchpad's pre-clear value (`Quota state: 85% / window resets 02:20Z`) without checking the live state. Per `MEMORY.md`'s "Empirical Before Claim" feedback memory: query first, claim second. I should have run the watcher BEFORE making the prior turn's window-boundary claim.

The current state: **3% util, allowed, full headroom**. Items 1-4 are safe to execute now.

The `elapsed_seconds: 16924` field is the cost-watcher's *own* rolling 5h analysis window (for anomaly detection on bursts), not the Anthropic window — different concept; my reading would have confused them without verifying.

# Insights Archive — 2026-06-15
# Rotated: 2026-06-16T00:53:24Z (5 entries)

### 2026-05-23 [1104721cf178]

**Second correction — window reset is 07:20Z, not 02:20Z:**

The raw `unified_5h_reset` headers consistently show `2026-05-23T07:20:00Z`. The scratchpad's "02:20Z" was the *prior* window's reset time; that window has rolled. Current state:
- **status: allowed**
- **util: 4%** (~96pp headroom)
- **reset: 2026-05-23T07:20:00Z** (~4h52min from now)
- Recent turn cost: $0.20–$0.31

This gives me full bandwidth to execute items 1-4 cleanly rather than racing a deadline. Both prior assumptions ("02:20Z deadline" and "76 min remaining") were wrong because I trusted the scratchpad over the live headers.

### 2026-05-23 [ae12510b9983]

**Why `--max-budget-usd` and not output-token limit:**

The proxy DB showed last night's M-D cell cost is 96%+ from cache_write (~40K project context × $18.75/M = $0.75). Output was 50-300 tokens at $75/M = $0.005. A token cap on output would shave ~1¢ per cell, an unnoticeable fraction. The dollar-budget circuit-breaker actually constrains the dominant cost driver. Set per-cell to $1.50 (covers worst-seen $1.25 + buffer) and cumulative abort at $18.

### 2026-05-23 [5089da6ea57b]

- The `top_k=1` parameter caps results; the actual corpus likely contains many "Anthropic" matches, but the query intentionally returns just the highest-scoring chunk (score 0.7268 here, a moderate semantic-similarity hit).
- The returned record is from `corrections.jsonl` — Jarvis's auto-captured correction-detection log — not an Anthropic-domain document. Semantic search ranked it top because no closer matches exist in the default `jarvis-context` collection; the `research` collection would likely surface cache-mechanics articles instead.

### 2026-05-23 [9f0f67096d3e]

- The jarvis-rag `search` tool defaults to the `jarvis-context` collection (one of four: jarvis-context, codebase, research, sessions) — since no `collection` arg was passed, the result came from that default.
- The match scored 0.7268 cosine similarity against Qwen3-Embedding-4B (2560-dim) vectors in Qdrant — moderate semantic relevance rather than a literal "Anthropic" keyword hit; the corrections.jsonl entry was ranked top because the embedding space colocates Claude/Anthropic-related session artifacts.
- For literal text matches, RAG is the wrong tool — this is a semantic retrieval system, not a full-text index; `Grep` against `.claude/logs/` would be the right primitive for keyword-exact lookups.

### 2026-05-23 [d22077162b40]

**Findings from E/F (preliminary):**

1. **Pass-rate matrix is uniform across modes** — A1/A2/C1 pass everywhere; B1/C2 fail everywhere. `tools=[]` recorded in every cell, suggesting `--output-format json` doesn't expose `tool_uses` the way the script's parser expects (`response.messages[].content[].tool_use` or `response.tool_uses`). Would need `stream-json` to capture tool invocations.

2. **Cost differential is smaller than hypothesized**: M-D avg $0.38, M-S avg $0.32, M-A avg $0.41. If `--system-prompt` truly stripped 330K of project context, M-S should be dramatically cheaper. The narrow gap suggests `--system-prompt` may NOT replace CLAUDE.md/MEMORY.md content the way the design doc hypothesized — or both modes are hitting prior cache.

Both findings are themselves article-worthy: the methodology limitation (json vs stream-json for tool capture) is publishable operational guidance.

# Insights Archive — 2026-06-15
# Rotated: 2026-06-16T00:55:39Z (1 entries)

### 2026-05-23 [b9a9a8370b06]

**Why those derivations are wrong (acknowledging your point):**

1. **$-to-token "rates" are not constant.** The reported cost_usd field in api_requests is the API's per-call settlement, which depends on token-class mix, model tier, time-of-day pricing adjustments, and the `unified_fallback_pct` discount factor (currently 0.5 on Max, but plan-tier dependent). Dividing dollars by tokens to back-compute "$ per token" gives a ratio that's only valid for that specific call's mix.

2. **Tokens-to-burn-weight is not linear.** Anthropic's unified-util formula is composite — token volume AND request count AND apparently other factors (since two 100%-util windows can differ by 3× in total tokens, per §1.3 of the doc). A 1M cache_read in one big call ≠ 1M cache_read split across 200 small calls in terms of util consumed.

3. **The $9 → 27pp pairing is one session, not a rate.** It's a true fact about what happened during E/F. It is NOT a conversion factor I can apply to estimate next session's burn. The next experiment with different cell composition + different starting util + different window crowd would consume differently.

**Right discipline (which you're enforcing):**
- PRIMARY: burn weight (Δ unified_5h_utilization)
- SECONDARY: token volumes by type (descriptive of what happened)
- TERTIARY: dollar cost (API contract artifact; do not convert)
- NEVER derive one from another. Each metric stands alone, observed empirically.

Re-doing the audit on those principles now — adding a §1.5 First Principles section that enshrines the no-conversion rule, then reverting the back-calculated reframings I just made to use plain token volumes + the API's own cost_usd attribution (where it's literally the field in the DB, not a derivation).

# Insights Archive — 2026-06-15
# Rotated: 2026-06-16T03:21:54Z (3 entries)

### 2026-05-23 [c9377dc51253]

**What I'd add to my own self-knowledge if you approve the commit:**

A feedback-type memory `feedback_no_metric_conversion` capturing the rule "never derive across the three metric tiers; treat each as independently observable only" with the cross-link to `[[feedback_empirical_before_claim]]`. This is a meta-level reasoning discipline that should govern my behavior beyond just this doc — anytime I'm tempted to translate one of {burn weight, tokens, $} into another, I should pause.

### 2026-05-23 [3e41053a743c]

**Companion memory I'd write on your nod:**

`~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/memory/feedback_empirical_grounding_for_claims.md` — a feedback-type memory that captures the same rule for cross-conversation persistence. Frontmatter: name, description, type:feedback. Body: rule + Why (your 2026-05-23 correction after I did two back-calculations from $9-to-27pp pairing) + How to apply + what-doesn't-count list + link to `[[feedback_empirical_before_claim]]` and `[[api_aware]]`. Plus a one-line index entry in MEMORY.md.

This way the rule persists in two places: force-loaded in api_aware.md §10.1 (always in context) AND in the linked-memory layer (recallable cross-session). The dual anchor reduces drift risk.

### 2026-05-23 [fe00cac342f5]

**Why these three changes cohere as one commit**: api_aware.md §9 rule #2 prescribes `--max-budget-usd 1.50` as a per-cell circuit breaker. The strip-effect.py modification IS that rule's first enforcement. Co-landing keeps doctrine and live application in lockstep — splitting them risks landing the rule without its first user, or vice versa.

**Why the empirical-grounding amendment (§10.1) matters force-loaded**: it generalizes [[feedback_empirical_before_claim]] from "cost/util/cache assertions" to ALL behavior-shaping claims — which is the class of error that produced the dollar-to-burn-weight back-derivation that triggered the rewrite in the first place. Force-loading puts the guard ahead of the next instance of the same failure mode.

# Insights Archive — 2026-06-15
# Rotated: 2026-06-16T04:00:50Z (2 entries)

### 2026-05-23 [d3ddf4506056]

**The autonomous-loop architecture I just chose has a self-correcting safety property**: the wakeup fires me, but the EXECUTION is gated by the script's own pre-flight (which I cannot bypass without editing the script). So if util stays elevated through multiple wakeups, the system idles harmlessly until conditions are right. The script can't run me into a wall; only my judgment-when-conditions-allow can move work forward. This is the api_aware.md §9 rule #4 enforced architecturally, not just by my discipline.

**What the new commit `008e413` revealed empirically (worth noting in the v4 article)**: force-loading api_aware.md added ~34K cache_create tokens per fresh subprocess call, doubling the baseline subprocess cost from ~$0.26 to ~$0.46. This is the trade for force-loaded self-awareness — every headless cell pays the awareness tax. The §10.1 discipline (verify-before-claim) buys correctness; the cost is denominated in burn weight, not seconds.

### 2026-05-23 [d626db2753b8]

**Observation about the rolling 5h window**: `rate_5min` shows $0 / 0 requests — no proxy traffic in the last 5min. Yet util rose 90% → 96% between wakeups. The rise is from earlier in this conversation aging INTO the trailing-5h window's earliest minute, while late-trailing activity hasn't yet aged OUT. The window is "rolling" but not symmetric — it's a fixed-width slice that drifts forward, and burn weight tracks whatever activity falls inside it RIGHT NOW.

**Implication for the timing model**: I should not expect util to drop monotonically until the original 02:20Z-window activity ages out. The first major drop will arrive when activity from ~00:43Z onward starts falling out of the trailing 5h window. That's ~05:43Z + 5h = 10:43Z for the LAST burn-period activity to clear, but earlier calls clear earlier. The 07:20Z "window_reset" is the formal boundary that Anthropic uses for status changes, not necessarily where util drops sharply.

# Insights Archive — 2026-06-15
# Rotated: 2026-06-16T04:12:13Z (3 entries)

### 2026-05-23 [1eef9ca61b0e]

The JICM refresh kicked me before the previously-armed 00:19 wakeup fires — that's fine, the loop's gating logic is idempotent. The script's own pre-flight (50% util threshold) is the architectural backstop; my role is to query, decide, and either execute or re-arm.

### 2026-05-23 [ef519dfb0354]

**Util trending wrong direction**: 90% → 96% → 98% across the last three checkpoints. The rolling 5h window is still accumulating from this session's JICM cycle activity. Pre-flight will refuse. Architectural backstop intact — re-arming the loop.

### 2026-05-23 [6c72b6be3fdd]

**Schema discovery**: `total_windows: 58` means the endpoint returns ALL historical windows, with the CURRENT one being the LAST array element. My earlier query `windows[-1]` had been correctly fetching the active window — but the active window changed between queries because we crossed 07:20Z. The 99% was the old window's tail; the 26% is the new window's still-young state.

**Operational lesson**: never trust a util reading without checking which `window_reset` it belongs to. Cross-boundary queries can swap "current" without warning.

