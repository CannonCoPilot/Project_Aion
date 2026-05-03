# JICM Token-Counting & Cache Formulas — Canonical Reference

**Created**: 2026-05-03 (Phase 0.2 refactor)
**Strictness**: MANDATORY — single source of truth for all consumers
**Maintained alongside**: `.claude/hooks/jicm-gate.sh`, `.claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py`

---

## 1. Why this document exists

JICM and the token-compression skill both consume Claude API `usage` objects from JSONL transcripts. Before this refactor, two parsers had independently defined token-counting formulas — close but not identical. To prevent schema drift and ensure the dashboard, statusline, and analysis tools agree on every metric, all formulas are defined HERE and referenced by name from each consumer.

Any change to a formula must be:
1. Updated here first
2. Reflected in `jicm-gate.sh` (bash + jq)
3. Reflected in `cache-telemetry-extractor-v2.py` (Python)
4. Validated cross-consumer (run both against same JSONL turn; outputs must match)

---

## 2. Anthropic API `usage` schema (current, Claude Opus/Sonnet/Haiku 4.x)

A typical assistant message's `message.usage` object:

```json
{
  "input_tokens": 1,
  "cache_creation_input_tokens": 11343,
  "cache_read_input_tokens": 343008,
  "output_tokens": 2850,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 11343
  },
  "service_tier": "standard"
}
```

### Schema invariants (verified empirically as of 2026-05-03)

- `cache_creation_input_tokens` (flat scalar) = sum of `cache_creation.ephemeral_5m_input_tokens + cache_creation.ephemeral_1h_input_tokens`
- Both representations always present in current API; pre-2025 may have only the flat field
- `input_tokens` is the count of NEW input tokens this turn (excludes cached portions)
- `cache_read_input_tokens` is the count of tokens served from cache (5m + 1h tiers combined)

---

## 3. Canonical formulas

### 3.1 Current context tokens (window utilization)

```
current_context_tokens = input_tokens
                       + cache_read_input_tokens
                       + cache_creation_input_tokens
```

**Properties**:
- Conservative lower bound — tokens *received and processed* by the model on this turn
- Used by JICM threshold gating (`SOFT_NUDGE` at 300K, `HARD_HALT` at 650K for 1M-context Opus)
- Within ~3.6% of the v7 capture-pane reading (TUI's displayed context %)
- Excludes: rate-limit overhead, system-reminder markers added between turns

**Implementations**:
- `jicm-gate.sh:92`: `TOKENS=$((INPUT_T + CACHE_R + CACHE_C))`
- `cache-telemetry-extractor-v2.py:194`: `denom = cache_read + eph_5m + eph_1h + input_tokens` (functionally equivalent — eph_5m + eph_1h = cache_creation_input_tokens by invariant 2.1)

### 3.2 Cache hit rate

```
cache_hit_rate = cache_read_input_tokens / (cache_read_input_tokens
                                          + cache_creation_input_tokens
                                          + input_tokens)
```

**Properties**:
- Range: 0.0 (no cache) to 1.0 (all cached, impossible — at least system prompt is uncached)
- Healthy session typically 0.85+ once warmed
- Below 0.5 indicates either fresh session or cache invalidation event

**Implementations**:
- `jicm-gate.sh:lines 95-99`: `HIT_RATE=$(awk -v r="$CACHE_R" -v d="$DENOM" 'BEGIN { printf "%.4f", r/d }')`
- `cache-telemetry-extractor-v2.py:195`: `hit_rate = (cache_read / denom) if denom else 0.0`

### 3.3 Ephemeral cache breakdown

```
eph_5m_tokens = usage.cache_creation.ephemeral_5m_input_tokens
eph_1h_tokens = usage.cache_creation.ephemeral_1h_input_tokens
```

**Properties**:
- 5m TTL: short-lived cache (recent tool outputs, working scratch)
- 1h TTL: long-lived cache (system prompt, CLAUDE.md, force-loaded context)
- `eph_1h_adoption_pct = eph_1h_tokens / (eph_5m_tokens + eph_1h_tokens)` — measures stable-cache utilization
- Used by token-compression Phase 1.x sample-sufficiency gates (target: ≥ 80% adoption post-deploy)

**Implementations**:
- `jicm-gate.sh:lines 87-88`: `CACHE_5M`, `CACHE_1H` jq extractions
- `cache-telemetry-extractor-v2.py:191-192`: `eph_5m`, `eph_1h` dict reads

### 3.4 Burn rate (tokens per minute)

```
burn_rate_tpm = (current_tokens - previous_tokens) * 60 / (current_ts_epoch - previous_ts_epoch)
```

**Properties**:
- Computed only when `current_tokens > previous_tokens` (positive delta)
- Used for soft/hard ETA estimation: `eta_min = (threshold - current_tokens) / burn_rate_tpm`
- Reset to 0 when threshold reached or session restarts

**Implementations**:
- `jicm-gate.sh:127`: `BURN_RATE_TPM=$((DELTA_T * 60 / DELTA_S))`
- Not computed by extractor (extractor is per-turn, no inter-turn rate)

---

## 4. State-hook output contract

`.claude/context/.jicm-state-hook.json` schema (written by `jicm-gate.sh` per UPS):

| Field | Type | Source | Notes |
|---|---|---|---|
| `tokens` | int | §3.1 formula | Current context tokens |
| `input_tokens` | int | `usage.input_tokens` | New input this turn |
| `cache_read_tokens` | int | `usage.cache_read_input_tokens` | Cached tokens served |
| `cache_creation_tokens` | int | `usage.cache_creation_input_tokens` | Sum of 5m + 1h |
| `cache_creation_5m_tokens` | int | `usage.cache_creation.ephemeral_5m_input_tokens` | 5m TTL bucket |
| `cache_creation_1h_tokens` | int | `usage.cache_creation.ephemeral_1h_input_tokens` | 1h TTL bucket |
| `cache_hit_rate` | float | §3.2 formula | 0.0-1.0, 4 decimal places |
| `output_tokens_last` | int | `usage.output_tokens` | Output tokens this turn |
| `burn_rate_tpm` | int | §3.4 formula | 0 if no positive delta |
| `soft_eta_min` / `hard_eta_min` | int | derived | Minutes until threshold |
| `used_percentage` | int | `tokens * 100 / window` | Display only |
| `action` | string | derived | `WATCHING`/`SOFT_NUDGE`/`HARD_HALT` |

---

## 5. Cross-consumer validation

To verify both consumers agree on a given JSONL turn:

```bash
# Pick a recent assistant turn
SAMPLE=$(ls -t ~/.claude/projects/*/[0-9a-f]*.jsonl | head -1)

# Method 1: jicm-gate.sh path (bash + jq)
USAGE=$(tail -n 200 "$SAMPLE" | jq -s 'last(.[] | select(.type=="assistant") | .message.usage)')
INPUT_T=$(echo "$USAGE" | jq -r '.input_tokens // 0')
CACHE_R=$(echo "$USAGE" | jq -r '.cache_read_input_tokens // 0')
CACHE_C=$(echo "$USAGE" | jq -r '.cache_creation_input_tokens // 0')
echo "gate-hook: tokens=$((INPUT_T + CACHE_R + CACHE_C))"

# Method 2: extractor path (Python)
.claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py "$SAMPLE" --out /tmp/sample.csv
tail -1 /tmp/sample.csv  # input_tokens, cache_read, eph_5m, eph_1h, output_tokens
# Sum: input_tokens + cache_read + eph_5m + eph_1h
```

If outputs differ, one of the consumers has drifted. Investigate which formula is wrong (per this doc) and reconcile before merging any change.

---

## 6. Schema-evolution playbook

If Anthropic API adds a new ephemeral tier (e.g., `ephemeral_24h_input_tokens`):

1. **Update §2.1 invariant**: `cache_creation_input_tokens` flat field includes the new tier.
2. **Update §3.1 formula**: still use the flat field, so it auto-includes new tiers without code change.
3. **Update §3.3**: add the new breakdown field.
4. **Update jicm-gate.sh** to extract the new field.
5. **Update extractor-v2** to extract and emit the new field.
6. **Update state-hook contract §4** with the new field.

The `current_context_tokens` formula is robust to new tiers because it uses the flat sum field. Breakdown fields require explicit parsing additions.

---

*Canonical token formula reference v1.0 — Phase 0.2 refactor 2026-05-03*
