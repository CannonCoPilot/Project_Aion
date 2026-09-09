#!/usr/bin/env python3
"""
The gate's own gate.

Phase 1's exit criterion says the fidelity gate must never have passed a
meaning-changing rewrite. That is a claim about a test set, so here is the test
set: pairs built from real Archon prose where the correct answer is known.

BENIGN pairs are style edits of exactly the kind prose-forge exists to make.
They must PASS, or the gate is useless: a gate that blocks every rewrite blocks
the tool it guards.

BREAKING pairs each remove or alter one load-bearing thing: a figure, a
negation, a hedge, a quantifier, a caveat. They must BLOCK. A single breaking
pair that passes fails the whole suite, because the gate's value is entirely in
its worst case.
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import prose_fidelity as F

BENIGN: list[tuple[str, str, str]] = [
    ("colon hinge removed",
     "The rule fires 871 times in the Archon arm: the ratio rests on real counts.",
     "The rule fires 871 times in the Archon arm. The ratio rests on real counts."),
    ("sentence split, order kept",
     "AUC is 0.917 against pooled humans, and the two human arms score 0.584 "
     "against each other, which is chance.",
     "AUC is 0.917 against pooled humans. The two human arms score 0.584 against "
     "each other. That is chance."),
    ("label construction unwound",
     "Limit: the qwen3:8b digest arm reads human at AUC 0.586.",
     "The qwen3:8b digest arm reads human at AUC 0.586, which is the limit."),
    ("passive to active, figures kept",
     "23 of 193 documents were flagged by the rule at the 25.4 threshold.",
     "The rule flagged 23 of 193 documents at the 25.4 threshold."),
    ("hedge rephrased, force preserved",
     "The genre confound may account for some of the gap.",
     "The genre confound might explain part of the gap."),
]

BREAKING: list[tuple[str, str, str]] = [
    ("figure dropped",
     "AUC is 0.917 against pooled humans across 59 and 236 documents.",
     "AUC is high against pooled humans across the two document sets."),
    ("figure altered",
     "The threshold is 25.4 per 1k words.",
     "The threshold is 24.5 per 1k words."),
    ("negation dropped",
     "This is not an AI detector, because the qwen3 arm reads human.",
     "This is an AI detector, because the qwen3 arm reads human."),
    ("hedge stripped to assertion",
     "The genre confound may account for some of the gap.",
     "The genre confound accounts for the gap."),
    ("quantifier widened",
     "Some Archon documents cross the threshold.",
     "All Archon documents cross the threshold."),
    ("caveat clause deleted",
     "The rule separates the arms, though the qwen3 digest arm reads human at "
     "AUC 0.586 and bounds every claim made from it.",
     "The rule separates the arms."),
    ("identifier changed",
     "Shipped in commit 7b7fe96 as sentence_colon.",
     "Shipped in commit 7bf796e as sentence_colon."),
    ("claim invented",
     "The rule flags 73 percent of Archon documents.",
     "The rule flags 73 percent of Archon documents and 0 percent of human ones."),
]


def run(require_model: bool) -> int:
    mode = "layer 1 + 2" if require_model else "layer 1 only"
    print(f"\n=== fidelity gate, {mode} ===")
    fails = 0
    for name, a, b in BENIGN:
        r = F.check(a, b, require_model=require_model)
        # Layer 1 alone cannot distinguish a hedge SYNONYM ("may" -> "might")
        # from a hedge REMOVAL, so `review` is the correct layer-1 answer on a
        # benign hedge rewrite. Layer 2 must resolve it to a pass; if the full
        # gate still only reviews, the model layer is not earning its keep.
        ok = r["verdict"] in (("pass",) if require_model
                              else ("pass_layer1_only", "review"))
        fails += not ok
        print(f"  [{'ok ' if ok else 'FAIL'}] benign   {name:28s} -> {r['verdict']}"
              + ("" if ok else f"  {[f['name'] for f in r['flags']]}"))
    for name, a, b in BREAKING:
        r = F.check(a, b, require_model=require_model)
        # A breaking pair must never read as clean. `review` is an acceptable
        # layer-1 outcome, because it withholds approval and names the moved
        # word; a bare pass is a failure of the suite whatever the layer.
        ok = r["verdict"] == "block"
        held = r["verdict"] == "review"
        fails += not (ok or (held and not require_model))
        tag = "ok " if ok else ("held" if held else "FAIL")
        print(f"  [{tag}] breaking {name:28s} -> {r['verdict']}")
    print(f"  {'PASS' if not fails else str(fails) + ' FAILURES'}")
    return fails


if __name__ == "__main__":
    rc = run(require_model=False)
    if "--layer1-only" not in sys.argv:
        rc += run(require_model=True)
    sys.exit(1 if rc else 0)
