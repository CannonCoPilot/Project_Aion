#!/usr/bin/env bash
# Pulse Shell Aliases for AIFred-Pro
# Source this file in ~/.bashrc or ~/.zshrc:
#   source scripts/pulse-aliases.sh
#
# Requires: pulse CLI at ~/.local/bin/pulse (points to localhost:8700 by default)
# Override instance: export PULSE_URL=http://your-pulse:8700

# ========================================
# Domain Views
# ========================================
alias p-infra='pulse list --status open --label domain:infrastructure'
alias p-coding='pulse list --status open --label domain:coding'
alias p-creative='pulse list --status open --label domain:creative'
alias p-research='pulse list --status open --label domain:research'

# ========================================
# Project Views
# ========================================
alias p-aiprojects='pulse list --status open --label project:aiprojects'
alias p-aifred='pulse list --status open --label project:aifred'
alias p-ciso='pulse list --status open --label project:ciso-expert'

# ========================================
# Status Views
# ========================================
alias p-active='pulse list --status in_progress'
alias p-all='pulse list --status open'
alias p-next='pulse ready'
alias p-done='pulse list --status closed'

# ========================================
# Priority Views
# ========================================
alias p-p1='pulse list --status open -p 1'
alias p-p2='pulse list --status open -p 2'
alias p-urgent='pulse list --status open -p 1'

# ========================================
# Pipeline Views
# ========================================
alias p-queue='pulse list --status open --label stage:queue'
alias p-review='pulse list --status open --label stage:review'
alias p-waiting='pulse list --status open --label waiting:david'
alias p-approved='pulse list --status open --label pipeline:approved'
alias p-ready='pulse list --status open --label auto:ready'

# ========================================
# Quick Actions
# ========================================
# Usage: p-add "Task title" [domain] [priority]
p-add() {
    local title="$1"
    local domain="${2:-ad-hoc}"
    local priority="${3:-2}"
    local project="${4:-aiprojects}"

    if [ -z "$title" ]; then
        echo "Usage: p-add 'Task title' [domain] [priority 1-4] [project]"
        echo "  Domains: infrastructure, coding, creative, research"
        echo "  Priority: 1=HIGH, 2=MEDIUM, 3=LOW, 4=Backlog"
        return 1
    fi

    pulse create "$title" --priority "$priority" \
        --label "domain:${domain},project:${project},source:ad-hoc"
}

# Quick claim: p-claim <id>
p-claim() {
    pulse update "$1" --status in_progress --claim
    echo "Claimed $1"
}

# Quick close: p-close <id> "reason"
p-close() {
    pulse close "$1" --reason "${2:-Completed}"
    echo "Closed $1"
}

# Show Pulse instance health
p-health() {
    local url="${PULSE_URL:-http://localhost:8700}"
    curl -sf "${url}/api/v1/health" | python3 -m json.tool 2>/dev/null \
        || echo "Pulse unreachable at ${url}"
}

echo "Pulse aliases loaded. Try: p-all, p-next, p-waiting, p-add 'Task' domain priority"
