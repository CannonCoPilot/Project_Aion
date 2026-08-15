#!/bin/bash
# ============================================================================
# jicm-config.sh — Shared JICM Path Configuration (v7.9)
# ============================================================================
#
# Single source of truth for all JICM file paths and thresholds.
# Sourced by: jicm-watcher.sh, jicm-prep-context.sh, jicm-gate.sh,
#             jicm-stop.sh, jicm-state-update.sh, session-start.sh
#
# v7.9 additions (signal-driven actuator architecture):
#   - JICM_STATE_HOOK_FILE: written by jicm-gate.sh on every UserPromptSubmit
#   - JICM_CLEAR_SIGNAL:    written by jicm-stop.sh; consumed by watcher
#   - JICM_RESUME_SIGNAL:   written by session-start.sh on resume injection
#
# All paths are relative to PROJECT_DIR which each consumer may override
# before sourcing (defaults to $CLAUDE_PROJECT_DIR or $HOME/Claude/Project_Aion).
# ============================================================================

# Project root
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"

# --- v7.9 signal protocol (per roadmap §4.2) --------------------------------
JICM_STATE_HOOK_FILE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
JICM_CLEAR_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-clear-now.signal"
JICM_RESUME_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"

# --- Active state files -------------------------------------------------------
# COMPRESSED_FILE / COMPRESSION_SIGNAL are DEFAULT-guarded (not clobbered) so a
# consumer may override the output target per-invocation before sourcing — e.g.
# the dev-lane self-refresh actuator (jicm-self.sh) redirects them to
# .compressed-context-ready.dev.md / .compression-done.dev.signal so its prep run
# never overwrites W0's shared checkpoint. Unset → identical W0 default (no-op).
# This also makes jicm-prep-context.sh's `OUTPUT="${JICM_COMPRESSED_FILE:-…}"`
# override actually take effect (previously dead — clobbered by this source).
JICM_COMPRESSED_FILE="${JICM_COMPRESSED_FILE:-$PROJECT_DIR/.claude/context/.compressed-context-ready.md}"
JICM_COMPRESSION_SIGNAL="${JICM_COMPRESSION_SIGNAL:-$PROJECT_DIR/.claude/context/.compression-done.signal}"
JICM_COMPRESSION_GUARD="$PROJECT_DIR/.claude/context/.compression-in-progress"
JICM_EXIT_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal"
JICM_SLEEP_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-sleep.signal"   # written by AC-10 Ulfhedthnar to suppress JICM
JICM_PID_FILE="$PROJECT_DIR/.claude/context/.jicm-watcher.pid"
JICM_STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state"            # read by HUD (jicm-watcher-hud.sh)
W0_UUID_FILE="$PROJECT_DIR/.claude/context/.current-w0-uuid"          # current W0 session UUID (launcher reads, session-start writes)

# --- Multi-session (JICM v9) — registry + per-key namespaced paths ------------
# v9 manages N sessions, each with a stable <key> (w0, dev, protos, chain-<id>…).
# `jicm_key_paths <key>` populates JK_* for that session:
#   key=w0  → the LEGACY single-session paths above, BYTE-IDENTICAL (back-compat
#             during migration — the v7.9 watcher keeps working until Phase 3).
#   else    → namespaced under jicm/ so no two sessions ever collide.
JICM_DIR="$PROJECT_DIR/.claude/context/jicm"
JICM_REGISTRY_DIR="$JICM_DIR/registry"
JICM_SIGNALS_DIR="$JICM_DIR/signals"
JICM_STATES_DIR="$JICM_DIR/state"
JICM_CHECKPOINTS_DIR="$JICM_DIR/checkpoints"
# Continuity ledger (v9 stage ①/②). `/clear` mints a NEW session with zero inherited history and
# records the lineage edge NOWHERE, so we write that edge ourselves: one append-only JSONL per key.
# Uniform for every key including w0 — the file is new, so there is no legacy layout to preserve.
JICM_CHAIN_DIR="$JICM_DIR/chain"
JICM_DIGESTS_DIR="$JICM_DIR/digests"

# Session-digest shipping config — ONE definition, shared by the pre-warm (jicm-prewarm.sh) and
# the real digest (jicm-actuate.sh step 3.5). These MUST be identical: the warm's whole value is
# that the digest re-sends a byte-identical prompt prefix, so any drift between the two silently
# wastes every warm — and the symptom is invisible, indistinguishable from a slow model.
# Settled empirically (see .claude/scripts/jicm-digest/OPTIMUM.md):
#   32B over 8B          — 8B wins under ~20K tok but collapses above it, and abandoned sessions
#                          are large BY DEFINITION; both its fabrications were on large inputs.
#   --grounded           — fact-sheet grounding; what drove hallucination to ~0.
#   --reason-cap 300     — faster AND better (215s->131s, recovery doubled). Cliff at 150.
#   --order recency      — +0.03 over freq, deconfounded (B4).
#   --layout tx          — transcript first: enables prefix reuse at all (B2).
#   --fs-allowance 900   — constant reservation so the trim point is sheet-independent (B5).
#   --trim-quantum 4000  — a warm survives ~4000 tok of growth. NOT free: trimming costs recovery,
#                          so keep this as small as the soft->hard gap allows.
JICM_DIGEST_MODEL="${JICM_DIGEST_MODEL:-qwen3-32b-nothink:latest}"
JICM_DIGEST_ARGS="--model $JICM_DIGEST_MODEL --grounded --reason-cap 300 --temp 0 --npred 2200 \
--order recency --layout tx --fs-allowance 900 --trim-quantum 4000"

jicm_key_paths() {
    local key="${1:?jicm_key_paths: key required}"
    JK_KEY="$key"
    JK_REGISTRY="$JICM_REGISTRY_DIR/$key.json"
    JK_CHAIN="$JICM_CHAIN_DIR/$key.jsonl"
    if [[ "$key" == "w0" ]]; then
        # Byte-identical legacy paths — DO NOT change (W0 back-compat).
        JK_STATE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
        JK_CLEAR_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-clear-now.signal"
        JK_RESUME_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"
        JK_COMPRESSION_SIGNAL="$PROJECT_DIR/.claude/context/.compression-done.signal"
        JK_COMPRESSED="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
        JK_COMPRESSION_GUARD="$PROJECT_DIR/.claude/context/.compression-in-progress"
        JK_METADATA="$PROJECT_DIR/.claude/context/.jicm-last-compression.json"
        JK_METRICS="$PROJECT_DIR/.claude/logs/context-window-metrics.jsonl"
        JK_JSONL_STATS="$PROJECT_DIR/.claude/context/.jsonl-compression-stats.json"
        JK_SCROLLBACK="$PROJECT_DIR/.claude/context/.pre-clear-scrollback.md"
        JK_SCROLLBACK_SUMMARY="$PROJECT_DIR/.claude/context/.pre-clear-scrollback-summary.md"
        # H3 — shared-memory inputs. w0 = the legacy shared files (byte-identical).
        JK_SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"
        JK_SCRATCHPAD="$PROJECT_DIR/.claude/context/.scratchpad.md"
        JK_ACTIVE_PLAN="$PROJECT_DIR/.claude/context/.active-plan"
    else
        JK_STATE="$JICM_STATES_DIR/$key.json"
        JK_CLEAR_SIGNAL="$JICM_SIGNALS_DIR/clear-now.$key.signal"
        JK_RESUME_SIGNAL="$JICM_SIGNALS_DIR/resume-complete.$key.signal"
        JK_COMPRESSION_SIGNAL="$JICM_SIGNALS_DIR/compression-done.$key.signal"
        JK_COMPRESSED="$JICM_CHECKPOINTS_DIR/$key.compressed.md"
        JK_COMPRESSION_GUARD="$JICM_SIGNALS_DIR/compression-in-progress.$key"
        JK_METADATA="$JICM_STATES_DIR/$key.last-compression.json"
        JK_METRICS="$PROJECT_DIR/.claude/logs/context-window-metrics.$key.jsonl"
        JK_JSONL_STATS="$JICM_STATES_DIR/$key.jsonl-compression-stats.json"
        JK_SCROLLBACK="$JICM_CHECKPOINTS_DIR/$key.scrollback.md"
        JK_SCROLLBACK_SUMMARY="$JICM_CHECKPOINTS_DIR/$key.scrollback-summary.md"
        # H3 — per-session shared-memory inputs (never share w0's global session-state /
        # scratchpad / active-plan). Consumed once the actuator's prep is wired (R2).
        JK_SESSION_STATE="$JICM_STATES_DIR/$key.session-state.md"
        # SINGLE SOURCE OF TRUTH (2026-08-12). This pointed at
        # $JICM_CHECKPOINTS_DIR/$key.scratchpad.md while session-start.sh and the
        # actuator's resume nudge both sent the session to .claude/context/.scratchpad.$key.md
        # — so the WRITE side and the READ side of the scratchpad named different files, and
        # which one held the content varied by lane: dev's real 19.8KB working doc sat at
        # .scratchpad.dev.md while prep was handed a checkpoints/ path that did not exist,
        # and genie/jaques had it exactly backwards. Prep was therefore reading an absent
        # file for dev. Aligned to the convention w0 already uses (.claude/context/
        # .scratchpad.md) and that the resume path actually reads.
        JK_SCRATCHPAD="$PROJECT_DIR/.claude/context/.scratchpad.$key.md"
        JK_ACTIVE_PLAN="$JICM_STATES_DIR/$key.active-plan"
    fi

    # L4/L5 namespace per key. Added 2026-08-11 after the first live Genie cycle put
    # 93 points of microbiology into Jarvis's shared `sessions` collection.
    #
    # The namespace separation had been enforced ONLY in the interactive lane's launcher
    # env (JICM_RAG_COLLECTION / GRAPHITI_GROUP_ID exported to the Claude process). The
    # actuator is a DETACHED process spawned from whatever shell fired it — it never sees
    # that env, so it fell through to the global `sessions` default. Deriving from the key
    # here puts the routing in the same place as every other per-key artifact, where it
    # cannot be bypassed by whoever happens to spawn the cycle.
    case "$key" in
        genie|genie-bg-*)   JK_RAG_COLLECTION="genie-sessions";  JK_GRAPHITI_GROUP="genie-core" ;;
        jaques|jaques-bg-*) JK_RAG_COLLECTION="jaques-sessions"; JK_GRAPHITI_GROUP="jaques-core" ;;
        *)                  JK_RAG_COLLECTION="sessions";        JK_GRAPHITI_GROUP="jarvis-core" ;;
    esac
}

# Registry helpers (shared by gate upsert, supervisor read/GC, chain bridge).
# One JSON file per key under registry/. Merge-upsert keeps registered_at, stamps last_seen.
jicm_registry_upsert() {   # jicm_registry_upsert <key> [field=value ...]
    local key="${1:?jicm_registry_upsert: key required}"; shift
    mkdir -p "$JICM_REGISTRY_DIR" 2>/dev/null
    local f="$JICM_REGISTRY_DIR/$key.json" now base filter kv k v
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # C1 — occupancy-anchored compare-and-swap (JICM v9 R1). Refuse to clobber the key's
    # session_id ONLY when the stored (different) claimant is LIVE and actually OCCUPIES the
    # key's pane — a genuine same-pane conflict (H2). A stale/fork claimant that is not in
    # the pane is NOT a conflict: the real occupant is allowed to reclaim (prevents a
    # migration deadlock where a leftover polluted entry blocks the pane's rightful owner).
    local incoming_sid="" stored_sid pane_sid
    for kv in "$@"; do [[ "${kv%%=*}" == "session_id" ]] && incoming_sid="${kv#*=}"; done
    if [[ -f "$f" && -n "$incoming_sid" ]]; then
        stored_sid="$(jq -r '.session_id // empty' "$f" 2>/dev/null)"
        if [[ -n "$stored_sid" && "$stored_sid" != "$incoming_sid" ]] && jicm_session_alive "$stored_sid"; then
            pane_sid="$(jicm_pane_session "$(jicm_default_target "$key")")"
            if [[ -n "$pane_sid" && "$pane_sid" == "$stored_sid" ]]; then
                printf '%s registry-conflict key=%s stored=%s(live,in-pane) incoming=%s — refusing clobber\n' \
                    "$now" "$key" "$stored_sid" "$incoming_sid" >> "$PROJECT_DIR/.claude/logs/jicm-registry-conflicts.log" 2>/dev/null
                return 3
            fi
        fi
    fi
    base='{}'; [[ -f "$f" ]] && base="$(cat "$f" 2>/dev/null || echo '{}')"
    local jqargs=(--arg key "$key" --arg ls "$now")
    filter='.key=$key | .last_seen=$ls | (.registered_at //= $ls)'
    for kv in "$@"; do
        k="${kv%%=*}"; v="${kv#*=}"
        jqargs+=(--arg "f_$k" "$v"); filter="$filter | .[\"$k\"]=\$f_$k"
    done
    printf '%s' "$base" | jq "${jqargs[@]}" "$filter" > "$f.tmp.$$" 2>/dev/null && mv "$f.tmp.$$" "$f" || rm -f "$f.tmp.$$" 2>/dev/null
}
jicm_registry_keys() { ls -1 "$JICM_REGISTRY_DIR"/*.json 2>/dev/null | sed 's|.*/||; s|\.json$||'; }
jicm_registry_get()  { jq -r "${2:?field}" "$JICM_REGISTRY_DIR/${1:?key}.json" 2>/dev/null; }  # get <key> <jq-filter>

# Identity derivation — shared by jicm-gate.sh + jicm-stop.sh so they ALWAYS agree on
# the key. ROLE=dev → dev; JARVIS_WINDOW=0 → w0; else the given session_id ($1). This
# Jarvis hook domain only ever sees w0 + dev (Protos/chains run Alfred's hooks and
# register via the bridge). launch-aion.sh exports JARVIS_WINDOW=0 for W0 and
# JARVIS_SESSION_ROLE=dev for the dev lane; both propagate to hook child processes.
# Precedence (order is load-bearing):
#   1. JARVIS_WINDOW==0 → w0 FIRST (a per-pane value W0 always sets), so a leaked
#      ambient JARVIS_SESSION_ROLE=dev in W0's env can NEVER misroute W0's state into
#      dev's namespace ([[reference_dev_lane_hook_testing_role_leak]] class).
#   2. ROLE==dev → dev. dev sets JARVIS_WINDOW=5 OR leaves it unset; either way the
#      role arm (checked before the unset-window arm) claims it.
#   3. JARVIS_WINDOW UNSET (and not dev) → w0. A W0 session resumed OUTSIDE the
#      launcher wrapper (`claude --resume <w0-uuid>`) has no JARVIS_WINDOW; it is still
#      W0 and must land on the legacy state/signal the watcher polls — NOT a stray
#      session_id namespace (which would silently blind the watcher + exclude it from
#      its own session-start injection).
#   4. else → the session_id (a genuine non-w0/non-dev lane; routes to safety paths).
jicm_derive_key() {                          # <my_session_id>
    local my_sid="${1:-}" candidate
    if   [[ "${JARVIS_WINDOW:-}" == "0" ]];         then candidate="w0"
    elif [[ "${JARVIS_SESSION_ROLE:-}" == "dev" ]]; then candidate="dev"
    # protos (aion:1) — the test lane. Checked BEFORE the unset-JARVIS_WINDOW fallback below,
    # which would otherwise hand a Protos session the w0 candidate and (via the occupancy gate)
    # a w0-bg-* key: self-actuating, no pane target, invisible to the pane-driven path we are
    # trying to test. Requires JARVIS_WINDOW=1 to be set explicitly at launch.
    elif [[ "${JARVIS_WINDOW:-}" == "1" ]];         then candidate="protos"
    # genie (aion:12) — the Research Archon. Checked BEFORE the unset-JARVIS_WINDOW
    # fallback for the same reason as protos: falling through would hand Genie the w0
    # candidate and, via the occupancy gate, a w0-bg-* key — self-actuating, paneless,
    # and sharing W0's legacy state paths. Both the role and the window are accepted so
    # the lane still resolves if one env var is lost across a resume.
    elif [[ "${JARVIS_SESSION_ROLE:-}" == "genie" || "${JARVIS_WINDOW:-}" == "12" ]]; then candidate="genie"
    # jaques (aion:13) — the Contract Archon. Same placement rule as genie/protos: BEFORE
    # the unset-JARVIS_WINDOW fallback, or it inherits the w0 candidate and a paneless
    # w0-bg-* key sharing W0's legacy state paths.
    elif [[ "${JARVIS_SESSION_ROLE:-}" == "jaques" || "${JARVIS_WINDOW:-}" == "13" ]]; then candidate="jaques"
    elif [[ -z "${JARVIS_WINDOW:-}" ]];             then candidate="w0"
    else echo "${my_sid:-unknown}"; return; fi
    # C3 OCCUPANCY GATE (JICM v9 R1): claim a pane-actuated key ONLY if I actually occupy
    # its pane. A session that carries the role but is NOT the pane's live occupant is a
    # background /fork (daemon-hosted PTY) — it gets its OWN first-class key
    # (<candidate>-bg-<sid8>): namespaced state, own HUD row, self-actuation; it can never
    # actuate the parent's pane. Pane unresolvable (empty) → keep the canonical key (no
    # regression; the supervisor's C2 re-checks occupancy at fire time as the backstop).
    if [[ -n "$my_sid" ]]; then
        local pane_sid; pane_sid="$(jicm_pane_session "$(jicm_default_target "$candidate")")"
        [[ -n "$pane_sid" && "$pane_sid" != "$my_sid" ]] && { echo "${candidate}-bg-${my_sid:0:8}"; return; }
    fi
    echo "$candidate"
}
# Canonical tmux window per key (w0→:0, dev→:11). Resolved at CALL time (JICM_TMUX_SESSION
# is defined later in this file). Empty for unknown keys — registry/actuator handle that.
jicm_default_target() {
    case "${1:-}" in
        w0)     echo "${JICM_TMUX_SESSION}:0"  ;;
        dev)    echo "${JICM_TMUX_SESSION}:11" ;;
        # protos (aion:1) — the TEST lane. A first-class pane-actuated key so live cycles
        # exercise the REAL path (pane injection, actuator, pre-warm) instead of the
        # second-class self-actuating bg key a keyless window would otherwise get. It owns
        # no work, so a cycle that goes wrong there costs nothing.
        protos) echo "${JICM_TMUX_SESSION}:1"  ;;
        # genie (aion:12) — the Research Archon. Pane-actuated like w0/dev: it holds
        # real work (a funded grant), so it gets the full cycle, not the second-class
        # self-actuating path. Must stay in step with launch-aion.sh window_target_index().
        genie)  echo "${JICM_TMUX_SESSION}:12" ;;
        # jaques (aion:13) — pane-actuated: it holds real paid client work, so it gets the
        # full cycle. Must stay in step with launch-aion.sh window_target_index().
        jaques) echo "${JICM_TMUX_SESSION}:13" ;;
        *)      echo "" ;;
    esac
}

# --- Occupancy / liveness helpers (JICM v9 R0/R1) ----------------------------
# Shared read-only probes for the supervisor's C2 signal-validation and the R1
# occupancy-keying fix. All resolve at CALL time (JICM_TMUX_BIN defined later).
# tmux calls are timeout-guarded — a WEDGED tmux server (distinct from an absent one,
# which fails fast) must never hang the gate hook, which runs on every prompt (review F4).
# Session files are named <pid>.json.
JICM_TO="$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)"  # short-timeout wrapper ("" → run bare)
#
# session-id currently running in a tmux target's pane ("" if none / no claude child).
# CALLER-BLINDNESS (verified 2026-08-12) — this probe CANNOT resolve the pane that the
# calling process itself lives in. macOS `pgrep` does not match the caller's ancestors,
# and this function is built on `pgrep -P <pane_pid>`. Demonstrated by contrast: from
# inside W11's own subtree, `pgrep -P 17378` returned empty and `pgrep -x claude` omitted
# pid 17381, while plain `ps` saw it fine; the identical probe run under the tmux server
# (via `tmux run-shell`) returned 17381 and resolved aion:11 to its true session id.
#
# CONSEQUENCES:
#   · A supervisor run BY HAND from a Claude pane is blind to that pane and will log
#     SIGNAL-UNVERIFIABLE and refuse to fire — correctly, but for a reason that looks
#     like a defect. Cost ~20 minutes of misdiagnosis before the contrast test.
#   · Under launchd/cron the supervisor descends from launchd, not from any Claude, so
#     every pane resolves. That is the supported production path.
#   · Any SELF-actuation path built on this probe is blind to its own pane by
#     construction. Do not build one without a different occupancy test.
jicm_pane_session() {                        # <tmux_target>
    local target="$1" ppid child sid
    [[ -n "$target" ]] || return 0
    ppid="$(${JICM_TO} ${JICM_TO:+2} "$JICM_TMUX_BIN" display -t "$target" -p '#{pane_pid}' 2>/dev/null)" || return 0
    [[ -n "$ppid" ]] || return 0
    for child in $(pgrep -P "$ppid" 2>/dev/null); do
        sid="$(_jicm_pid_session "$child")"
        [[ -n "$sid" ]] && { printf '%s' "$sid"; return 0; }
    done
}
# session-id for a pid — sessions files are named <pid>.json (direct read, no scan).
_jicm_pid_session() {                        # <pid>
    local pid="$1" f="$HOME/.claude/sessions/$1.json"
    [[ -n "$pid" && -f "$f" ]] || return 0
    jq -r '.sessionId // empty' "$f" 2>/dev/null
}
# Is a session-id held by a LIVE claude process? (return 0 = alive). The command==claude
# check closes a pid-reuse false-positive: a stale <pid>.json whose pid was recycled by an
# unrelated process must NOT read as alive (review F6).
jicm_session_alive() {                       # <session_id>
    local sid="$1" f pid
    [[ -n "$sid" ]] || return 1
    for f in "$HOME"/.claude/sessions/*.json; do
        [[ -f "$f" ]] || continue
        grep -q "\"sessionId\":\"$sid\"" "$f" 2>/dev/null || continue
        pid="$(basename "$f" .json)"
        [[ "$pid" =~ ^[0-9]+$ ]] || pid="$(jq -r '.pid // empty' "$f" 2>/dev/null)"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            case "$(ps -o command= -p "$pid" 2>/dev/null)" in *[Cc]laude*) return 0 ;; esac
        fi
    done
    return 1
}
# Actuation mode for a key: 'pane' if it has a canonical tmux pane to inject into, else
# 'self' — a background /fork clears itself from within (no external pane). Consumed by
# the supervisor/actuator (R2) and the multi-session HUD (R4).
jicm_actuation_mode() {                      # <key>
    [[ -n "$(jicm_default_target "$1")" ]] && echo "pane" || echo "self"
}

# --- R2 reconciliation: pane truth wins -------------------------------------
# Every namespaced artifact a key owns. Promotion migrates the WHOLE set: a partial
# move would strand state under a dead key, which is worse than not moving at all.
JICM_KEY_ARTIFACT_VARS="JK_REGISTRY JK_STATE JK_CLEAR_SIGNAL JK_RESUME_SIGNAL \
JK_COMPRESSION_SIGNAL JK_COMPRESSED JK_COMPRESSION_GUARD JK_METADATA JK_METRICS \
JK_JSONL_STATS JK_SCROLLBACK JK_SCROLLBACK_SUMMARY JK_SESSION_STATE JK_SCRATCHPAD \
JK_ACTIVE_PLAN"

# _jicm_retire_duplicate_bg <canonical> <pane_sid>
# Retire a `<canonical>-bg-<sid8>` key that names the SAME session as <canonical> itself.
#
# WHY THIS IS NOT THE GHOST CASE: a bg key is minted as `<candidate>-bg-<MY sid>`, so a
# suffix that matches the canonical entry's session_id proves both records describe ONE
# session, not a fork. The lane is double-registered: it inflates the managed set, gets a
# second HUD row, and a second `.last-sample.*`. Retiring the duplicate CANNOT unmanage the
# lane — that is precisely what distinguishes this from the delete that silently unmanaged
# Protos, and it is why identity, not liveness, is the test.
#
# Archives rather than deletes (a registry row is evidence), and MERGES the chain forward:
# lineage is append-only and must never be dropped to a cleanup.
# Sets JICM_RECONCILE_NOTE. Returns 0 retired · 1 nothing to do / deferred.
_jicm_retire_duplicate_bg() {
    local canonical="${1:?}" pane_sid="${2:?}"
    local bgkey="${canonical}-bg-${pane_sid:0:8}"
    local reg="$JICM_REGISTRY_DIR/$bgkey.json"
    [[ -f "$reg" ]] || return 1
    # Identity must be EXACT. A bg key naming a different session is a real fork — leave it.
    [[ "$(jicm_registry_get "$bgkey" '.session_id')" == "$pane_sid" ]] || return 1
    # Never yank files out from under a cycle in flight, on EITHER key.
    if [[ -f "$JICM_SIGNALS_DIR/actuating.$canonical" || -f "$JICM_SIGNALS_DIR/actuating.$bgkey" ]]; then
        JICM_RECONCILE_NOTE="defer ${bgkey}: actuation in flight"; return 1
    fi

    # Merge the bg chain into the canonical one before anything is moved (same policy as
    # the promotion path: dedupe by whole line, re-sort by ts, append raw if jq fails).
    local src_chain dst_chain tmp_chain
    jicm_key_paths "$bgkey";     src_chain="$JK_CHAIN"
    jicm_key_paths "$canonical"; dst_chain="$JK_CHAIN"
    if [[ -s "$src_chain" ]]; then
        mkdir -p "$JICM_CHAIN_DIR" 2>/dev/null
        tmp_chain="${dst_chain}.merge.$$"
        if cat "$dst_chain" "$src_chain" 2>/dev/null | awk 'NF && !seen[$0]++' \
             | jq -s -c 'sort_by(.ts)[]' > "$tmp_chain" 2>/dev/null && [[ -s "$tmp_chain" ]]; then
            mv "$tmp_chain" "$dst_chain"
        else
            rm -f "$tmp_chain" 2>/dev/null
            cat "$src_chain" >> "$dst_chain" 2>/dev/null
        fi
        rm -f "$src_chain" 2>/dev/null
    fi

    # Archive registry + state, then drop the duplicate's signals/markers.
    local adir; adir="$JICM_DIR/archive/dup-$(date -u +%Y%m%d-%H%M%S)"
    mkdir -p "$adir/registry" "$adir/state" 2>/dev/null
    jicm_key_paths "$bgkey"
    mv "$reg" "$adir/registry/$bgkey.json" 2>/dev/null
    # The sample marker has no JK_ var; the gate builds it from JK_STATE's dirname
    # (jicm-gate.sh SAMPLE_MARKER). Derive it the SAME way, and BEFORE JK_STATE moves.
    local sample_marker="$(dirname "$JK_STATE")/.last-sample.$bgkey"
    [[ -e "$JK_STATE" ]] && mv "$JK_STATE" "$adir/state/$bgkey.json" 2>/dev/null
    rm -f "$JK_CLEAR_SIGNAL" "$JK_RESUME_SIGNAL" "$JK_COMPRESSION_SIGNAL" \
          "$JK_COMPRESSION_GUARD" "$sample_marker" \
          "$JICM_SIGNALS_DIR/actuating.$bgkey.alerted" \
          "$JICM_SIGNALS_DIR/pending-noted.$bgkey" \
          "$JICM_SIGNALS_DIR/fire-log.$bgkey" \
          "$JICM_SIGNALS_DIR/fire-log.$bgkey.alerted" 2>/dev/null
    jicm_key_paths "$canonical"          # leave caller's paths on the canonical key
    JICM_RECONCILE_NOTE="RETIRED duplicate ${bgkey} (same session as ${canonical}; archived to ${adir##*/})"
    return 0
}

# jicm_reconcile_pane_key <canonical>   (w0|dev)
# Reconciles a pane-actuated key against the session ACTUALLY in its pane.
#
# WHY: jicm_derive_key is correct but races at startup. A session's session-start hook
# can fire while the pane still shows the OUTGOING occupant; it then reads "occupant is
# not me", concludes it is a background /fork, and self-demotes to <canonical>-bg-<sid8>.
# It stays mis-keyed for its whole life: its namespaced state lives under the bg key, the
# canonical key is left to a stale claimant (or, once GC'd, to nobody), and the breadcrumb
# chases whichever hook wrote last. Derive-time cannot fix this — only a later observation
# of the settled pane can. So: the pane is the truth, and this reconciles to it.
#
# Returns 0 reconciled/in-sync · 1 nothing to do (or unverifiable) · 2 genuine conflict.
# Sets JICM_RECONCILE_NOTE for the caller to log.
jicm_reconcile_pane_key() {
    local canonical="${1:?jicm_reconcile_pane_key: key required}"
    local target pane_sid cur bgkey crumb v i n moved=0
    JICM_RECONCILE_NOTE=""
    target="$(jicm_default_target "$canonical")"
    [[ -n "$target" ]] || return 1                  # self-key: no pane, nothing to reconcile
    pane_sid="$(jicm_pane_session "$target")"
    # Fail SAFE: an unresolvable pane proves nothing. Never reconcile on a blind probe —
    # that is how the startup race wrote the wrong answer in the first place.
    [[ -n "$pane_sid" ]] || return 1

    # (1) Breadcrumb — write from the UUID ACTUALLY in the pane, never the last hook
    #     writer. This alone stops the transcript resolver chasing orphaned forks.
    crumb="$PROJECT_DIR/.claude/context/.current-${canonical}-uuid"
    if [[ "$(cat "$crumb" 2>/dev/null)" != "$pane_sid" ]]; then
        printf '%s' "$pane_sid" > "$crumb" 2>/dev/null
        JICM_RECONCILE_NOTE="breadcrumb ${canonical} -> ${pane_sid:0:8}"
    fi

    # (2) Key — does the canonical key already belong to the occupant?
    cur="$(jicm_registry_get "$canonical" '.session_id')"
    if [[ "$cur" == "$pane_sid" ]]; then
        # In sync — but a startup-race demotion may STILL have left a duplicate bg key
        # naming this very session. That happens whenever the sid survives the respawn
        # (`restart-lane` resumes the same session), so promotion is never needed and the
        # GC below can never collect it either: GC's guard asks "is this session's
        # transcript stale?", and the transcript is LIVE — it belongs to the canonical
        # key. Right question for a ghost, wrong question for a duplicate. Retire it here.
        _jicm_retire_duplicate_bg "$canonical" "$pane_sid"
        return 0
    fi

    # The occupant self-demoted at derive time; its state lives under the bg key.
    bgkey="${canonical}-bg-${pane_sid:0:8}"
    [[ -f "$JICM_REGISTRY_DIR/$bgkey.json" ]] || return 1
    [[ "$(jicm_registry_get "$bgkey" '.session_id')" == "$pane_sid" ]] || return 1

    # Safety: never yank files out from under a cycle in flight, on EITHER key.
    if [[ -f "$JICM_SIGNALS_DIR/actuating.$canonical" || -f "$JICM_SIGNALS_DIR/actuating.$bgkey" ]]; then
        JICM_RECONCILE_NOTE="defer ${canonical}: actuation in flight"; return 1
    fi
    # Safety: never displace a canonical key still held by a DIFFERENT LIVE session. Two
    # live sessions claiming one pane is a real conflict for a human, not a thing to
    # silently resolve (No-Silent-Degradation).
    if [[ -n "$cur" && "$cur" != "null" ]] && jicm_session_alive "$cur"; then
        JICM_RECONCILE_NOTE="CONFLICT ${canonical}: pane runs ${pane_sid:0:8} but live ${cur:0:8} holds the key — NOT reconciling"
        return 2
    fi

    # PROMOTE bgkey -> canonical, migrating every artifact.
    local srcs dsts; srcs=(); dsts=()
    jicm_key_paths "$bgkey";     for v in $JICM_KEY_ARTIFACT_VARS; do srcs+=("${!v}"); done
    jicm_key_paths "$canonical"; for v in $JICM_KEY_ARTIFACT_VARS; do dsts+=("${!v}"); done
    n=${#srcs[@]}
    for (( i=0; i<n; i++ )); do
        [[ -e "${srcs[$i]}" ]] || continue
        mkdir -p "$(dirname "${dsts[$i]}")" 2>/dev/null
        rm -f "${dsts[$i]}" 2>/dev/null            # prior holder proven dead above
        mv "${srcs[$i]}" "${dsts[$i]}" 2>/dev/null && moved=$((moved+1))
    done
    # The CHAIN is deliberately NOT in JICM_KEY_ARTIFACT_VARS: that loop does `rm dst; mv src`,
    # which is right for a state snapshot and catastrophic for an append-only ledger — the
    # canonical chain holds EVERY prior session on this key and would be erased by the bg key's
    # short one. Lineage merges, it never replaces. Dedupe by whole line, re-sort by ts.
    local src_chain dst_chain tmp_chain
    jicm_key_paths "$bgkey";     src_chain="$JK_CHAIN"
    jicm_key_paths "$canonical"; dst_chain="$JK_CHAIN"
    if [[ -s "$src_chain" ]]; then
        mkdir -p "$JICM_CHAIN_DIR" 2>/dev/null
        tmp_chain="${dst_chain}.merge.$$"
        if cat "$dst_chain" "$src_chain" 2>/dev/null | awk 'NF && !seen[$0]++' \
             | jq -s -c 'sort_by(.ts)[]' > "$tmp_chain" 2>/dev/null && [[ -s "$tmp_chain" ]]; then
            mv "$tmp_chain" "$dst_chain"
        else
            # jq unavailable or a malformed row: NEVER drop lineage to a formatting failure.
            # Append raw and leave the file unsorted rather than losing an edge.
            rm -f "$tmp_chain" 2>/dev/null
            cat "$src_chain" >> "$dst_chain" 2>/dev/null
        fi
        rm -f "$src_chain" 2>/dev/null
        moved=$((moved+1))
    fi

    # The migrated registry row still says key=<bgkey> and has no pane; restate both.
    jicm_registry_upsert "$canonical" "session_id=$pane_sid" "tmux_target=$target"
    rm -f "$JICM_REGISTRY_DIR/$bgkey.json" 2>/dev/null
    JICM_RECONCILE_NOTE="PROMOTED ${bgkey} -> ${canonical} (${moved} artifact(s), target=${target})"
    return 0
}

# --- Session state files (read by prep script) -------------------------------
# DEFAULTS ONLY — must not clobber a caller's per-key choice (`:-`, not bare `=`).
# These are W0's SHARED memory files. jicm-actuate.sh exports the per-key JK_* equivalents
# before invoking the prep script, but prep SOURCES THIS FILE, so an unconditional assignment
# here silently overwrote them and prep read W0's files no matter which key it was building for.
# That is how the protos checkpoint came to carry "PALIMPSEST — POST-AUDIT VERIFICATION…" and
# sent the test lane off to run a real OCR pipeline on a live project (2026-07-29).
# A caller that has already decided which lane's memory to read must win.
JICM_SESSION_STATE="${JICM_SESSION_STATE:-$PROJECT_DIR/.claude/context/session-state.md}"
JICM_SCRATCHPAD="${JICM_SCRATCHPAD:-$PROJECT_DIR/.claude/context/.scratchpad.md}"
JICM_ACTIVE_PLAN="${JICM_ACTIVE_PLAN:-$PROJECT_DIR/.claude/context/.active-plan}"

# --- Scripts -----------------------------------------------------------------
JICM_PREP_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
JICM_INJECT_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-inject.sh"

# --- Logs, archives, metadata -----------------------------------------------
JICM_LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-watcher.log"
JICM_WATCHER_LOOP_LOG="$PROJECT_DIR/.claude/logs/jicm-watcher-loop.log"
JICM_ARCHIVE_DIR="$PROJECT_DIR/.claude/logs/jicm/archive"
JICM_METADATA_FILE="${JICM_METADATA_FILE:-$PROJECT_DIR/.claude/context/.jicm-last-compression.json}"

# --- JSONL transcript directory ---------------------------------------------
JICM_PROJECT_SLUG=$(echo "$PROJECT_DIR" | tr '/' '-')
JICM_PROJECTS_DIR="$HOME/.claude/projects/${JICM_PROJECT_SLUG}"

# --- Thresholds (token-primary per User encoding directive) -----------------
# Token thresholds preferred over percentages; pct fields display-only.
# 2026-07-27 (Sir, R3 step 2): lowered 550K/600K → 300K/330K so W0 can reach a REAL cycle
# inside one work sprint — 550K was unreachable in practice, blocking the R3 shadow
# observation. ⚠ These sit close to W0's observed operating band (255K–307K) and the older
# "~380K resume baseline" note below; if a post-clear W0 resumes ABOVE 330K it will want to
# clear again immediately. That is a circuit-breaker case (FIRE_MAX/hour + ALERT), not a
# silent loop — but restore 550K/600K once the R3 shadow evidence is captured.
# SET TO 300K/330K on 2026-08-01 (Sir's directive), together with native autocompact
# re-enabled at 80% (~800K on a 1M window) in launch-aion.sh.
#
# THRESHOLD ORDERING IS THE POINT — verify it on every change to either side:
#     JICM soft 300K  <  JICM hard 330K  <<  native autocompact ~800K
# JICM always acts first and the native compactor is a true last-resort backstop with
# ~470K of headroom. This ordering was INVERTED between 2026-07-?? and 2026-08-01: the
# launcher pinned autocompact to 50% (=500K) while these thresholds sat at 550K/600K,
# so native compaction preempted every JICM cycle and W0 could never reach soft.
# The percentage is expressed relative to the WINDOW; these are ABSOLUTE. They are
# coupled only through this comment, so re-derive the pct whenever these move.
#
# History: lowered to 300K/330K once before on the mistaken premise that JICM's W0 token
# reading was live; it was not (pinned to a dormant pre-clear session — the anchor bug),
# so lowering the bar could not have made cycles fire. That reasoning was wrong then and
# is not the reason now: the anchor bug is fixed, so 300K/330K now means what it says.
#
# Override per-session with JICM_SOFT_TOKENS/JICM_HARD_TOKENS if you want aggressive cycling
# (the protos test lane runs at 20K/25K for exactly that reason).
# Record whether these arrived from the ENVIRONMENT before the defaults below fire. Without
# this, `${VAR:-default}` makes an explicit caller override indistinguishable from the default,
# and jicm_key_thresholds could not honour "explicit env always wins".
[[ -n "${JICM_SOFT_TOKENS:-}" ]] && _JICM_SOFT_FROM_ENV=1 || _JICM_SOFT_FROM_ENV=0
[[ -n "${JICM_HARD_TOKENS:-}" ]] && _JICM_HARD_FROM_ENV=1 || _JICM_HARD_FROM_ENV=0
JICM_SOFT_TOKENS=${JICM_SOFT_TOKENS:-300000}    # 30% of 1M
JICM_HARD_TOKENS=${JICM_HARD_TOKENS:-330000}    # 33% of 1M

# Per-key threshold defaults. Called with the derived key AFTER the globals above.
#
# PROTOS runs lower than an Archon lane, on purpose. Its priority role is the SEED that the
# Alfred Pulse-Nexus manager forks tasks from, and a seed is valuable in proportion to how small
# and how default it is: every token of accumulated one-off conversation is inherited by every
# fork taken after it. So it resets early and often. It is also the cheapest lane to cycle —
# zero-state discards the session rather than compressing it, so a cycle costs no digest.
#
# THE NUMBERS ARE MEASURED, NOT CHOSEN. Live on 2026-08-15, session eefddbdf on aion:1:
#   baseline (first turn, system prompt + alfred CLAUDE.md + tools) .... 98,771 tokens
#   +1 trivial message ................................................. 98,841  (+70)
#   +1 ................................................................. 98,913  (+72)
#   +1 ................................................................. 98,985  (+72)
# So the FLOOR is ~98.7K and conversational climb is ~71 tok/turn. Tool-heavy turns are orders
# of magnitude larger (jaques once went 0 -> 127K in a SINGLE turn), which is what the headroom
# below is actually sized for — not the 71.
#
# An earlier version of this function set 20K/25K, copied from a stale code comment instead of
# measured. That is BELOW the floor: Protos would have been 4x over its hard threshold at birth,
# and since every zero-state reset respawns it right back to ~98.7K, it would have reset forever
# — killing the seed the Nexus forks from, on a loop. Hence the guard at the end of this function.
JICM_PROTOS_BASELINE_TOKENS="${JICM_PROTOS_BASELINE_TOKENS:-98771}"
jicm_key_thresholds() {                      # <key>
    case "${1:-}" in
        protos|protos-bg-*)
            # baseline + working headroom (~41K soft / ~61K hard).
            [[ "$_JICM_SOFT_FROM_ENV" == "1" ]] || JICM_SOFT_TOKENS="${JICM_PROTOS_SOFT_TOKENS:-140000}"
            [[ "$_JICM_HARD_FROM_ENV" == "1" ]] || JICM_HARD_TOKENS="${JICM_PROTOS_HARD_TOKENS:-160000}"
            # FLOOR GUARD — a threshold at or below the session's unavoidable baseline is not a
            # tight threshold, it is an infinite reset loop, and it would present as "JICM is
            # cycling Protos constantly" rather than as a config error. Refuse it and say so.
            # Applies to whoever set it, env included: being explicit does not make it survivable.
            if [[ "$JICM_HARD_TOKENS" -le "$JICM_PROTOS_BASELINE_TOKENS" ]]; then
                echo "jicm-config ALERT: protos hard threshold ${JICM_HARD_TOKENS} <= measured baseline ${JICM_PROTOS_BASELINE_TOKENS} — that is a permanent over-threshold state (reset loop), not a tight budget. Falling back to baseline+60000; re-measure the baseline if the floor really moved." >&2
                JICM_HARD_TOKENS=$(( JICM_PROTOS_BASELINE_TOKENS + 60000 ))
                JICM_SOFT_TOKENS=$(( JICM_PROTOS_BASELINE_TOKENS + 40000 ))
            elif [[ "$JICM_SOFT_TOKENS" -le "$JICM_PROTOS_BASELINE_TOKENS" ]]; then
                echo "jicm-config ALERT: protos soft threshold ${JICM_SOFT_TOKENS} <= measured baseline ${JICM_PROTOS_BASELINE_TOKENS} — every turn would sit above soft. Raising to baseline+40000." >&2
                JICM_SOFT_TOKENS=$(( JICM_PROTOS_BASELINE_TOKENS + 40000 ))
            fi
            ;;
    esac
}
JICM_TOKEN_THRESHOLD=${JICM_TOKEN_THRESHOLD:-330000}   # legacy v7.x alias (= new hard)
# NOTE: the gate's per-window clamp (WINDOW*0.80 hard / *0.66 soft) still applies — on a
# 1M window these pass through (800K/660K caps > 600K/550K); smaller windows clamp DOWN.
JICM_POLL_INTERVAL=${JICM_POLL_INTERVAL:-1}     # 1s in v7.9 (was 5s in v7.x)
JICM_IDLE_GRACE_SEC=${JICM_IDLE_GRACE_SEC:-3}   # state-file mtime age = idle
JICM_HALT_ACK_TIMEOUT=${JICM_HALT_ACK_TIMEOUT:-60}
JICM_PREP_TIMEOUT=${JICM_PREP_TIMEOUT:-300}
JICM_RESUME_TIMEOUT=${JICM_RESUME_TIMEOUT:-60}

# --- tmux (overridable) -----------------------------------------------------
JICM_TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"

# Portable timeout binary, resolved ONCE for every JICM component. macOS ships neither
# `timeout` nor `setsid`; Homebrew coreutils provides `timeout`, MacPorts `gtimeout`.
# Lives here rather than in each script because both the actuator and the supervisor
# launch bounded background work, and two private copies of "how do I find timeout"
# is precisely the kind of duplicated derivation that drifts.
JICM_TIMEOUT_BIN="${JICM_TIMEOUT_BIN:-$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)}"
# Default changed from 'jarvis' to 'aion' after monorepo migration (2026-06-05).
# Session was renamed jarvis→aion in launch-aion.sh v3.1; the old default caused
# every JICM inject attempt to fail with "tmux session 'jarvis' not found".
JICM_TMUX_SESSION="${TMUX_SESSION:-aion}"
JICM_TMUX_TARGET="${JICM_TMUX_TARGET:-${JICM_TMUX_SESSION}:0}"

# --- Injection backend -------------------------------------------------------
# tmux:  v7.9 default — send-keys via $HOME/bin/tmux
# pty:   v8.0 planned — Unix socket injection via pty-wrapper.py
#        Validated 2026-05-15 (6/6 tests PASS). See .claude/scratch/pty-tests/
JICM_INJECTION_BACKEND="${JICM_INJECTION_BACKEND:-tmux}"
JICM_PTY_SOCKET="${JICM_PTY_SOCKET:-$PROJECT_DIR/.claude/context/.pty-inject.sock}"

# --- Memory System: L4 Auto-Consolidation (Phase 2B) --------------------------
# After each JICM compression, auto-ingest the checkpoint to RAG (sessions
# collection) for long-term semantic retrieval. Graphiti extracts entities.
#
# SIMILARITY DIAL: Controls deduplication threshold. Range [0.0, 1.0].
#   0.0  = always ingest (no dedup, risks Hyperthymesia)
#   0.92 = default — skip if a very similar checkpoint already exists
#   1.0  = only skip exact duplicates (aggressive ingestion)
# Tune this based on observed collection growth vs retrieval quality.
# Monitor via: curl localhost:6333/collections/sessions | jq .result.points_count
JICM_RAG_ENABLED="${JICM_RAG_ENABLED:-true}"
JICM_RAG_COLLECTION="${JICM_RAG_COLLECTION:-sessions}"
JICM_RAG_DEDUP_THRESHOLD="${JICM_RAG_DEDUP_THRESHOLD:-0.92}"
JICM_RAG_QDRANT_URL="${JICM_RAG_QDRANT_URL:-http://localhost:6333}"
JICM_RAG_EMBED_URL="${JICM_RAG_EMBED_URL:-http://localhost:8000}"
JICM_GRAPHITI_ENABLED="${JICM_GRAPHITI_ENABLED:-true}"
JICM_AUTO_INGEST_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-auto-ingest.py"
JICM_GRAPHITI_INGEST_SCRIPT="$PROJECT_DIR/.claude/scripts/graphiti-prepopulate.py"
JICM_INGEST_LOG="$PROJECT_DIR/.claude/logs/jicm-auto-ingest.log"

# --- Memory System: NLP Compression (Phase 2C — repaired pipeline position) ----
# NLP compression processes RAW inputs (scrollback, JSONL messages) BEFORE
# Tier 1 structuring. Was disabled in Phase 2B (0.99 ratio on structured output);
# repositioned in 2C to process naturally-redundant raw data (30-50% reduction).
JICM_NLP_ENABLED="${JICM_NLP_ENABLED:-true}"
JICM_NLP_SCROLLBACK_MODE="${JICM_NLP_SCROLLBACK_MODE:-aggressive}"
JICM_NLP_MESSAGES_MODE="${JICM_NLP_MESSAGES_MODE:-standard}"
JICM_NLP_SCRIPT="$PROJECT_DIR/.claude/scripts/compress-input.py"

# --- Memory System: Scrollback Capture (Phase 2C — expanded) -------------------
# Capture 1000 lines of tmux scrollback (was 200). At ~80 chars/line ≈ 80KB raw.
# NLP compression reduces to ~40KB; LLM summarization further to 2-5KB.
JICM_SCROLLBACK_LINES="${JICM_SCROLLBACK_LINES:-1000}"

# --- Memory System: REST Stage (Phase 2C — idle/high-activity triggers) --------
# REST functions fire when session is idle (no user prompt for threshold seconds)
# OR when tool activity exceeds threshold since last REST cycle.
JICM_REST_IDLE_THRESHOLD="${JICM_REST_IDLE_THRESHOLD:-1800}"     # 30 minutes
JICM_REST_TOOL_THRESHOLD="${JICM_REST_TOOL_THRESHOLD:-50}"       # 50 tool uses
JICM_REST_MARKER_DIR="$PROJECT_DIR/.claude/context"
