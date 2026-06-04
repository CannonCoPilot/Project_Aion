"""notify.py — pipeline-v2 alert dispatch via lib/msgbus.sh

Python port of the `"$MSGBUS" send --type notification ...` shell pattern used
by executor.sh, dispatcher.sh, and pipeline-watchdog.sh. Provides
`notify_msgbus()` so pipeline-v2 services (pipeline-watcher.py, executor.py,
and future Python services in services/) can complete the alert chain:

    pipeline-v2 service -> lib/msgbus.sh -> lib/msg-relay.sh -> lib/send-telegram.sh

Failure mode this restores visibility on: AION-13dc7b96 incident
(4466 error lines over 74h with no operator alert) — pipeline-watcher.py
detected the threshold breach but only wrote a state file. This module
closes that loop.

Fail-quiet contract: every public function swallows exceptions, returns
bool, and never blocks the caller for more than ~2 seconds. msgbus
unavailability never causes a pipeline cycle to fail.
"""
import json
import logging
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("observability.notify")

JOBS_DIR = Path(__file__).resolve().parent.parent.parent
MSGBUS_SH = JOBS_DIR / "lib" / "msgbus.sh"

MSGBUS_TIMEOUT_S = float(os.environ.get("MSGBUS_TIMEOUT_S", "2.0"))


def notify_msgbus(
    source: str,
    severity: str,
    summary: str,
    data: dict | None = None,
    event_type: str = "notification",
    job: str = "",
    dedup_key: str | None = None,
) -> bool:
    """Send a fire-and-forget event to lib/msgbus.sh for Telegram delivery.

    source     msgbus --source ("pipeline-watcher", "executor:budget", ...).
    severity   "info" | "warning" | "critical". Telegram filter fires on
               critical and (per msg-relay.sh routing) warning; info is
               dashboard-only.
    summary    Human-readable line; placed at data.summary for Telegram body.
    data       Additional structured fields merged into the payload.
    event_type msgbus --type. Defaults to "notification" (the alerting type).
               Use "job_completed" / "job_failed" for lifecycle, not alerts.
    job        Optional --job tag for msgbus row attribution.
    dedup_key  If set, writes /tmp/nexus-msgbus-<dedup_key>-<UTC-date>
               sentinel; subsequent calls same day downgrade severity to
               "info" to suppress Telegram spam. Mirrors
               executor.sh:1706-1712 daily-budget-alert pattern.

    Returns True on subprocess exit 0. Always returns; never raises.
    """
    if not MSGBUS_SH.exists():
        return False

    payload: dict = {"summary": summary}
    if data:
        payload.update(data)

    if dedup_key:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        sentinel = Path(f"/tmp/nexus-msgbus-{dedup_key}-{date_str}")
        if sentinel.exists():
            severity = "info"
        else:
            try:
                sentinel.touch()
            except OSError:
                pass

    cmd = [
        str(MSGBUS_SH), "send",
        "--type", event_type,
        "--source", source,
        "--severity", severity,
        "--data", json.dumps(payload, default=str),
    ]
    if job:
        cmd.extend(["--job", job])

    try:
        result = subprocess.run(
            cmd, timeout=MSGBUS_TIMEOUT_S, capture_output=True, check=False
        )
        if result.returncode != 0:
            log.debug(
                "msgbus.sh send rc=%d (source=%s severity=%s): %s",
                result.returncode, source, severity,
                (result.stderr or b"").decode(errors="replace").strip(),
            )
            return False
        return True
    except (subprocess.TimeoutExpired, OSError) as e:
        log.debug(
            "msgbus.sh send failed (source=%s severity=%s): %s",
            source, severity, e,
        )
        return False
