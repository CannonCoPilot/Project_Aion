#!/usr/bin/env python3
"""
Schema v1→v2 migration for persona config.yaml files (Phase 1.1 item 8).

Per v5 design §6.5 + §6.8:
  • Removes hard-coded execution limits (max_turns, max_budget_usd, timeout_minutes)
    from each persona's config.yaml — observation tunnel replaces these as runtime
    safeguards.
  • Archives the removed values to pulse.persona_metadata.legacy_limits JSONB so the
    1-release-cycle revert path remains open.
  • Sets schema_version: 2 in config.yaml.

Per-persona transaction with rollback:
  1. Snapshot original config.yaml (held in memory)
  2. UPDATE persona_metadata SET legacy_limits + schema_version=2 (in DB transaction)
  3. Rewrite config.yaml without limits + with schema_version
  4. Commit DB transaction
  If step 3 fails (e.g. read-only filesystem), DB transaction rolls back and original
  config.yaml is preserved untouched.

Two modes:
  --dry-run  : report what would be migrated; no writes
  (default)  : execute migration with per-persona transactions

Idempotent: skips personas whose config already has schema_version >= 2.

Usage:
  python3 migrate_persona_schema_v1_to_v2.py \
    --personas-root /path/to/personas \
    --db-host localhost --db-port 5432 \
    --db-name pulse_dev --db-user pulse_dev \
    --db-password "$PW"
  python3 migrate_persona_schema_v1_to_v2.py --personas-root <root> --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml  # type: ignore
except ImportError:
    print("ERROR: pyyaml required (pip install pyyaml)", file=sys.stderr)
    sys.exit(1)

try:
    import asyncpg  # type: ignore
except ImportError:
    asyncpg = None  # dry-run still works without DB

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [migrate-v1-v2] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("migrate-v1-v2")

LIMIT_FIELDS = {"max_turns", "max_budget_usd", "timeout_minutes"}


def load_config(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return yaml.safe_load(path.read_text()) or {}
    except yaml.YAMLError as exc:
        log.warning("YAML parse error in %s: %s", path, exc)
        return None


def extract_legacy_limits(config: Dict[str, Any]) -> Dict[str, Any]:
    """Pull legacy limit values from config (limits: block + top-level fallback)."""
    legacy: Dict[str, Any] = {}
    limits_block = config.get("limits") or {}
    if isinstance(limits_block, dict):
        for k in LIMIT_FIELDS:
            if k in limits_block:
                legacy[k] = limits_block[k]
    # Some configs might have top-level limits (defensive)
    for k in LIMIT_FIELDS:
        if k in config and k not in legacy:
            legacy[k] = config[k]
    return legacy


def strip_limits_and_set_version(config: Dict[str, Any]) -> Dict[str, Any]:
    """Return new config with limits removed + schema_version: 2 set."""
    new = {k: v for k, v in config.items() if k not in LIMIT_FIELDS}
    new.pop("limits", None)
    new["schema_version"] = 2
    return new


def discover_personas(root: Path) -> List[Tuple[str, Path]]:
    """Returns list of (persona_name, config_path) tuples."""
    personas = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        cfg = entry / "config.yaml"
        if cfg.exists():
            personas.append((entry.name, cfg))
    return personas


async def migrate_one(
    conn: "asyncpg.Connection",
    persona_name: str,
    config_path: Path,
    dry_run: bool,
) -> Dict[str, Any]:
    """Migrate a single persona. Returns status dict."""
    config = load_config(config_path)
    if config is None:
        return {"persona": persona_name, "status": "skipped", "reason": "config not loadable"}
    current_version = config.get("schema_version", 1)
    if isinstance(current_version, int) and current_version >= 2:
        return {"persona": persona_name, "status": "already-migrated", "schema_version": current_version}
    legacy = extract_legacy_limits(config)
    new_config = strip_limits_and_set_version(config)
    if dry_run:
        return {
            "persona": persona_name,
            "status": "would-migrate",
            "legacy_limits": legacy,
            "had_limits_block": "limits" in config,
        }
    # Per-persona transaction
    async with conn.transaction():
        await conn.execute(
            """
            UPDATE pulse.persona_metadata
            SET legacy_limits = $1, schema_version = 2
            WHERE name = $2
            """,
            json.dumps(legacy) if legacy else None,
            persona_name,
        )
        # Filesystem rewrite is OUTSIDE the DB transaction normally, but we want
        # rollback semantics, so we write to a temp path first, then atomically
        # rename. If the rename fails the DB transaction won't commit.
        tmp_path = config_path.with_suffix(".yaml.tmp")
        try:
            tmp_path.write_text(yaml.safe_dump(new_config, default_flow_style=False, sort_keys=False))
            tmp_path.replace(config_path)
        except OSError as exc:
            # Force transaction rollback by raising
            tmp_path.unlink(missing_ok=True)
            raise RuntimeError(f"filesystem write failed for {persona_name}: {exc}")
    return {
        "persona": persona_name,
        "status": "migrated",
        "legacy_limits": legacy,
    }


async def main_async(args: argparse.Namespace) -> int:
    root = Path(args.personas_root)
    if not root.exists():
        log.error("personas root does not exist: %s", root)
        return 1
    personas = discover_personas(root)
    log.info("discovered %d personas under %s", len(personas), root)
    if args.dry_run:
        results = []
        for name, cfg in personas:
            result = await migrate_one(None, name, cfg, dry_run=True)
            results.append(result)
        for r in results:
            print(f"  [{r['status']:18s}] {r['persona']:30s} {r.get('legacy_limits') or ''}")
        would = sum(1 for r in results if r["status"] == "would-migrate")
        already = sum(1 for r in results if r["status"] == "already-migrated")
        skipped = sum(1 for r in results if r["status"] == "skipped")
        print(f"\nSummary: {would} to migrate, {already} already at v2, {skipped} skipped")
        return 0
    if asyncpg is None:
        log.error("asyncpg required for actual migration (use --dry-run for analysis)")
        return 1
    conn = await asyncpg.connect(
        host=args.db_host, port=args.db_port, database=args.db_name,
        user=args.db_user, password=args.db_password,
    )
    try:
        migrated = 0
        skipped = 0
        already = 0
        failed = []
        for name, cfg in personas:
            try:
                result = await migrate_one(conn, name, cfg, dry_run=False)
                if result["status"] == "migrated":
                    migrated += 1
                    log.info("migrated %s legacy=%s", name, result.get("legacy_limits"))
                elif result["status"] == "already-migrated":
                    already += 1
                else:
                    skipped += 1
            except Exception as exc:  # noqa: BLE001 — record per-persona failures, continue with others
                failed.append((name, str(exc)))
                log.error("failed to migrate %s: %s", name, exc)
        log.info("migration complete: migrated=%d already-v2=%d skipped=%d failed=%d",
                 migrated, already, skipped, len(failed))
        for name, err in failed:
            log.error("  failure: %s — %s", name, err)
        return 0 if not failed else 2
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate persona config.yaml v1→v2")
    parser.add_argument("--personas-root", required=True)
    parser.add_argument("--db-host", default="localhost")
    parser.add_argument("--db-port", type=int, default=5432)
    parser.add_argument("--db-name", default="pulse_dev")
    parser.add_argument("--db-user", default="pulse_dev")
    parser.add_argument("--db-password", default=os.environ.get("PULSE_DEV_DB_PASSWORD", ""))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
