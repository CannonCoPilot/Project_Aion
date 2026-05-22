#!/usr/bin/env python3
"""
validate-fork-cache-v2.py — scaled validation of `claude -p` cache + context
inheritance under three forking strategies. 30 cells total (3 arms × 10 cells).

Arms:
  A_independent — each cell uses a fresh session-id (models today's CoD harness)
  B_star_fork   — single seed; all 10 cells fork from the same parent
  C_chain_fork  — seed; each cell forks from the previous cell's session-id

Per-cell capture: cache_creation_input_tokens, cache_read_input_tokens,
input_tokens, output_tokens, cost_usd, elapsed_s, response (truncated).

Uses --system-prompt to strip the Claude Code default prefix (~33K tokens)
so per-cell raw input stays around 2K — sub-1% quota footprint expected.
"""
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path

ROOT = Path('/Users/nathanielcannon/Claude/Jarvis')
OUT_DIR = ROOT / '.claude/scratch/fork-cache-validation-v2'
OUT_DIR.mkdir(parents=True, exist_ok=True)

SYSTEM_PROMPT = (
    'You are a careful technical assistant. Answer concisely in 2-3 sentences. '
    'No preamble.'
)
USER_PROMPT = """Diagnose this Python error in 2-3 sentences:

Traceback (most recent call last):
  File 'app.py', line 42, in process_request
    result = handler.dispatch(payload)
  File 'handler.py', line 18, in dispatch
    return self._registry[payload['type']](payload)
KeyError: 'unknown_type'

Context: handler is initialized at startup with 3 registered types. The error
fires when external clients send request types not in the registry. What is
the most likely root cause and the minimal fix?"""

CELLS_PER_ARM = 10


def run_claude(args: list[str], prompt: str, out_path: Path,
               timeout: int = 180) -> dict:
    cmd = ['claude'] + args + ['--system-prompt', SYSTEM_PROMPT,
                               '--output-format', 'stream-json',
                               '--verbose', '--include-partial-messages',
                               '-p', prompt]
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        elapsed = time.time() - t0
        partial = e.output
        if isinstance(partial, bytes):
            partial = partial.decode(errors='replace')
        out_path.write_text(partial or '')
        return {'error': f'timeout after {timeout}s', 'elapsed_s': round(elapsed, 1)}
    except Exception as exc:
        return {'error': f'{type(exc).__name__}: {exc}', 'elapsed_s': round(time.time() - t0, 1)}
    elapsed = time.time() - t0
    out_path.write_text(proc.stdout)
    if proc.returncode != 0:
        return {'error': proc.stderr[:500], 'elapsed_s': round(elapsed, 1)}

    usage, cost, session_id, response = None, None, None, None
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
        elif 'session_id' in obj:
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
        'response': (response or '').strip()[:200],
    }


def run_arm_independent(arm_dir: Path) -> list[dict]:
    """Arm A: each cell uses a fresh UUID. No continuity."""
    results = []
    for i in range(1, CELLS_PER_ARM + 1):
        sid = str(uuid.uuid4())
        r = run_claude(['--session-id', sid], USER_PROMPT, arm_dir / f'cell-{i:02d}.jsonl')
        r['cell'] = i
        r['parent'] = None
        results.append(r)
        _emit(r, f'A.cell-{i:02d}', sid)
    return results


def run_arm_star_fork(arm_dir: Path) -> list[dict]:
    """Arm B: seed once, all 10 cells fork from same parent."""
    parent = str(uuid.uuid4())
    seed = run_claude(['--session-id', parent], USER_PROMPT, arm_dir / 'seed.jsonl')
    seed['cell'] = 0
    seed['parent'] = None
    _emit(seed, 'B.seed', parent)
    results = [seed]
    for i in range(1, CELLS_PER_ARM + 1):
        r = run_claude(['--resume', parent, '--fork-session'], USER_PROMPT,
                       arm_dir / f'cell-{i:02d}.jsonl')
        r['cell'] = i
        r['parent'] = parent
        results.append(r)
        _emit(r, f'B.cell-{i:02d}', r.get('session_id', '?'))
    return results


def run_arm_chain_fork(arm_dir: Path) -> list[dict]:
    """Arm C: seed; each cell forks from PREVIOUS cell's session-id."""
    parent = str(uuid.uuid4())
    seed = run_claude(['--session-id', parent], USER_PROMPT, arm_dir / 'seed.jsonl')
    seed['cell'] = 0
    seed['parent'] = None
    _emit(seed, 'C.seed', parent)
    results = [seed]
    current_parent = parent
    for i in range(1, CELLS_PER_ARM + 1):
        r = run_claude(['--resume', current_parent, '--fork-session'], USER_PROMPT,
                       arm_dir / f'cell-{i:02d}.jsonl')
        r['cell'] = i
        r['parent'] = current_parent
        results.append(r)
        _emit(r, f'C.cell-{i:02d}', r.get('session_id', '?'))
        if r.get('session_id'):
            current_parent = r['session_id']
    return results


def _emit(r: dict, label: str, sid: str) -> None:
    if 'error' in r:
        print(f'  {label:18s} ERROR {r["error"][:80]}', flush=True)
        return
    print(f'  {label:18s} sid={sid[:8]}… '
          f'cr={r["cache_creation"]:>5} rd={r["cache_read"]:>5} '
          f'in={r["input_tokens"]:>4} out={r["output_tokens"]:>4} '
          f'${r.get("cost_usd") or 0:.4f} {r["elapsed_s"]}s', flush=True)


def main():
    print(f'OUT_DIR: {OUT_DIR}')
    print(f'Start: {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')

    arms = {
        'A_independent': run_arm_independent,
        'B_star_fork':   run_arm_star_fork,
        'C_chain_fork':  run_arm_chain_fork,
    }
    all_results = {}
    for name, fn in arms.items():
        print(f'\n{"="*60}\nArm {name}\n{"="*60}', flush=True)
        arm_dir = OUT_DIR / name
        arm_dir.mkdir(exist_ok=True)
        all_results[name] = fn(arm_dir)
        (arm_dir / 'summary.json').write_text(json.dumps(all_results[name], indent=2))

    print(f'\nEnd: {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')
    (OUT_DIR / 'all-results.json').write_text(json.dumps(all_results, indent=2))

    # ─── Summary ─────────────────────────────────────────────────
    print('\n' + '=' * 76)
    print('PER-ARM AGGREGATES (cells only, seed excluded for fork arms)')
    print('=' * 76)
    header = f'{"arm":18s} {"n":>3s} {"cr_mean":>10s} {"rd_mean":>10s} {"cr_total":>10s} {"rd_total":>10s} {"cost_total":>12s}'
    print(header)
    extrap = {}
    for name, rows in all_results.items():
        cells = [r for r in rows if r.get('cell', 0) > 0 and 'error' not in r]
        n = len(cells)
        if n == 0:
            continue
        cr_mean = sum(r['cache_creation'] or 0 for r in cells) / n
        rd_mean = sum(r['cache_read'] or 0 for r in cells) / n
        cr_total = sum(r['cache_creation'] or 0 for r in cells)
        rd_total = sum(r['cache_read'] or 0 for r in cells)
        cost_total = sum(r.get('cost_usd') or 0 for r in cells)
        extrap[name] = {'cr_mean': cr_mean, 'rd_mean': rd_mean, 'cost_mean': cost_total / n}
        print(f'{name:18s} {n:>3d} {cr_mean:>10.0f} {rd_mean:>10.0f} '
              f'{cr_total:>10.0f} {rd_total:>10.0f} ${cost_total:>10.4f}')

    # ─── 50-cell CoD extrapolation ───────────────────────────────
    print('\n' + '=' * 76)
    print('EXTRAPOLATION: estimated burn for a 50-cell CoD-style run')
    print('=' * 76)
    print(f'{"arm":18s} {"50 × cost":>12s} {"vs A":>10s}')
    base = extrap.get('A_independent', {}).get('cost_mean', 0) * 50
    for name, e in extrap.items():
        total = e['cost_mean'] * 50
        rel = (total - base) / base * 100 if base else 0
        print(f'{name:18s} ${total:>11.3f} {rel:>+9.1f}%')

    print(f'\nFull JSON: {OUT_DIR / "all-results.json"}')


if __name__ == '__main__':
    main()
