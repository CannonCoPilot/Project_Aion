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

---

## 2026-04-24 | judgment | JICM checkpoint stale-task inference

**What happened**: Multiple JICM checkpoints inferred stale Current Task content from a session-state.md last updated 4400+ minutes prior, surfacing COMPLETE items as if active.

**Lesson**: Derive Current Task from recent conversation only. If session-state is >60min stale, the prep script's staleness indicator already flags it — trust the conversation, not the cached state.

---

*Pre-2026-04 entries (DF FPS, schema discovery, LiteLLM aliases, Prism tick-rate, etc.) archived. Read archive when reflecting on long-term patterns.*
