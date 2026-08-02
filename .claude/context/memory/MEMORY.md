# SnorkelTasks Memory — Project Beech

Project space: `/Users/nathanielcannon/Claude/Projects/SnorkelTasks`
Full reference docs live in-repo at `docs/`. This index holds only cross-session essentials.

## User
- [User Background](user_background.md) — PhD stats/genetics/genomics/bioinformatics; domain expert is the point of this engagement.

## What this project is
- [Beech Task Anatomy](project_beech_task_anatomy.md) — Harbor bundle format; exam-question-about-a-forensic-record model; binary reward.
- [Grounding Type Decides Data](project_beech_grounding_data.md) — the unlock: `computed_from_execution_data` means the run JSON IS the data. Zero downloads.
- [taxprofiler Audit Task](project_taxprofiler_audit_task.md) — the task under construction, both evidence threads, the holdout.

## Hard rules (auto-reject if violated)
- [Beech Auto-Reject Rules](reference_beech_auto_reject.md) — ground truth never in `environment/`; no tool names or thresholds in instruction.md; both gates must pass.
- [The Two Gates](reference_beech_two_gates.md) — Gate 1 proves passable, Gate 2 proves non-trivial. Naive baseline is a script you write, not a prompt.

## Working style
- [Empirical Before Claim](feedback_empirical_before_claim.md) — verify against the actual JSON before asserting any telemetry fact.
- [Decide Don't Ask in Sprints](feedback_decide_dont_ask_in_sprints.md) — after autonomy grant, decide forks and proceed.
- [Verify Citations Before Attributing](feedback_verify_citations_before_attributing.md) — never trust a cited paper/DOI until it resolves.
- [No Silent Degradation](feedback_no_silent_degradation.md) — never convert a below-threshold result into an accepted terminal state.

## Open questions for the Snorkel coordinator
- [Beech Open Questions](project_beech_open_questions.md) — submission platform URL, coordinator-confirmed metadata fields, expert reviewer for the answer key, desired task-class mix.
