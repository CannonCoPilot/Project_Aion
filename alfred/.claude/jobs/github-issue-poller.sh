#!/usr/bin/env bash
# github-issue-poller.sh — Deterministic GitHub issue intake for Nexus
#
# Polls configured GitHub repos for new issues and creates Pulse tasks.
# Zero LLM cost — runs entirely in pre_check (same pattern as pipeline-watchdog.sh).
#
# Flow:
#   1. Read repo config from github-repos.yaml
#   2. For each enabled repo, fetch open issues via `gh`
#   3. Compare against seen-issues state file
#   4. For new issues: create Pulse task, comment on GitHub issue
#   5. Update state file
#
# Security: All GitHub-sourced data (titles, bodies) is treated as untrusted.
# Task creation uses the Pulse HTTP API with JSON payloads (no shell interpolation).
# Issue content is sanitized before storage.
#
# State file: .claude/jobs/state/github-issues-seen.json
# Config: .claude/jobs/config/github-repos.yaml
# Log: stdout (captured by dispatcher)
#
# Max 5 new issues per cycle to prevent pipeline flooding.

set -euo pipefail

export PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Ensure state file exists
if [ ! -f "$PROJECT_DIR/.claude/jobs/state/github-issues-seen.json" ]; then
    echo '{"seen":{}}' > "$PROJECT_DIR/.claude/jobs/state/github-issues-seen.json"
fi

# Check gh CLI is available and authenticated
if ! command -v gh &>/dev/null; then
    echo "[github-poller] ERROR: gh CLI not found"
    exit 1
fi

if ! gh auth status &>/dev/null 2>&1; then
    echo "[github-poller] ERROR: gh not authenticated"
    exit 1
fi

# ============================================================================
# Main processing — done entirely in Python for safe string handling.
# GitHub-sourced data never touches shell interpolation.
# ============================================================================

python3 << 'PYTHON_SCRIPT'
import yaml, json, subprocess, sys, os
from datetime import datetime, timezone

PROJECT_DIR = os.environ.get("PROJECT_DIR", "${PROJECT_DIR}")
STATE_FILE = os.path.join(PROJECT_DIR, ".claude/jobs/state/github-issues-seen.json")
CONFIG_FILE = os.path.join(PROJECT_DIR, ".claude/jobs/config/github-repos.yaml")
def _resolve_pulse_api():
    explicit = os.environ.get("PULSE_API_URL") or os.environ.get("PULSE_API")
    if explicit:
        return explicit
    base = os.environ.get("PULSE_URL", "http://localhost:8700").rstrip("/")
    return base if base.endswith("/api/v1") else f"{base}/api/v1"

PULSE_API = _resolve_pulse_api()
PULSE_SERVICE_TOKEN = os.environ.get("PULSE_SERVICE_TOKEN", "")
MAX_NEW = 5

def log(msg):
    print(f"[github-poller] {msg}", flush=True)

def sanitize_text(text, max_len=500):
    """Strip control chars and limit length. GitHub data is untrusted."""
    if not text:
        return ""
    # Remove null bytes and control chars (keep newlines, tabs)
    cleaned = "".join(c for c in text if c == '\n' or c == '\t' or (ord(c) >= 32 and ord(c) != 127))
    return cleaned[:max_len]

def sanitize_title(title, max_len=200):
    """Sanitize for use as a task title — single line, no special chars."""
    if not title:
        return "Untitled issue"
    cleaned = sanitize_text(title, max_len)
    # Single line only
    cleaned = cleaned.replace('\n', ' ').replace('\r', ' ').strip()
    return cleaned or "Untitled issue"

def gh_list_bug_issues(owner, repo):
    """Fetch open bug issues via gh CLI. Returns parsed JSON list."""
    try:
        result = subprocess.run(
            ["gh", "issue", "list",
             "--repo", f"{owner}/{repo}",
             "--state", "open",
             "--label", "bug",
             "--json", "number,title,body,createdAt,url",
             "--limit", "20"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        log(f"WARN: Failed to fetch issues from {owner}/{repo}: {e}")
    return []

def gh_comment(owner, repo, number, body):
    """Comment on a GitHub issue."""
    try:
        subprocess.run(
            ["gh", "issue", "comment", str(number),
             "--repo", f"{owner}/{repo}",
             "--body", body],
            capture_output=True, text=True, timeout=15
        )
    except Exception as e:
        log(f"WARN: Failed to comment on {owner}/{repo}#{number}: {e}")

def pulse_create_task(title, project_label, owner, repo, number, url, body_preview):
    """Create a Pulse task via HTTP API. No shell interpolation of untrusted data."""
    import urllib.request

    safe_title = sanitize_title(title)
    safe_body = sanitize_text(body_preview, 300)

    description = (
        f"GitHub Issue: {url}\n\n"
        f"**Repository**: {owner}/{repo}\n"
        f"**Issue**: #{number}\n"
        f"**Reporter**: (see GitHub issue)\n\n"
        f"## Description\n{safe_body}\n\n"
        f"---\n"
        f"*Auto-created by github-issue-poller from {owner}/{repo}#{number}*"
    )

    payload = {
        "title": f"Bug: {safe_title}",
        "type": "bug",
        "priority": 2,
        "labels": [
            "type:bug", "source:github",
            f"project:{project_label}",
            "stage:intake", "domain:coding"
        ],
        "description": description,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{PULSE_API}/tasks",
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Service-Token": PULSE_SERVICE_TOKEN,
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            return result.get("id") or result.get("task_id") or result.get("beads_id")
    except Exception as e:
        log(f"WARN: Pulse API task creation failed: {e}")
        # Fallback to CLI with sanitized, quoted arguments
        try:
            result = subprocess.run(
                ["pulse", "create", f"Bug: {safe_title}",
                 "-t", "bug", "-p", "2",
                 "-l", f"type:bug,source:github,project:{project_label},stage:intake,domain:coding",
                 "-d", description],
                capture_output=True, text=True, timeout=15
            )
            import re
            match = re.search(r'AIProjects-[a-z0-9]+', result.stdout)
            if match:
                return match.group(0)
        except Exception as e2:
            log(f"WARN: Pulse CLI fallback also failed: {e2}")
    return None

# --- Main ---

# Load config
with open(CONFIG_FILE) as f:
    config = yaml.safe_load(f)

repos = [r for r in config.get("repos", []) if r.get("enabled", True)]
if not repos:
    log("No enabled repos in config")
    sys.exit(0)

# Load seen state
with open(STATE_FILE) as f:
    seen_data = json.load(f)
seen = seen_data.get("seen", {})

log(f"Checking {len(repos)} repos...")

new_count = 0
total_checked = 0

for repo_config in repos:
    owner = repo_config["owner"]
    repo = repo_config["repo"]
    project_label = repo_config.get("project_label", "unknown")

    log(f"Checking {owner}/{repo}...")
    issues = gh_list_bug_issues(owner, repo)
    total_checked += len(issues)

    for issue in issues:
        if new_count >= MAX_NEW:
            log(f"Hit max {MAX_NEW} new issues per cycle, deferring rest")
            break

        number = issue.get("number")
        if not isinstance(number, int):
            continue

        seen_key = f"{owner}_{repo}_{number}"
        if seen_key in seen:
            continue

        title = issue.get("title", "")
        body = issue.get("body", "") or ""
        url = issue.get("url", "")
        body_preview = body[:300]

        safe_title_log = sanitize_title(title, 80)
        log(f"New issue: {owner}/{repo}#{number} — {safe_title_log}")

        task_id = pulse_create_task(title, project_label, owner, repo, number, url, body_preview)

        if task_id:
            log(f"Created Pulse task: {task_id}")

            # Comment on GitHub issue (template is safe — only our task_id)
            comment = (
                f"Thanks for reporting this issue! It's been picked up by our automated triage system.\n\n"
                f"**Tracking**: `{task_id}`\n"
                f"**Status**: Intake — queued for evaluation\n\n"
                f"We'll update this issue as progress is made."
            )
            gh_comment(owner, repo, number, comment)

            # Update seen state
            seen[seen_key] = {
                "task_id": task_id,
                "url": url,
                "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            new_count += 1
        else:
            log(f"WARN: Failed to create task for {owner}/{repo}#{number}")

    if new_count >= MAX_NEW:
        break

# Write updated state
seen_data["seen"] = seen
with open(STATE_FILE, "w") as f:
    json.dump(seen_data, f, indent=2)

log(f"Done. Checked {total_checked} issues, created {new_count} new tasks.")
PYTHON_SCRIPT
