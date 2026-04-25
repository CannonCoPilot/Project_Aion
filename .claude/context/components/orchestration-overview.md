# Autonomic Component Orchestration Overview (v1.2.0; Nous)

Autonomic system = 3 categories:
- Hippocrenae AC-01..AC-09 (standard ops)
- Ulfhedthnar AC-10 (hidden override; dormant unless barriers)
- Aion Quartet (Watcher/Ennoia/Virgil/Housekeep) always-on tmux scripts, zero-context-cost.

## Component topology
Session lifecycle:
- AC-01 Self-Launch (Session Start)
- AC-02 Wiggum Loop (default active work mode)
- Triggers during work: AC-03 (milestone review), AC-04 (JICM), AC-05 (reflection)
- Background/scheduled: AC-06 (evolution), AC-07 (R&D), AC-08 (maintenance)
- AC-09 Session Meditation (user `/meditate-session`)

## Flow descriptions
AC-01:
- load identity from `psyche/jarvis-identity.md`
- review `session-state.md` + `current-priorities.md`
- greeting + suggest/begin work autonomously
Outputs to AC-02.

AC-02 (default):
- loop: Execute → Check → Review → Drift Check → Context Check → Continue/Complete
- concurrent triggers: AC-03/04/05
- Use TodoWrite for 2+ steps; self-review; iterate until verified.

AC-03 Milestone Review:
- Trigger: PR completion/significant feature/refactor
- Load review criteria from `review-criteria/`
- Evaluate deliverables; produce report in `.claude/reports/reviews/`; block completion if unmet.

AC-04 JICM:
- Trigger: context nearing 70–80%
- identify critical context, run context-compressor agent, checkpoint to session-state, signal `/clear`, restore compressed context.

AC-05 Reflection:
- Trigger: session end or significant events
- analyze corrections/events, identify patterns/lessons, generate reflection report `.claude/reports/reflections/`, propose improvements.

AC-06 Evolution:
- Trigger: idle time or `/evolve`
- review evolution queue; safety eval; implement approved; document evolution.

AC-07 R&D:
- Trigger: scheduled, explicit, capability gaps
- review research agenda, explore tools/approaches, evaluate alternatives, write discovery reports.

AC-08 Maintenance:
- Trigger: scheduled, explicit, detected issues
- health checks (MCPs/hooks/configs), audit organization, clean stale data, write report.

AC-09 Session meditation:
- Trigger: user `/meditate-session`
- reflect + capture knowledge to RAG, write ProjectIntel debrief, update `session-state.md`, commit work, update `current-priorities.md`, valediction ceremony.

Dependencies table (summary):
- AC-01→AC-02
- AC-02 triggers AC-03/04/05
- AC-05 informs AC-06
- AC-09 user-triggered then AC-05
- AC-10 triggered by defeat signals or `/unleash`.

## Aion Quartet (infra; tmux)
- Watcher (W1): JICM monitoring/token polling/compression triggers/`/clear`.
- Ennoia (W2): intent-driven orchestration; wake-up recommendations.
- Virgil (W3): task/agent/file tracking.
- Commands (W4): `.command-signal` → tmux send-keys injection (script `command-handler.sh`).
- Housekeep: signal cleanup/log rotation/state freshness (script `housekeep.sh`).

Signals:
- Ennoia writes `.ennoia-recommendation` read by Watcher.
- Watcher writes `.jicm-state` read by Ennoia/Virgil/etc.
- Hooks write `.virgil-tasks.json` + `.virgil-agents.json` read by Virgil.
- Skills write `.command-signal` read by Commands.
- Ulfhedthnar writes `.jicm-sleep.signal` read by Watcher.
- Housekeep cleans stale signals.

Quick reference:
- Always active: AC-02.
- Bookends: AC-01 start, AC-09 end.
- Ulfhedthnar AC-10: dormant→activated by “I can’t”/stalling failures or `/unleash`; max parallel approach rotation; cannot bypass destructive confirmations; respects JICM; auto-disengages.