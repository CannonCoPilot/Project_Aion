#!/usr/bin/env python3
"""
graphiti-auto-ingest.py — L5 Autonomic Episode Ingestion (Phase 2C)

After each JICM compression cycle, ingest the checkpoint as a Graphiti episode
for entity/relationship extraction into the knowledge graph. Mirrors
jicm-auto-ingest.py's role for L4 (RAG), but targets L5 (Graphiti/Neo4j).

Called by: jicm-watcher.sh (step 5.9, async background)
          REST stage R2 (same interface)
Requires: Neo4j (bolt://localhost:7687) + LiteLLM (localhost:4000) + Ollama embeddings
Venv: infrastructure/.venv/bin/python (graphiti-core)

Memory System role:
  Layer: L5 (Long-Term Procedural)
  Process: Store (L3 checkpoint → L5 knowledge graph)
"""
import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "infrastructure" / "rag-service"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from aion_credentials import require_credential  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

PROJECT_DIR = os.environ.get("PROJECT_DIR", os.environ.get("CLAUDE_PROJECT_DIR", str(Path.home() / "Claude" / "Jarvis")))
CHECKPOINT_FILE = os.environ.get("JICM_COMPRESSED_FILE", f"{PROJECT_DIR}/.claude/context/.compressed-context-ready.md")
LOG_FILE = os.path.join(PROJECT_DIR, ".claude/logs/graphiti-auto-ingest.log")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
# Resolved from credentials.yaml (gitignored), never hardcoded. The literal that
# used to sit here was a live password in a PUBLIC repo AND the only reason the
# nightly ingest authenticated, since jicm-watcher.sh exports no NEO4J_* vars.
NEO4J_PASSWORD = require_credential("NEO4J_PASSWORD", ".database.neo4j.password")
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3-8b-nothink")
EMBED_MODEL = os.getenv("EMBED_MODEL", "qwen3-embedding:4b")
EMBED_DIM = int(os.getenv("EMBEDDING_DIM", "2560"))
# Per-Archon L5 namespace. Was hardcoded "jarvis-core", which meant a Genie checkpoint
# would have written its microbiology entities into Jarvis's graph with no way to opt out
# — while the RAG sibling (jicm-auto-ingest.py, JICM_RAG_COLLECTION) had been
# env-parameterized all along. Closing that asymmetry. Genie's launcher exports
# GRAPHITI_GROUP_ID=genie-core; every other lane keeps the historical default.
GROUP_ID = os.getenv("GRAPHITI_GROUP_ID", "jarvis-core")

# Per-episode size. A MEASURED value, not a preference. Do not raise it.
#
# THE FAILURE IS DRIVEN BY OUTPUT SIZE, AND INPUT SIZE ONLY CORRELATES WITH IT.
# qwen3:8b's entity extraction returns truncated JSON (`Unterminated string ...`) once its
# response grows past roughly 40-50K chars. Production's three lost nights broke at 42,688
# / 47,953 / 49,455 output chars; a 16K-input probe broke at 45,304.
#
# Size alone does NOT predict it, so do not treat any input length as "safe":
#     chunk of 7,977 chars -> 47.9s, fine
#     chunk of 7,302 chars -> ~51K of output, malformed, retried, blew its 840s bound
# The second was the raw-conversation chunk: dense with paths, commands and identifiers,
# so it yields far more entities per char. DENSITY, not length, is what fills the response.
#
# 4000 is chosen because the exact chunk that failed at 7,302 chars SUCCEEDED when split
# into 2 x 3,651 — both halves clean, zero cliff errors, 166s + 130s instead of a timeout.
# Halving the input roughly halves the extraction output, which is the lever that works.
#
# Entity yield per char does not fall at smaller sizes (the 3,651-char dense half alone
# produced 62 entities), so this costs chunks, not recall.
CHUNK_CHARS = int(os.getenv("GRAPHITI_CHUNK_CHARS", "4000"))

# Ceiling on chunks per checkpoint. A safeguard against a pathological checkpoint, NOT a
# budget: hitting it ALERTS and leaves the remainder explicitly uningested rather than
# quietly accepting a partial result. At 4000 chars the largest real checkpoint (jaques,
# 25,244) plans ~7 chunks, so 12 leaves headroom without being unbounded.
MAX_CHUNKS = int(os.getenv("GRAPHITI_MAX_CHUNKS", "12"))

# Sections that are raw bulk rather than distilled signal. They are still ingested — just
# LAST, so that if the run is killed partway the distilled content is already in the graph.
# Measured: 'Recent Conversation' is 71% of the jaques checkpoint but only 4% of protos,
# so ordering alone does not solve this; it is what makes partial failure degrade sanely.
LOW_VALUE_PREFIXES = ("Recent Conversation", "Raw Session Data", "Git State")

# Hard bound on the whole ingest. This script had NO timeout of any kind, and on
# 2026-08-12 it hung a JICM lane: it accumulated 4.8s of CPU across 16 minutes elapsed
# and sat at 0.0% — blocked on a network read — while Neo4j, LiteLLM and Ollama were all
# reachable, so the stall was inside the client, not the services.
#
# Deliberately set BELOW jicm-actuate.sh's external _bounded backstop (900s) so this
# timeout wins the race. Both would stop the hang, but only this one can say what it was
# doing; an external SIGTERM leaves no diagnosis. Slow is not the same as stuck — a
# legitimate add_episode was measured at 347s in the watcher log — so the bound is
# generous enough not to punish a merely slow graph write.
INGEST_TIMEOUT_SEC = float(os.getenv("GRAPHITI_INGEST_TIMEOUT", "840"))


def split_sections(text: str):
    """[(heading, body_including_heading)]; text before the first `## ` is its own part."""
    marks = [(m.start(), m.group(1)) for m in re.finditer(r"^## (.+)$", text, re.M)]
    if not marks:
        return [("<preamble>", text)] if text.strip() else []
    out = []
    if marks[0][0] > 0 and text[:marks[0][0]].strip():
        out.append(("<preamble>", text[:marks[0][0]]))
    for i, (start, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out.append((name, text[start:end]))
    return out


def _hard_split(body: str, budget: int):
    """Split an oversized single section on paragraph, then line, then char boundaries."""
    parts, buf = [], ""
    for para in body.split("\n\n"):
        piece = para if not buf else buf + "\n\n" + para
        if len(piece) <= budget:
            buf = piece
            continue
        if buf:
            parts.append(buf)
            buf = ""
        while len(para) > budget:
            cut = para.rfind("\n", 0, budget)
            if cut <= 0:
                cut = budget
            parts.append(para[:cut])
            para = para[cut:].lstrip("\n")
        buf = para
    if buf:
        parts.append(buf)
    return [p for p in parts if p.strip()]


def plan_chunks(text: str, budget: int = 0):
    """Split a checkpoint into <=budget chunks, distilled sections first.

    Replaces `content[:8000]`, which silently discarded 43-68% of every checkpoint.
    Invariant: every non-whitespace character lands in exactly one chunk. Verified by a
    multiset comparison in the test harness — NOT by comparing concatenations, because
    this deliberately reorders sections and an ordered comparison would test the
    reordering rather than the loss.
    """
    budget = budget or CHUNK_CHARS
    secs = split_sections(text)
    hi = [s for s in secs if not s[0].startswith(LOW_VALUE_PREFIXES)]
    lo = [s for s in secs if s[0].startswith(LOW_VALUE_PREFIXES)]

    chunks, buf = [], ""
    for _, body in hi + lo:
        if len(body) > budget:
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.extend(_hard_split(body, budget))
            continue
        piece = body if not buf else buf + body
        if len(piece) <= budget:
            buf = piece
        else:
            chunks.append(buf)
            buf = body
    if buf.strip():
        chunks.append(buf)
    return [c for c in chunks if c.strip()]


def log_to_file(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(f"{ts} | {msg}\n")


async def init_graphiti():
    from graphiti_core import Graphiti
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.cross_encoder.client import CrossEncoderClient
    from ollama_nothink_client import OllamaNoThinkClient

    class NoOpCrossEncoder(CrossEncoderClient):
        async def rank(self, query: str, passages: list[str]) -> list[tuple[str, float]]:
            return [(p, 1.0) for p in passages]

    llm_config = LLMConfig(api_key="not-needed", base_url=LITELLM_BASE_URL, model=LLM_MODEL)
    llm_client = OllamaNoThinkClient(config=llm_config)

    embedder_config = OpenAIEmbedderConfig(
        api_key="not-needed", base_url=OLLAMA_BASE_URL,
        embedding_model=EMBED_MODEL, embedding_dim=EMBED_DIM,
    )
    embedder = OpenAIEmbedder(config=embedder_config)

    return Graphiti(
        uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD,
        llm_client=llm_client, embedder=embedder, cross_encoder=NoOpCrossEncoder(),
    )


async def ingest_episode(content: str, name: str, source: str):
    from graphiti_core.nodes import EpisodeType

    graphiti = await init_graphiti()
    start = time.time()

    result = await graphiti.add_episode(
        name=name,
        episode_body=content,
        source_description=source,
        reference_time=datetime.now(timezone.utc),
        source=EpisodeType.text,
        group_id=GROUP_ID,
    )

    elapsed = time.time() - start
    entities = len(result.nodes)
    edges = len(result.edges)
    return entities, edges, elapsed


async def main():
    if not os.path.isfile(CHECKPOINT_FILE):
        log_to_file(f"SKIP: checkpoint not found: {CHECKPOINT_FILE}")
        return

    content = Path(CHECKPOINT_FILE).read_text(encoding="utf-8", errors="replace").strip()
    if not content:
        log_to_file("SKIP: checkpoint empty")
        return

    # This used to be `content[:8000]`, which silently discarded the TAIL of every
    # oversized checkpoint — 43% of dev, 58% of genie, 68% of jaques, EVERY cycle.
    #
    # What made it worse than a size cap: the cut landed mid-'Recent Conversation', so it
    # kept 5,481 chars of RAW TRANSCRIPT and dropped the entire distilled Session History
    # Digest behind it. We were discarding the summary to preserve the chat log.
    #
    # Now the checkpoint is SPLIT, distilled sections first, and every chunk is ingested.
    # Nothing is dropped without an ALERT. See CHUNK_CHARS for why the per-chunk size is a
    # measured ceiling rather than a tunable.
    original_chars = len(content)
    chunks = plan_chunks(content)

    dropped_chunks = []
    if len(chunks) > MAX_CHUNKS:
        dropped_chunks = chunks[MAX_CHUNKS:]
        chunks = chunks[:MAX_CHUNKS]
        dropped_chars = sum(len(c) for c in dropped_chunks)
        msg = (
            f"ALERT L5 checkpoint EXCEEDS the chunk ceiling: {original_chars} chars needed "
            f"{len(chunks) + len(dropped_chunks)} chunks, ingesting {MAX_CHUNKS}, LEAVING "
            f"{dropped_chars} chars ({dropped_chars * 100 // original_chars}%) OUT of the graph "
            f"from {Path(CHECKPOINT_FILE).name}. Nothing will retry it. NEEDS A HUMAN: this is a "
            f"safeguard firing, not an acceptable outcome — either the checkpoint generator is "
            f"emitting far more than expected, or MAX_CHUNKS needs revisiting against the "
            f"per-chunk cost (median 504s against jarvis-core)."
        )
        print(msg, file=sys.stderr, flush=True)
        log_to_file(msg)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    source = f"jicm-compression-cycle — {Path(CHECKPOINT_FILE).name}"

    started = time.time()
    entities = edges = 0
    ok_chunks, failed = 0, []

    for i, chunk in enumerate(chunks, 1):
        part = f" (part {i}/{len(chunks)})" if len(chunks) > 1 else ""
        name = f"JICM cycle {stamp}{part}"
        try:
            # The bound is PER CHUNK. It is a hang-detector, not a work budget: nothing
            # waits on this process (jicm-watcher launches it as a detached `( ... ) &`
            # and never calls wait), so a slow run costs nothing but its own time.
            e, g, elapsed = await asyncio.wait_for(
                ingest_episode(chunk, name, source), timeout=INGEST_TIMEOUT_SEC
            )
            entities += e
            edges += g
            ok_chunks += 1
            log_to_file(f"INGESTED{part}: {e} entities, {g} edges in {elapsed:.1f}s "
                        f"({len(chunk)} chars)")
        except asyncio.TimeoutError:
            failed.append({"part": i, "chars": len(chunk), "error": "timeout"})
            log_to_file(
                f"ALERT: TIMEOUT on chunk {i}/{len(chunks)} after {INGEST_TIMEOUT_SEC:.0f}s — "
                f"{len(chunk)} chars NOT ingested. Blocked inside the client, not the services: "
                f"check LiteLLM {LITELLM_BASE_URL}, embeddings {OLLAMA_BASE_URL}, Neo4j {NEO4J_URI}. "
                f"Repeated timeouts = a degraded backend, NOT a reason to raise this limit."
            )
        except Exception as e:                                  # noqa: BLE001
            # One bad chunk must not cost the whole checkpoint. Entity extraction returns
            # malformed JSON near a size cliff (observed at 16K input / ~45K output), and
            # before chunking that single failure lost the entire night's ingest.
            failed.append({"part": i, "chars": len(chunk), "error": str(e)[:200]})
            log_to_file(f"ALERT: chunk {i}/{len(chunks)} FAILED ({len(chunk)} chars): {str(e)[:200]}")

    if failed:
        lost = sum(f["chars"] for f in failed)
        msg = (
            f"ALERT L5 ingest INCOMPLETE: {ok_chunks}/{len(chunks)} chunks ingested, "
            f"{len(failed)} failed, {lost} chars ({lost * 100 // max(original_chars, 1)}%) "
            f"missing from the graph for {Path(CHECKPOINT_FILE).name}. Nothing retries this."
        )
        print(msg, file=sys.stderr, flush=True)
        log_to_file(msg)

    ingested_chars = sum(len(c) for c in chunks) - sum(f["chars"] for f in failed)
    metadata = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entities": entities,
        "edges": edges,
        "elapsed_seconds": round(time.time() - started, 2),
        # Record what was on disk NEXT TO what actually landed. Reporting only the
        # post-truncation size is what made the old loss invisible to every reader.
        "checkpoint_chars_original": original_chars,
        "chars_ingested": ingested_chars,
        "chunks_planned": len(chunks) + len(dropped_chunks),
        "chunks_ingested": ok_chunks,
        "chunks_failed": failed,
        "chunks_over_ceiling": len(dropped_chunks),
        "complete": not failed and not dropped_chunks,
        "group_id": GROUP_ID,
    }
    meta_file = os.path.join(PROJECT_DIR, ".claude/context/.graphiti-last-ingest.json")
    with open(meta_file, "w") as f:
        json.dump(metadata, f, indent=2)

    # Non-zero exit so _ingest_outcome in jicm-watcher.sh reports a bad run rather than
    # logging OK for a partial ingest.
    if not ok_chunks and chunks:
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        log_to_file(f"FATAL: {e}")
        sys.exit(1)
