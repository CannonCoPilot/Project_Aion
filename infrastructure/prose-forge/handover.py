#!/usr/bin/env python3
"""
handover — turn certified pairs into a blinded package for W13:Jacques.

The pre-registered sequence (docs/PRODUCTION-CHECKER-ABLATION.md) is:

    3. W3 shuffles and hands over 16 texts under opaque ids, member unlabelled
    4. Jacques commits the sha256 of the pair file before looking at anything
    5. Jacques runs structural_tell (with genre="prompt", NOT the source genre,
       or the detector self-suppresses and every prediction is a vacuous null)
       and commits its predictions against those opaque ids
    6. Only then are the checker verdicts bought and committed
    7. Only then does W3 send the mapping

So this writes TWO files and they must not travel together.

    ablation_blind_texts.json    16 texts, shuffled, opaque ids. FOR JACQUES NOW.
    ablation_mapping.json        id -> (task, base|variant). WITHHELD until step 7.

The opaque id is a salted hash of the text, so it is stable across re-runs and
carries no ordering information: an id that encoded the pair index would let a
reader recover the pairing and the blind would be worthless.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import secrets
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE / "out"
SALT_PATH = OUT / ".handover_salt"


def _salt() -> str:
    if not SALT_PATH.exists():
        SALT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SALT_PATH.write_text(secrets.token_hex(16), encoding="utf-8")
    return SALT_PATH.read_text(encoding="utf-8").strip()


def oid(text: str, salt: str) -> str:
    return "t_" + hashlib.sha256(f"{salt}|{text}".encode()).hexdigest()[:12]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", default=str(OUT / "ablation_pairs.jsonl"))
    ap.add_argument("--seed", type=int, default=20260909)
    args = ap.parse_args()

    src = Path(args.pairs)
    if not src.exists():
        print(f"no certified pairs at {src}; run ablation.py first", file=sys.stderr)
        return 2
    pairs = [json.loads(l) for l in src.open(encoding="utf-8")]
    if not pairs:
        print("certified pair file is empty", file=sys.stderr)
        return 2

    salt = _salt()
    texts, mapping = [], []
    for p in pairs:
        for role, key in (("base", "base_text"), ("variant", "variant_text")):
            i = oid(p[key], salt)
            texts.append({"id": i, "text": p[key]})
            mapping.append({"id": i, "task_ref": p["task_ref"], "role": role,
                            "genre": p["genre"],
                            "file_gloss_ratio": p[f"dims_{role}"]["file_gloss_ratio"],
                            "fidelity_verdict": p["fidelity_verdict"]})

    random.Random(args.seed).shuffle(texts)

    blind = OUT / "ablation_blind_texts.json"
    blind.write_text(json.dumps(texts, indent=2, ensure_ascii=False) + "\n",
                     encoding="utf-8")
    digest = hashlib.sha256(blind.read_bytes()).hexdigest()

    (OUT / "ablation_mapping.json").write_text(
        json.dumps({"blind_sha256": digest, "mapping": mapping}, indent=2) + "\n",
        encoding="utf-8")

    print(f"pairs           {len(pairs)}")
    print(f"blinded texts   {len(texts)}  -> {blind}")
    print(f"sha256          {digest}")
    print(f"mapping WITHHELD (step 7)  -> {OUT / 'ablation_mapping.json'}")
    print("\nSend Jacques the path and the sha256. Do NOT send the mapping until "
          "his structural_tell predictions and the checker verdicts are both "
          "committed. Remind him: genre=\"prompt\", not the source genre.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
