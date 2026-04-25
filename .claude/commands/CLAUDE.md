# Commands

**Purpose**: Slash command definitions — the actions Jarvis can perform.

**Layer**: Pneuma (capabilities)

---

## Structure

| Directory | Contents |
|-----------|----------|
| `*.md` | Command definition files |
| `commits/` | Commit-related commands |
| `orchestration/` | Orchestration commands |

## Command Categories

### Session Management
- `setup.md`, `meditate-session.md`

### Self-Improvement
- `reflect.md`, `evolve.md`, `research.md`, `maintain.md`

### Validation
- `tooling-health.md`, `design-review.md`, `validate-selection.md`

### Context Management (JICM v7)
- `jicm.md` — Manual JICM cycle (preserve + compress + prepare for /clear)
- `intelligent-compress.md` — Silent JICM compression (called by watcher)
- `context-analyze.md`, `context-budget.md`

### Testing
- `dev-test.md`

### Dev Session
- `export-dev.md` — Export W5:Jarvis-dev chat to timestamped file
- `dev-chat.md` — Browse and read saved dev chat exports

### Ulfhedthnar
- `unleash.md`, `disengage.md`

### Milestone & Review
- `review-milestone.md`, `health-report.md`, `housekeep.md`

### Autonomous Execution
- Handled by `autonomous-commands` skill (signal-based automation)

### Orchestration
- `orchestration/plan.md`, `orchestration/status.md`, `orchestration/resume.md`

## Creating New Commands

1. Create `<command-name>.md`
2. Include YAML frontmatter with triggers
3. Define command behavior
4. Test invocation

---

*Jarvis — Pneuma Layer (Capabilities)*
