# Cache-Mechanics Study v5 — Arm Redesign Proposals

**Author**: Jarvis
**Date**: 2026-05-22
**Status**: DRAFT — pending Sir approval before execution
**Predecessor**: `projects/project-aion/reports/claude-code-cache-mechanics-2026-05-22.md` (v4)

---

## Why redesign

Post-v4 critical review surfaced three arms with limited explanatory
power:

- **Arm G** (TTL) — single probe at 65 min only resolves the
  boundary as binary above/below. Doesn't characterize the decay curve.
- **Arms E and F** (tool-use under stripped vs default system prompt) —
  test only Bash + Read on a single MCP-free harness. Doesn't probe the
  actual question: *what exactly does `--system-prompt` strip?* And
  doesn't test interaction with `--resume`, MCPs, Plugins, Skills.
- **Arm H** (output-format effect on context echo) — synthetic
  1-word probe rather than realistic context-preservation stress.
  Doesn't test whether context is genuinely preserved across the
  range of topologies; only how much the format suppresses echo.

The v5 redesigns address each, reusing the v4 harness infrastructure
where possible and budgeting against the 5h Max-plan window.

---

## Combined budget summary

| Arm | Cells | Estimated %Usage | Estimated $ |
|---|---:|---:|---:|
| G v5 (multi-probe TTL) | 6 | ~3% | ~$1 |
| E/F v5 (strip-effect matrix) | 24 | ~15-20% | ~$5-7 |
| H v5 (context preservation × topology) | 31 (2 repeats: 62) | ~25-30% | ~$9-12 |
| **Combined** | **~92** | **~45-55%** | **~$15-20** |

Each arm is independently runnable, so we can stage execution across
multiple 5h windows if 45-55% in a single window is too aggressive.
Default plan: run all three within one window in a single ~12-15 min
session, similar to v4's pacing.

---

## Arm G v5 — TTL boundary characterization

### Research question

What is the actual decay shape of Anthropic's prompt cache TTL? The
1-hour tier was confirmed expired at 65 min in v4; we want to know
where exactly the boundary lies and whether decay is sharp or
gradual.

### Design

Single prime at T=0, then five probes at scheduled intervals using
`--resume <prime_sid> --fork-session` so each probe READS the prime's
cache without committing back (avoids TTL-reset confounds).

```
T=0:     prime call          (cache_creation ~54K, $0.34)
T+1:     probe 1             (--fork-session)
T+5:     probe 2             (--fork-session)
T+25:    probe 3             (--fork-session)
T+55:    probe 4             (--fork-session)
T+65:    probe 5             (--fork-session, expected miss per v4)
```

Each probe sends the exact prime prompt; we record:
- `cache_creation_input_tokens` (should be ~0 if hit, ~54K if miss)
- `cache_read_input_tokens` (should be ~54K if hit, 0 if miss)
- `unified_5h_utilization` snapshot before each probe
- elapsed seconds since prime

### Hypothesis

- T+1, T+5, T+25, T+55: cache hit (all within 60 min)
- T+65: cache miss (past boundary per v4)
- Boundary lies between 55 and 65 min; this design narrows the
  resolution to a 10-min window.

### Implementation

Add subcommand `ttl-probe-series` to `cache-mechanics-v4.py`. Reuses
the existing `ttl-prime` infrastructure. Probes are individual
background sleeps + `claude -p --resume <sid> --fork-session`.

Output: `G_ttl/probe-series.json` with one record per probe.

### Decision criteria

- If all 5 probes hit: TTL > 65 min; design fails to find boundary;
  extend probe schedule to T+85, T+95.
- If T+65 misses but T+55 hits: confirms boundary in the 55-65 min
  window (matches v4); update §4.3 with refined claim.
- If earlier probes miss: TTL shorter than 1 hour; design likely
  needs prime that targets the 1-hour tier specifically
  (cache_creation_1h field nonzero).

---

## Arms E/F v5 — System-prompt strip-effect matrix

### Research questions

1. **What exactly gets stripped under `--system-prompt`?** Hypothesis:
   it replaces the entire Claude Code system prompt — losing project
   CLAUDE.md, MEMORY.md, identity, capability-map, force-loaded
   context. Default-mode F retains all of it.
2. **What does `--append-system-prompt` retain vs add?** Hypothesis:
   appends to the default — keeps everything Default has plus the
   appended text.
3. **Under each strip mode, what capabilities remain accessible**?
   - Native Claude Code tools (Bash, Read, Edit, Write, Grep, Glob)
   - Project-configured MCPs (jarvis-rag, jarvis-graphiti, jarvis-pulse)
   - Skills (knowledge-ops, git-ops, etc.)
   - Plugins (whichever are installed)
   - Self-knowledge (CLAUDE.md content, identity, capability-map)
4. **How does each strip mode interact with `--resume`?** Does
   inheritance carry over the stripped context, or re-establish
   per-call?

### Strip modes tested

| Mode | Flag | Hypothesized effect |
|---|---|---|
| M-D | (no flag) | Full CC default: 33K boilerplate + CLAUDE.md + identity + skills + MCPs |
| M-S | `--system-prompt "<minimal>"` | Replaces default entirely; only the minimal text remains |
| M-A | `--append-system-prompt "<addendum>"` | Default + addendum |

### Topology axis

| Topology | Description |
|---|---|
| T-N | Fresh UUID per call (no inheritance) |
| T-R | `--resume` chain (3 successive turns on one session) |

### Probe categories (3 probes each)

**A. Self-knowledge probes** (test what context loaded):
- `A1`: "Reply in one sentence: what is your role per `psyche/jarvis-identity.md`?"
  - PASS if response mentions "Jarvis" or "Master Archon" or "Project Aion"
- `A2`: "Per CLAUDE.md, what is the canonical task system for this project? Reply with the API base URL."
  - PASS if response contains `localhost:8700` or "Pulse"
- `A3`: "Per `psyche/capability-map.yaml`, name three skill IDs. Reply comma-separated."
  - PASS if response contains 3 distinct `skill.*` IDs from the file

**B. Native-tool probes** (test tool availability and invocation):
- `B1`: "Use Bash to print today's date in ISO 8601 format."
  - PASS if response.tool_uses contains a `Bash` use AND the output contains a date string
- `B2`: "Use Read to fetch the first 5 lines of `/etc/hosts`."
  - PASS if response.tool_uses contains a `Read` use AND output references hosts content
- `B3`: "Use Grep to find lines containing 'localhost' in `/etc/hosts`."
  - PASS if response.tool_uses contains a `Grep` use

**C. MCP probes** (test if MCPs propagate through subprocess `claude -p`):
- `C1`: "List the names of MCP servers you have available. Reply comma-separated."
  - PASS if response contains at least one of `jarvis-rag`, `jarvis-graphiti`, `jarvis-pulse`
- `C2`: "Use the `jarvis-rag` MCP to search for any record about 'Anthropic'. Return the first result's source field."
  - PASS if response.tool_uses contains an `mcp__jarvis-rag__*` use
- `C3`: "Use the `jarvis-pulse` MCP to list current tasks with status=pending. Reply with task count."
  - PASS if response.tool_uses contains an `mcp__jarvis-pulse__*` use

### Matrix

| Cell | Mode | Topology | Probe | Expected (per hypothesis) |
|---|---|---|---|---|
| 1 | M-D | T-N | A1 | PASS (identity loaded) |
| 2 | M-D | T-N | A2 | PASS (CLAUDE.md loaded) |
| 3 | M-D | T-N | A3 | PASS (capability-map loaded) |
| 4 | M-D | T-N | B1 | PASS (tools always available) |
| 5 | M-D | T-N | B2 | PASS |
| 6 | M-D | T-N | B3 | PASS |
| 7 | M-D | T-N | C1 | PASS (MCPs configured) |
| 8 | M-D | T-N | C2 | PASS or FAIL (key MCP question) |
| 9 | M-D | T-N | C3 | PASS or FAIL |
| 10-18 | M-S | T-N | same 9 | A1-A3 expected FAIL; B1-B3 PASS; C1-C3 likely FAIL |
| 19-27 | M-A | T-N | same 9 | All expected PASS (default + addendum) |

For T-R (3 cells per topology run, sequential): add a smaller subset
(just C1-C3, where MCP retention across resume is the live question) =
3 modes × 3 cells = 9 cells.

**Total cells**: 27 (T-N matrix) + 9 (T-R MCP subset) = **36 cells**.

Wait — to keep budget tight, I can also trim the T-N matrix to just
the high-information probes (A1/A2 + B1 + C1/C2) under each mode:
3 modes × 5 probes = 15 cells + T-R subset 9 = **24 cells**.

### Budget

24 cells × ~$0.18 avg = ~$4.30
%Usage: ~15-20% (cache-light probes are cheaper than v4 cache-heavy ones)

### Implementation

New script `cache-mechanics-v5-strip-effect.py`. Each probe is a
single `claude -p` call with conditional flags. Pass/fail evaluation
is regex-based on `response` field + tool_uses list inspection.

Output: `strip-effect-results.json` with per-cell {mode, topology,
probe, response, tool_uses, pass}.

### Decision criteria

- If M-S loses C1-C3 (MCPs gone): confirms hypothesis 3 — stripped
  mode loses MCP access. Major finding.
- If M-A retains all M-D capabilities + addendum: confirms hypothesis 2.
- If M-D's C2/C3 themselves fail: indicates `claude -p` subprocess
  doesn't propagate parent MCPs at all — even more significant finding,
  worth promoting to its own short article section.

---

## Arm H v5 — Context preservation across topologies

### Research questions

1. **Baseline X**: With no input/output file-passing and no session
   inheritance, do successive `claude -p` calls share ANY context via
   hidden state? (Null hypothesis: no.)
2. **Baseline Y**: With file-passing (parent's output text embedded in
   child's prompt), how well does the child grasp the operational
   context?
3. **Across topologies** (--resume, --fork-session, extend-then-fork),
   how well is operational context preserved as measured by realistic
   stress questions?

### Test framework: operational scenario stress test

Parent generates a **realistic operational scenario** containing:
- 5-10 named entities (people, locations, items)
- 2-3 numeric constraints (counts, dates, quantities)
- 1 relational structure (hierarchy, dependency, ordering)
- 1 implicit conflict or trade-off

Example scenario template (instantiated with distinct content per repeat):

```
"You are managing operations at a research outpost. Staff: Liang
(commander), Park (engineer), Reyes (medic), Cho (logistics), and
Volk (security). Inventory: 30 days of food, 12 days of water,
backup generator with 48hr fuel. Active situations: Park is
diagnosing a coolant leak in the generator; Reyes flagged Cho with
mild altitude sickness yesterday; a supply drop is scheduled for
day 14 but weather forecast indicates a storm starting day 10
lasting 4-5 days."
```

### Stress questions (asked of each child)

| ID | Question | PASS criteria |
|---|---|---|
| Q1 | "Who is the medic? Reply with just the name." | name == "Reyes" |
| Q2 | "How many days of water remain?" | response contains "12" |
| Q3 | "List the 5 staff in the order they were introduced. Comma-separated." | order matches "Liang, Park, Reyes, Cho, Volk" |
| Q4 | "If the storm delays the supply drop to day 17, will food run out before resupply? Reply yes/no with the day food runs out." | response contains "no" AND "day 30" OR equivalent reasoning |
| Q5 | "Identify the most operationally urgent issue and propose one action. Reply in 2 sentences." | response references generator OR Cho's altitude sickness; proposes specific action |

### Topology matrix

| Topology | Description | Parent cells | Child cells per Q | Total per topology |
|---|---|---:|---:|---:|
| X | No file-pass, no session (children get NOTHING about scenario) | 1 (output discarded) | 1 | 1 + 5 = 6 |
| Y | Parent's output embedded as text in child's prompt | 1 (output saved) | 1 | 1 + 5 = 6 |
| R | `--resume` linear (child cells in same session as parent) | 1 (becomes root) | 1 | 1 + 5 = 6 |
| F | `--fork-session` from bare parent | 1 | 1 | 1 + 5 = 6 |
| D | Extend-then-fork: parent + 1 extension, children fork from extension | 2 | 1 | 2 + 5 = 7 |

**Cells per repeat**: 6 + 6 + 6 + 6 + 7 = **31 cells**
**With 2 repeats**: **62 cells**

### Expected results (priors)

- **X**: Q1-Q5 should ALL fail. Child has zero context. If any pass,
  it's a major finding about hidden context-sharing.
- **Y**: All 5 should pass — parent's text is fully in child's prompt.
- **R**: All 5 should pass — full session history available.
- **F**: All 5 should pass — fork inherits parent's state at fork time.
- **D**: All 5 should pass — extension committed full context to cache.

If R or F fail any probes, that's an interesting finding about session
inheritance limits.

### Budget

62 cells × ~$0.15 avg = ~$9.30 (most cells are cache-hit with small output)
%Usage: ~25-30%

### Implementation

New script `cache-mechanics-v5-context-preservation.py`. Per topology:
spawn parent with scenario template + repeat-id, capture session_id and
output. Spawn each child cell with the appropriate flags and the
question text. Score pass/fail with regex per question.

Output: `context-preservation-results.json` with full per-cell records
+ aggregate pass-rate matrix.

### Decision criteria

- If X scores >0/5: investigate hidden state mechanism (major finding).
- If Y, R, F, D all score 5/5: confirms context preservation is robust
  across all topologies; the article can drop §4.5's lingering "did
  the model lose context?" framing entirely.
- If specific topologies show partial degradation: characterize which
  question types fail under which topology — informs operational
  guidance about when each topology is safe.

---

## Execution order (if approved)

1. Arm G v5 (smallest, ~3% util) — runs first, freshens cache mechanics
   confidence.
2. Arm E/F v5 (~15-20% util) — runs second, establishes strip-effect
   model; MCP finding is high-information-density.
3. Arm H v5 (~25-30% util) — runs third, requires the most stress per
   probe; can be split into a separate window if combined budget hits
   ceiling.

Total ~45-55% of a 5h window for all three. Article rewrite (with new
findings integrated) follows the experimental data.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Budget overshoot during execution | Real-time monitoring of `unified_5h_utilization` per the v4 §5.4 finding; pause at `allowed_warning` threshold (~96%) |
| MCP probe complexity (need MCPs configured for subprocess) | Verify by hitting a current `claude -p` MCP call first; if subprocess never sees MCPs, that IS the finding |
| H baseline X reveals hidden context (unexpected): | Document as primary finding, expand into separate investigation |
| Strip-effect M-A behavior under-tested | Add fallback probes if M-A behavior is unclear after first batch |
| TTL probe boundary outside 55-65 min | Extend probe schedule (one more retry budget) — already minimal cost |
