# Loom as a Semantic Mesh — Design Analysis (Revision 2)

**Status**: Design / analysis only. No implementation.
**Revision 2**: 2026-08-27 — incorporates 25 follow-up questions plus the allegorical question.
**Author**: W11 Jarvis-dev
**Twin**: `loom-semantic-mesh-design.html` (artifact `a365b4f5`)
**Extends** the five 2026-03-29 Loom docs in `alfred/.claude/context/systems/`.

---

## 0. What changed since revision 1

Four positions overridden by Sir, one factually wrong claim withdrawn, one new
API capability discovered.

| Revision 1 said | Status | What now stands |
|---|---|---|
| Build the eval harness *before* the retriever; Phase 6 A/B is a hard gate | **retracted** | Build Loom first, observe, then hypothesise. **A/B gates nothing. Only functional validation gates rollout.** Retain all data-gathering hooks. |
| Never embed Loom mechanics in DwarfCron/Chronicler | **reframed** | Loom is a *subsidiary component of Project Aion*. Every Archon and Aion component is in scope, integral to Loom. Only rule: Loom mechanics do not enter another project's shipped product unless elevated to Archon status. Learnings flow outward freely. |
| Hard 300 ms budget; Qdrant synchronous within a timeout | **retracted** | No latency controls during the build. The system runs at the pace it runs. Latency resolved last, from data. |
| Hard relevance floor; drop low-scoring passages | **retracted** | Start with a **generous** range; discover the line empirically. |
| Loom's audit captures no cache tokens — a blocker | **factually wrong** | Withdrawn. loom-oss captures the split end-to-end and records the ephemeral 5m breakdown our `:9800` proxy discards. Real issue is a one-line doc gap (§18). |
| — | **new** | **Mid-conversation tool changes** (Opus 5 beta) alter the tool set without invalidating cache. Revision 1 did not know this existed. |

Sir's reasoning on the harness generalises: *build the harness first and you will
build the thing to fit the harness you made for testing it.* The concession in
return is that every retrieval decision is logged in full from day one.

---

## 1. The proposal

Prompts pass through a layer that reads them, searches local knowledge for
related material, and folds what it finds into the message before it reaches the
model. A counterpart to `CLAUDE.md` auto-load that is adaptive rather than fixed,
and logged rather than invisible.

**Short answer, unchanged:** diagnosis correct, mechanism real. Injection for
interactive lanes belongs *client-side in the hook*, not in the gateway. Loom
becomes the retrieval **service**, not always the **injector**.

---

## 2. The problem, measured (2026-08-27)

| Tier | Size | Loaded |
|---|---:|---|
| Always-resident (`CLAUDE.md` ×2, `MEMORY.md`, session-state) | **42,777 B** (~11,257 tok) | unconditional |
| `.claude/context/**/*.md` | **6,412,558 B** (409 files) | never, unless grepped |

**0.67% of the corpus is surfaced, and which 0.67% is fixed in advance.** Not a
cost problem (11K tokens ≈ 1.1% of a 1M window) — a **relevance** problem.

*Proof case*: the five March Loom docs (82 KB, directly on-topic) were surfaced
by no memory tier. Found by accident in an unrelated `grep`.

---

## 3. The existing reflex is thinner than claimed

`relevance-retrieval.js`, one of 12 `UserPromptSubmit` hooks, has **two tracks**:

- **T3** — 12 hardcoded keyword→file entries, scored by *literal substring
  counting*, threshold 2 hits (1 if the prompt looks like a question). Best
  single match wins: **max one excerpt, 800 chars**.
- **T4** — 5 detectors that **call nothing**. They inject an instruction telling
  the model to search. **The retrieval cost lands on the model's next turn**,
  invisible to the hook's budget, and may simply not happen.

**Three defects**: `.retrieval-state.json` is *not session-scoped* (one file, all
lanes, rewritten every prompt, unbounded list); every failure path swallows to an
empty result (**silent no-op**); `context-health-monitor.js` has `projectsDir`
hardcoded to the old Jarvis path, so one of six health layers is wrong here.

**Memory footprint, re-measured** (24h uptime): MLX-Embed **2.50 GB RSS, 2,474 MB
current vs 3,322 MB peak** — peak exceeding current is growth-then-GC, *not* a
monotonic leak. 4-bit 4B floor is ~2.4 GB. LiteLLM flat at 290 MB. **The old
38 GB/23h figure must not be repeated without re-measuring.**

---

## 4. Cache anatomy — Q6, Q7

**The misconception first.** "Lookback" is *not* Loom looking back through recent
turns. It is an internal mechanic of the server's cache lookup, and would exist
identically with zero retrieval.

Three facts:

1. **The API is stateless.** Claude Code re-uploads the entire conversation every
   turn — all 300K tokens, every time.
2. **Caching is a receipt, not memory.** The server keeps precomputed attention
   state for byte sequences it has seen. A prefix match skips recomputation and
   charges 0.1× instead of 1.0×. Nothing is stored *for* you.
3. **Invalidation loses no data and breaks nothing** — you silently pay ~10× for
   that turn. A pure cost failure with no visible symptom.

**A breakpoint** is a `cache_control` marker on one content block meaning "cache
from request start through here". Render order `tools` → `system` → `messages`;
strict prefix match; **max 4 breakpoints**.

**The 20-block lookback**: the server walks back ≤20 content blocks from the
breakpoint seeking a prior entry. **Every `tool_use` AND every `tool_result` is
its own block**, so one 12-call agentic turn ≈ 24 blocks and blows the window —
*before any retrieval layer adds anything*. Remedy is mundane: an intermediate
breakpoint every ~15 blocks. Aion currently reasons about none of its four.

### Invalidation hierarchy

| Change | Tools | System | Messages |
|---|:--:|:--:|:--:|
| Tool definitions add/remove/reorder | ❌ | ❌ | ❌ |
| Model switch | ❌ | ❌ | ❌ |
| System prompt content | ✅ | ❌ | ❌ |
| Message content appended | ✅ | ✅ | ❌ |

**Ordinary conversation invalidates nothing.** Injecting into the *system prompt*
invalidates system + all messages, every turn — for a 300K/99%-hit lane that is a
full reprocess. The most expensive mistake in this design space.

### Three newer facts

- **Opus 5 min cacheable prefix = 512 tokens** (was 1024 on Opus 4.8). **Not
  monotonic** — 4096 on Opus 4.6 / Haiku 4.5. Read per model.
- **Mid-conversation `role:"system"` messages**: Opus 5 / 4.8, Fable 5, Mythos 5,
  no beta header. **NOT Sonnet 5** — matters if satellite lanes run Sonnet.
- **Model switch has no cache escape hatch** (caches are model-scoped) ⇒ hard
  strike against model *routing* for interactive lanes. Fine for single-shot.

---

## 5. Q8 — the "physics" of static memory

Closer to economics. A byte in `CLAUDE.md` is **re-uploaded every turn for the
life of the session** and re-read at 0.1× thereafter. Small per turn, unbounded
in aggregate. Its *selection* was paid for once, months ago, by someone guessing.

| | Static (Tier A) | Retrieved (Tier B) |
|---|---|---|
| Cost shape | 1 × N turns | 1 × 1 turn |
| Selection | before the task is known | after the task is known |
| Failure | dilutes attention all session | individually cheap, individually visible |

**The real asymmetry is attention, not tokens.** A guardrail stated among 400
pinned lines competes with everything pinned beside it, every turn. Invariants —
identity, guardrails, form of address, filesystem policy — earn their place by
applying *unconditionally*. Anything conditional is by definition better served
by a mechanism that can evaluate the condition. Tier A shrinks **as Tier B earns
trust, never before**.

---

## 6. Architecture — three tiers, one service

```
Tier A — STATIC INVARIANTS   identity · guardrails · address · filesystem policy
Tier B — ADAPTIVE INJECTION  UserPromptSubmit hook. Primary path, interactive lanes.
                             Cache-safe · transcript-honest · budgeted · logged.
Tier C — LOOM AS SERVICE     embedding, fan-out, ranking, caching, audit.
                             Serves Tier B over HTTP. Injects directly only for
                             single-shot Nexus callers with no hook layer.
```

**New capability**: beta `mid-conversation-tool-changes-2026-07-01` (Opus 5+)
allows `tool_addition`/`tool_removal` blocks on a system-role message to change
the tool set **without invalidating cache**, for tools pre-declared with
`defer_loading`. Changing tools normally invalidates everything — which is why no
Aion system has ever considered adapting an Archon's tool surface to the task.
**Build nothing here yet**; it is noted because designing Tier C's response shape
to carry tool hints later costs nothing today.

---

## 7. Q13 — is the hook/gateway asymmetry a maintenance problem?

It would be if the two paths held separate logic. **They do not.** Everything
that can be got wrong — embedding, fan-out, scoring, budgeting, dedup,
provenance, caching, audit — lives in one service behind one endpoint. Only the
last step differs: who writes the passages into the request.

| Concern | Interactive lane | Single-shot Nexus |
|---|---|---|
| Retrieval, ranking, budget | *identical — same code path, same audit row* | ← |
| Who injects | the hook, client-side | the gateway, in-flight |
| Why | Claude Code owns the transcript | no hook layer; no transcript to diverge from |
| Cache | injection enters the prefix, read at 0.1× | no next turn; caching irrelevant |

**Unification is possible in one direction only**: give Nexus jobs a hook layer.
Styx already forks Claude sessions, and forked sessions do have hooks. Then the
gateway path could be deleted entirely. Attractive endgame; do not attempt first,
because it couples the Loom build to a Nexus refactor. Unifying the *other* way —
routing interactive lanes through gateway injection — is the ~12× mistake and
should be named so nobody proposes it later as a simplification.

**Defect exposed**: the Styx bridge exports only `TMUX_SESSION`+`ALFRED_DIR`, so
**pipeline-forked sessions are untelemetered by construction**; and no
`settings.json` sets `ANTHROPIC_BASE_URL`, so a bare `claude` bypasses the proxy.

---

## 8. Q9 + Q15 — per-Archon stores and the routing layer

| Namespace | Graphiti entities | Qdrant sessions | context/research/codebase |
|---|---:|---:|---|
| jarvis-core | 6,467 | 608 | 5,210 / 1,224 / 2,014 |
| jaques-core | 439 | 109 | 0 / 0 / 0 |
| genie-core | 305 | 96 | 0 / 0 / 0 |
| urist-core | **does not exist** | unbacked | — |

**Two defects**: `JICM_RAG_COLLECTION=urist-sessions` is exported but no such
collection exists and `urist-*` is not in `VALID_COLLECTIONS`; and
`jicm-config.sh` has cases for genie/jaques but not urist, so **Urist's
checkpoints land in Jarvis's namespace**. Urist has never written a Graphiti
episode. **Only the JICM sessions path ever writes — every per-Archon context,
research and codebase collection is empty.** The discretisation of memory exists
as configuration, not as data.

**Q15 — why routing must be built, not configured.** Qdrant `Filter` primitives
are imported but used **only for dedup and deletion**. Neither search path passes
a `query_filter`. **Isolation today is by collection and nothing else.** Ingest
payload carries text, source, chunk index, hashes, file metadata — **no archon,
lane or tag field**. The one exception: JICM auto-ingest writes a `session_id`,
the single field that could support per-Archon filtering today. No search path
reads it.

**Recommendation — both, in order.** Ship routing on **collections** first (works
today, no migration). Add payload fields (`archon`, `lane`, `scope`, `tier`) at
ingest **immediately**, so tagged data accumulates while the collection router is
in service; filtering by tag then becomes a query change, not a data migration.

Sir's shape — core behavioural memory retrievable by all, Archon-specific
elevated — is expressible as a **scored blend**: search the shared tier *and* the
Archon's own tier, applying a score premium to the Archon's own material rather
than excluding the shared one. **Elevation by weighting, not by walling off** —
which also degrades gracefully for a new Archon with an empty store.

---

## 9. Q14 — does this quietly replace deliberate retrieval?

The concern is justified: a reflex that always fires tends to displace the
deliberate act it resembles. They must be separated **by construction**.

| | Reflexive (Tier B) | Intentional (MCP search) |
|---|---|---|
| Initiator | the hook, before the model sees the prompt | the model, mid-reasoning |
| Optimises | breadth — "this may bear on it" | depth — "I need this answer" |
| Query | the user's prompt, unmodified | one the model composed |
| Failure | dilution | omission — never thinks to look |

They fail in **opposite** directions, which is why both are kept. Three
guarantees against displacement:

- **Reflexive material is always labelled as such** — score, source, and the fact
  it arrived unbidden. Unlabelled injection is what makes deliberate search feel
  redundant.
- **The reflex never answers, it only offers.** Passages with provenance, never a
  synthesised claim. A summary displaces enquiry; a citation invites it.
- **Instrument the interaction.** Log per turn whether an injection occurred and
  whether the model then issued a deliberate search. If deliberate searches
  collapse once the reflex is on, that is a measurable regression and a reason to
  redesign — not an efficiency.

Note that T4 of the current hook is exactly this confusion: a reflexive trigger
wearing the costume of a deliberate act, spending the model's turn rather than
the hook's. In the proposed design the reflex retrieves for itself.

---

## 10. Q10, Q11, Q12 — freshness, bloat, bad knowledge

**What ingestion does today**: triggered by the JICM actuator at clear time (not
cron, not launchd), ingests exactly one file — the lane's compressed checkpoint —
no repo sweeping. Dedup embeds **the first 500 chars only**, top-1 unfiltered
query, skips the entire ingest at score ≥ 0.92. Staleness handled by deleting
prior points matching the source path. **No TTL, no age pruning, no
reconciliation.**

Two non-obvious consequences: because the checkpoint path is a *fixed per-lane
filename*, delete-then-upsert means **only the most recent checkpoint per lane
survives** — the session store is five snapshots, not a history. And because
dedup reads only 500 chars, **a whole session can be discarded on the strength of
its opening paragraph**. `ingested_at` is written and never read.

**Q10 — freshness** splits in two. *Awareness*: nothing watches the corpus; a
filesystem watcher over `.claude/context/**` enqueueing changed paths is the
minimum mechanism, and ingest is already keyed by source path with
delete-before-upsert, so re-ingest is correct by construction — the hard part is
noticing. *Preference*: cosine similarity has no opinion about time, so retrieval
needs an explicit, **tunable** recency term. Loom's compression module already
computes an age ratio and discounts by it — borrow the pattern.

**Q11 — bloat** has a natural bound that is easy to miss: the corpus is 6.4 MB of
Markdown and grows at human speed. Bloat comes from **derived** material —
checkpoints, summaries, digests — generated automatically, forever, at a rate set
by session activity. So **bound the derived tier, not the authored one**.
Authored documents need no eviction policy. Derived artefacts need one from day
one; "keep exactly one per lane forever" is a policy by accident. The March
quality-signal doc already specifies retention floors and bands — reuse them.

**Q12 — bad knowledge** has no existing answer and is the most important, because
a confidently-worded wrong retrieval is worse than none. Three kinds:

| Kind | Example here | Mechanism |
|---|---|---|
| **Superseded** | the MLX leak figure (§3); "Loom captures no cache tokens" (§0) | recency weighting + explicit supersedes link |
| **Wrong on arrival** | a checkpoint that hallucinated a task — as happened to this session's own checkpoint | needs human/model signal; the March quality weights apply directly (human disagreement is already the heaviest negative) |
| **Misleading in context** | a DwarfCron gotcha during infrastructure work | not a correctness problem — this is dilution, answered in §17 |

**The cheapest correction channel already exists**: corrections are captured by a
hook into an append-only log. Nothing reads it back. Wiring corrections in as a
**negative signal against retrieved passages** closes the loop using material the
workspace already produces.

**Q18 — memory footprint.** Per §3 the leak reputation is unsupported by today's
numbers, and the 2026-08-26 kernel panic was root-caused to a `logd` watchdog
with **zero swapouts and ~93 GB free** — memory was ruled out from the panic's
own stackshot. The design question relocates rather than vanishing:

- **Do not add a resident process** — call the running embedding server.
- **Bound every cache at creation.** Loom's hash+age-ratio cache has a good shape
  with no natural ceiling; enrichment caches must be given one.
- **Measure footprint, not RSS.** The 850 MB peak-over-current gap would read as
  a leak from RSS alone. Growth-then-GC and a true leak look identical unless you
  watch the right instrument over a long enough window.

---

## 11. Q4, Q5, Q19, Q21 — failure, alerting, and no latency controls

**Q19 accepted.** The 300 ms budget is withdrawn. Building latency controls
before there is latency data encodes a guess as a constraint, then measures
compliance with the guess. What replaces it is **instrumentation**: wall-clock
per stage, per store, per request.

One caveat, stated plainly as the cost of the choice: **Graphiti is 20–30 s.**
Synchronous on the prompt path it will be felt on every prompt. The response is
structural, not a control — Qdrant is fast enough to be synchronous, Graphiti is
not, so Graphiti lands as an asynchronous follow-up. That is a pipeline shape and
survives Q19 intact.

| Failure | Symptom if unhandled | Detection |
|---|---|---|
| Embedding server down | every enrichment silently empty | watcher health probe exists; record + alert per request |
| Qdrant/collection missing | as above — **live today for Urist** | validate collection names **at service start**, fail loudly at boot |
| Nothing relevant returned | indistinguishable from not running | log the **score distribution**, not just the selection |
| Injection in the wrong place | cache invalidation — no visible symptom | **watch `cache_read_input_tokens` per lane** — already in Postgres |
| Retrieved content impersonates operator | prompt injection | system-role channel, framed as data with provenance; scanner redaction on top |
| Stale enrichment cache | invisible freshness failure | key the cache on content hash |
| The hook throws | **silent no-op — current behaviour** | fail loudly |

**Q21 — alerting.** Use the path that exists: the JICM watcher delivers alerts to
the W0 inbox via `aion-inbox.sh --no-nudge`, with a circuit breaker (max 3 fires
per hour per key) so a persistent fault is not a persistent nuisance.

**What an alert must and must not do.** A failed enrichment **alerts and the
prompt proceeds bare**. It does not block — refusing to serve the user because
retrieval is down is a worse failure than the one being reported. But it is never
quiet and never counted as success. **A degraded turn is a visible defect that
stays open**, not a fallback that closes the incident. Three channels, three
latencies of attention: inbox (immediate), audit row (forensic), dashboard
counter (ambient).

**The guardrail is currently violated by our own launcher.** If the `:9800`
health check fails, `launch-aion.sh:940-947` **unsets `ANTHROPIC_BASE_URL`** and
every lane launches straight to `api.anthropic.com`. Sessions work. Telemetry
stops. Nothing alerts. Fix regardless of Loom.

---

## 12. Q16, Q17, Q25 — telemetry, tunability, compression, knock-ons

**Q17 first: enrichment does not sideline the rest of Loom, because most of the
rest is already built.** loom-oss has a working extractive compression engine, a
real DLP scanner with configurable rules, a 12-page React dashboard served by the
gateway process itself, live config via `PATCH /api/config/server` taking effect
without restart, and a per-request `x-loom-compression` header. **Enrichment is
the missing feature in an otherwise furnished house.**

**Q16 — the Pulse chart, and a correction that inverts its meaning.** "Message
Sizes" plots `input_tokens + output_tokens` and **excludes cache reads**
(`alfred/pulse/app.py:2635` live, `:2513` historical). For a 99%-cache lane the
plotted number is **the uncached remainder — a few K — while the real prompt is
300K+**. It is a **cache-efficiency signal, not a prompt-size signal**. A spike
means a cache miss, not a big prompt. Any decision logic built on the label's
implied reading would rest on sand.

So where should budget assessment happen? **Not from that chart and not from
proxy telemetry** — both are after the fact, and the proxy's data arrives only
once the request is sent. It belongs in the hook, and the instrument exists:
`jicm-gate.sh` already computes live totals from the transcript every prompt as
`input + cache_read + cache_creation`. **That is the number to budget against**,
already computed for other reasons.

Worth fixing while in hand: the proxy discards the nested `usage.cache_creation`
object, storing only the flat sum — so the ephemeral 5m/1h split is lost.
loom-oss captures it. If any status display shows an ephemeral percentage today,
**it is not coming from that DB** — verify rather than assume.

**Tunable parameters**: relevance range · passages per turn · token budget per
injection · recency weight · own-Archon score premium · store fan-out set ·
**enrichment on/off per lane** (non-negotiable, live rather than launch-time).
All three of Loom's tuning surfaces already exist — config file, env vars, live
API. Route new parameters through them rather than inventing a parallel
mechanism.

**Q25 — secondary benefits**, two of them arguably worth more than compression:

- **A DLP scanner across all Archon traffic** — redaction for keys, tokens,
  cards, identifiers; runtime-editable; streaming tested. In a public repo with a
  live credential store this has standalone value. It is also the answer to
  revision 1's open OAuth-in-audit-logs question.
- **A complete request audit with routing rationale** — 17 fields per request
  plus a `routing_decisions` table carrying `determinism_score` and the
  alternatives considered. **This is the substrate Q22 needs, already written.**
- **Reconciliation against the provider's own usage API** — a correctness check
  on our telemetry that Aion has in no form today.
- **A 12-page dashboard** requiring no additional service.
- **The March training-capture design becomes viable again** — its schema,
  weights and gates were written against executor internals and stranded there.

**Two claims that cannot be made yet**: `tokens_saved`, `savings_usd`, `by_tier`
and `/api/sessions` **currently report zeros/unsupported** pending parity work,
and the one impressive compression figure in the docs is explicitly
*illustrative, not measured*. Separately the **governor has no enforcement** —
its own docstring says it is a settings and audit surface with utilisation
counters left at zero. Neither is a defect; both would be badly mis-sold if
quoted as working.

---

## 13. Q20, Q22, Q24 — non-determinism, and data without a harness

Per Q24 this is not an experimental design. It is **what must be recorded from
day one so that experiments are possible later** — a much smaller commitment.

Q22 is the most scientifically interesting question in the set, and the most
likely to be quietly lost: once enrichment is on, the same prompt yields
different context, so **every subsequent measurement is of a moving target**.
Unless the movement is recorded it becomes *retrospectively unmeasurable*,
because the inputs are gone.

Per enrichment, keyed by `request_id` and joinable to the proxy's row:

| Recorded | Later enables |
|---|---|
| prompt hash + embedding hash | finding repeat prompts — the natural experiment nobody designed |
| **every candidate with its score**, not just the selected | the distribution is the object of study; winners-only discards the denominator |
| selection decisions and why | attribution when quality changes |
| store/collection/filter per candidate | whether routing (§8) helps or hurts, per Archon |
| corpus generation counter | separating "retriever behaved differently" from "corpus changed underneath" — otherwise permanently confounded |
| per-stage wall-clock | the distribution Q19 defers to; free if recorded now |
| whether a deliberate search followed | the displacement check (§9) |
| corrections logged against that turn | the negative-signal loop (Q12) |

**The one property worth protecting now: replayability.** With candidates and
scores recorded, **a past turn can be re-scored under a new ranking policy
without re-running the model**. That converts an unfalsifiable system into one
where a year of real traffic can be replayed against any future hypothesis,
offline, at no API cost. Nearly free on day one; close to impossible to retrofit.

**Q20 accepted.** Generous range, no hard floor. What makes that safe is the
**ceiling** on passages and tokens: a floor filters by quality, a ceiling filters
by volume, and it is the ceiling that bounds the dog-question failure mode.

---

## 14. Q1 — quarantining the build

Aion's lane architecture already provides most of the isolation, and it does so
at **launch time**, which is what makes it trustworthy: own process and cwd; own
Graphiti group and Qdrant collections; **cross-group writes enforced at a single
point** keyed off the launch env, so a lane cannot write outside its group; own
JICM registry entry and thresholds; own MCP config.

**Recommendation: a real Loom Archon lane, not a sandbox** — own window, group,
collections, registry entry, MCP config, exactly as Urist/Genie/Jacques were
created. Full Archon feel because it *is* the full Archon environment, and it
inherits isolation by construction. Adding a namespace needs **no schema change**
— one env var, and `.mcp.json` resolves the rest.

Prefer this to a separate repo (which would sever the subject matter — per Q23
the Aion codebase *is* the material) or a container (which isolates the
filesystem, where the risk does not live).

**Where the blast radius actually is:**

- **Shared mutable state.** Qdrant and Neo4j are shared. Experimental vectors in
  `jarvis-context` would pollute what every lane retrieves. *Mitigation*:
  dedicated collections and group from the start. The single most important
  isolation decision, and it is pure configuration.
- **The prompt path.** Enrichment in a hook affects that lane's every prompt.
  *Mitigation*: per-lane enable, live rather than launch-time, so a bad rollout
  reverts in seconds.
- **Hook registration semantics.** **Script body is live immediately;
  registration is picked up at session start; MCP/permission changes need a full
  restart.** So an experimental hook that looks inert may go live for every lane
  at the next clear. *Mitigation*: register in the Loom lane's own settings,
  never the shared set, until promoted.

Loom's own defaults suit staging unmodified: SQLite, no provider keys stored,
localhost binding with no auth assumed. A staging instance is genuinely inert
until a lane is pointed at it.

---

## 15. Q2 — Watcher, JICM, and the mesh

**"Watcher" names two different things.** The **daemon** `jicm-watcher.sh` (1,358
lines, launchd `com.aion.jicm-watcher`, 5 s poll, singleton via atomic `mkdir`)
is the thing that acts. The **console** `jicm-watcher-hud.sh` (tmux `aion:8`) is
a read-only dashboard and does nothing. Two further watchers exist besides —
`jarvis-watcher.sh` and `cost-anomaly-watcher.sh`. Always say which.

**The cycle**: (1) *measure* — the gate hook every prompt, canonical source the
transcript JSONL not the statusline, `tokens = input + cache_read +
cache_creation`, carrying the previous value forward on unreadable usage, never
zero. (2) *decide* — soft 300K / hard 330K absolute, with per-key overrides
(protos 140K/160K). (3) *signal* — the Stop hook writes `clear-now.<key>.signal`.
(4) *fire* — the daemon validates live raiser, pane occupancy, still-over-
threshold, then spawns the actuator, double-gated. (5) *actuate* — wait for idle,
inject the flush prompt, **refuse to clear without a non-empty anchor**, write a
lineage edge, fold in a transcript digest, inject `/clear`. (6) *compress* — two
tiers, bash extraction then a local narrative model. (7) *ingest* — checkpoint to
Qdrant, parallel path to Graphiti.

**Where the mesh helps JICM:**

- **It closes the loop JICM leaves open.** JICM writes checkpoints into the
  semantic store on every clear; almost nothing reads them back — restoration
  reads the checkpoint *file*, not the store. **The producer exists and the
  consumer does not; the mesh is the missing consumer.**
- **Restoration becomes semantic rather than positional** — a cleared session
  could get the checkpoints, from any lane and date, that bear on what it is
  about to do, instead of merely its own latest.
- **It reduces the pressure that drives clearing**, since retrieval on demand
  substitutes for keeping material resident.

**Where they conflict, and it must be designed for.** The gate counts
*everything*, and injected passages enter the transcript, so **enrichment
accelerates the arrival of the clear threshold**. That is a real resource being
consumed, not a bug to suppress — but it must be **visible**, with injected
tokens attributable in the gate's accounting so a lane clearing twice as often is
explicable. Second-order: more clears → more checkpoints → more ingested material
→ more retrievable context → more injection. **That is a feedback loop**, slow
and mild, but the same shape as the runaway §17 is about.

Favourably: the clear cycle already produces a local-model narrative and a
transcript digest at no API cost. Retrieval should reuse that machinery rather
than build a parallel summariser.

---

## 16. Q3 — the two ports. Do not merge.

| `:9800` — the observer | `:4444` — the mutator |
|---|---|
| Contract: *observes, does not modify* | Rewrites request bodies by design |
| 3 mechanical exceptions (host/content-length strip, accept-encoding rewrite, response header allowlist); body relayed **verbatim** | Compresses, enriches, routes, redacts |
| Captures `cache_read_tokens` + `cache_write_tokens` today | Genuinely free — nothing listens, no config binds it |
| Postgres, conflict-safe inserts | Serves the hook over HTTP |

The decisive argument is the second: **an observer's value comes entirely from
the guarantee that it does not modify.** Chaining a mutator behind it destroys
that permanently and quietly — every future "did the proxy see what the client
sent?" becomes unanswerable.

Revision 1's third reason (Loom lacks cache fields, would blind telemetry) is
**withdrawn as wrong**. The argument does not need it and is stronger without it.

**Topology**: Loom sits *beside* the path as a retrieval service the hook calls;
`:9800` remains the only thing in-path. Loom goes in-path only for single-shot
Nexus jobs, which do not traverse `:9800` anyway — itself a telemetry gap to
close (§7).

---

## 17. Q23 — scope, corrected

**Loom is a subsidiary component of Project Aion.** Every Archon codebase and
every Aion component is in scope, integral to Loom as subject matter and
material. The single restriction runs the other way: Loom *mechanics* do not
enter another project's shipped product unless that product is itself elevated to
Archon status — conceivable for Chronicler, not on its roadmap. **Learnings,
components, theories and resources from Loom are entirely fair use for improving
other projects' products.**

This squares with the licence (PolyForm Internal Use 1.0.0): internal use
permitted; redistribution, resale, product embedding and hosted service not.
Sir's restriction is stricter than the licence requires and is the one to follow.

One consequence, opposite to revision 1's caution: **the defects catalogued here
are not distractions from the Loom work — they are part of it.** Each is a
property of the system Loom is meant to serve, and each would corrupt Loom's own
data if left in place.

---

## 18. The dog — designing a reflex that terminates

The allegory holds everything constant except one thing. Same person, dog,
memory, pleasantness, cascade. **The retrieval is identical in both scenarios.
Only the aim differs.**

**The uncomfortable consequence**: semantic similarity measures passage↔prompt,
and that relation is unchanged across both. **No embedding model, at any quality,
can distinguish the two scenarios**, because the difference is not in the
material or the prompt — it is in the goal, which is nowhere in the input.
Improving the retriever cannot fix this. Relevance must be modelled as a
**three-way** relation — passage, prompt, and **aim** — not the two-way relation
every retrieval system defaults to.

### Pathologies as mechanisms

Prevented **by construction, not by tuning**. A threshold can be set wrong; a
loop that cannot form cannot form.

| Pathology | Mechanism that produces it | Structural prevention |
|---|---|---|
| **Rumination** — the unending chain | retrieved passages used as retrieval queries; each hop locally reasonable, the chain diverges | **One hop, always.** Retrieval never feeds retrieval. Not a budget — an *absence of the edge* that would make a cycle possible. |
| **Hyperfixation** | injected text enters the transcript → next turn resembles it → scores higher → injected again. A real positive feedback loop. | **Embed the user's prompt only** — never the transcript, never prior injections. The return path is severed. Plus a **refractory period**: recently-injected sources suppressed for a few turns. This is habituation. |
| **Phobia / avoidance** | one heavily-weighted doc dominates a whole trigger class indefinitely | **Cap per-source dominance per turn; require diversity** across the selected set. Decay material repeatedly surfaced and never acted on. |
| **Decision paralysis** | too many plausible passages; the turn is spent adjudicating context | **Hard ceiling on passage count** — and this is why Q20's generous range is safe. |
| **Dissociation** | retrieval fails silently; conclusions recorded without inputs | alert on failure (§11) — the same defect as transcript divergence (§7), arriving by another route |
| **Intrusive recall** | material arrives with the authority of the user's own words, origin invisible | **Provenance always.** Unlabelled context is indistinguishable from instruction — the prompt-injection problem and the psychological one share a root. |

### The organising principle: a healthy reflex terminates

Sir's own contrast contains the answer. The rational response to the mouse is
*surprise, recognition, rational reaction* — and then it is **over**. The
pathological response is characterised not by being triggered but by **failing to
terminate**.

So the target is not a cleverer reflex but one **terminating by construction**:
one hop · bounded volume · habituating on repetition · labelled at delivery ·
structurally unable to trigger itself. Given those five, a badly-tuned retriever
produces irrelevant context — annoying, visible, cheap. It **cannot** produce a
spiral, because there is no path along which one could propagate.

### The aim problem, honestly

Three approaches, increasing ambition, decreasing confidence:

1. **Inherit the aim from the lane.** Weak but free and available now — an Archon
   lane already *is* a declared purpose. Per-Archon routing (§8) is therefore
   already a partial aim signal, arriving as a side effect of work happening
   anyway.
2. **Let the session declare its mode** — focused vs exploratory, differing in
   budget and tolerated associative distance. This is the jog and the park made
   explicit. It is honest that the system cannot know the aim, and asks. It is
   also the **only one that would reliably have distinguished Sir's two
   scenarios**, because the information lives with the person, not the scene.
3. **Infer the aim from trajectory.** Record it (§13) long before acting on it —
   inferring aim badly is worse than not inferring it, producing confident
   misdirection rather than mere noise.

**And one thing the system has that a person does not.** The jogger cannot
decline the memory; by the time it surfaces, the focus is broken. **An Archon
can.** Retrieval offers material with provenance; the model may disregard it in a
sentence. The reflex is reflexive; the response to it is not. This is why
provenance is load-bearing rather than decorative — it preserves the step the
pathological cases lack. **Retrieval proposes; the model disposes. The worst
failure is not retrieving the wrong thing, but retrieving it in a way that cannot
be recognised as retrieved.**

---

## 19. Defects found while grounding these answers

Eight, none of them being looked for. Per §17 they are in scope.

| Defect | Effect |
|---|---|
| **`launch-aion.sh:940-947` unsets `ANTHROPIC_BASE_URL` on health-check failure** | every lane goes straight to the API; sessions work, telemetry stops, nothing alerts. **No Silent Degradation violated by our own code.** |
| Urist's RAG collection does not exist / not in `VALID_COLLECTIONS` | Urist's semantic namespace is unbacked |
| `jicm-config.sh` has no `urist` case | Urist's checkpoints land in Jarvis's namespace |
| `.retrieval-state.json` not session-scoped | one file, all lanes, unbounded list; cross-lane suppression does not work |
| Every hook failure path swallows to `output({})` | silent no-op on any error |
| `context-health-monitor.js` `projectsDir` hardcoded to the old Jarvis path | one of six health layers is wrong here |
| Styx forks inherit no proxy routing; no `settings.json` sets it | pipeline sessions untelemetered by construction |
| Auto-ingest dedup embeds only the first 500 chars | a whole session discardable on its opening paragraph |

**Six of the eight are silent.** They do not fail; they succeed while doing
nothing, or something wrong — the same class as cache invalidation (§4). Standing
lesson: **in this system the dangerous defects are not the ones that throw.**

---

## 20. Revised plan — functional gates only

Per Q24 the harness is neither first nor a gate. Every gate below is functional.

| Phase | Content | Gate (functional) |
|---|---|---|
| **0** | Fix the defects that would corrupt Loom's own data — launcher telemetry loss, Urist namespace, retrieval-state scoping, 500-char dedup | each verified by observation, not inspection |
| **1** | Create the Loom Archon lane — own window, group, collections, registry, MCP config | writes to its own namespace, cannot write outside it |
| **2** | Deploy Loom inert on `:4444`, SQLite, scanner redaction configured **before** first use | `/health` + dashboard respond; nothing routed |
| **3** | `/v1/enrich` — Qdrant only, collection routing, generous relevance range, full candidate logging | returns ranked passages with provenance; **a past request is re-scorable offline from its own record** |
| **4** | Freshness + tagging — fs watcher; `archon`/`lane`/`scope`/`tier` at ingest | changed file retrievable in its new form; new points tagged |
| **5** | Wire the hook, **Loom lane only**, in that lane's own settings — one hop, prompt-only embedding, refractory suppression, dominance cap, provenance | **`cache_read_input_tokens` unchanged vs baseline** — the invalidation canary |
| **6** | One production lane, live per-lane switch; injected tokens attributable in JICM accounting | revertible in seconds; clear-rate change accounted for |
| **7** | Graphiti as an async second channel | structural results arrive and are attributable; prompt path unblocked |
| **8** | Nexus gateway path + the four stable endpoints; close the Styx telemetry hole | single-shot jobs enriched and audited end to end |
| **9** | Revive the March training-capture design on the audit layer (schema, weights, gates carry over; the bash/executor mechanisms do not) | captures land with quality bands populated |
| **10** | *Only now*: hypotheses, and a harness built to test them | not a gate — an instrument |

**Held deliberately out of the plan**: mid-conversation tool reshaping (§6), the
most interesting capability found in this revision. It waits until retrieval is
trusted, because a system that adapts an Archon's *tools* on a misjudged signal
fails considerably harder than one that adds an irrelevant paragraph. Shaping
Phase 3's response so it *could* carry tool hints later costs nothing now.

---

## 21. Verdict

**The diagnosis is right.** Static memory surfaces under 1% of the corpus by a
selection fixed in advance, and this document's own subject matter was surfaced
by accident rather than by any memory tier.

**The mechanism is right.** `role:"system"` messages appended to `messages[]` are
cache-preserving and prompt-injection-safe — purpose-built for this.

**The placement needs one inversion.** Loom is the retrieval *service*; injection
for interactive lanes stays client-side in the hook, because Claude Code owns the
transcript and the cache economics differ by ~12×. Loom injects directly only for
single-shot callers with no hook layer and no transcript to diverge from.

**And the dog question changes the design more than the other twenty-five
combined.** Relevance cannot be a two-way relation between passage and prompt,
because the two scenarios differ in neither. The reflex must be built to
**terminate** — one hop, bounded volume, habituating, labelled, structurally
unable to trigger itself — and the deliberating step above it must always retain
the ability to decline what it is handed.

**The argument for building it** is not token savings; those are marginal, and on
this codebase they are currently unmeasured and reported as zero. It is that a
system whose institutional memory is **150× larger than what it can see** has a
specific, addressable defect, and every piece of infrastructure needed to fix it
is already running. What this revision adds is that the same investigation found
**eight silent defects** in that infrastructure — which is itself an argument for
the work. **The mesh cannot be built without first making the system it retrieves
from tell the truth.**
