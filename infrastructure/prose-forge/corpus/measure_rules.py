#!/usr/bin/env python3
"""
Phase 0.3 — measure every vale-ai-tells rule against every corpus arm.

The Phase 0 gate asks one question: which existing rules actually separate
Archon prose from Sir's? This answers it with numbers, or reports that none do.

METHOD, AND WHY IT IS NOT JUST "RUN VALE ON BOTH"
-------------------------------------------------
LENGTH IS THE CONFOUND.  The human arm has a median of 49 words; the Archon
conversational arm 24. Nearly every rule fires more often in longer text, so an
unmatched comparison measures length and calls it style. So the Archon arm is
resampled to match the human arm's word-count distribution bucket by bucket,
and rates are reported per 1,000 words on top of that.

ONE RECORD PER FILE.  Concatenating an arm into one document would let
document-scoped rules (opening cliches, heading rules) fire once for thousands
of records, and would invent sentence adjacency across authors. Each record is
written to its own file so scope means what the rule author intended.

DISCRIMINATION, NOT FREQUENCY.  A rule that fires constantly in both arms is
useless however loud it is. The reported statistic is the rate ratio between
arms, with the absolute rates alongside so a ratio built on three hits is
visibly untrustworthy.
"""

from __future__ import annotations
import argparse, json, random, shutil, subprocess, sys, tempfile
from collections import defaultdict
from pathlib import Path

BASE = Path("/Users/nathanielcannon/Claude/Project_Aion/infrastructure/prose-forge")
OUT = BASE / "out"


def load(arm: str) -> list[dict]:
    p = OUT / "arms" / f"{arm}.jsonl"
    return [json.loads(l) for l in p.open(encoding="utf-8")]


def bucket(w: int) -> int:
    """Word-count bucket. Coarse near the bottom where most records live."""
    for i, hi in enumerate((10, 25, 50, 100, 200, 400, 800, 1600, 3200)):
        if w < hi:
            return i
    return 9


def length_match(target: list[dict], pool: list[dict], seed: int
                 ) -> tuple[list[dict], dict[int, int]]:
    """Resample `pool` so its bucket histogram matches `target`'s."""
    rng = random.Random(seed)
    by_b: dict[int, list[dict]] = defaultdict(list)
    for r in pool:
        by_b[bucket(r["words"])].append(r)
    want: dict[int, int] = defaultdict(int)
    for r in target:
        want[bucket(r["words"])] += 1
    out: list[dict] = []
    shortfall: dict[int, int] = {}
    for b, n in sorted(want.items()):
        avail = by_b.get(b, [])
        if len(avail) >= n:
            out.extend(rng.sample(avail, n))
        else:
            out.extend(avail)
            if n - len(avail):
                shortfall[b] = n - len(avail)
    return out, shortfall


def run_vale(records: list[dict], tmp: Path) -> dict[str, int]:
    """Write one file per record, run Vale once, return rule -> hit count."""
    d = tmp / "docs"
    d.mkdir(parents=True, exist_ok=True)
    for r in records:
        (d / f"{r['id']}.md").write_text(r["text"], encoding="utf-8")
    proc = subprocess.run(
        ["vale", "--output=JSON", "--no-exit", str(d)],
        cwd=str(BASE), capture_output=True, text=True)
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        sys.stderr.write(proc.stdout[:600] + "\n" + proc.stderr[:600] + "\n")
        raise
    hits: dict[str, int] = defaultdict(int)
    for alerts in data.values():
        for a in alerts:
            hits[a.get("Check", "?")] += 1
    shutil.rmtree(d, ignore_errors=True)
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=17)
    ap.add_argument("--max-per-arm", type=int, default=1200)
    args = ap.parse_args()

    human = load("human-conversational")
    archon = load("archon-conversational")

    rng = random.Random(args.seed)
    if len(human) > args.max_per_arm:
        human = rng.sample(human, args.max_per_arm)

    matched, shortfall = length_match(human, archon, args.seed)

    hw = sum(r["words"] for r in human)
    aw = sum(r["words"] for r in matched)
    print(f"human   {len(human):>5,} records  {hw:>9,} words")
    print(f"archon  {len(matched):>5,} records  {aw:>9,} words  (length-matched)")
    if shortfall:
        print(f"  bucket shortfall: {shortfall}")
    print()

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        print("running vale on human arm ...", flush=True)
        h_hits = run_vale(human, tmp)
        print("running vale on archon arm ...", flush=True)
        a_hits = run_vale(matched, tmp)

    rules = sorted(set(h_hits) | set(a_hits))
    rows = []
    for r in rules:
        h, a = h_hits.get(r, 0), a_hits.get(r, 0)
        hr = h / hw * 1000
        ar = a / aw * 1000
        # Ratio with a +0.5 hit floor so a 0-vs-3 rule cannot read as infinite.
        ratio = ((a + 0.5) / aw) / ((h + 0.5) / hw)
        rows.append({"rule": r.replace("ai-tells.", ""), "human_hits": h,
                     "archon_hits": a, "human_per_1k": round(hr, 4),
                     "archon_per_1k": round(ar, 4), "ratio": round(ratio, 3)})

    rows.sort(key=lambda x: -x["ratio"])
    res = {"human_words": hw, "archon_words": aw,
           "human_records": len(human), "archon_records": len(matched),
           "rules_fired": len(rows), "rules_total": 132, "rows": rows}
    (OUT / "rule_baseline.json").write_text(
        json.dumps(res, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"\n{len(rows)} of 132 rules fired at all\n")
    print(f"{'rule':34s} {'human/1k':>9} {'archon/1k':>10} {'ratio':>7} {'hits h/a':>10}")
    print("-" * 74)
    for x in rows[:22]:
        print(f"{x['rule']:34s} {x['human_per_1k']:>9.3f} {x['archon_per_1k']:>10.3f} "
              f"{x['ratio']:>7.2f} {x['human_hits']:>4}/{x['archon_hits']:<5}")
    print("\n... bottom 8 (fire MORE in Sir's prose = actively misleading):")
    for x in rows[-8:]:
        print(f"{x['rule']:34s} {x['human_per_1k']:>9.3f} {x['archon_per_1k']:>10.3f} "
              f"{x['ratio']:>7.2f} {x['human_hits']:>4}/{x['archon_hits']:<5}")
    print(f"\nfull table -> {OUT / 'rule_baseline.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
