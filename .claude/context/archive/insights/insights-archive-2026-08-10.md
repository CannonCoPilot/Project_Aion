# Insights Archive — 2026-08-10
# Rotated: 2026-08-11T03:49:30Z (4 entries)

### 2026-07-08 [89491a15ec99]

In your terms this is a **pangenome presence/absence matrix**: skeleton loci are the core genome, novel OCR spans are accessory insertions, missing reference cells are low-depth/deletion calls. The anti-laundering property falls out for free — there is **no book-level cell to drop**. A mangled verse is a low-identity row (→ re-OCR worklist), never a silent absence; a source is never accepted/rejected wholesale. This is the structural version of the "record, don't drop" fix we just made, generalized to the whole corpus. It's the thing to build forward to, and qc_audit's `coverage-audit.json` *is* this table.

### 2026-07-09 [e6f2df7eb8e9]

Deleting a superseded number is not enough — a builder greps for `0.85` and uses whatever they find. The durable fix is to leave a *tombstone* ("the stale 0.85 was a pre-QC-framework relic") so the next reader understands the number is dead, not merely absent. That's the documentation analog of a deprecation shim: the old symbol still "resolves" to an explanation instead of silently vanishing.

### 2026-07-09 [3c40902cec19]

The whole sprint was an exercise in **separating decision from execution**. Everything folded here is *specification* — the docs now say precisely what the code must do (activate `edit_ratio`, exclude gaps from plurality, enforce the cross-lineage floor), but the §11 hold means not one line of `char_identity.py` / `consensus_v2.py` was touched. That discipline is what lets a plan survive a context clear: the next session resumes from an unambiguous contract instead of half-applied code.

### 2026-07-09 [0664ff6c8a8a]

The manifest already carried per-volume content `sha256` — the generator just wasn't threading it into the witness record. This is the ideal fix: propagate an existing *real content hash* rather than fabricate an archive-id proxy. The critique (C4) was right that the schema needed unifying *first* — S1/S3/S9 carry `volumes[]` (multi-hash) while S2/S4/S5/S6/S8/S10–S15 are flat (single hash), so the witness-level sha256 must roll up deterministically (single→itself, multi→hash-of-sorted-hashes, a mini Merkle root) to give one join-stable value per witness.

