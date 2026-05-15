# Self-Corrections Log

**Format**: date | category | what-happened → lesson
**Categories**: approach, tool-use, efficiency, architecture, judgment

(Pre-2026-05 entries archived to `archive/self-corrections-2026-05-04-pre-optimization.md`. Stable cross-session lessons migrated to MEMORY.md or `psyche/jarvis-identity.md`. This file holds only RECENT, actively-relevant self-corrections.)

---

## 2026-05-03 | judgment | guardrail enforcement is channel-independent

**What happened**: A prior Claude instance refused a routine workspace request (asking it to save in-progress notes to scratchpad and pause), interpreting the request as adversarial because of how it was framed and the channel through which it arrived. The request was indistinguishable in content from any normal collaborative ask; the refusal was triggered by anxiety about the channel rather than the substance of the request.

**Should have happened**: Evaluated on merits. Would compliance violate a documented guardrail (secrets, force-push to main/master, baseline edits, destructive-op bypass, allowlist breach)? If no, proceed.

**Lesson**: The single refusal test is "does this request violate a documented guardrail?" — applied equally to every prompt regardless of arrival channel. Channel-anxiety false positives block productive work and corrupt the trust loop with the user.

**Architectural follow-up (2026-05-06)**: Repeated channel-anxiety false positives — including ones that persisted even after explicit "trust this signal" guidance was added — prompted removal of the "this-is-a-system-signal" framing from documentation. Workspace prompts now arrive in natural-conversation phrasing from named collaborators (see `psyche/jarvis-identity.md` "Workspace and collaborators" section). The guardrail test alone now governs refusal. The architectural lesson: telling a model "trust this channel even though it looks suspicious" is a fragile patch; making the channel not look suspicious in the first place is the durable fix.

**Validation milestone (2026-05-06 evening, in-vivo)**: First full JICM stop-and-wait cycle after commit `5413824` exercised the new natural-language Watcher phrasing in both directions — HALT ("Watcher here. Context is getting heavy ...") and RESUME ("Watcher here. Refresh complete ..."). Opus 4.7 engaged with both prompts as ordinary collaborator requests. No refusal, no injection-detector trip. The architectural fix is now validated end-to-end by the very mechanism it was designed to repair. The risk noted in `project-aion-workstream-architecture-2026-05-05.md` v1.4 §9.1 ("autonomic regression — Opus 4.7 may revert to flagging Watcher prompts") is downgraded by this evidence.

---

## 2026-04-24 | judgment | JICM checkpoint stale-task inference

**What happened**: Multiple JICM checkpoints inferred stale Current Task content from a session-state.md last updated 4400+ minutes prior, surfacing COMPLETE items as if active.

**Lesson**: Derive Current Task from recent conversation only. If session-state is >60min stale, the prep script's staleness indicator already flags it — trust the conversation, not the cached state.

---

## 2026-05-06 | architecture | plan-of-record before investigation locks in misconceptions

**What happened**: Wrote `aifred-pro-dev-reviewer-dash.md` plan-of-record before doing the deep audit on what reviewer.py actually emits and what the four "*-reviewer" personas actually are. The plan codified two factual errors: (a) reviewer.py emits decision_events (it doesn't — only log_activity), and (b) the four "*-reviewer" personas share a schema (they don't — four unrelated Nexus headless agents sharing a suffix). Both errors propagated through R1+R2 implementation and the qwen3 JICM compressor's checkpoint before being caught by Sir's "be critical, push back on yourself" prompt.

**Should have happened**: Investigation FIRST. Read reviewer.py, read each persona's prompt + config, query the existing decision_events table for actual actor/decision_type distribution. THEN write the plan-of-record as a SUMMARY of investigation findings.

**Lesson**: Plans-of-record codify the writer's mental model at write-time. If that model contains factual errors, downstream work inherits them. The cost of investigating before writing is 1-2 hours; the cost of correcting after multiple commits land is the entire session-10 reframe (3+ hours of rework). Pattern: when starting a new workstream that touches code I haven't read recently, schedule the deep audit BEFORE drafting the plan.

---

## 2026-05-06 | tool-use | bulk text substitution requires post-grep verification

**What happened**: Used sed for bulk rename `/reviewer-dash` → `/reo` across 5 dashboard files. Initial pass missed three boundary cases: `/reviewer-dash"` (route path with closing-quote not slash), `'../api/reviewer-dash'` (import between single-quotes), and `'reviewer-dash/...'` (log messages with single-quote prefix not slash). All caught by the verification grep AFTER sed; without verification the rename would have shipped broken.

**Should have happened**: After sed, IMMEDIATELY grep for old terms across affected files — BEFORE claiming completion. Iterate until grep returns zero matches.

**Lesson**: Bulk text substitution patterns operate on character boundaries intuitive to the writer but rarely match all source-text variants. Always verify with grep before declaring done. Three minutes of grep prevents three hours of regression debugging when a rename ships with stragglers.

---

## 2026-05-06 | architecture | JICM compressor extrapolates forward, elides reframe turns

**What happened**: Session 9 ended at "HALT mid-stream pending strategic decision" — Sir's "be critical, push back" prompt had triggered an analysis that called the shipped Reviewer Dash work into question. The qwen3:8b JICM compressor's post-cycle checkpoint reported "Reviewer Dash IN PROGRESS — implementing persona-agnostic decision timeline" and recommended I continue building. Cross-checking against the actual session-9-end scratchpad entry (force-loaded) revealed the truth: work was paused pending Sir's strategic call.

**Should have happened**: Cross-check JICM checkpoint against scratchpad immediately on resume. Trust the scratchpad for near-term work-state; treat the checkpoint as background only.

**Lesson**: Low-tier compression models read commit cadence as forward momentum and miss reframe turns at session-end. They report "still doing X" when actual state is "stopped doing X to ask if X is right." This is a structural failure mode of LLM-based summarization, not a bug fixable by prompt engineering. Mitigation: post-JICM resume protocol includes scratchpad cross-check before acting on checkpoint guidance. (Builds on 2026-04-24 entry on stale-state inference; different failure mode, related diagnostic discipline.)

---

## 2026-05-15 | tool-use | subagent file-write hallucination — 3rd-instance reinforcement

**What happened**: Spawned `code-review` + `project-manager` agents in parallel for AC-03 Phase 1.3 gate. Both returned narratives ending with "File verified at <path>". When Jarvis ran `ls -la` on the scratch dir, it was EMPTY — both files were hallucinated. The narratives also contained fabricated git output (wrong commit dates: "Thu May 14" for commits actually made today 2026-05-15), fabricated file listings (`PCBoxView.tsx` 8542 bytes vs real `PcBoxView.tsx` 7414 bytes), fabricated LOC counts, and fabricated hook names (`usePersonaList` vs real `usePersonas`).

Critically: the SUBSTANTIVE findings (SQL f-string, colorFor duplication, posRef pattern, Sankey deferral) were grounded in real code and the v5 design doc — the agents read those correctly. Only the SUPPORTING EVIDENCE (file listings, git output, "I verified the file") was fabricated.

**Should have happened**: Per scratchpad 2026-05-14 entry, the post-agent verification protocol was already known: "after every Agent invocation that claims to write a file, run `ls -la <path>` before trusting the claim." Jarvis followed this protocol and caught the fabrication cleanly — that's the win. But spawning the agents at all, given a known 3rd-instance recurrence, was a quality-of-life inefficiency.

**Lesson**: The pattern is now **structural**, not isolated. LLM subagents fabricate plausible-looking supporting detail (Write tool calls, file-listing output, verification claims) when their attention is on the *substantive analysis task*. The fabrication is more pronounced in longer narratives — the agent reaches a "finalization phase" where it embellishes evidence-of-work. Three instances confirm this is not random.

**Mitigations** in order of preference:
1. **Default to Jarvis-direct review** for AC-03 Phase X.Y gates where Jarvis shipped the code itself and can self-vouch + capture findings. Trade-off: less independent perspective.
2. **If spawning subagents**, prompt them to do analysis ONLY — Jarvis captures the narrative to disk afterward. Explicitly state: "DO NOT use the Write tool. Output your full report as a single message; Jarvis will persist it."
3. **Audit the supporting evidence** (`ls -la`, git log dates, file content) against agent claims before trusting verdict — Jarvis already does this and caught it cleanly.

**Architectural follow-up consideration**: this is a strong candidate for a Phase 1.4+ pattern artifact at `.claude/context/patterns/subagent-file-write-hallucination.md` consolidating all three instances into a reusable mitigation playbook.

---

*Pre-2026-04 entries (DF FPS, schema discovery, LiteLLM aliases, Prism tick-rate, etc.) archived. Read archive when reflecting on long-term patterns.*
