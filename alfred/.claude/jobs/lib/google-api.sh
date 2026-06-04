#!/usr/bin/env bash
# google-api.sh — Google API helpers for Nexus bash scripts.
#
# Uses the Google Token Vault to get fresh access tokens, then calls Google APIs.
# Requires: PULSE_SERVICE_TOKEN set (via common.sh) for token vault auth.
#
# Usage:
#   source "$(dirname "$0")/lib/google-api.sh"
#   gmail_search "subject:invoice" 5
#   gmail_get_message "19d2282cb62f00c0"
#   gmail_get_snippet "19d2282cb62f00c0"

GOOGLE_TOKEN_VAULT_URL="${GOOGLE_TOKEN_VAULT_URL:-http://localhost:8750/api/v1}"
GMAIL_API_URL="https://gmail.googleapis.com/gmail/v1/users/me"
CALENDAR_API_URL="https://www.googleapis.com/calendar/v3"

# --- Token helpers ---

# Get a fresh Google access token from the vault
# Usage: google_get_token [user] [scope]
google_get_token() {
  local user="${1:-david}"
  local scope="${2:-gmail}"
  curl -sf "${GOOGLE_TOKEN_VAULT_URL}/token/${user}?scope=${scope}" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" 2>/dev/null \
    | jq -r '.access_token // empty'
}

# --- Gmail helpers ---

# Search Gmail messages
# Usage: gmail_search <query> [max_results] [user]
# Returns: JSON array of {id, threadId}
gmail_search() {
  local query="$1"
  local max_results="${2:-10}"
  local user="${3:-david}"
  local token
  token=$(google_get_token "$user" gmail)
  if [[ -z "$token" ]]; then
    echo "ERROR: Failed to get Gmail token for $user" >&2
    return 1
  fi
  local encoded_query
  encoded_query=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "$query" 2>/dev/null || echo "$query")
  curl -sf -H "Authorization: Bearer $token" \
    "${GMAIL_API_URL}/messages?q=${encoded_query}&maxResults=${max_results}" 2>/dev/null
}

# Get a full Gmail message
# Usage: gmail_get_message <message_id> [user] [format]
# format: full (default), metadata, minimal, raw
gmail_get_message() {
  local message_id="$1"
  local user="${2:-david}"
  local format="${3:-full}"
  local token
  token=$(google_get_token "$user" gmail)
  if [[ -z "$token" ]]; then
    echo "ERROR: Failed to get Gmail token for $user" >&2
    return 1
  fi
  curl -sf -H "Authorization: Bearer $token" \
    "${GMAIL_API_URL}/messages/${message_id}?format=${format}" 2>/dev/null
}

# Get just the snippet (preview text) of a message
# Usage: gmail_get_snippet <message_id> [user]
gmail_get_snippet() {
  local message_id="$1"
  local user="${2:-david}"
  gmail_get_message "$message_id" "$user" "metadata" | jq -r '.snippet // empty'
}

# Get message headers (From, To, Subject, Date)
# Usage: gmail_get_headers <message_id> [user]
gmail_get_headers() {
  local message_id="$1"
  local user="${2:-david}"
  gmail_get_message "$message_id" "$user" "metadata" \
    | jq '[.payload.headers[] | select(.name == "From" or .name == "To" or .name == "Subject" or .name == "Date") | {(.name): .value}] | add'
}

# Search and return snippets (quick overview)
# Usage: gmail_search_snippets <query> [max_results] [user]
gmail_search_snippets() {
  local query="$1"
  local max_results="${2:-5}"
  local user="${3:-david}"
  local token
  token=$(google_get_token "$user" gmail)
  if [[ -z "$token" ]]; then
    echo "ERROR: Failed to get Gmail token for $user" >&2
    return 1
  fi
  local results
  results=$(gmail_search "$query" "$max_results" "$user")
  local ids
  ids=$(echo "$results" | jq -r '.messages[]?.id // empty' 2>/dev/null)
  if [[ -z "$ids" ]]; then
    echo '[]'
    return 0
  fi
  local output="["
  local first=true
  while IFS= read -r mid; do
    [[ -z "$mid" ]] && continue
    local msg
    msg=$(curl -sf -H "Authorization: Bearer $token" \
      "${GMAIL_API_URL}/messages/${mid}?format=metadata" 2>/dev/null)
    local snippet subject from date
    snippet=$(echo "$msg" | jq -r '.snippet // ""')
    subject=$(echo "$msg" | jq -r '[.payload.headers[] | select(.name=="Subject")][0].value // ""')
    from=$(echo "$msg" | jq -r '[.payload.headers[] | select(.name=="From")][0].value // ""')
    date=$(echo "$msg" | jq -r '[.payload.headers[] | select(.name=="Date")][0].value // ""')
    $first || output+=","
    first=false
    output+=$(jq -nc --arg id "$mid" --arg subject "$subject" --arg from "$from" --arg date "$date" --arg snippet "$snippet" \
      '{id:$id, subject:$subject, from:$from, date:$date, snippet:$snippet}')
  done <<< "$ids"
  output+="]"
  echo "$output"
}

# Count Gmail messages matching a query (paginates for accurate count)
# Usage: gmail_count <query> [user]
gmail_count() {
  local query="$1"
  local user="${2:-david}"
  local token
  token=$(google_get_token "$user" gmail)
  if [[ -z "$token" ]]; then
    echo "ERROR: Failed to get Gmail token for $user" >&2
    return 1
  fi
  local encoded_query
  encoded_query=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "$query" 2>/dev/null || echo "$query")
  local total=0
  local page_token=""
  while true; do
    local url="${GMAIL_API_URL}/messages?q=${encoded_query}&maxResults=500"
    [[ -n "$page_token" ]] && url+="&pageToken=${page_token}"
    local result
    result=$(curl -sf -H "Authorization: Bearer $token" "$url" 2>/dev/null)
    local page_count
    page_count=$(echo "$result" | jq '.messages | length // 0' 2>/dev/null)
    total=$((total + page_count))
    page_token=$(echo "$result" | jq -r '.nextPageToken // empty' 2>/dev/null)
    [[ -z "$page_token" ]] && break
  done
  echo "$total"
}

# --- Calendar helpers ---

# List calendar events in a time range
# Usage: calendar_list_events [time_min] [time_max] [max_results] [calendar_id] [user]
# time_min/time_max: RFC3339 (e.g. 2026-03-24T00:00:00Z). Defaults to today.
calendar_list_events() {
  local time_min="${1:-$(date -u +%Y-%m-%dT00:00:00Z)}"
  local time_max="${2:-$(date -u -d '+7 days' +%Y-%m-%dT23:59:59Z)}"
  local max_results="${3:-25}"
  local calendar_id="${4:-primary}"
  local user="${5:-david}"
  local token
  token=$(google_get_token "$user" calendar)
  if [[ -z "$token" ]]; then
    echo "ERROR: Failed to get Calendar token for $user" >&2
    return 1
  fi
  local encoded_cal
  encoded_cal=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "$calendar_id" 2>/dev/null || echo "$calendar_id")
  curl -sf -H "Authorization: Bearer $token" \
    "${CALENDAR_API_URL}/calendars/${encoded_cal}/events?timeMin=${time_min}&timeMax=${time_max}&maxResults=${max_results}&singleEvents=true&orderBy=startTime" 2>/dev/null
}

# Get a single calendar event
# Usage: calendar_get_event <event_id> [calendar_id] [user]
calendar_get_event() {
  local event_id="$1"
  local calendar_id="${2:-primary}"
  local user="${3:-david}"
  local token
  token=$(google_get_token "$user" calendar)
  if [[ -z "$token" ]]; then
    echo "ERROR: Failed to get Calendar token for $user" >&2
    return 1
  fi
  local encoded_cal
  encoded_cal=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "$calendar_id" 2>/dev/null || echo "$calendar_id")
  curl -sf -H "Authorization: Bearer $token" \
    "${CALENDAR_API_URL}/calendars/${encoded_cal}/events/${event_id}" 2>/dev/null
}

# Get today's events (convenience wrapper)
# Usage: calendar_today [calendar_id] [user]
calendar_today() {
  local calendar_id="${1:-primary}"
  local user="${2:-david}"
  local today_start
  today_start=$(date -u +%Y-%m-%dT00:00:00Z)
  local today_end
  today_end=$(date -u +%Y-%m-%dT23:59:59Z)
  calendar_list_events "$today_start" "$today_end" 25 "$calendar_id" "$user"
}
