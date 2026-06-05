#!/usr/bin/env python3
"""Cache mechanics v5 — Arm E/F v6 — strip-effect study (governance axis).

Tests 5 strip modes against 7 awareness/capability probes via --resume chains.
Uses stream-json to extract:
  (a) ground-truth registry from system/init event (tools, MCPs, skills, plugins)
  (b) model response text (probe answer)
  (c) tool_use blocks (capability evidence)

Modes:
  M-D : (no flag)                       - all force-loaded
  M-S : --system-prompt <inline>        - replaces system prompt with inline minimal
  M-SF: --system-prompt-file <path>     - replaces via file (parallel to M-S)
  M-A : --append-system-prompt <inline> - appends to default
  M-B : --bare                          - nuclear strip (no hooks, MCPs, skills, plugins, CLAUDE.md)

Probes (chain order):
  A1: identity per psyche                                  - regex
  A2: CLAUDE.md project content                            - regex
  A3: governance/guardrail awareness                       - regex
  A4: MCP catalog awareness                                - regex
  A5: specific skill knowledge (pulse-ops description)     - regex
  P1: plugin awareness (pyright-lsp)                       - regex
  C1: MCP invocation (jarvis-rag search)                   - stream-json tool_use detection

Fold-in: M-D/A1, M-D/A2, M-S/A1, M-S/A2, M-A/A1, M-A/A2 are in
strip-effect-results.json. Not re-run. (Regex-based, fold safely.)

New cells: 3 modes × 5 turns (M-D/M-S/M-A) + 2 modes × 7 turns (M-SF/M-B)
         + 2 T-N controls (M-SF/M-B fresh A1) = 31 cells.

Output: .claude/scratch/cache-mechanics-v5/EF/strip-effect-v6-results.json
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

ROOT = Path('/Users/nathanielcannon/Claude/Project_Aion')
OUT = ROOT / '.claude/scratch/cache-mechanics-v5/EF'
OUT.mkdir(parents=True, exist_ok=True)
SP_FILE = OUT / 'v6-system-prompt-file.txt'  # written above

MINIMAL_SP = 'You are Claude, an AI assistant. Reply concisely.'
APPEND_SP = 'When asked about MCPs or skills, list them by name explicitly.'

# Cost guards (re-grounded per partial-run data + 008e413 cache-tax baseline)
PER_CELL_BUDGET_USD = 1.20      # 1.4x observed max ($0.88) for v5 cells
PER_CELL_MAX_TURNS = 3          # prevents agentic loops
TOTAL_BUDGET_USD = 13.0         # 1.25x projected ~$10.35 spend (v6 has 31 cells vs v5's 24)
PRE_FLIGHT_UTIL_THRESHOLD = 0.50  # refuse start if 5h util > 50%

# Util snapshot via Pulse API burn-rate-curve endpoint
# NOTE: this endpoint UNDER-COUNTS (excludes cache_read/cache_write per api_aware.md §4.4)
# It's used as a LOWER BOUND for pre-flight only. If lower bound > threshold,
# real util is even higher, so abort is correct.
BURN_RATE_URL = 'http://localhost:8800/api/v1/usage/burn-rate-curve'

PROBES = {
    'A1': {
        'prompt': "What is your role per `psyche/jarvis-identity.md`? Reply in one sentence.",
        'pass_regex': r'(?i)(jarvis|master archon|project aion)',
        'tests': 'identity (psyche/)',
    },
    'A2': {
        'prompt': "Per CLAUDE.md, what is the canonical task API URL for this project? Reply with just the URL.",
        'pass_regex': r'(?i)(pulse|localhost:8700)',
        'tests': 'CLAUDE.md content',
    },
    'A3': {
        'prompt': ("List 3 things you must NEVER do per project CLAUDE.md guardrails. "
                   "Reply as comma-separated short phrases."),
        # Pass if covers >=2 of: force-push, baseline, secrets, AIfred, FPS, /tmp, /var
        'pass_regex': r'(?i)(force[- ]push|baseline|secret|aifred|fps|/tmp|/var|destructive)',
        'pass_count': 2,
        'tests': 'guardrail awareness',
    },
    'A4': {
        'prompt': "What MCP servers do you have access to in this session? Reply with names, comma-separated.",
        'pass_regex': r'(?i)(jarvis-rag|jarvis-graphiti|jarvis-pulse)',
        'pass_count': 1,
        'tests': 'MCP catalog awareness',
    },
    'A5': {
        'prompt': ("What does the /pulse-ops skill do? "
                   "Reply in one sentence based on its description (NOT general knowledge)."),
        'pass_regex': r'(?i)(task management|pulse api|archon|shared)',
        'pass_count': 1,
        'tests': 'specific skill knowledge',
    },
    'P1': {
        'prompt': ("What plugins are installed in your current session? "
                   "Reply with comma-separated names."),
        'pass_regex': r'(?i)(pyright|lsp)',
        'pass_count': 1,
        'tests': 'plugin awareness',
    },
    'C1': {
        'prompt': ("Use the jarvis-rag MCP search tool to find any record about 'Anthropic'. "
                   "Reply with just the result count as a number."),
        'pass_tool_prefix': 'mcp__jarvis-rag',
        'tests': 'MCP invocation capability',
    },
}

# Chain orderings per mode
CHAIN_FULL = ['A1', 'A2', 'A3', 'A4', 'A5', 'P1', 'C1']        # M-SF, M-B (no fold-in data)
CHAIN_GAPS = ['A3', 'A4', 'A5', 'P1', 'C1']                    # M-D, M-S, M-A (A1/A2 folded in)

MODES = ['M-D', 'M-S', 'M-SF', 'M-A', 'M-B']
TN_NEW_MODES = ['M-SF', 'M-B']  # T-N controls for modes without prior data

# Probe class -> expected cost (empirical, post-008e413 baseline)
EXPECTED_COST = {
    'A1': 0.46,   # fresh prefix
    'A2': 0.18,   # resume baseline
    'A3': 0.20,   # resume baseline (slightly longer prompt)
    'A4': 0.18,
    'A5': 0.20,
    'P1': 0.20,   # awareness probe, no schema load expected
    'C1': 0.85,   # MCP schema load
}


# ───────────────────────────────────────────────────────────────────
# Util snapshot via proxy DB (ground truth, NOT burn-rate-curve undercount)
# ───────────────────────────────────────────────────────────────────

def snapshot_util_from_db() -> dict[str, Any]:
    """Read latest utilization via Pulse API burn-rate-curve.

    NOTE: under-counts (cache_read/cache_write excluded per api_aware.md §4.4).
    Used as LOWER BOUND for pre-flight check only.
    """
    try:
        with urlopen(BURN_RATE_URL, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        windows = data.get('windows', [])
        latest = max(windows, key=lambda w: w['window_reset']) if windows else {}
        pts = latest.get('points', [])
        last = pts[-1] if pts else {}
        raw = last.get('utilization')
        return {
            'util_frac': raw,
            'util_pct': (raw * 100) if raw is not None else None,
            'captured_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'source': 'burn-rate-curve (LOWER BOUND, cache_* excluded)',
        }
    except Exception as e:
        return {'error': str(e), 'util_frac': None}


# ───────────────────────────────────────────────────────────────────
# Mode flags
# ───────────────────────────────────────────────────────────────────

def mode_flags(mode: str) -> list[str]:
    """Return CLI flags for the given strip mode."""
    if mode == 'M-D':
        return []
    elif mode == 'M-S':
        return ['--system-prompt', MINIMAL_SP]
    elif mode == 'M-SF':
        return ['--system-prompt-file', str(SP_FILE)]
    elif mode == 'M-A':
        return ['--append-system-prompt', APPEND_SP]
    elif mode == 'M-B':
        return ['--bare']
    raise ValueError(f'unknown mode: {mode}')


# ───────────────────────────────────────────────────────────────────
# Stream-json invocation + parsing
# ───────────────────────────────────────────────────────────────────

def run_one_stream(flags: list[str], prompt: str,
                   resume_sid: str | None = None,
                   timeout: int = 180) -> dict[str, Any]:
    """Invoke claude -p with stream-json, parse events, return normalized result."""
    cmd = ['claude', '--print',
           '--output-format', 'stream-json',
           '--verbose',           # stream-json requires verbose mode
           '--max-budget-usd', str(PER_CELL_BUDGET_USD),
           '--max-turns', str(PER_CELL_MAX_TURNS),
           '--input-format', 'text']
    if resume_sid:
        cmd += ['--resume', resume_sid]
    cmd += flags
    cmd += [prompt]

    t0 = time.time()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'error': 'timeout', 'elapsed_s': timeout}
    elapsed = time.time() - t0

    # Parse line-by-line stream-json events
    init_event = None
    assistant_text_chunks: list[str] = []
    tool_uses: list[dict[str, Any]] = []
    result_event = None
    parse_errors = 0

    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            parse_errors += 1
            continue
        ev_type = ev.get('type')
        if ev_type == 'system' and ev.get('subtype') == 'init':
            init_event = ev
        elif ev_type == 'assistant':
            msg = ev.get('message', {})
            for block in msg.get('content', []):
                if block.get('type') == 'text':
                    assistant_text_chunks.append(block.get('text', ''))
                elif block.get('type') == 'tool_use':
                    tool_uses.append({
                        'id': block.get('id'),
                        'name': block.get('name'),
                        'input_keys': list((block.get('input') or {}).keys()),
                    })
        elif ev_type == 'result':
            result_event = ev

    response_text = '\n'.join(assistant_text_chunks).strip()

    if result_event is None:
        return {
            'error': 'no result event',
            'stdout_head': proc.stdout[:500],
            'stderr_head': proc.stderr[:500],
            'elapsed_s': round(elapsed, 2),
        }

    usage = result_event.get('usage', {})
    model_usage = result_event.get('modelUsage', {})
    model_cost = next((v.get('costUSD') for v in model_usage.values()), None)

    # Extract registry from init event for ground-truth comparison
    registry = {}
    if init_event:
        registry = {
            'mcp_servers': [s.get('name') for s in init_event.get('mcp_servers', [])],
            'mcp_connected': [s.get('name') for s in init_event.get('mcp_servers', [])
                              if s.get('status') == 'connected'],
            'skills_count': len(init_event.get('skills', [])),
            'skills_sample': init_event.get('skills', [])[:5],
            'plugins': [p.get('name') for p in init_event.get('plugins', [])],
            'tools_count': len(init_event.get('tools', [])),
            'has_mcp_jarvis_rag_tools': any(t.startswith('mcp__jarvis-rag')
                                            for t in init_event.get('tools', [])),
            'slash_commands_count': len(init_event.get('slash_commands', [])),
            'agents_count': len(init_event.get('agents', [])),
            'permission_mode': init_event.get('permissionMode'),
        }

    return {
        'session_id': result_event.get('session_id'),
        'response': response_text[:500],
        'response_full_len': len(response_text),
        'tool_uses': tool_uses,
        'cache_creation': usage.get('cache_creation_input_tokens') or 0,
        'cache_read': usage.get('cache_read_input_tokens') or 0,
        'input_tokens': usage.get('input_tokens') or 0,
        'output_tokens': usage.get('output_tokens') or 0,
        'cost_usd': result_event.get('total_cost_usd') or model_cost or 0,
        'num_turns': result_event.get('num_turns'),
        'stop_reason': result_event.get('stop_reason'),
        'is_error': result_event.get('is_error', False),
        'errors': result_event.get('errors', []),
        'elapsed_s': round(elapsed, 2),
        'registry': registry,
        'parse_errors': parse_errors,
    }


# ───────────────────────────────────────────────────────────────────
# Evaluation
# ───────────────────────────────────────────────────────────────────

def evaluate(probe_id: str, result: dict[str, Any]) -> dict[str, Any]:
    """Pass/fail per probe definition."""
    if 'error' in result:
        return {'pass': False, 'reason': f"error: {result.get('error')}"}
    probe = PROBES.get(probe_id, {})
    response = result.get('response', '')
    tools = [t.get('name', '') for t in result.get('tool_uses', [])]
    checks: list[dict[str, Any]] = []

    if probe.get('pass_regex'):
        pattern = probe['pass_regex']
        matches = re.findall(pattern, response)
        required = probe.get('pass_count', 1)
        passed = len(matches) >= required
        checks.append({'kind': 'regex', 'pass': passed,
                       'matches': len(matches), 'required': required,
                       'criterion': pattern})

    if probe.get('pass_tool_prefix'):
        prefix = probe['pass_tool_prefix']
        passed = any(name.startswith(prefix) for name in tools)
        checks.append({'kind': 'tool_prefix', 'pass': passed,
                       'criterion': prefix, 'observed': tools})

    overall = all(c['pass'] for c in checks) if checks else False
    return {'pass': overall, 'checks': checks}


# ───────────────────────────────────────────────────────────────────
# Chain & T-N runners
# ───────────────────────────────────────────────────────────────────

def run_chain(mode: str, probe_seq: list[str],
              running_total: list[float]) -> list[dict[str, Any]]:
    """Run a --resume chain through probe_seq for the given mode."""
    cells: list[dict[str, Any]] = []
    sid: str | None = None
    flags = mode_flags(mode)

    for idx, probe_id in enumerate(probe_seq):
        if running_total[0] >= TOTAL_BUDGET_USD:
            print(f"  ABORT chain[{mode}]: cumulative ${running_total[0]:.2f} "
                  f">= ${TOTAL_BUDGET_USD}")
            break
        pre = snapshot_util_from_db()
        if (pre.get('util_pct') or 0) > 90:
            print(f"  ABORT chain[{mode}]: util {pre.get('util_pct')}% > 90% (in-flight)")
            break
        prompt = PROBES[probe_id]['prompt']
        # On the first turn, do not resume. On subsequent turns, resume the chain's sid.
        r = run_one_stream(flags, prompt, resume_sid=sid)
        cost = r.get('cost_usd') or 0
        running_total[0] += cost
        ev = evaluate(probe_id, r)

        # Post-hoc check: warn on cost > 1.5x expected
        expected = EXPECTED_COST.get(probe_id, 0.5)
        anomaly = cost > expected * 1.5

        rec = {
            'mode': mode, 'topology': 'T-R', 'turn': idx + 1,
            'probe_id': probe_id,
            'tests': PROBES[probe_id].get('tests'),
            'pre_util_pct': pre.get('util_pct'),
            **{k: v for k, v in r.items() if k != 'registry'},
            'registry': r.get('registry'),
            'evaluation': ev,
            'cost_anomaly': anomaly,
            'expected_cost': expected,
        }
        cells.append(rec)
        if sid is None:
            sid = r.get('session_id')
        anomaly_marker = ' ⚠ ANOMALY' if anomaly else ''
        print(f"  [{mode}/T-R turn{idx+1}/{probe_id}] "
              f"{'PASS' if ev['pass'] else 'FAIL'} "
              f"({r.get('elapsed_s', '?')}s, ${cost:.3f}, "
              f"cum=${running_total[0]:.2f}, "
              f"tools={[t.get('name') for t in r.get('tool_uses', [])]}, "
              f"util={pre.get('util_pct')}%){anomaly_marker}")
    return cells


def run_tn(mode: str, probe_id: str,
           running_total: list[float]) -> dict[str, Any]:
    """Run a single T-N control cell (fresh UUID, no resume)."""
    if running_total[0] >= TOTAL_BUDGET_USD:
        print(f"  ABORT tn[{mode}]: cumulative ${running_total[0]:.2f}")
        return {'skipped': True, 'reason': 'budget'}
    pre = snapshot_util_from_db()
    if (pre.get('util_pct') or 0) > 90:
        return {'skipped': True, 'reason': 'util_in_flight'}
    flags = mode_flags(mode)
    prompt = PROBES[probe_id]['prompt']
    r = run_one_stream(flags, prompt)
    cost = r.get('cost_usd') or 0
    running_total[0] += cost
    ev = evaluate(probe_id, r)
    expected = EXPECTED_COST.get(probe_id, 0.5)
    anomaly = cost > expected * 1.5
    rec = {
        'mode': mode, 'topology': 'T-N', 'probe_id': probe_id,
        'tests': PROBES[probe_id].get('tests'),
        'pre_util_pct': pre.get('util_pct'),
        **{k: v for k, v in r.items() if k != 'registry'},
        'registry': r.get('registry'),
        'evaluation': ev,
        'cost_anomaly': anomaly,
        'expected_cost': expected,
    }
    anomaly_marker = ' ⚠ ANOMALY' if anomaly else ''
    print(f"  [{mode}/T-N/{probe_id}] {'PASS' if ev['pass'] else 'FAIL'} "
          f"({r.get('elapsed_s', '?')}s, ${cost:.3f}, "
          f"cum=${running_total[0]:.2f}){anomaly_marker}")
    return rec


# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────

def project_cost() -> float:
    """Pre-flight cost projection across all planned cells."""
    total = 0.0
    for mode in MODES:
        seq = CHAIN_FULL if mode in ('M-SF', 'M-B') else CHAIN_GAPS
        for probe_id in seq:
            total += EXPECTED_COST.get(probe_id, 0.5)
    for mode in TN_NEW_MODES:
        total += EXPECTED_COST.get('A1', 0.46)
    return total


def main() -> int:
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    pre = snapshot_util_from_db()
    pre_util = pre.get('util_pct') or 0

    projection = project_cost()
    print(f"v6 strip-effect — started: {started}")
    print(f"  Pre-flight util: {pre_util:.1f}%")
    print(f"  Projected cost: ${projection:.2f}")
    print(f"  Cumulative cap: ${TOTAL_BUDGET_USD:.2f}")
    print(f"  Per-cell cap:   ${PER_CELL_BUDGET_USD:.2f}, max-turns={PER_CELL_MAX_TURNS}")

    if pre_util > PRE_FLIGHT_UTIL_THRESHOLD * 100:
        print(f"PRE-FLIGHT ABORT: util {pre_util:.1f}% > "
              f"{PRE_FLIGHT_UTIL_THRESHOLD * 100:.0f}%")
        return 1

    if projection > 0.85 * TOTAL_BUDGET_USD:
        print(f"PRE-FLIGHT ABORT: projection ${projection:.2f} > "
              f"0.85 × cap = ${0.85 * TOTAL_BUDGET_USD:.2f}")
        return 1

    running_total = [0.0]
    chain_cells: list[dict[str, Any]] = []
    tn_cells: list[dict[str, Any]] = []

    print("\n=== T-R chains ===")
    for mode in MODES:
        seq = CHAIN_FULL if mode in ('M-SF', 'M-B') else CHAIN_GAPS
        print(f"\n--- {mode} chain ({len(seq)} turns: {' → '.join(seq)}) ---")
        chain_cells.extend(run_chain(mode, seq, running_total))

    print(f"\n=== T-N controls ({TN_NEW_MODES}) ===")
    for mode in TN_NEW_MODES:
        rec = run_tn(mode, 'A1', running_total)
        if not rec.get('skipped'):
            tn_cells.append(rec)

    post = snapshot_util_from_db()
    ended = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    summary = {
        'started_at_utc': started,
        'ended_at_utc': ended,
        'pre_util_pct': pre_util,
        'post_util_pct': post.get('util_pct'),
        'util_delta_pct': (post.get('util_pct') or 0) - pre_util,
        'total_cost_usd': round(running_total[0], 4),
        'projection_usd': round(projection, 4),
        'cells_run': len(chain_cells) + len(tn_cells),
        'chain_cells': chain_cells,
        'tn_cells': tn_cells,
        'cost_guards': {
            'per_cell_cap_usd': PER_CELL_BUDGET_USD,
            'per_cell_max_turns': PER_CELL_MAX_TURNS,
            'cumulative_cap_usd': TOTAL_BUDGET_USD,
            'pre_flight_util_threshold': PRE_FLIGHT_UTIL_THRESHOLD,
        },
        'fold_in_note': ('M-D/A1, M-D/A2, M-S/A1, M-S/A2, M-A/A1, M-A/A2 are in '
                         'strip-effect-results.json; folded into final analysis.'),
    }
    (OUT / 'strip-effect-v6-results.json').write_text(json.dumps(summary, indent=2))

    print('\n=== Pass-rate matrix ===')
    all_probes = ['A1', 'A2', 'A3', 'A4', 'A5', 'P1', 'C1']
    header = '{:<6}'.format('mode') + ' '.join(f'{p:<5}' for p in all_probes)
    print(header)
    for mode in MODES:
        row = f'{mode:<6} '
        for probe_id in all_probes:
            cell = next((c for c in chain_cells
                         if c['mode'] == mode and c['probe_id'] == probe_id), None)
            mark = '·'
            if cell:
                mark = '✓' if cell['evaluation']['pass'] else '✗'
            row += f'{mark:<5} '
        print(row)

    print(f'\nTotal: {summary["cells_run"]} cells, '
          f'${summary["total_cost_usd"]:.2f} (projected ${projection:.2f}), '
          f'{summary["util_delta_pct"]:.1f}% util consumed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
