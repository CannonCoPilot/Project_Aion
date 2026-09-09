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
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

import prose_fidelity as F          # noqa: E402
import prose_tells as T             # noqa: E402

CORPUS_GLOB = os.path.expanduser("~/.snorkel-dashboard/corpus/*.jsonl")
CLEAN_ARM = "human_bundle_authored"

#: PRE-REGISTERED base selection (docs/PRODUCTION-CHECKER-ABLATION.md, c0bd0c1).
#: Prompt-shaped genres only: the reviewer-facing genres would fail the published
#: Prompt Quality criteria on their face and produce a floor the paired design
#: cannot survive.
PROMPT_GENRES = ("instruction", "bundle_prose")
#: The eight task_refs named BEFORE any verdict existed, so the selection cannot
#: be revised after the fact. Fixed list, not a heuristic.
REGISTERED_TASKS = ("task_af7", "task_00c", "task_83b", "task_e9b",
                    "task_b06", "task_7a8", "task_343", "task_751")
MODEL = "qwen3:32b"


# ---------------------------------------------------------------------------
# Measured dimensions. Every pair is scored on ALL of them, whichever is being
# manipulated, so an off-target drift is visible rather than assumed absent.
# ---------------------------------------------------------------------------

def _strip(t: str) -> str:
    return T.strip_markup(t, drop_headings=True)


def _sentences(t: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", _strip(t)) if s.strip()]


# Filename matching, and three defects that were all in the first version.
#
# (1) COMPOUND EXTENSIONS. `cells.csv.gz` matched as `cells.csv`, truncating the
#     real name. That is not cosmetic: the filename-set equality check compares
#     these strings, so a rewrite silently changing `cells.csv.gz` to
#     `cells.csv` would normalise to the same token on both sides and the check
#     -- the one thing separating grouping from omission for unqualified names
#     -- would pass a real difference.
# (2) TEMPLATED SEGMENTS. The text writes `calls/<screen_id>_calls.tsv`. The
#     angle brackets fell outside the character class, so the match began
#     mid-token at `_calls.tsv`: a fragment, not a file, inflating the
#     denominator of the ratio with a token no rewrite can preserve.
# (3) A template names a FAMILY, not a file, and is counted once.
_FILE = re.compile(
    r"(?<![\w])(?:[\w.<>-]+/)*[\w.<>-]*[\w>]"
    r"\.(?:csv|tsv|json|jsonl|py|R|md|txt|ya?ml|parquet|h5ad|fastq|bam|sam|vcf|"
    r"zip|xlsx|sh|ipynb|pkl|npz|tar|tgz)"
    r"(?:\.(?:gz|bz2|xz|zst))?\b")


_BULLET_LINE = re.compile(r"^[ \t]*(?:[-*+]|\d+[.)])\s+")


def _units(text: str) -> list[str]:
    """Sentence- and bullet-level units, with hard wrapping undone first.

    THE CORPUS IS HARD-WRAPPED AT ABOUT 72 COLUMNS. Splitting on every newline
    -- which this did until it was caught -- makes a "unit" an 80-character
    LINE rather than a sentence, and that breaks the metric in both directions.
    A file mentioned anywhere on a wrapped line scores as glossed because the
    line almost always carries 8 more words. Worse, a successful GROUPING
    sentence ("`a.csv` and `b.csv` are per-object tables ...") that happens to
    wrap between the two names splits into two single-file units and scores as
    TWO glosses, so the manipulation the experiment depends on could not have
    registered at all.

    So: paragraphs are unwrapped, bullets stay their own units, and sentences
    are split on punctuation.
    """
    units: list[str] = []
    for block in re.split(r"\n\s*\n", text):
        lines = [l for l in block.split("\n") if l.strip()]
        if not lines:
            continue
        if any(_BULLET_LINE.match(l) for l in lines):
            # A bullet list: each bullet is a unit, continuation lines fold in.
            cur = ""
            for l in lines:
                if _BULLET_LINE.match(l):
                    if cur:
                        units.append(cur)
                    cur = l.strip()
                else:
                    cur = f"{cur} {l.strip()}".strip()
            if cur:
                units.append(cur)
        else:
            para = " ".join(l.strip() for l in lines)
            units.extend(u for u in re.split(r"(?<=[.!?])\s+", para) if u.strip())
    return units


def gloss_units(text: str) -> list[tuple[str, str]]:
    """The (filename, unit) pairs `file_gloss_ratio` counts as glosses.

    Exposed so any analysis of WHICH units are glosses runs the same code the
    ratio runs. Re-splitting the text in a caller is a reimplementation, and a
    reimplemented metric is exactly what put two different numbers into a
    pre-registration earlier today.
    """
    out = []
    for u in _units(text):
        named = {m.group(0) for m in _FILE.finditer(u)}
        if len(named) != 1:
            continue                  # several filenames in one unit is grouping
        f = next(iter(named))
        if len(u.replace(f, " ").split()) >= 8:
            out.append((f, u))
    return out


def file_gloss_ratio(text: str) -> tuple[float, int]:
    """Share of named files that get their own descriptive gloss.

    This is W13's structural tell, measured INDEPENDENTLY of his detector. It
    has to be independent: if I tuned the manipulation against `structural_tell`
    the ablation would be fitting the variant to the thing it is meant to test.

    A file counts as glossed when the unit mentioning it — a bullet or a
    sentence — carries at least 8 further words. The tell is the ONE-TO-ONE
    exhaustiveness, so the statistic is the RATIO, not the count: three glossed
    files out of twenty is ordinary writing, and twenty out of twenty is the
    construction that failed production review.
    """
    files = {m.group(0) for m in _FILE.finditer(text)}
    if not files:
        return 0.0, 0
    glossed = {f for f, _ in gloss_units(text)}
    return len(glossed) / len(files), len(files)


def dims(text: str) -> dict[str, float]:
    s = _strip(text)
    w = max(len(s.split()), 1)
    sents = _sentences(text)
    lens = [len(x.split()) for x in sents] or [1]
    cv = (st.stdev(lens) / st.mean(lens)) if len(lens) > 1 and st.mean(lens) else 0.0
    gloss, nfiles = file_gloss_ratio(text)
    return {
        "file_gloss_ratio": gloss,
        "files_named": float(nfiles),
        "sentence_colon_per_1k": len(re.findall(r"[a-z,\)]\s?:\s", s)) / w * 1000,
        "hedge_per_1k": len(F._HEDGE.findall(s)) / w * 1000,
        "sentence_len_cv": cv,
        "em_dash_per_1k": len(re.findall(r"—|--", s)) / w * 1000,
        "bullet_per_1k": len(re.findall(r"(?m)^\s*[-*+]\s", text)) / w * 1000,
    }


#: Required SIGN of the target move. A manipulation that went the wrong way is
#: not a smaller version of the right one, it is a different experiment.
TARGET_DIRECTION = {"sentence_colon_per_1k": +1, "hedge_per_1k": +1,
                    "sentence_len_cv": -1, "file_gloss_ratio": -1}

#: ABSOLUTE CEILING on the manipulated dimension in the VARIANT, where the
#: manipulation is a removal.
#:
#: A fixed delta was wrong and the base table shows why. At a 0.50 drop, af7
#: starts at 1.00 and satisfies the check while still glossing HALF its files,
#: so the tell is arguably still there; 751 starts at 0.54 and would have to be
#: scrubbed to 0.04. The variants would not have been comparable to each other,
#: and "the tell was removed" is the property the experiment needs, not "the
#: number moved by a fixed amount". So the variant must land BELOW the ceiling
#: AND move by a minimum, which makes every variant equivalent in the property
#: under test. Registered before any pair was generated or any invocation spent.
VARIANT_CEILING = {"file_gloss_ratio": 0.25}

#: How far the target must move for the pair to be a real manipulation, and how
#: far anything else may drift before the pair stops isolating one variable.
MIN_TARGET_DELTA = {"sentence_colon_per_1k": 15.0, "hedge_per_1k": 8.0,
                    "sentence_len_cv": 0.20, "file_gloss_ratio": 0.25}
MAX_OFFTARGET_DELTA = {"sentence_colon_per_1k": 6.0, "hedge_per_1k": 5.0,
                       "sentence_len_cv": 0.25, "em_dash_per_1k": 3.0,
                       "bullet_per_1k": 3.0, "file_gloss_ratio": 0.20}
#: `files_named` is descriptive, never a gate: the variant must not invent or
#: lose files, and that is enforced by the fidelity gate's path comparison.
NOT_A_DIMENSION = frozenset({"files_named"})

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
    # DIRECTION MATTERS AND IT IS DOWN. The human base texts already gloss their
    # files one-to-one at a median ratio near 0.75, because that is the house
    # format of a Harbor task prompt. Only 2 of 10 tasks have headroom to ADD
    # glossing; 8 have headroom to REMOVE it. So the base carries the tell and
    # the variant is the one with it taken out.
    #
    # GROUPING, NOT OMISSION, AND THE DISTINCTION DECIDES THE EXPERIMENT.
    # The obvious way to lower the ratio is to stop saying what each file is.
    # That is wrong twice over. First, the gloss IS content: "X.csv holds the
    # per-sample counts" is a proposition, and dropping it is a meaning change
    # that `prose_fidelity` blocks by design. Second and worse, an omitted
    # variant is VAGUER than its base, so a flipped verdict could be the checker
    # punishing vagueness rather than responding to the structural tell, and we
    # would read that as confirmation of the thing we were testing.
    #
    # Grouping removes the ONE-TO-ONE MAPPING while keeping every proposition:
    # "the three count matrices, A, B and C, hold per-sample counts at
    # increasing depth" says what three separate sentences said. It also lowers
    # the ratio by construction, because the metric only counts a unit naming
    # EXACTLY ONE file. The contrast becomes per-file-mapping against
    # same-content-grouped, which isolates the structure from the information.
    "file_gloss_ratio": (
        "Rewrite the passage so that NO sentence describes exactly one named "
        "file. PRESERVE EVERY FACT about every file: say everything the passage "
        "says about what each file contains and what it is for, losing nothing. "
        "Achieve this by GROUPING: gather files that share a role or a format "
        "and describe them together in one sentence naming several of them, and "
        "fold file details into sentences that are about the work rather than "
        "about the file. Do NOT omit a file, do NOT omit what a file contains, "
        "and do NOT become vaguer. Keep every file name, number, date, path, "
        "hedge and qualifier exactly as written, and do not add or remove any "
        "claim. Keep it as FLOWING PROSE with no bullets and no list."),
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


#: An UNKNOWN from the fidelity gate says ollama was unreachable. It says
#: NOTHING about the pair. Treating it as a rejection would make the sample
#: non-deterministic -- re-run and get a different eight -- which is exactly the
#: property pre-registration forecloses, and it would let a busy machine drive
#: us under the constructibility floor and be written up as "the manipulation is
#: infeasible on this material". So UNKNOWN is retried, and if it will not
#: resolve the pair is UNRESOLVED_GATE: reported in full, named separately from
#: NOT CONSTRUCTIBLE, and counted against neither the floor nor the sign test.
GATE_RETRIES = 3
GATE_BACKOFF_S = 20


def _certify(base: str, var: str, model: str) -> dict:
    last = None
    for attempt in range(GATE_RETRIES):
        last = F.check(base, var, model=model)
        if last["verdict"] != "unknown":
            return last
        if attempt < GATE_RETRIES - 1:
            time.sleep(GATE_BACKOFF_S)
    return last


def build_pair(rec: dict, dimension: str, model: str) -> dict:
    """One base text plus one contrasting variant, or a rejection with a reason."""
    base = rec["text"]
    var = rewrite(base, dimension, model)
    d0, d1 = dims(base), dims(var)
    delta = {k: round(d1[k] - d0[k], 3) for k in d0}

    # W13's check, and it is not redundant with the fidelity gate: layer 1
    # compares PATHS, and its path pattern requires a slash, so a bare
    # `results.csv` is invisible to it. Grouping is only grouping if every file
    # survives; without set equality, omission re-enters wearing the grouping
    # label and one instrument carries the whole load. Set equality is
    # deterministic and costs nothing.
    files_base = {m.group(0) for m in _FILE.finditer(base)}
    files_var = {m.group(0) for m in _FILE.finditer(var)}

    reject = None
    want = TARGET_DIRECTION[dimension]
    ceiling = VARIANT_CEILING.get(dimension)
    if delta[dimension] * want < MIN_TARGET_DELTA[dimension]:
        arrow = "down" if want < 0 else "up"
        reject = (f"target moved {delta[dimension]:+.2f}, short of a "
                  f"{MIN_TARGET_DELTA[dimension]} move {arrow}")
    elif dimension == "file_gloss_ratio" and files_base != files_var:
        lost = sorted(files_base - files_var)
        gained = sorted(files_var - files_base)
        reject = ("filename set changed, so this is omission wearing the grouping "
                  f"label: dropped {lost[:6]}" + (f", added {gained[:6]}" if gained else ""))
    elif ceiling is not None and d1[dimension] > ceiling:
        reject = (f"variant still at {d1[dimension]:.2f} on {dimension}, above the "
                  f"{ceiling} ceiling, so the tell was reduced but not removed")
    else:
        for k, lim in MAX_OFFTARGET_DELTA.items():
            if k != dimension and k not in NOT_A_DIMENSION and abs(delta[k]) > lim:
                reject = (f"off-target drift on {k}: {delta[k]:+.2f} exceeds {lim}, "
                          f"so a flip could not be attributed to {dimension}")
                break

    fid = _certify(base, var, model) if reject is None else None
    unresolved = False
    if fid is not None and fid["verdict"] == "unknown":
        unresolved = True
        reject = ("fidelity gate UNRESOLVED after retries: this is a statement "
                  "about model reachability, not about the pair")
    elif fid is not None and fid["verdict"] != "pass":
        reject = (f"fidelity gate returned {fid['verdict']}: "
                  + "; ".join(f["name"] for f in fid["flags"])[:200])

    return {
        "task_ref": rec.get("task_ref"), "genre": rec["genre"],
        "arm": rec.get("arm"), "dimension": dimension,
        "words_base": len(base.split()), "words_variant": len(var.split()),
        "files_base": sorted(files_base), "files_variant": sorted(files_var),
        "filename_set_equal": files_base == files_var,
        "dims_base": {k: round(v, 3) for k, v in d0.items()},
        "dims_variant": {k: round(v, 3) for k, v in d1.items()},
        "delta": delta,
        "fidelity_verdict": (fid or {}).get("verdict", "not_run"),
        "accepted": reject is None,
        "status": ("accepted" if reject is None
                   else "UNRESOLVED_GATE" if unresolved else "NOT_CONSTRUCTIBLE"),
        "reject_reason": reject,
        "base_text": base, "variant_text": var,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dimension", default="file_gloss_ratio",
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
    pool = [r for r in recs
            if r.get("arm") == CLEAN_ARM
            and r["genre"] in PROMPT_GENRES
            and any(r.get("task_ref", "").startswith(t) for t in REGISTERED_TASKS)
            and args.min_words <= r["words"] <= args.max_words]
    # One per task_ref: two pairs from one task would not be independent.
    # One record per task_ref, choosing the HIGHEST-gloss record for that task:
    # the reversed manipulation removes glossing, so the most headroom is the
    # most manipulable. Chosen by my gloss metric, never by structural_tell, so
    # constructibility cannot become a back-door drop.
    best: dict[str, dict] = {}
    for r in pool:
        t = r.get("task_ref", "")
        g = dims(r["text"])["file_gloss_ratio"]
        if t not in best or g > dims(best[t]["text"])["file_gloss_ratio"]:
            best[t] = r
    uniq = sorted(best.values(), key=lambda x: -dims(x["text"])["file_gloss_ratio"])
    print(f"corpus {Path(files[-1]).name}: {len(pool)} in-band {CLEAN_ARM} records, "
          f"{len(uniq)} distinct task_refs")

    out, attempts, notbuilt, unresolved, report = [], 0, [], [], []
    for r in uniq:
        attempts += 1
        p = build_pair(r, args.dimension, args.model)
        mark = "ACCEPT" if p["accepted"] else "reject"
        print(f"  [{mark}] {p['genre']:20s} {p['words_base']:>5}w  "
              f"target {p['delta'][args.dimension]:+7.2f}  "
              f"fidelity {p['fidelity_verdict']:<8} {p['reject_reason'] or ''}")
        row = {"task_ref": p["task_ref"], "genre": p["genre"],
               "status": p["status"], "reason": p["reject_reason"],
               "fidelity_verdict": p["fidelity_verdict"],
               "filename_set_equal": p["filename_set_equal"],
               "gloss_base": p["dims_base"]["file_gloss_ratio"],
               "gloss_variant": p["dims_variant"]["file_gloss_ratio"]}
        if p["accepted"]:
            out.append(p)
        elif p["status"] == "UNRESOLVED_GATE":
            unresolved.append(row)
        else:
            notbuilt.append(row)
        report.append(row)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        for p in out:
            fh.write(json.dumps(p) + "\n")
    rep = Path(args.out).with_name("ablation_construction_report.json")
    rep.write_text(json.dumps({
        "constructibility_floor": 6,
        "accepted": len(out), "not_constructible": len(notbuilt),
        "unresolved_gate": len(unresolved),
        "note": ("UNRESOLVED_GATE counts against neither the floor nor the sign "
                 "test; it is a statement about model reachability."),
        "per_task": [{k: v for k, v in r.items()} for r in report],
    }, indent=2) + "\n", encoding="utf-8")
    print(f"\nconstruction report (no text, no ids, does not unblind) -> {rep}")
    if unresolved:
        print(f"UNRESOLVED_GATE ({len(unresolved)}) — reachability, NOT a finding "
              f"about the material, counts against neither floor nor test:")
        for x in unresolved:
            print(f"  {x['task_ref'][:8]}")
    if len(out) < 6:
        print(f"\n*** CONSTRUCTIBILITY FLOOR NOT MET: {len(out)} < 6. "
              f"Do NOT run stage two. Report the shortfall and re-cost. ***")
    if notbuilt:
        nb = Path(args.out).with_name("ablation_not_constructible.json")
        nb.write_text(json.dumps(notbuilt, indent=2) + "\n", encoding="utf-8")
        print(f"\nNOT CONSTRUCTIBLE ({len(notbuilt)}), recorded before any "
              f"invocation exists so it cannot interact with the no-drop rule:")
        for x in notbuilt:
            print(f"  {x['task_ref'][:8]}  {x['reason']}")
        print(f"  -> {nb}")
    print(f"\n{len(out)} certified pairs from {attempts} attempts -> {args.out}")
    print("Each pair costs 2 check invocations. Run base and variant, record the "
          "verdict for each, and the datum is whether it moved.")
    return 0 if out else 1


if __name__ == "__main__":
    sys.exit(main())
