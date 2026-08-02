# Insights Archive — 2026-06-18
# Rotated: 2026-06-18T11:40:48Z (6 entries)

### 2026-05-30 [386b27ee3af5]

**The attribution gap**: Claude Code creates unique session IDs internally (that's what `--fork-session` produces), but it does NOT pass that session ID through the Anthropic API's `metadata` field. The Anthropic messages API supports `metadata: { user_id: string }` but Claude Code doesn't populate it. Our proxy looks for `metadata.session_id` in the request body — it's just never there.

**The fix path**: We can inject the session ID via `ANTHROPIC_CUSTOM_HEADERS` with `x-aion-session-id=<session-uuid>`. The proxy already reads that header (line 337). The bridge knows the session ID from the seed file — it just needs to set the header before launching each fork.

### 2026-05-30 [ed7695b14319]

**What we wired up**: `ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: chain-<chain_id>'` is now exported in every forked Claude session. Claude Code passes custom headers through to its Anthropic API requests. The proxy extracts `x-aion-session-id` from request headers and stores it in `api_requests.session_id`. This means every API call from a chain fork is now tagged with its chain_id, enabling clean per-chain (and therefore per-suite) attribution even with concurrent overlapping execution.

**The attribution chain**: Task → chain_id (in task metadata) → `session_id` in api_requests → GROUP BY session_id = per-chain cost/tokens/calls.

### 2026-06-04 [fed35424f394]

**Architecture summary of the telemetry system**:

1. **Capture trigger**: `_maybe_capture_telemetry()` fires as an `asyncio.create_task()` on both the PATCH `/tasks/{id}` (status→closed) and POST `/tasks/{id}/close` endpoints. Fire-and-forget — doesn't block the API response.

2. **Computation**: `_capture_test_run_telemetry()` uses a recursive CTE to walk the task tree (parent → children → grandchildren via `labels LIKE '%parent:xxx%'`), collects all `chain_id` values, then aggregates `api_requests` where `session_id = 'chain-<chain_id>'`. Burns are computed by bracketing the run window with the nearest `unified_5h_utilization` readings.

3. **Storage**: `test_run_telemetry` table with UPSERT (ON CONFLICT DO UPDATE) so re-runs and backfills are idempotent.

4. **Frontend**: `BurnBadge` (color-coded pp chip on each suite card), `BurnGauge` (visual 5hr window bar with 90% warning line), and summary stats showing total burn across all suites. Burn data loads eagerly on page mount by fetching metrics for all active suites.

**Known edge case**: Cross-window runs (like gospel-synopsis spanning a 5hr reset) show negative burn weight deltas. This is architecturally correct — the start/end readings are accurate — but the delta is misleading. A future improvement could detect window resets and split the measurement.

### 2026-06-04 [dae5dfdc991e]

The pipeline is now **operational and observable**. The natural progression branches into three directions: hardening what's built, expanding capabilities, or resuming the suspended Chronicler project. Each has different time-cost profiles.

### 2026-06-04 [504c9299c789]

**The A → C → B execution delivered a three-layer scheduling defense**:

1. **Pre-flight gate** (event-watcher.sh) — Before any task dispatches, the watcher queries Pulse for 5hr utilization. At 85%+, no new tasks get dispatched. This is the first line of defense: don't start work you can't finish.

2. **Priority ordering** (orchestrate.py) — When tasks ARE dispatched, `priority:high` tasks run first. This ensures important work gets headroom before lower-priority tasks consume it. The sort key is `(priority, type_score)`, so a high-priority research task still runs before a normal-priority bug fix.

3. **Runtime watchdog** (observation_tunnel.py) — Even after dispatch, the observation tunnel monitors system utilization during execution. If util hits 90% while a task is running, the task gets blocked (medium intervention). This catches runaway consumption that the pre-flight gate couldn't predict.

Together with the C hardening (cross-window burn fix, configurable timeouts, time-bounded attribution), the pipeline now has burn-weight awareness at every stage: measurement → scheduling → execution → monitoring.

### 2026-06-04 [c8257522b2eb]

**The branch has evolved significantly beyond its original scope.** It started as "personas rebuild" (Phase 1.0–1.4 of the dashboard), but accreted three additional workstreams: the usage page improvements, the full pipeline v2 rewrite (chain-executor replacing `claude -p`), and the P2 scheduling system. This is typical of long-lived feature branches, but it creates a PR challenge: the diff is 15K+ LOC across 131 files spanning unrelated concerns.

# Insights Archive — 2026-06-18
# Rotated: 2026-06-18T12:43:25Z (1 entries)

### 2026-06-04 [ac22dd2c17db]

**Key clarification**: The local `main` and `nate-dev` branches are both stuck at `c5b1186` — they haven't been updated. Meanwhile `origin/main` on CannonCoPilot/Alfred is 22 commits ahead (those are the earlier `nate-dev` pushes from the supplant work). The `feature/personas-rebuild` branch was cut from `c5b1186` and has diverged 43 commits.

**The upstream** (`davidmoneil/AIFred-Pro:main`) is at `dfd40c5` — David's latest. Our `pre-sync-safety-2026-04-23` branch is also at `dfd40c5`, confirming that was the snapshot before we started diverging.

# Insights Archive — 2026-06-18
# Rotated: 2026-06-18T18:57:43Z (4 entries)

### 2026-06-05 [74216e862a5c]

**Archived Jarvis repo**: `CannonCoPilot/Jarvis` is archived on GitHub and still contains the old commits with secrets. If you want to scrub those too, you'd need to: unarchive → clone → filter-repo → force push → re-archive. Since it's private and archived, the risk is low but not zero.

**Key rotation**: The exposed keys should ideally be rotated, especially the GitHub PATs and any third-party API keys. The credentials file has them all in one place now, making rotation straightforward.

**Personal info**: Private IPs (`192.168.*`, Tailscale `100.93.*`), machine names, and `nathanielcannon` in filesystem paths remain in tracked files. These are low-risk in a private repo but would need redaction before going public.

### 2026-06-05 [7a454f873e56]

The credentials file now has three layers of database access info:
1. **Quick-reference table** at the top of the database section — scan for any DB in 2 seconds
2. **DSN shortcuts** — copy-paste connection strings for `psql`, Python, or any DB tool
3. **Structured YAML** below — for programmatic access via `yq` in scripts

The key discovery: Chronicler shares the Jarvis postgres user/password but has its own database name (`chronicler`). n8n also shares the Jarvis user via the same `PG_USER`/`PG_PASSWORD` env vars. This means rotating the Jarvis postgres password affects three services simultaneously.

### 2026-06-05 [7f71c296be45]

The `JARVIS_*` variable names are **internal implementation details** — they reference session UUIDs and file paths, not user-facing identity. Renaming them to `AION_*` would be cosmetic but would break compatibility with the existing `.current-w0-uuid` file and any hooks/scripts that read `JARVIS_SESSION_ROLE` or `JARVIS_LITE` env vars. The pragmatic choice: keep the internal names, update only the user-visible strings (window names, banners, session name).

### 2026-06-05 [769c67981a51]

**The `.env` blind spot**: Gitignored files aren't caught by `git grep` or `git ls-files` based sweeps. The `.env` deny rule also blocked Read/grep via the permission system. This is exactly why Phase 6 verification exists — it caught a real functional failure (Pulse container couldn't start) that all prior phases missed. The lesson: always run the actual services as part of verification, don't just grep.

# Insights Archive — 2026-06-18
# Rotated: 2026-06-18T22:12:28Z (8 entries)

### 2026-06-05 [f58885b37aa7]

Claude Code determines project identity from the working directory path at launch time. It converts the absolute path to a slug (e.g., `/Users/x/Claude/Jarvis` → `-Users-x-Claude-Jarvis`) and stores all session JSONLs, settings, and memory under `~/.claude/projects/<slug>/`. Changing the directory name effectively creates a "new project" from Claude Code's perspective — all session state, memory files, and settings would need to be migrated or the old slug symlinked.

### 2026-06-05 [fac0eff15ad8]

- **Non-HTTP service probing**: PostgreSQL and Redis don't speak HTTP, so `curl` health checks fail on them. The fix uses `pg_isready` (if available) or falls back to Docker container name checks. A common gotcha in polyglot infrastructure health scripts.
- **Environment-variable session naming**: Hardcoding tmux session names (`jarvis`) in distributed scripts creates tight coupling. The `TMUX_SESSION` env var pattern lets the launcher set the session name once and propagate it to all child processes. The fallback default (`jarvis`) preserves backward compatibility for scripts invoked outside the launcher.
- **LaunchAgent lifecycle**: macOS LaunchAgents cache their plist at `launchctl load` time. Editing a plist without `unload → edit → load` has no effect until reboot. The 3 Alfred plists were pointing at `~/Claude/Alfred-Dev/` — a directory with log files but no scripts — so the dispatcher and watchdog have been silently failing since the monorepo migration.

### 2026-06-05 [a63985f118e4]

- **The real vs symlink PWD distinction is critical for Claude Code**: Claude Code uses `process.cwd()` (or equivalent) to derive its project slug. On macOS, `cd /real/path` sets PWD to the real path even if a symlink points there. The only way to get the symlink-based PWD is to `cd` through the symlink itself. This is a POSIX behavior — shells resolve the physical path unless you use `cd -L` (logical mode), but tmux's `new-session -c` always resolves physically.
- **Two-path architecture**: `CLAUDE_LAUNCH_DIR` (symlink path for Claude's slug resolution) vs `PROJECT_DIR` (real path for file operations). This separation ensures scripts can find files on disk while Claude Code finds its sessions.

### 2026-06-05 [c71e767cb826]

- **Claude Code resolves symlinks internally**: Even though tmux preserves the symlink in PWD, Claude Code calls something like `realpath()` to determine the canonical project directory. This means the session slug is always derived from the *real* path, not the symlink. The slug-level symlink (`-Claude-Project_Aion → -Claude-Jarvis`) is the only reliable fix because it works regardless of which direction the resolution goes.
- **Monorepo project isolation**: In a monorepo with one `.git/`, Claude Code always walks up to find the git root and uses the root `.claude/` directory. Subdirectories can't have independent Claude Code identities unless they're accessed from *outside* the git tree. The `Alfred-Dev` symlink trick works because Claude Code sees `~/Claude/Alfred-Dev/` → no `.git/` in that logical path → uses `Alfred-Dev/.claude/` directly.

### 2026-06-05 [d258e2f31e14]

- **The real bug was session locking, not path resolution.** Claude Code maintains a session index at `~/.claude/sessions/<pid>.json` that tracks each active session's status (`busy`/`idle`). `--resume <UUID>` refuses to resume a session marked `busy` — a safety mechanism to prevent two Claude instances from writing to the same JSONL simultaneously. The prior session (this one, PID 48215) is still running and has `968ed5e8` marked as `busy`, so every `--resume` attempt was correctly rejected.
- **`--continue` vs `--resume`**: `--resume` takes over an existing session in-place (same JSONL file). `--continue` creates a NEW session that inherits the conversation from the most recent one. For a launcher that may run while old sessions are still winding down, `--continue` is the only safe choice.
- **The slug symlink was a real bug too** — it just wasn't the one causing the immediate error. It would have failed on a cold start (no running session) if the paths didn't match.

### 2026-06-05 [8774600ce7b2]

- **The slug encoding rule changed.** Old Claude Code wrote sessions at `~/.claude/projects/-<literal-cwd-with-only-slashes-replaced>/`. New Claude Code computes the slug as `realpath(cwd)` then replaces BOTH slashes AND underscores with hyphens. For cwd=`~/Claude/Jarvis` (symlink → `~/Claude/Project_Aion`), the new slug is `-Users-nathanielcannon-Claude-Project-Aion` (hyphen). The old slug was `-Users-nathanielcannon-Claude-Jarvis`. Two completely different directories.
- **User's earlier recovery symlink targeted the wrong slug.** The Jun 4 20:28 symlink `-Project_Aion → -Jarvis` used `_Project_Aion` (underscore — the OLD encoding scheme). Claude 2.1.153 doesn't compute that slug, so the symlink was never consulted. It's harmless dead weight.
- **The proof is in the test JSONL I just created.** With `--session-id ffffffff...`, Claude wrote the JSONL to `~/.claude/projects/-Users-nathanielcannon-Claude-Project-Aion/ffffffff...jsonl` (hyphen). The resume of the same UUID succeeded. So new sessions WORK; only old-slug sessions are stranded.

### 2026-06-05 [88c4d340d265]

- **Definitive proof obtained.** After copying `968ed5e8.jsonl` into the new hyphen-slug dir (`-Project-Aion`), `claude --resume 968ed5e8` succeeded — and the response came from the actual resumed migration session ("Understood — session resumed after the copy. Standing by, sir." — note the Jeeves "sir"). The mechanism is unambiguous: Claude Code 2.1.153 looks in `-Project-Aion/` (underscores-mapped-to-hyphens), not `-Jarvis/` (literal slug).
- **The fix is one symlink and four file ops, not a 447-file migration.** Move the two unique JSONLs that already landed in `-Project-Aion/` into `-Jarvis/` (canonical store), purge the test artifact + duplicate I just made, then replace `-Project-Aion/` itself with a symlink to `-Jarvis/`. Claude lookups will resolve through the symlink; my running session keeps writing to its existing inode in `-Jarvis/` unaffected.
- **The launcher's own slug computation didn't need fixing.** It currently produces `-Users-nathanielcannon-Claude-Jarvis` (matches the file's actual location) and uses it for the resumability scan — which is correct. The mismatch was only between launcher's lookup and Claude Code's lookup. After the symlink, both resolve to the same physical directory.

### 2026-06-05 [781737bf07ea]

**Why the rename broke idle-hands**: Five tmux window processes (Watcher, Ennoia, Virgil, Commands, Bridge) were launched with hardcoded `PROJECT_DIR=$HOME/Claude/Jarvis`. When we renamed the directory to `Project_Aion`, all their file operations silently failed — including Ennoia's check for the `.idle-hands-disabled.signal`. With the disable check failing (file not found at dead path), Ennoia interpreted W0 as "idle" and injected maintenance prompts. The symlink `Jarvis → Project_Aion` is a bridge fix that lets all running processes continue working until we restart them with the new launcher in Phase 4.

# Insights Archive — 2026-06-18
# Rotated: 2026-06-19T00:51:22Z (4 entries)

### 2026-06-05 [7445099cd1a1]

- **Session lifecycle**: Claude Code writes `status:busy` to `~/.claude/sessions/<pid>.json` on startup and sets `status:idle` on clean exit. `--resume` checks this index and refuses busy sessions. A clean exit (Ctrl-C, `/exit`) ensures the status is set to idle, making the UUID available for resume.
- **The fallback chain**: `--resume <UUID> || --continue` gives you deterministic UUIDs when possible (clean relaunch) and graceful degradation (new UUID) when the old session didn't exit cleanly. The restart loop inside the wrapper already uses `--continue`, so mid-session crashes are also handled.

### 2026-06-05 [aa670cd031d3]

The `session_resumable()` guard solves a subtle Claude Code behavior: it records `cwd` verbatim at session start without `realpath` normalization. The `~/Claude/Jarvis → Project_Aion` symlink means sessions started from either path have different `cwd` strings even though they're the same directory, causing `--resume` to reject with "No conversation found."

### 2026-06-05 [166ae100dfaf]

The statusline's `Δ1886.5K/m` burst rate during a fresh-context turn is normal — a fresh W0 resume with no cache hits causes a single large cache_write, inflating the instantaneous rate. The sustained rate will drop after the prefix is cached. The 88% 5h util reading is the reliable signal here.

### 2026-06-05 [5ebdc7df553a]

- **GitHub fork visibility constraint**: Public forks cannot be made private via the API (or the UI). The only options are to delete the fork or contact GitHub support to "detach" it. This is a deliberate GitHub policy to preserve open-source contribution chains.
- **PAT scope matters for legacy repos**: A Personal Access Token may not have admin scope for repos created before the token was issued, or repos owned by a different authentication context. The `aifred_token` PAT was scoped for the Aion/Alfred workflow, not the broader CannonCoPilot account.

# Insights Archive — 2026-06-18
# Rotated: 2026-06-19T05:59:49Z (1 entries)

### 2026-06-05 [6d19111aed87]

- **GitHub profile READMEs** are rendered from a special repo whose name matches your username exactly (`CannonCoPilot/CannonCoPilot`). The `README.md` in its default branch appears as a banner above your pinned repos — it's the first thing visitors see.
- **HTML tables in GitHub markdown** allow two-column layouts that pure markdown can't achieve. The `<table><tr><td>` pattern with `width="50%"` creates a clean grid of project cards that scans much better than a flat list.
- **Badge style matters**: `flat-square` badges are less visually aggressive than `for-the-badge` — appropriate for the profile page where they complement rather than dominate. The repo-level READMEs use `for-the-badge` as hero elements; the profile uses smaller badges as a tech stack summary.

