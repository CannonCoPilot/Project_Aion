"""Resolve secrets for Aion Python scripts.

Single rule: env var first, then credentials.yaml, then FAIL LOUD. There is no
hardcoded fallback, deliberately — see WHY below.

    from aion_credentials import require_credential
    NEO4J_PASSWORD = require_credential("NEO4J_PASSWORD", ".database.neo4j.password")

WHY NO DEFAULT
--------------
Until 2026-08-24 these scripts read:

    NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "<the literal password>")

That default was the ONLY reason nightly L5 ingest worked, because jicm-watcher.sh
launches the ingest exporting just PROJECT_DIR / JICM_COMPRESSED_FILE /
GRAPHITI_GROUP_ID. So the hardcoded secret was load-bearing infrastructure in a
PUBLIC repo, and deleting it without a resolver would have broken L5 silently at
3am. The resolver has to land BEFORE the literals come out. This module is that step.

A missing credential now raises at import time with the exact remedy, rather than
surfacing 500 seconds later as an opaque Neo4j auth error inside a timeout-bounded
child whose stderr nobody reads.

WHY IT SHELLS OUT
-----------------
credentials.yaml is multi-document and mikefarah yq rejects jq's `// empty` idiom;
both traps silently return a WRONG or EMPTY secret. get-credential.sh documents and
handles them. Re-implementing the parse here would fork that knowledge, and the
system python3 has no PyYAML anyway. One implementation, one place to fix.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

_RESOLVER = Path(__file__).resolve().parent / "get-credential.sh"


class CredentialError(RuntimeError):
    """A required secret could not be resolved from env or credentials.yaml."""


def lookup_credential(yaml_path: str) -> str | None:
    """Return the secret at `yaml_path` in credentials.yaml, or None."""
    if not _RESOLVER.is_file():
        return None
    try:
        proc = subprocess.run(
            ["bash", str(_RESOLVER), yaml_path],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    # .strip() only — never .split(), a secret may legitimately contain spaces.
    return proc.stdout.strip() or None


def require_credential(env_var: str, yaml_path: str) -> str:
    """Env var, else credentials.yaml, else raise with the remedy spelled out.

    Env wins so a caller can override per-process (tests, an alternate Neo4j)
    without touching the secret store.
    """
    value = os.getenv(env_var)
    if value:
        return value
    value = lookup_credential(yaml_path)
    if value:
        return value
    raise CredentialError(
        f"{env_var} is not set and {yaml_path} is not resolvable from "
        f"credentials.yaml.\n"
        f"  Fix: set {yaml_path} in .claude/secrets/credentials.yaml "
        f"(gitignored), or export {env_var}.\n"
        f"  Check: bash {_RESOLVER} {yaml_path}"
    )
