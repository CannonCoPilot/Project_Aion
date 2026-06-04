"""
Tool catalog ingestion for /personas page (Phase 1.1).

Walks Alfred + Jarvis workspaces + plugin marketplaces, populates pulse.tool_catalog.

Sources (per design §6.3):
  • Skills:  <workspace>/.claude/skills/*/SKILL.md
  • Commands: <workspace>/.claude/commands/*.md
  • MCPs:    <workspace>/.mcp.json (+ infrastructure/.mcp.json on Jarvis)
  • Plugins: ~/.claude/plugins/installed_plugins.json
             ~/.claude/plugins/marketplaces/*/external_plugins/*/.mcp.json
  • Built-ins: hard-coded inventory

tool_id format:
  skill:<Alfred|Jarvis>:<name>        e.g. "skill:Alfred:dev-ops"
  command:<Alfred|Jarvis>:<name>      e.g. "command:Jarvis:reflect"
  mcp:<workspace>:<server_name>       e.g. "mcp:Jarvis:jarvis-rag"
  mcp:plugin:<plugin_name>:<server>   e.g. "mcp:plugin:asana:asana-server"
  builtin:<name>                      e.g. "builtin:Read"

Idempotent — re-running updates last_seen + description + source_path.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:
    import asyncpg  # type: ignore
except ImportError:
    asyncpg = None  # type: ignore  — host-mode discovery doesn't need DB

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None  # type: ignore  — frontmatter parse degrades gracefully

logger = logging.getLogger("tool-catalog-ingestion")

BUILTINS = [
    ("Read", "Read file contents"),
    ("Write", "Write file contents"),
    ("Edit", "Edit file in place"),
    ("Bash", "Execute shell command"),
    ("Grep", "Search file contents"),
    ("Glob", "Pattern file matching"),
    ("Task", "Spawn subagent for complex task"),
    ("TodoWrite", "Manage task list"),
    ("WebFetch", "Fetch URL content"),
    ("WebSearch", "Web search"),
    ("NotebookEdit", "Edit Jupyter notebook"),
    ("ListMcpResourcesTool", "List MCP server resources"),
    ("ReadMcpResourceTool", "Read MCP server resource"),
    ("SlashCommand", "Invoke slash command"),
    ("ExitPlanMode", "Exit plan mode"),
    ("BashOutput", "Read background shell output"),
    ("KillShell", "Kill background shell"),
]


def _infer_domain(name: str, family: str, description: str = "") -> str:
    """Semantic domain tag for permission routing (heuristic; refine in Phase 2)."""
    name_l = name.lower()
    desc_l = description.lower()
    blob = f"{name_l} {desc_l}"
    if any(k in blob for k in ("rag", "embedding", "vector", "qdrant", "semantic")):
        return "rag"
    if any(k in blob for k in ("memory", "knowledge", "graphiti", "neo4j")):
        return "memory"
    if any(k in blob for k in ("git", "github", "commit", "branch", "pr ")):
        return "git"
    if any(k in blob for k in ("docker", "compose", "container")):
        return "docker"
    if any(k in blob for k in ("test", "playwright", "pytest", "jest")):
        return "testing"
    if any(k in blob for k in ("research", "search", "web", "fetch")):
        return "search"
    if any(k in blob for k in ("doc", "word", "excel", "pdf", "powerpoint", "spreadsheet")):
        return "doc"
    if any(k in blob for k in ("file", "fs", "path", "directory")):
        return "filesystem"
    if any(k in blob for k in ("pulse", "task", "ticket")):
        return "task-mgmt"
    if any(k in blob for k in ("jicm", "context", "compress")):
        return "context-ops"
    if family == "Built-in":
        return "builtin"
    return family.lower()


def _read_first_paragraph(md_path: Path, max_chars: int = 280) -> str:
    try:
        text = md_path.read_text(errors="replace")
    except OSError:
        return ""
    if text.startswith("---"):
        end = text.find("---", 3)
        if end > 0:
            text = text[end + 3:]
    for para in re.split(r"\n\s*\n", text.strip()):
        para = para.strip()
        if para and not para.startswith("#"):
            return para[:max_chars].replace("\n", " ")
    return ""


def _read_frontmatter_description(md_path: Path) -> Optional[str]:
    try:
        text = md_path.read_text(errors="replace")
    except OSError:
        return None
    if not text.startswith("---"):
        return None
    end = text.find("---", 3)
    if end <= 0:
        return None
    if yaml is None:
        # fallback: scan for "description: ..." line
        for line in text[3:end].splitlines():
            if line.strip().startswith("description:"):
                return line.split(":", 1)[1].strip()
        return None
    try:
        meta = yaml.safe_load(text[3:end]) or {}
    except Exception:  # noqa: BLE001 — yaml.YAMLError when available
        return None
    desc = meta.get("description")
    return desc.strip() if isinstance(desc, str) else None


def discover_skills(workspace_root: Path, workspace_label: str) -> List[Dict[str, Any]]:
    skills_dir = workspace_root / ".claude" / "skills"
    if not skills_dir.exists():
        return []
    tools = []
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_") or entry.name.startswith("."):
            continue
        skill_md = entry / "SKILL.md"
        description = ""
        if skill_md.exists():
            description = _read_frontmatter_description(skill_md) or _read_first_paragraph(skill_md)
        tools.append({
            "tool_id": f"skill:{workspace_label}:{entry.name}",
            "name": entry.name,
            "family": "Skill",
            "source_workspace": workspace_label,
            "source_path": str(entry),
            "domain": _infer_domain(entry.name, "Skill", description),
            "description": description,
        })
    return tools


def discover_commands(workspace_root: Path, workspace_label: str) -> List[Dict[str, Any]]:
    cmds_dir = workspace_root / ".claude" / "commands"
    if not cmds_dir.exists():
        return []
    tools = []
    for entry in sorted(cmds_dir.iterdir()):
        if not entry.is_file() or entry.suffix != ".md":
            continue
        if entry.name.startswith("_") or entry.name.startswith("."):
            continue
        name = entry.stem
        description = _read_frontmatter_description(entry) or _read_first_paragraph(entry)
        tools.append({
            "tool_id": f"command:{workspace_label}:{name}",
            "name": name,
            "family": "Command",
            "source_workspace": workspace_label,
            "source_path": str(entry),
            "domain": _infer_domain(name, "Command", description),
            "description": description,
        })
    return tools


def discover_mcps_in_file(mcp_json_path: Path, workspace_label: str) -> List[Dict[str, Any]]:
    if not mcp_json_path.exists():
        return []
    try:
        data = json.loads(mcp_json_path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not parse %s: %s", mcp_json_path, exc)
        return []
    servers = data.get("mcpServers", {})
    tools = []
    for srv_name, srv_cfg in servers.items():
        cmd_summary = srv_cfg.get("command", "") if isinstance(srv_cfg, dict) else ""
        if isinstance(srv_cfg, dict) and srv_cfg.get("args"):
            cmd_summary = f"{cmd_summary} {' '.join(srv_cfg['args'][:3])}"
        tools.append({
            "tool_id": f"mcp:{workspace_label}:{srv_name}",
            "name": srv_name,
            "family": "MCP",
            "source_workspace": workspace_label,
            "source_path": str(mcp_json_path),
            "domain": _infer_domain(srv_name, "MCP", cmd_summary),
            "description": (cmd_summary or "MCP server").strip()[:280],
        })
    return tools


def discover_plugin_mcps(plugins_root: Path) -> List[Dict[str, Any]]:
    tools = []
    marketplaces = plugins_root / "marketplaces"
    if marketplaces.exists():
        for mp_dir in marketplaces.iterdir():
            ext_dir = mp_dir / "external_plugins"
            if not ext_dir.exists():
                continue
            for plugin_dir in ext_dir.iterdir():
                mcp_json = plugin_dir / ".mcp.json"
                if not mcp_json.exists():
                    continue
                try:
                    data = json.loads(mcp_json.read_text())
                except (json.JSONDecodeError, OSError):
                    continue
                for srv_name, srv_cfg in data.get("mcpServers", {}).items():
                    desc = ""
                    if isinstance(srv_cfg, dict):
                        desc = srv_cfg.get("command", "")
                    tools.append({
                        "tool_id": f"mcp:plugin:{plugin_dir.name}:{srv_name}",
                        "name": f"{plugin_dir.name}/{srv_name}",
                        "family": "MCP",
                        "source_workspace": "plugin",
                        "source_path": str(mcp_json),
                        "domain": _infer_domain(srv_name, "MCP", desc),
                        "description": (desc or f"Plugin MCP from {plugin_dir.name}")[:280],
                    })
    installed = plugins_root / "installed_plugins.json"
    if installed.exists():
        try:
            reg = json.loads(installed.read_text())
        except (json.JSONDecodeError, OSError):
            reg = {}
        if isinstance(reg, dict):
            for plugin_name, meta in reg.items():
                if not isinstance(meta, dict):
                    continue
                tools.append({
                    "tool_id": f"plugin:installed:{plugin_name}",
                    "name": plugin_name,
                    "family": "Skill",
                    "source_workspace": "plugin",
                    "source_path": str(installed),
                    "domain": _infer_domain(plugin_name, "Skill"),
                    "description": (meta.get("description", "") or f"Installed plugin: {plugin_name}")[:280],
                })
    return tools


def discover_builtins() -> List[Dict[str, Any]]:
    return [
        {
            "tool_id": f"builtin:{name}",
            "name": name,
            "family": "Built-in",
            "source_workspace": "Jarvis",
            "source_path": None,
            "domain": _infer_domain(name, "Built-in", desc),
            "description": desc,
        }
        for name, desc in BUILTINS
    ]


def discover_all(alfred_root: Path, jarvis_root: Path, plugins_root: Path) -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    if alfred_root.exists():
        tools += discover_skills(alfred_root, "Alfred")
        tools += discover_commands(alfred_root, "Alfred")
        tools += discover_mcps_in_file(alfred_root / ".mcp.json", "Alfred")
    if jarvis_root.exists():
        tools += discover_skills(jarvis_root, "Jarvis")
        tools += discover_commands(jarvis_root, "Jarvis")
        tools += discover_mcps_in_file(jarvis_root / ".mcp.json", "Jarvis")
        tools += discover_mcps_in_file(jarvis_root / "infrastructure" / ".mcp.json", "Jarvis")
    if plugins_root.exists():
        tools += discover_plugin_mcps(plugins_root)
    tools += discover_builtins()
    return tools


async def upsert_tools(conn: "asyncpg.Connection", tools: Iterable[Dict[str, Any]]) -> int:
    count = 0
    for t in tools:
        await conn.execute(
            """
            INSERT INTO pulse.tool_catalog
              (tool_id, name, family, source_workspace, source_path, domain, description, ingested_at, last_seen)
            VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
            ON CONFLICT (tool_id) DO UPDATE SET
              name = EXCLUDED.name,
              family = EXCLUDED.family,
              source_workspace = EXCLUDED.source_workspace,
              source_path = EXCLUDED.source_path,
              domain = EXCLUDED.domain,
              description = EXCLUDED.description,
              last_seen = now()
            """,
            t["tool_id"], t["name"], t["family"], t["source_workspace"],
            t.get("source_path"), t.get("domain"), t.get("description"),
        )
        count += 1
    return count


async def ingest_tool_catalog(conn: "asyncpg.Connection", roots: Dict[str, Path]) -> Dict[str, int]:
    """In-process ingestion (callable from pulse startup once paths mounted)."""
    tools = discover_all(
        roots.get("alfred", Path("/workspace")),
        roots.get("jarvis", Path("/workspace/jarvis")),
        roots.get("plugins", Path("/root/.claude/plugins")),
    )
    upserted = await upsert_tools(conn, tools)
    family_counts: Dict[str, int] = {}
    for t in tools:
        family_counts[t["family"]] = family_counts.get(t["family"], 0) + 1
    return {"total": upserted, **family_counts}


async def main_async(args: argparse.Namespace) -> int:
    tools = discover_all(
        Path(args.alfred_root),
        Path(args.jarvis_root),
        Path(args.plugins_root),
    )
    print(f"Discovered {len(tools)} tools")
    if args.dry_run:
        for t in tools[:10]:
            print(f"  {t['tool_id']:60s} [{t['family']:10s}] {t['domain']:15s} {t['name']}")
        if len(tools) > 10:
            print(f"  ... and {len(tools) - 10} more")
        return 0
    if args.emit_sql:
        # Stream INSERT statements to stdout for psql consumption
        print("BEGIN;")
        for t in tools:
            cols = ["tool_id", "name", "family", "source_workspace", "source_path", "domain", "description"]
            def _esc(v):
                if v is None:
                    return "NULL"
                return "'" + str(v).replace("'", "''") + "'"
            vals = ", ".join(_esc(t.get(c)) for c in cols)
            print(f"""INSERT INTO pulse.tool_catalog ({', '.join(cols)}, ingested_at, last_seen)
VALUES ({vals}, now(), now())
ON CONFLICT (tool_id) DO UPDATE SET
  name = EXCLUDED.name, family = EXCLUDED.family,
  source_workspace = EXCLUDED.source_workspace, source_path = EXCLUDED.source_path,
  domain = EXCLUDED.domain, description = EXCLUDED.description, last_seen = now();""")
        print("COMMIT;")
        return 0
    if asyncpg is None:
        print("ERROR: asyncpg not installed. Use --emit-sql to generate SQL, or install asyncpg.", file=sys.stderr)
        return 1
    conn = await asyncpg.connect(
        host=args.db_host, port=args.db_port, database=args.db_name,
        user=args.db_user, password=args.db_password,
    )
    try:
        upserted = await upsert_tools(conn, tools)
        print(f"Upserted {upserted} rows into pulse.tool_catalog")
        family_counts: Dict[str, int] = {}
        for t in tools:
            family_counts[t["family"]] = family_counts.get(t["family"], 0) + 1
        for fam, cnt in sorted(family_counts.items()):
            print(f"  {fam}: {cnt}")
    finally:
        await conn.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Tool catalog ingestion for /personas Phase 1.1")
    parser.add_argument("--alfred-root", required=True)
    parser.add_argument("--jarvis-root", required=True)
    parser.add_argument("--plugins-root", default=str(Path.home() / ".claude" / "plugins"))
    parser.add_argument("--db-host", default="localhost")
    parser.add_argument("--db-port", type=int, default=5432)
    parser.add_argument("--db-name", default="pulse_dev")
    parser.add_argument("--db-user", default="pulse_dev")
    parser.add_argument("--db-password", default=os.environ.get("PULSE_DEV_DB_PASSWORD", ""))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--emit-sql", action="store_true", help="emit SQL INSERT statements to stdout (no asyncpg required)")
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
