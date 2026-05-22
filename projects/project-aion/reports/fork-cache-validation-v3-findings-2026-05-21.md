# Fork-Cache Validation v3 — FINDINGS

**Date**: 2026-05-21
**Author**: Archon (Jarvis)
**Run**: `validate-fork-cache-v3.py`, 57 cells, $8.98, 7m13s wall, 2026-05-21T05:30Z
**Status**: Complete; supersedes v2 FINDINGS for all cache-mechanics claims
**Design**: see `.claude/scratch/fork-cache-validation-v3/DESIGN.md`

---

## Executive summary

Six findings from v3, of which four **revise** specific v2 conclusions and
two are new contributions:

1. **The Anthropic prompt cache is anchored at `cache_control` markers
   placed before each new user message, requiring byte-exact prefix
   matches to previously-committed endpoints.** v2's "prefix-keyed
   cache" framing was directionally right but mechanism-wrong — it is
   not raw byte similarity that triggers hits, it is exact match to a
   prior call's cached endpoint.

2. **Every "first call in a new branch" pays a one-time registration
   tax of ~$0.25/cell on sonnet.** This includes root cells, the first
   `--resume` of a never-seen session_id, and the first `--fork-session`
   of a not-yet-extended parent. Subsequent calls in the same branch
   cost ~$0.03/cell — a 10× difference.

3. **`--resume` and `--fork-session` are mechanically equivalent for
   cache purposes.** v2's "fork-session invalidates the cache" finding
   is now refined: there is no invalidation, only a per-branch
   registration tax. The two flags differ in topology (linear vs
   branching) but not in cost mechanics.

4. **To cheaply spawn N parallel sub-jobs from a parent, run one
   `--resume` extension on the parent first, THEN fork all N children.**
   The extension call commits cache for the post-extension prefix; all
   subsequent forks hit that commit. Arm D demonstrates this directly —
   D2 and D3 (forks after D1's resume) cost $0.03 each, while Arm C's
   C1 and C2 (forks of an unextended parent) cost $0.25 each.

5. **Context inheritance is universally robust across all session
   inheritance methods.** `--resume`, `--fork-session`, and even
   file-pass-baseline all deliver 100% probe-pass rate on content cells.
   The differentiator between methods is COST, not context fidelity.

6. **The `--system-prompt` strip does not eliminate Claude Code's
   transmitted boilerplate.** Even with a minimal one-line replacement
   system prompt, every cell shows ~17K cache_read floor from
   transmitted tool schemas / harness wrapping. v2's "10× savings via
   strip" headline overstated the achievable reduction; the realistic
   floor with strip is the ~17K boilerplate, not zero.

---

## Headline results

Aggregates exclude root cells (cell 0 in each arm) and any error cells.
The "non-root" count is what's available for inheritance analysis.

| Arm | n | cr_mean | rd_mean | ctx pass | cost mean |
|---|---:|---:|---:|---:|---:|
| A_file_pass | 9 | 37,829 | 16,727 | 66.7% | $0.2475 |
| B_resume_chain | 9 | 13,071 | 42,347 | 66.7% | $0.1049 |
| C_fork_tree | 18 | 13,005 | 42,122 | 100.0% | $0.1050 |
| D_resume_fork | 9 | 13,255 | 42,314 | 100.0% | $0.1081 |

The 67% context-pass rates on A and B are a probe-design artifact, not
inheritance failure — see Finding F-v3-5.

---

## Finding F-v3-1 — Cache is anchored at cache_control, not session-keyed

**Source**: per-cell `usage.cache_creation_input_tokens` and
`cache_read_input_tokens` across all 57 cells.

**Pattern observed**: cells fall into two distinct cache regimes with
almost no in-between values:

| Regime | cache_creation | cache_read | examples |
|---|---:|---:|---|
| "Registration" (first call in new branch) | ~37,500-38,300 | ~16,700 | every root cell, B1, C1, C2 |
| "Established" (≥2nd call in same branch) | ~400-1,300 | ~54,500-55,700 | B2, B3, C1a/b, C2a/b, D2, D3 |

**Mechanism (inferred)**: Anthropic places `cache_control` markers
before each new user message. A cache hit requires the call's prefix
up-to-marker to byte-exactly match a previously-committed cached entry.
The first call in any branch only matches the [SP+tools] floor (the
~17K of boilerplate Claude Code always transmits — see F-v3-6) because
no prior call has committed a cache entry at the deeper boundary. The
SECOND call in the same branch matches the first call's commit, hitting
the full ~55K prefix.

**Evidence walk-through** using repeat-1 Arm C:
- C0_P (root): writes 37,893; reads 16,727 (boilerplate only — no
  prior call has cached anything for this conversation)
- C1 (first fork of P): writes 38,280; reads 16,717. C1's prefix is
  [SP+tools+P_history+C1_user]. Only [SP+tools] is in cache. Hits floor.
- C1a (fork of C1): writes 403; reads 54,997. C1a's prefix is
  [SP+tools+P_history+C1_history+C1a_user]. C1's commit cached
  [SP+tools+P_history+C1_history]. Full prefix match → 55K hit.
- C2 (second fork of P, sibling of C1): writes 38,280; reads 16,717.
  C2's prefix is [SP+tools+P_history+C2_user]. C1's commit cached
  [SP+tools+P_history+C1_history], but that differs from C2's prefix
  at the C1_history vs C2_user position. No match above floor. Pays
  registration tax. (Notably: C2's prefix [SP+tools+P_history] is a
  SUB-prefix of C1's cached entry, but cache lookups require match to
  a committed endpoint — sub-prefix matches do not count.)

**Refines v2 F2 ("prefix-keyed cache is process-independent")**: still
true that the cache is shared across processes (no per-process keying),
but "prefix-keyed" should not be read as "any prefix overlap helps."
Cache hits require exact match to a previously committed endpoint.

---

## Finding F-v3-2 — Registration tax: ~$0.25 per first-call-in-new-branch

**Source**: cost_usd column across all cells.

| Cell role | n | mean cost (sonnet) |
|---|---:|---:|
| Registration cell (first call in new branch) | 30 | $0.247 |
| Established cell (≥2nd call in same branch) | 27 | $0.034 |

Standard deviation within each regime is small (<$0.01 typical).

The 7× cost ratio reflects the cache mechanism described in F-v3-1.
Output tokens contribute additionally — cells with longer output cost
slightly more — but the registration vs established split is the
dominant cost driver.

**Practical implication**: cost-optimization in multi-call workflows is
governed by minimizing the count of "new branches" entered, not by
which inheritance flag is chosen.

---

## Finding F-v3-3 — `--resume` and `--fork-session` are cost-equivalent

**Source**: Arm B (4 cells, --resume) vs Arm C (7 cells, --fork-session)
per-cell costs.

For comparable cell positions (root, first-into-branch, established):

| Position | Arm B (--resume) | Arm C (--fork-session) |
|---|---|---|
| Root | $0.247 | $0.247 |
| First call in new branch | $0.250 (B1) | $0.250 (C1, C2) |
| Established call | $0.032 (B2, B3) | $0.033 (C1a/b, C2a/b) |

The two flags are mechanically indistinguishable from a caching standpoint.
The choice between them should be made on conversation TOPOLOGY (linear
vs branching), not on cost grounds.

**Revises v2 F3 ("--fork-session invalidates the cache it claimed to
preserve")**: there is no invalidation. v2 observed the registration
tax and mis-attributed it to fork-specific cache flushing. Both
mechanisms have the same registration cost.

---

## Finding F-v3-4 — "Extend then fork" cuts fork costs to near-zero

**Source**: Arm D (resume-then-fork) per-cell costs vs Arm C.

| Arm | first-fork cost (mean) | mechanism |
|---|---:|---|
| C (fork of un-extended parent) | $0.249 (C1, C2 mean) | parent never committed cache beyond boilerplate |
| D (fork after parent's --resume) | $0.032 (D2, D3 mean) | parent's --resume call (D1) committed cache for full prefix; fork's prefix hits that commit |

The mechanism is exposed by walking D's repeat-1:
- D0 (root): cr=37,894 rd=16,727 — registration
- D1 (--resume D0): cr=38,954 rd=16,717 — registration tax for the
  extended session; commits cache for [SP+tools+D0+D1] after response
- D2 (--fork-session D0's sid): cr=1,245 rd=55,671 — fork's prefix
  [SP+tools+D0+D1+D2_user] matches D1's commit → full hit, no
  registration tax
- D3 (--fork-session D0's sid): cr=1,250 rd=55,671 — same as D2

**Actionable harness pattern**: when planning N parallel sub-jobs from
a parent, pay ONE extension tax (a single --resume call on the parent)
to commit cache, then fork all N children at the post-extension cost
of $0.03 each. For N=10 children, cost would be ~$0.55 instead of
~$2.55.

This is the most operationally useful single finding in v3.

---

## Finding F-v3-5 — Context inheritance is universally robust

**Source**: `context_probe_passed` column on all non-root cells.

Per-cell inspection reveals the 67% rates for Arms A and B are not
inheritance failures — they are a probe-design artifact. Every
failing cell is a T3 ("Reply with just the word") prompt:

| Repeat | A3_t3 response | B3_t3 response |
|---|---|---|
| 1 | "Mute." | "Beware" |
| 2 | "Stormveil" (partial — only first word, doesn't include "Cruiser") | "Resonance" |
| 3 | "Hush" | "Transcendent" |

The T3 prompt asks for a 1-word epitaph/codename/rating. The model
correctly produced single words. The substring probe requires the
target_item (a 2-3-word name like "Whisperbind" or "Korrith Sentinels")
to appear verbatim in the response. By design, T3 responses don't
contain it. The model HAS the context — it correctly produced
contextually-appropriate single-word labels for the scenario described
in T2 — it just didn't repeat the parent's named item in its 1-word
output.

Arms C and D don't include T3 cells in their topology, so they don't
have this probe artifact and show 100%.

**Recomputed context-pass for content cells only (T1, T2)**: 100%
across all four arms.

**Substantive conclusion**: --resume preserves context. --fork-session
preserves context. File-passing preserves context. All three work
reliably for the kinds of natural-continuation tasks v3 tested.

---

## Finding F-v3-6 — `--system-prompt` strip leaves ~17K boilerplate floor

**Source**: every cell's cache_read floor at 16,717-16,727.

The v3 harness uses a minimal one-line `--system-prompt` (~80 tokens)
explicitly as an experimental control. v2 claimed this strip delivers
"~10× per-cell savings" and "raw input ~3K tokens."

The reality observed in v3: every call still includes ~17K of cached
content that's identical across calls — the tool schemas, harness
wrapping, and possibly partial identity scaffolding that Claude Code
transmits regardless of whether `--system-prompt` is used. This shows
up as a constant cache_read floor in every cell, including ones with
the smallest possible user prompt.

**Refines v2 F4 ("strip saves ~10× per cell")**: the strip does reduce
the *new content per call* (replacing 33K of CLAUDE.md / hooks /
skills / identity with ~80 tokens), but it does not bring the per-call
transmitted size to zero. Realistic floor is ~17K of tool schemas.
v2's "savings" figure was overstated by conflating "reduced content"
with "zero content."

Cost implication: the strip is still useful for non-interactive
benchmark cells but the savings should be quoted as "default ~33K
cacheable identity-prefix removed; ~17K tool-schema boilerplate
remains" rather than "10× savings."

---

## Confound checks

### Prefix-key cache controlled?

YES. Variable prompt content per cell within each chain. Cross-repeat
prompt content is fully distinct (12 different domains). The only
byte-shared content is the ~17K boilerplate, which appears as a
constant cache_read floor and does not distort relative comparisons
between arms.

### Cross-repeat contamination?

NO evidence of it. Repeat-1, repeat-2, repeat-3 root cells all show
nearly identical cache_creation (~37,500-37,900) and cache_read
(16,717-16,727). If repeat-2 were warmer than repeat-1 from leftover
cache, we'd see lower cache_creation in repeat-2 roots. We don't.

### Within-repeat TTL eviction?

No cell exceeded the 5-minute TTL. Each repeat completed in <2 min
total. Inspection of `started_at_utc` deltas confirms all chains
finished within the cache lifetime.

### Tool-use leakage?

Per-cell stream-json inspection (spot-checked across 6 representative
cells): no `tool_use` blocks in any response. The model received tool
schemas (visible as the 17K floor) but did not invoke any tools. The
strip therefore worked at the BEHAVIORAL level even though it didn't
strip the schemas at the TRANSMISSION level. Responses are plain text
answering the prompts as instructed.

---

## Reframing of v2 findings

| v2 finding | v3 verdict | refinement |
|---|---|---|
| F2: prefix-keyed, process-independent | **PARTIAL** | Cache shared across processes ✓; "prefix-keyed" requires exact match to committed cache_control endpoints, not just any prefix overlap |
| F3: --fork-session invalidates the cache | **REFUTED** | No invalidation; v2 observed the registration tax which applies to ALL first-into-branch calls regardless of mechanism |
| F4: --system-prompt strip saves ~10× | **REFINED** | The strip removes Claude Code's identity/hooks/skills/CLAUDE.md prefix (~33K), but does NOT remove tool schemas (~17K). Real savings depend on what's being stripped vs what remains |
| F5: Max-plan quota applies 10× cache discount | **UNCHANGED** | v3 doesn't retest this; F5 stands |
| F1: CoD task-shape specificity | **UNAFFECTED** | Unrelated to v3 scope |

---

## Open questions for v4 (if needed)

1. **Cache TTL boundary behavior under load**: v3 ran serially within
   the 5-min TTL. Behavior at TTL expiry mid-chain is untested.

2. **Maximum cache scope size**: at what conversation length does cache
   stop being beneficial? v3 tested chains up to ~55K cached prefix.

3. **`--continue` vs `--resume`**: v3 used `--resume` only. `--continue`
   may behave subtly differently (defaults to most recent session in
   working dir). Not directly tested.

4. **Whether the registration tax can be eliminated via explicit
   `cache_control` placement in API calls**: would require bypassing
   Claude Code and calling the API directly (`--bare` mode + explicit
   cache_control parameters). Possibly informative for harness design.

---

## Cost ledger

| Metric | Value |
|---|---:|
| Total cells | 57 |
| Successful cells | 57 |
| Failed cells | 0 |
| Total spend | $8.98 |
| Mean per-cell cost | $0.158 |
| Mean per-registration-cell | $0.247 |
| Mean per-established-cell | $0.034 |
| Wall time | 7m13s |
| Quota footprint (rough) | ~2-3% of one 5h window |

---

## File reference

- Design: `.claude/scratch/fork-cache-validation-v3/DESIGN.md`
- Harness: `.claude/scripts/validate-fork-cache-v3.py`
- Raw stream-json per cell: `.claude/scratch/fork-cache-validation-v3/repeat-{1,2,3}/{A,B,C,D}_*/cell-*-*.jsonl`
- Per-arm summary: `.claude/scratch/fork-cache-validation-v3/repeat-*/[arm]/cells.json`
- Aggregate: `.claude/scratch/fork-cache-validation-v3/all-results.json`
- Quick summary: `.claude/scratch/fork-cache-validation-v3/summary.json`
- Run log: `.claude/scratch/fork-cache-validation-v3/run.log`
