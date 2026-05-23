#!/usr/bin/env python3
"""
cache-mechanics-v4.py — comprehensive empirical study of parent-child task
cache and context mechanics in Claude Code.

Eight arms (A-H) testing:
  - Topology efficiency (independent / resume linear / fork tree / extend-then-fork)
  - Tool-use behavior under stripped vs default --system-prompt
  - Cache TTL boundary (separate ttl-probe-v4.py worker)
  - Context-fidelity vs output-format constraints

Sub-commands:
  main            — run arms A,B,C,D,H,E,F (all except G)
  ttl-prime       — fire the G_prime cell, save state for later probe
  ttl-probe       — fire the G_probe cell using saved prime state
  aggregate       — compile all-results.json and per-arm summary

For comprehensive design rationale see:
  .claude/scratch/cache-mechanics-v4/DESIGN.md
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.request import urlopen

ROOT = Path('/Users/nathanielcannon/Claude/Jarvis')
OUT_DIR = ROOT / '.claude/scratch/cache-mechanics-v4'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Minimal experimental --system-prompt: small fixed prefix so session-attributable
# cache is the dominant signal. NOT a general optimization recommendation.
MIN_SYSTEM_PROMPT = (
    'You are a careful, concise assistant for a controlled experiment. '
    'Follow the user\'s formatting instructions exactly. No preamble.'
)

BURN_RATE_URL = 'http://localhost:8800/api/v1/usage/burn-rate-curve'

LINEAR_SLOT = 2
C_BRANCH_2_SLOT = 3

# ─────────────────────────────────────────────────────────────────────
# Per-arm prompt chains (12 chains for arms with R=3 repeats)
# ─────────────────────────────────────────────────────────────────────
CHAINS: dict[int, dict[str, dict[str, Any]]] = {
    1: {
        'A': {
            'plural': 'fantasy spell names', 'singular': 'spell',
            'property': 'what magical effect it produces',
            'scenario': 'Imagine a wizard casts this spell during a tense duel',
            'label': 'word epitaph for the loser',
        },
        'B': {
            'plural': 'fantasy creature genera', 'singular': 'creature',
            'property': 'what habitat and diet it has',
            'scenario': 'Imagine an explorer first encountering this creature in the wild',
            'label': 'word warning for the next traveler',
        },
        'C': {
            'plural': 'fantasy magical instruments', 'singular': 'instrument',
            'property': 'what sound and effect it produces',
            'scenario_a': 'Imagine a musician playing it at a royal court',
            'scenario_b': 'Imagine a musician playing it on a battlefield',
            'label_a': 'word title for the court performance',
            'label_b': 'word codename for the battlefield use',
        },
        'D': {
            'plural': 'fantasy potion ingredients', 'singular': 'ingredient',
            'property': 'where it is foraged and what it tastes like',
            'fork_topics': [
                'describe the visible color of this ingredient in 1 sentence',
                'describe the sound the ingredient makes when boiled, in 1 sentence',
                'describe the aroma it gives off when crushed, in 1 sentence',
                'describe its texture when raw, in 1 sentence',
            ],
        },
        'H': {
            'plural': 'fictional research-instrument names', 'singular': 'instrument',
        },
    },
    2: {
        'A': {
            'plural': 'starship class designations', 'singular': 'class',
            'property': 'its primary role and crew size',
            'scenario': 'Imagine this class engaging a hostile alien fleet',
            'label': 'word call-sign for the engagement',
        },
        'B': {
            'plural': 'alien species names', 'singular': 'species',
            'property': 'its homeworld biome and dominant sense',
            'scenario': 'Imagine first-contact with this species via radio',
            'label': 'word designation for the diplomatic file',
        },
        'C': {
            'plural': 'futuristic city districts', 'singular': 'district',
            'property': 'its main function and architectural style',
            'scenario_a': 'Imagine a tourist visiting at dawn',
            'scenario_b': 'Imagine a tourist visiting at midnight',
            'label_a': 'word brochure tagline for dawn',
            'label_b': 'word brochure tagline for midnight',
        },
        'D': {
            'plural': 'experimental tech project codenames', 'singular': 'project',
            'property': 'its goal and primary risk',
            'fork_topics': [
                'describe the lab where it is built, in 1 sentence',
                'describe the lead scientist, in 1 sentence',
                'describe the funding source, in 1 sentence',
                'describe the projected timeline, in 1 sentence',
            ],
        },
        'H': {
            'plural': 'fictional space-station modules', 'singular': 'module',
        },
    },
    3: {
        'A': {
            'plural': 'invented cocktail names', 'singular': 'cocktail',
            'property': 'its base spirit and dominant flavor',
            'scenario': 'Imagine a bartender serving this at a rooftop party',
            'label': 'word headline for the party recap',
        },
        'B': {
            'plural': 'fusion cuisine dish names', 'singular': 'dish',
            'property': 'the two cuisines fused and the hero ingredient',
            'scenario': 'Imagine a food critic\'s first bite',
            'label': 'word rating for the review',
        },
        'C': {
            'plural': 'invented spice blend names', 'singular': 'blend',
            'property': 'the constituent spices and culinary use',
            'scenario_a': 'Imagine using this blend on grilled fish',
            'scenario_b': 'Imagine using this blend in a warm dessert',
            'label_a': 'word menu name for the fish dish',
            'label_b': 'word menu name for the dessert',
        },
        'D': {
            'plural': 'invented dessert architectures', 'singular': 'dessert',
            'property': 'its layers and texture progression',
            'fork_topics': [
                'describe the plating, in 1 sentence',
                'describe the aroma when served, in 1 sentence',
                'describe the optimal beverage pairing, in 1 sentence',
                'describe the cleanup difficulty, in 1 sentence',
            ],
        },
        'H': {
            'plural': 'fictional cocktail tools', 'singular': 'tool',
        },
    },
}

# Tool-use task chains for arms E and F.
TOOLUSE_TASKS = [
    "Use the Bash tool to run `date -u +%Y-%m-%dT%H:%M:%SZ`. Reply with ONLY the timestamp string, nothing else.",
    "Use the Bash tool to run `uname -s`. Reply with ONLY the OS name, nothing else.",
    "Use the Read tool to read /etc/hosts. Reply with the count of lines in the file, as a single integer.",
    "Briefly state in ONE sentence what you learned about this system from the previous three tool calls.",
]


# ─────────────────────────────────────────────────────────────────────
# Prompt builders
# ─────────────────────────────────────────────────────────────────────
def root_prompt(spec: dict[str, str]) -> str:
    return (
        f"Invent exactly 4 distinct {spec['plural']}. Reply with exactly 4 "
        f"numbered lines in this format:\n"
        f"1. <name>\n2. <name>\n3. <name>\n4. <name>\n"
        f"Each name must be 1-3 words. No prose, no commentary."
    )


def t1_prompt(spec: dict[str, str], slot: int) -> str:
    return (
        f"Take the {spec['singular']} you just named at slot #{slot}. "
        f"Write a 30-word description of {spec['property']}. Start your "
        f"response with the exact name you used at slot #{slot}."
    )


def t2_prompt(spec: dict[str, str], variant: str = '') -> str:
    scen = spec.get(f'scenario_{variant}') or spec.get('scenario', '')
    return f"{scen}. In 2 sentences, what happens? Start with the exact name."


def t3_prompt(spec: dict[str, str], variant: str = '') -> str:
    lab = spec.get(f'label_{variant}') or spec.get('label', '')
    return f"Give the resulting situation a 1-word {lab}. Reply with just the word."


def d_fork_prompt(spec: dict[str, str], topic_idx: int) -> str:
    topic = spec['fork_topics'][topic_idx]
    return f"Continue: {topic}. Start your reply with the exact item name."


# ─────────────────────────────────────────────────────────────────────
# Claude runner
# ─────────────────────────────────────────────────────────────────────
def run_claude(extra_args: list[str], prompt: str, out_path: Path,
               use_min_system_prompt: bool = True, timeout: int = 240) -> dict[str, Any]:
    cmd = ['claude', *extra_args]
    if use_min_system_prompt:
        cmd += ['--system-prompt', MIN_SYSTEM_PROMPT]
    cmd += ['--output-format', 'stream-json',
            '--verbose', '--include-partial-messages',
            '-p', prompt]
    started_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        partial = (e.output or '')
        if isinstance(partial, bytes):
            partial = partial.decode(errors='replace')
        out_path.write_text(partial)
        return {'error': f'timeout {timeout}s',
                'elapsed_s': round(time.time() - t0, 1),
                'started_at_utc': started_at}
    except Exception as exc:
        return {'error': f'{type(exc).__name__}: {exc}',
                'elapsed_s': round(time.time() - t0, 1),
                'started_at_utc': started_at}
    elapsed = time.time() - t0
    out_path.write_text(proc.stdout)
    if proc.returncode != 0:
        return {'error': (proc.stderr or '')[:500],
                'elapsed_s': round(elapsed, 1),
                'started_at_utc': started_at}

    usage: dict[str, Any] | None = None
    cost = None
    session_id = None
    response = None
    tool_uses: list[dict[str, Any]] = []
    duration_api_ms = None
    cache_5m = 0
    cache_1h = 0

    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line.startswith('{'):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get('type') == 'result':
            usage = obj.get('usage') or usage
            cost = obj.get('total_cost_usd', cost)
            response = obj.get('result', response)
            session_id = obj.get('session_id', session_id)
            duration_api_ms = obj.get('duration_api_ms', duration_api_ms)
        elif obj.get('type') == 'assistant':
            msg = obj.get('message', {})
            if 'usage' in msg:
                usage = msg['usage']
            for block in msg.get('content', []):
                if block.get('type') == 'text':
                    response = block.get('text', response)
                elif block.get('type') == 'tool_use':
                    tool_uses.append({
                        'name': block.get('name'),
                        'input_summary': str(block.get('input', {}))[:200],
                    })
            session_id = obj.get('session_id', session_id)
        elif 'session_id' in obj and session_id is None:
            session_id = obj['session_id']

    u = usage or {}
    cc = u.get('cache_creation', {})
    if isinstance(cc, dict):
        cache_5m = cc.get('ephemeral_5m_input_tokens', 0)
        cache_1h = cc.get('ephemeral_1h_input_tokens', 0)
    return {
        'session_id': session_id,
        'cache_creation': u.get('cache_creation_input_tokens', 0),
        'cache_read':     u.get('cache_read_input_tokens', 0),
        'cache_creation_5m': cache_5m,
        'cache_creation_1h': cache_1h,
        'input_tokens':   u.get('input_tokens', 0),
        'output_tokens':  u.get('output_tokens', 0),
        'cost_usd': cost,
        'elapsed_s': round(elapsed, 1),
        'duration_api_ms': duration_api_ms,
        'started_at_utc': started_at,
        'response': (response or '').strip(),
        'tool_uses': tool_uses,
        'service_tier': u.get('service_tier'),
    }


def _emit(label: str, r: dict[str, Any]) -> None:
    if 'error' in r:
        print(f'  {label:18s} ERROR  {r["error"][:80]}', flush=True)
        return
    sid = (r.get('session_id') or '')[:8]
    cr = r.get('cache_creation') or 0
    rd = r.get('cache_read') or 0
    it = r.get('input_tokens') or 0
    ot = r.get('output_tokens') or 0
    cost = r.get('cost_usd') or 0
    tools = len(r.get('tool_uses') or [])
    print(
        f'  {label:18s} sid={sid}… '
        f'cr={cr:>5} rd={rd:>5} in={it:>4} out={ot:>4} '
        f'tools={tools} ${cost:.4f} {r["elapsed_s"]}s',
        flush=True,
    )


# ─────────────────────────────────────────────────────────────────────
# Burn-rate utilization snapshot
# ─────────────────────────────────────────────────────────────────────
def snapshot_utilization() -> dict[str, Any]:
    try:
        with urlopen(BURN_RATE_URL, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        windows = data.get('windows', [])
        if not windows:
            return {'available': False, 'reason': 'no windows'}
        latest = max(windows, key=lambda w: w['window_reset'])
        pts = latest.get('points', [])
        if not pts:
            return {'available': False, 'reason': 'no points in latest window'}
        last = pts[-1]
        # Anthropic returns unified_5h_utilization as a fraction (0.0-1.0).
        # The endpoint passes it through unchanged. Multiply by 100 here so
        # downstream consumers see percent (matches the field name).
        raw_util = last.get('utilization')
        return {
            'available': True,
            'utilization_pct': (raw_util * 100) if raw_util is not None else None,
            'utilization_fraction_raw': raw_util,
            'cumulative_tokens_input_plus_output': last.get('cumulative_tokens'),
            'note_cumulative_tokens': 'sums input_tokens+output_tokens only; excludes cache tokens — not a proxy for window-budget consumption',
            'elapsed_seconds_in_window': last.get('elapsed_seconds'),
            'window_reset': latest.get('window_reset'),
            'captured_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
    except Exception as e:
        return {'available': False, 'reason': f'{type(e).__name__}: {e}'}


# ─────────────────────────────────────────────────────────────────────
# Per-arm runners
# ─────────────────────────────────────────────────────────────────────
def run_arm_a(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Linear chain, no inheritance, file-pass."""
    tasks = [
        ('A0_root', root_prompt(spec)),
        ('A1_t1',   t1_prompt(spec, LINEAR_SLOT)),
        ('A2_t2',   t2_prompt(spec)),
        ('A3_t3',   t3_prompt(spec)),
    ]
    results: list[dict[str, Any]] = []
    prior: str | None = None
    for idx, (label, task) in enumerate(tasks):
        if prior:
            user_prompt = (
                f"Earlier in this conversation you produced:\n\n"
                f"{prior}\n\nContinue with this task: {task}"
            )
        else:
            user_prompt = task
        r = run_claude([], user_prompt, arm_dir / f'cell-{idx}-{label}.jsonl')
        r.update({'cell': idx, 'label': label, 'parent': None, 'flags': '(none)'})
        results.append(r)
        _emit(f'A.{label}', r)
        if 'error' not in r:
            prior = r['response']
    return results


def run_arm_b(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Linear --resume chain (single session_id)."""
    tasks = [
        ('B0_root', root_prompt(spec)),
        ('B1_t1',   t1_prompt(spec, LINEAR_SLOT)),
        ('B2_t2',   t2_prompt(spec)),
        ('B3_t3',   t3_prompt(spec)),
    ]
    results = []
    root = run_claude([], tasks[0][1], arm_dir / f'cell-0-{tasks[0][0]}.jsonl')
    root.update({'cell': 0, 'label': tasks[0][0], 'parent': None, 'flags': '(none)'})
    results.append(root)
    _emit(f'B.{tasks[0][0]}', root)
    if 'error' in root or not root.get('session_id'):
        return results
    sid: str = root['session_id']
    for idx, (label, task) in enumerate(tasks[1:], start=1):
        r = run_claude(['--resume', sid], task, arm_dir / f'cell-{idx}-{label}.jsonl')
        r.update({'cell': idx, 'label': label, 'parent': sid,
                  'flags': f'--resume {sid[:8]}'})
        results.append(r)
        _emit(f'B.{label}', r)
    return results


def run_arm_c(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Bifurcating tree via --fork-session at every edge."""
    results = []
    p = run_claude([], root_prompt(spec), arm_dir / 'cell-0-P.jsonl')
    p.update({'cell': 0, 'label': 'P', 'parent': None, 'flags': '(none)'})
    results.append(p)
    _emit('C.P', p)
    if 'error' in p or not p.get('session_id'):
        return results
    p_sid = p['session_id']

    c1 = run_claude(['--resume', p_sid, '--fork-session'],
                    t1_prompt(spec, LINEAR_SLOT), arm_dir / 'cell-1-C1.jsonl')
    c1.update({'cell': 1, 'label': 'C1', 'parent': p_sid,
               'flags': f'--resume {p_sid[:8]} --fork-session'})
    results.append(c1)
    _emit('C.C1', c1)

    if 'error' not in c1 and c1.get('session_id'):
        c1_sid = c1['session_id']
        for sub_idx, (sub_label, variant) in enumerate([('C1a', 'a'), ('C1b', 'b')]):
            sub = run_claude(['--resume', c1_sid, '--fork-session'],
                             t2_prompt(spec, variant),
                             arm_dir / f'cell-{2 + sub_idx}-{sub_label}.jsonl')
            sub.update({'cell': 2 + sub_idx, 'label': sub_label, 'parent': c1_sid,
                        'flags': f'--resume {c1_sid[:8]} --fork-session'})
            results.append(sub)
            _emit(f'C.{sub_label}', sub)

    c2 = run_claude(['--resume', p_sid, '--fork-session'],
                    t1_prompt(spec, C_BRANCH_2_SLOT), arm_dir / 'cell-4-C2.jsonl')
    c2.update({'cell': 4, 'label': 'C2', 'parent': p_sid,
               'flags': f'--resume {p_sid[:8]} --fork-session'})
    results.append(c2)
    _emit('C.C2', c2)

    if 'error' not in c2 and c2.get('session_id'):
        c2_sid = c2['session_id']
        for sub_idx, (sub_label, variant) in enumerate([('C2a', 'a'), ('C2b', 'b')]):
            sub = run_claude(['--resume', c2_sid, '--fork-session'],
                             t2_prompt(spec, variant),
                             arm_dir / f'cell-{5 + sub_idx}-{sub_label}.jsonl')
            sub.update({'cell': 5 + sub_idx, 'label': sub_label, 'parent': c2_sid,
                        'flags': f'--resume {c2_sid[:8]} --fork-session'})
            results.append(sub)
            _emit(f'C.{sub_label}', sub)
    return results


def run_arm_d(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Extend-then-fork hybrid: D0 → D1(--resume) → D2..D5 (--fork-session)."""
    results = []
    d0 = run_claude([], root_prompt(spec), arm_dir / 'cell-0-D0.jsonl')
    d0.update({'cell': 0, 'label': 'D0', 'parent': None, 'flags': '(none)'})
    results.append(d0)
    _emit('D.D0', d0)
    if 'error' in d0 or not d0.get('session_id'):
        return results
    sid = d0['session_id']

    d1 = run_claude(['--resume', sid], t1_prompt(spec, LINEAR_SLOT),
                    arm_dir / 'cell-1-D1.jsonl')
    d1.update({'cell': 1, 'label': 'D1', 'parent': sid,
               'flags': f'--resume {sid[:8]}'})
    results.append(d1)
    _emit('D.D1', d1)

    for i in range(4):
        dfork = run_claude(['--resume', sid, '--fork-session'],
                           d_fork_prompt(spec, i),
                           arm_dir / f'cell-{2 + i}-D{2 + i}.jsonl')
        dfork.update({'cell': 2 + i, 'label': f'D{2 + i}', 'parent': sid,
                      'flags': f'--resume {sid[:8]} --fork-session'})
        results.append(dfork)
        _emit(f'D.D{2 + i}', dfork)
    return results


def run_arm_ef(arm_dir: Path, label_prefix: str, strip: bool) -> list[dict[str, Any]]:
    """Tool-use chain. label_prefix = 'E' or 'F'. strip=True means use minimal --system-prompt."""
    results = []
    root = run_claude([], TOOLUSE_TASKS[0],
                      arm_dir / f'cell-0-{label_prefix}0.jsonl',
                      use_min_system_prompt=strip)
    root.update({'cell': 0, 'label': f'{label_prefix}0', 'parent': None,
                 'flags': '(none)', 'system_prompt_mode': 'minimal' if strip else 'default'})
    results.append(root)
    _emit(f'{label_prefix}.{label_prefix}0', root)
    if 'error' in root or not root.get('session_id'):
        return results
    sid = root['session_id']
    for idx, task in enumerate(TOOLUSE_TASKS[1:], start=1):
        r = run_claude(['--resume', sid], task,
                       arm_dir / f'cell-{idx}-{label_prefix}{idx}.jsonl',
                       use_min_system_prompt=strip)
        r.update({'cell': idx, 'label': f'{label_prefix}{idx}', 'parent': sid,
                  'flags': f'--resume {sid[:8]}',
                  'system_prompt_mode': 'minimal' if strip else 'default'})
        results.append(r)
        _emit(f'{label_prefix}.{label_prefix}{idx}', r)
    return results


def run_arm_h(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Output-format effect: parent + 4 children with different output formats."""
    results = []
    p = run_claude([], root_prompt(spec), arm_dir / 'cell-0-H_root.jsonl')
    p.update({'cell': 0, 'label': 'H_root', 'parent': None, 'flags': '(none)'})
    results.append(p)
    _emit('H.H_root', p)
    if 'error' in p or not p.get('session_id'):
        return results
    sid = p['session_id']

    variants = [
        ('H1_bare', 'Pick the instrument you named at slot #2. Reply with one '
                    'word labeling its primary function. Just the word.'),
        ('H2_format', 'Pick the instrument you named at slot #2. Reply in '
                      'format `<instrument-name>: <word>` where word is a one-word '
                      'function label.'),
        ('H3_echo', 'Pick the instrument you named at slot #2. State its name '
                    'and one-word function in a single short sentence.'),
        ('H4_free', 'Pick the instrument you named at slot #2. Write a 2-'
                    'sentence description of its primary function, starting '
                    'with the exact name.'),
    ]
    for idx, (label, task) in enumerate(variants, start=1):
        r = run_claude(['--resume', sid], task,
                       arm_dir / f'cell-{idx}-{label}.jsonl')
        r.update({'cell': idx, 'label': label, 'parent': sid,
                  'flags': f'--resume {sid[:8]}'})
        results.append(r)
        _emit(f'H.{label}', r)
    return results


# ─────────────────────────────────────────────────────────────────────
# Context-probe scoring
# ─────────────────────────────────────────────────────────────────────
ITEM_LINE_RE = re.compile(r'^\s*(\d+)[.)]\s*(.+?)\s*$')


def extract_items(response: str) -> list[str]:
    items: list[str] = []
    for line in (response or '').splitlines():
        m = ITEM_LINE_RE.match(line)
        if m:
            items.append(m.group(2).strip().strip('*_`"').strip())
    return items[:4]


def probe(response: str, target: str) -> bool:
    if not response or not target:
        return False
    norm_resp = re.sub(r'[^a-z0-9 ]+', ' ', response.lower())
    norm_targ = re.sub(r'[^a-z0-9 ]+', ' ', target.lower()).strip()
    return norm_targ in norm_resp


def score_arm(arm_name: str, cells: list[dict[str, Any]]) -> None:
    if not cells:
        return
    root = cells[0]
    if 'error' in root:
        for c in cells[1:]:
            c['context_probe_passed'] = None
        return
    items = extract_items(root.get('response', ''))
    root['extracted_items'] = items
    for c in cells[1:]:
        label = c.get('label', '')
        if arm_name.startswith('C_') and (label.startswith('C2') or label == 'C2'):
            slot = C_BRANCH_2_SLOT
        else:
            slot = LINEAR_SLOT
        target = items[slot - 1] if len(items) >= slot else ''
        c['target_item'] = target
        c['target_slot'] = slot
        if 'error' in c:
            c['context_probe_passed'] = None
        else:
            c['context_probe_passed'] = probe(c.get('response', ''), target)


# ─────────────────────────────────────────────────────────────────────
# Main driver
# ─────────────────────────────────────────────────────────────────────
ARMS = [
    ('A_independent',    run_arm_a, 'A', True),
    ('B_resume_chain',   run_arm_b, 'B', True),
    ('C_fork_tree',      run_arm_c, 'C', True),
    ('D_extend_fork',    run_arm_d, 'D', True),
    ('H_output_format',  run_arm_h, 'H', True),
]


def run_warmup() -> dict[str, Any]:
    print('--- Warmup (discarded) ---', flush=True)
    warmup_dir = OUT_DIR / 'warmup'
    warmup_dir.mkdir(exist_ok=True)
    r = run_claude([], 'Reply with the single word: ok',
                   warmup_dir / 'warmup.jsonl')
    _emit('warmup', r)
    return r


def cmd_main() -> None:
    print(f'OUT_DIR: {OUT_DIR}')
    print(f'Start:   {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')
    pre_util = snapshot_utilization()
    print(f'Pre-run quota: {json.dumps(pre_util)}')

    overall: dict[str, Any] = {
        'pre_run_utilization': pre_util,
        'warmup': None,
        'arms': {},
    }

    overall['warmup'] = run_warmup()

    # arms A, B, C, D, H — each runs 3 repeats with usage% boundary tagging
    for arm_name, runner, chain_key, _ in ARMS:
        print(f'\n{"=" * 70}\nArm {arm_name}\n{"=" * 70}', flush=True)
        arm_dir = OUT_DIR / arm_name
        arm_dir.mkdir(exist_ok=True)
        util_start = snapshot_utilization()
        t_start = time.time()
        all_repeats: list[dict[str, Any]] = []
        for repeat in (1, 2, 3):
            print(f'\n-- repeat {repeat} --', flush=True)
            rep_dir = arm_dir / f'repeat-{repeat}'
            rep_dir.mkdir(exist_ok=True)
            spec = CHAINS[repeat][chain_key]
            cells = runner(rep_dir, spec)
            score_arm(arm_name, cells)
            all_repeats.append({'repeat': repeat, 'cells': cells})
        wall = round(time.time() - t_start, 1)
        util_end = snapshot_utilization()
        delta_pct = None
        slope_pct_per_min = None
        if util_start.get('available') and util_end.get('available'):
            us = util_start['utilization_pct']
            ue = util_end['utilization_pct']
            if us is not None and ue is not None:
                delta_pct = round(ue - us, 4)
                slope_pct_per_min = round(delta_pct / (wall / 60.0), 4) if wall > 0 else None
        overall['arms'][arm_name] = {
            'wall_seconds': wall,
            'util_pct_start': util_start.get('utilization_pct'),
            'util_pct_end': util_end.get('utilization_pct'),
            'util_delta_pct': delta_pct,
            'util_pct_per_min': slope_pct_per_min,
            'util_start_captured_at': util_start.get('captured_at_utc'),
            'util_end_captured_at': util_end.get('captured_at_utc'),
            'repeats': all_repeats,
        }
        (arm_dir / 'arm-summary.json').write_text(json.dumps(overall['arms'][arm_name], indent=2))
        print(f'\nArm {arm_name} done: wall={wall}s  Δutil={delta_pct}%  slope={slope_pct_per_min}%/min', flush=True)

    # E and F — tool-use; E uses strip, F does not
    for arm_name, label_prefix, strip in [
        ('E_tooluse_stripped', 'E', True),
        ('F_tooluse_default',  'F', False),
    ]:
        print(f'\n{"=" * 70}\nArm {arm_name}\n{"=" * 70}', flush=True)
        arm_dir = OUT_DIR / arm_name
        arm_dir.mkdir(exist_ok=True)
        util_start = snapshot_utilization()
        t_start = time.time()
        all_repeats = []
        for repeat in (1, 2, 3):
            print(f'\n-- repeat {repeat} --', flush=True)
            rep_dir = arm_dir / f'repeat-{repeat}'
            rep_dir.mkdir(exist_ok=True)
            cells = run_arm_ef(rep_dir, label_prefix, strip)
            all_repeats.append({'repeat': repeat, 'cells': cells})
        wall = round(time.time() - t_start, 1)
        util_end = snapshot_utilization()
        delta_pct = None
        slope_pct_per_min = None
        if util_start.get('available') and util_end.get('available'):
            us = util_start['utilization_pct']
            ue = util_end['utilization_pct']
            if us is not None and ue is not None:
                delta_pct = round(ue - us, 4)
                slope_pct_per_min = round(delta_pct / (wall / 60.0), 4) if wall > 0 else None
        overall['arms'][arm_name] = {
            'wall_seconds': wall,
            'util_pct_start': util_start.get('utilization_pct'),
            'util_pct_end': util_end.get('utilization_pct'),
            'util_delta_pct': delta_pct,
            'util_pct_per_min': slope_pct_per_min,
            'repeats': all_repeats,
        }
        (arm_dir / 'arm-summary.json').write_text(json.dumps(overall['arms'][arm_name], indent=2))
        print(f'\nArm {arm_name} done: wall={wall}s  Δutil={delta_pct}%  slope={slope_pct_per_min}%/min', flush=True)

    overall['post_run_utilization'] = snapshot_utilization()
    overall['ended_at_utc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    (OUT_DIR / 'main-results.json').write_text(json.dumps(overall, indent=2))
    print(f'\nFull JSON: {OUT_DIR / "main-results.json"}')


def cmd_ttl_prime() -> None:
    """Prime cache for TTL test, save session_id + prompt for later probe."""
    print(f'TTL prime at {time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}', flush=True)
    g_dir = OUT_DIR / 'G_ttl'
    g_dir.mkdir(exist_ok=True)
    prime_prompt = (
        'You are part of a TTL validation experiment. Reply with EXACTLY '
        'the string: ttl-prime-canary-2026. Just that string, nothing else.'
    )
    r = run_claude([], prime_prompt, g_dir / 'prime.jsonl')
    r['phase'] = 'prime'
    r['prompt'] = prime_prompt
    _emit('G.prime', r)
    (g_dir / 'prime-state.json').write_text(json.dumps(r, indent=2))
    print(f'Prime state saved to {g_dir / "prime-state.json"}', flush=True)


def cmd_ttl_probe() -> None:
    """After idle wait, probe the primed session."""
    print(f'TTL probe at {time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}', flush=True)
    g_dir = OUT_DIR / 'G_ttl'
    state_file = g_dir / 'prime-state.json'
    if not state_file.exists():
        print('ERROR: prime-state.json missing — run ttl-prime first.', file=sys.stderr)
        sys.exit(1)
    prime = json.loads(state_file.read_text())
    sid = prime.get('session_id')
    prompt = prime.get('prompt')
    if not sid:
        print('ERROR: prime had no session_id', file=sys.stderr)
        sys.exit(1)
    # Send same prompt via --resume — should hit cache if TTL has held
    r = run_claude(['--resume', sid], prompt, g_dir / 'probe.jsonl')
    r['phase'] = 'probe'
    r['prime_session_id'] = sid
    prime_t = prime.get('started_at_utc', '')
    probe_t = r.get('started_at_utc', '')
    r['elapsed_since_prime'] = f'{prime_t} → {probe_t}'
    _emit('G.probe', r)
    (g_dir / 'probe-state.json').write_text(json.dumps(r, indent=2))
    summary = {
        'prime_started': prime_t,
        'probe_started': probe_t,
        'prime_cache_creation': prime.get('cache_creation'),
        'probe_cache_creation': r.get('cache_creation'),
        'probe_cache_read': r.get('cache_read'),
        'cache_hit': (r.get('cache_read') or 0) > 30000,
        'verdict': ('CACHE HIT — TTL holds across wait' if (r.get('cache_read') or 0) > 30000
                    else 'CACHE MISS — TTL expired'),
    }
    (g_dir / 'ttl-summary.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('subcommand', choices=['main', 'ttl-prime', 'ttl-probe'])
    args = p.parse_args()
    {
        'main': cmd_main,
        'ttl-prime': cmd_ttl_prime,
        'ttl-probe': cmd_ttl_probe,
    }[args.subcommand]()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nINTERRUPTED — partial results preserved in OUT_DIR.', file=sys.stderr)
        sys.exit(130)
