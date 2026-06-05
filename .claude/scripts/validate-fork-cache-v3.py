#!/usr/bin/env python3
"""
validate-fork-cache-v3.py — Critical-redesign validation of `claude -p`
session inheritance mechanics. Replaces v2 (deprecated for the design flaws
documented in .claude/scratch/fork-cache-validation-v3/DESIGN.md).

Four arms exercising distinct parent-child session topologies:
  A_file_pass     4 cells   linear chain, no session inheritance, file-passed
  B_resume_chain  4 cells   linear chain, --resume <root_sid> throughout
  C_fork_tree     7 cells   bifurcating tree, --fork-session at every edge
  D_resume_fork   4 cells   D0 → D1(--resume) → D2/D3(--fork-session)

Each arm runs once per repeat with a distinct prompt set; R=3 repeats give
57 total cells. Cell-to-cell prompts within a chain vary (kills prefix-key
cache as a confound for cache_read attribution). Cache hit and context
preservation are measured independently.

See DESIGN.md for full rationale. The v2 FINDINGS conclusions about
"prefix-keyed cache" should be considered unsupported pending v3 data.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path('/Users/nathanielcannon/Claude/Project_Aion')
OUT_DIR = ROOT / '.claude/scratch/fork-cache-validation-v3'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────
# Experimental control: minimal --system-prompt to keep the shared
# prefix small (~80 tokens) so session-attributable cache is the
# dominant signal. This is NOT a general optimization recommendation —
# see DESIGN.md Part II P-4 for the methodological rationale.
# ─────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = (
    'You are a careful, concise assistant for a controlled experiment. '
    'Follow the user\'s formatting instructions exactly. No preamble, '
    'no closing remarks.'
)

# Slot N (1-indexed) that linear chains and Arm C's first branch use
LINEAR_SLOT = 2
C_BRANCH_2_SLOT = 3   # Arm C's second top-level branch picks slot 3

# ─────────────────────────────────────────────────────────────────────
# 12 prompt chains: 3 repeats × 4 arms, each with a distinct domain
# ─────────────────────────────────────────────────────────────────────
CHAINS: dict[int, dict[str, dict[str, str]]] = {
    1: {  # Repeat 1: fantasy theme
        'A': {
            'plural': 'fantasy spell names',
            'singular': 'spell',
            'property': 'what magical effect it produces',
            'scenario': 'Imagine a wizard casts this spell during a tense duel',
            'label': 'word epitaph for the loser',
        },
        'B': {
            'plural': 'fantasy creature genera',
            'singular': 'creature',
            'property': 'what habitat and diet it has',
            'scenario': 'Imagine an explorer first encountering this creature in the wild',
            'label': 'word warning for the next traveler',
        },
        'C': {
            'plural': 'fantasy magical instruments',
            'singular': 'instrument',
            'property': 'what sound and effect it produces',
            'scenario_a': 'Imagine a musician playing it at a royal court',
            'scenario_b': 'Imagine a musician playing it on a battlefield',
            'label_a': 'word title for the court performance',
            'label_b': 'word codename for the battlefield use',
        },
        'D': {
            'plural': 'fantasy potion ingredients',
            'singular': 'ingredient',
            'property': 'where it is foraged and what it tastes like',
            'scenario': 'Continue: describe the visible color of this ingredient in 1 sentence',
            'scenario_alt': 'Continue: describe the sound the ingredient makes when boiled, in 1 sentence',
        },
    },
    2: {  # Repeat 2: sci-fi theme
        'A': {
            'plural': 'starship class designations',
            'singular': 'class',
            'property': 'its primary role and crew size',
            'scenario': 'Imagine this class engaging a hostile alien fleet',
            'label': 'word call-sign for the engagement',
        },
        'B': {
            'plural': 'alien species names',
            'singular': 'species',
            'property': 'its homeworld biome and dominant sense',
            'scenario': 'Imagine first-contact with this species via radio',
            'label': 'word designation for the diplomatic file',
        },
        'C': {
            'plural': 'futuristic city districts',
            'singular': 'district',
            'property': 'its main function and architectural style',
            'scenario_a': 'Imagine a tourist visiting at dawn',
            'scenario_b': 'Imagine a tourist visiting at midnight',
            'label_a': 'word brochure tagline for dawn',
            'label_b': 'word brochure tagline for midnight',
        },
        'D': {
            'plural': 'experimental tech project codenames',
            'singular': 'project',
            'property': 'its goal and primary risk',
            'scenario': 'Continue: describe the lab where it is built, in 1 sentence',
            'scenario_alt': 'Continue: describe the lead scientist, in 1 sentence',
        },
    },
    3: {  # Repeat 3: culinary theme
        'A': {
            'plural': 'invented cocktail names',
            'singular': 'cocktail',
            'property': 'its base spirit and dominant flavor',
            'scenario': 'Imagine a bartender serving this at a rooftop party',
            'label': 'word headline for the party recap',
        },
        'B': {
            'plural': 'fusion cuisine dish names',
            'singular': 'dish',
            'property': 'the two cuisines fused and the hero ingredient',
            'scenario': 'Imagine a food critic\'s first bite',
            'label': 'word rating for the review',
        },
        'C': {
            'plural': 'invented spice blend names',
            'singular': 'blend',
            'property': 'the constituent spices and culinary use',
            'scenario_a': 'Imagine using this blend on grilled fish',
            'scenario_b': 'Imagine using this blend in a warm dessert',
            'label_a': 'word menu name for the fish dish',
            'label_b': 'word menu name for the dessert',
        },
        'D': {
            'plural': 'invented dessert architectures',
            'singular': 'dessert',
            'property': 'its layers and texture progression',
            'scenario': 'Continue: describe the plating, in 1 sentence',
            'scenario_alt': 'Continue: describe the aroma when served, in 1 sentence',
        },
    },
}


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
    if variant == 'a':
        scen = spec.get('scenario_a') or spec.get('scenario', '')
    elif variant == 'b':
        scen = spec.get('scenario_b') or spec.get('scenario', '')
    else:
        scen = spec.get('scenario', '')
    return f"{scen}. In 2 sentences, what happens? Start with the exact name."


def t3_prompt(spec: dict[str, str], variant: str = '') -> str:
    if variant == 'a':
        lab = spec.get('label_a') or spec.get('label', '')
    elif variant == 'b':
        lab = spec.get('label_b') or spec.get('label', '')
    else:
        lab = spec.get('label', '')
    return f"Give the resulting situation a 1-word {lab}. Reply with just the word."


def d_t2_prompt(spec: dict[str, str]) -> str:
    return f"{spec['scenario']}. Start your reply with the exact item name."


def d_t2_alt_prompt(spec: dict[str, str]) -> str:
    return f"{spec['scenario_alt']}. Start your reply with the exact item name."


# ─────────────────────────────────────────────────────────────────────
# claude -p runner with stream-json capture
# ─────────────────────────────────────────────────────────────────────
def run_claude(extra_args: list[str], prompt: str, out_path: Path,
               timeout: int = 180) -> dict[str, Any]:
    cmd = [
        'claude',
        *extra_args,
        '--system-prompt', SYSTEM_PROMPT,
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
        '-p', prompt,
    ]
    started_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        partial = e.output or ''
        if isinstance(partial, bytes):
            partial = partial.decode(errors='replace')
        out_path.write_text(partial)
        return {
            'error': f'timeout after {timeout}s',
            'elapsed_s': round(time.time() - t0, 1),
            'started_at_utc': started_at,
        }
    except Exception as exc:
        return {
            'error': f'{type(exc).__name__}: {exc}',
            'elapsed_s': round(time.time() - t0, 1),
            'started_at_utc': started_at,
        }
    elapsed = time.time() - t0
    out_path.write_text(proc.stdout)

    if proc.returncode != 0:
        return {
            'error': (proc.stderr or '')[:500],
            'elapsed_s': round(elapsed, 1),
            'started_at_utc': started_at,
        }

    usage: dict[str, Any] | None = None
    cost = None
    session_id = None
    response = None
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
        elif obj.get('type') == 'assistant':
            msg = obj.get('message', {})
            if 'usage' in msg:
                usage = msg['usage']
            for block in msg.get('content', []):
                if block.get('type') == 'text':
                    response = block.get('text', response)
            session_id = obj.get('session_id', session_id)
        elif 'session_id' in obj and session_id is None:
            session_id = obj['session_id']

    u = usage or {}
    return {
        'session_id': session_id,
        'cache_creation': u.get('cache_creation_input_tokens', 0),
        'cache_read':     u.get('cache_read_input_tokens', 0),
        'input_tokens':   u.get('input_tokens', 0),
        'output_tokens':  u.get('output_tokens', 0),
        'cost_usd': cost,
        'elapsed_s': round(elapsed, 1),
        'started_at_utc': started_at,
        'response': (response or '').strip(),
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
    print(
        f'  {label:18s} sid={sid}… '
        f'cr={cr:>5} rd={rd:>5} in={it:>4} out={ot:>4} '
        f'${cost:.4f} {r["elapsed_s"]}s',
        flush=True,
    )


# ─────────────────────────────────────────────────────────────────────
# Per-arm runners
# ─────────────────────────────────────────────────────────────────────
def run_arm_a(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Linear chain, no session inheritance, parent content embedded in each prompt."""
    tasks = [
        ('A0_root', root_prompt(spec)),
        ('A1_t1',   t1_prompt(spec, LINEAR_SLOT)),
        ('A2_t2',   t2_prompt(spec)),
        ('A3_t3',   t3_prompt(spec)),
    ]
    results: list[dict[str, Any]] = []
    prior_response: str | None = None
    for idx, (label, task) in enumerate(tasks):
        if prior_response:
            user_prompt = (
                f"Earlier in this conversation you produced:\n\n"
                f"{prior_response}\n\n"
                f"Continue with this task: {task}"
            )
        else:
            user_prompt = task
        r = run_claude([], user_prompt, arm_dir / f'cell-{idx}-{label}.jsonl')
        r['cell'] = idx
        r['label'] = label
        r['parent'] = None
        r['flags'] = '(none)'
        results.append(r)
        _emit(f'A.{label}', r)
        if 'error' not in r:
            prior_response = r['response']
    return results


def run_arm_b(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Linear chain via --resume <root_sid> on every successor."""
    tasks = [
        ('B0_root', root_prompt(spec)),
        ('B1_t1',   t1_prompt(spec, LINEAR_SLOT)),
        ('B2_t2',   t2_prompt(spec)),
        ('B3_t3',   t3_prompt(spec)),
    ]
    results: list[dict[str, Any]] = []
    root = run_claude([], tasks[0][1], arm_dir / f'cell-0-{tasks[0][0]}.jsonl')
    root['cell'] = 0
    root['label'] = tasks[0][0]
    root['parent'] = None
    root['flags'] = '(none)'
    results.append(root)
    _emit(f'B.{tasks[0][0]}', root)
    if 'error' in root or not root.get('session_id'):
        return results
    root_sid: str = root['session_id']
    for idx, (label, task) in enumerate(tasks[1:], start=1):
        r = run_claude(['--resume', root_sid], task, arm_dir / f'cell-{idx}-{label}.jsonl')
        r['cell'] = idx
        r['label'] = label
        r['parent'] = root_sid
        r['flags'] = f'--resume {root_sid[:8]}'
        results.append(r)
        _emit(f'B.{label}', r)
    return results


def run_arm_c(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Bifurcating tree via --fork-session at each non-root edge."""
    results: list[dict[str, Any]] = []
    # P — root
    p = run_claude([], root_prompt(spec), arm_dir / 'cell-0-C0_P.jsonl')
    p.update({'cell': 0, 'label': 'C0_P', 'parent': None, 'flags': '(none)'})
    results.append(p)
    _emit('C.C0_P', p)
    if 'error' in p or not p.get('session_id'):
        return results
    p_sid: str = p['session_id']

    # C1 — picks slot 2
    c1 = run_claude(['--resume', p_sid, '--fork-session'],
                    t1_prompt(spec, LINEAR_SLOT),
                    arm_dir / 'cell-1-C1.jsonl')
    c1.update({'cell': 1, 'label': 'C1', 'parent': p_sid,
               'flags': f'--resume {p_sid[:8]} --fork-session'})
    results.append(c1)
    _emit('C.C1', c1)

    # C1a, C1b — fork from C1
    if 'error' not in c1 and c1.get('session_id'):
        c1_sid: str = c1['session_id']
        for sub_idx, (sub_label, variant) in enumerate([('C1a', 'a'), ('C1b', 'b')]):
            sub = run_claude(
                ['--resume', c1_sid, '--fork-session'],
                t2_prompt(spec, variant=variant),
                arm_dir / f'cell-{2 + sub_idx}-{sub_label}.jsonl',
            )
            sub.update({'cell': 2 + sub_idx, 'label': sub_label, 'parent': c1_sid,
                        'flags': f'--resume {c1_sid[:8]} --fork-session'})
            results.append(sub)
            _emit(f'C.{sub_label}', sub)

    # C2 — picks slot 3
    c2 = run_claude(['--resume', p_sid, '--fork-session'],
                    t1_prompt(spec, C_BRANCH_2_SLOT),
                    arm_dir / 'cell-4-C2.jsonl')
    c2.update({'cell': 4, 'label': 'C2', 'parent': p_sid,
               'flags': f'--resume {p_sid[:8]} --fork-session'})
    results.append(c2)
    _emit('C.C2', c2)

    # C2a, C2b — fork from C2
    if 'error' not in c2 and c2.get('session_id'):
        c2_sid: str = c2['session_id']
        for sub_idx, (sub_label, variant) in enumerate([('C2a', 'a'), ('C2b', 'b')]):
            sub = run_claude(
                ['--resume', c2_sid, '--fork-session'],
                t2_prompt(spec, variant=variant),
                arm_dir / f'cell-{5 + sub_idx}-{sub_label}.jsonl',
            )
            sub.update({'cell': 5 + sub_idx, 'label': sub_label, 'parent': c2_sid,
                        'flags': f'--resume {c2_sid[:8]} --fork-session'})
            results.append(sub)
            _emit(f'C.{sub_label}', sub)
    return results


def run_arm_d(arm_dir: Path, spec: dict[str, str]) -> list[dict[str, Any]]:
    """Hybrid: D0 → D1(--resume D0) → D2/D3(--fork-session D0_sid after D1)."""
    results: list[dict[str, Any]] = []
    d0 = run_claude([], root_prompt(spec), arm_dir / 'cell-0-D0_root.jsonl')
    d0.update({'cell': 0, 'label': 'D0_root', 'parent': None, 'flags': '(none)'})
    results.append(d0)
    _emit('D.D0_root', d0)
    if 'error' in d0 or not d0.get('session_id'):
        return results
    s: str = d0['session_id']

    d1 = run_claude(['--resume', s], t1_prompt(spec, LINEAR_SLOT),
                    arm_dir / 'cell-1-D1_resume.jsonl')
    d1.update({'cell': 1, 'label': 'D1_resume', 'parent': s,
               'flags': f'--resume {s[:8]}'})
    results.append(d1)
    _emit('D.D1_resume', d1)

    d2 = run_claude(['--resume', s, '--fork-session'], d_t2_prompt(spec),
                    arm_dir / 'cell-2-D2_fork.jsonl')
    d2.update({'cell': 2, 'label': 'D2_fork', 'parent': s,
               'flags': f'--resume {s[:8]} --fork-session'})
    results.append(d2)
    _emit('D.D2_fork', d2)

    d3 = run_claude(['--resume', s, '--fork-session'], d_t2_alt_prompt(spec),
                    arm_dir / 'cell-3-D3_fork.jsonl')
    d3.update({'cell': 3, 'label': 'D3_fork', 'parent': s,
               'flags': f'--resume {s[:8]} --fork-session'})
    results.append(d3)
    _emit('D.D3_fork', d3)
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
    # Allow case-insensitive substring and tolerate inner punctuation
    norm_resp = re.sub(r'[^a-z0-9 ]+', ' ', response.lower())
    norm_targ = re.sub(r'[^a-z0-9 ]+', ' ', target.lower()).strip()
    return norm_targ in norm_resp


def score_arm(arm_name: str, cells: list[dict[str, Any]]) -> None:
    """Annotate each non-root cell with context_probe_passed."""
    if not cells:
        return
    root = cells[0]
    if 'error' in root:
        for c in cells[1:]:
            c['context_probe_passed'] = None
            c['target_item'] = None
        return
    items = extract_items(root.get('response', ''))
    root['extracted_items'] = items

    # Per-arm target-slot mapping
    for c in cells[1:]:
        label = c.get('label', '')
        if arm_name == 'C_fork_tree':
            if label.startswith('C1') or label.startswith('C0_C1'):
                slot = LINEAR_SLOT
            elif label.startswith('C2') or label.startswith('C0_C2'):
                slot = C_BRANCH_2_SLOT
            else:
                slot = LINEAR_SLOT
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
# Driver
# ─────────────────────────────────────────────────────────────────────
ARMS = [
    ('A_file_pass',     run_arm_a),
    ('B_resume_chain',  run_arm_b),
    ('C_fork_tree',     run_arm_c),
    ('D_resume_fork',   run_arm_d),
]


def main() -> None:
    print(f'OUT_DIR: {OUT_DIR}')
    print(f'Start:   {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')
    overall: dict[str, dict[str, list[dict[str, Any]]]] = {}
    t_start = time.time()
    total_cost = 0.0
    total_cells = 0

    for repeat in (1, 2, 3):
        print(f'\n{"#" * 76}\n# REPEAT {repeat}\n{"#" * 76}', flush=True)
        repeat_dir = OUT_DIR / f'repeat-{repeat}'
        repeat_dir.mkdir(exist_ok=True)
        overall[f'repeat-{repeat}'] = {}
        for arm_name, runner in ARMS:
            print(f'\n--- {arm_name} ---', flush=True)
            arm_dir = repeat_dir / arm_name
            arm_dir.mkdir(exist_ok=True)
            spec = CHAINS[repeat][arm_name[0]]
            cells = runner(arm_dir, spec)
            score_arm(arm_name, cells)
            overall[f'repeat-{repeat}'][arm_name] = cells
            (arm_dir / 'cells.json').write_text(json.dumps(cells, indent=2))
            for c in cells:
                if 'error' not in c:
                    total_cells += 1
                    total_cost += c.get('cost_usd') or 0

    elapsed = time.time() - t_start
    print(f'\n{"=" * 76}')
    print(f'DONE: {total_cells} successful cells, ${total_cost:.4f}, {elapsed:.0f}s wall')
    print(f'{"=" * 76}')

    (OUT_DIR / 'all-results.json').write_text(json.dumps(overall, indent=2))
    write_summary(overall)


def write_summary(overall: dict[str, dict[str, list[dict[str, Any]]]]) -> None:
    print('\n' + '=' * 76)
    print('PER-ARM AGGREGATES (cells excluding errors and root)')
    print('=' * 76)
    print(f'{"arm":18s} {"n":>3s} {"cr_mean":>9s} {"rd_mean":>9s} '
          f'{"ctxpass":>8s} {"cost_mean":>10s}')
    agg: dict[str, dict[str, Any]] = {}
    for arm_name, _ in ARMS:
        per_cell: list[dict[str, Any]] = []
        for arms in overall.values():
            for c in arms.get(arm_name, []):
                if 'error' in c:
                    continue
                if c.get('cell') == 0:  # exclude roots from inheritance aggregate
                    continue
                per_cell.append(c)
        n = len(per_cell)
        if n == 0:
            continue
        cr_mean = sum((c.get('cache_creation') or 0) for c in per_cell) / n
        rd_mean = sum((c.get('cache_read') or 0) for c in per_cell) / n
        ctx = [c for c in per_cell if c.get('context_probe_passed') is not None]
        ctx_rate = (sum(1 for c in ctx if c['context_probe_passed']) / len(ctx)
                    if ctx else 0.0)
        cost_mean = sum((c.get('cost_usd') or 0) for c in per_cell) / n
        agg[arm_name] = {'n': n, 'cr_mean': cr_mean, 'rd_mean': rd_mean,
                         'ctx_rate': ctx_rate, 'cost_mean': cost_mean}
        print(f'{arm_name:18s} {n:>3d} {cr_mean:>9.0f} {rd_mean:>9.0f} '
              f'{ctx_rate * 100:>7.1f}% ${cost_mean:>9.4f}')

    (OUT_DIR / 'summary.json').write_text(json.dumps(agg, indent=2))
    print(f'\nFull JSON: {OUT_DIR / "all-results.json"}')
    print(f'Summary:   {OUT_DIR / "summary.json"}')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nINTERRUPTED — partial results preserved in OUT_DIR.', file=sys.stderr)
        sys.exit(130)
