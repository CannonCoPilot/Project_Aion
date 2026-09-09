#!/usr/bin/env python3
"""
prose_fidelity — a bidirectional gate on whether a rewrite changed the meaning.

WHY BIDIRECTIONAL
-----------------
amazon-science/RefChecker verifies that every claim in a candidate is supported
by a reference. That catches text the rewriter INVENTED. Our failure mode is the
opposite one: a de-AI-ing pass strips a hedge, a qualifier, a count or a caveat,
and the result reads better while asserting something the original did not.
A one-way check passes that silently, because a subset of the truth is entailed
by the truth.

So the gate runs twice.

    FORWARD   every claim in REVISED must be supported by ORIGINAL  -> additions
    REVERSE   every claim in ORIGINAL must be supported by REVISED  -> deletions

A rewrite passes only if both directions are clean.

TWO LAYERS, AND ONLY ONE OF THEM NEEDS A MODEL
----------------------------------------------
LAYER 1 is deterministic, stdlib, and microseconds. It compares the things a
rewrite has no business changing at all: numbers, percentages, dates, file
paths, identifiers, hashes, negations and quantifiers. A dropped digit is a
meaning change that no entailment model should have to be asked about, and this
layer is exact where a model is merely probable. It is importable with zero
dependencies, so the Snorkel Task Console can run it in-process.

LAYER 2 extracts claim triplets from both texts with a local model and checks
entailment in both directions. It needs Ollama on localhost. It is the layer
that catches a meaning change carried by ordinary words rather than by symbols.

WHAT THE SUITE PROVES, AND WHAT IT DOES NOT
-------------------------------------------
`corpus/test_fidelity.py` is 13 pairs, 5 benign and 8 breaking, and it is green
in both modes. On first full run it was NOT: bidirectional entailment passed
"may account for some of the gap" -> "accounts for the gap", because entailment
is weak on hedging and the design let layer 2 clear layer 1's hedge advisory.
The targeted strength probe fixed it.

The honest limit: I wrote both the gate and its test set, so a green suite shows
the gate handles the failure modes I thought of. It is not evidence about the
ones I did not. Real revisions and the ablation pairs are the actual test.

NO SILENT DEGRADATION
---------------------
If layer 2 is requested and unavailable, the gate returns `unknown` and NEVER
`pass`. An unreachable model is an unanswered question, not a clean bill. The
caller decides whether an unanswered question may ship; the gate will not decide
it by omission. `require_model=False` is available for the layer-1-only case and
says so in the verdict, so a caller cannot mistake one for the other.
"""

from __future__ import annotations

import concurrent.futures as _cf
import json
import re
import urllib.error
import urllib.request
from typing import Iterable

__all__ = ["check", "hard_facts", "layer1", "FidelityUnavailable"]

OLLAMA = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "qwen3:32b"


class FidelityUnavailable(RuntimeError):
    """Layer 2 could not run. Never convertible to a pass."""


# ---------------------------------------------------------------------------
# Layer 1 — the things a rewrite may not touch
#
# Each extractor returns a NORMALISED token so that a formatting change is not
# reported as a meaning change. "1,072" and "1072" are the same number; "0.90"
# and "0.9" are the same value; "/Users/x/y.md" is the same path either side of
# a reflow. What survives normalisation is the claim itself.
# ---------------------------------------------------------------------------

_NUM = re.compile(r"(?<![\w/.-])(\d[\d,]*(?:\.\d+)?)\s*(%|percent|x|ms|s\b|GB|MB|KB|k\b|K\b)?")
_PATH = re.compile(r"(?<![\w])(?:/|\./|~/)?(?:[\w.-]+/){1,}[\w.-]+")
_HASH = re.compile(r"\b[0-9a-f]{7,40}\b")
_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_NEG = re.compile(r"\b(?:not|never|no|none|cannot|can't|won't|doesn't|does not|"
                  r"isn't|is not|aren't|are not|without|fails? to|neither|nor|"
                  r"unable|refus\w+|declin\w+)\b", re.I)
_QUANT = re.compile(r"\b(?:all|every|each|any|some|most|many|few|several|both|"
                    r"only|at least|at most|up to|no more than|exactly|"
                    r"always|usually|often|sometimes|rarely|typically)\b", re.I)
_HEDGE = re.compile(r"\b(?:may|might|could|possibly|probably|likely|unlikely|"
                    r"appears?|seems?|suggests?|approximately|roughly|about|"
                    r"nearly|around|estimated)\b", re.I)


def _norm_num(m: re.Match) -> str:
    val = m.group(1).replace(",", "")
    if "." in val:
        val = val.rstrip("0").rstrip(".") or "0"
    unit = (m.group(2) or "").lower()
    unit = {"percent": "%", "k": "k", "s": "s"}.get(unit, unit)
    return f"{val}{unit}"


def hard_facts(text: str) -> dict[str, list[str]]:
    """The symbol-level content of a passage, normalised for comparison."""
    return {
        "numbers": sorted(_norm_num(m) for m in _NUM.finditer(text)),
        "paths": sorted({m.group(0).rstrip(".,;:") for m in _PATH.finditer(text)}),
        "hashes": sorted({m.group(0) for m in _HASH.finditer(text)}),
        "dates": sorted({m.group(0) for m in _DATE.finditer(text)}),
        "negations": sorted(m.group(0).lower() for m in _NEG.finditer(text)),
        "quantifiers": sorted(m.group(0).lower() for m in _QUANT.finditer(text)),
        "hedges": sorted(m.group(0).lower() for m in _HEDGE.finditer(text)),
    }


def _multiset_diff(a: Iterable[str], b: Iterable[str]) -> tuple[list[str], list[str]]:
    """(dropped from a, added in b), preserving duplicate counts."""
    from collections import Counter
    ca, cb = Counter(a), Counter(b)
    return sorted((ca - cb).elements()), sorted((cb - ca).elements())


#: Categories where any change blocks. A number or an identifier that appears on
#: one side and not the other is a meaning change, full stop.
BLOCKING = ("numbers", "paths", "hashes", "dates")
#: Categories where a change is reported at high severity but may be legitimate:
#: "does not include" to "excludes" is a real rewrite that moves a negation.
ADVISORY = ("negations", "quantifiers", "hedges")


def layer1(original: str, revised: str) -> dict:
    """Deterministic bidirectional comparison. Stdlib only, no model."""
    fo, fr = hard_facts(original), hard_facts(revised)
    flags: list[dict] = []
    metrics: dict[str, float] = {}
    blocked = False

    for cat in BLOCKING + ADVISORY:
        dropped, added = _multiset_diff(fo[cat], fr[cat])
        metrics[f"{cat}_dropped"] = len(dropped)
        metrics[f"{cat}_added"] = len(added)
        if not (dropped or added):
            continue
        is_block = cat in BLOCKING
        blocked = blocked or is_block
        parts = []
        if dropped:
            parts.append(f"dropped {dropped[:8]}")
        if added:
            parts.append(f"added {added[:8]}")
        flags.append({
            "level": "high" if is_block else "medium",
            "name": f"fidelity.{cat}",
            "detail": ("the rewrite changed content that a style pass must preserve: "
                       if is_block else
                       "the rewrite moved a meaning-bearing word; confirm it is intended: ")
                      + "; ".join(parts),
            "evidence": (dropped + added)[:8],
        })
    return {"blocked": blocked, "advisory": any(f["level"] == "medium" for f in flags),
            "flags": flags, "metrics": metrics}


# ---------------------------------------------------------------------------
# Layer 2 — claim triplets, both directions
# ---------------------------------------------------------------------------

_EXTRACT = """Extract every factual claim in the passage as a JSON array of \
["subject", "predicate", "object"] triplets. Cover every assertion, including \
negations, quantities, conditions and caveats. Use the passage's own wording. \
Output ONLY the JSON array.

PASSAGE:
{text}"""

_STRENGTH = """Compare how strongly two passages assert the same content.

Answer with ONLY one word:
SAME     - B asserts with the same force as A (a synonym swap such as "may" for
           "might", or "some" for "part of", is SAME)
STRONGER - B asserts more confidently, or drops a hedge, qualifier or caveat
           that A had, or widens a quantifier
WEAKER   - B asserts less confidently than A

A: {a}

B: {b}"""

_ENTAIL = """You verify whether a REFERENCE passage supports a CLAIM.

Answer with ONLY one word:
SUPPORTED   - the reference states or directly implies the claim
CONTRADICTED - the reference states something incompatible with the claim
MISSING     - the reference neither states nor implies the claim

REFERENCE:
{ref}

CLAIM: {claim}"""


def _ollama(prompt: str, model: str, timeout: int) -> str:
    body = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        # `think` belongs at the payload ROOT for qwen3, not inside `options`.
        # Placed in `options` it is silently ignored and the model reasons anyway.
        "think": False,
        "options": {"temperature": 0.0},
    }).encode()
    req = urllib.request.Request(OLLAMA, data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read()).get("response", "")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise FidelityUnavailable(f"ollama at {OLLAMA} unreachable: {e}") from e


def _triplets(text: str, model: str, timeout: int) -> list[list[str]]:
    raw = _ollama(_EXTRACT.format(text=text[:6000]), model, timeout)
    m = re.search(r"\[.*\]", raw, re.S)
    if not m:
        raise FidelityUnavailable("claim extraction returned no JSON array")
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise FidelityUnavailable(f"claim extraction returned invalid JSON: {e}") from e
    return [t for t in data if isinstance(t, list) and len(t) == 3]


def _verdict(ref: str, claim: str, model: str, timeout: int) -> str:
    out = _ollama(_ENTAIL.format(ref=ref[:6000], claim=claim), model, timeout).upper()
    for v in ("CONTRADICTED", "SUPPORTED", "MISSING"):
        if v in out:
            return v
    return "MISSING"


def _strength(a: str, b: str, model: str, timeout: int) -> str:
    """Directed probe on assertive force.

    Generic entailment is weak here, and that weakness is not academic: it let
    "may account for some of the gap" -> "accounts for the gap" through as
    SUPPORTED in both directions, which is the exact failure this gate exists to
    prevent. Asking about FORCE rather than about support catches it.
    """
    out = _ollama(_STRENGTH.format(a=a[:4000], b=b[:4000]), model, timeout).upper()
    for v in ("STRONGER", "WEAKER", "SAME"):
        if v in out:
            return v
    return "STRONGER"        # unparseable answer is not permission to pass


#: Concurrent entailment calls. The loop is O(claims) and a 1,200-word document
#: yields dozens, so sequentially it runs for a quarter of an hour per pair.
#: Capping the claim list would be faster still and would be silent degradation:
#: an unchecked claim would count as clean. So every claim is checked, just not
#: one at a time. Stdlib only, so the Console constraint still holds.
ENTAIL_WORKERS = 6


def _direction(ref: str, claims: list[list[str]], model: str, timeout: int,
               label: str, level: str) -> tuple[list[dict], int]:
    """Check every claim against a reference. Returns (flags, n_unsupported)."""
    texts = [" ".join(str(x) for x in t) for t in claims]
    bad = []
    with _cf.ThreadPoolExecutor(max_workers=ENTAIL_WORKERS) as pool:
        for claim, v in zip(texts, pool.map(
                lambda c: _verdict(ref, c, model, timeout), texts)):
            if v != "SUPPORTED":
                bad.append((claim, v))
    if not bad:
        return [], 0
    return [{
        "level": level,
        "name": f"fidelity.{label}",
        "detail": (f"{len(bad)} of {len(claims)} claims are not supported in the "
                   f"other direction. " +
                   ("The rewrite asserts things the original did not."
                    if label == "added_claims" else
                    "The rewrite dropped or altered claims the original made.")),
        "evidence": [f"{c} [{v}]" for c, v in bad[:6]],
    }], len(bad)


def check(original: str, revised: str, *, model: str = DEFAULT_MODEL,
          require_model: bool = True, timeout: int = 120) -> dict:
    """The gate. Returns pass / block / unknown, never a silent pass.

    `require_model=False` runs layer 1 alone and says so in the verdict, so a
    caller cannot mistake a symbol-level check for a meaning-level one.
    """
    l1 = layer1(original, revised)
    flags = list(l1["flags"])
    metrics = dict(l1["metrics"])

    if not require_model:
        # An advisory flag is a moved negation, quantifier or hedge. Those carry
        # meaning, so the honest verdict is `review`, never `pass`. Returning a
        # pass here would let "this is not an AI detector" become "this is an AI
        # detector" and still read clean to a caller checking the verdict.
        verdict = ("block" if l1["blocked"]
                   else "review" if l1["advisory"] else "pass_layer1_only")
        return {"verdict": verdict, "score": 0 if verdict != "pass_layer1_only" else 100,
                "flags": flags, "metrics": metrics,
                "note": "layer 1 only; meaning-level changes carried by ordinary "
                        "words were NOT checked"}

    try:
        c_rev = _triplets(revised, model, timeout)
        c_org = _triplets(original, model, timeout)
        f_add, n_add = _direction(original, c_rev, model, timeout, "added_claims", "high")
        f_drop, n_drop = _direction(revised, c_org, model, timeout, "dropped_claims", "high")
    except FidelityUnavailable as e:
        # The question was asked and not answered. That is not a pass.
        return {"verdict": "unknown", "score": 0, "flags": flags, "metrics": metrics,
                "note": f"layer 2 unavailable, so meaning was NOT verified: {e}"}

    flags.extend(f_add + f_drop)
    metrics.update({"claims_revised": len(c_rev), "claims_original": len(c_org),
                    "claims_added_unsupported": n_add,
                    "claims_dropped_unsupported": n_drop})
    # Layer 2 ADJUDICATES layer 1's advisories. A moved hedge or quantifier is
    # only a meaning change if the claims stop entailing each other, and that is
    # the question layer 2 answers. Leaving the advisory standing after a clean
    # bidirectional check would mean the model layer never resolves anything,
    # and every hedge rewrite would sit in `review` forever.
    #
    # A layer-1 BLOCK is not adjudicable: a changed figure is a changed figure
    # whatever an entailment model says about it.
    blocked = bool(l1["blocked"] or n_add or n_drop)

    # An advisory is adjudicated by the STRENGTH probe, not by entailment.
    if l1["advisory"] and not blocked:
        try:
            force = _strength(original, revised, model, timeout)
        except FidelityUnavailable as e:
            return {"verdict": "unknown", "score": 0, "flags": flags,
                    "metrics": metrics,
                    "note": f"strength probe unavailable, advisory unresolved: {e}"}
        metrics["assertive_force"] = force
        if force == "SAME":
            flags.append({
                "level": "low", "name": "fidelity.advisory_cleared",
                "detail": ("layer 1 saw a moved negation, quantifier or hedge; the "
                           "strength probe found the same assertive force"),
                "evidence": [f["name"] for f in l1["flags"]]})
        else:
            blocked = True
            flags.append({
                "level": "high", "name": "fidelity.assertive_force",
                "detail": (f"the rewrite is {force} than the original. A style pass "
                           f"may not change how confidently a claim is made."),
                "evidence": [f["name"] for f in l1["flags"]]})

    verdict = "block" if blocked else "pass"
    return {"verdict": verdict, "score": 0 if verdict != "pass" else 100,
            "flags": flags, "metrics": metrics}


if __name__ == "__main__":
    import sys
    a = open(sys.argv[1], encoding="utf-8").read()
    b = open(sys.argv[2], encoding="utf-8").read()
    print(json.dumps(check(a, b, require_model="--no-model" not in sys.argv), indent=2))
