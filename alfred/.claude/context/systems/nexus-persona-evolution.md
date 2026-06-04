# Nexus Persona Evolution — Vision Document

**Status**: Vision / Future Work
**Created**: 2026-03-19
**Pulse Task**: AIProjects-pil6
**Tracks**: Multi-persona delegation, typed workflows, persona methodology, voice differentiation, project plan integration

---

## The Long-Term Vision

Nexus today is a **dispatch system** — it routes tasks to flat executors that each work alone. The vision is to evolve it into a **workforce system** — a self-managing team of AI specialists that can delegate to each other, follow defined playbooks, review each other's work, and progressively reduce Sir's involvement.

The end state: Sir creates a high-level task ("audit the security of project X") and the system decomposes it, assigns specialists, coordinates handoffs, runs reviews, and delivers a finished product. Sir's role shifts from operator to reviewer.

### Key Principles (from Sir's review)

1. **Project plan integration** — Tasks create tasks back into the project plan. A task can include references to files, context docs, and artifacts that need to be orchestrated through Nexus when the task comes due. The system is both executor and planner.
2. **Nested workflows** — A workflow phase can itself spawn a full workflow. Recursive decomposition means a security audit inside a fullstack feature is just a nested workflow, not a special case.
3. **Separation of duties** — Built into the persona/workflow system. Different personas have different authorities, methods, and review criteria. This is structural, not just organizational.
4. **Quality-aware budgeting** — Budget should drive depth of work, not just be a cost ceiling. "Spend 10 hours on this" produces different quality than "1 hour." Personas should adjust their thoroughness based on the quality expectation, not just stop when budget runs out.
5. **Diverse perspectives** — Specialized personas should genuinely approach problems differently. A backend engineer, a database engineer, and a UX engineer given the same task should produce different analyses. A project manager persona coordinates these perspectives into a coherent plan.
6. **Direct persona assignment** — Not just label-driven routing. A persona (or Sir) should be able to say "ask security-reviewer specifically to pick this up." Named delegation, not just capability matching.
7. **Recurring task visibility** — Workflows need a management layer. Recurring tasks (weekly audits, periodic reviews) need visibility, scheduling, and status tracking at the workflow level, not just individual task level.

**Constraint**: This system is built ON Claude Code licensing. Research multi-agent frameworks (CrewAI, AutoGen, etc.) for patterns and ideas, but do not adopt them. We're extending Nexus, not replacing it.

---

## Current State: What Exists

### Primitives

| Primitive | What It Is | Where It Lives |
|-----------|-----------|----------------|
| **Persona** | Identity + prompt + permissions + model | `.claude/jobs/personas/<name>/` |
| **Job** | Schedule + budget + persona + pre_check | `.claude/jobs/registry.yaml` |
| **Skill** | Reusable procedure any Claude can invoke | `.claude/skills/<name>/SKILL.md` |
| **Orchestration** | Multi-phase task decomposition | `.claude/orchestration/*.yaml` |
| **Labels** | Routing metadata on tasks | `label-taxonomy.yaml`, Pulse API |

### 17 Personas (16 + template)

| Persona | Role | Pipeline Stage |
|---------|------|---------------|
| task-evaluator | Score and classify intake tasks | intake -> route/queue |
| task-investigator | Route scored tasks to handlers | route -> queue/review |
| ai-david | Proxy review for Sir's queue | review -> queue |
| task-executor | Execute general tasks (file-ops, code) | queue -> execute |
| task-executor-infra | Infrastructure deployments | queue -> execute |
| task-research | Research task execution | queue -> execute |
| infrastructure-deployer | Deploy infrastructure changes | on-demand |
| pipeline-reviewer | Pipeline health and label audits | scheduled |
| autofix-executor | Execute approved proposals | on-demand |
| researcher | Deep research tasks | on-demand |
| analyst | Data analysis | on-demand |
| investigator | Problem investigation | on-demand |
| troubleshooter | Debug and resolve issues | on-demand |
| librarian | Knowledge organization | scheduled |
| aurora-* (5 personas) | Creative surprise pipeline | Aurora tenant |

### What personas are today

Each persona is a flat directory:

```
personas/<name>/
  prompt.md             — Identity, role, behavior, constraints
  config.yaml           — Model, budget, timeout, allowed tools
  permissions.yaml      — Bash allowlist for headless execution
  learned-patterns.yaml — (ai-david only) Decision pattern memory
```

### What's missing

- **No voice** — all personas write in the same generic style. You can't tell who did the work.
- **No methodology** — no structured definition of what methods a persona uses, what concerns it, what knowledge it references, what review criteria it applies.
- **No delegation** — no persona can ask another persona to do something. Every task is handled end-to-end by one executor.
- **No workflows** — no formalized multi-step playbooks for recurring task types. Complex tasks either get done in one shot or require Sir to manually decompose them.
- **No project plan feedback loop** — tasks can't create follow-up tasks back into the project plan with file references and scheduling for future orchestration.
- **No attribution** — dashboard doesn't show which persona completed a task.
- **No review handoffs** — no structured way for one persona to review another's work.
- **No quality-aware budgeting** — budget is a cost ceiling, not a quality signal.

### What already works (and shouldn't change)

- Label-driven routing through the pipeline
- Dispatcher + executor architecture
- Skill system (any persona can invoke any skill)
- Pulse task management
- AI David's `learned-patterns.yaml` — **this is the prototype for what every persona should have**

---

## Architecture Layer Model

```
Project Plan             "Feature X needs security audit by March 25"
       |                 Tasks with file refs, due dates, workflow bindings
Workflow Templates       "For security audits: recon -> scan -> analyze -> report -> remediate"
       |                 Can nest: a phase can trigger another full workflow
Project Manager          Coordinates specialists, merges diverse perspectives
       |
   Personas              "Researcher", "Security Reviewer", "Backend Eng", "DB Eng", "UX Eng"
       |                 Each with: identity, voice, methodology, knowledge refs, concerns
   Skills                "/semgrep", "/code-review", "/differential-review"
       |
   Tools                 Bash, Edit, Read, MCP tools, Pulse CLI
```

**Project plan feeds workflows. Workflows assign personas. Personas follow methodologies. Methodologies invoke skills. Skills use tools.**

This is a layering, not a replacement. Current flat dispatch still works for simple tasks. Workflows layer on top for complex tasks that benefit from multi-persona coordination.

---

## Proposed Additions

### 1. Persona Methodology Files

Generalize AI David's `learned-patterns.yaml` into a standard `methodology.yaml` for every persona. This is the persona's "brain" — what it knows, what it cares about, how it works.

```yaml
# personas/<name>/methodology.yaml

identity:
  name: "Security Reviewer"
  voice:
    tone: precise, cautious, evidence-driven
    style: leads with risk level, cites CWE/CVE references, uses severity ratings
    markers: prefixes findings with [CRITICAL], [HIGH], [MEDIUM], [LOW]
    sign_off: "-- Security Review Complete. {n} findings, {m} require action."

methods:
  - name: static-analysis
    description: "Run Semgrep with security rulesets against target codebase"
    skills: ["/semgrep"]
    when: "Any code review or security audit task"
  - name: differential-review
    description: "Review code changes for security regressions"
    skills: ["/differential-review"]
    when: "PR review, post-implementation review"
  - name: dependency-audit
    description: "Check for known vulnerabilities in dependencies"
    skills: ["/supply-chain-risk-auditor"]
    when: "New dependency added, periodic audit"

concerns:
  - "Input validation at system boundaries"
  - "Authentication and authorization bypass"
  - "Secrets in code or config"
  - "OWASP Top 10 patterns"
  - "Supply chain risk in new dependencies"

knowledge_references:
  - ".claude/context/systems/owasp-agentic-mitigations.md"
  - ".claude/context/patterns/security-*"
  - "OWASP Top 10 (web search for current version)"

review_criteria:
  - "All user inputs sanitized before use"
  - "No hardcoded secrets or credentials"
  - "Authentication required on all sensitive endpoints"
  - "Dependencies pinned to known-good versions"
  - "Error messages don't leak internal state"

delegation_can_request:
  - persona: researcher
    for: "Background research on unfamiliar vulnerability classes"
  - persona: task-executor
    for: "Apply remediation fixes after review"

quality_scaling:
  quick: "Top-level scan, flag obvious issues only"
  standard: "Full Semgrep scan + dependency check + manual review of critical paths"
  deep: "All of standard + threat modeling + attack surface mapping + remediation plan"
```

**Why this matters**: Today, all the knowledge about what a persona should do lives in `prompt.md` as prose. Prose is good for LLM consumption but bad for:
- Auditing what a persona is responsible for
- Comparing personas' domains for overlap
- Programmatically routing based on capabilities
- Building a review matrix (who reviews whose work)
- Scaling quality based on budget (the `quality_scaling` field)

Methodology YAML makes persona capabilities machine-readable while still being LLM-consumable.

**The perspective problem**: When you ask a backend engineer, a database engineer, and a UX engineer to review the same feature request, they should produce genuinely different analyses. The backend eng thinks about API design and service boundaries. The DB eng thinks about schema, query patterns, and data integrity. The UX eng thinks about user flows and experience. A `methodology.yaml` with distinct `concerns` and `review_criteria` produces this naturally — each persona filters the problem through its own lens. A **project manager persona** then synthesizes these perspectives into a coherent plan.

**Difficulty**: Medium. Designing the schema is the hard part. Populating it for 17 personas is labor but not complexity. Could start with 3-4 key personas and iterate the schema.

### 2. Delegation Model

This is the core of the workforce system. Four delegation patterns, from simplest to most complex:

#### Pattern A: Sub-task Creation (Simplest)
A lead persona creates Pulse tasks for other personas. This is "fire and forget" — the lead creates the task, labels it appropriately, and the pipeline routes it.

```
Lead persona: "I need a security review of this code"
  → pulse create "Security review: <project>" -l "capability:security,stage:queue"
  → pipeline routes to security reviewer persona
  → security reviewer completes task independently
```

**Already possible today.** Some personas can create tasks (check permissions). The gap is coordination — the lead doesn't know when sub-tasks finish.

#### Pattern A+: Direct Persona Assignment
Like Pattern A, but instead of label-driven routing, the creating persona names who should pick it up:

```
Lead persona: "I need security-reviewer specifically to review this"
  → pulse create "Security review: <project>" -l "assigned:security-reviewer,stage:queue"
  → routing sees assigned: label and bypasses capability matching
  → security-reviewer picks up directly
```

This enables "ask a specific persona" — not just "ask whoever handles security." Useful when the lead knows exactly who should do it, or when Sir wants to direct work to a specific specialist.

#### Pattern B: Tool/Skill Invocation Request
A persona can't run another persona, but it can create a task that says "run this specific skill and put results here."

```
Lead persona: "Run /semgrep on ~/Code/AIFred-Pro and save results to task notes"
  → Creates task with specific instructions
  → Specialist persona picks up, runs the skill, writes results
```

**Close to possible today.** The missing piece is a structured way to say "I need X from you" that's more than free-text task descriptions.

#### Pattern C: Review Handoff
After completing work, a persona creates a review task for a different persona. The reviewer has defined criteria (from their methodology.yaml) and either approves, requests changes, or escalates.

```
task-executor: "Implemented feature X. Creating review task."
  → Creates review task: "Review: feature X implementation"
  → Labels: capability:review, review-type:security
  → Security reviewer picks up, reviews against criteria
  → Approves → original task moves to done
  → Requests changes → creates follow-up task for executor
```

**New capability.** Requires: review task type, approval/rejection flow, follow-up task creation. This is the **separation of duties** — the person who writes the code is not the person who reviews it.

#### Pattern D: Coordinated Workflow (Most Complex)
A lead persona (or project manager) manages a multi-phase workflow, tracking sub-task progress and coordinating handoffs.

```
ai-david: "This is a fullstack feature. Loading workflow template."
  → Creates sub-tasks for each phase
  → Monitors completion of each phase
  → Triggers next phase when dependencies met
  → Does final integration when all phases complete
```

**Supports nesting**: A phase in one workflow can trigger a completely separate workflow. Example: the "security review" phase of a fullstack-feature workflow triggers the full security-audit workflow as a nested child. When the nested workflow completes, the parent phase is marked done and the next phase can proceed.

```
fullstack-feature workflow
  ├── Phase 1: analyze (analyst)
  ├── Phase 2: implement (task-executor)
  ├── Phase 3: security-review → triggers security-audit workflow
  │     ├── Phase 3a: recon (researcher)
  │     ├── Phase 3b: scan (security-reviewer)
  │     └── Phase 3c: report (analyst)
  ├── Phase 4: test (task-executor)  [waits for Phase 3 workflow to complete]
  └── Phase 5: integrate (task-executor)
```

**Significant new capability.** Requires: workflow templates, completion detection, dependency tracking, error handling for failed phases, nested workflow support.

#### Pattern E: Project Plan Feedback Loop
A persona completing work creates follow-up tasks back into the project plan — not just "here's a bug I found" but structured tasks with file references, context links, due dates, and workflow bindings for future orchestration.

```
security-reviewer: "Found 3 issues. Creating follow-up tasks in project plan."
  → pulse create "Fix SQL injection in auth handler" \
      -l "capability:code,project:aifred,priority:1" \
      -d "## Context\nFound during security audit AIProjects-pil6\n## References\n- File: ~/Code/AIFred-Pro/src/auth/handler.ts:47\n- Finding: SARIF report at .claude/agent-output/results/...\n## Workflow\nworkflow:code-fix (implement → test → security-verify)"
  → Task enters project plan with full context
  → When it comes up as ready, Nexus orchestrates the workflow automatically
```

This closes the loop: work produces more work, and that work is structured enough for Nexus to orchestrate it without Sir's involvement.

#### Recommendation

Build order:
1. **Pattern A** (already nearly works) — 1-2 sessions
2. **Pattern A+** (direct assignment, small extension) — 1 session
3. **Pattern C** (review handoff, high value) — 3-5 sessions
4. **Pattern E** (project plan feedback, enables autonomy) — 2-4 sessions
5. **Pattern B** (skill invocation, refinement) — 2-3 sessions
6. **Pattern D** (coordinated workflows, the big leap) — 8-15 sessions

**Difficulty assessment**:

| Pattern | Effort | Sessions | Dependencies |
|---------|--------|----------|-------------|
| A: Sub-task creation | Low | 1-2 | Persona permissions to create tasks |
| A+: Direct persona assignment | Low | 1 | `assigned:` label convention in routing |
| B: Skill invocation request | Low-Med | 2-3 | Structured task description format |
| C: Review handoff | Medium | 3-5 | Review criteria YAML, approval flow, follow-up creation |
| D: Coordinated workflow | High | 8-15 | Workflow templates, completion detection, nesting support |
| E: Project plan feedback | Medium | 2-4 | Structured task creation with file refs and workflow binding |

### 3. Typed Workflow Templates

For recurring complex task types, define orchestration templates that specify which personas handle which phases:

```yaml
# .claude/orchestration/templates/security-audit.yaml
name: security-audit
description: Multi-phase security audit workflow
trigger:
  labels: ["capability:security", "type:audit"]

lead_persona: ai-david  # Coordinates the workflow

# Quality expectation drives depth across all phases
quality: standard  # quick | standard | deep — personas check their quality_scaling

# Recurring schedule (optional — for workflows that repeat)
schedule:
  cron: "0 9 * * 1"  # Weekly Monday 9am
  recurring: true
  visibility: dashboard  # Shows in recurring workflows dashboard view

phases:
  - name: reconnaissance
    persona: researcher
    description: "Research the target, identify attack surface"
    creates_subtask: true
    subtask_labels: [capability:research, type:investigation]
    output: "Obsidian note with attack surface map"

  - name: static-analysis
    persona: security-reviewer
    depends_on: [reconnaissance]
    description: "Run Semgrep, check dependencies, review code patterns"
    skills: ["/semgrep", "/supply-chain-risk-auditor"]
    output: "SARIF findings + summary in task notes"

  - name: findings-report
    persona: analyst
    depends_on: [static-analysis]
    description: "Synthesize findings into actionable report"
    output: "Obsidian report with severity-ranked findings"

  - name: remediation
    persona: task-executor
    depends_on: [findings-report]
    description: "Apply fixes for critical and high findings"
    optional: true
    output: "Code changes committed to branch"

  - name: verification
    persona: security-reviewer
    depends_on: [remediation]
    description: "Re-scan to confirm fixes don't introduce new issues"
    optional: true

# Nested workflow support
allows_nesting: true  # Phases can trigger child workflows

# What happens when a phase fails
failure_handling:
  default: escalate  # Stop at the failed phase, escalate to Sir
  optional_phases: skip  # Optional phases that fail are skipped, not escalated

completion:
  notify: telegram
  summary_to: obsidian
  create_followups: true  # Pattern E — persona creates follow-up tasks from findings
```

Another example — fullstack feature with nested security workflow:

```yaml
# .claude/orchestration/templates/fullstack-feature.yaml
name: fullstack-feature
trigger:
  labels: ["type:feature", "capability:code"]

lead_persona: ai-david
quality: standard

phases:
  - name: analyze
    persona: analyst
    description: "Understand the codebase, identify files to modify"
    skills: ["/analyze-codebase"]

  - name: implement
    persona: task-executor
    depends_on: [analyze]
    description: "Implement the feature"
    skills: ["/feature-dev"]

  - name: security-review
    depends_on: [implement]
    # Instead of a single persona, trigger a nested workflow
    workflow: security-audit
    workflow_context:
      target: "{{task.project_path}}"
      scope: "changes only"  # Only audit the new code, not the whole project

  - name: test
    persona: task-executor
    depends_on: [implement]
    description: "Write and run tests"

  - name: integrate
    persona: task-executor
    depends_on: [test, security-review]
    description: "Address review feedback, finalize PR"
```

**How workflow selection works** (three options to evaluate):

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **Label-driven** | `workflow:security-audit` label triggers template | Deterministic, no LLM cost | Rigid — someone must know to add the label |
| **Triage persona** | A triage persona examines the task and selects | Flexible, handles ambiguity | Extra LLM call, potential misjudgment |
| **Hybrid** | Label if present, triage fallback if not | Best of both | More complex routing logic |

**Recommendation**: Start label-driven, add triage later if needed. Most tasks that need workflows will come from Sir or AI David, who can add the workflow label.

**Recurring workflow management**: Workflows with `schedule.recurring: true` appear in a dedicated dashboard view showing last run, next run, status, and trend data. This gives visibility into periodic work (weekly security scans, monthly infra reviews) without cluttering the one-off task views.

**Difficulty**: Medium-high. The template schema is straightforward (extends existing orchestration). The hard part is the orchestrator that reads a template, creates sub-tasks, monitors completion, and handles nesting. Estimate 8-15 sessions for full implementation including nesting.

### 4. Project Manager Persona

A new persona type: the **project manager**. Not just a coordinator — it synthesizes diverse specialist perspectives into coherent plans.

When a complex task arrives that needs multiple specialists:

```
PM receives: "Design the new API for user management"
  → Creates parallel analysis tasks:
      - assigned:backend-eng "Analyze API design: service boundaries, auth, rate limiting"
      - assigned:db-eng "Analyze data model: schema, queries, migrations, integrity"
      - assigned:ux-eng "Analyze UX impact: user flows, error handling, documentation"
  → Each specialist produces their perspective (genuinely different due to methodology.yaml)
  → PM synthesizes: "Backend wants microservice split, DB wants single schema, UX wants simple endpoints.
     Recommendation: monolith with clean internal boundaries, single schema, simplified API surface."
  → Creates implementation plan with phases assigned to appropriate specialists
```

This persona doesn't write code — it coordinates and makes architectural tradeoff decisions. It reads all specialist outputs and produces a plan that balances competing concerns.

**Difficulty**: High — requires Pattern D (coordinated workflows) + well-defined specialist methodologies first. This is a Phase 3+ capability.

### 5. Voice Differentiation

Add voice definitions to personas so their output is distinguishable. This serves both traceability (who did this?) and quality (output matches the persona's domain expectations).

Voice tiers:
- **Functional** (pipeline personas): Distinct writing patterns but no personality. You'd notice from structure and vocabulary, not tone.
- **Professional** (visible personas): Clear identity. AI David reads like Sir's decision style. Researcher writes structured analysis. Security reviewer leads with risk.
- **Creative** (Aurora only): Personality-forward voice appropriate for surprise deliverables.

**Implementation**: `## Voice` section in `prompt.md` plus voice fields in `methodology.yaml`. Start with 3-4 key personas, validate the approach, then roll out.

**Difficulty**: Low-medium. The writing is prompt engineering. The validation is whether output actually feels different. May need iteration.

### 6. Attribution Tracking

When a persona completes a task, stamp who did it:

```bash
nexus-label add <task_id> "completed-by:<persona-name>" <persona-name>
```

Dashboard shows:
- Per-task: "Completed by: security-reviewer"
- Aggregate: "This week: 12 tasks by task-executor, 8 by researcher, 3 by security-reviewer"
- Workflow view: Parent task with children, each showing which persona handled it

Also enables **direct assignment**: a persona or Sir can say "ask security-reviewer to pick this up" by adding `assigned:security-reviewer` — routing honors this over generic capability labels.

**Difficulty**: Low. Label stamping is trivial. Dashboard visualization is 1-2 sessions.

### 7. Quality-Aware Budgeting

Today, budget = "stop after $X." This is a blunt instrument. The vision: budget expresses **expected quality level**, and personas adjust their thoroughness accordingly.

```yaml
# In workflow template or task metadata
quality: quick     # Fast pass, surface-level. ~15 min persona time.
quality: standard  # Normal depth. ~1 hour persona time.
quality: deep      # Thorough analysis. ~3+ hours persona time.
```

Each persona's `methodology.yaml` has a `quality_scaling` section that defines what each level means for their specific work. A "quick" security review is a Semgrep scan. A "deep" security review is Semgrep + dependency audit + threat model + attack surface mapping + remediation plan.

The budget ceiling still exists as a safety net, but the primary signal is quality level. This changes the question from "how much can you spend?" to "how thorough should you be?"

**Difficulty**: Low-medium. Add `quality_scaling` to methodology YAML, add `quality` field to workflow templates, teach personas to check it. The hard part is calibrating what "quick" vs "deep" means for each persona — but that's iterative.

---

## Difficulty & Scoping Summary

| Component | Effort | Sessions | Risk | Depends On |
|-----------|--------|----------|------|-----------|
| Attribution labels + direct assignment | Low | 1-2 | None | Nothing |
| Voice in prompts | Low-Med | 2-3 | Low (iterative) | Nothing |
| Methodology YAML schema | Medium | 2-4 | Medium (schema design) | Nothing |
| Populate methodology for key personas | Medium | 3-5 | Low (labor) | Schema design |
| Quality-aware budgeting | Low-Med | 2-3 | Low | Methodology YAML |
| Sub-task delegation (Patterns A/A+) | Low | 2-3 | Low | Nothing |
| Project plan feedback (Pattern E) | Medium | 2-4 | Medium | Structured task format |
| Review handoff (Pattern C) | Medium | 3-5 | Medium | Methodology YAML |
| Workflow template schema (with nesting) | Medium-High | 3-5 | Medium (schema design) | Nothing |
| Workflow orchestrator | High | 5-8 | High (coordination logic) | Templates + delegation |
| Recurring workflow visibility | Medium | 2-3 | Low | Workflow templates |
| Full coordinated workflows (Pattern D) | High | 8-15 | High | All of the above |
| Project manager persona | High | 3-5 | High | Pattern D + specialist methodologies |

**Total estimate**: 35-60 sessions to reach full vision. Each phase delivers independent value.

**Recommended build order**:
1. Attribution + direct assignment (immediate value, 1-2 sessions)
2. Methodology YAML schema + 3-4 personas (design foundation, 4-6 sessions)
3. Voice in prompts (visible improvement, 2-3 sessions)
4. Quality-aware budgeting (integrate into methodology, 2-3 sessions)
5. Sub-task delegation Patterns A/A+ (enable basic coordination, 2-3 sessions)
6. Project plan feedback Pattern E (close the autonomy loop, 2-4 sessions)
7. Review handoff Pattern C (quality/separation of duties, 3-5 sessions)
8. Workflow templates + orchestrator + nesting (the big leap, 8-15 sessions)
9. Recurring workflow visibility (management layer, 2-3 sessions)
10. Project manager persona (synthesize specialist perspectives, 3-5 sessions)

---

## External Research Needed

**Constraint**: We build ON Claude Code. Research these frameworks for patterns and design ideas to adapt, not to adopt.

### Multi-Agent Orchestration Frameworks
- **CrewAI** — Python framework for multi-agent collaboration. Study their "hierarchical process" where a manager agent coordinates workers. How do they handle delegation failure, conflicting outputs, budget allocation? Their role/task/process model is closest to what we're building.
- **AutoGen** (Microsoft) — Multi-agent conversation framework. Relevant for understanding how agents negotiate handoffs.
- **LangGraph** — Graph-based agent workflows. Their state machine approach to agent coordination might inform our workflow template design — particularly how they handle branching and nesting.
- **OpenAI Agents SDK** — Agent handoff patterns (transfer functions between agents). Their approach to "I'm done, hand off to agent Y" is directly relevant.

**What to learn**: How do these frameworks handle (1) delegation failure/timeout, (2) conflicting agent outputs, (3) state sharing between agents? We adapt the patterns; we don't adopt the frameworks.

### Workflow Engine Concepts
- **Temporal.io** — Durable workflow engine concepts (activity retry, saga patterns, workflow versioning, failure recovery). We don't need to build Temporal, but should learn from its failure modes.
- **State machine patterns** — How to model workflow phases with clean transitions, error recovery, and rollback.

**What to learn**: What failure modes exist in multi-step agent workflows? In our case, phase failure means work stops at the dependency boundary and escalates to Sir for review. But what about partial failures, retryable errors, and cascading rollbacks?

**Example of phase failure**: The security-audit workflow is running. Phase 2 (static analysis) fails because Semgrep can't parse the project's build system. What should happen?
- The failed phase is marked `failed` with error details
- Dependent phases (findings-report, remediation) are blocked — they can't proceed without scan results
- Independent work (if any) continues
- The workflow is escalated to Sir: "Phase 2 failed: Semgrep couldn't parse build system. Options: (a) fix build config and retry, (b) skip static analysis and proceed with manual review, (c) abort workflow."
- Sir decides; the system resumes from where it left off.

### Persona Voice Engineering
- How do multi-character AI systems maintain distinct voices? (game NPC systems, chatbot platforms)
- What's the minimal effective voice spec that produces reliably distinct output?
- Diminishing returns — how much voice instruction is enough?

**The bigger question**: Different specialist personas should approach the same problem from genuinely different angles (backend eng vs DB eng vs UX eng). This isn't just voice — it's methodology, concerns, and priorities. A project manager persona then synthesizes these diverse perspectives. Research how multi-agent systems handle conflicting specialist recommendations.

### Key Research Questions
1. **Phase failure handling** — How do multi-agent systems handle it when one agent in a chain fails? Our default: stop at dependency boundary, escalate to human. But what about retries, fallbacks, and partial completion?
2. **Structured delegation protocols** — Complex projects should include a full plan that specifies exactly who does what with what inputs. Is there a standard schema for this beyond ad-hoc task descriptions? Study CrewAI task definitions and LangGraph state schemas.
3. **Quality-budget relationship** — How do commercial systems express "spend more effort on this"? Not just cost ceilings but quality expectations that drive depth. Study how human project management handles this (story points, T-shirt sizing) and whether those concepts translate to agent work.
4. **Nested workflow coordination** — When workflow A's phase 3 triggers workflow B as a child, how does state flow? How does the parent know the child is done? How do errors in the child propagate to the parent?

---

## Open Design Questions

These are genuine unknowns that should be resolved through research and small experiments, not decided upfront:

1. **Methodology YAML schema**: What fields does every persona need vs. what's role-specific? AI David's `learned-patterns.yaml` is one pattern. The security reviewer example above is another. What's the universal schema?

2. **Workflow selection**: Label-driven vs. triage persona judgment vs. hybrid? (See comparison table above.) Need to test with real tasks to see which feels right.

3. **Voice distinctiveness**: How distinct should personas sound? Need to A/B test functional vs. personality-forward on real tasks and see what Sir prefers.

4. **Worktree isolation**: Should code-touching personas run in separate git worktrees? Prevents conflicts but adds worktree lifecycle management. Current parallel-dev system already has worktree support — could reuse.

5. **Completion signaling**: How does the lead persona know sub-tasks are done?
   - **Polling** (lead checks on next scheduled run) — simple, fits current cron-based architecture
   - **Event-watcher enhancement** (detects all children done, stamps parent) — more responsive, bash-level
   - **Callback** (sub-task completion triggers parent re-evaluation via message bus) — most responsive, most complex

6. **Error handling in workflows**: Default is escalate to Sir at dependency boundary. But what about retryable errors? Optional phase failures? Should the orchestrator have retry logic or is that over-engineering for now?

7. **Quality-budget calibration**: How do we define what "quick" vs "standard" vs "deep" means per persona? Start with rough guidelines and refine from feedback? Or define formally upfront?

8. **Methodology learning**: Should personas other than AI David learn from feedback? If the security reviewer misses something and Sir catches it, should that become a learned pattern? (Probably yes — extend the AI David feedback loop to all personas.)

9. **Project plan integration depth**: How structured should follow-up tasks be? Minimum viable: title + labels + description with file refs. Full vision: task includes workflow binding, due date, dependency on other planned tasks, and context links. Start minimal?

10. **Recurring workflow dashboard**: What does the management view for recurring workflows look like? Calendar view? Status board? How does it relate to the existing Pulse dashboard?

---

## Related Documentation

- `.claude/context/systems/nexus.md` — Nexus component map
- `.claude/context/systems/stage-lifecycle.md` — Pipeline stage definitions
- `.claude/context/systems/nexus-plumbing-map.md` — Dependency map, data flows
- `.claude/jobs/lib/routing-rules.yaml` — Routing criteria per executor
- `.claude/jobs/personas/_template/` — Persona directory structure
- `.claude/jobs/personas/ai-david/learned-patterns.yaml` — Prototype methodology file
- `.claude/orchestration/README.md` — Existing orchestration system

## Evaluator Brief

<!-- Machine-readable section for NEXUS task evaluator. Keep structured and current. -->

### Key File Paths

| What | Path |
|------|------|
| Vision document (this file) | `.claude/context/systems/nexus-persona-evolution.md` |
| All persona directories | `.claude/jobs/personas/` (25 personas) |
| Persona template | `.claude/jobs/personas/_template/` |
| Team runner | `.claude/jobs/team-runner.py` |
| Team runner tests | `.claude/jobs/tests/test_team_runner.py` |
| AI David persona | `.claude/jobs/personas/ai-david/` |
| AI-to-AI pipeline research | Obsidian `05-AI/Claude-Research/2026-03-21-ai-to-ai-product-pipeline-design.md` |
| OpenClaw comparison | Obsidian `05-AI/Claude-Research/` (AIProjects-9i9f output) |

### Models & Tools

- **Claude Code** (headless) — persona execution via executor.sh
- **team-runner.py** — multi-agent consensus (unanimous-approve, majority, any-deny-blocks)
- **25 personas** currently registered in `.claude/jobs/personas/`

### Decisions Made

| Date | Decision | Context |
|------|----------|---------|
| 2026-03-19 | Vision document created — workforce system, not just dispatch | Sir's review defined: project plan integration, nested workflows, separation of duties |
| 2026-03-21 | OpenClaw evaluated — not comparable to CrewAI/AutoGen for this use case | Research task completed |
| 2026-03-21 | AI-to-AI Product Pipeline design research completed | Full spec at Obsidian research doc |

### Open Questions

- [ ] AI-to-AI Product Pipeline implementation — design approved, build pending (AIProjects-wjnz)
- [ ] ADMIN: 3 duplicate clusters in open tasks need dedup — "create dev-manager personas" (ws2r, 8vvn, i0wb) and "define Product Artifact JSON schema" (4gb5, ugmk, bf1w)
- [ ] Apply OpenClaw findings to comparison research (AIProjects-9i9f)

### Related Tasks

| Task ID | Title | Status | Relationship |
|---------|-------|--------|-------------|
| AIProjects-wjnz | Design: AI-to-AI Product Pipeline | open | Research — design complete, build pending |
| AIProjects-ws2r | Build dev-manager + product personas (variant 1) | open | DUPLICATE cluster — needs dedup |
| AIProjects-8vvn | Create dev-manager and product personas (variant 2) | open | DUPLICATE cluster — needs dedup |
| AIProjects-i0wb | Create dev-manager personas (variant 3) | open | DUPLICATE cluster — needs dedup |
| AIProjects-4gb5 | Define Product Artifact JSON schema (variant 1) | open | DUPLICATE cluster — needs dedup |
| AIProjects-ugmk | Define Product Artifact JSON schema (variant 2) | open | DUPLICATE cluster — needs dedup |
| AIProjects-bf1w | Define Product Artifact JSON schema (variant 3) | open | DUPLICATE cluster — needs dedup |
| AIProjects-9i9f | Apply OpenClaw findings to comparison research | open | Research — follow-up |
