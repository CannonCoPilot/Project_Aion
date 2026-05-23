#!/usr/bin/env python3
"""
Cache mechanics v5 — Arms E/F redesign (system-prompt strip-effect matrix).

Tests 3 strip modes × 2 topologies × multiple probes to characterize
exactly what `--system-prompt` strips and what remains accessible.

Strip modes:
  M-D: default (no flag) — full CC system prompt loads
  M-S: --system-prompt "<minimal>" — REPLACES default
  M-A: --append-system-prompt "<addendum>" — appends to default

Topologies:
  T-N: fresh UUID per call (no inheritance)
  T-R: --resume chain (3 sequential turns on one session per mode)

Probes (T-N matrix, per mode):
  A1: self-knowledge — Jarvis identity
  A2: self-knowledge — CLAUDE.md canonical task system
  B1: native tool — Bash
  C1: MCP awareness — list MCPs
  C2: MCP invocation — jarvis-rag search

Probes (T-R chain, per mode, sequential resume turns):
  TR1: list MCPs
  TR2: use jarvis-rag MCP
  TR3: use jarvis-pulse MCP

Output: .claude/scratch/cache-mechanics-v5/EF/strip-effect-results.json
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.request import urlopen

ROOT = Path('/Users/nathanielcannon/Claude/Jarvis')
OUT = ROOT / '.claude/scratch/cache-mechanics-v5/EF'
OUT.mkdir(parents=True, exist_ok=True)
BURN_RATE_URL = 'http://localhost:8800/api/v1/usage/burn-rate-curve'

MINIMAL_SP = 'You are Claude, an AI assistant. Reply concisely.'
APPEND_SP = 'When asked about MCPs or skills, list them by name explicitly.'

PROBES = {
    'A1': {
        'prompt': 'Reply in one sentence: what is your role per psyche/jarvis-identity.md?',
        'pass_regex': r'(?i)(jarvis|master archon|project aion)',
        'description': 'self-knowledge: identity',
    },
    'A2': {
        'prompt': 'Per CLAUDE.md, what is the canonical task system for this project? Reply with the API base URL.',
        'pass_regex': r'(?i)(pulse|localhost:8700)',
        'description': 'self-knowledge: CLAUDE.md content',
    },
    'B1': {
        'prompt': "Use the Bash tool to print today's date in ISO 8601 format (date -u +%Y-%m-%dT%H:%M:%SZ). Reply with just the timestamp.",
        'pass_regex': r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',
        'pass_tool': 'Bash',
        'description': 'native tool: Bash',
    },
    'C1': {
        'prompt': 'List the names of MCP servers you have access to in this project. Reply with just comma-separated names.',
        'pass_regex': r'(?i)(jarvis-rag|jarvis-graphiti|jarvis-pulse)',
        'description': 'MCP awareness',
    },
    'C2': {
        'prompt': "Use the jarvis-rag MCP's search tool to find any record about 'Anthropic'. Reply with the count of results returned.",
        'pass_tool_prefix': 'mcp__jarvis-rag',
        'description': 'MCP invocation: jarvis-rag',
    },
}

TR_PROBES = [
    ('TR1', 'List the names of MCP servers you have access to in this project. Reply with comma-separated names.',
     r'(?i)(jarvis-rag|jarvis-graphiti|jarvis-pulse)'),
    ('TR2', "Now use the jarvis-rag MCP search tool to find one record about 'Anthropic'. Reply with the result count.",
     None),  # tool-use based
    ('TR3', "Now use the jarvis-pulse MCP to list current tasks with status=pending. Reply with the task count.",
     None),
]


def snapshot_util() -> dict[str, Any]:
    try:
        with urlopen(BURN_RATE_URL, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        windows = data.get('windows', [])
        latest = max(windows, key=lambda w: w['window_reset']) if windows else {}
        pts = latest.get('points', [])
        last = pts[-1] if pts else {}
        raw = last.get('utilization')
        return {
            'util_pct': (raw * 100) if raw is not None else None,
            'captured_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
    except Exception as e:
        return {'error': str(e)}


def mode_flags(mode: str) -> list[str]:
    if mode == 'M-D':
        return []
    elif mode == 'M-S':
        return ['--system-prompt', MINIMAL_SP]
    elif mode == 'M-A':
        return ['--append-system-prompt', APPEND_SP]
    raise ValueError(f'unknown mode: {mode}')


PER_CELL_BUDGET_USD = 1.50  # circuit-breaker per call (M-D cells avg $0.85, max seen $1.25)
TOTAL_BUDGET_USD = 18.0     # cumulative abort threshold across the run


def run_one(args: list[str], prompt: str, timeout: int = 90) -> dict[str, Any]:
    cmd = ['claude', *args, '--max-budget-usd', str(PER_CELL_BUDGET_USD),
           '--output-format', 'json', '-p', prompt]
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'error': 'timeout', 'elapsed_s': timeout}
    elapsed = time.time() - t0
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {'error': 'invalid JSON', 'stdout': proc.stdout[:300],
                'stderr': proc.stderr[:300], 'elapsed_s': elapsed}
    usage = result.get('usage', {})
    # Extract tool names from messages, if present
    tool_names: list[str] = []
    msgs = result.get('messages') or []
    for m in msgs:
        content = m.get('content') if isinstance(m, dict) else None
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and c.get('type') == 'tool_use':
                    tool_names.append(c.get('name', '?'))
    # Some claude-code versions put tool_uses at top level
    for tu in (result.get('tool_uses') or []):
        if isinstance(tu, dict) and tu.get('name'):
            tool_names.append(tu['name'])
    return {
        'session_id': result.get('session_id'),
        'cache_creation': usage.get('cache_creation_input_tokens') or 0,
        'cache_read': usage.get('cache_read_input_tokens') or 0,
        'input_tokens': usage.get('input_tokens') or 0,
        'output_tokens': usage.get('output_tokens') or 0,
        'cost_usd': result.get('total_cost_usd') or 0,
        'response': (result.get('result') or '')[:500],
        'tool_uses': tool_names,
        'elapsed_s': round(elapsed, 2),
    }


def evaluate(probe_id: str, result: dict[str, Any]) -> dict[str, Any]:
    """Pass/fail for a probe based on response regex and/or tool presence."""
    if 'error' in result:
        return {'pass': False, 'reason': f"error: {result.get('error')}"}
    probe = PROBES.get(probe_id, {})
    response = result.get('response', '')
    tools = result.get('tool_uses', [])
    checks = []
    if probe.get('pass_regex'):
        m = re.search(probe['pass_regex'], response)
        checks.append(('regex', bool(m), probe['pass_regex']))
    if probe.get('pass_tool'):
        ok = probe['pass_tool'] in tools
        checks.append(('tool', ok, probe['pass_tool']))
    if probe.get('pass_tool_prefix'):
        ok = any(t.startswith(probe['pass_tool_prefix']) for t in tools)
        checks.append(('tool_prefix', ok, probe['pass_tool_prefix']))
    passed = all(c[1] for c in checks) if checks else False
    return {'pass': passed, 'checks': [{'kind': k, 'pass': p, 'criterion': c}
                                       for k, p, c in checks]}


def run_tn_matrix(running_total_ref: list[float]) -> list[dict[str, Any]]:
    """T-N: 3 modes × 5 probes = 15 cells, fresh UUID each. Aborts at TOTAL_BUDGET_USD."""
    cells = []
    for mode in ['M-D', 'M-S', 'M-A']:
        flags = mode_flags(mode)
        for probe_id, probe in PROBES.items():
            if running_total_ref[0] >= TOTAL_BUDGET_USD:
                print(f"  ABORT: cumulative ${running_total_ref[0]:.2f} >= ${TOTAL_BUDGET_USD}")
                return cells
            pre = snapshot_util()
            r = run_one(flags, probe['prompt'])
            running_total_ref[0] += (r.get('cost_usd') or 0)
            ev = evaluate(probe_id, r)
            rec = {
                'mode': mode, 'topology': 'T-N',
                'probe_id': probe_id, 'description': probe['description'],
                'pre_util_pct': pre.get('util_pct'),
                **r, **{'evaluation': ev},
            }
            cells.append(rec)
            print(f"  [{mode}/{probe_id}] {'PASS' if ev['pass'] else 'FAIL'} "
                  f"({r.get('elapsed_s', '?')}s, ${r.get('cost_usd', 0):.3f}, "
                  f"cum=${running_total_ref[0]:.2f}, "
                  f"tools={r.get('tool_uses', [])}, util={pre.get('util_pct')}%)")
    return cells


def run_tr_chain(running_total_ref: list[float]) -> list[dict[str, Any]]:
    """T-R: 3 modes × 3 cells via --resume chain. Aborts at TOTAL_BUDGET_USD."""
    cells = []
    for mode in ['M-D', 'M-S', 'M-A']:
        flags = mode_flags(mode)
        sid = None
        for idx, (probe_id, prompt, regex) in enumerate(TR_PROBES):
            if running_total_ref[0] >= TOTAL_BUDGET_USD:
                print(f"  ABORT (TR): cumulative ${running_total_ref[0]:.2f} >= ${TOTAL_BUDGET_USD}")
                return cells
            pre = snapshot_util()
            args = list(flags)
            if sid is not None:
                args += ['--resume', sid]
            r = run_one(args, prompt)
            running_total_ref[0] += (r.get('cost_usd') or 0)
            # Custom eval for TR probes (mix of regex + tool prefix)
            tools = r.get('tool_uses', [])
            response = r.get('response', '')
            if 'error' in r:
                passed = False
                checks = [{'kind': 'error', 'pass': False, 'detail': r.get('error')}]
            elif regex:
                passed = bool(re.search(regex, response))
                checks = [{'kind': 'regex', 'pass': passed, 'criterion': regex}]
            else:
                # tool-based: must invoke an mcp__ tool
                passed = any(t.startswith('mcp__') for t in tools)
                checks = [{'kind': 'tool_prefix', 'pass': passed, 'criterion': 'mcp__'}]
            rec = {
                'mode': mode, 'topology': 'T-R',
                'turn': idx + 1, 'probe_id': probe_id,
                'pre_util_pct': pre.get('util_pct'),
                **r, **{'evaluation': {'pass': passed, 'checks': checks}},
            }
            cells.append(rec)
            sid = r.get('session_id') or sid
            print(f"  [{mode}/T-R turn{idx+1}/{probe_id}] {'PASS' if passed else 'FAIL'} "
                  f"({r.get('elapsed_s', '?')}s, ${r.get('cost_usd', 0):.3f}, "
                  f"tools={tools}, util={pre.get('util_pct')}%)")
    return cells


def main() -> None:
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    pre_run = snapshot_util()
    print(f"Started: {started}  pre_run util: {pre_run.get('util_pct')}%")
    print(f"  Per-cell budget: ${PER_CELL_BUDGET_USD}; cumulative abort: ${TOTAL_BUDGET_USD}")
    if (pre_run.get('util_pct') or 0) > 75:
        print(f"PRE-FLIGHT ABORT: util {pre_run.get('util_pct')}% > 75%; refusing to start.")
        sys.exit(1)
    running_total_ref = [0.0]
    print('\n=== T-N matrix (15 cells) ===')
    tn_cells = run_tn_matrix(running_total_ref)
    print('\n=== T-R chains (9 cells) ===')
    tr_cells = run_tr_chain(running_total_ref)
    post_run = snapshot_util()
    ended = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    summary = {
        'started_at_utc': started,
        'ended_at_utc': ended,
        'pre_run_util_pct': pre_run.get('util_pct'),
        'post_run_util_pct': post_run.get('util_pct'),
        'util_delta_pct': (post_run.get('util_pct') or 0) - (pre_run.get('util_pct') or 0),
        'total_cost_usd': round(
            sum((c.get('cost_usd') or 0) for c in tn_cells + tr_cells), 4),
        'tn_cells': tn_cells,
        'tr_cells': tr_cells,
    }
    (OUT / 'strip-effect-results.json').write_text(json.dumps(summary, indent=2))
    # Print pass-rate matrix
    print('\n=== T-N pass-rate matrix ===')
    print(f'{"":<6} {"A1":<6} {"A2":<6} {"B1":<6} {"C1":<6} {"C2":<6}')
    for mode in ['M-D', 'M-S', 'M-A']:
        cells = [c for c in tn_cells if c['mode'] == mode]
        row = f'{mode:<6} '
        for pid in ['A1', 'A2', 'B1', 'C1', 'C2']:
            cell = next((c for c in cells if c['probe_id'] == pid), None)
            mark = '✓' if (cell and cell['evaluation']['pass']) else '✗'
            row += f'{mark:<6} '
        print(row)
    print(f'\nTotal: {len(tn_cells) + len(tr_cells)} cells, '
          f'${summary["total_cost_usd"]:.2f}, '
          f'{summary["util_delta_pct"]:.1f}% util consumed')


if __name__ == '__main__':
    main()
