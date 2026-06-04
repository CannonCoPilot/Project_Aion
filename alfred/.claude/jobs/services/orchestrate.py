#!/usr/bin/env python3
"""
orchestrate.py — Pipeline v2 Orchestrate Service

Groups evaluated tasks, determines execution order, writes chain metadata.
Single-instance guarded via lock file.

Note: grouping uses project+persona labels and a static complexity heuristic.
No LLM call — fast and deterministic.
"""
import logging
import os
import sys
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from _shared import conditional_claim, emit_structured_log, log_activity, pulse_get, pulse_patch, pulse_post
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [orchestrate] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("orchestrate")

PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
PROJECT_DIR = os.environ.get("PROJECT_DIR", "")

LOCK_FILE = Path(
    os.path.join(PROJECT_DIR, ".claude", "jobs", "state", "locks", "orchestrate.lock")
    if PROJECT_DIR else os.path.join(os.path.dirname(__file__), "..", "state", "locks", "orchestrate.lock")
)


LOCK_TIMEOUT_S = 600

def acquire_lock() -> bool:
    if LOCK_FILE.exists():
        try:
            content = LOCK_FILE.read_text().strip()
            parts = content.split(":", 1)
            pid = int(parts[0])
            lock_ts = float(parts[1]) if len(parts) > 1 else 0
            os.kill(pid, 0)
            age = datetime.now(timezone.utc).timestamp() - lock_ts
            if age > LOCK_TIMEOUT_S:
                log.warning("Stale lock (PID %d, age %.0fs > %ds) — removing", pid, age, LOCK_TIMEOUT_S)
                LOCK_FILE.unlink(missing_ok=True)
            else:
                log.info("Another orchestrate instance running (PID %d, %.0fs old) — exiting", pid, age)
                return False
        except (ValueError, ProcessLookupError):
            LOCK_FILE.unlink(missing_ok=True)
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    LOCK_FILE.write_text(f"{os.getpid()}:{datetime.now(timezone.utc).timestamp()}")
    return True


def release_lock():
    LOCK_FILE.unlink(missing_ok=True)


PRIORITY_SCORES = {"high": 0, "normal": 1, "low": 2}


def priority_score(task: dict) -> int:
    return PRIORITY_SCORES.get(get_label(task, "priority", "normal"), 1)


def get_ready_tasks() -> list[dict]:
    data = pulse_get("/tasks?status=open&limit=200")
    if not data:
        return []
    all_open = data.get("tasks", [])
    candidates = [t for t in all_open
                  if "evaluated:done" in t.get("labels", [])
                  and "queued:no" in t.get("labels", [])
                  and "blocked:yes" not in t.get("labels", [])]

    # Sibling-awareness: count ALL evaluated siblings (including blocked ones)
    # to avoid deadlock where blocked siblings prevent unblocked ones from advancing.
    # A sibling group is "ready" when all siblings have evaluated:done, regardless
    # of their blocked state — only the non-blocked candidates actually get queued.
    all_evaluated = {t["id"]: t for t in all_open if "evaluated:done" in t.get("labels", [])}
    closed_data = pulse_get("/tasks?status=closed&limit=500")
    closed_tasks = closed_data.get("tasks", []) if closed_data else []
    all_evaluated_or_closed = dict(all_evaluated)
    for t in closed_tasks:
        all_evaluated_or_closed[t["id"]] = t

    sibling_groups = defaultdict(list)
    standalone = []
    for t in candidates:
        meta = t.get("metadata") or {}
        parent = meta.get("parent_id")
        sibling_count = meta.get("sibling_count")
        if parent and sibling_count:
            sibling_groups[parent].append(t)
        else:
            standalone.append(t)

    ready = list(standalone)
    for parent_id, siblings in sibling_groups.items():
        expected = (siblings[0].get("metadata") or {}).get("sibling_count", 0)
        # Count ALL evaluated siblings under this parent (blocked + unblocked)
        total_evaluated = sum(1 for t in all_evaluated_or_closed.values()
                              if (t.get("metadata") or {}).get("parent_id") == parent_id)
        if total_evaluated >= expected:
            ready.extend(siblings)
        else:
            log.info("Holding %d/%d siblings of parent %s — %d evaluated, waiting for all",
                     len(siblings), expected, parent_id, total_evaluated)

    ready.sort(key=priority_score)
    return ready


def get_label(task: dict, prefix: str, default: str = "") -> str:
    for lbl in task.get("labels", []):
        if lbl.startswith(f"{prefix}:"):
            return lbl.split(":", 1)[1]
    return default


def group_tasks(tasks: list[dict]) -> dict[str, list[dict]]:
    """Group tasks into chains. Pre-existing chain_id metadata takes priority
    over project+persona grouping — this preserves explicit task dependencies
    declared at creation time."""
    pre_chained: dict[str, list[dict]] = defaultdict(list)
    unchained: list[dict] = []

    for t in tasks:
        meta = t.get("metadata") or {}
        existing_chain = meta.get("chain_id")
        existing_order = meta.get("chain_order")
        if existing_chain is not None and existing_order is not None:
            pre_chained[existing_chain].append(t)
        else:
            unchained.append(t)

    groups: dict[str, list[dict]] = {}

    for chain_id, chain_tasks in pre_chained.items():
        key = f"explicit:{chain_id}"
        groups[key] = sorted(chain_tasks,
                             key=lambda t: (t.get("metadata") or {}).get("chain_order", 0))

    for t in unchained:
        key = f"{get_label(t, 'project', '__default__')}:{get_label(t, 'assigned', 'autofix-executor')}"
        groups.setdefault(key, []).append(t)

    return groups


def order_chain(tasks: list[dict]) -> list[dict]:
    """Order tasks within a chain: priority first, then evaluator order or type heuristic."""
    has_order = all((t.get("metadata") or {}).get("suggested_order") is not None for t in tasks)
    if has_order:
        return sorted(tasks, key=lambda t: (
            priority_score(t),
            (t.get("metadata") or {}).get("suggested_order", 99),
        ))

    type_scores = {"verify": 0, "bug": 1, "feature": 2, "refactor": 2, "infrastructure": 3, "research": 4}

    def score(t):
        task_type = get_label(t, "type", "feature")
        return (priority_score(t), type_scores.get(task_type, 2))

    return sorted(tasks, key=score)


def detect_dependency_cycle(tasks: list[dict]) -> list[str]:
    """Return task IDs involved in circular dependencies. Simple DFS cycle check."""
    graph = {}
    for t in tasks:
        tid = t["id"]
        meta = t.get("metadata") or {}
        deps = meta.get("depends_on", [])
        if meta.get("decomposed") and meta.get("child_ids"):
            deps = list(set(deps + meta["child_ids"]))
        graph[tid] = deps

    visited, in_stack, cycle_nodes = set(), set(), set()

    def dfs(node):
        if node in in_stack:
            cycle_nodes.add(node)
            return True
        if node in visited:
            return False
        visited.add(node)
        in_stack.add(node)
        for dep in graph.get(node, []):
            if dfs(dep):
                cycle_nodes.add(node)
        in_stack.discard(node)
        return False

    for tid in graph:
        dfs(tid)
    return list(cycle_nodes)


def main():
    thread_id = ensure_thread_id()
    log.info("Thread ID: %s", thread_id)
    start_ms = int(time.time() * 1000)
    _outcome = ["error:unknown"]
    try:
        _orchestrate_main(_outcome)
    finally:
        emit_structured_log("", "orchestrate", int(time.time() * 1000) - start_ms, _outcome[0])


def _orchestrate_main(_outcome: list):
    if not acquire_lock():
        _outcome[0] = "skipped:lock_busy"
        return

    try:
        tasks = get_ready_tasks()
        if not tasks:
            log.info("No tasks ready for orchestration")
            _outcome[0] = "skipped:no_tasks"
            return

        log.info("Orchestrating %d tasks", len(tasks))

        cycle_ids = detect_dependency_cycle(tasks)
        if cycle_ids:
            log.warning("Circular dependencies detected in %d tasks: %s — clearing deps",
                        len(cycle_ids), cycle_ids)
            for t in tasks:
                if t["id"] in cycle_ids:
                    meta = t.get("metadata") or {}
                    meta.pop("depends_on", None)

        groups = group_tasks(tasks)
        log.info("Grouped into %d chains", len(groups))

        for group_key, group_list in groups.items():
            is_explicit_chain = group_key.startswith("explicit:")

            if is_explicit_chain:
                # Preserve pre-existing chain order (already sorted by chain_order in group_tasks)
                ordered = group_list
                chain_id = (group_list[0].get("metadata") or {}).get("chain_id", str(uuid.uuid4())[:12])
            else:
                chain_id = str(uuid.uuid4())[:12]
                ordered = order_chain(group_list)
                # Move decomposed parents to end of chain
                parents = [t for t in ordered if (t.get("metadata") or {}).get("decomposed")]
                non_parents = [t for t in ordered if t not in parents]
                ordered = non_parents + parents

            log.info("Chain %s (%s): %d tasks", chain_id, group_key, len(ordered))

            for i, task in enumerate(ordered):
                task_id = task["id"]
                meta = task.get("metadata", {}) or {}

                if is_explicit_chain:
                    # Preserve original chain_order for explicitly chained tasks
                    original_order = meta.get("chain_order", i)
                else:
                    original_order = i

                chain_meta = {
                    "chain_id": chain_id,
                    "chain_order": original_order,
                    "chain_size": len(ordered),
                    "chain_group": group_key,
                    "orchestrated_at": datetime.now(timezone.utc).isoformat(),
                }

                has_deps = False
                dep_list = list(meta.get("depends_on", []))
                if meta.get("decomposed") and meta.get("child_ids"):
                    dep_list = list(set(dep_list + meta["child_ids"]))
                if dep_list:
                    chain_meta["depends_on"] = dep_list
                    has_deps = True

                pulse_patch(f"/tasks/{task_id}", {
                    "metadata": chain_meta,
                    "actor": "orchestrate-service",
                })

                if has_deps:
                    pulse_post(f"/tasks/{task_id}/conditional-update", {
                        "precondition": {"label_value": "queued:no"},
                        "set_labels": ["queued:done", "blocked:yes", "reason:dependency"],
                        "remove_labels": ["queued:no", "blocked:no"],
                        "actor": "orchestrate-service",
                    })
                    log.info("  %s queued (blocked: dependency)", task_id)
                else:
                    conditional_claim(task_id, "queued:no", "queued:done",
                                      actor="orchestrate-service")
                    cid = chain_meta["chain_id"][:8]
                    log_activity(task_id, "orchestrate", f"Queued: chain={cid}, order={i+1}/{len(ordered)}, group={group_key}", {
                        "chain_id": chain_meta["chain_id"],
                        "chain_order": i,
                        "chain_size": len(ordered),
                    })
                    log.info("  %s queued (order %d/%d)", task_id, i + 1, len(ordered))

        _outcome[0] = "success"
        log.info("Orchestration complete: %d tasks in %d chains", len(tasks), len(groups))

    finally:
        release_lock()


if __name__ == "__main__":
    main()
