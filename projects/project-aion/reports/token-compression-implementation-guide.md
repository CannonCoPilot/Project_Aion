# Token Compression — End-to-End Implementation Guide (v1)

**Project**: Token Compression for Jarvis & Alfred-Dev
**Date**: 2026-04-30
**Author**: Jarvis (Master Archon)
**Status**: Draft v1 — tactical playbook companion to roadmap v3 (commit `c95a334`)
**Read alongside**: `token-compression-roadmap.md` (strategic phases, source findings, persona variants, multi-pass architecture)

---

## Reading order

The roadmap (v3) answers *what* and *why*. This guide answers *how* and *verify*. For each phase the roadmap describes, this guide provides:

1. Concrete file paths and edit positions
2. Verbatim text/code to paste
3. Verification commands with pass criteria
4. Rollback procedure
5. Telemetry-capture wiring

Both documents target the same phase numbers (0-5 plus deferred 6). Where the roadmap is the architecture diagram, this guide is the wiring schematic.

---

## §1 Prerequisites & Environment

### 1.1 Required tools

| Tool | First needed in | Install command |
|---|---|---|
| `tiktoken` (Python) | Phase 1, 2 | `infrastructure/.venv/bin/pip install tiktoken` |
| `spaCy` + `en_core_web_sm` | Phase 3 | `infrastructure/.venv/bin/pip install spacy && infrastructure/.venv/bin/python -m spacy download en_core_web_sm` |
| `jq` | Phase 0, 4 | already installed (system) |
| Anthropic SDK | Phase 4 | `infrastructure/.venv/bin/pip install anthropic` (verify present) |

### 1.2 Branch setup

| Repo | Local path | Branch | Purpose |
|---|---|---|---|
| Jarvis | `/Users/nathanielcannon/Claude/Jarvis/` | `Project_Aion` | All Jarvis-side edits |
| Alfred-Dev | `/Users/nathanielcannon/Claude/Alfred-Dev/` | `nate-dev` | Phases 1.5, 1.2-1.4, 4, 5 |

### 1.3 Pre-flight check

```bash
# Jarvis side:
git -C /Users/nathanielcannon/Claude/Jarvis status --short
git -C /Users/nathanielcannon/Claude/Jarvis rev-parse --abbrev-ref HEAD  # expect: Project_Aion
infrastructure/.venv/bin/python -c "import tiktoken; print('tiktoken OK')"

# Alfred-Dev side (Phase 1.5+):
git -C /Users/nathanielcannon/Claude/Alfred-Dev status --short
git -C /Users/nathanielcannon/Claude/Alfred-Dev rev-parse --abbrev-ref HEAD  # expect: nate-dev
```

### 1.4 Credentials

GitHub PAT for AIFred-Pro push, when needed:

```bash
PAT=$(yq -r '.github.aifred_token' /Users/nathanielcannon/Claude/Jarvis/.claude/secrets/credentials.yaml | head -1 | tr -d '[:space:]')
```

### 1.5 Protected-path editing

The Edit tool prompts for any file under `.claude/`, `.git/`, etc. — even in `bypassPermissions` mode. For autonomous edits in those directories, use `protected-edit.py` (Bash-based replacement):

```bash
python3 /Users/nathanielcannon/Claude/Jarvis/.claude/scripts/dev/protected-edit.py \
  <file> --old '<exact text>' --new '<replacement text>'
```

Phases 1.5, 4, and 5 all touch `.claude/` paths in Alfred-Dev.

---

## §2 Phase 0 — Cache Telemetry Capture

**Goal**: instrument cache-hit-rate measurement per session, with disaggregation between 5-min and 1-hour TTL pools. Runs concurrently with Phases 1-5; not gating.

### 2.1 Create cache-telemetry extractor

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/cache-telemetry-extractor.py`

```python
#!/usr/bin/env python3
"""
Parse Claude Code session JSONL files and extract per-turn cache telemetry.

Output: CSV with columns
  session_id, turn_n, ts, input_tokens, cache_read,
  eph_5m, eph_1h, output_tokens, hit_rate
"""
import json, sys, csv, pathlib, argparse

def parse_session(path):
    rows = []
    with open(path) as f:
        for turn_n, line in enumerate(f):
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            usage = event.get("message", {}).get("usage", {})
            if not usage:
                continue
            input_tokens = usage.get("input_tokens", 0)
            cache_read = usage.get("cache_read_input_tokens", 0)
            cache_creation = usage.get("cache_creation", {}) or {}
            eph_5m = cache_creation.get("ephemeral_5m_input_tokens", 0) if isinstance(cache_creation, dict) else 0
            eph_1h = cache_creation.get("ephemeral_1h_input_tokens", 0) if isinstance(cache_creation, dict) else 0
            output_tokens = usage.get("output_tokens", 0)
            denom = cache_read + eph_5m + eph_1h + input_tokens
            hit_rate = (cache_read / denom) if denom else 0.0
            rows.append({
                "session_id": event.get("sessionId", ""),
                "turn_n": turn_n,
                "ts": event.get("timestamp", ""),
                "input_tokens": input_tokens,
                "cache_read": cache_read,
                "eph_5m": eph_5m,
                "eph_1h": eph_1h,
                "output_tokens": output_tokens,
                "hit_rate": round(hit_rate, 4),
            })
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="Session JSONL file or directory")
    ap.add_argument("--out", default="-", help="Output CSV path (default stdout)")
    args = ap.parse_args()

    p = pathlib.Path(args.path)
    files = [p] if p.is_file() else sorted(p.rglob("*.jsonl"))

    out = sys.stdout if args.out == "-" else open(args.out, "w")
    fields = ["session_id", "turn_n", "ts", "input_tokens", "cache_read",
              "eph_5m", "eph_1h", "output_tokens", "hit_rate"]
    w = csv.DictWriter(out, fieldnames=fields)
    w.writeheader()
    for f in files:
        for row in parse_session(f):
            w.writerow(row)

if __name__ == "__main__":
    main()
```

```bash
chmod +x /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/cache-telemetry-extractor.py
```

### 2.2 Aggregation wrapper

**File**: `.claude/skills/token-compression/scripts/cache-telemetry-aggregate.sh`

```bash
#!/usr/bin/env bash
# Aggregate cache-telemetry CSV into per-session summary.
# Usage: cache-telemetry-aggregate.sh <csv-file>
set -u
CSV="${1:?usage: $0 <csv-file>}"
awk -F, 'NR>1 {
  s[$1]++; cr[$1]+=$5; e5[$1]+=$6; e1[$1]+=$7; in_[$1]+=$4; out[$1]+=$8
}
END {
  printf "%-40s %6s %10s %10s %10s %8s\n", "session_id", "turns", "input", "cache_read", "eph_1h", "hit%"
  for (k in s) {
    denom = cr[k]+e5[k]+e1[k]+in_[k]
    rate = (denom>0) ? (cr[k]/denom)*100 : 0
    printf "%-40s %6d %10d %10d %10d %7.1f%%\n", k, s[k], in_[k], cr[k], e1[k], rate
  }
}' "$CSV"
```

```bash
chmod +x /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/cache-telemetry-aggregate.sh
```

### 2.3 Capture protocol

```bash
# Once per measurement window, after sessions have closed:
python3 /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/cache-telemetry-extractor.py \
  ~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/ \
  --out /Users/nathanielcannon/Claude/Jarvis/.claude/metrics/token-compression/cache-telemetry-$(date +%Y%m%d).csv

# Aggregate:
/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/cache-telemetry-aggregate.sh \
  /Users/nathanielcannon/Claude/Jarvis/.claude/metrics/token-compression/cache-telemetry-$(date +%Y%m%d).csv
```

Create the metrics directory once:

```bash
mkdir -p /Users/nathanielcannon/Claude/Jarvis/.claude/metrics/token-compression
```

### 2.4 Decision criteria

| Metric | Pass | Investigate | Fail |
|---|---|---|---|
| Mean hit rate (cache_read / total) | ≥60% | 40-60% | <40% |
| `eph_1h` adoption (after Phase 4) | ≥30% of cache_creation | 10-30% | <10% |
| Hit-rate Δ after Phase 1.1 deployment | within ±5pp of baseline | drop 5-15pp | drop >15pp |

Hit rate <40% after compression deployment → escalate; consider redesigning Pass 1 to live in a separate cached file or moving the directive lower in CLAUDE.md (after the larger force-loaded blocks) so the cached prefix remains stable.

### 2.5 Rollback

Phase 0 is measurement-only — no compression changes to roll back. If telemetry instrumentation itself misbehaves, remove the scripts and re-run from cleaned session data.

---

## §3 Phase 1.1 — Deploy Jeeves-Brief to Jarvis CLAUDE.md

**Goal**: insert the Jeeves-Brief directive at the top of Jarvis's force-loaded context, where it acts as the Pass 1 system layer for every Jarvis output token.

### 3.1 Pre-deploy: token cost verification

```bash
infrastructure/.venv/bin/python -c '
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")  # cl100k approximates Claude tokenizer; ratios are reliable, absolute counts approximate
prompt = """Respond with the precision of an experienced butler. Cut all filler; keep technical substance. Drop pleasantries (sure, certainly, happy to), hedging, and restated context. Prefer one clear sentence over three cautious ones. Maintain formal register: complete sentences, professional diction. Technical terms stay exact. Code blocks, paths, and commands unchanged. Pattern: [observation]. [implication]. [next action], sir."""
print(f"Tokens (cl100k approx): {len(enc.encode(prompt))}")
'
# Expected: ~85-95 tokens
```

### 3.2 Edit: insert Jeeves-Brief at top of CLAUDE.md

**File**: `/Users/nathanielcannon/Claude/Jarvis/CLAUDE.md`

**Position**: immediately after the H1 title and the `Role:` line, before `## Autonomic behavior (default)`. This places the directive at the *top* of the cached prefix, so the cache-key transition occurs once, then the prefix remains stable across all subsequent sessions.

**Edit pattern**:

```
old_string:
# Jarvis -- Autonomous Archon (Project Aion)

Role: Master Archon; autonomous infra/dev/self-improvement agent for Project Aion.
Co-equal peer with AIFred-Pro (Operations Archon). Jarvis is fully aware of AIFred-Pro; AIFred-Pro is NOT customized for Jarvis. One-way awareness — Jarvis adapts to AIFred-Pro's systems, not vice versa.

## Autonomic behavior (default)

new_string:
# Jarvis -- Autonomous Archon (Project Aion)

Role: Master Archon; autonomous infra/dev/self-improvement agent for Project Aion.
Co-equal peer with AIFred-Pro (Operations Archon). Jarvis is fully aware of AIFred-Pro; AIFred-Pro is NOT customized for Jarvis. One-way awareness — Jarvis adapts to AIFred-Pro's systems, not vice versa.

## Output style (Jeeves-Brief)

Respond with the precision of an experienced butler. Cut all filler; keep technical substance. Drop pleasantries (sure, certainly, happy to), hedging, and restated context. Prefer one clear sentence over three cautious ones. Maintain formal register: complete sentences, professional diction. Technical terms stay exact. Code blocks, paths, and commands unchanged. Pattern: [observation]. [implication]. [next action], sir.

## Autonomic behavior (default)
```

Apply via the Edit tool, then commit:

```bash
cd /Users/nathanielcannon/Claude/Jarvis
git add CLAUDE.md
git commit -m "feat(token-compression): deploy Jeeves-Brief output style (Phase 1.1)

Reference: token-compression-roadmap.md v3 §2.3.
Compression layer: Pass 1 (system level, always-on).
"
```

### 3.3 Test protocol

> **DEPRECATED 2026-05-01**: this protocol's median-output_tokens criterion produced an INCONCLUSIVE result on the Phase 1.4 run because pre/post buckets had mismatched content distributions. New runs follow `token-compression-experimental-design.md` (intent-class-stratified protocol with pre-registered per-class predictions). Kept here for historical record; do not use for new runs.

| Step | Action | Pass criterion |
|---|---|---|
| 1 | Capture 3 baseline sessions before edit (use Phase 0 telemetry if recent) | Median output_tokens recorded |
| 2 | Apply edit; commit on Project_Aion | Single-concern diff |
| 3 | Run 3 ordinary sessions post-edit | All sessions complete normally |
| 4 | Run cache-telemetry-extractor on the 3 sessions | Hit rate within ±5pp of baseline |
| 5 | Compute median output_tokens | 20-34% reduction vs baseline |
| 6 | Spot-check 5 random responses for register | No "sure!", "happy to help", or hedging |

### 3.4 Rollback

```bash
git -C /Users/nathanielcannon/Claude/Jarvis revert <hash>
# or to amend in place if rollback is immediate:
git -C /Users/nathanielcannon/Claude/Jarvis checkout HEAD~1 -- CLAUDE.md
git -C /Users/nathanielcannon/Claude/Jarvis commit -m "revert: Jeeves-Brief Phase 1.1 (regression detail)"
```

---

## §4 Phase 1.5 — Deploy Alfred-Brief to Alfred-Dev CLAUDE.md

**Goal**: same as Phase 1.1 but for AIFred (Alfred Pennyworth persona, drier register, Master-Nathaniel address, confirmatory valedictions).

### 4.1 Pre-deploy: token cost verification

```bash
infrastructure/.venv/bin/python -c '
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
prompt = """Respond with the measured economy of a long-serving butler. Cut filler; keep technical substance. Drop pleasantries (sure, certainly, happy to), hedging, and restated context. Speak plainly. Maintain professional register: complete sentences, no theatrics. Technical terms stay exact. Code blocks, paths, and commands unchanged. Pattern: [observation]. [implication]. [next action]. Close action-bearing replies with a confirmatory valediction — \"Very good.\", \"Right away.\", \"It shall be taken care of.\", \"Immediately.\", or \"I will see to it myself.\" — singly or in pairs (\"Very good. Right away.\"). Address the user as \"Master Nathaniel\" only at the conclusion of a lengthy reply, never on routine short answers."""
print(f"Tokens (cl100k approx): {len(enc.encode(prompt))}")
'
# Expected: ~135-150 tokens
```

### 4.2 Edit: insert Alfred-Brief in Alfred-Dev CLAUDE.md

**File**: `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/CLAUDE.md`

**Position**: top of the file (after H1 title and any role description), before existing operational sections. Same cache-stability reasoning as §3.2.

Use `protected-edit.py` because the path is under `.claude/`:

```bash
python3 /Users/nathanielcannon/Claude/Jarvis/.claude/scripts/dev/protected-edit.py \
  /Users/nathanielcannon/Claude/Alfred-Dev/.claude/CLAUDE.md \
  --old "<H1 + role line, exact verbatim from current file>" \
  --new "<H1 + role line>

## Output style (Alfred-Brief)

Respond with the measured economy of a long-serving butler. Cut filler; keep technical substance. Drop pleasantries (sure, certainly, happy to), hedging, and restated context. Speak plainly. Maintain professional register: complete sentences, no theatrics. Technical terms stay exact. Code blocks, paths, and commands unchanged. Pattern: [observation]. [implication]. [next action]. Close action-bearing replies with a confirmatory valediction — \"Very good.\", \"Right away.\", \"It shall be taken care of.\", \"Immediately.\", or \"I will see to it myself.\" — singly or in pairs (\"Very good. Right away.\"). Address the user as \"Master Nathaniel\" only at the conclusion of a lengthy reply, never on routine short answers."
```

Read the file first to get the exact `--old` text — don't paraphrase from memory.

### 4.3 Commit and push to nate-dev

```bash
cd /Users/nathanielcannon/Claude/Alfred-Dev
git checkout nate-dev
git add .claude/CLAUDE.md
git commit -m "docs: deploy Alfred-Brief output style (token-compression Phase 1.5)

Reference: Jarvis token-compression-roadmap.md v3 §2.3 (Master Nathaniel +
confirmatory valedictions per Pennyworth canon).
Compression layer: Pass 1 (system level, always-on).
"

PAT=$(yq -r '.github.aifred_token' /Users/nathanielcannon/Claude/Jarvis/.claude/secrets/credentials.yaml | head -1 | tr -d '[:space:]')
git -c "credential.helper=!f() { echo \"username=CannonCoPilot\"; echo \"password=$PAT\"; }; f" push origin nate-dev
```

### 4.4 Test protocol

Same as Phase 1.1 but exercised through Alfred-Dev sessions launched from `/Users/nathanielcannon/Claude/Alfred-Dev`.

Persona-specific spot-checks:

| Check | Pass criterion |
|---|---|
| "Master Nathaniel" appears in responses ≥200 tokens long | ≥1 occurrence per long reply |
| "Master Nathaniel" appears in routine short replies | 0 occurrences (must be reserved for length) |
| Confirmatory valediction at end of action-bearing replies | "Very good." / "Right away." / "It shall be taken care of." / "Immediately." / "I will see to it myself." or pair |
| ", sir" trailing | 0 occurrences (that's Jeeves, not Alfred) |
| No theatrics ("Of course!", "Splendid!", flowery praise) | 0 occurrences |

### 4.5 Rollback

```bash
git -C /Users/nathanielcannon/Claude/Alfred-Dev revert <hash>
git -C /Users/nathanielcannon/Claude/Alfred-Dev push origin nate-dev
```

---

## §5 Phase 1.2-1.4 — Pipeline Executor Brevity Injection

**Goal**: append `"Be brief."` to the Alfred-Dev pipeline executor and reviewer system prompts. No persona constraint here — subagents and CLI invocations don't user-face.

### 5.1 Locate the executor prompt-build function

```bash
cd /Users/nathanielcannon/Claude/Alfred-Dev
grep -n "def build_prompt\|def _build\|def construct_prompt\|system.*prompt" .claude/jobs/services/executor.py
```

Find the function that constructs the system prompt sent to `claude -p` or Ollama. Likely names: `build_prompt()`, `_build_executor_prompt()`, `_make_system_prompt()`.

### 5.2 Edit: append brief epilogue

Apply via `protected-edit.py` (path is under `.claude/`):

```bash
python3 /Users/nathanielcannon/Claude/Jarvis/.claude/scripts/dev/protected-edit.py \
  /Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/executor.py \
  --old '<lines just before return of build_prompt>' \
  --new '<same lines>
    prompt += "\n\nBe brief."  # token-compression Phase 1.2'
```

If the function constructs a structured prompt (e.g., separate system + user messages), add the directive to the **system** section only — never to the user-task section. The user's original task spec must remain verbatim. See roadmap §2.2.

### 5.3 Same pattern for reviewer

```bash
grep -n "def review\|def _build_review\|review_prompt" /Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/reviewer.py
```

Apply the same `\n\nBe brief.` epilogue to the reviewer's system-prompt construction.

### 5.4 Test command

```bash
cd /Users/nathanielcannon/Claude/Alfred-Dev
/Users/nathanielcannon/Claude/Jarvis/infrastructure/.venv/bin/python -m pytest \
  .claude/jobs/tests/test_pipeline_v2.py -k gospel -v
```

Or run the gospel-synopsis suite directly via the test harness used in prior sessions.

Pass criterion: all tasks close with rubric-style score ≥ 0.97; mean output_tokens drops 20-34% vs the prior gospel-synopsis run.

### 5.5 Rollback

```bash
git -C /Users/nathanielcannon/Claude/Alfred-Dev checkout HEAD~1 -- .claude/jobs/services/executor.py .claude/jobs/services/reviewer.py
git -C /Users/nathanielcannon/Claude/Alfred-Dev commit -m "revert: brief epilogue Phase 1.2-1.3 (regression)"
```

---

## §6 Phase 2 — Chain of Draft

**Goal**: deploy CoD seed prompt for reasoning-heavy tasks; build few-shot library only if the single-line seed is insufficient.

### 6.1 Step 2.1 — single-line CoD validation (do this first)

The arxiv-verified seed prompt:

> Think step by step, but only keep a minimum draft for each thinking step, with 5 words at most.

**File** (already exists): `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/templates/chain-of-draft.txt`

Verify content:

```bash
cat /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/templates/chain-of-draft.txt
```

If the file does not contain the seed verbatim, edit it to do so.

### 6.2 Identify 5 representative reasoning tasks

Pick 5 prior Jarvis sessions where extended thinking was used (look for sessions with high `output_tokens` and visible thinking blocks). Capture per-turn baseline:

```bash
python3 /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/cache-telemetry-extractor.py \
  ~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/<session-id>.jsonl
```

(Extend the extractor to also capture `usage.thinking_tokens` if absent — it's the same JSONL location.)

### 6.3 Apply CoD via existing skill script

The `apply-cod.sh` script already exists from the earlier skill-skeleton work. Its job is to prepend the chain-of-draft.txt block to a target system prompt:

```bash
/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/apply-cod.sh \
  --task-id <pulse-task-id> \
  /path/to/system-prompt.txt
```

Re-run the 5 reasoning tasks with CoD applied; capture new thinking_tokens; compute reduction.

Pass criterion: ≥50% thinking-token reduction with rubric-style quality score ≥0.95.

### 6.4 Step 2.2 — build few-shot library (only if 6.3 misses quality gate)

**Files** to create under `.claude/skills/token-compression/prompts/cod-examples/`:

- `code-review.md`
- `bug-diagnosis.md`
- `planning.md`
- `research.md`
- `session-mgmt.md`

Each file: 3-5 examples of the form

```
Q: [task description, ~30 words]
Reasoning: [≤5 word draft step]; [≤5 word draft step]; [≤5 word draft step].
A: [concise answer, ~50 words]
```

Verify token cost per file with tiktoken; target ≤200 tokens per example file so that injecting one CoD example library remains a small overhead relative to expected savings.

### 6.5 Skip rules — never apply CoD to:

- Arithmetic / numeric reasoning (paper measures −4% on math)
- Code generation (interferes with structured output)
- Creative writing
- Tool-use heavy workflows where the rationale *is* the tool selection

Per roadmap §4.6 decision tree.

### 6.6 Rollback

If quality regresses after CoD deployment:
- Remove the CoD block from the relevant system prompt(s)
- Or keep CoD but add a `--no-cod` flag to scripts that opted in, defaulting to off

---

## §7 Phase 3 — JICM Compression

**Goal**: reduce JICM checkpoint size by 33-40% via NLP preprocessing plus Signal notation in machine-consumed sections.

### 7.1 Install spaCy

```bash
/Users/nathanielcannon/Claude/Jarvis/infrastructure/.venv/bin/pip install spacy
/Users/nathanielcannon/Claude/Jarvis/infrastructure/.venv/bin/python -m spacy download en_core_web_sm
```

### 7.2 Create NLP preprocessing script

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/nlp-preprocess.py`

```python
#!/usr/bin/env python3
"""
Remove redundancy from a text block while preserving sentence integrity.
Input: stdin or file path; Output: stdout.

Strategy:
- Tokenize sentences via spaCy
- Drop sentences whose noun-chunk overlap with prior sentences > 0.7
- Strip filler ("just", "really", "basically", "actually", "simply", "essentially")
- Preserve all sentences containing code-block fences, paths, URLs, error strings
"""
import sys, re, argparse
import spacy

FILLER_RE = re.compile(r"\b(just|really|basically|actually|simply|essentially)\s+", re.IGNORECASE)
SACRED_RE = re.compile(r"```|/Users/|http[s]?://|\.py\b|\.md\b|Error:|Traceback")

def preprocess(text):
    nlp = spacy.load("en_core_web_sm")
    doc = nlp(text)
    seen_chunks = []
    out_sentences = []
    for sent in doc.sents:
        if SACRED_RE.search(sent.text):
            out_sentences.append(sent.text)
            continue
        sent_chunks = set(c.lemma_.lower() for c in sent.noun_chunks)
        if sent_chunks and seen_chunks:
            overlap = max(
                len(sent_chunks & prior) / max(len(sent_chunks), 1)
                for prior in seen_chunks
            )
            if overlap > 0.7:
                continue
        cleaned = FILLER_RE.sub("", sent.text)
        out_sentences.append(cleaned)
        if sent_chunks:
            seen_chunks.append(sent_chunks)
    return " ".join(out_sentences)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", nargs="?", default="-")
    args = ap.parse_args()
    text = sys.stdin.read() if args.input == "-" else open(args.input).read()
    sys.stdout.write(preprocess(text))

if __name__ == "__main__":
    main()
```

```bash
chmod +x /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/nlp-preprocess.py
```

### 7.3 Create Signal-format script

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/signal-format.sh`

```bash
#!/usr/bin/env bash
# Apply Eridani Signal notation to MACHINE sections of a state file.
# Operates on lines between markers <!-- signal-begin --> and <!-- signal-end -->.
# Outside markers: untouched.
# Inside markers: "X is Y" -> "X = Y"; "X causes Y" -> "X -> Y"; etc.
set -u
INPUT="${1:?usage: $0 <input-file>}"
awk '
  /<!-- signal-begin -->/ { in_signal=1; print; next }
  /<!-- signal-end -->/   { in_signal=0; print; next }
  in_signal {
    gsub(/ is /, " = "); gsub(/ are /, " = ")
    gsub(/ causes /, " -> ")
    gsub(/ leads to /, " -> ")
    gsub(/ results in /, " -> ")
  }
  { print }
' "$INPUT"
```

```bash
chmod +x /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/signal-format.sh
```

### 7.4 Wire into JICM prep script

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Locate the section where the LLM-enriched checkpoint is constructed (Tier 2, ~mid-script). Insert NLP preprocessing immediately before the Ollama call so the LLM works on cleaner input:

```bash
# Inside jicm-prep-context.sh, just before the qwen3:8b enrichment call:
PREPROCESSED=$(/Users/nathanielcannon/Claude/Jarvis/infrastructure/.venv/bin/python3 \
  /Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/nlp-preprocess.py \
  <<< "$RAW_CHECKPOINT_DATA")

# Then feed $PREPROCESSED (not $RAW_CHECKPOINT_DATA) to the LLM call.
```

After LLM enrichment writes the final checkpoint file, apply `signal-format.sh` to compress notation in machine-consumed sections (mark them in the LLM-output template with `<!-- signal-begin -->` / `<!-- signal-end -->`):

```bash
/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts/signal-format.sh \
  /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compressed-context-ready.md \
  > /tmp/signal-applied.md
mv /tmp/signal-applied.md /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compressed-context-ready.md
```

### 7.5 5-cycle resume validation

For each of 5 JICM cycles (manual triggering, observed):

| Step | Action | Pass criterion |
|---|---|---|
| 1 | Trigger `/jicm` near a stable state | `.compressed-context-ready.md` produced |
| 2 | Capture checkpoint size in tokens | Recorded |
| 3 | `/clear` | New session begins |
| 4 | Verify Jarvis resumes correct active task | No "what task?" / no incorrect task assertion |
| 5 | Compare checkpoint size to pre-Phase-3 baseline | ≤60% baseline |

Pass criterion: 5/5 cycles complete with correct task resumption; mean checkpoint size ≤60% of baseline.

### 7.6 Rollback

Comment out the preprocessing line in `jicm-prep-context.sh`; the LLM enrichment continues to work on raw input. Signal-format is purely additive; disable by removing the `signal-format.sh` invocation.

---

## §8 Phase 4 — Pipeline Compression Mode + 1-Hour Cache TTL

**Goal**: end-to-end compression in the Alfred-Dev pipeline with telemetry capture and 1-hour cache TTL on `claude -p` calls (or, more cleanly, Anthropic SDK direct calls).

### 8.1 Add COMPRESSION_MODE env var

**File**: `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/executor.py`

```python
import os

COMPRESSION_MODE = os.environ.get("COMPRESSION_MODE", "brief")  # none | brief | cod | both

def build_prompt(task, persona):
    prompt = base_prompt(task, persona)
    if COMPRESSION_MODE in ("brief", "both"):
        prompt += "\n\nBe brief."
    if COMPRESSION_MODE in ("cod", "both") and is_reasoning_task(task):
        prompt += "\n\nThink step by step, but only keep a minimum draft for each thinking step, with 5 words at most."
    return prompt

def is_reasoning_task(task):
    """True for tasks where CoD applies; False for arithmetic, code-gen, creative."""
    task_type = (task.get("metadata") or {}).get("task_type", "")
    return task_type in ("code_review", "bug_diagnosis", "planning", "research", "analysis")
```

### 8.2 Telemetry capture into Pulse metadata

**File**: `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/_shared.py`

```python
def capture_telemetry(response, mode):
    """Extract token usage from Anthropic response and return metadata dict."""
    usage = response.get("usage", {}) if isinstance(response, dict) else getattr(response, "usage", {}).__dict__ if hasattr(response, "usage") else {}
    cache_creation = usage.get("cache_creation", {}) or {}
    return {
        "compression_mode": mode,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        "ephemeral_5m_input_tokens": cache_creation.get("ephemeral_5m_input_tokens", 0) if isinstance(cache_creation, dict) else 0,
        "ephemeral_1h_input_tokens": cache_creation.get("ephemeral_1h_input_tokens", 0) if isinstance(cache_creation, dict) else 0,
    }
```

In `executor.py` after the model call:

```python
task["metadata"]["telemetry"] = capture_telemetry(response, COMPRESSION_MODE)
pulse_update(task_id, metadata=task["metadata"])
```

### 8.3 Enable 1-hour cache TTL

The trickiest part. `claude -p` does not expose `cache_control`; the executor must call the Anthropic SDK directly to use `ttl: "1h"`.

**Option A** — call Anthropic SDK directly (recommended for Alfred-Dev pipeline):

```python
import anthropic

client = anthropic.Anthropic()  # picks up ANTHROPIC_API_KEY from env

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    system=[
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral", "ttl": "1h"},
        }
    ],
    messages=[{"role": "user", "content": task_prompt}],
)
telemetry = capture_telemetry(response.model_dump(), COMPRESSION_MODE)
```

The `cache_control` block can mark up to 4 cache breakpoints per request. For Jarvis's force-loaded prefix this is a single breakpoint at the end of the system prompt.

**Option B** — keep `claude -p` and accept default 5-minute TTL. Less pipeline win, but no executor-rewrite work.

Recommendation: Option A. The pipeline's four services (evaluator, stager, executor, reviewer) all call the same model with the same system prompt; cache hits across services easily exceed the 0.83 reads-per-write break-even for the 1h tier.

### 8.4 Test protocol

```bash
cd /Users/nathanielcannon/Claude/Alfred-Dev
COMPRESSION_MODE=both python3 -m pytest .claude/jobs/tests/test_pipeline_v2.py -k gospel -v

# Verify telemetry was captured:
sqlite3 .claude/jobs/state/jobs.db \
  "SELECT id, json_extract(metadata, '\$.telemetry') FROM tasks WHERE project='gospel-synopsis' ORDER BY created_at DESC LIMIT 5"
```

Pass criterion: telemetry rows present; `ephemeral_1h_input_tokens > 0` on ≥50% of subsequent calls (cache warmup); total tokens ≤75% of baseline.

### 8.5 Rollback

```bash
unset COMPRESSION_MODE
# or:
export COMPRESSION_MODE=none
```

For SDK-direct migration rollback: revert the executor.py change that swapped `claude -p` for SDK calls.

---

## §9 Phase 5 — Dashboard Wiring

**Goal**: surface compression telemetry in the Alfred-Dev dashboard at a new `/token-compression` route.

### 9.1 Backend route

**File**: `/Users/nathanielcannon/Claude/Alfred-Dev/dashboard/server/routes/compression.ts` (new)

```typescript
import { Router } from 'express';
import { getCompressionStats, getCompressionPerTask } from '../services/compression';

const router = Router();

router.get('/api/compression/stats', async (req, res) => {
  const window = (req.query.window as string) || '7d';
  const stats = await getCompressionStats(window);
  res.json(stats);
});

router.get('/api/compression/per-task', async (req, res) => {
  const limit = parseInt((req.query.limit as string) || '50');
  const tasks = await getCompressionPerTask(limit);
  res.json(tasks);
});

export default router;
```

Wire in `dashboard/server/index.ts`:

```typescript
import compressionRouter from './routes/compression';
app.use(compressionRouter);
```

### 9.2 Aggregation service

**File**: `/Users/nathanielcannon/Claude/Alfred-Dev/dashboard/server/services/compression.ts` (new)

```typescript
import { db } from './db';

export async function getCompressionStats(window: string) {
  const days = parseInt(window.replace('d', '')) || 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const rows = await db.all(
    `SELECT
       json_extract(metadata, '$.telemetry.compression_mode') AS mode,
       AVG(json_extract(metadata, '$.telemetry.input_tokens'))                AS avg_input,
       AVG(json_extract(metadata, '$.telemetry.output_tokens'))               AS avg_output,
       AVG(json_extract(metadata, '$.telemetry.cache_read_input_tokens'))     AS avg_cache_read,
       AVG(json_extract(metadata, '$.telemetry.ephemeral_1h_input_tokens'))   AS avg_eph_1h,
       COUNT(*) AS n
     FROM tasks
     WHERE created_at > ?
       AND json_extract(metadata, '$.telemetry') IS NOT NULL
     GROUP BY mode`,
    cutoff
  );

  return { window, by_mode: rows };
}

export async function getCompressionPerTask(limit: number) {
  return db.all(
    `SELECT id, project, persona,
            json_extract(metadata, '$.telemetry') AS telemetry,
            created_at
     FROM tasks
     WHERE json_extract(metadata, '$.telemetry') IS NOT NULL
     ORDER BY created_at DESC
     LIMIT ?`,
    limit
  );
}
```

### 9.3 Frontend page

**File**: `/Users/nathanielcannon/Claude/Alfred-Dev/dashboard/frontend/src/pages/TokenCompressionPage.tsx` (new)

```tsx
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from '../components/StatCard';

const BASELINE_AVG_INPUT = 636; // anchor from cc-compression-bench; revise once we have local baseline

export function TokenCompressionPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/compression/stats?window=7d').then(r => r.json()).then(setStats);
  }, []);

  if (!stats) return <div>Loading…</div>;

  const tasksCompressed = stats.by_mode.reduce((a: number, r: any) => a + r.n, 0);
  const tokensSaved = stats.by_mode
    .filter((r: any) => r.mode && r.mode !== 'none')
    .reduce((a: number, r: any) => a + Math.max(0, BASELINE_AVG_INPUT - r.avg_input) * r.n, 0);

  const eph1h = stats.by_mode[0]?.avg_eph_1h || 0;
  const inp = stats.by_mode[0]?.avg_input || 1;
  const oneHourAdoption = Math.round((eph1h / inp) * 100);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Token Compression</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Tokens saved (7d)" value={Math.round(tokensSaved).toLocaleString()} />
        <StatCard label="Tasks compressed (7d)" value={tasksCompressed} />
        <StatCard label="1h-TTL adoption" value={`${oneHourAdoption}%`} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">By compression mode</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats.by_mode}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mode" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="avg_output" fill="#8884d8" name="Avg output tokens" />
            <Bar dataKey="avg_input"  fill="#82ca9d" name="Avg input tokens"  />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* 7-day trend line, per-task drill-down: deferred until base shape proven */}
    </div>
  );
}
```

### 9.4 Wire into router and nav

```typescript
// dashboard/frontend/src/router.tsx
import { TokenCompressionPage } from './pages/TokenCompressionPage';
// ...
{ path: '/token-compression', element: <TokenCompressionPage /> },
```

Add a sidebar entry pointing to `/token-compression`.

### 9.5 Test

```bash
cd /Users/nathanielcannon/Claude/Alfred-Dev/dashboard
docker build -t aifred-dashboard:dev .
docker stop aifred-dev-dashboard
docker rm aifred-dev-dashboard
# Full docker run command lives in scratchpad / Session 57 notes;
# port 8701 inside aifred-dev-network with PULSE_API_URL pointing at dev pulse.
```

Visit `http://localhost:8701/token-compression`; verify cards populate after ≥10 pipeline runs with telemetry captured.

### 9.6 Rollback

```bash
git -C /Users/nathanielcannon/Claude/Alfred-Dev revert <hash>
git -C /Users/nathanielcannon/Claude/Alfred-Dev push origin nate-dev
# then redeploy dashboard
```

---

## §10 Verification Matrix

A single table consolidating per-phase pass criteria and regression alarms.

| Phase | Test command | Pass criterion | Regression alarm |
|---|---|---|---|
| 0 | `cache-telemetry-aggregate.sh latest.csv` | Hit rate ≥60% across baseline sessions | Hit rate <40% |
| 1.1 | 3 sessions + extractor | Median output_tokens −20-34%; persona spot-check clean | Hit rate drops >10pp |
| 1.5 | 3 Alfred-Dev sessions + extractor | Same as 1.1; "Master Nathaniel" appears <10% of replies; valediction at end of action replies | Same as 1.1, plus persona drift |
| 1.2-1.4 | gospel-synopsis pipeline | All tasks score ≥0.97; output_tokens −20-34% | Score drops >2pp |
| 2 | 5 reasoning tasks before/after CoD | Thinking_tokens −50%; quality ≥0.95 | Thinking flat or quality <0.90 |
| 3 | 5 JICM cycles | Checkpoint ≤60% baseline; 5/5 correct resume | Any "what task?" / wrong-task resume |
| 4 | gospel-synopsis with COMPRESSION_MODE=both | Total tokens ≤75% baseline; eph_1h>0 in ≥50% calls | eph_1h=0 throughout |
| 5 | Dashboard at `/token-compression` | Cards populate after 10 pipeline runs | Empty cards despite active runs |

---

## §11 Rollback Procedures (consolidated)

| Phase | Rollback |
|---|---|
| 0 | None — measurement only |
| 1.1 | `git -C /Users/nathanielcannon/Claude/Jarvis revert <hash>` |
| 1.5 | `git -C /Users/nathanielcannon/Claude/Alfred-Dev revert <hash>; git push origin nate-dev` |
| 1.2-1.4 | `git revert <hash>` on Alfred-Dev; push |
| 2 | Remove CoD block from system prompts; `--no-cod` flag for opt-in scripts |
| 3 | Comment out preprocessing line in `jicm-prep-context.sh`; remove signal-format invocation |
| 4 | `export COMPRESSION_MODE=none`, or revert SDK-direct migration |
| 5 | `git revert <hash>` on dashboard; remove route from frontend router; redeploy |

---

## §12 Telemetry & Observability

### 12.1 What is captured

| Source | Fields | Storage |
|---|---|---|
| Claude Code session JSONL | `usage.*` per turn (input, output, cache_read, ephemeral_5m, ephemeral_1h) | `~/.claude/projects/*.jsonl` (local only) |
| Pulse task metadata | `telemetry.compression_mode` + token fields | `jobs.db` SQLite |
| JICM state | `original_tokens`, `compressed_tokens`, `ratio`, `time_ms` | `.claude/context/.jicm-last-compression.json` |
| Dashboard aggregates | per-mode averages, 1h-adoption, totals | computed on read from `jobs.db` |

### 12.2 Where to look

- Live cache hit rate — `/token-compression` dashboard page (Phase 5)
- Per-task telemetry — extend the existing TaskDetail view to surface telemetry block
- Historical — `cache-telemetry-aggregate.sh` against monthly CSV exports
- JICM checkpoint sizes — `.claude/context/.jicm-last-compression.json` (most recent only; archive manually if longitudinal study desired)

### 12.3 Retention

- Pulse task metadata — indefinite (until task DB rotation)
- Session JSONL — per Claude Code retention (default ~90 days)
- Compression CSV exports — manual; recommend monthly rotation into `.claude/metrics/token-compression/archive/`

### 12.4 Alerting

Out of scope for v1. A Phase-6 candidate if sustained operations require active monitoring (e.g., webhook on hit-rate regression). Until then, dashboard inspection on demand suffices.

---

## Appendix A — File creation checklist

| Phase | Action | File |
|---|---|---|
| 0 | CREATE | `.claude/skills/token-compression/scripts/cache-telemetry-extractor.py` |
| 0 | CREATE | `.claude/skills/token-compression/scripts/cache-telemetry-aggregate.sh` |
| 1.1 | MODIFY | `/Users/nathanielcannon/Claude/Jarvis/CLAUDE.md` |
| 1.5 | MODIFY | `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/CLAUDE.md` |
| 1.2 | MODIFY | `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/executor.py` |
| 1.3 | MODIFY | `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/reviewer.py` |
| 2 | VERIFY | `.claude/skills/token-compression/templates/chain-of-draft.txt` |
| 2 | CONDITIONAL CREATE | `.claude/skills/token-compression/prompts/cod-examples/{code-review,bug-diagnosis,planning,research,session-mgmt}.md` |
| 3 | CREATE | `.claude/skills/token-compression/scripts/nlp-preprocess.py` |
| 3 | CREATE | `.claude/skills/token-compression/scripts/signal-format.sh` |
| 3 | MODIFY | `.claude/scripts/jicm-prep-context.sh` |
| 4 | MODIFY | `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/executor.py` |
| 4 | MODIFY | `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/jobs/services/_shared.py` |
| 4 | POSSIBLY MIGRATE | `claude -p` calls → Anthropic SDK direct (for `cache_control`) |
| 5 | CREATE | `dashboard/server/routes/compression.ts` |
| 5 | CREATE | `dashboard/server/services/compression.ts` |
| 5 | CREATE | `dashboard/frontend/src/pages/TokenCompressionPage.tsx` |
| 5 | MODIFY | `dashboard/server/index.ts` (route wiring) |
| 5 | MODIFY | `dashboard/frontend/src/router.tsx` (page wiring) |
| 5 | MODIFY | dashboard sidebar nav component |

---

## Appendix B — Cross-reference index (roadmap ↔ guide)

| Concept | Roadmap § | Implementation § |
|---|---|---|
| Multi-pass architecture | §2.4 | §3, §4, §5, §7, §8 (per pass) |
| Jeeves-Brief verbatim | §2.3 | §3.2 |
| Alfred-Brief verbatim | §2.3 | §4.2 |
| 1-hour cache TTL | §3.0.1 | §8.3 |
| Stacking rules (mechanism) | §4.7 | §10 (verification matrix anchored to non-conflict assumptions) |
| Decision tree (when to apply) | §4.6 | §6.5 (CoD skip rule) |
| Source-grounded benchmark numbers | §4.1-4.3 | §10 (pass criteria use them as anchors) |
| Evaluation framework | §1.1 | §10 (criterion translation into per-phase tests) |

---

## Appendix C — One-screen quick start (for the next session)

If you have one session and want maximum impact, do this:

1. `Phase 0.2` — create cache-telemetry-extractor.py, run on past month of sessions, capture baseline hit rate
2. `Phase 1.1` — apply Jeeves-Brief edit to Jarvis CLAUDE.md, commit
3. `Phase 1.5` — apply Alfred-Brief edit to Alfred-Dev CLAUDE.md, commit, push to nate-dev
4. Run `cache-telemetry-aggregate.sh` against the post-deploy session(s)
5. Compare medians; if within ±5pp of baseline hit rate and output_tokens dropped 20%+: proceed to Phase 1.2-1.4 next session
6. If hit rate dropped >10pp: investigate cache-prefix change before further phases

This buys 25-30% of the projected total gain in a single session of work.

---

*Token Compression Implementation Guide v1 — Tactical Playbook — Jarvis / Project Aion*
*Companion to roadmap v3 (commit `c95a334`).*
*Generated 2026-04-30 by Jarvis (Master Archon).*
