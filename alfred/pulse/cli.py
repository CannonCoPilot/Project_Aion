#!/usr/bin/env python3
"""Pulse CLI — lightweight wrapper around the Pulse REST API."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = os.environ.get("PULSE_URL", "http://localhost:8700") + "/api/v1"


def api(method, path, data=None, params=None):
    url = BASE_URL + path
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None}, doseq=True)
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        try:
            err = json.loads(err).get("detail", err)
        except Exception:
            pass
        print(f"Error {e.code}: {err}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Cannot reach Pulse at {BASE_URL}: {e.reason}", file=sys.stderr)
        sys.exit(1)


# ── Formatters ──────────────────────────────────────────────────────────────

def fmt_task(t, verbose=False):
    status = t.get("status", "?")
    pri = t.get("priority", "?")
    if isinstance(pri, str):
        pri_map = {"critical": 1, "high": 1, "medium": 2, "low": 3}
        pri = pri_map.get(pri, pri)
    tid = t["id"]
    title = t["title"]
    labels = ",".join(t.get("labels", []))
    line = f"  {tid}  [{status}]  P{pri}  {title}"
    if labels:
        line += f"  ({labels})"
    if verbose and t.get("description"):
        line += f"\n    {t['description'][:120]}"
    return line


# ── Commands ────────────────────────────────────────────────────────────────

def cmd_list(args):
    params = {"limit": args.limit}
    if args.status:
        params["status"] = args.status
    if args.label:
        params["label"] = args.label
    if args.workspace:
        params["workspace"] = args.workspace
    if args.search:
        params["search"] = args.search
    if args.priority:
        params["priority"] = args.priority

    result = api("GET", "/tasks", params=params)
    tasks = result.get("tasks", result.get("items", []))
    total = result.get("total", len(tasks))

    if args.json:
        print(json.dumps(result, indent=2))
        return

    if not tasks:
        print("  No tasks found.")
        return

    print(f"  {total} task(s):\n")
    for t in tasks:
        print(fmt_task(t))
    print()


def cmd_show(args):
    result = api("GET", f"/tasks/{args.task_id}")
    if args.json:
        print(json.dumps(result, indent=2))
        return
    t = result
    print(f"\n  {t['id']}  [{t.get('status')}]  P{t.get('priority')}")
    print(f"  Title:   {t['title']}")
    if t.get("description"):
        print(f"  Desc:    {t['description']}")
    if t.get("labels"):
        print(f"  Labels:  {', '.join(t['labels'])}")
    if t.get("notes"):
        print(f"  Notes:   {t['notes']}")
    if t.get("claimed_by"):
        print(f"  Claimed: {t['claimed_by']}")
    print(f"  Created: {t.get('created_at', '?')}")
    if t.get("closed_at"):
        print(f"  Closed:  {t['closed_at']}  Reason: {t.get('closed_reason', '')}")
    print()


def _priority_str(p):
    """Convert numeric priority to string: 1=high, 2=medium, 3=low, 4=backlog."""
    if p is None:
        return "medium"
    mapping = {1: "high", 2: "medium", 3: "low", 4: "backlog"}
    if isinstance(p, int):
        return mapping.get(p, "medium")
    return str(p)


def cmd_create(args):
    data = {"title": args.title, "priority": _priority_str(args.priority)}
    if args.description:
        data["description"] = args.description
    if args.label:
        data["labels"] = [l.strip() for lbl in args.label for l in lbl.split(",")]
    if args.workspace:
        data["workspace"] = args.workspace
    if args.actor:
        data["created_by"] = args.actor

    result = api("POST", "/tasks", data=data)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"  Created: {result.get('id', '?')}  {args.title}")


def cmd_update(args):
    data = {}
    if args.status:
        data["status"] = args.status
    if args.priority:
        data["priority"] = args.priority
    if args.notes:
        data["notes"] = args.notes
    if args.append_notes:
        data["append_notes"] = args.append_notes
    if args.assignee:
        data["assignee"] = args.assignee
    if args.claim:
        data["claim"] = True
    if not data:
        print("Nothing to update.", file=sys.stderr)
        return

    result = api("PATCH", f"/tasks/{args.task_id}", data=data)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"  Updated: {args.task_id}")


def cmd_close(args):
    data = {"reason": args.reason}
    if args.actor:
        data["actor"] = args.actor
    result = api("POST", f"/tasks/{args.task_id}/close", data=data)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"  Closed: {args.task_id}  Reason: {args.reason}")


def cmd_ready(args):
    result = api("GET", "/tasks/ready")
    tasks = result.get("tasks", result.get("items", []))
    if args.json:
        print(json.dumps(result, indent=2))
        return
    if not tasks:
        print("  No ready tasks.")
        return
    print(f"  {len(tasks)} ready task(s):\n")
    for t in tasks:
        print(fmt_task(t))
    print()


def cmd_stats(args):
    result = api("GET", "/tasks/stats")
    if args.json:
        print(json.dumps(result, indent=2))
        return
    for key, val in result.items():
        if isinstance(val, dict):
            print(f"\n  {key}:")
            for k, v in val.items():
                print(f"    {k}: {v}")
        else:
            print(f"  {key}: {val}")
    print()


def cmd_label(args):
    if args.action == "add":
        labels = [l.strip() for lbl in args.labels for l in lbl.split(",")]
        result = api("POST", f"/tasks/{args.task_id}/labels", data={"labels": labels})
        print(f"  Added labels to {args.task_id}: {', '.join(labels)}")
    elif args.action == "remove":
        for label in args.labels:
            api("DELETE", f"/tasks/{args.task_id}/labels/{label}")
        print(f"  Removed labels from {args.task_id}: {', '.join(args.labels)}")


def cmd_comments(args):
    if args.action == "add":
        data = {"comment": args.text}
        if args.actor:
            data["actor"] = args.actor
        api("POST", f"/tasks/{args.task_id}/comments", data=data)
        print(f"  Comment added to {args.task_id}")
    else:
        result = api("GET", f"/tasks/{args.task_id}/comments")
        comments = result if isinstance(result, list) else result.get("comments", [])
        if not comments:
            print("  No comments.")
            return
        for c in comments:
            print(f"  [{c.get('created_at', '?')}] {c.get('actor', '?')}: {c.get('comment', c.get('text', ''))}")


def cmd_health(args):
    result = api("GET", "/health")
    print(json.dumps(result, indent=2))


def cmd_defer(args):
    data = {"defer_until": args.until}
    api("PATCH", f"/tasks/{args.task_id}", data=data)
    print(f"  Deferred {args.task_id} until {args.until}")


# ── Parser ──────────────────────────────────────────────────────────────────

def build_parser():
    p = argparse.ArgumentParser(prog="pulse", description="Pulse task management CLI")
    p.add_argument("--json", action="store_true", help="JSON output")
    p.add_argument("--actor", help="Actor for audit trail")
    sub = p.add_subparsers(dest="command")

    # list
    ls = sub.add_parser("list", help="List tasks")
    ls.add_argument("--status", "-s")
    ls.add_argument("--label", "-l", action="append")
    ls.add_argument("--workspace", "--project", "-w")
    ls.add_argument("--search")
    ls.add_argument("--priority", "-p", type=int)
    ls.add_argument("--limit", type=int, default=50)
    ls.add_argument("--json", action="store_true")

    # show
    sh = sub.add_parser("show", help="Show task details")
    sh.add_argument("task_id")
    sh.add_argument("--json", action="store_true")

    # create
    cr = sub.add_parser("create", help="Create task")
    cr.add_argument("title")
    cr.add_argument("--priority", "-p", type=int)
    cr.add_argument("--label", "-l", action="append")
    cr.add_argument("--description", "-d")
    cr.add_argument("--workspace", "--project", "-w")
    cr.add_argument("--json", action="store_true")

    # update
    up = sub.add_parser("update", help="Update task")
    up.add_argument("task_id")
    up.add_argument("--status", "-s")
    up.add_argument("--priority", "-p", type=int)
    up.add_argument("--notes")
    up.add_argument("--append-notes")
    up.add_argument("--assignee")
    up.add_argument("--claim", action="store_true")
    up.add_argument("--json", action="store_true")

    # close
    cl = sub.add_parser("close", help="Close task")
    cl.add_argument("task_id")
    cl.add_argument("--reason", "-r", required=True)
    cl.add_argument("--json", action="store_true")

    # ready
    rd = sub.add_parser("ready", help="Show ready tasks")
    rd.add_argument("--json", action="store_true")

    # stats
    st = sub.add_parser("stats", help="Task statistics")
    st.add_argument("--json", action="store_true")

    # label
    lb = sub.add_parser("label", help="Manage labels")
    lb_sub = lb.add_subparsers(dest="action")
    lb_add = lb_sub.add_parser("add")
    lb_add.add_argument("task_id")
    lb_add.add_argument("labels", nargs="+")
    lb_rm = lb_sub.add_parser("remove")
    lb_rm.add_argument("task_id")
    lb_rm.add_argument("labels", nargs="+")

    # comments
    cm = sub.add_parser("comments", help="Manage comments")
    cm_sub = cm.add_subparsers(dest="action")
    cm_add = cm_sub.add_parser("add")
    cm_add.add_argument("task_id")
    cm_add.add_argument("text")
    cm_list = cm_sub.add_parser("list")
    cm_list.add_argument("task_id")

    # defer
    df = sub.add_parser("defer", help="Defer task")
    df.add_argument("task_id")
    df.add_argument("--until", required=True)

    # health
    sub.add_parser("health", help="Check Pulse health")

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    cmds = {
        "list": cmd_list, "show": cmd_show, "create": cmd_create,
        "update": cmd_update, "close": cmd_close, "ready": cmd_ready,
        "stats": cmd_stats, "label": cmd_label, "comments": cmd_comments,
        "defer": cmd_defer, "health": cmd_health,
    }
    cmds[args.command](args)


if __name__ == "__main__":
    main()
