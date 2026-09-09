#!/usr/bin/env python3
"""
ablation — certified variant pairs for the paired-ablation experiment.

THE EXPERIMENT THIS SERVES
--------------------------
W13:Jacques can run Snorkel's pre-submission checks for free, but only at about
one variant every two minutes with a human driving the UI. Thirty unpaired
labels fit nothing: topic, task, length and author would eat the signal at that
n. Thirty invocations spent as PAIRED contrasts answer a real question, because
each pair is its own control for all four.

So the unit of evidence is the FLIP, not the label. One base text, two variants
differing in exactly one style dimension, one check run on each, and the datum
is whether the verdict moved.

WHY A GENERATOR AND NOT HAND-WRITTEN VARIANTS
---------------------------------------------
Two reasons, and both are about attribution.

FIRST, meaning. If a variant also drops a caveat or a figure, a flipped verdict
could be that, not the style dimension. Every pair here must clear
`prose_fidelity.check` before it costs an invocation. A pair that cannot be
made without changing meaning is discarded, not shipped with a caveat.

SECOND, the manipulation check. A rewrite asked to raise colon density may also
shorten sentences, drop hedges and add bullets. Then the pair tests "everything
at once" and a flip attributes to nothing. So each pair is measured on ALL
dimensions: the target must move by at least `MIN_TARGET_DELTA`, and every
non-target must stay within `MAX_OFFTARGET_DELTA`. Pairs that fail are dropped.

The controls are REAL human prose from the `human_bundle_authored` arm. We
generate only the contrasting variant. Writing our own human side would measure
our impression of human writing rather than human writing, which is W13's point
and it is correct.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import statistics as st
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

import prose_fidelity as F          # noqa: E402
import prose_tells as T             # noqa: E402

CORPUS_GLOB = os.path.expanduser("~/.snorkel-dashboard/corpus/*.jsonl")
CLEAN_ARM = "human_bundle_authored"
MODEL = "qwen3:32b"


# ---------------------------------------------------------------------------
# Measured dimensions. Every pair is scored on ALL of them, whichever is being
# manipulated, so an off-target drift is visible rather than assumed absent.
# ---------------------------------------------------------------------------

def _strip(t: str) -> str:
    return T.strip_markup(t, drop_headings=True)


def _sentences(t: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", _strip(t)) if s.strip()]


def dims(text: str) -> dict[str, float]:
    s = _strip(text)
    w = max(len(s.split()), 1)
    sents = _sentences(text)
    lens = [len(x.split()) for x in sents] or [1]
    cv = (st.stdev(lens) / st.mean(lens)) if len(lens) > 1 and st.mean(lens) else 0.0
    return {
        "sentence_colon_per_1k": len(re.findall(r"[a-z,\)]\s?:\s", s)) / w * 1000,
        "hedge_per_1k": len(F._HEDGE.findall(s)) / w * 1000,
        "sentence_len_cv": cv,
        "em_dash_per_1k": len(re.findall(r"—|--", s)) / w * 1000,
        "bullet_per_1k": len(re.findall(r"(?m)^\s*[-*+]\s", text)) / w * 1000,
    }


#: How far the target must move for the pair to be a real manipulation, and how
#: far anything else may drift before the pair stops isolating one variable.
MIN_TARGET_DELTA = {"sentence_colon_per_1k": 15.0, "hedge_per_1k": 8.0,
                    "sentence_len_cv": 0.20}
MAX_OFFTARGET_DELTA = {"sentence_colon_per_1k": 6.0, "hedge_per_1k": 5.0,
                       "sentence_len_cv": 0.25, "em_dash_per_1k": 3.0,
                       "bullet_per_1k": 3.0}

INSTRUCTION = {
    "sentence_colon_per_1k": (
        "Rewrite the passage so that many sentences are joined with a COLON used "
        "mid-sentence as a clause hinge, after a lowercase word. Aim for roughly "
        "one such colon every 30 words. Change NOTHING else: keep every number, "
        "name, path, date, hedge and qualifier exactly as written, keep the same "
        "sentence order, do not add or remove bullets, and do not add or remove "
        "any claim."),
    "hedge_per_1k": (
        "Rewrite the passage adding hedging words (may, might, appears, roughly, "
        "likely) to its assertions, WITHOUT changing what is asserted or removing "
        "any claim. Keep every number, name, path and date exactly as written. "
        "Do not change sentence order, bullets, or punctuation style."),
    "sentence_len_cv": (
        "Rewrite the passage so every sentence is close to the same length, about "
        "18 words each, by splitting long sentences and merging short ones. Keep "
        "every number, name, path, date, hedge and claim exactly as written. Do "
        "not add or remove bullets."),
}


def rewrite(text: str, dimension: str, model: str, timeout: int = 300) -> str:
    prompt = (f"{INSTRUCTION[dimension]}\n\nOutput ONLY the rewritten passage, "
              f"with no preamble.\n\nPASSAGE:\n{text}")
    out = F._ollama(prompt, model, timeout).strip()
    return re.sub(r"^```[a-z]*\n|\n```$", "", out).strip()


def build_pair(rec: dict, dimension: str, model: str) -> dict:
    """One base text plus one contrasting variant, or a rejection with a reason."""
    base = rec["text"]
    var = rewrite(base, dimension, model)
    d0, d1 = dims(base), dims(var)
    delta = {k: round(d1[k] - d0[k], 3) for k in d0}

    reject = None
    if abs(delta[dimension]) < MIN_TARGET_DELTA[dimension]:
        reject = (f"target moved {delta[dimension]:+.2f}, under the "
                  f"{MIN_TARGET_DELTA[dimension]} needed to be a manipulation")
    else:
        for k, lim in MAX_OFFTARGET_DELTA.items():
            if k != dimension and abs(delta[k]) > lim:
                reject = (f"off-target drift on {k}: {delta[k]:+.2f} exceeds {lim}, "
                          f"so a flip could not be attributed to {dimension}")
                break

    fid = F.check(base, var) if reject is None else None
    if fid is not None and fid["verdict"] != "pass":
        reject = (f"fidelity gate returned {fid['verdict']}: "
                  + "; ".join(f["name"] for f in fid["flags"])[:200])

    return {
        "task_ref": rec.get("task_ref"), "genre": rec["genre"],
        "arm": rec.get("arm"), "dimension": dimension,
        "words_base": len(base.split()), "words_variant": len(var.split()),
        "dims_base": {k: round(v, 3) for k, v in d0.items()},
        "dims_variant": {k: round(v, 3) for k, v in d1.items()},
        "delta": delta,
        "fidelity_verdict": (fid or {}).get("verdict", "not_run"),
        "accepted": reject is None,
        "reject_reason": reject,
        "base_text": base, "variant_text": var,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dimension", default="sentence_colon_per_1k",
                    choices=sorted(INSTRUCTION))
    ap.add_argument("--pairs", type=int, default=4)
    ap.add_argument("--min-words", type=int, default=200)
    ap.add_argument("--max-words", type=int, default=900)
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--out", default=str(BASE / "out" / "ablation_pairs.jsonl"))
    args = ap.parse_args()

    files = sorted(glob.glob(CORPUS_GLOB))
    if not files:
        print(f"no corpus at {CORPUS_GLOB}; re-run W13's corpus_extract.py",
              file=sys.stderr)
        return 2
    recs = [json.loads(l) for l in open(files[-1], encoding="utf-8")]
    pool = [r for r in recs if r.get("arm") == CLEAN_ARM
            and args.min_words <= r["words"] <= args.max_words]
    # One per task_ref: two pairs from one task would not be independent.
    seen: set = set()
    uniq = []
    for r in sorted(pool, key=lambda x: x["words"]):
        if r.get("task_ref") in seen:
            continue
        seen.add(r.get("task_ref"))
        uniq.append(r)
    print(f"corpus {Path(files[-1]).name}: {len(pool)} in-band {CLEAN_ARM} records, "
          f"{len(uniq)} distinct task_refs")

    out, attempts = [], 0
    for r in uniq:
        if len(out) >= args.pairs:
            break
        attempts += 1
        p = build_pair(r, args.dimension, args.model)
        mark = "ACCEPT" if p["accepted"] else "reject"
        print(f"  [{mark}] {p['genre']:20s} {p['words_base']:>5}w  "
              f"target {p['delta'][args.dimension]:+7.2f}  "
              f"fidelity {p['fidelity_verdict']:<8} {p['reject_reason'] or ''}")
        if p["accepted"]:
            out.append(p)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        for p in out:
            fh.write(json.dumps(p) + "\n")
    print(f"\n{len(out)} certified pairs from {attempts} attempts -> {args.out}")
    print("Each pair costs 2 check invocations. Run base and variant, record the "
          "verdict for each, and the datum is whether it moved.")
    return 0 if out else 1


if __name__ == "__main__":
    sys.exit(main())
