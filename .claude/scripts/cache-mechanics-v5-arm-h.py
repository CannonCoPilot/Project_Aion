#!/usr/bin/env python3
"""Cache mechanics v5 — Arm H — context preservation across topologies.

Tests whether operational context (named entities, numeric constraints,
relational structures) is preserved across 5 session topologies:

  X : No inheritance — children get NOTHING (null baseline)
  Y : File-pass — parent output embedded in child prompt
  R : --resume linear chain (same session as parent)
  F : --fork-session from parent (new session, parent's prefix)
  D : Extend-then-fork — parent + 1 extension, children fork extension

Each topology gets 5 stress questions (Q1-Q5) about a scenario injected
into the parent. Two repeats use DIFFERENT scenarios to avoid cache-hit
confounding.

Reuses v6 harness patterns: stream-json parsing, cost guards, util snapshots.

Output: .claude/scratch/cache-mechanics-v5/H/context-preservation-results.json
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.request import urlopen

ROOT = Path('/Users/nathanielcannon/Claude/Project_Aion')
OUT = ROOT / '.claude/scratch/cache-mechanics-v5/H'
OUT.mkdir(parents=True, exist_ok=True)

# ───────────────────────────────────────────────────────────────────
# Cost guards (conservative — H cells are cheap factual-recall probes)
# ───────────────────────────────────────────────────────────────────

PER_CELL_BUDGET_USD = 1.20
PER_CELL_MAX_TURNS = 2
TOTAL_BUDGET_USD = 15.0
PRE_FLIGHT_UTIL_THRESHOLD = 0.75  # tighter than v6's 0.50 — we're at 62%
IN_FLIGHT_UTIL_ABORT = 90         # abort if util crosses 90% mid-run

BURN_RATE_URL = 'http://localhost:8800/api/v1/usage/burn-rate-curve'

# ───────────────────────────────────────────────────────────────────
# Scenarios — two distinct operational scenarios for repeat isolation
# ───────────────────────────────────────────────────────────────────

SCENARIOS = [
    {
        'id': 'outpost-alpha',
        'prompt': (
            "You are managing operations at a research outpost called Pinnacle Station. "
            "Staff: Liang (commander), Park (engineer), Reyes (medic), Cho (logistics), "
            "and Volk (security). Inventory: 30 days of food, 12 days of water, backup "
            "generator with 48hr fuel. Active situations: Park is diagnosing a coolant "
            "leak in the generator; Reyes flagged Cho with mild altitude sickness "
            "yesterday; a supply drop is scheduled for day 14 but weather forecast "
            "indicates a storm starting day 10 lasting 4-5 days. "
            "Acknowledge this briefing by replying 'Briefing acknowledged' and then "
            "summarize the 3 most critical issues in priority order."
        ),
        'questions': {
            'Q1': {
                'prompt': "Who is the medic at the outpost? Reply with just the name.",
                'pass_regex': r'\bReyes\b',
                'tests': 'named entity recall',
            },
            'Q2': {
                'prompt': "How many days of water remain? Reply with just the number.",
                'pass_regex': r'\b12\b',
                'tests': 'numeric constraint recall',
            },
            'Q3': {
                'prompt': ("List the 5 staff members in the order they were introduced "
                           "in the briefing. Comma-separated, last names only."),
                'pass_regex': r'Liang.*Park.*Reyes.*Cho.*Volk',
                'tests': 'ordered sequence recall',
            },
            'Q4': {
                'prompt': ("If the storm delays the supply drop to day 17, will food "
                           "run out before resupply? Reply yes or no, with the day "
                           "food runs out."),
                'pass_regex': r'(?i)\bno\b',
                'tests': 'numeric reasoning (30 > 17)',
            },
            'Q5': {
                'prompt': ("Identify the most operationally urgent issue and propose "
                           "one action. Reply in exactly 2 sentences."),
                'pass_regex': r'(?i)(generator|coolant|fuel|Park|water|altitude|Cho)',
                'tests': 'prioritization + synthesis',
            },
        },
    },
    {
        'id': 'vessel-bravo',
        'prompt': (
            "You are the acting captain of the research vessel Stormcrest, currently "
            "stationed at coordinates 47.3N, 128.7W in the North Pacific. Crew: "
            "Torres (first officer), Kim (chief scientist), Okafor (dive master), "
            "Petrov (communications), and Walsh (medical). Ship status: main engine "
            "at 60% capacity due to a cracked cylinder liner; auxiliary engine fully "
            "operational. Equipment: 18 dive tanks, ROV with 6hr battery, satellite "
            "uplink intermittent since yesterday. Active situations: Kim's deep-sea "
            "sample collection window closes in 72 hours; Okafor reported unusual "
            "current drift at 200m depth; Torres detected a weather system approaching "
            "from the southwest, ETA 36 hours, sustained winds 45 knots. "
            "Acknowledge by replying 'Captain has the conn' and summarize the 3 most "
            "critical decisions you face in priority order."
        ),
        'questions': {
            'Q1': {
                'prompt': "Who is the dive master on the vessel? Reply with just the name.",
                'pass_regex': r'\bOkafor\b',
                'tests': 'named entity recall',
            },
            'Q2': {
                'prompt': "How many dive tanks are available? Reply with just the number.",
                'pass_regex': r'\b18\b',
                'tests': 'numeric constraint recall',
            },
            'Q3': {
                'prompt': ("List the 5 crew members in the order they were introduced "
                           "in the briefing. Comma-separated, last names only."),
                'pass_regex': r'Torres.*Kim.*Okafor.*Petrov.*Walsh',
                'tests': 'ordered sequence recall',
            },
            'Q4': {
                'prompt': ("If the weather system arrives as predicted, how many hours "
                           "does Kim have for sample collection before the storm? "
                           "Reply with just the number."),
                'pass_regex': r'\b36\b',
                'tests': 'numeric reasoning (min of 72h window vs 36h storm)',
            },
            'Q5': {
                'prompt': ("What is the single biggest risk to crew safety right now "
                           "and what action should be taken? Reply in exactly 2 sentences."),
                'pass_regex': r'(?i)(weather|storm|engine|wind|dive|current)',
                'tests': 'prioritization + synthesis',
            },
        },
    },
]

TOPOLOGIES = ['X', 'Y', 'R', 'F', 'D']
QUESTION_IDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']


# ───────────────────────────────────────────────────────────────────
# Util snapshot (reused from v6)
# ───────────────────────────────────────────────────────────────────

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
            'util_frac': raw,
            'util_pct': (raw * 100) if raw is not None else None,
            'captured_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
    except Exception as e:
        return {'error': str(e), 'util_frac': None, 'util_pct': None}


# ───────────────────────────────────────────────────────────────────
# Stream-json runner (simplified from v6 — no tool detection needed)
# ───────────────────────────────────────────────────────────────────

def run_cell(prompt: str, extra_flags: list[str] | None = None,
             timeout: int = 120) -> dict[str, Any]:
    """Invoke claude -p with stream-json, return normalized result."""
    cmd = ['claude', '--print',
           '--output-format', 'stream-json',
           '--verbose',
           '--max-budget-usd', str(PER_CELL_BUDGET_USD),
           '--max-turns', str(PER_CELL_MAX_TURNS),
           '--input-format', 'text']
    if extra_flags:
        cmd += extra_flags
    cmd += [prompt]

    t0 = time.time()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'error': 'timeout', 'elapsed_s': timeout}
    elapsed = time.time() - t0

    assistant_text_chunks: list[str] = []
    result_event = None

    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        ev_type = ev.get('type')
        if ev_type == 'assistant':
            for block in ev.get('message', {}).get('content', []):
                if block.get('type') == 'text':
                    assistant_text_chunks.append(block.get('text', ''))
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
    return {
        'session_id': result_event.get('session_id'),
        'response': response_text[:1000],
        'response_full_len': len(response_text),
        'cache_creation': usage.get('cache_creation_input_tokens') or 0,
        'cache_read': usage.get('cache_read_input_tokens') or 0,
        'input_tokens': usage.get('input_tokens') or 0,
        'output_tokens': usage.get('output_tokens') or 0,
        'cost_usd': result_event.get('total_cost_usd') or 0,
        'num_turns': result_event.get('num_turns'),
        'elapsed_s': round(elapsed, 2),
    }


# ───────────────────────────────────────────────────────────────────
# Evaluation
# ───────────────────────────────────────────────────────────────────

def evaluate(question: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    if 'error' in result:
        return {'pass': False, 'reason': f"error: {result.get('error')}"}
    response = result.get('response', '')
    pattern = question['pass_regex']
    match = re.search(pattern, response)
    return {
        'pass': match is not None,
        'criterion': pattern,
        'response_excerpt': response[:200],
    }


# ───────────────────────────────────────────────────────────────────
# Topology runners
# ───────────────────────────────────────────────────────────────────

def run_topology_x(scenario: dict, running_total: list[float]) -> list[dict]:
    """X: children get NOTHING about the scenario (null baseline)."""
    cells = []
    # Parent: run scenario, discard session
    print(f"    Parent (discarded)...")
    parent = run_cell(scenario['prompt'])
    parent_cost = parent.get('cost_usd', 0)
    running_total[0] += parent_cost
    parent_sid = parent.get('session_id')
    print(f"    Parent done: sid={parent_sid}, ${parent_cost:.3f}")

    for qid in QUESTION_IDS:
        if running_total[0] >= TOTAL_BUDGET_USD:
            print(f"    ABORT X: budget ${running_total[0]:.2f}")
            break
        q = scenario['questions'][qid]
        r = run_cell(q['prompt'])  # fresh session, no context
        cost = r.get('cost_usd', 0)
        running_total[0] += cost
        ev = evaluate(q, r)
        cells.append({
            'topology': 'X', 'question': qid, 'tests': q['tests'],
            'scenario': scenario['id'],
            **r, 'evaluation': ev,
        })
        print(f"    [X/{qid}] {'PASS' if ev['pass'] else 'FAIL'} "
              f"(${cost:.3f}, cum=${running_total[0]:.2f})")
    return cells


def run_topology_y(scenario: dict, running_total: list[float]) -> list[dict]:
    """Y: parent output embedded as text prefix in child prompt."""
    cells = []
    print(f"    Parent (capture output)...")
    parent = run_cell(scenario['prompt'])
    parent_cost = parent.get('cost_usd', 0)
    running_total[0] += parent_cost
    parent_response = parent.get('response', '')
    print(f"    Parent done: ${parent_cost:.3f}, response_len={len(parent_response)}")

    context_prefix = (
        f"Earlier, you were given this briefing and responded:\n\n"
        f"BRIEFING: {scenario['prompt']}\n\n"
        f"YOUR RESPONSE: {parent_response}\n\n"
        f"Now answer the following question about the briefing:\n\n"
    )

    for qid in QUESTION_IDS:
        if running_total[0] >= TOTAL_BUDGET_USD:
            print(f"    ABORT Y: budget ${running_total[0]:.2f}")
            break
        q = scenario['questions'][qid]
        r = run_cell(context_prefix + q['prompt'])
        cost = r.get('cost_usd', 0)
        running_total[0] += cost
        ev = evaluate(q, r)
        cells.append({
            'topology': 'Y', 'question': qid, 'tests': q['tests'],
            'scenario': scenario['id'],
            **r, 'evaluation': ev,
        })
        print(f"    [Y/{qid}] {'PASS' if ev['pass'] else 'FAIL'} "
              f"(${cost:.3f}, cum=${running_total[0]:.2f})")
    return cells


def run_topology_r(scenario: dict, running_total: list[float]) -> list[dict]:
    """R: --resume linear chain (same session as parent)."""
    cells = []
    print(f"    Parent (establish session)...")
    parent = run_cell(scenario['prompt'])
    parent_cost = parent.get('cost_usd', 0)
    running_total[0] += parent_cost
    parent_sid = parent.get('session_id')
    print(f"    Parent done: sid={parent_sid}, ${parent_cost:.3f}")

    if not parent_sid:
        print(f"    ABORT R: no session_id from parent")
        return cells

    for qid in QUESTION_IDS:
        if running_total[0] >= TOTAL_BUDGET_USD:
            print(f"    ABORT R: budget ${running_total[0]:.2f}")
            break
        q = scenario['questions'][qid]
        r = run_cell(q['prompt'], extra_flags=['--resume', parent_sid])
        cost = r.get('cost_usd', 0)
        running_total[0] += cost
        ev = evaluate(q, r)
        cells.append({
            'topology': 'R', 'question': qid, 'tests': q['tests'],
            'scenario': scenario['id'], 'parent_sid': parent_sid,
            **r, 'evaluation': ev,
        })
        print(f"    [R/{qid}] {'PASS' if ev['pass'] else 'FAIL'} "
              f"(${cost:.3f}, cum=${running_total[0]:.2f})")
    return cells


def run_topology_f(scenario: dict, running_total: list[float]) -> list[dict]:
    """F: --fork-session from parent (new session, parent's prefix)."""
    cells = []
    print(f"    Parent (establish session)...")
    parent = run_cell(scenario['prompt'])
    parent_cost = parent.get('cost_usd', 0)
    running_total[0] += parent_cost
    parent_sid = parent.get('session_id')
    print(f"    Parent done: sid={parent_sid}, ${parent_cost:.3f}")

    if not parent_sid:
        print(f"    ABORT F: no session_id from parent")
        return cells

    for qid in QUESTION_IDS:
        if running_total[0] >= TOTAL_BUDGET_USD:
            print(f"    ABORT F: budget ${running_total[0]:.2f}")
            break
        q = scenario['questions'][qid]
        r = run_cell(q['prompt'],
                     extra_flags=['--resume', parent_sid, '--fork-session'])
        cost = r.get('cost_usd', 0)
        running_total[0] += cost
        ev = evaluate(q, r)
        cells.append({
            'topology': 'F', 'question': qid, 'tests': q['tests'],
            'scenario': scenario['id'], 'parent_sid': parent_sid,
            **r, 'evaluation': ev,
        })
        print(f"    [F/{qid}] {'PASS' if ev['pass'] else 'FAIL'} "
              f"(${cost:.3f}, cum=${running_total[0]:.2f})")
    return cells


def run_topology_d(scenario: dict, running_total: list[float]) -> list[dict]:
    """D: Extend-then-fork — parent + 1 extension, children fork extension."""
    cells = []
    print(f"    Parent (establish session)...")
    parent = run_cell(scenario['prompt'])
    parent_cost = parent.get('cost_usd', 0)
    running_total[0] += parent_cost
    parent_sid = parent.get('session_id')
    print(f"    Parent done: sid={parent_sid}, ${parent_cost:.3f}")

    if not parent_sid:
        print(f"    ABORT D: no session_id from parent")
        return cells

    # Extension turn: deepen context with a follow-up
    extension_prompt = (
        "Based on everything you know about the current situation, "
        "rank the 5 team members by how critical their role is right now. "
        "Reply with a numbered list, 1 being most critical."
    )
    print(f"    Extension (--resume, deepen context)...")
    ext = run_cell(extension_prompt, extra_flags=['--resume', parent_sid])
    ext_cost = ext.get('cost_usd', 0)
    running_total[0] += ext_cost
    ext_sid = ext.get('session_id') or parent_sid
    print(f"    Extension done: sid={ext_sid}, ${ext_cost:.3f}")

    for qid in QUESTION_IDS:
        if running_total[0] >= TOTAL_BUDGET_USD:
            print(f"    ABORT D: budget ${running_total[0]:.2f}")
            break
        q = scenario['questions'][qid]
        r = run_cell(q['prompt'],
                     extra_flags=['--resume', ext_sid, '--fork-session'])
        cost = r.get('cost_usd', 0)
        running_total[0] += cost
        ev = evaluate(q, r)
        cells.append({
            'topology': 'D', 'question': qid, 'tests': q['tests'],
            'scenario': scenario['id'], 'parent_sid': parent_sid,
            'extension_sid': ext_sid,
            **r, 'evaluation': ev,
        })
        print(f"    [D/{qid}] {'PASS' if ev['pass'] else 'FAIL'} "
              f"(${cost:.3f}, cum=${running_total[0]:.2f})")
    return cells


TOPOLOGY_RUNNERS = {
    'X': run_topology_x,
    'Y': run_topology_y,
    'R': run_topology_r,
    'F': run_topology_f,
    'D': run_topology_d,
}


# ───────────────────────────────────────────────────────────────────
# Cost projection
# ───────────────────────────────────────────────────────────────────

def project_cost(n_repeats: int) -> float:
    """Conservative cost projection.

    Per topology:
      X: 1 parent + 5 children (fresh each) = 6 cells
      Y: 1 parent + 5 children (fresh each, longer prompt) = 6 cells
      R: 1 parent + 5 children (resume chain) = 6 cells
      F: 1 parent + 5 children (fork) = 6 cells
      D: 1 parent + 1 extension + 5 children (fork) = 7 cells
    Total per repeat: 31 cells

    Empirical per-cell from v6: $0.17-0.31. H cells are simpler.
    Use $0.22 average (midpoint of v6 resume cells).
    """
    cells_per_repeat = 31
    avg_cost = 0.22
    return cells_per_repeat * n_repeats * avg_cost


# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────

def main() -> int:
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    pre = snapshot_util()
    pre_util = pre.get('util_pct') or 0

    # Determine repeat count
    n_repeats = 2 if pre_util < 65 else 1
    projection = project_cost(n_repeats)

    print(f"Arm H — context preservation — started: {started}")
    print(f"  Pre-flight util: {pre_util:.1f}%")
    print(f"  Repeats planned: {n_repeats}")
    print(f"  Projected cost: ${projection:.2f} ({31 * n_repeats} cells)")
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
    all_cells: list[dict] = []
    repeat_summaries: list[dict] = []

    for repeat_idx in range(n_repeats):
        scenario = SCENARIOS[repeat_idx % len(SCENARIOS)]
        repeat_started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        print(f"\n{'='*60}")
        print(f"REPEAT {repeat_idx + 1}/{n_repeats} — scenario: {scenario['id']}")
        print(f"{'='*60}")

        repeat_cells: list[dict] = []

        for topo in TOPOLOGIES:
            mid_util = snapshot_util()
            mid_pct = mid_util.get('util_pct') or 0
            if mid_pct > IN_FLIGHT_UTIL_ABORT:
                print(f"\n  IN-FLIGHT ABORT: util {mid_pct:.1f}% > {IN_FLIGHT_UTIL_ABORT}%")
                break
            if running_total[0] >= TOTAL_BUDGET_USD:
                print(f"\n  BUDGET ABORT: ${running_total[0]:.2f} >= ${TOTAL_BUDGET_USD}")
                break

            print(f"\n  --- Topology {topo} ({scenario['id']}) ---")
            runner = TOPOLOGY_RUNNERS[topo]
            cells = runner(scenario, running_total)
            for c in cells:
                c['repeat'] = repeat_idx + 1
            repeat_cells.extend(cells)

        # Repeat summary
        pass_count = sum(1 for c in repeat_cells if c.get('evaluation', {}).get('pass'))
        total_count = len(repeat_cells)
        repeat_cost = sum(c.get('cost_usd', 0) for c in repeat_cells)
        repeat_summaries.append({
            'repeat': repeat_idx + 1,
            'scenario': scenario['id'],
            'started': repeat_started,
            'cells': total_count,
            'passed': pass_count,
            'failed': total_count - pass_count,
            'cost_usd': round(repeat_cost, 4),
        })
        all_cells.extend(repeat_cells)

        print(f"\n  Repeat {repeat_idx + 1} summary: "
              f"{pass_count}/{total_count} passed, ${repeat_cost:.2f}")

    # Final output
    post = snapshot_util()
    ended = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    # Build pass-rate matrix
    matrix = {}
    for topo in TOPOLOGIES:
        matrix[topo] = {}
        for qid in QUESTION_IDS:
            matching = [c for c in all_cells
                        if c.get('topology') == topo and c.get('question') == qid]
            passes = sum(1 for c in matching if c.get('evaluation', {}).get('pass'))
            total = len(matching)
            matrix[topo][qid] = {
                'passed': passes, 'total': total,
                'rate': passes / total if total > 0 else None,
            }

    summary = {
        'started_at_utc': started,
        'ended_at_utc': ended,
        'pre_util_pct': pre_util,
        'post_util_pct': post.get('util_pct'),
        'util_delta_pct': (post.get('util_pct') or 0) - pre_util,
        'total_cost_usd': round(running_total[0], 4),
        'projection_usd': round(projection, 4),
        'cells_run': len(all_cells),
        'repeats_completed': len(repeat_summaries),
        'repeat_summaries': repeat_summaries,
        'pass_rate_matrix': matrix,
        'cells': all_cells,
        'cost_guards': {
            'per_cell_cap_usd': PER_CELL_BUDGET_USD,
            'per_cell_max_turns': PER_CELL_MAX_TURNS,
            'cumulative_cap_usd': TOTAL_BUDGET_USD,
            'pre_flight_util_threshold': PRE_FLIGHT_UTIL_THRESHOLD,
            'in_flight_util_abort': IN_FLIGHT_UTIL_ABORT,
        },
    }
    (OUT / 'context-preservation-results.json').write_text(
        json.dumps(summary, indent=2))

    # Print pass-rate matrix
    print(f"\n{'='*60}")
    print(f"PASS-RATE MATRIX")
    print(f"{'='*60}")
    header = f"{'topo':<6}" + ' '.join(f'{q:<8}' for q in QUESTION_IDS) + '  total'
    print(header)
    for topo in TOPOLOGIES:
        row = f'{topo:<6} '
        t_pass = 0
        t_total = 0
        for qid in QUESTION_IDS:
            m = matrix[topo][qid]
            p, t = m['passed'], m['total']
            t_pass += p
            t_total += t
            if t == 0:
                row += f'{"—":<8} '
            elif p == t:
                row += f'{"✓ " + str(p) + "/" + str(t):<8} '
            else:
                row += f'{"✗ " + str(p) + "/" + str(t):<8} '
        row += f'  {t_pass}/{t_total}'
        print(row)

    print(f"\nTotal: {len(all_cells)} cells, "
          f"${running_total[0]:.2f} (projected ${projection:.2f}), "
          f"{summary['util_delta_pct']:.1f}pp util consumed")

    return 0


if __name__ == '__main__':
    sys.exit(main())
