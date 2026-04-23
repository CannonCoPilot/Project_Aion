"""
Pulse MCP Server — Task Management for Project Aion
Provides Jarvis with MCP tools to interact with the Pulse REST API.
Enables cross-Archon task visibility between Jarvis and AIfred.
"""
import json
import os
import urllib.request
import urllib.error
from typing import Optional

from fastmcp import FastMCP

PULSE_URL = os.environ.get("PULSE_URL", "http://localhost:8700/api/v1")
PULSE_TOKEN = os.environ.get("PULSE_SERVICE_TOKEN", "")

mcp = FastMCP("jarvis-pulse", instructions="Pulse task management for Project Aion. Use these tools to create, list, update, and close tasks shared between Jarvis and AIfred Archons.")


def _request(method: str, path: str, data: dict = None) -> dict:
    """Make HTTP request to Pulse API."""
    url = f"{PULSE_URL}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=body, method=method,
        headers={
            "Content-Type": "application/json",
            "X-Service-Token": PULSE_TOKEN,
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else str(e)
        return {"error": body, "status": e.code}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def pulse_list(
    status: Optional[str] = None,
    label: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 20,
) -> str:
    """List tasks from Pulse with optional filters.

    Args:
        status: Filter by status (open, in_progress, closed, deferred)
        label: Filter by label (e.g. "agent:jarvis", "domain:infrastructure", "auto:ready")
        search: Search in title and description
        limit: Max results (default 20)
    """
    params = []
    if status:
        params.append(f"status={status}")
    if label:
        params.append(f"label={label}")
    if search:
        params.append(f"search={search}")
    params.append(f"limit={limit}")
    query = "&".join(params)
    result = _request("GET", f"/tasks?{query}")
    tasks = result.get("tasks", [])
    if not tasks:
        return "No tasks found matching filters."
    lines = [f"**{len(tasks)} tasks** (of {result.get('total', '?')} total)\n"]
    for t in tasks:
        labels_str = ", ".join(t.get("labels", []))
        status_str = t.get("status", "?")
        lines.append(f"- **{t['id']}** [{status_str}] {t['title']}")
        if labels_str:
            lines.append(f"  Labels: {labels_str}")
    return "\n".join(lines)


@mcp.tool()
def pulse_show(task_id: str) -> str:
    """Show full details of a specific task.

    Args:
        task_id: The task ID (e.g. AION-abc12345)
    """
    result = _request("GET", f"/tasks/{task_id}")
    if "error" in result:
        return f"Error: {result['error']}"
    t = result
    lines = [
        f"# {t['id']}: {t['title']}",
        f"**Status**: {t.get('status')} | **Priority**: {t.get('priority')}",
        f"**Labels**: {', '.join(t.get('labels', []))}",
        f"**Created**: {t.get('created_at')} by {t.get('created_by')}",
    ]
    if t.get("claimed_by"):
        lines.append(f"**Claimed by**: {t['claimed_by']}")
    if t.get("description"):
        lines.append(f"\n**Description**:\n{t['description']}")
    if t.get("notes"):
        lines.append(f"\n**Notes**:\n{t['notes']}")
    if t.get("closed_reason"):
        lines.append(f"\n**Closed**: {t['closed_at']} — {t['closed_reason']}")
    return "\n".join(lines)


@mcp.tool()
def pulse_create(
    title: str,
    description: str = "",
    priority: str = "medium",
    labels: str = "agent:jarvis",
) -> str:
    """Create a new task in Pulse.

    Args:
        title: Task title
        description: Detailed description
        priority: Priority level (low, medium, high, critical)
        labels: Comma-separated labels (default: "agent:jarvis"). Always include agent:jarvis for Jarvis-created tasks.
    """
    label_list = [l.strip() for l in labels.split(",") if l.strip()]
    if "agent:jarvis" not in label_list and "agent:aifred" not in label_list:
        label_list.append("agent:jarvis")
    result = _request("POST", "/tasks", {
        "title": title,
        "description": description,
        "priority": priority,
        "labels": label_list,
        "actor": "jarvis",
    })
    if "error" in result:
        return f"Error creating task: {result['error']}"
    return f"Created task **{result['id']}**: {title}\nLabels: {', '.join(label_list)}"


@mcp.tool()
def pulse_update(
    task_id: str,
    status: Optional[str] = None,
    labels_add: Optional[str] = None,
    labels_remove: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """Update an existing task.

    Args:
        task_id: The task ID to update
        status: New status (open, in_progress, closed, deferred)
        labels_add: Comma-separated labels to add
        labels_remove: Comma-separated labels to remove
        notes: Notes to append to the task
    """
    results = []

    if status:
        r = _request("PATCH", f"/tasks/{task_id}", {"status": status, "actor": "jarvis"})
        results.append(f"Status → {status}")

    if labels_add:
        add_list = [l.strip() for l in labels_add.split(",") if l.strip()]
        r = _request("POST", f"/tasks/{task_id}/labels", {"labels": add_list, "actor": "jarvis"})
        results.append(f"Added labels: {', '.join(add_list)}")

    if labels_remove:
        for label in labels_remove.split(","):
            label = label.strip()
            if label:
                r = _request("DELETE", f"/tasks/{task_id}/labels/{label}?actor=jarvis")
                results.append(f"Removed label: {label}")

    if notes:
        r = _request("PATCH", f"/tasks/{task_id}", {"append_notes": notes, "actor": "jarvis"})
        results.append("Notes appended")

    if not results:
        return "No updates specified."
    return f"Updated **{task_id}**:\n" + "\n".join(f"- {r}" for r in results)


@mcp.tool()
def pulse_close(task_id: str, reason: str = "Completed") -> str:
    """Close a task with a reason.

    Args:
        task_id: The task ID to close
        reason: Reason for closing
    """
    result = _request("POST", f"/tasks/{task_id}/close", {
        "reason": reason,
        "actor": "jarvis",
    })
    if "error" in result:
        return f"Error closing task: {result['error']}"
    return f"Closed **{task_id}**: {reason}"


@mcp.tool()
def pulse_stats() -> str:
    """Show task statistics — counts by status and top labels."""
    result = _request("GET", "/tasks?limit=1000")
    tasks = result.get("tasks", [])
    total = result.get("total", len(tasks))

    status_counts = {}
    label_counts = {}
    for t in tasks:
        s = t.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
        for l in t.get("labels", []):
            label_counts[l] = label_counts.get(l, 0) + 1

    lines = [f"**Total tasks**: {total}\n"]
    lines.append("**By status**:")
    for s, c in sorted(status_counts.items(), key=lambda x: -x[1]):
        lines.append(f"  {s}: {c}")

    lines.append("\n**Top labels**:")
    for l, c in sorted(label_counts.items(), key=lambda x: -x[1])[:15]:
        lines.append(f"  {l}: {c}")

    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run(transport="stdio")
