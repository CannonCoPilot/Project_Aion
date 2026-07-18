# JICM v9 — Validation Runbook

Companion to `../designs/jicm-v9-multi-session-steward.md`. Each phase is gated by the checks below + a code-review of its diff. Results are recorded inline as phases complete.

## Standing test harness (proven 2026-07-18)
- **Sensing (no side effects on W0):** redirect `JICM_PROJECT_DIR` to a throwaway dir, feed a crafted transcript (real-model msg + `<synthetic>` tail) to `jicm-gate.sh`, assert the per-key `state/<key>.json` (model / window / soft / hard / tokens / action). Strip the ambient dev role with `env -u JARVIS_SESSION_ROLE` (testing a role-gated hook from W11 otherwise inherits `dev`). See [[reference_dev_lane_hook_testing_role_leak]].
- **W0 safety invariant:** capture `md5 .claude/context/.compressed-context-ready.md` (and, post-namespacing, `state/w0.json`) before/after any run touching prep; assert byte-identical.
- **Actuator (canary only):** on a *disposable* session, run the actuator; tail `.claude/logs/jicm-self-actuator.log`; confirm idle-gate → prep → /clear → resume; assert W0 md5 unchanged.

## Phase gates
- **P1 Foundation:** `bash -n` all touched scripts; sensing harness passes for `key=w0` AND `key=dev` with per-key state files; `key=w0` output byte-identical to the pre-change single-file state (regression); gate no longer excludes dev.
- **P2 Supervisor:** register 2 fake sessions, trip one → only its actuator spawns, the other untouched; kill a pane → GC removes its entry. Canary actuator survival under the CC Bash-harness verified. `--fire` un-gated only after a clean canary (**user's hand**).
- **P3 W0 fold-in:** supervisor shadow-runs W0 sense-only for ≥1 real cycle; cycle parity vs the old watcher (RAG/Graphiti/consolidation/scrollback/scratchpad-rotation all fire); md5-safety holds; then cutover; archived watcher rollback rehearsed.
- **P4 Cross-project:** bridge registers/deregisters a real chain across its lifecycle; supervisor senses an Alfred transcript; Protos zero-state relaunch loads CLAUDE.md+compaction-essentials only (capture-pane check, no `session-state.md`).
- **P5 HUD:** N rows render for ≥2 live sessions with correct per-row tokens%/action; no regression in the single-session view.

*(Filled with actual results as phases execute.)*
