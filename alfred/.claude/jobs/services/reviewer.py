#!/usr/bin/env python3
"""
reviewer.py — Pipeline v2 Review Service

Post-execution verification using local Ollama (default) or Claude CLI
(opt-in via metadata.review_engine == "claude-cli"). Checks if execution
output matches expectations. Triggers Diagnose on failure.

Engine routing (Phase 1.3.5 — token-compression):
  - default: call_ollama(REVIEW_MODEL) — qwen3:32b
  - opt-in : claude -p --output-format json (review_engine="claude-cli")

review_telemetry now carries an `engine` marker on both paths so the
pipeline-telemetry extractor can route per-row engine selection.
"""
import json
import logging
import os
import subprocess
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, os.path.dirname(__file__))
from _shared import archive_task, call_ollama, conditional_claim, extract_json, get_ollama_telemetry, log_activity, pulse_patch, pulse_post, remove_sidecar, write_sidecar
from observability import log_decision
from observability.notify import notify_msgbus
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [reviewer] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("reviewer")

# Cap consecutive review-engine (Ollama) failures before parking + alerting,
# so a persistent LLM outage cannot thrash (re-review every cycle).
MAX_REVIEW_INFRA_ATTEMPTS = int(os.environ.get("MAX_REVIEW_INFRA_ATTEMPTS", "3"))

TASK_ID = os.environ.get("TASK_ID", "")
PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
MODEL = os.environ.get("REVIEW_MODEL", "qwen3:32b")
REVIEW_CODE_MODEL = os.environ.get("REVIEW_CODE_MODEL", "qwen3-coder:latest")

PROJECT_DIR = Path(os.environ.get("PROJECT_DIR", ".")).resolve()
HOST_PROJECT_DIR = os.environ.get("HOST_PROJECT_DIR", "")

def _host_to_container_path(p: str) -> Path:
    """Translate host-absolute paths to container-internal paths for fs checks."""
    if HOST_PROJECT_DIR and p.startswith(HOST_PROJECT_DIR):
        return PROJECT_DIR / p[len(HOST_PROJECT_DIR):].lstrip("/")
    return Path(p)

# Map reviewer's string-confidence levels to log_decision's float scale.
_CONFIDENCE_MAP = {"high": 0.9, "medium": 0.6, "low": 0.3}

REVIEW_PROMPT = """You are a task execution reviewer. Evaluate whether a task was completed successfully.

Task: {title}
Description: {description}
Expected output: {expected_output}

Execution summary from context:
{context_summary}

Filesystem verification results (automated checks):
{filesystem_report}

Questions to answer:
1. Did the execution address the task objective?
2. Were the expected files modified (if applicable)?
3. Do the filesystem checks confirm files were actually created/modified?
4. Are there any obvious issues or incomplete work?
5. If filesystem checks found missing files, does the context summary explain why?

IMPORTANT: If filesystem checks show expected output files are MISSING, this is strong
evidence of failure — do NOT pass the task unless there is a valid explanation.

Output JSON:
{{
  "passed": true/false,
  "confidence": "high/medium/low",
  "issues": ["list of issues if any"],
  "summary": "brief assessment"
}}

Be brief.
/no_think"""  # token-compression Phase 1.3


def _verify_filesystem(task: dict) -> str:
    """Check if files claimed by context_summary actually exist on disk."""
    metadata = task.get("metadata", {}) or {}
    ctx = metadata.get("context_summary", {})
    stage_out = metadata.get("stage_output", {}) or {}
    checks = []

    files_modified = ctx.get("files_modified", []) if isinstance(ctx, dict) else []

    # Pipeline hardening (Phase A): reconcile dual-location writes. The executor
    # may report writing the same deliverable to more than one directory (e.g. a
    # project's canonical docs/ tree AND the generic alfred/output sink). If only
    # some copies actually landed, sync from an existing copy to the missing ones
    # so a location split does not produce a false "missing" verdict.
    _by_name: dict = {}
    for _f in files_modified:
        if os.path.isabs(_f):
            _by_name.setdefault(os.path.basename(_f), []).append(_host_to_container_path(_f))
    for _name, _ps in _by_name.items():
        _have = [q for q in _ps if q.exists()]
        _need = [q for q in _ps if not q.exists()]
        if _have and _need:
            for _dst in _need:
                try:
                    _dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(_have[0], _dst)
                    checks.append(f"RECONCILED: copied {_have[0].name} -> {_dst}")
                    log.info("reviewer reconcile: %s -> %s", _have[0], _dst)
                except OSError as _e:
                    checks.append(f"RECONCILE FAILED: {_have[0]} -> {_dst}: {_e}")
    for f in files_modified:
        p = _host_to_container_path(f) if os.path.isabs(f) else PROJECT_DIR / f
        exists = p.exists()
        checks.append(f"{'FOUND' if exists else 'MISSING'}: {f}")
        if exists:
            stat = p.stat()
            age_min = (datetime.now(timezone.utc).timestamp() - stat.st_mtime) / 60
            checks.append(f"  Last modified: {age_min:.0f} minutes ago, size: {stat.st_size} bytes")

    expected_paths = stage_out.get("file_paths", [])
    for f in expected_paths:
        p = _host_to_container_path(f) if os.path.isabs(f) else PROJECT_DIR / f
        if f not in files_modified:
            exists = p.exists()
            checks.append(f"{'FOUND' if exists else 'NOT FOUND'} (expected): {f}")

    exec_log = metadata.get("executor_log")
    if exec_log:
        log_path = _host_to_container_path(exec_log) if os.path.isabs(exec_log) else Path(exec_log)
        if log_path.exists():
            checks.append(f"Executor log: {log_path.stat().st_size} bytes")
        else:
            checks.append(f"Executor log MISSING: {exec_log}")

    telemetry = metadata.get("telemetry", {})
    if telemetry:
        checks.append(f"Execution duration: {telemetry.get('duration_ms', 'unknown')}ms")
        if telemetry.get("files_touched"):
            checks.append(f"Files touched by executor: {', '.join(telemetry['files_touched'])}")

    return "\n".join(checks) if checks else "No filesystem artifacts to verify."



CODE_REVIEW_PROMPT = """You are a senior code reviewer. Judge whether the task was actually completed by inspecting the REAL git evidence below — NOT any self-report or narrative.

Task: {title}
Description: {description}

Commits since execution: {commits}
Files changed: {files}
Working-tree status: {status}

Diff (truncated):
{diff}

Best-effort test result:
{test_result}

Rules:
- If there are NO commits, NO changed files, and the diff is empty, the work was NOT done -> passed=false.
- Otherwise judge whether the diff actually implements what the Description asked, and whether tests (if run) passed.
- Base the verdict ONLY on the evidence above. Be strict but fair.

Output JSON: {{"passed": true/false, "confidence": "high/medium/low", "issues": ["..."], "summary": "..."}}
Be brief.
/no_think"""


def _is_code_ticket(task) -> bool:
    labels = task.get("labels") or []
    return any(l in ("capability:code", "capability:file-ops") for l in labels)


def _git(repo, *args, timeout=20):
    try:
        r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def _git_evidence(repo, since_iso):
    """Ground-truth code evidence: commits since execution start + uncommitted diff."""
    if not repo or not os.path.isdir(os.path.join(repo, ".git")):
        return {"repo": repo, "is_git": False, "has_changes": False, "summary": "not a git repo"}
    since = since_iso or "2 hours ago"
    commits = _git(repo, "log", "--since", since, "--pretty=%h %s")
    diff_commits = _git(repo, "log", "--since", since, "-p", "--unified=2")
    diff_uncommitted = _git(repo, "diff")
    status = _git(repo, "status", "--porcelain")
    files = set()
    for line in _git(repo, "log", "--since", since, "--name-only", "--pretty=format:").splitlines():
        if line.strip():
            files.add(line.strip())
    for line in status.splitlines():
        name = line[3:].strip()
        if name:
            files.add(name)
    diff_text = (diff_commits + "\n" + diff_uncommitted).strip()
    has = bool(commits or status or diff_text)
    return {"repo": repo, "is_git": True, "has_changes": has, "commits": commits,
            "status": status, "files": sorted(files), "diff": diff_text[:12000],
            "summary": f"{len(commits.splitlines())} commit(s) since exec, {len(files)} file(s) changed, has_changes={has}"}


def _best_effort_tests(repo, files):
    """Run touched pytest files best-effort. Distinguish FAILED from could-not-run."""
    test_files = [f for f in files if "/test" in f.lower() or os.path.basename(f).startswith("test_")]
    if not test_files:
        return "no touched test files; skipped"
    venv_py = os.path.join(repo, ".venv", "bin", "python")
    py = venv_py if os.path.exists(venv_py) else "python3"
    try:
        r = subprocess.run([py, "-m", "pytest", *test_files, "-x", "-q", "--no-header"],
                           cwd=repo, capture_output=True, text=True, timeout=180)
        tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-15:])
        verdict = "PASSED" if r.returncode == 0 else ("FAILED" if r.returncode == 1 else "INFRA-ERROR (could not run)")
        return f"{verdict}\n{tail}"
    except Exception as e:
        return f"INFRA-ERROR (could not run): {e}"


def main():
    thread_id = ensure_thread_id()
    log.info("Thread ID: %s", thread_id)

    if not TASK_ID:
        log.error("No TASK_ID provided")
        sys.exit(1)

    task_json = os.environ.get("TASK_JSON")
    if task_json:
        task = json.loads(task_json)
    else:
        try:
            r = requests.get(f"{PULSE_API}/tasks/{TASK_ID}", timeout=5)
            r.raise_for_status()
            task = r.json()
        except Exception as e:
            log.error("Failed to fetch task %s: %s", TASK_ID, e)
            sys.exit(1)

    title = task.get("title", "Untitled")
    description = task.get("description", "")
    metadata = task.get("metadata", {}) or {}

    context_summary = metadata.get("context_summary",
                                   (metadata.get("stage_output") or {}).get("expected_output",
                                                                            "No execution context available"))
    expected_output = (metadata.get("stage_output") or {}).get("expected_output", "Not specified")

    filesystem_report = _verify_filesystem(task)
    log.info("Filesystem verification for %s:\n%s", TASK_ID, filesystem_report)

    log.info("Reviewing task %s: %s", TASK_ID, title)
    sidecar = write_sidecar(TASK_ID, "review")

    # Code tickets: judge on REAL git evidence captured host-side by the bridge
    # (the containerized reviewer has no git and cannot see project repos).
    is_code = _is_code_ticket(task)
    git_ev = metadata.get("git_evidence") if is_code else None
    git_has_changes = bool(git_ev and (git_ev.get("commits") or git_ev.get("status") or git_ev.get("diff")))
    if is_code:
        log.info("Code-ticket %s git_evidence present=%s committed=%s files=%d", TASK_ID,
                 bool(git_ev), (git_ev or {}).get("committed"), len((git_ev or {}).get("files", [])))

    if is_code and git_ev:
        prompt = CODE_REVIEW_PROMPT.format(
            title=title, description=description,
            commits=git_ev.get("commits") or "(none)",
            files=", ".join(git_ev.get("files", [])) or "(none)",
            status=git_ev.get("status") or "(clean)",
            diff=git_ev.get("diff") or "(empty)",
            test_result="(tests not run in reviewer; judged on diff + commit)",
        )
        model_used = REVIEW_CODE_MODEL
    else:
        prompt = REVIEW_PROMPT.format(
            title=title,
            description=description,
            expected_output=expected_output,
            context_summary=json.dumps(context_summary) if isinstance(context_summary, dict) else str(context_summary),
            filesystem_report=filesystem_report,
        )
        model_used = MODEL

    engine = "ollama"
    response = call_ollama(prompt, model_used)
    if not response:
        # No Silent Degradation: cap consecutive engine failures. Below the cap we
        # revert for retry (transient blip); at the cap we PARK the ticket OPEN and
        # ALERT — never silently accept, never thrash forever.
        infra_attempts = (metadata.get("review_infra_attempts", 0) or 0) + 1
        if infra_attempts >= MAX_REVIEW_INFRA_ATTEMPTS:
            log.warning("Task %s: review engine unreachable after %d attempts — parking + alerting",
                        TASK_ID, infra_attempts)
            log_decision(
                "persona:reviewer", "review_outcome", "engine_unavailable_parked",
                rationale=f"Ollama unreachable for {infra_attempts} consecutive review attempts",
                confidence=1.0,
                downstream_effect={"engine": "ollama", "model": MODEL,
                                   "set_labels": ["blocked:yes", "reason:review-engine-unavailable"]},
                task_id=TASK_ID,
            )
            pulse_post(f"/tasks/{TASK_ID}/conditional-update", {
                "precondition": {"label_value": "completed:reviewing"},
                "set_labels": ["blocked:yes", "reason:review-engine-unavailable"],
                "remove_labels": ["completed:reviewing", "blocked:no"],
                "metadata": {"review_infra_attempts": infra_attempts},
                "actor": "reviewer",
            })
            notify_msgbus(
                source="persona:reviewer", severity="warning",
                summary=(f"Task {TASK_ID} parked: review engine (Ollama) unreachable after "
                         f"{infra_attempts} attempts. Pipeline review is down — check Ollama at "
                         f"host.docker.internal:11434. Ticket held OPEN (blocked), not accepted."),
                data={"job": "reviewer", "task_id": TASK_ID,
                      "reason": "review-engine-unavailable", "attempts": infra_attempts},
            )
            return
        log.warning("No Ollama response — reverting to completed:no for retry (attempt %d/%d)",
                    infra_attempts, MAX_REVIEW_INFRA_ATTEMPTS)
        log_decision(
            "persona:reviewer", "review_outcome", "engine_failed",
            rationale="Ollama returned no response",
            confidence=0.0,
            downstream_effect={"engine": "ollama", "model": MODEL,
                               "revert_to_label": "completed:no", "infra_attempts": infra_attempts},
            task_id=TASK_ID,
        )
        pulse_patch(f"/tasks/{TASK_ID}", {
            "metadata": {"review_infra_attempts": infra_attempts}, "actor": "reviewer"})
        conditional_claim(TASK_ID, "completed:reviewing", "completed:no",
                          actor="reviewer")
        return
    review_telemetry = get_ollama_telemetry()
    review_telemetry["engine"] = "ollama"

    result = extract_json(response)
    passed = result.get("passed", False) if result else False

    # Hard ground-truth gate: a code ticket whose host-captured git evidence shows
    # NO changes cannot pass, regardless of the LLM verdict (kills the false-pass on
    # self-reported success). If git_evidence is absent (non-git target), fall back
    # to the narrative review above rather than hard-failing legitimate work.
    if is_code and git_ev and not git_has_changes:
        passed = False
        result = {"passed": False, "confidence": "high",
                  "issues": ["No git commits or file changes captured for this code ticket — work not actually done."],
                  "summary": "Ground-truth gate: host-captured git evidence shows no changes."}

    review_meta = {
        "review_infra_attempts": 0,  # reset: engine responded this cycle
        "review_output": result or {"passed": False, "summary": "LLM output unparseable — defaulted to fail"},
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": model_used,
        "review_telemetry": review_telemetry,
    }
    pulse_patch(f"/tasks/{TASK_ID}", {"metadata": review_meta, "actor": "reviewer"})

    if passed:
        remove_sidecar(sidecar)
        log_activity(TASK_ID, "review", "PASSED review", {
            "model": model_used,
            "engine": engine,
            "confidence": result.get("confidence"),
            "review_telemetry": review_telemetry,
        })
        log.info("Task %s PASSED review (engine=%s)", TASK_ID, engine)
        log_decision(
            "persona:reviewer",
            "review_outcome",
            "passed",
            rationale=(result or {}).get("summary", "no summary"),
            confidence=_CONFIDENCE_MAP.get((result or {}).get("confidence") or "", 0.5),
            downstream_effect={
                "engine": engine,
                "model": model_used,
                "issues": (result or {}).get("issues", []),
                "next_label": "completed:done",
                "task_archived": True,
            },
            task_id=TASK_ID,
        )
        archive_task(TASK_ID)
        pulse_post(f"/tasks/{TASK_ID}/conditional-update", {
            "precondition": {"label_value": "completed:reviewing"},
            "set_labels": ["completed:done"],
            "remove_labels": ["completed:reviewing", "active:done"],
            "status": "closed",
            "actor": "reviewer",
        })
    else:
        fail_reason = result.get("summary", "unknown") if result else "parse error"
        remove_sidecar(sidecar)
        log_activity(TASK_ID, "review", f"FAILED review: {fail_reason}",
                     {"model": model_used, "engine": engine,
                      "retry_count": metadata.get("retry_count", 0) + 1})
        log.info("Task %s FAILED review: %s", TASK_ID, fail_reason)
        retry_count = metadata.get("retry_count", 0) + 1

        if retry_count >= 3:
            log.warning("Task %s exceeded max retries (%d) — blocking", TASK_ID, retry_count)
            log_decision(
                "persona:reviewer",
                "review_outcome",
                "blocked_max_retries",
                rationale=f"{fail_reason} (retry limit {retry_count} reached)",
                confidence=_CONFIDENCE_MAP.get((result or {}).get("confidence") or "", 0.5),
                downstream_effect={
                    "engine": engine,
                    "model": model_used,
                    "retry_count": retry_count,
                    "issues": (result or {}).get("issues", []),
                    "set_labels": ["blocked:yes", "reason:max-retries", "completed:no"],
                },
                task_id=TASK_ID,
            )
            pulse_patch(f"/tasks/{TASK_ID}", {
                "metadata": {"retry_count": retry_count}, "actor": "reviewer"})
            pulse_post(f"/tasks/{TASK_ID}/conditional-update", {
                "precondition": {"label_value": "completed:reviewing"},
                "set_labels": ["blocked:yes", "reason:max-retries", "completed:no"],
                "remove_labels": ["completed:reviewing", "blocked:no"],
                "actor": "reviewer",
            })
        else:
            log_decision(
                "persona:reviewer",
                "review_outcome",
                "failed_diagnose_triggered",
                rationale=fail_reason,
                confidence=_CONFIDENCE_MAP.get((result or {}).get("confidence") or "", 0.5),
                downstream_effect={
                    "engine": engine,
                    "model": model_used,
                    "retry_count": retry_count,
                    "issues": (result or {}).get("issues", []),
                    "diagnose_launched": True,
                },
                task_id=TASK_ID,
            )
            pulse_patch(f"/tasks/{TASK_ID}", {
                "metadata": {"retry_count": retry_count}, "actor": "reviewer"})
            # Launch diagnose with visible logging
            diagnose_script = Path(__file__).parent / "diagnose.py"
            if diagnose_script.exists():
                svc_log_dir = Path(os.environ.get("PROJECT_DIR", ".")) / ".claude" / "logs" / "headless"
                svc_log_dir.mkdir(parents=True, exist_ok=True)
                svc_log = svc_log_dir / "service-diagnose.log"
                with open(svc_log, "a") as lf:
                    subprocess.Popen(
                        [sys.executable, str(diagnose_script)],
                        env={**os.environ, "TASK_ID": TASK_ID},
                        stdout=lf, stderr=lf, start_new_session=True,
                    )
                log.info("Launched diagnose for task %s (retry %d)", TASK_ID, retry_count)
            else:
                log.warning("diagnose.py not found — resetting task to staging directly")
                from _shared import pulse_label_remove
                stale = [l for l in task.get("labels", [])
                         if l.split(":")[0] in ("staging", "evaluated", "queued",
                                                "active", "completed", "blocked", "reason")]
                reset = ["staging:wait", "evaluated:no", "queued:no", "active:no",
                         "completed:no", "blocked:no"]
                for lbl in stale:
                    if lbl not in reset:
                        pulse_label_remove(TASK_ID, lbl)
                pulse_post(f"/tasks/{TASK_ID}/labels", {
                    "labels": reset, "actor": "reviewer"})
                pulse_patch(f"/tasks/{TASK_ID}", {"status": "open", "actor": "reviewer"})


if __name__ == "__main__":
    main()
