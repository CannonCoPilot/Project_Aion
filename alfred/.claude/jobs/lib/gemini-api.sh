#!/usr/bin/env bash
# gemini-api.sh — Gemini API helper for Nexus personas
#
# Source this in persona prompts or call functions directly from bash.
# Requires: GEMINI_API_KEY env var, curl, jq
#
# Provides:
#   gemini_call()        — Send a prompt, get text response
#   gemini_summarize()   — Summarize a URL (works with YouTube)
#   gemini_analyze()     — Analyze text with a system instruction
#   gemini_json()        — Request JSON output from Gemini
#   gemini_check_quota() — Check daily RPD quota before calling
#   gemini_rpm_pace()    — Sliding window RPM rate limiting

# Guard against double-sourcing
[ -n "${_GEMINI_API_SH_LOADED:-}" ] && return 0
_GEMINI_API_SH_LOADED=1

GEMINI_API_BASE="https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_DEFAULT_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

# --- Quota & Cost Config (override via env vars) ---
GEMINI_TIER="${GEMINI_TIER:-free}"
GEMINI_RPM_LIMIT="${GEMINI_RPM_LIMIT:-10}"       # requests per minute
GEMINI_RPD_LIMIT="${GEMINI_RPD_LIMIT:-250}"      # requests per day (free: 250, paid: 1500)
GEMINI_RPD_WARNING="${GEMINI_RPD_WARNING:-200}"   # 80% — log warning, continue
GEMINI_RPD_BLOCK="${GEMINI_RPD_BLOCK:-237}"       # 95% — skip call, return exit 2
GEMINI_INPUT_PRICE="${GEMINI_INPUT_PRICE:-0}"     # USD/M tokens (0 on free tier)
GEMINI_OUTPUT_PRICE="${GEMINI_OUTPUT_PRICE:-0}"   # USD/M tokens (0 on free tier)

# File paths — resolve relative to this script's directory
_GEMINI_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEMINI_QUOTA_FILE="${GEMINI_QUOTA_FILE:-${_GEMINI_SCRIPT_DIR}/../../data/gemini-quota.json}"
GEMINI_COST_LEDGER="${GEMINI_COST_LEDGER:-${_GEMINI_SCRIPT_DIR}/../../data/cost-ledger.jsonl}"

# --- Internal: update quota counter (flock-safe) ---
# Usage: _gemini_update_quota <model> <input_tokens> <output_tokens> <cost_usd>
_gemini_update_quota() {
    local model="$1"
    local input_tokens="$2"
    local output_tokens="$3"
    local cost_usd="$4"
    local quota_file="$GEMINI_QUOTA_FILE"
    local today now_iso
    today=$(date -u +%Y-%m-%d)
    now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    (
        flock -x 200

        local existing="{}"
        [ -f "$quota_file" ] && existing=$(cat "$quota_file")

        local file_date
        file_date=$(echo "$existing" | jq -r '.date // ""' 2>/dev/null)

        if [ "$file_date" != "$today" ]; then
            existing=$(jq -n \
                --arg date "$today" \
                --arg model "$model" \
                --arg tier "$GEMINI_TIER" \
                --arg now "$now_iso" \
                '{date:$date,model:$model,tier:$tier,daily_calls:0,
                  daily_input_tokens:0,daily_output_tokens:0,daily_cost_usd:0,
                  rpm_window_start:$now,rpm_window_calls:0,last_call:$now}')
        fi

        echo "$existing" | jq \
            --argjson input "$input_tokens" \
            --argjson output "$output_tokens" \
            --argjson cost "$cost_usd" \
            --arg now "$now_iso" \
            '.daily_calls += 1
            | .daily_input_tokens += $input
            | .daily_output_tokens += $output
            | .daily_cost_usd += $cost
            | .rpm_window_calls += 1
            | .last_call = $now' \
            > "${quota_file}.tmp" && mv "${quota_file}.tmp" "$quota_file"

    ) 200>"${quota_file}.lock"
}

# --- gemini_check_quota ---
# Returns: 0=OK, 2=daily quota exhausted (caller should skip Gemini call)
gemini_check_quota() {
    local quota_file="$GEMINI_QUOTA_FILE"
    local today daily_calls file_date
    today=$(date -u +%Y-%m-%d)

    [ -f "$quota_file" ] || return 0

    file_date=$(jq -r '.date // ""' "$quota_file" 2>/dev/null)
    [ "$file_date" != "$today" ] && return 0  # Different day — will reset

    daily_calls=$(jq -r '.daily_calls // 0' "$quota_file" 2>/dev/null)

    if [ "$daily_calls" -ge "$GEMINI_RPD_BLOCK" ]; then
        echo "QUOTA: daily RPD ${daily_calls}/${GEMINI_RPD_LIMIT} — skipping Gemini call" >&2
        jq -nc \
            --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg job "${JOB_NAME:-unknown}" \
            --arg model "$GEMINI_DEFAULT_MODEL" \
            --argjson calls "$daily_calls" \
            --argjson limit "$GEMINI_RPD_LIMIT" \
            '{ts:$ts,job:$job,model:$model,engine:"gemini-api",event:"quota_exhausted",
              daily_calls:$calls,rpd_limit:$limit,success:false}' \
            >> "$GEMINI_COST_LEDGER" 2>/dev/null
        return 2
    fi

    if [ "$daily_calls" -ge "$GEMINI_RPD_WARNING" ]; then
        echo "QUOTA: daily RPD ${daily_calls}/${GEMINI_RPD_LIMIT} — approaching limit" >&2
    fi

    return 0
}

# --- gemini_rpm_pace ---
# Sleeps if at RPM limit within the current 60-second window.
gemini_rpm_pace() {
    local quota_file="$GEMINI_QUOTA_FILE"
    [ -f "$quota_file" ] || return 0

    local now elapsed window_start rpm_calls
    now=$(date -u +%s)
    window_start=$(jq -r '
        if .rpm_window_start and .rpm_window_start != "" then
            (.rpm_window_start | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime)
        else 0 end' "$quota_file" 2>/dev/null || echo 0)
    rpm_calls=$(jq -r '.rpm_window_calls // 0' "$quota_file" 2>/dev/null || echo 0)
    elapsed=$((now - window_start))

    [ "$elapsed" -ge 60 ] && return 0  # Window expired — next call resets it

    if [ "$rpm_calls" -ge "$GEMINI_RPM_LIMIT" ]; then
        local sleep_secs=$((60 - elapsed + 1))
        echo "GEMINI_RPM: at limit (${rpm_calls}/${GEMINI_RPM_LIMIT}), sleeping ${sleep_secs}s" >&2
        sleep "$sleep_secs"
        (
            flock -x 200
            [ -f "$quota_file" ] && jq \
                --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                '.rpm_window_start = $now | .rpm_window_calls = 0' \
                "$quota_file" > "${quota_file}.tmp" && mv "${quota_file}.tmp" "$quota_file"
        ) 200>"${quota_file}.lock"
    fi
}

# gemini_call <prompt> [model] [max_tokens] [temperature]
# Returns: raw text response (no JSON wrapping)
# Exit codes: 0=success, 1=API error, 2=quota exhausted
gemini_call() {
    local prompt="$1"
    local model="${2:-$GEMINI_DEFAULT_MODEL}"
    local max_tokens="${3:-4096}"
    local temperature="${4:-0.3}"
    local api_key="${GEMINI_API_KEY:-}"

    if [ -z "$api_key" ]; then
        echo "ERROR: GEMINI_API_KEY not set" >&2
        return 1
    fi

    gemini_check_quota || return 2
    gemini_rpm_pace

    local start_ts
    start_ts=$(date -u +%s)

    local response
    response=$(curl -s --max-time 120 \
        "${GEMINI_API_BASE}/${model}:generateContent?key=${api_key}" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg prompt "$prompt" \
            --argjson temp "$temperature" \
            --argjson max_tok "$max_tokens" \
            '{
                contents: [{parts: [{text: $prompt}]}],
                generationConfig: {
                    temperature: $temp,
                    maxOutputTokens: $max_tok
                }
            }')" 2>/dev/null)

    local duration_s=$(( $(date -u +%s) - start_ts ))

    if [ -z "$response" ]; then
        echo "ERROR: Gemini request timed out" >&2
        return 1
    fi

    local text
    text=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null)

    if [ -z "$text" ]; then
        local err
        err=$(echo "$response" | jq -r '.error.message // "unknown error"' 2>/dev/null)
        echo "ERROR: Gemini API: $err" >&2
        return 1
    fi

    local input_tokens output_tokens
    input_tokens=$(echo "$response" | jq -r '.usageMetadata.promptTokenCount // 0' 2>/dev/null)
    output_tokens=$(echo "$response" | jq -r '.usageMetadata.candidatesTokenCount // 0' 2>/dev/null)
    input_tokens="${input_tokens:-0}"
    output_tokens="${output_tokens:-0}"

    local cost_usd="0"
    if [ "${GEMINI_TIER:-free}" != "free" ]; then
        cost_usd=$(python3 -c "print(round(($input_tokens/1e6*${GEMINI_INPUT_PRICE:-0.15}) + ($output_tokens/1e6*${GEMINI_OUTPUT_PRICE:-0.60}), 6))" 2>/dev/null || echo "0")
    fi

    _gemini_update_quota "$model" "$input_tokens" "$output_tokens" "$cost_usd"

    jq -nc \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg job "${JOB_NAME:-unknown}" \
        --arg model "$model" \
        --argjson input "$input_tokens" \
        --argjson output "$output_tokens" \
        --argjson cost "${cost_usd:-0}" \
        --argjson duration "$duration_s" \
        '{ts:$ts,job:$job,model:$model,engine:"gemini-api",cost:$cost,
          input_tokens:$input,output_tokens:$output,cache_read_tokens:0,
          cache_creation_tokens:0,cache_hit_ratio:0,duration_s:$duration,success:true}' \
        >> "$GEMINI_COST_LEDGER" 2>/dev/null

    echo "$text"
}

# gemini_summarize <url> [model] [max_tokens]
# Summarizes a URL (YouTube, articles, etc.)
gemini_summarize() {
    local url="$1"
    local model="${2:-$GEMINI_DEFAULT_MODEL}"
    local max_tokens="${3:-2048}"

    gemini_call "Summarize the content at this URL in a structured format with key points: ${url}" "$model" "$max_tokens" 0.3
}

# gemini_analyze <text> <instruction> [model] [max_tokens]
# Analyze text with a specific instruction
gemini_analyze() {
    local text="$1"
    local instruction="$2"
    local model="${3:-$GEMINI_DEFAULT_MODEL}"
    local max_tokens="${4:-4096}"

    gemini_call "${instruction}

---
${text}" "$model" "$max_tokens" 0.3
}

# gemini_json <prompt> [model] [max_tokens]
# Request JSON output from Gemini
# Exit codes: 0=success, 1=API key missing, 2=quota exhausted
gemini_json() {
    local prompt="$1"
    local model="${2:-$GEMINI_DEFAULT_MODEL}"
    local max_tokens="${3:-4096}"
    local api_key="${GEMINI_API_KEY:-}"

    if [ -z "$api_key" ]; then
        echo '{"error":"GEMINI_API_KEY not set"}' >&2
        return 1
    fi

    gemini_check_quota || return 2
    gemini_rpm_pace

    local start_ts
    start_ts=$(date -u +%s)

    local response
    response=$(curl -s --max-time 120 \
        "${GEMINI_API_BASE}/${model}:generateContent?key=${api_key}" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg prompt "$prompt" \
            --argjson max_tok "$max_tokens" \
            '{
                contents: [{parts: [{text: $prompt}]}],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: $max_tok,
                    responseMimeType: "application/json"
                }
            }')" 2>/dev/null)

    local duration_s=$(( $(date -u +%s) - start_ts ))

    local text
    text=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null)

    if [ -n "$text" ]; then
        local input_tokens output_tokens
        input_tokens=$(echo "$response" | jq -r '.usageMetadata.promptTokenCount // 0' 2>/dev/null)
        output_tokens=$(echo "$response" | jq -r '.usageMetadata.candidatesTokenCount // 0' 2>/dev/null)
        input_tokens="${input_tokens:-0}"
        output_tokens="${output_tokens:-0}"

        local cost_usd="0"
        if [ "${GEMINI_TIER:-free}" != "free" ]; then
            cost_usd=$(python3 -c "print(round(($input_tokens/1e6*${GEMINI_INPUT_PRICE:-0.15}) + ($output_tokens/1e6*${GEMINI_OUTPUT_PRICE:-0.60}), 6))" 2>/dev/null || echo "0")
        fi

        _gemini_update_quota "$model" "$input_tokens" "$output_tokens" "$cost_usd"

        jq -nc \
            --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg job "${JOB_NAME:-unknown}" \
            --arg model "$model" \
            --argjson input "$input_tokens" \
            --argjson output "$output_tokens" \
            --argjson cost "${cost_usd:-0}" \
            --argjson duration "$duration_s" \
            '{ts:$ts,job:$job,model:$model,engine:"gemini-api",cost:$cost,
              input_tokens:$input,output_tokens:$output,cache_read_tokens:0,
              cache_creation_tokens:0,cache_hit_ratio:0,duration_s:$duration,success:true}' \
            >> "$GEMINI_COST_LEDGER" 2>/dev/null
    fi

    echo "$text"
}
