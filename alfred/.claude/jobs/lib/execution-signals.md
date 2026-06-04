# Execution Signal Protocol

Structured signals that headless personas can emit during execution. The executor (executor.sh) detects these in job output and takes automated action.

## PAUSE Signal

Emit when you cannot proceed and need human input.

```
PAUSE: <reason why execution cannot continue>
PAUSE_TASK: <Pulse task ID, e.g. AIProjects-xxxx>
PAUSE_QUESTIONS: <specific questions for the operator, separated by semicolons>
```

**Action**: Executor sets task to `waiting:human`, sends push notification.

## QUESTION Signal (DEPRECATED)

**Do NOT use QUESTION: signals.** They are no longer processed by the executor.

Instead, if you need human input:
1. `pulse update <task_id> --append-notes "## Needs Input\n<describe what you need>"`
2. `nexus-label add <task_id> "waiting:human"`
3. `nexus-label add <task_id> "needs-input"`
4. Exit cleanly

## REVIEW Signal (Review Personas Only)

Emit after reviewing another persona's work.

### Approve
```
REVIEW_APPROVE: <summary of what was reviewed and why it passes>
REVIEW_TASK: <Pulse task ID>
REVIEW_ORCH_RUN: <orchestration run ID, if applicable>
```

**Action**: Executor appends approval notes to task.

### Reject
```
REVIEW_REJECT: <specific feedback — what failed and what needs to change>
REVIEW_TASK: <Pulse task ID>
REVIEW_ORCH_RUN: <orchestration run ID, if applicable>
REVIEW_CYCLE: <current cycle number, starts at 1>
```

**Action**:
- Cycle 1-2: Executor appends feedback to task, re-dispatches build persona with feedback
- Cycle 3+: Executor escalates to the operator (`waiting:human` + push notification)

## Rules

1. Only emit ONE signal per execution (the last one wins if multiple are emitted)
2. Include the Pulse task ID so the executor can update the right task
3. Be specific in feedback — "fails security review" is not actionable; "SQL injection in line 45 of handler.ts" is
4. Review personas should read the task notes for previous review feedback before reviewing
