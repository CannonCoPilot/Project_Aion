#!/usr/bin/env bash
# github-ops.sh — Shared GitHub operations library for Nexus
#
# Functions for interacting with GitHub Issues via the `gh` CLI.
# Sourced by: github-issue-poller.sh, bug-fixer persona jobs
#
# Prerequisites: gh CLI authenticated (`gh auth status`)

# Guard against double-sourcing
[ -n "${_GITHUB_OPS_SH_LOADED:-}" ] && return 0
_GITHUB_OPS_SH_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

_GH_OPS_PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
_GH_OPS_REPOS_CONFIG="$_GH_OPS_PROJECT_DIR/.claude/jobs/config/github-repos.yaml"

# ============================================================================
# Issue Operations
# ============================================================================

# List open issues for a repo as JSON
# Usage: gh_list_issues <owner> <repo> [exclude_labels_csv]
gh_list_issues() {
    local owner="$1" repo="$2" exclude_csv="${3:-}"
    local -a gh_args
    gh_args=(
        --repo "$owner/$repo"
        --state open
        --json "number,title,body,labels,createdAt,author,url"
        --limit 50
    )

    if [ -n "$exclude_csv" ]; then
        IFS=',' read -ra labels <<< "$exclude_csv"
        for label in "${labels[@]}"; do
            label=$(echo "$label" | xargs)
            [ -n "$label" ] && gh_args+=(--label "!$label")
        done
    fi

    gh issue list "${gh_args[@]}" 2>/dev/null || echo "[]"
}

# Get a single issue's details
# Usage: gh_get_issue <owner> <repo> <issue_number>
gh_get_issue() {
    local owner="$1" repo="$2" number="$3"

    gh issue view "$number" \
        --repo "$owner/$repo" \
        --json number,title,body,labels,createdAt,author,url,comments \
        2>/dev/null || echo "{}"
}

# Comment on a GitHub issue
# Usage: gh_comment_issue <owner> <repo> <issue_number> <comment_body>
gh_comment_issue() {
    local owner="$1" repo="$2" number="$3" body="$4"

    gh issue comment "$number" \
        --repo "$owner/$repo" \
        --body "$body" 2>/dev/null
}

# ============================================================================
# Response Templates
# ============================================================================

# Generate an acknowledgment comment for a new issue
# Usage: gh_template_acknowledged <pulse_task_id>
gh_template_acknowledged() {
    local task_id="$1"
    cat <<EOF
Thanks for reporting this issue! It's been picked up by our automated triage system.

**Tracking**: \`$task_id\`
**Status**: Intake — queued for evaluation

We'll update this issue as progress is made.
EOF
}

# Generate a comment when investigation starts
# Usage: gh_template_investigating <pulse_task_id>
gh_template_investigating() {
    local task_id="$1"
    cat <<EOF
This issue is now being investigated.

**Tracking**: \`$task_id\`
**Status**: In Progress
EOF
}

# Generate a comment when a fix PR is submitted
# Usage: gh_template_fix_submitted <pulse_task_id> <pr_url>
gh_template_fix_submitted() {
    local task_id="$1" pr_url="$2"
    cat <<EOF
A fix has been submitted for this issue.

**Pull Request**: $pr_url
**Tracking**: \`$task_id\`

The PR will be reviewed before merging.
EOF
}

# Generate a comment when the issue is resolved
# Usage: gh_template_resolved <pulse_task_id> <pr_url>
gh_template_resolved() {
    local task_id="$1" pr_url="${2:-}"
    local pr_line=""
    [ -n "$pr_url" ] && pr_line="**Fix**: $pr_url"

    cat <<EOF
This issue has been resolved.

$pr_line
**Tracking**: \`$task_id\`

If you're still experiencing this issue, please reopen or file a new report.
EOF
}

# ============================================================================
# Config Helpers
# ============================================================================

# Read repo config and output as JSON (requires yq)
# Usage: gh_read_repos_config
gh_read_repos_config() {
    if command -v yq &>/dev/null; then
        yq -o=json "$_GH_OPS_REPOS_CONFIG" 2>/dev/null
    else
        # Fallback: parse YAML manually for the simple structure
        echo "[warn] yq not found, using python3 fallback" >&2
        python3 -c "
import yaml, json, sys
with open('$_GH_OPS_REPOS_CONFIG') as f:
    data = yaml.safe_load(f)
print(json.dumps(data))
" 2>/dev/null || echo "{}"
    fi
}
