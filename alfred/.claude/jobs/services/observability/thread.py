"""Thread-id correlation primitive for Nexus observability.

Mirrors the precedence rules in lib/audit-log.sh:

  1. NEXUS_THREAD_ID env (set by dispatcher at cycle entry)
  2. Explicit override arg (legacy correlation_id call sites)
  3. NEXUS_CORRELATION_ID env (legacy fallback)
  4. FAIL-CLOSED unless AUDIT_THREAD_ENFORCE=0
"""
import os
import random
import time

AUDIT_THREAD_ENFORCE_DEFAULT = "1"


def get_thread_id(override: str | None = None, *, enforce: bool | None = None) -> str | None:
    """Resolve the active NEXUS_THREAD_ID.

    Returns the thread id string when found; returns None when missing and
    enforcement is on (callers should treat None as "refuse to write").
    Returns a synthetic id when enforcement is off.

    Args:
        override: explicit value to use if env vars are unset.
        enforce: if True, return None when no real id is present;
                 if False, generate a synthetic id when missing;
                 if None (default), read AUDIT_THREAD_ENFORCE env var (1=on).
    """
    tid = os.environ.get("NEXUS_THREAD_ID") or None
    if tid:
        return tid

    if override:
        return override

    legacy = os.environ.get("NEXUS_CORRELATION_ID") or None
    if legacy:
        return legacy

    if enforce is None:
        enforce_env = os.environ.get("AUDIT_THREAD_ENFORCE", AUDIT_THREAD_ENFORCE_DEFAULT)
        enforce = enforce_env != "0"

    if enforce:
        return None

    # Synthetic fallback (matches bash: date +%s-PID-RANDOM)
    return f"{int(time.time())}-{os.getpid()}-{random.randint(0, 2**15 - 1)}"


def get_parent_id() -> str | None:
    """Return NEXUS_PARENT_ID env if set (Phase 5.5 sub-thread support)."""
    return os.environ.get("NEXUS_PARENT_ID") or None


def ensure_thread_id() -> str:
    """Either return the active thread id or self-generate + export one.

    Use this at service entry points (executor.py, evaluate.py, etc.) when
    the service may run independently of dispatcher (cron, manual invocation).
    """
    tid = os.environ.get("NEXUS_THREAD_ID")
    if tid:
        return tid
    tid = f"{int(time.time())}-{os.getpid()}-{random.randint(0, 2**15 - 1)}"
    os.environ["NEXUS_THREAD_ID"] = tid
    return tid
