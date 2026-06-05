#!/usr/bin/env python3
"""
Cache mechanics v5 — Arm G (multi-probe TTL).

Subcommands:
  prime            : send the prime call; record sid, cache state, util.
  probe SID MINUTES: send a probe via --resume SID --fork-session (read-only
                     vs prime's cache). Records elapsed and cache state.
  summarize        : compute the boundary verdict from prime + probe records.

Output: .claude/scratch/cache-mechanics-v5/G/{prime.json, probe-NN.json,
summary.json}.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.request import urlopen

ROOT = Path('/Users/nathanielcannon/Claude/Project_Aion')
OUT = ROOT / '.claude/scratch/cache-mechanics-v5/G'
OUT.mkdir(parents=True, exist_ok=True)
BURN_RATE_URL = 'http://localhost:8800/api/v1/usage/burn-rate-curve'

PRIME_PROMPT = (
    'You are part of a TTL multi-probe validation experiment. '
    'Reply with EXACTLY the string: ttl-v5-canary-2026. '
    'Just that string, nothing else.'
)


def snapshot_util() -> dict[str, Any]:
    try:
        with urlopen(BURN_RATE_URL, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        windows = data.get('windows', [])
        if not windows:
            return {'available': False, 'reason': 'no windows'}
        latest = max(windows, key=lambda w: w['window_reset'])
        pts = latest.get('points', [])
        if not pts:
            return {'available': False, 'reason': 'no points'}
        last = pts[-1]
        raw = last.get('utilization')
        return {
            'available': True,
            'util_pct': (raw * 100) if raw is not None else None,
            'cumulative_tokens_io_only': last.get('cumulative_tokens'),
            'elapsed_seconds_in_window': last.get('elapsed_seconds'),
            'captured_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
    except Exception as e:
        return {'available': False, 'reason': f'{type(e).__name__}: {e}'}


def run_claude(args: list[str], prompt: str, timeout: int = 60) -> dict[str, Any]:
    cmd = ['claude', *args,
           '--output-format', 'json',
           '-p', prompt]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    elapsed = time.time() - t0
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {'error': 'invalid JSON', 'stdout': proc.stdout[:500],
                'stderr': proc.stderr[:500], 'elapsed_s': elapsed}
    usage = result.get('usage', {})
    cache_creation = usage.get('cache_creation_input_tokens') or 0
    cache_read = usage.get('cache_read_input_tokens') or 0
    return {
        'session_id': result.get('session_id'),
        'cache_creation': cache_creation,
        'cache_read': cache_read,
        'input_tokens': usage.get('input_tokens') or 0,
        'output_tokens': usage.get('output_tokens') or 0,
        'cost_usd': result.get('total_cost_usd') or 0,
        'response': (result.get('result') or '')[:200],
        'elapsed_s': round(elapsed, 2),
        'service_tier': usage.get('service_tier'),
    }


def cmd_prime() -> None:
    pre_util = snapshot_util()
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    r = run_claude([], PRIME_PROMPT)
    if 'error' in r:
        print(json.dumps({'phase': 'prime', 'error': r}, indent=2))
        sys.exit(1)
    rec = {
        'phase': 'prime',
        'started_at_utc': started,
        'pre_util': pre_util,
        'session_id': r['session_id'],
        'cache_creation': r['cache_creation'],
        'cache_read': r['cache_read'],
        'cost_usd': r['cost_usd'],
        'elapsed_s': r['elapsed_s'],
        'response': r['response'],
    }
    (OUT / 'prime.json').write_text(json.dumps(rec, indent=2))
    print(json.dumps(rec, indent=2))


def cmd_probe(_prime_sid_unused: str, minutes: int) -> None:
    """Fresh-call probe (no --resume, no --fork-session).

    The probe sends the same prompt as prime as a fresh call. Cache_read
    on the response tells us how much of the prime's cached prefix
    survived as a function of idle time.
    """
    prime = json.loads((OUT / 'prime.json').read_text())
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    pre_util = snapshot_util()
    r = run_claude([], PRIME_PROMPT)  # NO session flags — fresh call
    if 'error' in r:
        rec = {'phase': f'probe_T+{minutes}', 'error': r, 'pre_util': pre_util}
    else:
        # cache_hit threshold: cache_read must exceed boilerplate-only baseline
        # (~17K). A read > 30K means the prime-specific portion survived.
        boilerplate_threshold = 5000  # any read above this means cache is reachable
        full_prime_threshold = 30000   # this much means deep prime-prefix matched
        rec = {
            'phase': f'probe_T+{minutes}',
            'minutes_after_prime': minutes,
            'started_at_utc': started,
            'pre_util': pre_util,
            'session_id_fresh': r['session_id'],
            'cache_creation': r['cache_creation'],
            'cache_read': r['cache_read'],
            'cache_reachable': r['cache_read'] > boilerplate_threshold,
            'full_prime_cache_hit': r['cache_read'] > full_prime_threshold,
            'cost_usd': r['cost_usd'],
            'elapsed_s': r['elapsed_s'],
            'response': r['response'],
            'prime_cache_creation_baseline': prime['cache_creation'],
        }
    (OUT / f'probe-T{minutes:02d}.json').write_text(json.dumps(rec, indent=2))
    print(json.dumps(rec, indent=2))


def cmd_summarize() -> None:
    prime = json.loads((OUT / 'prime.json').read_text())
    probes = []
    for f in sorted(OUT.glob('probe-T*.json')):
        probes.append(json.loads(f.read_text()))
    summary = {
        'prime': {
            'started_at_utc': prime['started_at_utc'],
            'cache_creation': prime['cache_creation'],
            'sid': prime['session_id'],
            'pre_util_pct': prime['pre_util'].get('util_pct'),
        },
        'probes': [
            {
                'minutes_after_prime': p.get('minutes_after_prime'),
                'verdict': p.get('verdict'),
                'cache_read': p.get('cache_read'),
                'cache_creation': p.get('cache_creation'),
                'pre_util_pct': p.get('pre_util', {}).get('util_pct'),
                'cost_usd': p.get('cost_usd'),
            }
            for p in probes
        ],
    }
    last_hit = max((p['minutes_after_prime'] for p in summary['probes']
                    if p.get('verdict') == 'HIT'), default=None)
    first_miss = min((p['minutes_after_prime'] for p in summary['probes']
                      if p.get('verdict') == 'MISS'), default=None)
    if last_hit is not None and first_miss is not None:
        summary['boundary_min_window'] = [last_hit, first_miss]
    summary['total_cost_usd'] = round(
        prime['cost_usd'] + sum((p.get('cost_usd') or 0) for p in probes), 4)
    (OUT / 'summary.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


def main() -> None:
    if len(sys.argv) < 2:
        print('usage: cache-mechanics-v5-arm-g.py {prime|probe SID MINUTES|summarize}')
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == 'prime':
        cmd_prime()
    elif cmd == 'probe':
        if len(sys.argv) < 4:
            print('usage: probe SID MINUTES')
            sys.exit(2)
        cmd_probe(sys.argv[2], int(sys.argv[3]))
    elif cmd == 'summarize':
        cmd_summarize()
    else:
        print(f'unknown subcommand: {cmd}')
        sys.exit(2)


if __name__ == '__main__':
    main()
