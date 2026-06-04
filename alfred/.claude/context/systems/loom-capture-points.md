# Loom Training Data Capture Points

**Purpose**: Map all viable capture points in the NEXUS executor pipeline for training data collection.
**Parent**: T1.2 of orchestration `2026-03-26-nexus-training-data-capture-loom.yaml`
**Schema reference**: `loom-training-schema.md` (v1.2)
**Created**: 2026-03-29

---

## Capture Point 1: Executor Success Path (PRIMARY)

**File**: `.claude/jobs/executor.sh`
**Location**: After line ~1140 (after `$RESPONSE` extraction and signal detection, before post-execution processing)
**Trigger**: Every successful Claude CLI invocation (exit code 0)

### Variables Available

| Variable | Content | Source |
|----------|---------|--------|
| `$JOB_NAME` | Job identifier from registry | Line 730 |
| `$PERSONA_NAME` | Active persona | Line 730 |
| `$MODEL` | Requested model (opus/sonnet/haiku) | Line 734 |
| `$ENGINE` | Execution engine | Line 769 |
| `$FULL_PROMPT` | Complete assembled prompt text | Lines 340-453 |
| `$RESULT` | Raw JSON response from Claude CLI | Line 1020-1032 |
| `$RESPONSE` | Extracted `.result` text from response | Line 1139 |
| `$COST` | Total cost USD | Line 1140 |
| `$MODEL_USAGE` | Detailed token breakdown JSON | Line 1141 |
| `$INPUT_TOKENS` | Input token count | Line 1143 |
| `$OUTPUT_TOKENS` | Output token count | Line 1144 |
| `$CACHE_READ` | Cache read tokens | Line 1142 |
| `$CACHE_CREATION` | Cache creation tokens | Line 1145 |
| `$EXEC_DURATION` | Execution time in seconds | Computed |
| `$EXEC_EXIT_CODE` | Exit code (0 for success) | Line 1034 |
| `$EXEC_TASK_ID` | Pulse task ID (if task-bound) | Line 863-866 |
| `$ROUTER_MODEL` | LLM router recommendation | Line 788-803 |
| `$ROUTER_OVERRIDDEN` | Whether persona pinned model | Line 801-807 |
| `$MAX_TURNS` | Turn limit | Line 732 |
| `$MAX_BUDGET` | Budget limit USD | Line 733 |
| `$TIMEOUT_MINUTES` | Timeout limit | Line 736 |
| `$EFFORT` | Effort level (if set) | Line 735 |
| `$OUTPUT_FILE` | Path to raw output JSON file | Line 1132 |
| `$ALLOWED_TOOLS` | Tool allowlist string | Lines 497-580 |
| `$PERSONA_TIER` | Permission tier (from config.yaml `tier:` field) | Derived from persona config |
| `$API_RETRIES` | Total retry attempts configured | From registry (default 3) |

### Post-Signal Variables (available after signal extraction, lines 1179-1283)

| Variable | Content |
|----------|---------|
| `$REVIEW_APPROVE` / `$REVIEW_REJECT` | Review signal text |
| `$REVIEW_TASK` | Task ID from review signal |
| `$PAUSE_REASON` | Pause reason text |
| `$PAUSE_QUESTIONS` | Pause questions text |
| Critical flag | Regex match for CRITICAL/URGENT/SECURITY |

### Prompt Components (for prompt_hash and component tracking)

The full prompt is assembled from these sources (lines 340-453):
1. **Persona prompt**: `$PERSONA_DIR/prompt.md` (read at line 362)
2. **Dynamic injections**: AI David thresholds from nexus-settings.json (line 370-380)
3. **Job context block**: job name, timestamp, session ID (lines 385-400)
4. **Job task prompt**: from registry `prompt:` field or workflow file (line 405-420)
5. **Session history**: if `--session` flag provided (lines 401-430)
6. **Parameters**: from `--param` flags (lines 434-439)

### Implementation: `write_training_capture()` function

```bash
write_training_capture() {
    [[ "${TRAINING_CAPTURE_ENABLED:-false}" != "true" ]] && return 0

    local capture_id="cap-$(uuidgen | tr '[:upper:]' '[:lower:]')"
    local capture_dir=".claude/data/training"
    local today=$(date -u +%Y-%m-%d)
    local index_file="${capture_dir}/index/captures-${today}.jsonl"
    local prompt_file="${capture_dir}/content/${capture_id}-prompt.txt"
    local response_file="${capture_dir}/content/${capture_id}-response.txt"

    # Ensure directories exist
    mkdir -p "${capture_dir}/index" "${capture_dir}/content" "${capture_dir}/quality"

    # Write content files
    echo "$FULL_PROMPT" > "$prompt_file"
    echo "$RESPONSE" > "$response_file"

    # Build index record
    local record
    record=$(jq -nc \
        --arg cid "$capture_id" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg dur "$EXEC_DURATION" \
        --arg job "$JOB_NAME" \
        --arg persona "$PERSONA_NAME" \
        --arg engine "${ENGINE:-claude-code}" \
        --arg sid "$SESSION_ID" \
        --arg model_req "$MODEL" \
        --arg model_act "$(echo "$RESULT" | jq -r '.modelUsage | keys[0] // empty')" \
        --arg router "$ROUTER_MODEL" \
        --argjson router_ov "${ROUTER_OVERRIDDEN:-false}" \
        --argjson input_tok "${INPUT_TOKENS:-null}" \
        --argjson output_tok "${OUTPUT_TOKENS:-null}" \
        --argjson cache_read "${CACHE_READ:-null}" \
        --argjson cache_create "${CACHE_CREATION:-null}" \
        --arg cost "${COST:-0}" \
        --arg prompt_f "content/${capture_id}-prompt.txt" \
        --argjson prompt_len "${#FULL_PROMPT}" \
        --arg prompt_hash "$(echo "$FULL_PROMPT" | sha256sum | cut -d' ' -f1)" \
        --arg response_f "content/${capture_id}-response.txt" \
        --argjson response_len "${#RESPONSE}" \
        --arg stop "$(echo "$RESULT" | jq -r '.stop_reason // empty')" \
        --argjson is_err "$(echo "$RESULT" | jq '.is_error // false')" \
        --arg subtype "$(echo "$RESULT" | jq -r '.subtype // "success"')" \
        --argjson num_turns "$(echo "$RESULT" | jq '.num_turns // 1')" \
        --argjson exit_code "${EXEC_EXIT_CODE:-0}" \
        --arg err_class "${ERROR_CLASS:-}" \
        --argjson attempt "${ATTEMPT:-1}" \
        --argjson is_failure false \
        --argjson attempts_total "${API_RETRIES:-3}" \
        --arg persona_tier "${PERSONA_TIER:-unknown}" \
        --arg task_id "${EXEC_TASK_ID:-}" \
        '{
            capture_id: $cid,
            version: "1.2",
            timestamp: $ts,
            duration_s: ($dur | tonumber),
            job_name: $job,
            persona: $persona,
            engine: $engine,
            persona_tier: $persona_tier,
            session_id: $sid,
            model_requested: $model_req,
            model_actual: (if $model_act == "" then null else $model_act end),
            router_model: $router,
            router_overridden: $router_ov,
            tokens: {
                input: $input_tok,
                output: $output_tok,
                cache_read: $cache_read,
                cache_creation: $cache_create
            },
            cost_usd: ($cost | tonumber),
            input: {
                prompt_hash: ("sha256:" + $prompt_hash),
                prompt_file: $prompt_f,
                prompt_length: $prompt_len,
                task_ids: (if $task_id == "" then [] else [$task_id] end)
            },
            output: {
                response_file: $response_f,
                response_length: $response_len,
                stop_reason: (if $stop == "" then null else $stop end),
                is_error: $is_err,
                subtype: $subtype,
                num_turns: $num_turns
            },
            result: {
                exit_code: $exit_code,
                error_class: (if $err_class == "" then null else $err_class end),
                attempt: $attempt,
                attempts_total: $attempts_total,
                is_failure: $is_failure
            },
            tool_calls_file: null,
            tool_calls_summary: null,
            quality: {
                quality_filled_at: null,
                human_feedback: null,
                feedback_comment: null,
                execution_outcome: null,
                tasks_closed: null,
                confidence: null
            },
            record_type: "execution",
            persona_data: {}
        }')

    echo "$record" >> "$index_file"
}
```

**Call site**: Insert after signal extraction block (~line 1283), before notification/cost-ledger writes.

---

## Capture Point 2: Executor Failure Path

**File**: `.claude/jobs/executor.sh`
**Location**: Lines 1081-1090 (after retry exhaustion, before `exit 1`)
**Trigger**: Failed execution (all retries exhausted, auth failure, or fatal error)

### Variables Available (subset of success path)

| Variable | Available? | Notes |
|----------|-----------|-------|
| `$FULL_PROMPT` | Yes | Assembled before invocation |
| `$RESULT` | Partial | May be empty or contain error text |
| `$RESPONSE` | Maybe | May not be extracted on failure |
| `$EXEC_EXIT_CODE` | Yes | Non-zero |
| `$ERROR_CLASS` | Yes | auth / transient / fatal |
| `$ATTEMPT` | Yes | Which retry attempt failed |
| Token counts | No | Not available on failure |
| `$COST` | No | May not be returned |

### Implementation

Same `write_training_capture()` function with `is_failure=true` and null for unavailable fields.

**Call site**: Insert before `exit 1` in the failure handler (~line 1089).

---

## Capture Point 3: Team Consensus (DEFERRED to Phase 3)

**File**: `.claude/jobs/team-runner.py`
**Location**: After verdict synthesis
**Trigger**: Team job completes with consensus

Not implemented in Phase 1 — team jobs are rare and the consensus logic is Python, not shell. Added to Phase 3 when stream-json parser is available.

---

## Exit Paths Summary

| Exit Path | Capture? | Record Type | Data Quality |
|-----------|----------|-------------|-------------|
| Success (exit 0) | Yes | `execution` | Full — all fields available |
| Max turns exceeded | Yes | `execution` | Full — `subtype: "error_max_turns"` |
| Max budget exceeded | Yes | `execution` | Full — `subtype: "error_max_budget"` |
| Timeout (exit 124) | Yes | `failure` | Partial — no response, no tokens |
| Auth failure | Yes | `failure` | Minimal — prompt only, `error_class: "auth"` |
| Transient failure (retries exhausted) | Yes | `failure` | Partial — last attempt's error text |
| Fatal error | Yes | `failure` | Partial — error text if available |
| Budget pre-flight block | No | — | Not a Claude invocation, nothing to capture |
| Lock acquisition failure | No | — | Not a Claude invocation |
| Pre-check gate failure | No | — | Not a Claude invocation |

---

## Self-Querying Persona Considerations

Two personas read their own output:

### AI David
- Reads: `feedback.jsonl`, `learned-patterns.yaml`, past decision JSONL
- Risk: Training capture could create a feedback loop if AI David reads its own training data
- Mitigation: Training data lives in `.claude/data/training/` — AI David reads from `.claude/agent-output/results/ai-david/`. No overlap.

### Researcher
- Reads: Past research output files, task lists
- Risk: Same as above — no overlap with training data directory.

**Verdict**: No self-query contamination risk. Capture directories are isolated from persona output directories.

---

## Capture Toggle

### nexus-settings.json entry

```json
{
  "training_capture": {
    "enabled": false,
    "capture_dir": ".claude/data/training",
    "capture_failures": true,
    "max_prompt_length": null,
    "max_response_length": null
  }
}
```

### Environment variable overrides

```bash
TRAINING_CAPTURE_ENABLED=true   # Overrides nexus-settings.json .training_capture.enabled
TRAINING_STREAM_JSON=true       # Overrides .training_capture.stream_json
TRAINING_TOOL_INLINE_MAX=2048   # Overrides .training_capture.tool_output_inline_max
```

### Phase 2 settings (LIVE — stream_json=true enables tool call capture)

```json
{
  "training_capture": {
    "enabled": true,
    "capture_dir": ".claude/data/training",
    "capture_failures": true,
    "stream_json": false,
    "tool_output_inline_max": 1024
  }
}
```

When `stream_json: true`, executor.sh uses `--output-format stream-json --verbose` piped through `lib/stream-parser.py`. This captures intermediate tool calls (bash commands, file reads, etc.) alongside the existing prompt/response capture. Setting `stream_json: false` reverts to Phase 1 behavior (json format, no tool calls).
