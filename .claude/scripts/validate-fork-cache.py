#!/usr/bin/env python3
"""
validate-fork-cache.py — empirically measure prompt-cache behavior of
`claude -p` under three invocation patterns:

  arm A: bare `claude -p`                                    (baseline; reload every time)
  arm B: `claude --resume <id> --fork-session -p`            (fork inheritance)
  arm C: arm B + `--exclude-dynamic-system-prompt-sections`  (stabilized prefix)

For each arm: seed a parent session, then fire 4 child cells sequentially,
recording per-cell usage.cache_creation_input_tokens and
usage.cache_read_input_tokens. Decision rule: arm B and/or C should show
cache_read >> 0 on cells 2-4 while arm A does not.

Output: stdout summary table + raw JSONLs under
.claude/scratch/fork-cache-validation/.

Approx cost: 12 cells × ~$0.02 average = ~$0.25. Wall time: ~3-4 min.
"""
import json
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path

ROOT = Path('/Users/nathanielcannon/Claude/Project_Aion')
OUT_DIR = ROOT / '.claude/scratch/fork-cache-validation'
OUT_DIR.mkdir(parents=True, exist_ok=True)

PROMPTS = [
    'What is 7 times 8? Reply with just the number.',
    'What is 12 plus 19? Reply with just the number.',
    'What is 144 divided by 12? Reply with just the number.',
    'What is the square root of 81? Reply with just the number.',
]
SEED_PROMPT = 'Reply with just the word: ready.'


def run_claude(args: list[str], prompt: str, out_path: Path) -> dict:
    """Invoke claude with given args, return parsed usage + cost."""
    cmd = ['claude'] + args + ['--output-format', 'stream-json',
                               '--verbose', '--include-partial-messages',
                               '-p', prompt]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    elapsed = time.time() - t0
    out_path.write_text(proc.stdout)
    if proc.returncode != 0:
        return {'error': proc.stderr[:500], 'elapsed_s': round(elapsed, 1)}

    # Stream-json emits one JSON object per line. Find the final 'result' or
    # the assistant message containing usage metadata.
    usage = None
    cost = None
    session_id = None
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
            session_id = obj.get('session_id', session_id)
        elif obj.get('type') == 'assistant':
            msg = obj.get('message', {})
            if 'usage' in msg:
                usage = msg['usage']
            session_id = obj.get('session_id', session_id)
        elif 'session_id' in obj:
            session_id = obj['session_id']

    return {
        'session_id': session_id,
        'cache_creation': (usage or {}).get('cache_creation_input_tokens', 0),
        'cache_read':     (usage or {}).get('cache_read_input_tokens', 0),
        'input_tokens':   (usage or {}).get('input_tokens', 0),
        'output_tokens':  (usage or {}).get('output_tokens', 0),
        'cost_usd': cost,
        'elapsed_s': round(elapsed, 1),
    }


def run_arm(arm_name: str, base_args_factory) -> list[dict]:
    """base_args_factory(parent_session_id_or_None) -> list[str] of args.
    Called once for seed (with None) and once per cell (with seed id)."""
    print(f'\n{"="*60}\nArm {arm_name}\n{"="*60}', flush=True)
    seed_uuid = str(uuid.uuid4())
    arm_dir = OUT_DIR / arm_name
    arm_dir.mkdir(exist_ok=True)

    # Seed
    seed_args = ['--session-id', seed_uuid] + base_args_factory(None)
    print(f'  seed → session_id={seed_uuid[:8]}…', flush=True)
    seed_result = run_claude(seed_args, SEED_PROMPT, arm_dir / 'seed.jsonl')
    seed_result['cell'] = 0
    seed_result['prompt'] = SEED_PROMPT
    print(f'    cache_creation={seed_result.get("cache_creation"):>6} '
          f'cache_read={seed_result.get("cache_read"):>6} '
          f'cost=${seed_result.get("cost_usd")} '
          f'wall={seed_result.get("elapsed_s")}s', flush=True)

    results = [seed_result]
    for i, prompt in enumerate(PROMPTS, 1):
        child_args = base_args_factory(seed_uuid)
        result = run_claude(child_args, prompt, arm_dir / f'cell-{i}.jsonl')
        result['cell'] = i
        result['prompt'] = prompt
        print(f'  cell {i} '
              f'cache_creation={result.get("cache_creation"):>6} '
              f'cache_read={result.get("cache_read"):>6} '
              f'cost=${result.get("cost_usd")} '
              f'wall={result.get("elapsed_s")}s', flush=True)
        results.append(result)

    (arm_dir / 'summary.json').write_text(json.dumps(results, indent=2))
    return results


def arm_a_args(parent_id):
    """Arm A: bare. Each call uses --session-id with a NEW uuid → no continuity."""
    sid = parent_id or str(uuid.uuid4())
    if parent_id:
        # For cells, use fresh session-ids each time (the actual baseline pattern
        # the current harness uses — every -p call is independent)
        sid = str(uuid.uuid4())
    return ['--session-id', sid]


def arm_b_args(parent_id):
    """Arm B: --resume <parent> --fork-session."""
    if parent_id is None:
        return []  # seed has --session-id added by caller
    return ['--resume', parent_id, '--fork-session']


def arm_c_args(parent_id):
    """Arm C: arm B + --exclude-dynamic-system-prompt-sections."""
    base = arm_b_args(parent_id)
    return base + ['--exclude-dynamic-system-prompt-sections']


def main():
    print(f'OUT_DIR: {OUT_DIR}')
    print(f'Approx cost ceiling: $0.50 (12 cells)')

    arms = {
        'A_bare':                    arm_a_args,
        'B_fork':                    arm_b_args,
        'C_fork_plus_exclude_dyn':   arm_c_args,
    }
    all_results = {}
    for name, factory in arms.items():
        all_results[name] = run_arm(name, factory)

    # ─── Summary table ─────────────────────────────────────────────
    print('\n' + '=' * 76)
    print('SUMMARY: cache_read_input_tokens per cell (higher = cache hit)')
    print('=' * 76)
    print(f'{"arm":30s} {"seed":>10s} {"cell1":>10s} {"cell2":>10s} '
          f'{"cell3":>10s} {"cell4":>10s}')
    for name, rows in all_results.items():
        vals = [r.get('cache_read', 0) or 0 for r in rows]
        print(f'{name:30s} ' + ' '.join(f'{v:>10}' for v in vals))

    print('\nSUMMARY: cache_creation_input_tokens per cell (lower = cache hit)')
    print('=' * 76)
    print(f'{"arm":30s} {"seed":>10s} {"cell1":>10s} {"cell2":>10s} '
          f'{"cell3":>10s} {"cell4":>10s}')
    for name, rows in all_results.items():
        vals = [r.get('cache_creation', 0) or 0 for r in rows]
        print(f'{name:30s} ' + ' '.join(f'{v:>10}' for v in vals))

    print('\nSUMMARY: cost_usd per cell')
    print('=' * 76)
    print(f'{"arm":30s} {"seed":>10s} {"cell1":>10s} {"cell2":>10s} '
          f'{"cell3":>10s} {"cell4":>10s} {"total":>10s}')
    for name, rows in all_results.items():
        vals = [r.get('cost_usd', 0) or 0 for r in rows]
        total = sum(v for v in vals if v)
        cells = ' '.join(f'{v:>10.4f}' for v in vals)
        print(f'{name:30s} {cells} {total:>10.4f}')

    # Decision summary
    print('\n' + '=' * 76)
    print('DECISION')
    print('=' * 76)
    for name, rows in all_results.items():
        if len(rows) < 2:
            continue
        cell_reads = [r.get('cache_read', 0) or 0 for r in rows[1:]]
        cell_creates = [r.get('cache_creation', 0) or 0 for r in rows[1:]]
        avg_read = sum(cell_reads) / len(cell_reads)
        avg_create = sum(cell_creates) / len(cell_creates)
        verdict = 'CACHE HIT' if avg_read > avg_create else 'NO/PARTIAL CACHE'
        print(f'  {name}: avg cache_read={avg_read:.0f}, '
              f'avg cache_creation={avg_create:.0f} → {verdict}')

    out_file = OUT_DIR / 'all-results.json'
    out_file.write_text(json.dumps(all_results, indent=2))
    print(f'\nFull results: {out_file}')


if __name__ == '__main__':
    main()
