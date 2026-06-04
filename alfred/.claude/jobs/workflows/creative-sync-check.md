# Detect drift between AIProjects and CreativeProjects reusable components

Compare reusable components between AIProjects and CreativeProjects to detect
drift. Focus ONLY on components that are universal (not infrastructure-specific).

STEP 1 — Compare shared hooks for version drift:
For each hook that exists in BOTH projects, diff the files:
  diff ~/AIProjects/.claude/hooks/<hook>.js ~/CreativeProjects/.claude/hooks/<hook>.js
Shared hooks to check: audit-logger.js, pre-compact.js, session-start.js
Report any that differ.

STEP 2 — Check for new reusable components in AIProjects:
Run these comparisons (list files in each, find items only in AIProjects):
  Hooks: ls ~/AIProjects/.claude/hooks/*.js vs ~/CreativeProjects/.claude/hooks/*.js
  Skills: ls ~/AIProjects/.claude/skills/ vs ~/CreativeProjects/.claude/skills/
  Commands: ls ~/AIProjects/.claude/commands/*.md vs ~/CreativeProjects/.claude/commands/*.md
  Patterns: ls ~/AIProjects/.claude/context/patterns/*.md vs ~/CreativeProjects/.claude/context/patterns/*.md
  Agents: ls ~/AIProjects/.claude/agents/*.md vs ~/CreativeProjects/.claude/agents/*.md

STEP 3 — Filter for relevance:
SKIP infrastructure-specific items (these are NOT sync candidates):
  - Docker hooks: compose-validator, docker-health-check, docker-validator,
    network-validator, port-conflict-detector, restart-loop-detector
  - Service hooks: health-monitor, paths-registry-sync, service-registration-detector
  - Infrastructure commands: check-health, check-gateway, check-services,
    discover-docker, backup-status, ssh-connect, register-service, n8n,
    link-external, metrics, new-code-project, analyze-codebase
  - Infrastructure agents: docker-deployer, plex-troubleshoot, service-troubleshooter,
    parallel-dev-*, code-analyzer, code-implementer, code-tester
  - Infrastructure skills: infrastructure-ops, system-utilities, project-lifecycle
  - Infrastructure patterns: aiprojects-aifred-sync, authentik-automation,
    health-endpoint, service-architecture, cross-project-commit-tracking
  - Pulse-specific: beads-actor.sh, beads-aliases.sh, priority-validator

Everything else that exists in AIProjects but NOT in CreativeProjects is a
sync candidate.

STEP 4 — Check git log for recent changes to shared components:
Run: git -C ~/AIProjects log --oneline --since="7 days ago" -- .claude/hooks/ .claude/skills/ .claude/commands/ .claude/context/patterns/ .claude/agents/
Flag any recently modified shared components.

STEP 5 — Output:
If sync candidates or drifted shared hooks are found:
  1. Dedup against existing Pulse tasks:
     pulse list --status open --label project:aiprojects | grep -i "creative"
  2. If no existing task covers these findings, create ONE summary Pulse task:
     pulse create "CreativeProjects sync needed — N new components available" \
       -t task -p 3 \
       -l "domain:infrastructure,project:aiprojects,source:headless" \
       -d "Weekly sync check found drift. New sync candidates: <list>. Drifted shared hooks: <list>. Run full sync review to propagate."
If nothing new found: output "CreativeProjects sync: no new drift detected" and stop.

Do NOT modify any source files. Only create Pulse tasks if drift is found.
