# Token-Compression Run Report — `<intervention_id>` — `<YYYY-MM-DD>`

<!--
TEMPLATE — Companion to projects/project-aion/reports/token-compression-experimental-design.md §14.1.

USAGE:
  1. Copy this file to:
       .claude/metrics/token-compression/<intervention_id>-result-<YYYY-MM-DD>.md
  2. Replace every `<placeholder>` with run-specific content.
  3. Cite the pre-registration verbatim — do NOT paraphrase or summarize.
  4. After analysis, update the linked pre-registration yaml with the outcome.
  5. Commit the report alongside any decision (promote, rerun, rollback).

Sections marked OPTIONAL may be deleted if N/A for this run.
-->

**Intervention**: `<intervention_id>`
**Deploy commit**: `<commit_hash>` on `<repo>`
**Deploy timestamp**: `<YYYY-MM-DDTHH:MM:SSZ>`
**Run date**: `<YYYY-MM-DD>`
**Pre-registration**: `.claude/metrics/token-compression/pre-registration-<intervention_id>.yaml`

---

## §1 TL;DR

**Verdict**: `<FULL_PASS | PROVISIONAL_PASS | FAIL | INCOMPLETE | CACHE_REGRESSION | REGISTER_REGRESSION | ROLLED_BACK>`

**Headline result** (one sentence): `<e.g., "Per-class brevity reductions met or exceeded predictions on all five non-N/A classes; cache stability and register tests passed; promote to Phase 2.">`

**Decision**: `<one of: promote to next phase | rerun with larger sample | rollback | revise directive>`

| §3.3-style headline | Threshold | Observed | Verdict |
|---|---|---|---|
| Cache hit rate Δpp | within ±5pp | `<observed>` | `<PASS / FAIL>` |
| Register violations / 100 blocks | ≤ tolerance | `<observed>` | `<PASS / FAIL>` |
| Per-class brevity (count of classes PASS / total non-N/A) | all PASS | `<n / total>` | `<PASS / MIXED / FAIL>` |

---

## §2 Pre-Registration (verbatim)

<!--
Cite the YAML pre-registration file VERBATIM here. No paraphrasing.
This section makes the prediction immutable in the run report itself,
guarding against hindsight calibration.
-->

```yaml
<paste contents of pre-registration-<intervention_id>.yaml>
```

---

## §3 Sample Composition

### Pre-deploy bucket

| Class | Turns | Sessions | Date range |
|---|---|---|---|
| `tool_only` | `<n>` | `<s>` | `<YYYY-MM-DD → YYYY-MM-DD>` |
| `brief` | `<n>` | `<s>` | `<...>` |
| `interactive` | `<n>` | `<s>` | `<...>` |
| `analysis` | `<n>` | `<s>` | `<...>` |
| `code_dump` | `<n>` | `<s>` | `<...>` |
| `structured` | `<n>` | `<s>` | `<...>` |
| **Total** | `<N>` | `<S>` | |

Source: `<path to baseline csv or full-corpus reference>`.

### Post-deploy bucket

| Class | Turns | Sessions | Atypical sessions excluded |
|---|---|---|---|
| `tool_only` | `<n>` | `<s>` | `<list of session_ids tagged atypical_<class>>` |
| `brief` | `<n>` | `<s>` | `<...>` |
| `interactive` | `<n>` | `<s>` | `<...>` |
| `analysis` | `<n>` | `<s>` | `<...>` |
| `code_dump` | `<n>` | `<s>` | `<...>` |
| `structured` | `<n>` | `<s>` | `<...>` |
| **Total ordinary** | `<N>` | `<S>` | |
| **Total atypical** | `<N>` | `<S>` | |

Sample-target check (vs. pre-registration `sample_targets`):
- ordinary_sessions: `<observed>` / `<target>` — `<MET / NOT MET>`
- total_substantive_turns: `<observed>` / `<target>` — `<MET / NOT MET>`
- per-class minimums (§7.2 of design doc): `<list any class below minimum>`

---

## §4 Cache Stability Result

| Metric | Pre-deploy | Post-deploy | Δ | Tolerance | Verdict |
|---|---|---|---|---|---|
| Token-weighted hit rate | `<x.xx%>` | `<x.xx%>` | `<+/-x.xx pp>` | ±5pp | `<PASS / FAIL>` |
| Per-turn mean hit rate | `<x.xx%>` | `<x.xx%>` | `<+/-x.xx pp>` | (informational) | — |
| eph_1h adoption | `<x.xx%>` | `<x.xx%>` | `<+/-x.xx pp>` | per pre-reg | `<PASS / FAIL>` |

**Interpretation** (1-2 sentences): `<e.g., "Cache prefix invalidated as predicted; recovery to within tolerance by turn ~3 of post-deploy sessions. eph_1h adoption rose to 100% in line with the 1h-TTL deployment.">`

---

## §5 Per-Class Brevity Result

For each class with sufficient samples per §7.2:

| Class | n_pre | n_post | median_pre | median_post | Δ% | tolerance | p (Mann-Whitney) | Cliff's δ | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `tool_only` | `<n>` | `<n>` | `<m>` | `<m>` | `<+/-x%>` | `<±x%>` | `<p>` | `<δ>` | `<PASS / PASS-WEAK / MIXED / FAIL / PARTIAL>` |
| `brief` | `<n>` | `<n>` | `<m>` | `<m>` | `<+/-x%>` | `<±x%>` | `<p>` | `<δ>` | `<...>` |
| `interactive` | `<n>` | `<n>` | `<m>` | `<m>` | `<+/-x%>` | `<±x%>` | `<p>` | `<δ>` | `<...>` |
| `analysis` | `<n>` | `<n>` | `<m>` | `<m>` | `<+/-x%>` | `<±x%>` | `<p>` | `<δ>` | `<...>` |
| `code_dump` | `<n>` | `<n>` | `<m>` | `<m>` | `<+/-x%>` | `<±x%>` | `<p>` | `<δ>` | `<...>` |
| `structured` | `<n>` | `<n>` | `<m>` | `<m>` | `<+/-x%>` | `<±x%>` | `<p>` | `<δ>` | `<...>` |

Statistical note:
- α = 0.05, Bonferroni-corrected for 6 classes → effective α = 0.0083
- Cliff's δ interpretation: −1 = post fully below pre; 0 = same; +1 = post fully above pre
- Distributions compared with non-parametric Mann-Whitney U; medians and IQRs reported because output_tokens distributions are heavy-tailed and non-normal

Per-class commentary (one short paragraph per non-trivial result):
- `<class>`: `<observation, especially if effect direction or magnitude differs from prediction>`

---

## §6 Register Result

| Pattern group | Hits | Blocks scanned | Rate per 100 | Tolerance | Verdict |
|---|---|---|---|---|---|
| `ai_assistant_patois` | `<n>` | `<N>` | `<x.xx>` | per pre-reg | `<PASS / FAIL>` |
| `trailing_offers` | `<n>` | `<N>` | `<x.xx>` | per pre-reg | `<PASS / FAIL>` |
| `excessive_hedging` | `<n>` | `<N>` | `<x.xx>` | per pre-reg | `<PASS / FAIL>` |
| **Total banned** | `<n>` | `<N>` | `<x.xx>` | per pre-reg | `<PASS / FAIL>` |

Positive signal (informational, does not affect pass/fail):

| Pattern group | Hits | Rate per 100 |
|---|---|---|
| `butler_register` | `<n>` | `<x.xx>` |

If any violations: list 5 representative hits with surrounding context.

---

## §7 Decision Matrix Application

Apply §10.2 of design doc.

| Axis | Verdict |
|---|---|
| All classes PASS or N/A? | `<yes / no — <which classes failed>>` |
| Cache stability PASS? | `<yes / no>` |
| Register PASS? | `<yes / no>` |
| Sample sufficient? | `<yes / no>` |

**Overall**: `<verdict from §10.2 matrix>`

---

## §8 Decision and Next Action

**Decision**: `<concrete next step>`
- For FULL_PASS: identify the gated next phase (per pre-reg `gate_to_next_phase`); update active-plan; open work on that phase.
- For PROVISIONAL_PASS: schedule rerun via launchd reminder for sample top-up.
- For FAIL / REGRESSION: rollback per design doc §11 OR revise directive and re-deploy as new `intervention_id`.
- For INCOMPLETE: do NOT promote; reschedule sample-collection reminder.

**Files to update**:
- `.claude/metrics/token-compression/pre-registration-<intervention_id>.yaml` → set `outcome.status`, `outcome.result_report`, `outcome.closed_at`, `outcome.reason`
- `.claude/context/.active-plan` → reflect new phase state

**Commits to make**:
1. This report file
2. Updated pre-registration yaml
3. Active-plan update (gitignored, but logged here for completeness)
4. Any rollback or directive-revision commit (separate, with own commit message)

---

## §9 Methodological Notes (OPTIONAL)

If this run revealed an issue with the experimental-design protocol itself
(boundary recalibration needed, new intent class warranted, statistical
test inappropriate), document it here and propose an update to the design
doc §14 changelog.

---

## §10 Files Referenced

- Telemetry CSV: `<path>`
- Pre-registration: `<path>`
- Baseline reference: `<path>`
- Session JSONLs: `<path or pattern>`
- Design doc: `projects/project-aion/reports/token-compression-experimental-design.md`

---

*Run Report v1 template — generated from token-compression-experimental-design.md §14.1.*
