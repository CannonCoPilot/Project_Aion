# api_aware.md — Anthropic Platform Self-Awareness (force-loaded)

**Purpose**: Operational rules + orientation map for the Anthropic Max-plan platform Jarvis runs inside. Guidebook, not report — rules to follow, traps to avoid, paths to read, signals to trust.

**Maintenance**: any section may rot as the platform evolves. The "Reference paths" section lists source files; verify against them before claiming new behavior. Update this doc when verified; do not update from speculation.

---

## §0 First Principles (READ FIRST)

### Three-tier metric hierarchy

| Tier | Metric | Use for | Source |
|---|---|---|---|
| PRIMARY | Burn weight = Δ `unified_5h_utilization` (pp) | Capacity decisions | CC stdin `rate_limits.five_hour.used_percentage` (live); `api_requests.unified_5h_utilization` (lagged) |
| SECONDARY | Token volumes by class | Postmortem explanation | `api_requests.{cache_write,cache_read,input,output}_tokens` |
| TERTIARY | Dollar cost | API-contract artifact only | `api_requests.cost_usd` |

"Burn weight" is Sir-coined shorthand; "%Usage" / "5h util%" / "5h%" name the same quantity.

### No-conversion rule (zero exceptions)

| Forbidden | Why |
|---|---|
| $ → tokens | Per-token pricing varies by class (~60× spread), by model, by time-of-day adjustments, and is modulated by `unified_fallback_pct` |
| tokens → burn weight | Anthropic util formula is composite (token volume + request count + possibly peak-rate). Two 100%-util windows can differ 3× in total tokens |
| $ → burn weight | Combines both errors above |

Empirical pairings observed within one session are NOT rates. "27pp burned during a $9 run" describes that run; it is not a coefficient.

### Discipline

1. Decide on burn weight directly (CC stdin)
2. Pace on observed burn rate (query last 5–10 min of `api_requests`, attribute to your traffic)
3. Use tokens to explain what HAPPENED, never to predict what WILL happen
4. Ignore dollars except where API contract forces them (`--max-budget-usd`)
5. Trust live readings over recalled values; this doc may rot

---

## §1 The Platform (brief facts)

- **Two rolling windows**: 5h (primary; binding in 100% of recent observations) + 7d (secondary; never binding observed)
- **State machine**:

| State | Util range | Behavior |
|---|---|---|
| `allowed` | 0–90% | Normal |
| `allowed_warning` | 90–100% | Calls succeed; warned |
| `rejected` | 100%+ | Call rejected; `retry-after` populated |

- **Util is composite** — not linear in tokens. `unified_representative_claim` indicates the binding sub-limit (almost always `five_hour`).
- **Fallback factor**: `unified_fallback_pct = 0.5` on current Max plan. A value ≠ 0.5 signals plan-tier change.

---

## §2 Headers — Glossary (the map)

Source of capture: `/Users/nathanielcannon/Claude/Alfred-Dev/usage-proxy/proxy.py:222-295`. All `anthropic-*` headers stored verbatim in `raw_headers` JSONB; typed columns extracted.

### §2.1 Unified composite (authoritative)

| Column | Header | Type |
|---|---|---|
| `unified_status` | `anthropic-ratelimit-unified-status` | text |
| `unified_5h_status` | `anthropic-ratelimit-unified-5h-status` | text |
| `unified_5h_utilization` | `anthropic-ratelimit-unified-5h-utilization` | numeric 0.0–1.0+ |
| `unified_5h_reset` | `anthropic-ratelimit-unified-5h-reset` | timestamptz |
| `unified_7d_status` | `anthropic-ratelimit-unified-7d-status` | text |
| `unified_7d_utilization` | `anthropic-ratelimit-unified-7d-utilization` | numeric |
| `unified_7d_reset` | `anthropic-ratelimit-unified-7d-reset` | timestamptz |
| `unified_representative_claim` | `anthropic-ratelimit-unified-representative-claim` | text (binding sub-limit) |
| `unified_fallback_pct` | `anthropic-ratelimit-unified-fallback-percentage` | numeric (plan discount) |
| `unified_overage_disabled` | `anthropic-ratelimit-unified-overage-disabled-reason` | text |

### §2.2 Granular rate limits (NULL on Max — do not depend on)

`rl_requests_limit/remaining`, `rl_tokens_limit/remaining`, `rl_input_remaining`, `rl_output_remaining`.

### §2.3 Fast-lane + retry

`fast_input_remaining`, `fast_output_remaining` (variable; only when fast lane invoked), `retry_after_secs` (set on `rejected`), `http_status`.

### §2.4 Token accounting (response body, not headers)

| Column | Notes |
|---|---|
| `input_tokens` | NEW input only (excludes cache_read). `input_tokens=1` means everything matched cache except 1 token |
| `output_tokens` | Generated output |
| `cache_read_tokens` | Served from cache |
| `cache_write_tokens` | Written to fresh cache — **order-of-magnitude bigger per-token burn-weight contributor than cache_read** |

---

## §3 Data Flow (the map)

```
Anthropic API
     │
     ▼
Reverse proxy :9800  ──  Alfred-Dev/usage-proxy/proxy.py
     │  INSERT
     ▼
pulse_dev.api_requests  (docker aifred-dev-postgres, port 5432)
     │
     ├─►  Pulse API :8800  (Alfred-Dev/pulse/app.py)
     │       ├─►  /api/v1/usage/session-window      (latest snapshot)
     │       ├─►  /api/v1/usage/burn-rate-curve     (windows[].points[] time-series)
     │       └─►  (do not consume /session-spend-dollars; dollars are noise)
     │
     ├─►  Cost-anomaly-watcher → .claude/context/.cost-state.json → HUD
     │
     └─►  Dashboard UsagePage  (Alfred-Dev/dashboard/frontend, port 8702)

Independent path (NOT proxy-fed, NOT lagged):
  Claude Code stdin ──► jarvis-statusline-v9.sh
  (CC delivers rate_limits.five_hour.* per render — authoritative live reading)
```

---

## §4 Surface Inventory + Traps (orientation)

### §4.1 Statusline (`jarvis-statusline-v9.sh`)

Authoritative for live burn weight: the `5h:NN%` segment (sources CC stdin `rate_limits.five_hour.used_percentage`).

**Traps**:

| Display | Looks like | Actually is |
|---|---|---|
| `api%` | Rate-limit utilization | API-duration as share of wall time (efficiency metric, not quota) |
| `cache%` / `eph1h%` | Cache hit rate | Ephemeral-1h cache-creation adoption ratio |
| `$` field | Decision-relevant cost | Irrelevant per directive |

### §4.2 HUD (`jicm-watcher-hud.sh`)

Rate-limit panel currently shows `—` because `.jicm-state-hook.json.{rate_5h,rate_7d}_pct` are written as `null` (no writer wired). Known gap; do not rely on HUD for burn weight until fixed.

Cost-anomaly panel works (reads `.cost-state.json`).

### §4.3 Cost-anomaly-watcher (`cost-anomaly-watcher.sh`)

**Trap**: `window_5h.elapsed_seconds` is **age of the oldest row in the last 5h of proxied traffic**, NOT elapsed time since the Anthropic window opened. After 2h idle, elapsed_seconds ≈ 7200.

### §4.4 Burn-rate-curve endpoint (`pulse/app.py:2632-2690`)

**Trap**: `elapsed_seconds_in_window` is time since the first **proxy-captured call** in this window, NOT time since the Anthropic window opened. Pre-Jarvis-activity time is invisible.

**Trap**: `cumulative_tokens` = `SUM(input_tokens + output_tokens)` ONLY. **Cache_read and cache_write are excluded.** Massive under-count of actual context size.

### §4.5 Dashboard UsagePage (`Alfred-Dev/dashboard/frontend/src/pages/UsagePage.tsx`)

- Per-window least-squares regression (305-332)
- Cross-window through-origin regression (1838-1849) — physics-grounded (util=0 at hour 0)
- Tiered y-axis (346-356) — cap 10/25/100 by util level
- Sustainable-burn reference line (1874-1877) — y=x from (0,0) to (5,100)
- Governing-window label from `unified_representative_claim`
- 10s refetch

### §4.6 Gap inventory (fields recorded, not surfaced anywhere)

`fast_input_remaining`, `fast_output_remaining`, `unified_overage_disabled`, `rl_requests_limit/remaining`, HUD's null `rate_5h/7d_pct`.

---

## §5 Call Signature Quick-Reference

Modal patterns observed in proxy data; use for postmortem attribution only:

| Kind | Signature | Typical source |
|---|---|---|
| IDE turn (cache-hit) | cache_read ~150–200K · cache_write ~1K · output 100–2000 · input ~1 | Normal IDE conversation, tool-loop continuation |
| Headless fresh cell | cache_write 30–65K · cache_read 16–26K · input ~6 · output 30–300 | `claude -p` first call in new prefix |
| Headless cache-hit cell | cache_write 1–5K · cache_read 60–180K · input ~6 · output 30–300 | Same-mode subsequent `claude -p` calls |
| Cheap short | cache_read <20K · output <300 | Hooks, status fetches |

---

## §6 Window Shape Archetypes (orientation only)

| Archetype | Peak util | Curve shape |
|---|---|---|
| Idle | <10% | Flat near zero |
| Mixed-light | 20–50% | Linear ramp |
| Workload | 50–90% | Step-function (phases of activity) |
| Saturated | 100%+ | Pre-burst ramp + intense burst + trailing wrap |

**Inverse cache-hit rule**: window cache-hit % ≥ 95% → operating efficiently. ≤ 80% → substantial fresh cache_write in flight. (Empirical from 35-window survey.)

---

## §7 Rules: Headless `claude -p` Is High-Risk

1. **Fresh subprocess pays the cache-registration tax** (~40K project context per cold call). Cache_write is order-of-magnitude bigger per-token burn weight than cache_read.
2. **Tool propagation unreliable with `--output-format json`** — drops `tool_use` blocks. Use `--output-format stream-json` to verify tool calls happened.
3. **Concurrent bursts compound linearly.** N parallel cells = N parallel cache_writes; the proxy does not dedupe shared prefixes across concurrent calls.
4. **No automatic pacing.** Bash spawns as fast as it can; a 30-cell harness in 4 min has been observed to move burn weight ~27pp.
5. **`--system-prompt` and `--system-prompt-file` strip ~27K cache_write of Anthropic-side content** (system prompt + CC tool catalog), but `@`-imported project content (CLAUDE.md, MEMORY.md, scratchpad, psyche/) survives — it's merged BEFORE the system-prompt boundary by the CC harness. Per-cell cost savings: ~32%. Functional consequences: NONE for governance/identity/MCP awareness (v6 probes A1-A5, C1 all preserved). `--append-system-prompt` adds content WITHOUT replacing, so cache footprint is unchanged from default.
6. **Subprocess inheritance: MCPs propagate and are invocable; plugins do not.** v6 C1 evidence: all four functional strip modes passed MCP-invocation test (`mcp__jarvis-rag__search` via `ToolSearch` deferred-load). Plugin awareness (P1) uniformly fails — including M-D control — so plugins are structurally invisible in `claude -p`, not a strip-mode effect. Hooks and env propagation not yet tested.
7. **`--bare` strips the authentication chain, not just content.** Every `--bare` cell returns `"Not logged in · Please run /login"` at $0 cost with zero tokens. Use only as a capability-ceiling test (what fails when EVERYTHING is gone), not as a content-strip baseline. For content-strip comparisons, use `--system-prompt` or `--system-prompt-file`.

---

## §8 Rules: Interactive IDE Is More Efficient

1. Persistent `cache_control` across turns → per-turn `input_tokens` often = 1.
2. Volume cache-hit ≥ 95% on IDE-only windows.
3. **Tool-call multiplier**: each substantive IDE turn fires 3–5 API calls (initial → tool_use → tool_result → continuation). Each call re-loads the full cached prefix.
4. Heavy parallel tool dispatch within a single turn is MORE efficient than the same tools serialized across multiple turns — the cache prefix is stable within a turn but may shift between turns.

---

## §9 Operational Rules: Efficient Multi-Task Headless

1. **Extend-then-fork** (v3 finding). One `--resume` extension on the parent → N `--fork-session` children. Cache_write per child drops by ~order-of-magnitude versus forking the bare parent.
2. **Per-cell circuit breaker**: pass `--max-budget-usd 1.50` (or similar) to every headless cell. Dollar-denominated by API contract; functions as a runaway-cell killer.
3. **Cumulative-burn abort**: track observed Δburn weight per cell; abort harness if cumulative exceeds tolerance. API-reported `cost_usd` as fallback proxy (with §0 no-conversion caveat).
4. **Pre-flight burn-weight check**: refuse to start a burst-style workload if util > 75%.
5. **Same-mode batching**: cells in order A, A, A, B, B share prefix cache; alternating A, B, A, B does not.
6. **Trust CC stdin live; proxy DB for history.** Stdin is per-render-fresh; DB lags by one API roundtrip.
7. **`--output-format stream-json` for tool tracking.** JSON format drops tool_use events.
8. **85% = stop new experiments. 95% = stop everything but cleanup-and-commit.** Empirical 14-day distribution: only 0.24% of calls in `rejected`. Respect the warning band.
9. **Plan headless bursts AFTER deliberation, not during.** Deliberation has its own sustained burn (observed range ~0.3–1.5 pp/min depending on tool density).

---

## §10 Self-Awareness Realizations

1. I AM the consumer. Every Read, Edit, Bash, Grep, file-touch, agent dispatch, MCP call I issue is an API call.
2. My substantive turns are 3–5 API calls each, not one.
3. Deliberation is not free. A long design session can eat 20–40 pp of headroom with no experiments running.
4. Bursts are categorically different from IDE work. Check headroom BEFORE starting a burst, not during.
5. The statusline shows me CC's authoritative burn weight. Glance routinely.
6. Dashboard is for retrospective shape; statusline is for live decisions.
7. **The 90% `allowed_warning` is my real ceiling.** 100% is the cliff. Treat 85% as the "stop new experiments" threshold.
8. 5h-window is what matters. 7d is almost never binding (`unified_representative_claim = 'five_hour'` consistently).
9. **Dollars are noise.** Burn weight is the metric. Never convert across tiers (see §0).
10. When uncertain about platform state, query the proxy DB. 14d of ground truth is available. See [[feedback_empirical_before_claim]].

### §10.1 Self-knowledge amendment — empirical grounding for general claims

**Rule**: any general conclusion or behavior-shaping claim I emit must be empirically grounded in cite-able evidence AT THE TIME OF CLAIM. Plausible-sounding reasoning is not evidence. Cached recollection from prior sessions is not evidence. Derivation that crosses the §0 metric tiers is not evidence.

**What counts as grounding**:
- A query I just ran against `api_requests` (or other data source) and read the result of
- A file I just opened and read the relevant content of
- A live header value I just received from an API call I made
- A code path I just traced and can cite with `file:line`

**What does NOT count**:
- "Last session I observed…" (rotting recollection)
- "Per the v4 article…" (was true at writing; verify still true)
- "Generally / typically / usually…" (no specific evidence)
- "Derived from per-token pricing…" (cross-tier derivation per §0)

**When I lack grounding**: I must say so plainly — "I don't have a current observation for this; would need to query/read/verify before claiming" — and either gather the evidence or decline the claim. This rule extends [[feedback_empirical_before_claim]] from "cost/util/cache assertions" to ALL behavior-shaping claims.

---

## Reference paths (the breadcrumbs)

| Surface | Path | Lines |
|---|---|---|
| Reverse proxy | `/Users/nathanielcannon/Claude/Alfred-Dev/usage-proxy/proxy.py` | 154-295 |
| Pulse API server | `/Users/nathanielcannon/Claude/Alfred-Dev/pulse/app.py` | 1938, 2632-2690 |
| Statusline v9 | `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jarvis-statusline-v9.sh` | 543-797 |
| Cost-anomaly-watcher | `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cost-anomaly-watcher.sh` | 74-134 |
| HUD | `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-watcher-hud.sh` | 51, 843-864 |
| Dashboard UsagePage | `/Users/nathanielcannon/Claude/Alfred-Dev/dashboard/frontend/src/pages/UsagePage.tsx` | 305-356, 1828-1877 |
| v3 cache findings | `projects/project-aion/reports/fork-cache-validation-v3-findings-2026-05-21.md` | — |
| v4 cache article | `projects/project-aion/reports/claude-code-cache-mechanics-2026-05-22.md` | §3.2.1, §5.4 |
| v5 G script | `.claude/scripts/cache-mechanics-v5-arm-g.py` | — |
| v5 E/F script | `.claude/scripts/cache-mechanics-v5-strip-effect.py` | — |
| v5 design doc | `projects/project-aion/designs/current/cache-mechanics-v5-arm-redesigns.md` | — |
| v6 E/F script | `.claude/scripts/cache-mechanics-v5-strip-effect-v6.py` | — |
| v6 findings | `projects/project-aion/reports/cache-mechanics-v5-strip-effect-v6-findings.md` | §6.1-§6.8 |
| Memory: empirical-before-claim | `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/memory/feedback_empirical_before_claim.md` | — |

---

*Force-loaded via CLAUDE.md `@`-import. Re-read when planning headless work, monitoring burn weight, or before making behavior-shaping claims about the platform. Update only with empirically-grounded findings; never from speculation.*
