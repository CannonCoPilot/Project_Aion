#!/usr/bin/env python3
"""
Phase 1.1 — does the stdlib port fire where Vale fires?

Two questions, kept separate because they fail differently:

  FIDELITY  Does prose_tells reproduce Vale's hits on the same text? Measured
            per record as a multiset comparison of matched strings, so a port
            that finds the right number of hits in the wrong places still
            fails. Vale's own `Match` field is the reference.

  SEPARATION Does the PORT — not Vale — still separate the arms? A port can be
            faithful and still lose the ratio if the hits it drops are the
            discriminating ones, so the ratio is recomputed from port hits on
            the same length-matched sample Phase 0 used.

It also writes a random sample of archon hits with context to
`out/adjudication_<rule>.txt` for the precision figure, which is a human
judgement and is not produced here.
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "out"
sys.path.insert(0, str(BASE))

import prose_tells  # noqa: E402
from measure_rules import bucket, length_match, load  # noqa: E402

RULES = {
    "ColonUsage": lambda t: prose_tells._colon_spans(t)[0],
    "CataphoricForecasting": prose_tells._cataphoric_spans,
}
STRIP = {
    "ColonUsage": lambda t: prose_tells.strip_markup(t, drop_headings=True),
    "CataphoricForecasting": lambda t: prose_tells.strip_markup(t),
}


def vale_by_record(records: list[dict], tmp: Path) -> dict[str, dict[str, Counter]]:
    """record id -> rule -> Counter of matched strings."""
    d = tmp / "docs"
    d.mkdir(parents=True, exist_ok=True)
    for r in records:
        (d / f"{r['id']}.md").write_text(r["text"], encoding="utf-8")
    proc = subprocess.run(["vale", "--output=JSON", "--no-exit", str(d)],
                          cwd=str(BASE), capture_output=True, text=True)
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        sys.stderr.write(proc.stdout[:600] + proc.stderr[:600])
        raise
    out: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
    for path, alerts in data.items():
        rid = Path(path).stem
        for a in alerts:
            rule = a.get("Check", "?").replace("ai-tells.", "")
            if rule in RULES:
                out[rid][rule][a.get("Match", "")] += 1
    shutil.rmtree(d, ignore_errors=True)
    return out


def port_by_record(records: list[dict]) -> dict[str, dict[str, Counter]]:
    out: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
    for r in records:
        for rule, fn in RULES.items():
            stripped = STRIP[rule](r["text"])
            for s, e in fn(r["text"]):
                out[r["id"]][rule][stripped[s:e]] += 1
    return out


def compare(arm: str, recs: list[dict], vale, port) -> dict[str, dict]:
    res = {}
    for rule in RULES:
        tp = fp = fn = 0
        for r in recs:
            v = vale.get(r["id"], {}).get(rule, Counter())
            p = port.get(r["id"], {}).get(rule, Counter())
            tp += sum((v & p).values())
            fp += sum((p - v).values())
            fn += sum((v - p).values())
        res[rule] = {"vale_hits": tp + fn, "port_hits": tp + fp,
                     "agree": tp, "port_only": fp, "vale_only": fn,
                     "recall": tp / (tp + fn) if tp + fn else 1.0,
                     "precision_vs_vale": tp / (tp + fp) if tp + fp else 1.0}
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=17)
    ap.add_argument("--human-arm", default="human-document")
    ap.add_argument("--archon-arm", default="archon-document")
    ap.add_argument("--sample", type=int, default=60)
    args = ap.parse_args()

    human = load(args.human_arm)
    archon, shortfall = length_match(human, load(args.archon_arm), args.seed)
    hw = sum(r["words"] for r in human)
    aw = sum(r["words"] for r in archon)
    print(f"human   {len(human):>4} records {hw:>8,} words")
    print(f"archon  {len(archon):>4} records {aw:>8,} words (length-matched)")
    if shortfall:
        print(f"  bucket shortfall: {shortfall}")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        v_h = vale_by_record(human, tmp)
        v_a = vale_by_record(archon, tmp)
    p_h = port_by_record(human)
    p_a = port_by_record(archon)

    print("\nFIDELITY — port vs Vale, matched strings per record")
    print(f"{'rule':24s} {'arm':7s} {'vale':>6} {'port':>6} {'agree':>6} "
          f"{'port-only':>10} {'vale-only':>10} {'recall':>7} {'prec':>6}")
    print("-" * 92)
    fid = {}
    for arm, recs, v, p in (("human", human, v_h, p_h), ("archon", archon, v_a, p_a)):
        c = compare(arm, recs, v, p)
        fid[arm] = c
        for rule, x in c.items():
            print(f"{rule:24s} {arm:7s} {x['vale_hits']:>6} {x['port_hits']:>6} "
                  f"{x['agree']:>6} {x['port_only']:>10} {x['vale_only']:>10} "
                  f"{x['recall']:>7.3f} {x['precision_vs_vale']:>6.3f}")

    print("\nSEPARATION — recomputed from PORT hits (Vale figures alongside)")
    print(f"{'rule':24s} {'h/1k':>7} {'a/1k':>7} {'ratio':>7}   "
          f"{'vale ratio':>10}  {'hits h/a':>10}")
    print("-" * 78)
    sep = {}
    for rule in RULES:
        h = fid["human"][rule]["port_hits"]
        a = fid["archon"][rule]["port_hits"]
        vh = fid["human"][rule]["vale_hits"]
        va = fid["archon"][rule]["vale_hits"]
        ratio = ((a + 0.5) / aw) / ((h + 0.5) / hw)
        vratio = ((va + 0.5) / aw) / ((vh + 0.5) / hw)
        sep[rule] = {"human_hits": h, "archon_hits": a,
                     "human_per_1k": round(h / hw * 1000, 4),
                     "archon_per_1k": round(a / aw * 1000, 4),
                     "ratio": round(ratio, 3), "vale_ratio": round(vratio, 3)}
        print(f"{rule:24s} {h/hw*1000:>7.3f} {a/aw*1000:>7.3f} {ratio:>7.2f}   "
              f"{vratio:>10.2f}  {h:>4}/{a:<5}")

    # bold-label subset: the known ColonUsage false-positive class
    bold_a = sum(len(prose_tells.BOLD_LABEL.findall(r["text"])) for r in archon)
    bold_h = sum(len(prose_tells.BOLD_LABEL.findall(r["text"])) for r in human)
    print(f"\nColonUsage bold run-in label subset (house style, not authorship): "
          f"human {bold_h}, archon {bold_a}")

    rng = random.Random(args.seed)
    for rule in RULES:
        pool = []
        for r in archon:
            stripped = STRIP[rule](r["text"])
            for s, e in RULES[rule](r["text"]):
                pool.append((r["id"], r["src"], stripped[s:e],
                             stripped[max(0, s - 90):e + 90].replace("\n", " ")))
        pick = rng.sample(pool, min(args.sample, len(pool)))
        f = OUT / f"adjudication_{rule}.txt"
        with f.open("w", encoding="utf-8") as fh:
            fh.write(f"# {rule} — {len(pick)} of {len(pool)} archon hits, seed {args.seed}\n"
                     f"# Mark each: Y = the construction the rule names, N = not.\n\n")
            for i, (rid, src, match, ctx) in enumerate(pick, 1):
                fh.write(f"[{i:>3}] ___  match={match!r}\n      src={src}\n"
                         f"      ...{ctx.strip()}...\n\n")
        print(f"adjudication sample -> {f}  ({len(pool)} hits total)")

    (OUT / "port_validation.json").write_text(
        json.dumps({"fidelity": fid, "separation": sep,
                    "bold_label": {"human": bold_h, "archon": bold_a},
                    "human_words": hw, "archon_words": aw},
                   indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"\nfull report -> {OUT / 'port_validation.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
