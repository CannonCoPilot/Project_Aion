# Insights Archive — 2026-06-13
# Rotated: 2026-06-13T16:03:11Z (8 entries)

### 2026-05-21 [197c81186ede]

The real mechanism revealed by the cache numbers: cache hits require a 
byte-exact match to a previously-committed cache_control endpoint. Each 
claude -p call places its marker BEFORE the new user message. Walk through 
the data:
  • C0_P commits cache at [SP+tools] only (marker was before C0_P's first 
    user message; no prior turns exist)
  • C1 forks from P → prefix [SP+tools+P+C1_user]; cache lookup finds only 
    [SP+tools] match → hits 17K floor, writes the rest
  • C1a forks from C1 → prefix [SP+tools+P+C1+C1a_user]; C1's commit cached 
    [SP+tools+P+C1] → full hit, 55K cache_read
  • D2 forks from D0's sid AFTER D1 extended it → prefix [SP+tools+D0+D1+D2_user]; 
    D1's commit cached [SP+tools+D0+D1] → full hit
This means C1/C2 paid the "first fork tax" because P had no extension turn
before forking. D2/D3 didn't, because D1 had committed cache to the post-
extension prefix. ACTIONABLE: to cheaply spawn N parallel sub-jobs from a 
parent, run ONE --resume on the parent first to commit cache, THEN fork all 
N children. The fork tax becomes one extension tax instead of N fork taxes.

### 2026-05-22 [ff017f56d852]

The deepest takeaway from v3 isn't any single finding — it's that v2's
methodology (identical prompts everywhere) made cache and context
INSEPARABLE. v2 could not tell whether a cache hit came from session 
inheritance or from prompt-byte identity, so its conclusions were 
unfalsifiable. The fix that mattered most in v3 wasn't adding arms or 
repeats — it was varying prompts cell-to-cell so that ANY cache_read 
above the ~17K floor became unambiguous evidence of session-attributable
inheritance. Methodology > sample size when the methodology has a
confound.

### 2026-05-22 [f2b0ac386c5c]

Decision point reached. Alfred-Dev compose project resolves to `/Users/nathanielcannon/Claude/Alfred-Dev` with files `docker-compose.yml + docker-compose.dev.yml`. HUD launches via `jicm-watcher-hud.sh`. Re-running `launch-jarvis-tmux.sh` is **dangerous** here — it would spawn a duplicate W0 Claude session (this conversation runs outside tmux) and create duplicate Watcher/Ennoia/Virgil processes alongside the orphans. The surgical path is: restart dead containers, start MLX/LiteLLM in a fresh tmux session, leave the orphan Quartet alone (they work; relocating them would interrupt the live Watcher).

### 2026-05-22 [282a975550c0]

The launcher has **two session-resolution paths** that diverged from the original "static UUID" intent:

1. **`--fresh` mode** (line 506-514): Uses the deterministic UUID `17612316...` with `--session-id`. This is the "static" behavior you expected.

2. **Default (resume) mode** (line 516-524): Uses `find_latest_w0_session()` — a heuristic that picks the most-recent-by-mtime JSONL file, excluding W5. The comment at line 504 explains the why: *"JICM /clear creates new session UUIDs, so we can't pin W0 to a deterministic UUID."*

The problem: every JICM `/clear` cycle creates a **new** UUID, orphaning the deterministic one. The `find_latest_w0_session()` heuristic was the pragmatic workaround — but it's fragile. After your system restart, this session became the most recent, displacing `7fde1edb` from the "most recent" slot. You now have **339 JSONL files** in the project directory, most spawned by JICM cycles and experiment runs (the May 20 cluster alone produced ~20 sessions in 4 minutes from the token-compression experiments).

### 2026-05-22 [0f276bdb690b]

The tmux session was actually running the entire time. The initial "no server running" error came from the default tmux socket at `/private/tmp/tmux-501/default` being stale — the `$HOME/bin/tmux` binary (which we always use per MEMORY.md) connects through a different socket and finds the session fine. This is a classic macOS gotcha: multiple tmux binaries with different socket defaults.

The session has all 8 windows (W0-W7), including LiteLLM at W7. But the LiteLLM health check fails — let me diagnose.

### 2026-05-22 [f553efb6c1a0]

The initial "outage" diagnosis overstated the damage because the first tmux check used the wrong socket. The Jarvis tmux session (W0-W7) was running throughout — started ~18 minutes before this session. Docker containers self-healed via restart policies (usage-proxy recovered on its own; vite dashboard needed a manual `docker restart`). The real gap was the **LiteLLM `/health` vs `/v1/models` endpoint mismatch** — a useful lesson: LiteLLM's `/health` endpoint probes all downstream backends and will hang or timeout if any model server is slow, while `/v1/models` is a lightweight metadata check. The launcher script correctly uses `/v1/models` in its preflight, but external monitoring should match.

### 2026-05-22 [84a3a4cf39b6]

`7fde1edb` completed its lifecycle: JICM resumed → committed `ff15898` (token compression research) → pushed to `CannonCoPilot/Jarvis` → hit ConnectionRefused (outage) → died. All its work is safely committed. Resuming it would bring back a dead conversation with a ConnectionRefused error as the last exchange — not useful.

The state file should point to `fd147568` (this session), which IS the active W0. The session-start hook change hasn't taken effect yet (hooks are process-cached), so the file still says `7fde1edb` from my manual seed.

### 2026-05-22 [44128bc1439d]

My earlier analysis was wrong when I said `7fde1edb` was "dead — work completed." I only looked at the *last assistant message* ("No response requested") and the commit near the end, without tracing the session's final user prompt. The commit (`ff15898`) happened EARLIER in the session; your v4 prompt came AFTER it at line 585. The outage killed the API before the model could even start thinking about your v4 request. This is the session-forensics equivalent of reading the last page of a chapter instead of the last page of the book — the real ending was 32 lines later.

# Insights Archive — 2026-06-13
# Rotated: 2026-06-14T03:33:43Z (3 entries)

### 2026-05-22 [90bab6026d69]

After a system restart, the correct diagnostic order is: (1) check what's actually running, (2) find the documented restore protocol, (3) execute restore in dependency order (databases before services, services before proxies). Never bring up services before their backing databases are healthy.

### 2026-05-22 [20850eabd8c7]

The `wonderful_feynman` container that briefly appeared was a short-lived Docker container that ran a command and exited — normal behavior for one-shot containers (e.g., `docker run` for a migration or health-check script). The name auto-assigned confirms it wasn't a named service.

### 2026-05-22 [625f98fe05b0]

The TTL probe hit an unexpected API 429 — "session limit resets at 3:20pm
Denver" (21:20Z), which IS our 5h window reset. Pulse burn-rate reported
1% util pre-run and didn't move much during main experiments, so this
exposes a real discrepancy between our local proxy's view (1%) and 
Anthropic's actual server-side counter (100%, hit during idle wait). 
Possibilities: (a) other workspace processes burning through Anthropic 
unrecorded by :9800; (b) prior 5+ hours of work counts cumulatively at 
the API level; (c) proxy missed traffic. Whatever the cause, the practical 
takeaway is sharper than a clean TTL number would have been: the local 
%-utilization metric I've been using as the "burden" gauge is NOT a 
reliable predictor of the API's actual rate-limit state. Confirms the 
"utilization-as-resource" reframe at a deeper level — even the resource 
counter we trust can be wrong about how much resource we have left.

