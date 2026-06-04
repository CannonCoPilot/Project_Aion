#!/usr/bin/env python3
"""Extract specific book+chapter combos from KJV JSON into plain text files.

Usage:
    python3 extract-chapters.py /path/to/kjv.json "Mark 1" "Luke 4"
    python3 extract-chapters.py /path/to/kjv.json --all-passion

The --all-passion flag extracts the full Passion narrative chapters used by
the Gospel Synopsis test suite (Matthew 26-27, Mark 14-15, Luke 22-23, John 18-19).
"""
import json
import sys
from pathlib import Path

PASSION_CHAPTERS = [
    ("Matthew", 26), ("Matthew", 27),
    ("Mark", 14), ("Mark", 15),
    ("Luke", 22), ("Luke", 23),
    ("John", 18), ("John", 19),
]

OUTPUT_DIR = Path(__file__).parent / "sources"


def extract_chapter(verses: list[dict], book_name: str, chapter: int) -> list[dict]:
    return [v for v in verses if v["book_name"] == book_name and v["chapter"] == chapter]


def write_chapter(chapter_verses: list[dict], book_name: str, chapter: int) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    slug = f"{book_name.lower()}-{chapter}"
    out_path = OUTPUT_DIR / f"{slug}.txt"

    lines = [f"{book_name} Chapter {chapter} (KJV)\n", "=" * 40 + "\n\n"]
    for v in chapter_verses:
        lines.append(f"{v['verse']}  {v['text']}\n")

    out_path.write_text("".join(lines))
    return out_path


def parse_ref(ref: str) -> tuple[str, int]:
    parts = ref.rsplit(" ", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid reference: {ref!r} — expected 'Book Chapter' (e.g. 'Mark 1')")
    return parts[0], int(parts[1])


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <kjv.json> [\"Book Chapter\" ...] [--all-passion]")
        sys.exit(1)

    kjv_path = sys.argv[1]
    with open(kjv_path) as f:
        data = json.load(f)
    verses = data["verses"]

    refs = []
    if "--all-passion" in sys.argv:
        refs = PASSION_CHAPTERS
    else:
        for arg in sys.argv[2:]:
            if arg.startswith("--"):
                continue
            refs.append(parse_ref(arg))

    if not refs:
        print("No chapters specified. Use 'Book Chapter' args or --all-passion")
        sys.exit(1)

    books_available = sorted(set(v["book_name"] for v in verses))

    for book_name, chapter in refs:
        if book_name not in books_available:
            print(f"  WARNING: '{book_name}' not found. Available: {books_available[:10]}...")
            continue
        chapter_verses = extract_chapter(verses, book_name, chapter)
        if not chapter_verses:
            print(f"  WARNING: {book_name} {chapter} has 0 verses")
            continue
        out = write_chapter(chapter_verses, book_name, chapter)
        print(f"  {book_name} {chapter}: {len(chapter_verses)} verses -> {out}")


if __name__ == "__main__":
    main()
