# Loom as a Semantic Mesh — Design Analysis

**Status**: Design / analysis only. No implementation.
**Created**: 2026-08-27
**Author**: W11 Jarvis-dev
**Subject**: Sir's proposal to develop Loom into an adaptive context-enrichment layer
**Supersedes nothing.** Extends the five existing Loom docs in
`alfred/.claude/context/systems/` (`loom-integration-design.md`,
`loom-capture-points.md`, `loom-curation-pipeline.md`, `loom-quality-signals.md`,
`loom-training-schema.md`, all 2026-03-29). Those describe a *training-capture*
pipeline against an earlier Loom. This describes a *retrieval-injection* layer
against the current gateway. They are complementary, not competing.

---

## 1. The proposal, restated

> Prompts pass through Loom, which "picks up" semantically related information
> from local RAG (project history, related documents, guidelines, design
> patterns), enhances the prompt in real time, caches the enhanced prompt, and
> sends *that* upstream in place of what was typed at the CLI.
>
> Intended as an adaptive, responsive, logged, transparent counterpart to the
> static and somewhat obscured `CLAUDE.md` auto-load mechanism.

**Does it make sense? Yes — the diagnosis is correct and the mechanism is real.**
But the implementation as literally described (gateway rewrites the prompt) is
the wrong half of the system. The reasoning is in §4–§6.

---

## 2. The problem is real and quantifiable

Measured on this workspace, 2026-08-27:

| Tier | Size | Tokens | Loaded |
|---|---:|---:|---|
| `CLAUDE.md` (project) | 9,821 B | | always |
| `.claude/personas/jarvis/CLAUDE.md` | 10,796 B | | always |
| `MEMORY.md` | 17,918 B | | always |
| `session-state.md` | 4,242 B | | always |
| **Always-resident total** | **42,777 B** | **~11,257** | **unconditional** |
| `.claude/context/**/*.md` | **6,412,558 B** (409 files) | ~1.7M | **never, unless grepped** |

**Static memory surfaces ~0.67% of the available corpus, and the selection is
fixed in advance.** That is the actual defect. It is not primarily a token-cost
problem — 11K tokens is 1.1% of a 1M window — it is a *relevance* problem.

### The proof case is this session

The five Loom design documents (82 KB, directly relevant to the Loom evaluation
task) were **not** surfaced by any memory tier. They were found by accident,
via a `grep` run for an unrelated reason. A semantic layer keyed on the token
"Loom" would have surfaced them in the first second of the task.

That is the failure mode in one sentence: **institutional knowledge exists,
is indexed nowhere the model reads, and surfaces only by luck.**

---

## 3. What already exists in Aion

The proposal is not new to this workspace — a primitive version is already wired.

**`.claude/hooks/relevance-retrieval.js`** — a `UserPromptSubmit` hook,
described in its own header as *"the rattlesnake reflex for memory recall"*:

- Keyword **regex** → file map (`PATTERN_TRIGGERS`), statically defined
- Max **800 characters** injected, max **1 injection per prompt**
- **No network calls** ("latency budget: <500ms, file reads only")
- Session-tracked to prevent re-injection

It is the right idea implemented as a lookup table. 800 chars is **0.012%** of
the corpus per prompt. There is no embedding, no ranking, no semantic match.

Also present and relevant:

| Component | Role | Latency |
|---|---|---|
| Qdrant (`jarvis-rag`) | L4 semantic, 4 collections, 2560-dim Qwen3 | ~2–3 s |
| Graphiti / Neo4j | L5 structural, `group_id` jarvis-core | ~20–30 s |
| MLX embed server `:8000` | Qwen3-Embedding-4B | — |
| `context-health-monitor.js` | 6-layer survey → `additionalContext` | <200 ms |
| JICM | session-level compression / checkpointing | — |
| LiteLLM `:4000` | model gateway | — |
| Usage proxy `:9800` | cost telemetry (`ANTHROPIC_BASE_URL`) | — |

**So the missing piece is not infrastructure. It is the ranking-and-injection
layer that connects L4/L5 to the prompt, with a budget and an audit trail.**

---

## 4. The technical crux: prompt caching

This is what decides the architecture, and it is not a matter of taste.

### Mechanics (authoritative)

- Caching is a **prefix match**. Any byte change anywhere in the prefix
  invalidates everything after it.
- Render order is **`tools` → `system` → `messages`**.
- Cache **read ≈ 0.1×** base input price. Cache **write = 1.25×** (5-minute TTL)
  or **2×** (1-hour TTL).
- Max **4** `cache_control` breakpoints per request.
- Minimum cacheable prefix on Opus 5: **512 tokens**.
- Each breakpoint walks back at most **20 content blocks** to find a prior entry.

### The invalidation hierarchy — the load-bearing table

| Change | Tools cache | System cache | Messages cache |
|---|:--:|:--:|:--:|
| Tool definitions (add/remove/reorder) | ❌ | ❌ | ❌ |
| Model switch | ❌ | ❌ | ❌ |
| **System prompt content** | ✅ | ❌ | ❌ |
| Message content | ✅ | ✅ | ❌ |

Read that third row carefully. **Injecting retrieved context into the system
prompt invalidates the system cache and every message after it — on every
turn.** For Genie (234K tokens, 99% cache hit) or Jacques (335K, 99%), that
converts a 0.1× read into a 1.0×+ reprocess of the entire conversation, every
single turn. Roughly a **10× input-cost increase**, silently.

That is the single most expensive mistake available in this design space, and
the naive reading of "enhance the prompt" walks straight into it.

### The mechanism that makes it work

There is a purpose-built escape hatch, **available today on Opus 5, Opus 4.8,
Fable 5, and Mythos 5, with no beta header**:

> Append `{"role": "system", "content": "..."}` **to `messages[]`** instead of
> editing the top-level `system` field. The cached prefix stays intact.

Two properties matter here, and the second is easy to miss:

1. **Cache-preserving.** The instruction sits *after* the cached history, so
   nothing before it is invalidated.
2. **Prompt-injection-safe.** It is a non-spoofable operator channel. Text
   placed inside a *user* turn can be forged by anything that writes to
   user-visible input — and **retrieved documents are exactly that**. A
   semantic mesh injects third-party file content into the prompt; putting
   that content in a user turn means any retrieved file can impersonate the
   operator. The `role: "system"` channel is the correct carrier.

Constraints: must follow a user message; must be last in `messages` or be
followed by an assistant turn; cannot be `messages[0]`; text-only. Unsupported
models return 400 — catch and fall back to a `<system-reminder>` block.

---

## 5. Why gateway-side injection is the wrong half

Loom sits at the `/v1/messages` boundary. By the time a request reaches it,
Claude Code has already assembled everything: system prompt, `CLAUDE.md`
imports, tool definitions, full conversation history, and the new user turn.

**Claude Code owns the transcript; Loom does not.** That asymmetry produces
three consequences:

### 5.1 Injected tokens are written to cache and never read

- **Gateway injection**: Loom appends `inject_N`. It is written to cache at
  1.25×. Next turn, Claude Code sends history **without** `inject_N` (it never
  saw it), and Loom appends a *different* `inject_N+1`. The previous injection
  is never read back. **Every injected token pays a 1.25× write and yields a
  0× read, every turn, forever.** At 3K tokens of injection per turn that is
  ~3.75K token-equivalents of pure waste per turn.
- **Client injection** (hook `additionalContext`): the content enters Claude
  Code's own transcript, becomes part of the stable prefix, and is **read at
  0.1× on every subsequent turn**.

The same content costs roughly **12× more** delivered from the gateway than
delivered from the hook. This is arithmetic, not preference.

### 5.2 Transcript divergence

The model's replies reference context the client never recorded. JICM then
compresses a transcript with holes in it — checkpoints and scrollback summaries
describe reasoning whose inputs are absent. `/clear` → restore loses the
injections entirely while retaining conclusions drawn from them.

### 5.3 The 20-block lookback

Agentic loops already push many `tool_use`/`tool_result` blocks per turn. An
extra injected block per turn consumes lookback budget and can silently push a
breakpoint past the 20-block window, causing an unnoticed full miss.

### 5.4 Where the gateway *is* correct

**Single-shot calls have no conversation state to diverge from.** Nexus jobs,
cron dispatches, headless persona runs: one request, one response, no transcript
to keep consistent, and no next turn to read the cache. For those, gateway-side
injection is not just acceptable — it is the *only* place it can happen, since
they have no hook layer.

---

## 6. Recommended architecture — three tiers

The split follows directly from §4 and §5.

```
Tier A — STATIC INVARIANTS  (CLAUDE.md, always resident)
         identity · guardrails · form of address · filesystem policy
         Shrink toward invariants only. Target: <5K tokens.

Tier B — ADAPTIVE INJECTION  (UserPromptSubmit hook, client-side)
         The PRIMARY injection path for interactive Archon lanes.
         Cache-safe · transcript-honest · budgeted · logged.
         Extends relevance-retrieval.js from regex to semantic.

Tier C — LOOM AS RETRIEVAL SERVICE  (gateway + /v1/enrich)
         Owns embedding, RAG/Graphiti fan-out, ranking, caching, audit.
         Serves Tier B over HTTP. ALSO injects directly for single-shot
         Nexus callers that have no hook layer.
```

**The key inversion: Loom becomes the *service*, not always the *injector*.**
That is what lets one implementation serve both interactive lanes (where
injection must be client-side) and Nexus jobs (where it must be gateway-side).

### Request flow, interactive lane

```
User types prompt
   → UserPromptSubmit hook fires
   → hook POSTs {prompt, cwd, lane, budget} to Loom /v1/enrich
   → Loom: embed → Qdrant + Graphiti fan-out → score → threshold → cache
   → Loom returns ranked passages + provenance + request_id
   → hook emits additionalContext (or a role:"system" block)
   → Claude Code assembles the request WITH the injection in its transcript
   → request goes upstream (via :9800 for telemetry, unchanged)
   → next turn reads the injection from cache at 0.1×
```

### Request flow, Nexus job

```
Nexus executor → Loom /v1/messages
   → Loom enriches in-flight (appends role:"system" block)
   → forwards upstream
   → audit row written with request_id + what was injected
```

---

## 7. What this solves, adds, replaces, integrates

### Solves

1. **The 0.67% surfacing problem.** 6.4 MB of curated context becomes reachable
   by relevance rather than by prior enumeration.
2. **Static-selection staleness.** `MEMORY.md` must be hand-curated and capped
   at 140 lines; retrieval has no such ceiling.
3. **Opacity.** Every injection gets a `request_id`, a score, a source path,
   and a reason. `CLAUDE.md` auto-load is invisible by comparison.
4. **Cross-lane amnesia.** Urist, Genie and Jacques have **no** RAG or Graphiti
   MCP at all (see the Task 3 coverage matrix). An HTTP enrichment service
   reaches them without giving each lane its own MCP stack.

### Adds beyond current capability

- Semantic ranking (currently: regex keyword match)
- Provenance and citation for injected context
- A tunable token budget per injection
- Content-hash-keyed caching of enrichments (Loom already has this shape for
  its compression cache — hash + age ratio)
- Empirical model routing (EQRT) — orthogonal, but comes with the gateway

### Replaces

- **`relevance-retrieval.js`'s `PATTERN_TRIGGERS` table** — superseded by
  semantic retrieval. The hook itself survives as the injection point.
- **Part of `MEMORY.md`** — the reference-pointer section (`[[...]]` links to
  ~40 memory files) is a hand-maintained index of exactly what retrieval does
  automatically. It should shrink toward invariants.
- **Nothing else.** JICM, session-state, and the L1–L5 tiers are untouched.

### Integrates with

| Aion component | Integration |
|---|---|
| Qdrant `jarvis-rag` | primary retrieval backend |
| Graphiti / Neo4j | structural expansion; Loom also has a Neo4j variant store |
| MLX embed `:8000` | embedding provider (already 2560-dim Qwen3) |
| `relevance-retrieval.js` | becomes the thin client |
| Usage proxy `:9800` | **unchanged** — do not chain Loom in front |
| Nexus | four stable endpoints; Loom's API is literally titled "Core Nexus contract" |
| JICM | injections enter the transcript, so checkpoints stay coherent |

### New infrastructure required

1. `/v1/enrich` endpoint in Loom (request → ranked passages + provenance)
2. Relevance threshold calibration, with an **eval harness** (see §8)
3. Injection budget policy (tokens per turn, per lane)
4. Cache invalidation on source change (fs watcher → hash bump)
5. Provenance format so injected passages are attributable in-context
6. Metrics: injection rate, score distribution, cache hit, **and outcome**

---

## 8. Risks and open problems

| Risk | Severity | Mitigation |
|---|---|---|
| **System-prompt injection kills cache** | **critical** | Never touch `system` or `tools`. Append `role:"system"` to `messages[]`. Verify with `cache_read_input_tokens`. |
| **Retrieval poisoning** — irrelevant context degrades output | high | Hard relevance floor; measure, don't assume. A low-scoring passage must be dropped, not included "just in case". |
| **Prompt injection via retrieved files** | high | Use the `role:"system"` operator channel, never a user turn. Frame retrieved content as *data*, with provenance. |
| **Latency** — Graphiti is 20–30 s | high | Hard budget (~300 ms). Qdrant only on the synchronous path; Graphiti async, results land next turn. |
| **Nondeterminism** — same prompt, different context | medium | Log the exact injection per `request_id` so any turn is reproducible. |
| **Silent degradation** — retrieval fails, bare prompt sent | **guardrail** | Must **ALERT**, per the No Silent Degradation rule. A failed enrichment is a visible defect, not a quiet fallback. |
| **Loom loses cache-token telemetry** | high | Loom's audit captures only `tokens_in`/`tokens_out` — no `cache_read_input_tokens`. Extend the schema (the contract explicitly permits extra fields) before routing anything through it. |
| **License** | contractual | PolyForm Internal Use 1.0.0 — internal use only. **Never embed in DwarfCron/Chronicler** (portfolio deliverable). |
| **OAuth in the audit log** | high | Loom passes `Authorization` through; Claude Code uses OAuth. Configure `loom.scanner` redaction *before* first use. |

### The unavoidable open question: does it actually help?

There is no prior in this workspace for "injected context improved output."
Per the standing `Chaotic-Model A/B Testing` guidance, a single run cannot
attribute a change — this needs K paired variants and a signed-rank test, on a
fixed task set, with injection on/off as the only varied factor.

**Build the eval harness before the retriever.** Without it, the mesh is
unfalsifiable: it will always *look* like it is working because context is
present, and no one will be able to say whether the output got better.

---

## 9. Phased plan (no implementation yet)

| Phase | Content | Gate |
|---|---|---|
| **0** | Reconcile the five 2026-03-29 Loom docs against current loom-oss; update in place | — |
| **1** | Eval harness: fixed task set, paired on/off, scored | harness runs before any retriever exists |
| **2** | Deploy Loom inert on `:4444`, SQLite, no lane routed | `/health` + dashboard up |
| **3** | Extend Loom audit schema with cache-token fields | `cache_read_input_tokens` present in `/api/audit` |
| **4** | `/v1/enrich` endpoint; Qdrant only; 300 ms budget | p95 latency < 300 ms |
| **5** | Rewire `relevance-retrieval.js` to call it, **one lane** | `cache_read_input_tokens` unchanged vs. baseline |
| **6** | A/B via Phase 1 harness | **HARD GATE** — measured improvement or stop |
| **7** | Roll to remaining lanes; wire Nexus to the four stable endpoints | — |
| **8** | Revive the March training-capture design on Loom's audit layer | — |

**Phase 6 is a real gate.** If paired testing shows no improvement, the correct
outcome is to stop and redesign the retrieval approach — not to ship it because
the infrastructure exists.

---

## 10. Verdict

**The diagnosis is right.** Static memory surfaces 0.67% of the corpus by a
selection fixed in advance, and this session produced a concrete instance of
that failure.

**The mechanism is right.** `role: "system"` messages appended to `messages[]`
are cache-preserving and prompt-injection-safe — purpose-built for exactly this.

**The placement needs one inversion.** Loom should be the retrieval *service*;
the injection point for interactive lanes must stay client-side in the hook,
because Claude Code owns the transcript and the cache economics differ by ~12×.
Loom still injects directly for single-shot Nexus callers, which have no hook
layer and no transcript to diverge from.

The strongest argument for building it is not token savings. It is that a
system whose institutional memory is 150× larger than what it can see has an
addressable, measurable defect — and the infrastructure to fix it is already
running.
