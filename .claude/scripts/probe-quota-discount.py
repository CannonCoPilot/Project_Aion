#!/usr/bin/env python3
"""
probe-quota-discount.py — empirically determine whether the Max-plan rolling
token quota counts cache_read_input_tokens at full raw-token rate or at the
10× cache-discount rate (matching billing).

Design:
  Primer  — 1 cold cell that warms a known prefix.
  Burst H — 5 cells each with a UNIQUE system prompt (cold-starts every cell).
            ~165K raw tokens, ~5 × $0.21 = ~$1.05 billed.
  Burst L — 5 cells with IDENTICAL system prompt (all cache_read after primer).
            ~165K raw tokens, ~5 × $0.024 = ~$0.12 billed.

Both bursts process ~same raw input volume but differ in billed cost by ~9×.
Sir reads the Max-plan Usage page's burn-rate slope during the H window vs the L
window, by timestamp. If H slope >> L slope → quota tracks billed cost.
If H slope ≈ L slope → quota tracks raw tokens (cache offers no quota relief).

Expected total spend: ~$1.40.
"""
import json
import subprocess
import time
import uuid
from pathlib import Path

OUT_DIR = Path('/Users/nathanielcannon/Claude/Project_Aion/.claude/scratch/quota-discount-probe')
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Common user prompt — same across all cells. Sized to a realistic CoD-cell shape.
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

# Identical system prompt for the primer + Burst L. Adding padding to bring the
# cached prefix to a meaningful size (~3-5K tokens) so the cache_read per cell
# is a non-trivial fraction of the cell's raw input.
PADDING_LOREM = ' '.join([
    'The following context is provided as a stable background frame.',
    'It is intentionally long enough to create a meaningful prefix to cache.',
] * 200)
STABLE_SYSTEM = (
    'You are a careful technical assistant. Answer concisely in 2-3 sentences. '
    'No preamble. '
    + PADDING_LOREM
)


def make_unique_system(cell_id: str) -> str:
    """Vary the padding bytes to defeat the prefix cache; preserve size class."""
    return (
        f'You are a careful technical assistant cell-{cell_id}. '
        'Answer concisely in 2-3 sentences. No preamble. '
        + PADDING_LOREM[:len(PADDING_LOREM) - len(cell_id) - 30]
        + f'  [unique-suffix-{cell_id}-{uuid.uuid4().hex[:8]}]'
    )


def run_cell(label: str, system_prompt: str, out_path: Path,
             timeout: int = 180) -> dict:
    cmd = ['claude',
           '--session-id', str(uuid.uuid4()),
           '--system-prompt', system_prompt,
           '--output-format', 'stream-json',
           '--verbose', '--include-partial-messages',
           '-p', USER_PROMPT]
    t0 = time.time()
    ts_start = time.strftime('%H:%M:%SZ', time.gmtime())
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        return {'label': label, 'error': f'timeout {timeout}s',
                'ts_start': ts_start, 'elapsed_s': round(time.time() - t0, 1)}
    elapsed = time.time() - t0
    out_path.write_text(proc.stdout)
    if proc.returncode != 0:
        return {'label': label, 'error': proc.stderr[:300],
                'ts_start': ts_start, 'elapsed_s': round(elapsed, 1)}

    usage, cost = None, None
    for line in proc.stdout.splitlines():
        s = line.strip()
        if not s.startswith('{'):
            continue
        try:
            obj = json.loads(s)
        except json.JSONDecodeError:
            continue
        if obj.get('type') == 'result':
            usage = obj.get('usage') or usage
            cost = obj.get('total_cost_usd', cost)
        elif obj.get('type') == 'assistant':
            m = obj.get('message', {})
            if 'usage' in m:
                usage = m['usage']
    u = usage or {}
    raw_input = (u.get('cache_creation_input_tokens', 0) +
                 u.get('cache_read_input_tokens', 0) +
                 u.get('input_tokens', 0))
    return {
        'label': label,
        'ts_start': ts_start,
        'cache_creation': u.get('cache_creation_input_tokens', 0),
        'cache_read':     u.get('cache_read_input_tokens', 0),
        'input_tokens':   u.get('input_tokens', 0),
        'output_tokens':  u.get('output_tokens', 0),
        'raw_input_total': raw_input,
        'cost_usd': cost,
        'elapsed_s': round(elapsed, 1),
    }


def emit(r):
    if 'error' in r:
        print(f'  [{r["ts_start"]}] {r["label"]:18s} ERROR {r["error"][:60]}', flush=True)
        return
    print(f'  [{r["ts_start"]}] {r["label"]:18s} '
          f'cr={r["cache_creation"]:>6} rd={r["cache_read"]:>6} '
          f'raw={r["raw_input_total"]:>6} out={r["output_tokens"]:>4} '
          f'${r.get("cost_usd") or 0:.4f} {r["elapsed_s"]}s', flush=True)


def main():
    results = []
    print(f'=== QUOTA-DISCOUNT PROBE ===')
    print(f'Start: {time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}')
    print(f'OUT_DIR: {OUT_DIR}\n')

    # ─── Primer ────────────────────────────────────────────────────
    print('--- Primer (warm the STABLE_SYSTEM prefix) ---')
    print(f'>>> WINDOW_START: PRIMER {time.strftime("%H:%M:%SZ", time.gmtime())}')
    r = run_cell('primer', STABLE_SYSTEM, OUT_DIR / 'primer.jsonl')
    emit(r); results.append(r)
    print(f'>>> WINDOW_END:   PRIMER {time.strftime("%H:%M:%SZ", time.gmtime())}')

    # Small quiet gap (let Anthropic edge cache settle).
    time.sleep(5)

    # ─── Burst H (cold, unique system prompt per cell) ─────────────
    print(f'\n--- Burst H: 5 COLD cells (unique system per cell) ---')
    print(f'>>> WINDOW_START: BURST_H {time.strftime("%H:%M:%SZ", time.gmtime())}')
    for i in range(1, 6):
        sys_p = make_unique_system(f'h{i}')
        r = run_cell(f'H_cold_{i}', sys_p, OUT_DIR / f'h-{i}.jsonl')
        emit(r); results.append(r)
    print(f'>>> WINDOW_END:   BURST_H {time.strftime("%H:%M:%SZ", time.gmtime())}')

    # Small quiet gap to make the bursts visually distinct on the Usage page.
    print('\n(quiet gap — 30s)')
    time.sleep(30)

    # ─── Burst L (warm, identical system prompt for all) ───────────
    print(f'\n--- Burst L: 5 WARM cells (matches primer prefix) ---')
    print(f'>>> WINDOW_START: BURST_L {time.strftime("%H:%M:%SZ", time.gmtime())}')
    for i in range(1, 6):
        r = run_cell(f'L_warm_{i}', STABLE_SYSTEM, OUT_DIR / f'l-{i}.jsonl')
        emit(r); results.append(r)
    print(f'>>> WINDOW_END:   BURST_L {time.strftime("%H:%M:%SZ", time.gmtime())}')

    (OUT_DIR / 'results.json').write_text(json.dumps(results, indent=2))

    # ─── Summary ───────────────────────────────────────────────────
    print('\n' + '=' * 70)
    print('SUMMARY')
    print('=' * 70)
    primer = [r for r in results if r.get('label') == 'primer' and 'error' not in r]
    h_cells = [r for r in results if r.get('label', '').startswith('H_') and 'error' not in r]
    l_cells = [r for r in results if r.get('label', '').startswith('L_') and 'error' not in r]

    for name, cells in [('PRIMER', primer), ('BURST_H', h_cells), ('BURST_L', l_cells)]:
        if not cells:
            continue
        raw = sum(r['raw_input_total'] for r in cells)
        rd = sum(r['cache_read'] for r in cells)
        cr = sum(r['cache_creation'] for r in cells)
        out_tok = sum(r['output_tokens'] for r in cells)
        cost = sum(r.get('cost_usd') or 0 for r in cells)
        print(f'{name:8s} n={len(cells):2d}  raw_in={raw:>7} '
              f'(cr={cr:>7} rd={rd:>7})  out={out_tok:>5}  ${cost:.4f}')

    if h_cells and l_cells:
        h_raw = sum(r['raw_input_total'] for r in h_cells)
        l_raw = sum(r['raw_input_total'] for r in l_cells)
        h_cost = sum(r.get('cost_usd') or 0 for r in h_cells)
        l_cost = sum(r.get('cost_usd') or 0 for r in l_cells)
        print()
        print(f'Raw-input ratio H:L  = {h_raw / l_raw:.2f}×')
        print(f'Billed-cost ratio H:L = {h_cost / l_cost:.2f}×')

    print()
    print('NEXT STEP: Sir reads the Max-plan Usage page burn-rate plot;')
    print('compares the slope during BURST_H window vs the slope during BURST_L window.')
    print('  Slope H ≫ Slope L  →  quota tracks billed cost (cache discount applies)')
    print('  Slope H ≈ Slope L  →  quota tracks raw tokens (cache discount does NOT apply)')


if __name__ == '__main__':
    main()
