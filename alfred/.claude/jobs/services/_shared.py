"""Shared utilities for pipeline v2 services."""
import json
import logging
import os
import time
import urllib.parse
from pathlib import Path

import requests

PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")

log = logging.getLogger("pipeline-v2")


MAX_RETRIES = 2
RETRY_DELAY = 0.5


def _retry(fn, label: str):
    """Retry transient connection errors with backoff."""
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return fn()
        except requests.ConnectionError as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * (attempt + 1))
                log.warning("%s retry %d/%d: %s", label, attempt + 1, MAX_RETRIES, e)
    log.error("%s failed after %d attempts: %s", label, MAX_RETRIES + 1, last_err)
    return None


def pulse_get(path: str) -> dict | None:
    def _do():
        r = requests.get(f"{PULSE_API}{path}", timeout=10)
        r.raise_for_status()
        return r.json()
    try:
        return _retry(_do, f"Pulse GET {path}")
    except Exception as e:
        log.error("Pulse GET %s failed: %s", path, e)
        return None


def pulse_post(path: str, data: dict) -> dict | None:
    def _do():
        r = requests.post(f"{PULSE_API}{path}", json=data, timeout=10)
        r.raise_for_status()
        return r.json()
    try:
        return _retry(_do, f"Pulse POST {path}")
    except Exception as e:
        log.error("Pulse POST %s failed: %s", path, e)
        return None


def pulse_patch(path: str, data: dict) -> dict | None:
    def _do():
        r = requests.patch(f"{PULSE_API}{path}", json=data, timeout=10)
        r.raise_for_status()
        return r.json()
    try:
        return _retry(_do, f"Pulse PATCH {path}")
    except Exception as e:
        log.error("Pulse PATCH %s failed: %s", path, e)
        return None


def pulse_label_remove(task_id: str, label: str) -> bool:
    encoded = urllib.parse.quote(label, safe='')
    try:
        r = requests.delete(f"{PULSE_API}/tasks/{task_id}/labels/{encoded}", timeout=5)
        return r.ok
    except Exception:
        return False


def set_label(task_id: str, remove_label: str, add_label: str) -> bool:
    """Atomic label transition via conditional-update. Returns False if precondition failed (task already claimed)."""
    return conditional_claim(task_id, remove_label, add_label,
                             remove_labels=[remove_label], actor="service")


def call_ollama(prompt: str, model: str = "qwen3:32b") -> str | None:
    try:
        r = requests.post(OLLAMA_URL, json={
            "model": model, "prompt": prompt, "stream": False, "think": False,
        }, timeout=120)
        r.raise_for_status()
        data = r.json()
        _last_ollama_telemetry.clear()
        _last_ollama_telemetry.update({
            "model": data.get("model", model),
            "total_duration_ms": data.get("total_duration", 0) // 1_000_000,
            "load_duration_ms": data.get("load_duration", 0) // 1_000_000,
            "prompt_tokens": data.get("prompt_eval_count", 0),
            "prompt_eval_ms": data.get("prompt_eval_duration", 0) // 1_000_000,
            "completion_tokens": data.get("eval_count", 0),
            "completion_eval_ms": data.get("eval_duration", 0) // 1_000_000,
        })
        return data.get("response", "")
    except Exception as e:
        log.error("Ollama call failed: %s", e)
        return None


def call_ollama_streaming(prompt: str, model: str, live_file: Path) -> str | None:
    """Stream Ollama response, writing each token to a JSONL live file for dashboard tailing."""
    try:
        r = requests.post(OLLAMA_URL, json={
            "model": model, "prompt": prompt, "stream": True, "think": False,
        }, timeout=300, stream=True)
        r.raise_for_status()

        full_response = ""
        token_count = 0
        with open(live_file, "w") as f:
            f.write(json.dumps({"event": "start", "model": model, "ts": time.time()}) + "\n")
            f.flush()
            for line in r.iter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if chunk.get("response"):
                    full_response += chunk["response"]
                    token_count += 1
                    f.write(json.dumps({"event": "token", "text": chunk["response"], "n": token_count}) + "\n")
                    if token_count % 5 == 0:
                        f.flush()
                if chunk.get("done"):
                    _last_ollama_telemetry.clear()
                    _last_ollama_telemetry.update({
                        "model": chunk.get("model", model),
                        "total_duration_ms": chunk.get("total_duration", 0) // 1_000_000,
                        "load_duration_ms": chunk.get("load_duration", 0) // 1_000_000,
                        "prompt_tokens": chunk.get("prompt_eval_count", 0),
                        "prompt_eval_ms": chunk.get("prompt_eval_duration", 0) // 1_000_000,
                        "completion_tokens": chunk.get("eval_count", 0),
                        "completion_eval_ms": chunk.get("eval_duration", 0) // 1_000_000,
                    })
                    f.write(json.dumps({
                        "event": "done", "tokens": token_count,
                        "duration_ms": _last_ollama_telemetry.get("total_duration_ms", 0),
                        "ts": time.time(),
                    }) + "\n")
                    f.flush()
        return full_response
    except Exception as e:
        log.error("Ollama streaming call failed: %s", e)
        try:
            with open(live_file, "a") as f:
                f.write(json.dumps({"event": "error", "message": str(e), "ts": time.time()}) + "\n")
        except Exception:
            pass
        return None


_last_ollama_telemetry: dict = {}


def get_ollama_telemetry() -> dict:
    """Return telemetry from the most recent call_ollama() invocation."""
    return dict(_last_ollama_telemetry)


def extract_json(text: str) -> dict | None:
    """Extract the first valid JSON object from LLM output.

    Uses json.loads scanning rather than brace counting to handle
    braces inside string values correctly.
    """
    idx = text.find("{")
    while idx >= 0:
        for end in range(len(text), idx, -1):
            if text[end - 1] != "}":
                continue
            try:
                obj = json.loads(text[idx:end])
                if isinstance(obj, dict):
                    return obj
            except (json.JSONDecodeError, ValueError):
                continue
        idx = text.find("{", idx + 1)
    return None


def conditional_claim(task_id: str, precondition: str, set_label_val: str,
                      remove_labels: list[str] | None = None,
                      actor: str = "event-watcher") -> bool:
    """Atomic label claim via conditional-update endpoint."""
    payload = {
        "precondition": {"label_value": precondition},
        "set_labels": [set_label_val],
        "remove_labels": remove_labels or [precondition],
        "actor": actor,
    }
    try:
        r = requests.post(f"{PULSE_API}/tasks/{task_id}/conditional-update",
                          json=payload, timeout=10)
        if r.status_code == 200:
            return True
        if r.status_code == 409:
            return False
        log.warning("Conditional update failed for %s: %s", task_id, r.status_code)
        return False
    except Exception as e:
        log.warning("Conditional update error for %s: %s", task_id, e)
        return False



def write_sidecar(task_id: str, service_name: str) -> Path:
    """Create a sidecar file for the /pipeline/active endpoint to detect active processing."""
    sidecar_dir = Path(os.environ.get("PROJECT_DIR", ".")) / ".claude" / "jobs" / "active"
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    suffix_map = {"stage": ".stage.json", "evaluate": ".eval.json", "review": ".review.json", "orchestrate": ".orch.json"}
    suffix = suffix_map.get(service_name, f".{service_name}.json")
    sidecar_path = sidecar_dir / f"{task_id}{suffix}"
    sidecar_path.write_text(json.dumps({
        "task_id": task_id,
        "service": service_name,
        "pid": os.getpid(),
        "start_time": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }))
    return sidecar_path


def remove_sidecar(path: Path) -> None:
    """Remove sidecar file on service completion."""
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass


def log_activity(task_id: str, service_name: str, summary: str, details: dict | None = None) -> None:
    """Push a pipeline activity event to Pulse for task timeline display."""
    event_data = {"service": service_name, "summary": summary}
    if details:
        event_data.update(details)
    try:
        requests.post(f"{PULSE_API}/events", json={
            "task_id": task_id,
            "event_type": f"pipeline:{service_name}",
            "actor": f"{service_name}-service",
            "data": event_data,
        }, timeout=3)
    except Exception:
        pass


def emit_structured_log(task_id: str, service_name: str, duration_ms: int, outcome: str, **extra) -> None:
    """Emit a structured JSON log line for pipeline observability.

    Fields:
        task_id       – Pulse task identifier (or '' for task-less runs)
        service_name  – Name of the emitting service (stage, evaluate, ...)
        duration_ms   – Wall-clock time for the service invocation in milliseconds
        outcome       – Terminal state string (e.g. 'success', 'blocked:keyword',
                        'reverted:ollama_no_response', 'error:fetch_failed', ...)
        **extra       – Optional additional fields merged into the record
    """
    record: dict = {
        "task_id": task_id,
        "service_name": service_name,
        "duration_ms": duration_ms,
        "outcome": outcome,
    }
    record.update(extra)
    print(json.dumps(record), flush=True)


def archive_task(task_id: str) -> Path | None:
    """Write task lifecycle summary to archive directory on close."""
    task = pulse_get(f"/tasks/{task_id}")
    if not task:
        return None
    archive_dir = Path(os.environ.get("PROJECT_DIR", ".")) / ".claude" / "jobs" / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    meta = task.get("metadata", {}) or {}
    summary = {
        "id": task_id,
        "title": task.get("title"),
        "status": task.get("status"),
        "labels": task.get("labels", []),
        "created_at": task.get("created_at"),
        "closed_at": meta.get("reviewed_at") or meta.get("executed_at"),
        "persona": meta.get("executor_persona"),
        "model": meta.get("executor_model"),
        "telemetry": meta.get("telemetry"),
        "review_output": meta.get("review_output"),
        "context_summary": meta.get("context_summary"),
        "chain_id": meta.get("chain_id"),
        "chain_order": meta.get("chain_order"),
        "parent_id": meta.get("parent_id"),
        "child_ids": meta.get("child_ids"),
        "executor_log": meta.get("executor_log"),
        "executor_log_bytes": meta.get("executor_log_bytes"),
    }
    ts = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y%m%d-%H%M%S")
    archive_path = archive_dir / f"{task_id}-{ts}.json"
    archive_path.write_text(json.dumps(summary, indent=2, default=str))
    log.info("Archived task %s to %s", task_id, archive_path)
    return archive_path


def update_stage_label(task_id: str, new_stage: str) -> None:
    """Set a stage:<value> label for dashboard display, removing any prior stage:* label."""
    task = pulse_get(f"/tasks/{task_id}")
    if not task:
        return
    old_stages = [l for l in task.get("labels", []) if l.startswith("stage:")]
    new_label = f"stage:{new_stage}"
    if new_label in old_stages:
        return
    for old in old_stages:
        pulse_label_remove(task_id, old)
    pulse_post(f"/tasks/{task_id}/labels", {
        "labels": [new_label],
        "actor": "pipeline-stage-tracker",
    })


def get_persona_dir() -> str:
    project_dir = os.environ.get("PROJECT_DIR", "")
    if project_dir:
        return os.path.join(project_dir, ".claude", "jobs", "personas")
    return ""


def list_personas() -> list[str]:
    """Discover available personas from directory structure."""
    d = get_persona_dir()
    if not d or not os.path.isdir(d):
        return ["autofix-executor"]
    personas = []
    for name in os.listdir(d):
        prompt_file = os.path.join(d, name, "prompt.md")
        if os.path.isfile(prompt_file):
            personas.append(name)
    return personas or ["autofix-executor"]


def load_persona_prompt(persona_name: str) -> str | None:
    """Load persona prompt from personas/<name>/prompt.md."""
    d = get_persona_dir()
    if not d:
        return None
    prompt_file = os.path.join(d, persona_name, "prompt.md")
    if os.path.isfile(prompt_file):
        with open(prompt_file) as f:
            return f.read()
    return None
