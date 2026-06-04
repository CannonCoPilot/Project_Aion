#!/usr/bin/env python3
"""
Backfill pulse.persona_tool_assignments from filesystem permissions.yaml +
cluster/tier heuristic for Commands + Skills + orphan recovery.

Designed to run inside the aifred-dev-pulse container, which has asyncpg,
PyYAML, the pulse_dev DB on the docker network, and /jobs/personas bind-mounted.

Usage:
    docker cp .../backfill_persona_tool_assignments.py aifred-dev-pulse:/tmp/
    docker exec aifred-dev-pulse python3 /tmp/backfill_persona_tool_assignments.py --dry-run
    docker exec aifred-dev-pulse python3 /tmp/backfill_persona_tool_assignments.py
"""
import argparse
import asyncio
import os
from pathlib import Path

import asyncpg
import yaml

PERSONAS_DIR = Path('/jobs/personas')
ASSIGNED_BY = 'backfill-2026-05-14'

# Cluster keyword matches against tool name + domain (lowercase substring)
CLUSTER_KEYWORDS = {
    'Engineering': ['analyze', 'codebase', 'build', 'test', 'git', 'docker',
                    'deploy', 'dev', 'eng', 'lint', 'commit', 'review'],
    'Quality':     ['test', 'review', 'audit', 'security', 'lint', 'bug', 'qa',
                    'validate', 'check', 'verify'],
    'Research':    ['search', 'fetch', 'research', 'analyze', 'investig',
                    'rag', 'memory', 'knowledge', 'context'],
    'Creative':    ['write', 'content', 'doc', 'create', 'design', 'compose',
                    'present'],
    'Planner':     ['plan', 'orchestr', 'task', 'project', 'manage', 'pulse',
                    'schedule', 'queue'],
}

# Tier-based tool quota for Commands+Skills inference pass (Pass 4)
TIER_QUOTA = {'A': 8, 'B': 6, 'C': 18, 'D': 28}

# Built-in tools every persona gets at minimum (read + bash visibility)
BUILTIN_BASELINE = ['builtin:Read', 'builtin:Glob', 'builtin:Grep']


def infer_cluster_from_name(pname: str, declared_cluster) -> str:
    """For personas without an explicit cluster in metadata, infer one."""
    if declared_cluster:
        return declared_cluster
    p = pname.lower()
    if any(k in p for k in ['executor', 'fix', 'investigator', 'eng', 'deploy']):
        return 'Engineering'
    if any(k in p for k in ['review', 'verdict', 'test', 'audit', 'security', 'bug']):
        return 'Quality'
    if any(k in p for k in ['research', 'analyst', 'cortex', 'librarian', 'context', 'invest']):
        return 'Research'
    if any(k in p for k in ['orchestr', 'project', 'plan', 'task-eval', 'evaluat']):
        return 'Planner'
    if any(k in p for k in ['aurora', 'creative', 'content', 'writer', 'present', 'thinker', 'builder']):
        return 'Creative'
    return 'Research'  # broad default


def resolve_yaml_tool(tool_ref: str, catalog_index: dict) -> str | None:
    """Map a YAML tool reference to a tool_catalog tool_id.

    Examples:
        'Read'                            -> 'builtin:Read'
        'mcp__filesystem__read_text_file' -> 'mcp:Alfred:mcp-gateway' (umbrella)
        'mcp__git__git_status'            -> 'mcp:Alfred:mcp-gateway' (umbrella)
    """
    if tool_ref in catalog_index:
        return tool_ref  # already a full tool_id
    bi = f'builtin:{tool_ref}'
    if bi in catalog_index:
        return bi
    if tool_ref.startswith('mcp__'):
        # YAML's mcp__<ns>__<op> doesn't map 1:1 to catalog. The catalog tracks
        # MCP servers; mcp-gateway is the umbrella for filesystem/git/etc ops.
        return 'mcp:Alfred:mcp-gateway' if 'mcp:Alfred:mcp-gateway' in catalog_index else None
    return None


def choose_orphan_owner(tool_info: dict) -> str:
    """For a tool unassigned after Passes 1-4, pick a sensible Tier D owner."""
    name = (tool_info.get('name') or '').lower()
    domain = (tool_info.get('domain') or '').lower()

    pairs = [
        (['git', 'docker', 'deploy', 'compose'], 'infrastructure-deployer'),
        (['test', 'lint', 'jest', 'vitest'],     'test-reviewer'),
        (['secur', 'audit', 'cve'],              'security-reviewer'),
        (['research', 'search', 'web', 'rag'],   'researcher'),
        (['context', 'memory', 'knowledge'],     'analyst'),
        (['doc', 'write', 'content'],            'content-writer'),
        (['orchestr', 'task', 'pulse', 'queue'], 'orchestrator'),
        (['design', 'creat', 'compose'],         'creative-builder'),
        (['plan', 'project', 'manage'],          'project-manager'),
    ]
    for keywords, owner in pairs:
        if any(kw in name or kw in domain for kw in keywords):
            return owner
    # Fallback: analyst is a broad-utility Tier D Research persona
    return 'analyst'


async def main(args):
    conn = await asyncpg.connect(
        host=os.environ.get('PULSE_DB_HOST', 'localhost'),
        port=int(os.environ.get('PULSE_DB_PORT', '5432')),
        user=os.environ.get('PULSE_DB_USER', 'pulse_dev'),
        password=os.environ.get('PULSE_DB_PASSWORD', ''),
        database=os.environ.get('PULSE_DB_NAME', 'pulse_dev'),
    )
    try:
        # ---- Load substrate ----
        personas = await conn.fetch(
            "SELECT name, tier, cluster FROM pulse.persona_metadata "
            "WHERE status != 'soft_deleted' ORDER BY tier, name"
        )
        tools = await conn.fetch(
            "SELECT tool_id, family, domain, name FROM pulse.tool_catalog"
        )
        catalog_index = {t['tool_id']: dict(t) for t in tools}
        print(f"Loaded {len(personas)} personas, {len(catalog_index)} catalog tools")

        # ---- Build assignments via 5 passes ----
        assignments: dict[tuple[str, str], tuple[str, str, str]] = {}
        # key = (persona, tool_id); value = (state, source-tag, assigned_by)

        def add(persona: str, tool_id: str, state: str, source: str):
            key = (persona, tool_id)
            # Deny wins over allow if both passes try to set the same (persona,tool)
            existing = assignments.get(key)
            if existing is None:
                assignments[key] = (state, source, ASSIGNED_BY)
            elif existing[0] == 'allowed' and state == 'denied':
                assignments[key] = (state, source, ASSIGNED_BY)

        # ----- Pass 1+2: YAML transcription (29 personas with permissions.yaml) -----
        yaml_personas = set()
        unresolved_refs = {}  # tool_ref -> count
        for p in personas:
            pname = p['name']
            yaml_path = PERSONAS_DIR / pname / 'permissions.yaml'
            if not yaml_path.exists():
                continue
            yaml_personas.add(pname)
            spec = yaml.safe_load(yaml_path.read_text()) or {}
            for ref in (spec.get('allowed_tools') or []):
                tid = resolve_yaml_tool(ref, catalog_index)
                if tid:
                    add(pname, tid, 'allowed', 'yaml-allow')
                else:
                    unresolved_refs[ref] = unresolved_refs.get(ref, 0) + 1
            for ref in (spec.get('denied_tools') or []):
                tid = resolve_yaml_tool(ref, catalog_index)
                if tid:
                    add(pname, tid, 'denied', 'yaml-deny')
                else:
                    unresolved_refs[ref] = unresolved_refs.get(ref, 0) + 1
        pass1_count = len(assignments)
        print(f"  Pass 1-2 YAML transcription: {pass1_count} assignments "
              f"across {len(yaml_personas)} personas")

        # ----- Pass 3: Personas without YAML get Builtin baseline + cluster-default -----
        gap_personas = [p for p in personas if p['name'] not in yaml_personas]
        for p in gap_personas:
            for bi in BUILTIN_BASELINE:
                if bi in catalog_index:
                    add(p['name'], bi, 'allowed', 'gap-builtin')
            # test-* personas: also add Write+Edit (they author tests)
            for extra in ['builtin:Write', 'builtin:Edit', 'builtin:Bash']:
                if extra in catalog_index:
                    add(p['name'], extra, 'allowed', 'gap-builtin')
        pass3_count = len(assignments) - pass1_count
        print(f"  Pass 3 gap-fill personas ({len(gap_personas)} personas without YAML): "
              f"+{pass3_count} assignments — {[p['name'] for p in gap_personas]}")

        # ----- Pass 4: Cluster + tier heuristic for Commands + Skills -----
        # YAMLs never reference Commands or Skills. v2 catalog adds them as
        # first-class entries; we grant per cluster keyword match × tier quota.
        cmd_skill_pool = [
            (tid, t) for tid, t in catalog_index.items()
            if t['family'] in ('Command', 'Skill')
        ]
        pass4_start = len(assignments)
        for p in personas:
            pname = p['name']
            tier = p['tier']
            cluster = infer_cluster_from_name(pname, p.get('cluster'))
            keywords = CLUSTER_KEYWORDS.get(cluster, [])
            # Score each pool entry by keyword hits in (name + domain)
            scored = []
            for tid, ti in cmd_skill_pool:
                hay = (
                    (ti.get('name') or '').lower() + ' '
                    + (ti.get('domain') or '').lower() + ' '
                    + (ti.get('tool_id') or '').lower()
                )
                score = sum(1 for kw in keywords if kw in hay)
                if score > 0:
                    scored.append((score, tid))
            scored.sort(key=lambda r: (-r[0], r[1]))  # high score first, stable
            quota = TIER_QUOTA.get(tier, 18)
            granted = 0
            for _, tid in scored:
                if granted >= quota:
                    break
                if (pname, tid) in assignments:
                    continue  # YAML already covered or duplicate
                add(pname, tid, 'allowed', f'cluster-{cluster.lower()}')
                granted += 1
        pass4_count = len(assignments) - pass4_start
        print(f"  Pass 4 cluster heuristic (Commands+Skills): +{pass4_count} assignments")

        # ----- Pass 5: Orphan recovery -----
        assigned_tool_ids = set(tid for (_, tid) in assignments.keys())
        orphans = [tid for tid in catalog_index if tid not in assigned_tool_ids]
        pass5_start = len(assignments)
        for tid in orphans:
            owner = choose_orphan_owner(catalog_index[tid])
            add(owner, tid, 'allowed', 'orphan-recovery')
        pass5_count = len(assignments) - pass5_start
        print(f"  Pass 5 orphan recovery: +{pass5_count} assignments "
              f"({len(orphans)} orphan tools)")

        # ---- Stats ----
        total = len(assignments)
        allowed = sum(1 for v in assignments.values() if v[0] == 'allowed')
        denied = sum(1 for v in assignments.values() if v[0] == 'denied')
        per_persona = {}
        for (pname, _), _ in assignments.items():
            per_persona[pname] = per_persona.get(pname, 0) + 1
        per_tool = {}
        for (_, tid), _ in assignments.items():
            per_tool[tid] = per_tool.get(tid, 0) + 1
        uncovered = [tid for tid in catalog_index if tid not in per_tool]

        print()
        print(f"Total: {total} ({allowed} allowed, {denied} denied)")
        print(f"Unique personas: {len(per_persona)} / {len(personas)}")
        print(f"Unique tools assigned: {len(per_tool)} / {len(catalog_index)}")
        print(f"Orphan tools after backfill: {len(uncovered)}")
        if uncovered:
            print(f"  Uncovered: {uncovered[:10]}{'...' if len(uncovered) > 10 else ''}")
        # Cardinality histogram
        print(f"\nAssignment cardinality by persona:")
        for p in personas:
            count = per_persona.get(p['name'], 0)
            print(f"  {p['tier']} {p['name']:30s}  {count:3d} tools")
        if unresolved_refs:
            print(f"\nUnresolved YAML refs (not in catalog): "
                  f"{sum(unresolved_refs.values())} occurrences, "
                  f"{len(unresolved_refs)} unique")
            sample = sorted(unresolved_refs.items(), key=lambda r: -r[1])[:10]
            for ref, cnt in sample:
                print(f"  {cnt:3d} × {ref}")

        if args.dry_run:
            print("\n*** DRY RUN — no DB writes performed. ***")
            return

        # ---- Apply ----
        rows = [
            (pname, tid, state, by)
            for (pname, tid), (state, _source, by) in assignments.items()
        ]
        async with conn.transaction():
            await conn.executemany(
                """
                INSERT INTO pulse.persona_tool_assignments
                    (persona_name, tool_id, state, assigned_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (persona_name, tool_id)
                DO UPDATE SET state = EXCLUDED.state,
                              assigned_by = EXCLUDED.assigned_by,
                              assigned_at = now()
                """,
                rows,
            )
        post = await conn.fetchval(
            "SELECT COUNT(*) FROM pulse.persona_tool_assignments"
        )
        print(f"\n*** WROTE {len(rows)} assignment rows. "
              f"DB total now: {post} ***")
    finally:
        await conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true',
                        help='Compute assignments but skip DB write')
    args = parser.parse_args()
    asyncio.run(main(args))
