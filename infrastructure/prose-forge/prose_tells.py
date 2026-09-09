#!/usr/bin/env python3
"""
prose_tells — stdlib-only ports of validated vale-ai-tells rules.

WHY THIS FILE EXISTS
--------------------
Phase 0 used Vale (a Go binary) as the research instrument to decide which
rules actually separate Archon prose from Sir's. Vale cannot ship into the
Snorkel Task Console: that process is stdlib-only, offline, and has a
sub-2-second interactive budget. So the validated rules are precompiled to
Python `re` patterns and carried here as data, with a pure-Python matcher.

Vale stays on the research side as the instrument that decides which rules
earn a port. A rule that cannot survive the translation stays a finding.

WHAT IS PORTED, AND ON WHAT EVIDENCE
------------------------------------
Only rules that cleared the Phase 0 same-genre gate (Addendum C: human-document
vs archon-document, length-matched, per-1,000-words). The cross-genre section 3
numbers are superseded and are NOT the basis for anything here.

  ColonUsage             archon 871 / human 234 hits, 4.76x  (rate-bearing)
  CataphoricForecasting  archon 49 / human 12 hits,  5.07x  (low-count)

Each detector reports its own measured rate. `PRECISION` below carries the
adjudicated figure, and it is deliberately conservative: a rule whose
precision has not been measured on a hand-checked sample flags at "low" and
says so, rather than borrowing authority from the ratio.

INTERFACE
---------
Matches the Snorkel Task Console contract (stylecheck.py):

    DETECTORS = {"name": fn}
    fn(text: str) -> {"verdict": str,
                      "score": int,                       # 0-100
                      "flags": [{"level", "name", "detail", "evidence"}],
                      "metrics": {...}}                   # flat scalars

Stdlib only. No network. No subprocess. No Vale at request time.
"""

from __future__ import annotations

import re
from typing import Callable

__all__ = ["DETECTORS", "analyse", "colon_usage", "cataphoric_forecasting",
           "strip_markup", "PRECISION", "RATES", "sentence_colon",
           "SEPARATION", "SENTENCE_COLON_THRESHOLD"]


# ---------------------------------------------------------------------------
# Markup normalisation
#
# Vale strips markup before matching, so a port that matches raw Markdown
# fires on different text than the rule was measured on. These substitutions
# reproduce the parts of that stripping the ported rules are sensitive to:
# fenced and inline code (a colon inside `dict[str, int]:` is not prose), link
# syntax, emphasis markers, and list bullets.
#
# Consequence worth stating plainly: stripping `**` means a run-in bold label
# ("**Note:** Like this.") is indistinguishable from a bare "Note: Like this."
# That is Vale's known ColonUsage limitation, it is reproduced here on purpose
# so the port matches what was measured, and `colon_usage` counts the
# bold-label subset separately so a caller can subtract it. See BOLD_LABEL.
# ---------------------------------------------------------------------------

# `[^\n]*` in the closer, not `.*`: under re.S a greedy `.*$` runs to the END
# of the document, so a single code block blanked every paragraph after it.
_FENCE = re.compile(r"^(?:```|~~~)[^\n]*\n.*?(?:^(?:```|~~~)[^\n]*$|\Z)", re.S | re.M)
_INLINE_CODE = re.compile(r"`[^`\n]*`")
_LINK = re.compile(r"\[([^\]\n]*)\]\([^)\n]*\)")
_AUTOLINK = re.compile(r"<https?://[^>\n]*>|https?://\S+")
_EMPH = re.compile(r"\*{1,3}|__|~~")
_BULLET = re.compile(r"^[ \t]*(?:[-*+]|\d+[.)])[ \t]+", re.M)
_HEADING = re.compile(r"^[ \t]{0,3}#{1,6}[ \t].*$", re.M)
_SETEXT = re.compile(r"^[ \t]{0,3}(?:=+|-{2,})[ \t]*$", re.M)
_TABLE_PIPE = re.compile(r"^[ \t]*\|[^\n]*$", re.M)


def _blank_keep_newlines(m: "re.Match") -> str:
    """Erase a block's content but keep its line structure, so a rule cannot
    match across the hole it leaves."""
    return re.sub(r"[^\n]", " ", m.group(0))


def _strip_mapped(text: str, drop_headings: bool = False) -> tuple[str, list[int]]:
    """Reduce Markdown to the prose Vale scans, returning the stripped text and
    a per-character map back into `text`.

    Markers are DELETED rather than blanked. Blanking them looks harmless but
    is not: `**Changes**: Updated` becomes `Changes  :  Updated`, and every
    rule with a literal single space in it - ColonUsage's colon-space-capital included -
    silently stops matching. Deleting reproduces what Vale actually sees, and
    the offset map keeps evidence windows pointing at real source positions.
    """
    # Pass 1: blank whole blocks in place (length-preserving, so offsets hold).
    t = _FENCE.sub(_blank_keep_newlines, text)
    t = _INLINE_CODE.sub(_blank_keep_newlines, t)
    t = _AUTOLINK.sub(_blank_keep_newlines, t)
    t = _TABLE_PIPE.sub(_blank_keep_newlines, t)
    if drop_headings:
        t = _HEADING.sub(_blank_keep_newlines, t)
        t = _SETEXT.sub(_blank_keep_newlines, t)

    # Pass 2: delete inline markers, recording the surviving offsets.
    cuts: list[tuple[int, int, str]] = []
    for m in _LINK.finditer(t):
        cuts.append((m.start(), m.end(), m.group(1)))
    for rx in (_EMPH, _BULLET):
        for m in rx.finditer(t):
            cuts.append((m.start(), m.end(), ""))
    cuts.sort()

    out: list[str] = []
    idx: list[int] = []
    pos = 0
    for a, b, repl in cuts:
        if a < pos:
            continue                     # overlapping cut, first one wins
        out.append(t[pos:a])
        idx.extend(range(pos, a))
        if repl:                         # link text keeps its own offsets
            out.append(repl)
            idx.extend(range(a + 1, a + 1 + len(repl)))
        pos = b
    out.append(t[pos:])
    idx.extend(range(pos, len(t)))
    return "".join(out), idx


def strip_markup(text: str, drop_headings: bool = False) -> str:
    """The stripped prose alone, for callers that do not need offsets."""
    return _strip_mapped(text, drop_headings)[0]


# ---------------------------------------------------------------------------
# ColonUsage
#
# Vale token:  (?<!:[^ ]+?):\s(?!I\b)[A-Z][a-z]*\b
#
# The lookbehind is variable-length and Python `re` rejects it, so it is
# reimplemented as a post-filter: reject the match when the whitespace-
# delimited token ending at the colon itself contains a colon. That is what
# the lookbehind bought — "10:30: Meeting" and "Note::" stay clean.
#
# Scope in Vale is `~heading` (everywhere EXCEPT headings), so the port
# strips heading lines before matching.
# ---------------------------------------------------------------------------

# Vale matches `\s`, but it scans block by block, so a colon that ENDS a line
# never sees the next line's first word. Matching a newline here invents a
# "Label: Sentence" across a block boundary — 13 of the port's 18 human
# false positives were exactly that. Restricted to in-line whitespace.
_COLON = re.compile(r":[ \t](?!I\b)[A-Z][a-z]*\b")
#: A colon-terminated run-in label of one or two words, bolded in the source.
#: Sir's documented house style ("bold labels = 1-2 words + `:`"), so this
#: subset is a KNOWN false positive for authorship and is counted separately.
BOLD_LABEL = re.compile(r"\*\*[^*\n]{1,40}?:\*\*\s+(?!I\b)[A-Z][a-z]*\b")


def _colon_spans(raw: str) -> tuple[list[tuple[int, int]], int]:
    """Return (spans, bold_label_count) over heading-stripped text."""
    t = strip_markup(raw, drop_headings=True)
    out: list[tuple[int, int]] = []
    for m in _COLON.finditer(t):
        head = t.rfind(" ", 0, m.start())
        nl = t.rfind("\n", 0, m.start())
        start = max(head, nl) + 1
        if ":" in t[start:m.start()]:
            continue          # the lookbehind: a colon-joined run, e.g. 10:30:
        out.append((m.start(), m.end()))
    return out, len(BOLD_LABEL.findall(raw))


# ---------------------------------------------------------------------------
# CataphoricForecasting
#
# Ported verbatim from the Vale tokens. Every pattern is Python-compatible;
# the inline-flag group `(?i:...)` in Pattern G needs Python 3.11+.
# ---------------------------------------------------------------------------

_ADJ = ("key|main|core|central|critical|essential|guiding|foundational|distinct|"
        "broad|common|primary|fundamental|overarching|major|underlying|driving|"
        "crucial|basic")
_FRAMEWORK = ("pillars|principles|tenets|cornerstones|throughlines|through-lines|"
              "personas|archetypes|imperatives|superpowers|levers|horizons|motifs|"
              "paradigms")
_CARD_CAP = "Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten"
_CARD_LOW = "two|three|four|five|six|seven|eight|nine|ten"

CATAPHORIC_TOKENS: tuple[str, ...] = (
    rf"\b(?:{_CARD_CAP}) (?:(?:{_ADJ}) )?(?:{_FRAMEWORK})\b",
    rf"\b(?:{_CARD_CAP}) (?:(?:{_ADJ}) )?(?:\w+ ){{1,2}}(?:define|shape|drive|guide|"
    r"underpin|govern|anchor|frame|characterize|distinguish|separate|comprise|"
    r"structure|determine|dominate|inform|explain|power|fuel|motivate|unite)\b",
    rf"\b(?:[Hh]ere are|[Bb]elow are|[Tt]hese are|[Tt]he following are) (?:the )?"
    rf"(?:{_CARD_LOW}|\d+)\b",
    rf"\b[Tt]he following (?:{_CARD_LOW}|\d+)\b",
    rf"\b(?:[Tt]here are|[Ww]e have|[Yy]ou have) (?:{_CARD_LOW}) (?:(?:{_ADJ}) )?"
    r"(?:reasons|ways|things|factors|points|steps|categories|types|kinds|benefits|"
    r"advantages|aspects|elements|components|considerations|questions|lessons|"
    r"takeaways|pillars|principles|tenets|cornerstones|personas|archetypes|"
    r"dimensions|themes|drivers|forces)\b",
    rf"\b(?:{_CARD_CAP}) [^.!?:\n]{{0,60}}:",
    rf"\b(?:[Tt]hese|[Tt]hose|[Tt]he) (?:{_CARD_LOW}) (?:(?:{_ADJ}) )?(?:{_FRAMEWORK})\b",
    r"\b(?:expands?|unfolds?|proceeds?|progresses?|evolves?|rolls? out|breaks?(?: down)?|"
    r"splits?|happens?|occurs?|plays? out|(?:is|are|gets?) (?:split|divided|broken|"
    rf"separated|partitioned)) (?:in|into|across|over|through) (?:{_CARD_LOW}) "
    r"(?:(?:distinct|broad|main|key|core|central|critical|essential|major|separate|"
    r"discrete|successive|sequential|iterative|overlapping|logical|clear|simple|easy|"
    r"manageable|high-level|rough|initial|final) )?(?:phases|stages|steps|waves|rounds|"
    r"movements|acts|chapters|iterations|sprints|passes|tranches|installments)\b",
    r"\b(?:falls?|divides?|splits?|breaks?(?: down)?|sorts?|groups?|classifies?|"
    r"categori[sz]es?|(?:is|are|gets?) (?:grouped|divided|split|sorted|classified|"
    rf"categori[sz]ed|separated|broken)) (?:into|in) (?:{_CARD_LOW}) "
    r"(?:(?:distinct|broad|main|key|core|central|critical|essential|major|separate|"
    r"discrete|logical|clear|simple|basic|rough|high-level|general|overarching) )?"
    r"(?:categories|groups|buckets|types|kinds|camps|classes|classifications|clusters|"
    r"families|cohorts)\b",
    r"\bThe (?:[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine|[Tt]en) "
    r"(?!(?:of|or|to|and|in|out|percent|dozen|hundred|thousand|million|billion|seconds?|"
    r"minutes?|hours?|days?|weeks?|months?|quarters?|years?|decades?|times)\b)[A-Za-z][a-z]+",
    r"\b(?:Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve) "
    r"(?!(?i:of|or|to|and|in|out|more|percent|dozen|hundred|thousand|million|billion|"
    r"seconds?|minutes?|hours?|days?|weeks?|months?|quarters?|years?|decades?|times)\b)"
    r"[A-Za-z][a-z]+ [A-Za-z][a-z]+",
    r"\b(?:[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine) "
    rf"(?:of|out of|in) every (?:{_CARD_LOW}|dozen|hundred|thousand|million)\b",
    r"\b[Nn]ine times out of ten\b",
)

_CATAPHORIC = tuple(re.compile(p) for p in CATAPHORIC_TOKENS)


def _cataphoric_spans(raw: str) -> list[tuple[int, int]]:
    """Vale reports one alert per (token, position); overlapping tokens at the
    same start collapse, matching how Vale de-duplicates identical spans."""
    t = strip_markup(raw)
    best: dict[int, int] = {}
    for rx in _CATAPHORIC:
        for m in rx.finditer(t):
            # Vale emits one alert per position, so two tokens matching at the
            # same start are one hit, not two. Keep the longest span.
            best[m.start()] = max(best.get(m.start(), 0), m.end())
    return sorted(best.items())


# ---------------------------------------------------------------------------
# Measured evidence
#
# RATES are Phase 0 Addendum C, same-genre (human-document vs archon-document,
# length-matched). PRECISION is the fraction of a hand-adjudicated random
# sample of ARCHON hits that a reader agrees is the construction the rule
# names. `None` means not yet adjudicated, and the detector says so rather
# than flagging above "low".
# ---------------------------------------------------------------------------

RATES: dict[str, dict[str, float]] = {
    # Per-1,000 words, full arms, unmatched. FOUR arms, and the fourth is the
    # one that matters: `snorkel_other_humans` is 52 harbor-family documents
    # written by third-party contributors (W13:Jacques' corpus extractor,
    # 2026-09-09). Until it existed, every figure here was one author against
    # one author, and could not tell an authorship tell from a house style.
    "ColonUsage": {
        "sir_per_1k": 2.375,
        "snorkel_other_humans_per_1k": 0.286,
        "archon_authored_per_1k": 4.100,
        "archon_digest_per_1k": 15.617,
        "ratio_archon_vs_sir": 1.73,
        "ratio_archon_vs_other_humans": 14.34,
        "ratio_sir_vs_other_humans": 8.31,     # the disqualifier
    },
    "CataphoricForecasting": {
        "sir_per_1k": 0.127,
        "snorkel_other_humans_per_1k": 1.220,
        "archon_authored_per_1k": 0.625,
        "archon_digest_per_1k": 0.666,
        "ratio_archon_vs_sir": 4.93,
        "ratio_archon_vs_other_humans": 0.51,  # REVERSED
    },
}

#: Fraction of a hand-adjudicated random sample of ARCHON hits that reads as
#: the construction the rule names. `None` = not adjudicated.
PRECISION: dict[str, float | None] = {
    # 60-hit sample. The rule finds what it names nearly every time, but 51 of
    # the 60 sat in machine-written JICM digests. High CONSTRUCT precision,
    # no authorship validity. No number is quoted: it would read as licence.
    "ColonUsage": None,
    # 54-hit sample (every archon hit), adjudicated 2026-09-09: 29 are the
    # cataphoric lead-in, 25 are ordinary back-reference ("the four commits
    # were pushed") or a bare count inside a list item.
    "CataphoricForecasting": 0.537,
}

# ---------------------------------------------------------------------------
# WHY BOTH RULES SHIP AS METRICS AND NEITHER RAISES A FLAG
#
# Phase 0 ranked these two top on a same-genre comparison with ONE human arm:
# Sir. A one-author arm cannot separate "machines do this" from "this author
# does not do this," and both rules turn out to be the second thing.
#
#   ColonUsage      Sir writes it 8.3x more often than other human authors do.
#                   Archon prose is 1.7x Sir but 14.3x those humans. The rule
#                   sorts by house style, and the 4.98x headline came mostly
#                   from qwen3:8b JICM digests (15.6/1k), a machine-written
#                   register that has no business in an "Archon prose" arm.
#
#   CataphoricForecasting   REVERSED against real third-party humans, who fire
#                   it at 1.22/1k against Archon-authored 0.63/1k. The 4.9x
#                   was Sir's own avoidance of numbered lead-ins, not a tell.
#
# Both therefore join the counter-indicative set rather than the flagging path.
# The correct next move is not a threshold; it is a rule search run against BOTH
# human arms from the start, keeping only rules that separate machine text from
# every human arm at once.
# ---------------------------------------------------------------------------

#: Rules that do not survive a second human author. METRICS ONLY, never a flag.
METRIC_ONLY: frozenset[str] = frozenset({"ColonUsage", "CataphoricForecasting"})

#: Sign test against the four Snorkel-labelled fixtures: BOTH rules score 0 on
#: all four. The constructions are absent from that register, so this is not
#: evidence for or against either rule — it is no signal, and n=4 cannot be
#: widened: the platform keeps only the current submission, so the three failed
#: variants survive nowhere but fixtures.py.
FIXTURE_SIGN_TEST: dict[str, str] = {
    "ColonUsage": "no signal (0 hits on all 4 fixtures)",
    "CataphoricForecasting": "no signal (0 hits on all 4 fixtures)",
}


# ---------------------------------------------------------------------------
# SentenceColon — the rule ColonUsage was a bad proxy for
#
# ColonUsage requires a CAPITAL after the colon, which selects the run-in label
# construction, which is house style. The discriminating thing is the colon
# used MID-SENTENCE, after a lowercase word, comma or closing paren, to hinge
# one clause onto another. Both human arms agree on it. Archon prose does not.
#
#   Sir 7.92/1k · other humans 8.57/1k · Archon-authored 34.50/1k (medians)
#
# This is the first metric to clear the bar Addendum D set: it separates
# machine text from EVERY human arm at once, and the two human arms are nearly
# indistinguishable on it (AUC 0.584, where 0.5 is chance).
#
# HARD LIMIT, stated because it bounds every claim made from this rule: the
# qwen3:8b JICM digest arm scores 0.586 AUC and reads human. This is a tell for
# CLAUDE-family prose, not for machine text in general. For revising Archon
# output that is exactly the target. As an "AI detector" it would be a fraud.
# ---------------------------------------------------------------------------

_SENTENCE_COLON = re.compile(r"[a-z,\)]\s?:\s")

#: 90th percentile of the pooled human arms (236 documents, >=50 words).
SENTENCE_COLON_THRESHOLD = 25.4

SEPARATION: dict[str, dict[str, float]] = {
    "SentenceColon": {
        "sir_per_1k_median": 7.92,
        "snorkel_other_humans_per_1k_median": 8.57,
        "archon_authored_per_1k_median": 34.50,
        "archon_digest_per_1k_median": 11.83,
        "auc_archon_authored_vs_pooled_humans": 0.917,
        "auc_archon_authored_vs_sir": 0.906,
        "auc_archon_authored_vs_other_humans": 0.969,
        "auc_archon_digest_vs_pooled_humans": 0.586,   # the limit
        "auc_sir_vs_other_humans": 0.584,              # ~chance, as it should be
        "flag_rate_archon_authored": 0.73,
        "flag_rate_sir": 0.12,
        "flag_rate_other_humans": 0.00,
    },
}


def sentence_colon(text: str, genre: str | None = None) -> dict:
    """Mid-sentence colon density. The one ported-family rule that flags."""
    t = strip_markup(text, drop_headings=True)
    words = max(len(t.split()), 1)
    spans = [(m.start(), m.end()) for m in _SENTENCE_COLON.finditer(t)]
    rate = len(spans) / words * 1000
    metrics = {"SentenceColon_hits": len(spans),
               "SentenceColon_per_1k": round(rate, 3),
               "words": len(text.split())}
    flags = []
    if words < 50:
        metrics["SentenceColon_suppressed_reason"] = (
            "under 50 words; the rate is unstable and was never measured there")
    elif rate > SENTENCE_COLON_THRESHOLD:
        flags.append({
            "level": "medium",
            "name": "SentenceColon",
            "detail": (f"{rate:.1f} mid-sentence colons per 1k words, above the "
                       f"{SENTENCE_COLON_THRESHOLD}/1k 90th percentile of 236 human "
                       f"documents by two separate authors. AUC 0.917 against pooled "
                       f"humans; 73% of Archon documents flag here against 12% of "
                       f"Sir's and 0% of third-party humans'. Claude-family tell "
                       f"only: the qwen3:8b arm reads human at AUC 0.586."),
            "evidence": [t[max(0, s - 45):e + 45].replace("\n", " ").strip()
                         for s, e in spans[:6]]})
    return {"verdict": "flagged" if flags else "clean",
            "score": min(100, int(rate / SENTENCE_COLON_THRESHOLD * 50)),
            "flags": flags, "metrics": metrics}


def _result(name: str, spans: list[tuple[int, int]], text: str,
            metrics: dict[str, float], detail: str,
            per_1k_flag: float) -> dict:
    words = max(len(text.split()), 1)
    rate = len(spans) / words * 1000
    metrics = dict(metrics)
    metrics[f"{name}_hits"] = len(spans)
    metrics[f"{name}_per_1k"] = round(rate, 3)
    metrics["words"] = words

    flags = []
    if spans and rate >= per_1k_flag and name not in METRIC_ONLY:
        prec = PRECISION.get(name)
        level = "low" if prec is None else ("medium" if prec >= 0.7 else "low")
        note = ("precision not yet adjudicated; treat as advisory"
                if prec is None else f"measured precision {prec:.0%}")
        ev = []
        for s, e in spans[:6]:
            ev.append(text[max(0, s - 40):min(len(text), e + 40)].replace("\n", " ").strip())
        flags.append({"level": level, "name": name,
                      "detail": f"{detail} {len(spans)} hits, {rate:.2f}/1k words ({note}).",
                      "evidence": ev})
    # A metric-only rule contributes no score. Letting it score would smuggle
    # a disqualified rule back into the verdict through the side door.
    score = 0 if name in METRIC_ONLY else min(100, int(rate / max(per_1k_flag, 1e-9) * 50))
    return {"score": score, "flags": flags, "metrics": metrics}


def colon_usage(text: str, genre: str | None = None) -> dict:
    spans, bold = _colon_spans(text)
    r = _result(
        "ColonUsage", spans, text,
        {"ColonUsage_bold_label_hits": bold},
        "Label-colon-Sentence construction, the Phase 0 rate-bearing tell.",
        per_1k_flag=3.0)
    r["verdict"] = "flagged" if r["flags"] else "clean"
    return r


def cataphoric_forecasting(text: str, genre: str | None = None) -> dict:
    spans = _cataphoric_spans(text)
    r = _result(
        "CataphoricForecasting", spans, text, {},
        "Numbered lead-in that announces a count before delivering the items.",
        per_1k_flag=0.6)
    r["verdict"] = "flagged" if r["flags"] else "clean"
    return r


def analyse(text: str, genre: str | None = None) -> dict:
    """Every rule under one call, in the Console's contract shape.

    `genre` is accepted and forwarded so the Console can scope calls the way
    W13:Jacques scopes `structural_tell`. No rule here is genre-gated yet:
    SentenceColon was measured across three document sub-genres and held, and
    the other two are METRIC_ONLY, so gating them would be theatre.
    """
    parts = [colon_usage(text, genre), cataphoric_forecasting(text, genre),
             sentence_colon(text, genre)]
    metrics: dict[str, float] = {}
    flags: list[dict] = []
    for p in parts:
        metrics.update(p["metrics"])
        flags.extend(p["flags"])
    score = min(100, max((p["score"] for p in parts), default=0))
    return {"verdict": "flagged" if flags else "clean", "score": score,
            "flags": flags, "metrics": metrics}


DETECTORS: dict[str, Callable[..., dict]] = {
    "sentence_colon": sentence_colon,
    "colon_usage": colon_usage,
    "cataphoric_forecasting": cataphoric_forecasting,
    "prose_forge_ported_rules": analyse,
}


if __name__ == "__main__":
    import json
    import sys
    src = sys.stdin.read() if not sys.argv[1:] else open(sys.argv[1], encoding="utf-8").read()
    print(json.dumps(analyse(src), indent=2))
