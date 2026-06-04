"""Shared I/O helpers for the observability dual-write pattern.

JSONL spool is the durable path; Pulse POST is best-effort. On POST failure
the payload is appended to swallowed-errors.jsonl for later replay by
audit-ingest.
"""
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger("observability")


def _project_dir() -> Path:
    """Resolve PROJECT_DIR with the same fallback as the bash libs.

    Matches the post-supplant pattern: ${PROJECT_DIR:-<repo-root-relative>}.
    Walks up from this file until a `.claude` directory is found.
    """
    pd = os.environ.get("PROJECT_DIR")
    if pd:
        return Path(pd)
    here = Path(__file__).resolve()
    for ancestor in here.parents:
        if (ancestor / ".claude").is_dir():
            return ancestor
    return here.parents[3]


PROJECT_DIR: Path = _project_dir()
DATA_DIR: Path = PROJECT_DIR / ".claude" / "data"
LOGS_DIR: Path = PROJECT_DIR / ".claude" / "logs"
SWALLOWED_ERRORS_FILE: Path = LOGS_DIR / "swallowed-errors.jsonl"

# Pulse API base for dual-write. Resolution mirrors lib/pulse-env.sh:
# PULSE_API_URL > PULSE_API > PULSE_URL (base — /api/v1 appended) > localhost:8800.
def _resolve_pulse_api_url() -> str:
    explicit = os.environ.get("PULSE_API_URL") or os.environ.get("PULSE_API")
    if explicit:
        return explicit
    base = os.environ.get("PULSE_URL", "http://localhost:8800").rstrip("/")
    return base if base.endswith("/api/v1") else f"{base}/api/v1"


PULSE_API_URL: str = _resolve_pulse_api_url()

DUAL_WRITE_TIMEOUT: float = float(os.environ.get("AUDIT_DUAL_WRITE_TIMEOUT", "2"))


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def utc_iso_now() -> str:
    """RFC3339-style UTC timestamp matching the bash `date -u +%Y-%m-%dT%H:%M:%SZ` format."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def jsonl_append(path: Path, record: dict[str, Any]) -> None:
    """Append a JSON record to a JSONL file. Failures are silenced (durable-best-effort)."""
    _ensure_dirs()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            f.write(json.dumps(record, separators=(",", ":")) + "\n")
    except OSError as e:
        log.warning("jsonl_append %s failed: %s", path, e)


def post_to_pulse(endpoint: str, payload: dict[str, Any]) -> bool:
    """POST a payload to Pulse <PULSE_API_URL><endpoint>.

    Returns True on 2xx, False otherwise. On non-2xx, the payload is spooled
    to swallowed-errors.jsonl for later replay. Network errors are swallowed.

    The endpoint argument should start with "/" (e.g. "/audit/events").
    """
    if endpoint and not endpoint.startswith("/"):
        endpoint = "/" + endpoint
    target = f"{PULSE_API_URL}{endpoint}"

    try:
        r = requests.post(
            target,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=DUAL_WRITE_TIMEOUT,
        )
        if 200 <= r.status_code < 300:
            return True
        _spool_failed(target, payload, str(r.status_code))
        return False
    except requests.RequestException as e:
        _spool_failed(target, payload, f"network:{type(e).__name__}")
        return False


def _spool_failed(target: str, payload: dict[str, Any], http_code: str) -> None:
    """Append a failed POST to swallowed-errors.jsonl matching bash schema."""
    record = {
        "failed_at": utc_iso_now(),
        "target": target,
        "http_code": http_code,
        "payload": payload,
    }
    jsonl_append(SWALLOWED_ERRORS_FILE, record)


def coerce_json(value: Any) -> Any:
    """Best-effort coercion: if already a dict/list/None, pass through; if string,
    attempt to parse as JSON; otherwise wrap as {"raw": str(value)}.

    Mirrors the bash `jq -e '.' <<< $details` validation with raw-wrap fallback.
    """
    if value is None or isinstance(value, (dict, list, int, float, bool)):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return {}
        try:
            return json.loads(s)
        except (json.JSONDecodeError, ValueError):
            return {"raw": value}
    return {"raw": str(value)}
