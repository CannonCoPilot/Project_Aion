#!/usr/bin/env python3
"""
cache-mechanics-v4-plots.py — generate result plots for the v4 study.

Reads .claude/scratch/cache-mechanics-v4/main-results.json and writes PNGs
into .claude/scratch/cache-mechanics-v4/plots/.

Plot order matches the article's metric priority:
  %Usage (primary) > wall time > tokens-by-type > $ spend (supporting)
plus topology-specific and operational-signal plots.

Plots generated:
  01-usage-per-arm.png         %Usage consumed per arm (PRIMARY metric)
  02-wall-time-per-arm.png     Wall time per arm
  03-tokens-by-type.png        Tokens by type (cache_cr/rd/in/out) per arm
  04-util-slope-per-arm.png    %/min burn-rate slope per arm
  05-cache-regime-scatter.png  cache_creation vs cache_read per cell
  06-tool-comparison.png       Arms E vs F tool-use comparison (pending redesign)
  07-h-format-probe.png        Arm H format-probe pass rates (pending redesign)
  08-ttl-result.png            TTL prime vs probe summary
  09-status-timeline.png       Unified 5h-status transition during experiment
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path('/Users/nathanielcannon/Claude/Project_Aion')
DATA_DIR = ROOT / '.claude/scratch/cache-mechanics-v4'
PLOT_DIR = DATA_DIR / 'plots'
PLOT_DIR.mkdir(parents=True, exist_ok=True)

ARM_ORDER = [
    'A_independent', 'B_resume_chain', 'C_fork_tree', 'D_extend_fork',
    'H_output_format', 'E_tooluse_stripped', 'F_tooluse_default',
]
ARM_LABEL = {
    'A_independent':      'A\nIndependent',
    'B_resume_chain':     'B\n--resume',
    'C_fork_tree':        'C\nfork tree',
    'D_extend_fork':      'D\nextend-then-\nfork',
    'H_output_format':    'H\noutput format',
    'E_tooluse_stripped': 'E\ntool-use\nstripped',
    'F_tooluse_default':  'F\ntool-use\ndefault',
}
ARM_COLOR = {
    'A_independent':      '#9e9e9e',
    'B_resume_chain':     '#1976d2',
    'C_fork_tree':        '#c62828',
    'D_extend_fork':      '#2e7d32',
    'H_output_format':    '#7b1fa2',
    'E_tooluse_stripped': '#ef6c00',
    'F_tooluse_default':  '#5d4037',
}


def _style(ax, *, gridaxis: str = 'y') -> None:
    """Apply consistent professional styling to a matplotlib axis."""
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#666')
    ax.spines['bottom'].set_color('#666')
    if gridaxis:
        ax.grid(axis=gridaxis, alpha=0.15, color='#666', linewidth=0.5)
    ax.tick_params(colors='#333', labelsize=10)
    ax.title.set_color('#222')
    ax.title.set_fontsize(12)
    ax.title.set_fontweight('bold')
    ax.xaxis.label.set_color('#444')
    ax.xaxis.label.set_fontsize(11)
    ax.yaxis.label.set_color('#444')
    ax.yaxis.label.set_fontsize(11)


def load_main() -> dict[str, Any]:
    f = DATA_DIR / 'main-results.json'
    if not f.exists():
        print(f'ERROR: {f} missing', file=sys.stderr)
        sys.exit(1)
    return json.loads(f.read_text())


def all_cells_for_arm(arm_data: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        c for rep in arm_data.get('repeats', [])
        for c in rep.get('cells', [])
        if 'error' not in c
    ]


# ────────────────────────────────────────────────────────────────────
# Primary metric: %Usage consumed per arm (replaces former $-leading)
# ────────────────────────────────────────────────────────────────────
def plot_usage_per_arm(overall: dict[str, Any]) -> None:
    arms = overall.get('arms', {})
    labels, vals, colors = [], [], []
    for k in ARM_ORDER:
        if k not in arms:
            continue
        # main-results stores util fraction; ×100 for real percent
        delta = arms[k].get('util_delta_pct')
        if delta is None:
            continue
        labels.append(ARM_LABEL[k])
        vals.append(delta * 100)
        colors.append(ARM_COLOR[k])
    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(labels, vals, color=colors, edgecolor='white', linewidth=1)
    ax.set_ylabel('5h-window %Usage consumed')
    ax.set_title('Window-budget consumption by arm (3 repeats combined)')
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.2,
                f'{v:.0f}%', ha='center', fontsize=10, fontweight='bold')
    ax.set_ylim(0, max(vals) * 1.18)
    _style(ax)
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '01-usage-per-arm.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# Secondary metric: wall time per arm
# ────────────────────────────────────────────────────────────────────
def plot_wall_time(overall: dict[str, Any]) -> None:
    arms = overall.get('arms', {})
    labels, walls, colors = [], [], []
    for k in ARM_ORDER:
        if k not in arms:
            continue
        labels.append(ARM_LABEL[k])
        walls.append(arms[k].get('wall_seconds', 0))
        colors.append(ARM_COLOR[k])
    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(labels, walls, color=colors, edgecolor='white', linewidth=1)
    ax.set_ylabel('Wall time (seconds, 3 repeats combined)')
    ax.set_title('Time to complete by arm')
    for b, v in zip(bars, walls):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + max(walls) * 0.015,
                f'{v:.0f}s', ha='center', fontsize=10, fontweight='bold')
    ax.set_ylim(0, max(walls) * 1.15)
    _style(ax)
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '02-wall-time-per-arm.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# Tertiary metric: tokens by type, stacked
# ────────────────────────────────────────────────────────────────────
def plot_tokens_by_type(overall: dict[str, Any]) -> None:
    arms = overall.get('arms', {})
    rows = []
    for k in ARM_ORDER:
        if k not in arms:
            continue
        cells = all_cells_for_arm(arms[k])
        rows.append((
            ARM_LABEL[k],
            sum(c.get('cache_creation', 0) for c in cells),
            sum(c.get('cache_read', 0) for c in cells),
            sum(c.get('input_tokens', 0) for c in cells),
            sum(c.get('output_tokens', 0) for c in cells),
        ))
    labels = [r[0] for r in rows]
    cc = [r[1] / 1000 for r in rows]  # K tokens
    cr = [r[2] / 1000 for r in rows]
    in_ = [r[3] / 1000 for r in rows]
    out = [r[4] / 1000 for r in rows]
    fig, ax = plt.subplots(figsize=(10, 5))
    width = 0.6
    p1 = ax.bar(labels, cc, width, color='#d32f2f', label='cache_creation', edgecolor='white', linewidth=0.5)
    p2 = ax.bar(labels, cr, width, bottom=cc, color='#388e3c', label='cache_read', edgecolor='white', linewidth=0.5)
    bottom2 = [a + b for a, b in zip(cc, cr)]
    p3 = ax.bar(labels, in_, width, bottom=bottom2, color='#f9a825', label='input', edgecolor='white', linewidth=0.5)
    bottom3 = [a + b for a, b in zip(bottom2, in_)]
    p4 = ax.bar(labels, out, width, bottom=bottom3, color='#1976d2', label='output', edgecolor='white', linewidth=0.5)
    ax.set_ylabel('Tokens (thousands)')
    ax.set_title('Token spend by type — cache writes vs cache reads dominate')
    ax.legend(loc='upper right', frameon=False, fontsize=10)
    # Total label above each stack
    totals = [a + b + c + d for a, b, c, d in zip(cc, cr, in_, out)]
    for i, t in enumerate(totals):
        ax.text(i, t + max(totals) * 0.015, f'{t:,.0f}K', ha='center', fontsize=9, color='#333')
    ax.set_ylim(0, max(totals) * 1.13)
    _style(ax)
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '03-tokens-by-type.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# Burn-rate slope (already in real %/min)
# ────────────────────────────────────────────────────────────────────
def plot_util_slope(overall: dict[str, Any]) -> None:
    arms = overall.get('arms', {})
    labels, slopes, colors = [], [], []
    for k in ARM_ORDER:
        if k not in arms:
            continue
        s = arms[k].get('util_pct_per_min')
        if s is None:
            continue
        labels.append(ARM_LABEL[k])
        slopes.append(s * 100)  # main-results stores fraction
        colors.append(ARM_COLOR[k])
    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(labels, slopes, color=colors, edgecolor='white', linewidth=1)
    ax.set_ylabel('Burn rate — %Usage per minute')
    ax.set_title('Sustainability slope by arm — higher = exhausts window faster')
    ax.axhline(20, color='#999', linestyle='--', linewidth=1, alpha=0.6)
    ax.text(len(slopes) - 0.5, 20.4, '20%/min ≈ 5 min to exhaust',
            ha='right', va='bottom', fontsize=9, color='#666', style='italic')
    for b, v in zip(bars, slopes):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.15,
                f'{v:.1f}', ha='center', fontsize=10, fontweight='bold')
    ax.set_ylim(0, max(slopes + [20]) * 1.18)
    _style(ax)
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '04-util-slope-per-arm.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# Cache regime per cell (cache_creation vs cache_read scatter)
# ────────────────────────────────────────────────────────────────────
def plot_cache_regime_scatter(overall: dict[str, Any]) -> None:
    arms = overall.get('arms', {})
    fig, ax = plt.subplots(figsize=(9, 6))
    for k in ARM_ORDER:
        if k not in arms:
            continue
        cells = all_cells_for_arm(arms[k])
        xs = [c.get('cache_creation', 0) / 1000 for c in cells]
        ys = [c.get('cache_read', 0) / 1000 for c in cells]
        label = ARM_LABEL[k].replace('\n', ' ')
        ax.scatter(xs, ys, color=ARM_COLOR[k], label=label, alpha=0.75, s=55, edgecolors='white', linewidths=0.6)
    ax.set_xlabel('cache_creation_input_tokens (K, new cache written)')
    ax.set_ylabel('cache_read_input_tokens (K, cache hit)')
    ax.set_title('Cache regime per cell — bimodal split: registration vs established')
    ax.legend(loc='upper right', frameon=False, fontsize=9)
    ax.axvspan(0, 5, alpha=0.06, color='#2ca02c')
    ax.text(2.5, ax.get_ylim()[1] * 0.05, 'established\n(low write, high read)',
            ha='center', fontsize=8, color='#2ca02c', style='italic')
    _style(ax, gridaxis='both')
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '05-cache-regime-scatter.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# Tool comparison (pending redesign per Sir's review)
# ────────────────────────────────────────────────────────────────────
def plot_tool_comparison(overall: dict[str, Any]) -> None:
    arms = overall.get('arms', {})
    e = arms.get('E_tooluse_stripped')
    f = arms.get('F_tooluse_default')
    if not e or not f:
        return
    e_cells = all_cells_for_arm(e)
    f_cells = all_cells_for_arm(f)
    e_tools = sum(len(c.get('tool_uses') or []) for c in e_cells)
    f_tools = sum(len(c.get('tool_uses') or []) for c in f_cells)
    e_util = (e.get('util_delta_pct') or 0) * 100
    f_util = (f.get('util_delta_pct') or 0) * 100
    e_wall = e.get('wall_seconds', 0)
    f_wall = f.get('wall_seconds', 0)
    fig, axes = plt.subplots(1, 3, figsize=(13, 4))
    metrics = [
        ('%Usage consumed', [e_util, f_util], '%'),
        ('Wall seconds', [e_wall, f_wall], 's'),
        ('Tool calls fired', [e_tools, f_tools], ''),
    ]
    for ax, (title, vals, unit) in zip(axes, metrics):
        bars = ax.bar(['E stripped', 'F default'], vals,
                      color=[ARM_COLOR['E_tooluse_stripped'], ARM_COLOR['F_tooluse_default']],
                      edgecolor='white', linewidth=1)
        for b, v in zip(bars, vals):
            label = f'{v:.1f}{unit}' if isinstance(v, float) else f'{v}{unit}'
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + max(vals) * 0.03,
                    label, ha='center', fontsize=10, fontweight='bold')
        ax.set_title(title)
        ax.set_ylim(0, max(vals) * 1.18)
        _style(ax)
    plt.suptitle('Tool-use: stripped vs default --system-prompt',
                 fontsize=13, fontweight='bold', color='#222')
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '06-tool-comparison.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# H format probe (pending redesign per Sir's review)
# ────────────────────────────────────────────────────────────────────
def plot_h_format(overall: dict[str, Any]) -> None:
    h = overall.get('arms', {}).get('H_output_format')
    if not h:
        return
    by_label: dict[str, list[bool]] = {}
    by_label_tokens: dict[str, list[int]] = {}
    for rep in h.get('repeats', []):
        for c in rep.get('cells', []):
            if c.get('cell') == 0:
                continue
            full = c.get('label', '?')
            lbl = full.split('_')[1] if '_' in full else full
            passed = c.get('context_probe_passed')
            if passed is None:
                continue
            by_label.setdefault(lbl, []).append(bool(passed))
            by_label_tokens.setdefault(lbl, []).append(c.get('output_tokens') or 0)
    if not by_label:
        return
    order = ['bare', 'format', 'echo', 'free']
    labels = [l for l in order if l in by_label]
    pass_rates = [sum(by_label[l]) / len(by_label[l]) * 100 for l in labels]
    mean_tokens = [sum(by_label_tokens[l]) / len(by_label_tokens[l]) for l in labels]
    h_colors = ['#d32f2f', '#f57c00', '#388e3c', '#1976d2']
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))
    b1 = ax1.bar(labels, pass_rates, color=h_colors, edgecolor='white', linewidth=1)
    ax1.set_ylabel('Probe pass rate (%)')
    ax1.set_ylim(0, 115)
    ax1.set_title('Identifier-echo probe by format')
    for b, v in zip(b1, pass_rates):
        ax1.text(b.get_x() + b.get_width() / 2, b.get_height() + 3,
                 f'{v:.0f}%', ha='center', fontsize=10, fontweight='bold')
    _style(ax1)
    b2 = ax2.bar(labels, mean_tokens, color=h_colors, edgecolor='white', linewidth=1)
    ax2.set_ylabel('Mean output tokens')
    ax2.set_title('Output volume by format')
    for b, v in zip(b2, mean_tokens):
        ax2.text(b.get_x() + b.get_width() / 2, b.get_height() + max(mean_tokens) * 0.03,
                 f'{v:.0f}', ha='center', fontsize=10, fontweight='bold')
    ax2.set_ylim(0, max(mean_tokens) * 1.18)
    _style(ax2)
    plt.suptitle('Arm H — format constraint vs identifier echo',
                 fontsize=13, fontweight='bold', color='#222')
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '07-h-format-probe.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# TTL probe result
# ────────────────────────────────────────────────────────────────────
def plot_ttl(_overall: dict[str, Any]) -> None:
    f = DATA_DIR / 'G_ttl' / 'ttl-summary.json'
    if not f.exists():
        return
    s = json.loads(f.read_text())
    fig, ax = plt.subplots(figsize=(9, 5))
    metrics = ['Prime\ncache_creation', 'Probe\ncache_creation', 'Probe\ncache_read']
    vals = [s.get('prime_cache_creation') or 0,
            s.get('probe_cache_creation') or 0,
            s.get('probe_cache_read') or 0]
    miss = (s.get('probe_cache_creation') or 0) > 1000
    colors = ['#666666', '#d32f2f' if miss else '#2e7d32', '#1976d2']
    bars = ax.bar(metrics, vals, color=colors, edgecolor='white', linewidth=1)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + max(vals) * 0.025,
                f'{v:,.0f}', ha='center', fontsize=10, fontweight='bold')
    ax.set_ylabel('Tokens')
    verdict = s.get('verdict', '?')
    ax.set_title(f'TTL test (prime → 65 min idle → probe)  —  {verdict}')
    ax.set_ylim(0, max(vals) * 1.15)
    _style(ax)
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '08-ttl-result.png', dpi=140, bbox_inches='tight')
    plt.close()


# ────────────────────────────────────────────────────────────────────
# Unified 5h-status transition timeline (NEW)
# ────────────────────────────────────────────────────────────────────
def plot_status_timeline() -> None:
    tsv = DATA_DIR / 'G_status' / 'status-timeline.tsv'
    if not tsv.exists():
        return
    times, utils, statuses = [], [], []
    with tsv.open() as fh:
        for row in csv.reader(fh, delimiter='\t'):
            if len(row) < 4:
                continue
            try:
                t = float(row[0]) / 60.0  # seconds → minutes
                u = float(row[1])
            except ValueError:
                continue
            times.append(t)
            utils.append(u)
            statuses.append(row[2])
    if not times:
        return
    fig, ax = plt.subplots(figsize=(11, 5))
    color_for = {'allowed': '#2e7d32', 'allowed_warning': '#f57c00', 'rejected': '#c62828'}
    for t, u, s in zip(times, utils, statuses):
        ax.scatter(t, u, color=color_for.get(s, '#888'), s=22, edgecolors='none', alpha=0.85)
    # Annotate the two transitions
    first_warn = next((t for t, s in zip(times, statuses) if s == 'allowed_warning'), None)
    first_rej = next((t for t, s in zip(times, statuses) if s == 'rejected'), None)
    if first_warn is not None:
        ax.axvline(first_warn, color='#f57c00', linestyle='--', linewidth=1, alpha=0.6)
        ax.text(first_warn + 0.1, 50, f'first allowed_warning\nat T+{first_warn:.1f} min',
                fontsize=9, color='#f57c00', va='center')
    if first_rej is not None:
        ax.axvline(first_rej, color='#c62828', linestyle='--', linewidth=1, alpha=0.6)
        ax.text(first_rej - 0.1, 30, f'first rejected\nat T+{first_rej:.1f} min',
                fontsize=9, color='#c62828', va='center', ha='right')
    ax.axhline(100, color='#c62828', linestyle=':', linewidth=1, alpha=0.4)
    ax.set_xlabel('Minutes from experiment start (T = 2026-05-22T17:34:21Z)')
    ax.set_ylabel('anthropic-ratelimit-unified-5h-utilization (%)')
    ax.set_title('Unified 5h-status transitions — allowed → warning → rejected')
    ax.set_ylim(35, 105)
    # Legend
    from matplotlib.lines import Line2D
    handles = [
        Line2D([0], [0], marker='o', color='w', markerfacecolor=color_for['allowed'],
               markersize=9, label='allowed'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor=color_for['allowed_warning'],
               markersize=9, label='allowed_warning'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor=color_for['rejected'],
               markersize=9, label='rejected (429)'),
    ]
    ax.legend(handles=handles, loc='lower right', frameon=False, fontsize=10)
    _style(ax, gridaxis='both')
    plt.tight_layout()
    plt.savefig(PLOT_DIR / '09-status-timeline.png', dpi=140, bbox_inches='tight')
    plt.close()


def main() -> None:
    overall = load_main()
    # Primary → tertiary metrics
    plot_usage_per_arm(overall)
    plot_wall_time(overall)
    plot_tokens_by_type(overall)
    plot_util_slope(overall)
    # Topology-specific
    plot_cache_regime_scatter(overall)
    # Experiment-specific (will be replaced by E/F + H redesigns)
    plot_tool_comparison(overall)
    plot_h_format(overall)
    # TTL and operational signaling
    plot_ttl(overall)
    plot_status_timeline()
    print(f'Plots written to {PLOT_DIR}')


if __name__ == '__main__':
    main()
