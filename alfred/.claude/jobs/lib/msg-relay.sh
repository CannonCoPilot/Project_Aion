#!/bin/bash
# msg-relay.sh - DND-aware message delivery relay for Nexus
#
# Polls the message bus for pending messages, checks quiet hours,
# delivers via Telegram, and marks delivered.
#
# Called after each dispatcher cycle or independently via cron.
#
# Usage:
#   msg-relay.sh              # Normal relay cycle
#   msg-relay.sh --dry-run    # Show what would be delivered
#   msg-relay.sh --test-dnd   # Show current DND state

set -euo pipefail

# Ensure user-local binaries are available in cron's minimal PATH
export PATH="$HOME/.local/bin:$PATH"

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY="$JOBS_DIR/registry.yaml"
MSGBUS="$SCRIPT_DIR/msgbus.sh"
SEND_TELEGRAM="$SCRIPT_DIR/send-telegram.sh"
LOG_DIR="$JOBS_DIR/../../.claude/logs/headless"
RELAY_LOG="$LOG_DIR/relay.log"

# Dashboard notification endpoint (reads from registry, falls back to default)
DASHBOARD_ENDPOINT=""  # Set after yq is available
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:8600}"

# Shared utilities (colors, logging, require_yq, reg_get)
# shellcheck disable=SC2034 # Used by sourced common.sh
LOG_COMPONENT="relay"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# Helpers
# ============================================================================

# Override log() to tee to relay log
log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1" | tee -a "$RELAY_LOG" 2>/dev/null; }

# ============================================================================
# DND (Do Not Disturb) Logic
# ============================================================================

# Check if current time is within quiet hours
# Returns 0 if in quiet hours (DND active), 1 if not
is_quiet_hours() {
    local tz hour dow start_hour end_hour

    tz=$("$YQ" '.quiet_hours.timezone // "America/Denver"' "$REGISTRY" 2>/dev/null)

    # Get current hour and day-of-week in configured timezone
    hour=$(TZ="$tz" date +%H | sed 's/^0//')
    dow=$(TZ="$tz" date +%u)  # 1=Monday, 7=Sunday

    # Weekend = Saturday(6) or Sunday(7)
    if [ "$dow" -ge 6 ]; then
        start_hour=$("$YQ" '.quiet_hours.weekend.start // 23' "$REGISTRY" 2>/dev/null)
        end_hour=$("$YQ" '.quiet_hours.weekend.end // 9' "$REGISTRY" 2>/dev/null)
    else
        start_hour=$("$YQ" '.quiet_hours.weekday.start // 22' "$REGISTRY" 2>/dev/null)
        end_hour=$("$YQ" '.quiet_hours.weekday.end // 7' "$REGISTRY" 2>/dev/null)
    fi

    # Handle overnight window (e.g., 22-7 means 22,23,0,1,2,3,4,5,6)
    if [ "$start_hour" -gt "$end_hour" ]; then
        # Overnight: quiet if hour >= start OR hour < end
        if [ "$hour" -ge "$start_hour" ] || [ "$hour" -lt "$end_hour" ]; then
            return 0
        fi
    else
        # Same-day: quiet if hour >= start AND hour < end
        if [ "$hour" -ge "$start_hour" ] && [ "$hour" -lt "$end_hour" ]; then
            return 0
        fi
    fi

    return 1
}

# Check if a severity bypasses DND
severity_bypasses_dnd() {
    local severity="$1"
    local bypass_count
    bypass_count=$("$YQ" '.quiet_hours.severity_bypass | length' "$REGISTRY" 2>/dev/null || echo "0")

    for ((i=0; i<bypass_count; i++)); do
        local bypass_sev
        bypass_sev=$("$YQ" ".quiet_hours.severity_bypass[$i]" "$REGISTRY" 2>/dev/null)
        if [ "$severity" = "$bypass_sev" ]; then
            return 0
        fi
    done
    return 1
}

# ============================================================================
# Delivery
# ============================================================================

# Status emoji based on severity + event type
status_emoji() {
    local severity="$1" event_type="$2"
    case "$event_type" in
        job_failed) echo "👎" ;;
        reminder_due) echo "🔔" ;;
        *)
            case "$severity" in
                critical) echo "👎" ;;
                warning)  echo "⚠️" ;;
                info)     echo "👍" ;;
                *)        echo "📋" ;;
            esac
            ;;
    esac
}

# Escape HTML special characters for Telegram
escape_html() {
    local text="$1"
    text="${text//&/&amp;}"
    text="${text//</&lt;}"
    text="${text//>/&gt;}"
    echo "$text"
}

# ============================================================================
# Dashboard Delivery
# ============================================================================

# Map bus event_type to dashboard notification category
map_category() {
    local event_type="$1"
    case "$event_type" in
        job_failed)              echo "health_critical" ;;
        job_completed)           echo "completion" ;;
        notification)            echo "pipeline" ;;
        reminder_due)            echo "escalation" ;;
        *)                       echo "pipeline" ;;
    esac
}

# POST event to dashboard notification endpoint
deliver_to_dashboard() {
    local event="$1"
    local event_type severity job summary task_id source

    event_type=$(echo "$event" | jq -r '.event_type')
    severity=$(echo "$event" | jq -r '.severity')
    job=$(echo "$event" | jq -r '.data.job // "unknown"')
    summary=$(echo "$event" | jq -r '.data.summary // "No details"')
    task_id=$(echo "$event" | jq -r '.data.task_id // empty')
    source=$(echo "$event" | jq -r '.source // .data.job // "nexus"')

    local category
    category=$(map_category "$event_type")

    # Build title from event type + job
    local title
    case "$event_type" in
        job_completed) title="$job completed" ;;
        job_failed)    title="$job failed" ;;
        reminder_due)  title="Reminder: $job" ;;
        notification)  title="$source" ;;
        *)             title="$event_type — $job" ;;
    esac

    # Build URL — deep-link into nexus-ops with context params
    local url="/nexus-ops"
    local params=""
    if [ -n "$task_id" ]; then
        params="task_id=$(printf '%s' "$task_id" | jq -sRr @uri)"
    fi
    if [ -n "$job" ]; then
        [ -n "$params" ] && params="$params&" || true
        params="${params}job=$(printf '%s' "$job" | jq -sRr @uri)"
    fi
    if [ -n "$params" ]; then
        url="/nexus-ops?$params"
    fi

    # POST to dashboard
    local payload
    payload=$(jq -n \
        --arg title "$title" \
        --arg body "$summary" \
        --arg category "$category" \
        --arg severity "$severity" \
        --arg url "$url" \
        --arg taskId "${task_id:-}" \
        --arg source "$source" \
        '{title: $title, body: $body, category: $category, severity: $severity, url: $url, taskId: $taskId, source: $source}')

    local http_code attempt max_attempts=3
    for ((attempt=1; attempt<=max_attempts; attempt++)); do
        http_code=$(curl -s -o /dev/null -w '%{http_code}' \
            -X POST "$DASHBOARD_ENDPOINT" \
            -H "Content-Type: application/json" \
            -d "$payload" \
            --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")

        if [ "$http_code" = "200" ]; then
            log "Dashboard: delivered [$event_type] ($severity) for $job"
            return 0
        fi

        if [ "$attempt" -lt "$max_attempts" ]; then
            log "Dashboard delivery attempt $attempt/$max_attempts failed (HTTP $http_code) for $job — retrying in 3s"
            sleep 3
        fi
    done

    log "WARNING: Dashboard delivery failed after $max_attempts attempts (HTTP $http_code) for $job"
    return 1
}

# Check if event should be delivered to Telegram based on notification_preferences
should_deliver_to_telegram() {
    local severity="$1"

    # Read allowed severities from registry
    local telegram_enabled
    telegram_enabled=$("$YQ" '.notification_preferences.channels.telegram.enabled // true' "$REGISTRY" 2>/dev/null)
    if [ "$telegram_enabled" = "false" ]; then
        return 1
    fi

    local sev_count
    sev_count=$("$YQ" '.notification_preferences.channels.telegram.filter.severity | length' "$REGISTRY" 2>/dev/null || echo "0")

    for ((i=0; i<sev_count; i++)); do
        local allowed
        allowed=$("$YQ" ".notification_preferences.channels.telegram.filter.severity[$i]" "$REGISTRY" 2>/dev/null)
        if [ "$severity" = "$allowed" ]; then
            return 0
        fi
    done

    return 1
}

# Format a simple pager message for Telegram (link-only, no buttons)
format_telegram_pager() {
    local event="$1"
    local event_type severity job summary task_id

    event_type=$(echo "$event" | jq -r '.event_type')
    severity=$(echo "$event" | jq -r '.severity')
    job=$(echo "$event" | jq -r '.data.job // "unknown"')
    summary=$(echo "$event" | jq -r '.data.summary // "No details"')
    task_id=$(echo "$event" | jq -r '.data.task_id // empty')

    local emoji
    emoji=$(status_emoji "$severity" "$event_type")

    local job_escaped
    job_escaped=$(escape_html "$job")
    summary=$(escape_html "$summary")

    local link="$DASHBOARD_URL/nexus-ops"
    if [ -n "$task_id" ]; then
        link="$DASHBOARD_URL/tasks/$task_id"
    fi

    echo "${emoji} [${severity}] <b>${job_escaped}</b>
${summary}
→ ${link}"
}


# Deliver a single event — dashboard always, Telegram only if severity qualifies
deliver_event() {
    local event="$1"
    local msg_id event_type severity job

    msg_id=$(echo "$event" | jq -r '.id')
    event_type=$(echo "$event" | jq -r '.event_type')
    severity=$(echo "$event" | jq -r '.severity')
    job=$(echo "$event" | jq -r '.data.job // "unknown"')

    # 1. Deliver to dashboard (records history + web push)
    #    Skip internal bookkeeping events
    if [ "$event_type" != "notification_delivered" ]; then
        deliver_to_dashboard "$event" || true
    fi

    # 2. Telegram: pager mode only if severity qualifies (critical by default)
    if should_deliver_to_telegram "$severity"; then
        local text
        text=$(format_telegram_pager "$event")
        if [ -x "$SEND_TELEGRAM" ]; then
            "$SEND_TELEGRAM" --message "$text" --parse-mode "HTML" 2>/dev/null || log "WARNING: Failed to send Telegram pager for $job ($msg_id)"
        fi
        log "Delivered: [$msg_id] $event_type ($severity) for $job → dashboard+telegram"
    else
        log "Delivered: [$msg_id] $event_type ($severity) for $job → dashboard only"
    fi

    # Mark delivered in the bus
    "$MSGBUS" deliver --id "$msg_id" --by relay > /dev/null
}

# ============================================================================
# Main
# ============================================================================

DRY_RUN=false
TEST_DND=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run) DRY_RUN=true; shift ;;
        --test-dnd) TEST_DND=true; shift ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

# Find yq
YQ=$(require_yq)

# Resolve dashboard endpoint from registry
DASHBOARD_ENDPOINT=$("$YQ" '.notification_preferences.channels.dashboard.endpoint // "http://localhost:8600/api/pipeline/notify"' "$REGISTRY" 2>/dev/null)

# Ensure log directory
mkdir -p "$LOG_DIR"

# Test DND mode
if [ "$TEST_DND" = "true" ]; then
    local_tz=$("$YQ" '.quiet_hours.timezone // "America/Denver"' "$REGISTRY" 2>/dev/null)
    echo "Timezone: $local_tz"
    echo "Current time: $(TZ="$local_tz" date '+%Y-%m-%d %H:%M %Z')"
    echo "Day of week: $(TZ="$local_tz" date +%A) ($(TZ="$local_tz" date +%u))"
    if is_quiet_hours; then
        echo "DND: ACTIVE (quiet hours)"
    else
        echo "DND: INACTIVE (delivery allowed)"
    fi
    echo ""
    echo "Severity bypass:"
    "$YQ" '.quiet_hours.severity_bypass[]' "$REGISTRY" 2>/dev/null | while read -r sev; do
        echo "  - $sev"
    done
    exit 0
fi

# Relay lock — prevent concurrent delivery (duplicate messages)
RELAY_LOCK="$JOBS_DIR/state/locks/relay.lock"
mkdir -p "$(dirname "$RELAY_LOCK")"
if [ -f "$RELAY_LOCK" ]; then
    lock_pid=$(cat "$RELAY_LOCK" 2>/dev/null || echo "")
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
        log "Relay already running (PID $lock_pid), skipping"
        exit 0
    fi
    rm -f "$RELAY_LOCK"
fi
echo $$ > "$RELAY_LOCK"
trap 'rm -f "$RELAY_LOCK"' EXIT

# Get pending messages
PENDING=$("$MSGBUS" pending 2>/dev/null || { log "WARNING: Failed to read pending messages from msgbus"; echo ""; })

if [ -z "$PENDING" ]; then
    # Nothing to deliver
    exit 0
fi

DELIVERED=0
QUEUED=0
BYPASSED=0
DIGESTED=0

# DND state tracking for transition detection
DND_STATE_FILE="$JOBS_DIR/state/relay-dnd-state"
mkdir -p "$(dirname "$DND_STATE_FILE")"

# Check DND status once
DND_ACTIVE=false
if is_quiet_hours; then
    DND_ACTIVE=true
fi

# Detect DND transition (was active last cycle, inactive now)
DND_JUST_ENDED=false
if [ "$DND_ACTIVE" = "false" ] && [ -f "$DND_STATE_FILE" ]; then
    PREV_DND=$(cat "$DND_STATE_FILE" 2>/dev/null || echo "false")
    if [ "$PREV_DND" = "true" ]; then
        DND_JUST_ENDED=true
    fi
fi

# Save current DND state for next cycle
echo "$DND_ACTIVE" > "$DND_STATE_FILE"

# Count pending messages for digest decision
PENDING_COUNT=$(echo "$PENDING" | grep -c '^{' || true)

# ============================================================================
# DND Digest Mode
# ============================================================================
# When DND just ended and there are >3 pending messages, send a single digest
# instead of flooding Telegram with individual notifications.

deliver_digest() {
    local events="$1"

    local critical_count=0 warning_count=0 info_count=0

    while IFS= read -r event; do
        [ -z "$event" ] && continue
        local sev
        sev=$(echo "$event" | jq -r '.severity')
        case "$sev" in
            critical) critical_count=$((critical_count + 1)) ;;
            warning)  warning_count=$((warning_count + 1)) ;;
            *)        info_count=$((info_count + 1)) ;;
        esac
    done <<< "$events"

    local digest_count=$((critical_count + warning_count + info_count))
    if [ "$digest_count" -gt 0 ]; then
        # Deliver each event individually to dashboard (for history + push)
        while IFS= read -r event; do
            [ -z "$event" ] && continue
            deliver_to_dashboard "$event" || true
        done <<< "$events"

        # Only send Telegram digest if there are critical events
        if [ "$critical_count" -gt 0 ]; then
            local digest_msg="📬 <b>${critical_count} critical notification(s) while you were away</b>
"
            while IFS= read -r event; do
                [ -z "$event" ] && continue
                local esev
                esev=$(echo "$event" | jq -r '.severity')
                if [ "$esev" = "critical" ]; then
                    local ejob esummary
                    ejob=$(echo "$event" | jq -r '.data.job // "unknown"')
                    esummary=$(echo "$event" | jq -r '.data.summary // "No details"')
                    digest_msg="${digest_msg}
• $(escape_html "$ejob"): $(escape_html "$esummary")"
                fi
            done <<< "$events"

            digest_msg="${digest_msg}

→ ${DASHBOARD_URL}/notifications"

            if [ -x "$SEND_TELEGRAM" ]; then
                "$SEND_TELEGRAM" --message "$digest_msg" --parse-mode "HTML" 2>/dev/null || log "WARNING: Failed to send Telegram digest"
            fi
            log "Telegram digest sent: $critical_count critical events"
        fi

        # Mark all digested events as delivered
        while IFS= read -r event; do
            [ -z "$event" ] && continue
            local mid
            mid=$(echo "$event" | jq -r '.id')
            "$MSGBUS" deliver --id "$mid" --by relay-digest > /dev/null
            DIGESTED=$((DIGESTED + 1))
        done <<< "$events"
        DELIVERED=$((DELIVERED + 1))  # Count digest as 1 delivery

        log "Digest: $digest_count events to dashboard ($critical_count critical → telegram)"
    fi
}

# ============================================================================
# Main delivery loop
# ============================================================================

# Use digest mode if DND just ended and >3 pending messages
if [ "$DND_JUST_ENDED" = "true" ] && [ "$PENDING_COUNT" -gt 3 ] && [ "$DRY_RUN" = "false" ]; then
    log "DND ended with $PENDING_COUNT pending messages — entering digest mode"
    deliver_digest "$PENDING"
else
    # Normal per-message delivery
    while IFS= read -r event; do
        [ -z "$event" ] && continue

        msg_id=$(echo "$event" | jq -r '.id')
        severity=$(echo "$event" | jq -r '.severity')
        event_type=$(echo "$event" | jq -r '.event_type')
        job=$(echo "$event" | jq -r '.data.job // "unknown"')

        if [ "$DRY_RUN" = "true" ]; then
            if [ "$DND_ACTIVE" = "true" ] && ! severity_bypasses_dnd "$severity"; then
                echo "[DRY RUN] QUEUED: [$msg_id] $event_type ($severity) for $job - DND active"
                QUEUED=$((QUEUED + 1))
            else
                echo "[DRY RUN] WOULD DELIVER: [$msg_id] $event_type ($severity) for $job"
                DELIVERED=$((DELIVERED + 1))
            fi
            continue
        fi

        # DND check (all severities except bypass list are held during quiet hours)
        if [ "$DND_ACTIVE" = "true" ]; then
            if severity_bypasses_dnd "$severity"; then
                log "DND bypass: [$msg_id] $event_type ($severity) for $job"
                deliver_event "$event"
                BYPASSED=$((BYPASSED + 1))
                DELIVERED=$((DELIVERED + 1))
            else
                # Skip - stays pending, will be picked up when DND ends
                QUEUED=$((QUEUED + 1))
            fi
        else
            deliver_event "$event"
            DELIVERED=$((DELIVERED + 1))
        fi
    done <<< "$PENDING"
fi

# Log summary
if [ "$DRY_RUN" = "true" ]; then
    echo ""
    echo "DND: $([ "$DND_ACTIVE" = "true" ] && echo "ACTIVE" || echo "INACTIVE")"
    echo "Would deliver: $DELIVERED, Queued: $QUEUED"
else
    if [ "$DELIVERED" -gt 0 ] || [ "$QUEUED" -gt 0 ] || [ "$DIGESTED" -gt 0 ]; then
        log "Relay cycle: delivered=$DELIVERED queued=$QUEUED bypassed=$BYPASSED digested=$DIGESTED dnd=$DND_ACTIVE dnd_ended=$DND_JUST_ENDED"
    fi
fi

exit 0
