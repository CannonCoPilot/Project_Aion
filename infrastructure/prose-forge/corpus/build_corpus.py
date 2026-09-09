#!/usr/bin/env python3
"""
prose-corpus (T1) — build the paired, provenance-labelled corpus.

Phase 0.2 of the Prose Forge plan. Extracts human and Archon prose from the
Claude Code session transcripts and from the monorepo, into arms that can be
compared. Deterministic: same inputs produce byte-identical output.

WHY THE FILTERING IS THE WHOLE JOB
----------------------------------
A naive read of the transcripts puts every `type:user` record in the human arm.
That is wrong in three separate ways, and each one would corrupt the calibration
that every later layer depends on:

  1. HARNESS TEXT.   `<local-command-caveat>`, `<command-name>` echoes, and
     `[Image: original 1400x2044 ...]` placeholders are emitted by the CLI, not
     typed by anyone. In one sampled transcript these were 20 of 22 user records.

  2. MACHINE INJECTIONS IN THE HUMAN ARM.  "Watcher here ..." is written by the
     JICM watcher daemon. JICM resume nudges arrive the same way. These are
     machine-generated text sitting in records typed `user`. Leaving them in
     would train the instrument to call machine prose human, which is the exact
     failure the project exists to avoid.

  3. TOOL RESULTS.  A `user` record whose content is a list of `tool_result`
     blocks is command output, not authorship.

  Anything uncertain is DROPPED, never guessed. A smaller clean corpus beats a
  larger contaminated one, because contamination here is not noise that averages
  out -- it is label error pointing the wrong way.

THE SYMLINK TRAP
----------------
`~/.claude/projects/` contains slug directories that are SYMLINKS to one real
directory: `-Users-nathanielcannon-Claude-Project-Aion` and `...Project_Aion`
both resolve to `...Claude-Jarvis`. Walking them naively counts the same 630MB
three times. Dedup is by (st_dev, st_ino), not by path.
"""

from __future__ import annotations
import argparse, hashlib, json, re, sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from deprose import strip_machine  # noqa: E402

PROJECTS = Path.home() / ".claude" / "projects"
REPO = Path("/Users/nathanielcannon/Claude/Project_Aion")

# ── filters ────────────────────────────────────────────────────────────────
# Each is anchored and specific. A broad filter that silently eats real prose is
# worse than a missed contaminant, because the loss is invisible in the counts.

HARNESS_PREFIXES = (
    "<local-command-caveat>", "<command-name>", "<command-message>",
    "<local-command-stdout>", "<system-reminder>", "<user-prompt-submit-hook>",
    "[Image:", "[Request interrupted", "[Pasted text",
    "Caveat: The messages below were generated",
)

# Text typed `user` but authored by Aion machinery. Extend this list rather than
# widening the patterns: each entry names one known emitter.
MACHINE_INJECTIONS = (
    re.compile(r"^\s*Watcher here[.,]", re.I),            # jicm watcher daemon
    re.compile(r"^\s*@?Resume work from compressed", re.I),  # jicm resume nudge
    re.compile(r"^\s*JICM (DEV-LANE )?CONTEXT RESTORATION", re.I),
    re.compile(r"compressed-context-ready", re.I),
    re.compile(r"^\s*Please load these files into context:", re.I),  # launcher init
    re.compile(r"^\s*You are (W\d+|Jarvis|Alfred|Genie|Jacques|Urist|Fleming)", re.I),
    # Subagent completion reports. Machine-authored, delivered as a user turn.
    re.compile(r"<task-notification>", re.I),
    # THE AUTOCOMPACT SUMMARY. Written by the model, not the user, and it arrives
    # as a long `user` record — so it landed in the human arm and, being long,
    # carried disproportionate word mass. Found 2026-09-08 while auditing the
    # long tail: records >=500w were 7.5% of records but 46.3% of human WORDS,
    # and most of that tail was this plus task-notifications.
    re.compile(r"^\s*This session is being continued from a previous conversation", re.I),
    re.compile(r"^\s*<analysis>\s*$", re.I | re.M),
)

# Structural noise inside otherwise-real messages.
STRIP_BLOCKS = re.compile(
    r"<(system-reminder|local-command-caveat|local-command-stdout|command-name|"
    r"command-message|command-args|user-prompt-submit-hook)>.*?"
    r"</\1>", re.S | re.I)


def clean(text: str) -> str:
    """Remove embedded harness blocks, normalise whitespace. Never paraphrase."""
    t = STRIP_BLOCKS.sub(" ", text)
    t = re.sub(r"\[Image:[^\]]*\]", " ", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def is_harness(text: str) -> bool:
    s = text.lstrip()
    if any(s.startswith(p) for p in HARNESS_PREFIXES):
        return True
    return False


def is_machine_injection(text: str) -> bool:
    return any(p.search(text) for p in MACHINE_INJECTIONS)


def words(text: str) -> int:
    return len(text.split())


# ── transcript walk ────────────────────────────────────────────────────────

def transcripts() -> list[Path]:
    """All session JSONL files, deduped by inode so symlinked slugs count once."""
    seen: set[tuple[int, int]] = set()
    out: list[Path] = []
    if not PROJECTS.is_dir():
        return out
    for slug in sorted(PROJECTS.iterdir()):
        real = slug.resolve()
        if not real.is_dir():
            continue
        for f in sorted(real.glob("*.jsonl")):
            try:
                st = f.stat()
            except OSError:
                continue
            key = (st.st_dev, st.st_ino)
            if key in seen:
                continue
            seen.add(key)
            out.append(f)
    return out


def extract(path: Path, stats: dict) -> list[dict]:
    """Yield labelled prose records from one transcript."""
    recs = []
    try:
        fh = path.open(encoding="utf-8", errors="replace")
    except OSError:
        return recs
    with fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                stats["unparseable_lines"] += 1
                continue
            typ = d.get("type")
            if typ not in ("user", "assistant"):
                continue
            msg = d.get("message") or {}
            content = msg.get("content")

            if typ == "user":
                # Only a bare string is a typed prompt. A list means tool_result.
                if not isinstance(content, str):
                    stats["user_tool_result"] += 1
                    continue
                if is_harness(content):
                    stats["user_harness"] += 1
                    continue
                if is_machine_injection(content):
                    stats["user_machine_injection"] += 1
                    continue
                body = clean(content)
                if not body:
                    stats["user_empty_after_clean"] += 1
                    continue
                # Strip pasted logs and code from INSIDE the message. Without this
                # a 15,368-word crash report counts as human prose; it is ~1,700
                # words of Sir wrapped around a kernel panic log.
                body, ds = strip_machine(body)
                stats["human_machine_lines_stripped"] += ds["machine_lines_removed"]
                stats["human_fenced_lines_stripped"] += ds["fenced_lines_removed"]
                if not body:
                    stats["user_empty_after_strip"] += 1
                    continue
                w = words(body)
                # Document arm = long-form prose AFTER stripping, so length reflects
                # what Sir actually wrote rather than what he pasted.
                arm = "human-document" if w >= 250 else "human-conversational"
                recs.append({"arm": arm, "text": body,
                             "src": path.name, "words": w})
            else:
                if not isinstance(content, list):
                    continue
                for b in content:
                    if not isinstance(b, dict) or b.get("type") != "text":
                        continue
                    body = clean(b.get("text") or "")
                    if not body:
                        continue
                    recs.append({"arm": "archon-conversational", "text": body,
                                 "src": path.name, "words": words(body)})
    return recs


# ── repository documents ───────────────────────────────────────────────────

ARCHON_DOC_GLOBS = [
    ".claude/context/jicm/checkpoints/*.compressed.md",
    ".claude/context/jicm/digests/*.md",
    "projects/project-aion/plans/*.md",
    "projects/project-aion/reports/*.md",
]


def repo_docs(stats: dict) -> list[dict]:
    recs = []
    for g in ARCHON_DOC_GLOBS:
        for f in sorted(REPO.glob(g)):
            try:
                body = clean(f.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
            if words(body) < 50:
                stats["doc_too_short"] += 1
                continue
            recs.append({"arm": "archon-document", "text": body,
                         "src": str(f.relative_to(REPO)), "words": words(body)})
    return recs


# ── main ───────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Build the paired prose corpus.")
    ap.add_argument("--out", default=str(REPO / "infrastructure/prose-forge/out"))
    ap.add_argument("--min-words", type=int, default=0,
                    help="drop records shorter than this (0 = keep all, report only)")
    ap.add_argument("--holdout", type=float, default=0.2)
    args = ap.parse_args()

    out = Path(args.out)
    (out / "arms").mkdir(parents=True, exist_ok=True)

    stats = defaultdict(int)
    files = transcripts()
    recs: list[dict] = []
    for f in files:
        recs.extend(extract(f, stats))
    recs.extend(repo_docs(stats))

    if args.min_words:
        before = len(recs)
        recs = [r for r in recs if r["words"] >= args.min_words]
        stats["dropped_min_words"] = before - len(recs)

    # Deterministic split: hash of the text, never a random seed, so the same
    # record always lands in the same side regardless of ordering or run count.
    for r in recs:
        h = hashlib.sha256(r["text"].encode()).hexdigest()
        r["id"] = h[:16]
        r["split"] = "holdout" if (int(h[:8], 16) / 0xFFFFFFFF) < args.holdout else "train"

    # Fork-and-resume copies a transcript's history into the child, so the same
    # message appears in several files. Dedup on (arm, content hash): a 15,368-word
    # record was present twice before this was added.
    seen_ids: set[tuple[str, str]] = set()
    deduped = []
    for r in recs:
        key = (r["arm"], r["id"])
        if key in seen_ids:
            stats["duplicate_records"] += 1
            continue
        seen_ids.add(key)
        deduped.append(r)
    recs = deduped

    by_arm: dict[str, list[dict]] = defaultdict(list)
    for r in recs:
        by_arm[r["arm"]].append(r)

    manifest = {
        "generated_from": {"transcripts": len(files), "repo": str(REPO)},
        "filters_applied": dict(stats),
        "arms": {},
    }

    for arm, rs in sorted(by_arm.items()):
        rs.sort(key=lambda r: (r["src"], r["id"]))       # deterministic order
        wl = sorted(r["words"] for r in rs)
        n = len(wl)
        manifest["arms"][arm] = {
            "records": n,
            "words_total": sum(wl),
            "words_median": wl[n // 2] if n else 0,
            "words_p90": wl[int(n * 0.9)] if n else 0,
            "words_max": wl[-1] if n else 0,
            "holdout_records": sum(1 for r in rs if r["split"] == "holdout"),
        }
        with (out / "arms" / f"{arm}.jsonl").open("w", encoding="utf-8") as fh:
            for r in rs:
                fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")

    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"transcripts read (inode-deduped): {len(files)}")
    print("\nfiltered out of the human arm:")
    for k in ("user_tool_result", "user_harness", "user_machine_injection",
              "user_empty_after_clean", "user_empty_after_strip", "unparseable_lines",
              "duplicate_records", "human_machine_lines_stripped",
              "human_fenced_lines_stripped"):
        if stats.get(k):
            print(f"  {k:26s} {stats[k]:>8,}")
    print("\narms:")
    print(f"  {'arm':26s} {'recs':>7} {'words':>10} {'median':>7} {'p90':>7} {'max':>8}")
    for arm, m in manifest["arms"].items():
        print(f"  {arm:26s} {m['records']:>7,} {m['words_total']:>10,} "
              f"{m['words_median']:>7,} {m['words_p90']:>7,} {m['words_max']:>8,}")
    print(f"\nmanifest -> {out / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
