# Claude Code Hooks

Automatic behaviors that run before/after tool executions.

**Created**: 2025-12-06
**Last Updated**: 2026-01-22
**Registered Hooks**: 17 (active in settings.json)
**Unregistered Hooks**: 19 (documented but not configured)
**Deprecated Hooks**: 3

> **IMPORTANT (2026-01-22)**: All registered hooks use stdin/stdout executable pattern.
> Unregistered hooks still use old module.exports pattern and need conversion before enabling.
> See [Creating New Hooks](#creating-new-hooks) for the correct pattern.

---

## Active Hooks Summary

### Registered Hooks (16) - Active in settings.json

| Category | Hooks | Purpose |
|----------|-------|---------|
| **Lifecycle (5)** | session-start, session-stop, subagent-stop, pre-compact, self-correction-capture | Session context, notifications, agent chaining, context preservation, learning |
| **Core (4)** | audit-logger, docker-health-check, file-access-tracker, cross-project-commit-tracker | Logging, container health, context file usage, multi-project commits |
| **Security (2)** | secret-scanner, branch-protection | Prevent secrets, protect branches |
| **Workflow (6)** | prompt-enhancer, lsp-redirector, orchestration-detector, skill-router, fabric-suggester, project-detector | LSP navigation, prompt guidance, task orchestration, skill routing, project/tool detection |

### Unregistered Hooks (20) - Documented but need conversion

| Category | Hooks | Notes |
|----------|-------|-------|
| Security (2) | credential-guard, amend-validator | Need stdin/stdout conversion |
| Infrastructure (2) | docker-validator, port-conflict-detector | Need conversion |
| Documentation (5) | session-exit-enforcer, paths-registry-sync, context-reminder, index-sync, doc-sync-trigger | Need conversion |
| Other (10) | session-tracker, worktree-manager, memory-maintenance, mcp-enforcer, priority-validator, health-monitor, restart-loop-detector, planning-mode-detector, service-registration-detector, context-usage-tracker | Need conversion |

### Deprecated Hooks
| Hook | Replaced By | Date |
|------|-------------|------|
| compose-validator.js | docker-validator.js | 2025-12-24 |
| network-validator.js | docker-validator.js | 2025-12-24 |
| env-validator.js | docker-validator.js | 2025-12-24 |

---

## Lifecycle Hooks (4) - NEW

These hooks handle session lifecycle events - session start, stop, agent completion, and context compaction.

### session-start.js
**Event**: SessionStart | **Blocks**: No

Automatically loads context when Claude Code starts. Injects session-state.md, current-priorities.md, and last session commit summary so Claude immediately knows what was being worked on.

**Injects**:
- Current git branch and uncommitted changes count
- **Last session commit summary** (projects and commit counts)
- Session state (truncated to 2000 chars)
- Current priorities (truncated to 1500 chars)
- Session start timestamp

**Example Output**:
```
📍 Branch: main, 2 uncommitted changes
📊 Last session "Feature Work" (2026-01-06): 7 commits across 3 projects (AIProjects: 2, grc-platform: 4, myDocker: 1)
```

**Result**: No more "read session-state.md" at start of every session.

### session-stop.js
**Event**: Stop | **Blocks**: No

Sends desktop notification when Claude Code session ends. Works on Linux (notify-send), macOS (osascript), and Windows (PowerShell).

**Notifications**:
- ✅ "Claude Code Complete" - Normal completion
- ⚠️ "Claude Code Stopped" - Error occurred
- 🛑 "Claude Code Cancelled" - User cancelled

**Requirement** (Linux): `sudo apt install libnotify-bin`

### subagent-stop.js
**Event**: SubagentStop | **Blocks**: No

Runs when spawned agents (Task subagents) complete. Enables agent chaining and activity logging.

**Features**:
- Logs agent completions to `.claude/logs/agent-activity.jsonl`
- Detects HIGH/CRITICAL issues in agent output
- Suggests next actions based on agent type
- Tracks agent duration and result size

**Agent Chains Configured**:
| Agent | On Issues | Default |
|-------|-----------|---------|
| code-reviewer | Suggests fixes for HIGH issues | Ready for next steps |
| code-explorer | - | Plan implementation |
| code-architect | - | Begin implementation |
| deep-research | - | Findings ready |

### pre-compact.js
**Event**: PreCompact | **Blocks**: No

Preserves critical context before conversation compaction (when context window fills up).

**Preserves**:
- Full content from `compaction-essentials.md` (core paths, patterns, automation expectations)
- Key sections from session-state.md (status, current work, blockers, next steps)
- Recent blockers from `.claude/logs/recent-blockers.md`
- Compaction timestamp

**Result**: Important state survives context compaction.

**Maintenance**: When updating design patterns, paths, or core workflows, also update `.claude/context/compaction-essentials.md`.

**Related**:
- `/context-loss` - Report when Claude forgets context after compaction
- `.claude/context/compaction-essentials.md` - Core context to preserve

### self-correction-capture.js
**Event**: UserPromptSubmit | **Blocks**: No

Detects when user corrects Claude and prompts to save lessons learned.

**Detected Patterns**:
- "No, actually..." / "That's wrong"
- "You should/shouldn't have..."
- "I meant..." / "Correction:"
- Frustration indicators

**Severity Levels**:
- **HIGH**: Contains "wrong", "incorrect", "never do"
- **MEDIUM**: Contains "should have", "supposed to"
- **LOW**: Contains "actually", "clarify"

**On Detection**:
1. Logs to `.claude/logs/corrections.jsonl`
2. Injects context suggesting Claude acknowledge the mistake
3. Prompts: "Should I save this as a lesson learned?"

**Lesson Storage**: `.claude/context/lessons/corrections.md`

### worktree-manager.js
**Event**: PostToolUse | **Blocks**: No

Tracks git worktree context and warns about cross-worktree file operations.

**Features**:
- Detects if running in a worktree vs main repo
- Warns when accessing files in a different worktree
- Logs worktree state to `.claude/logs/.worktree-state.json`
- Periodic status updates (every 5 minutes)

**Cross-Worktree Warning**:
```
⚠️ File is in worktree 'feature-x', not current worktree 'main'
```

**Use Case**: Prevents accidental edits to wrong branch when using parallel Claude sessions.

### orchestration-detector.js
**Event**: UserPromptSubmit | **Blocks**: No

Analyzes user prompts for complexity and triggers the orchestration system when complex multi-phase tasks are detected.

**Tiered Response**:
| Score | Action |
|-------|--------|
| < 4 | Nothing (simple task) |
| 4-8 | Suggest orchestration |
| >= 9 | Auto-invoke orchestration |

**Complexity Signals**:
- Build verbs: "build", "create", "implement", "develop" (+2)
- Scope words: "application", "system", "service", "api" (+2)
- Multi-component: "with authentication", "with database" (+1 each)
- Explicit complexity: "complex", "full", "production" (+3)
- Time indicators: "multi-day", "over multiple sessions" (+2)
- Simplicity words: "simple", "quick", "just" (-2)

**Also Detects**:
- Resume intent: "continue", "pick up where we left off"
- Status checks: "what's the status", "where are we"

**On Detection**:
- Logs to `.claude/logs/orchestration-detections.jsonl`
- Injects context suggesting or requiring `/orchestration:plan`

**Integration**: Works with `/orchestration:plan`, `:status`, `:resume`, `:commit` commands.

### cross-project-commit-tracker.js
**Event**: PostToolUse | **Blocks**: No

Tracks git commits across multiple projects during a Claude Code session. Enables visibility into work spread across AIProjects, myDocker, and ~/Code/* projects.

**Tracked Projects**:
| Path | Project Name | GitHub Repo |
|------|--------------|-------------|
| `~/AIProjects` | AIProjects | mybrain |
| `~/Docker/mydocker` | myDocker | myDocker |
| `~/CreativeProjects` | CreativeProjects | CreativeProjects |
| `~/Code/grc-platform` | grc-platform | grc-platform |
| `~/Code/time-scheduler` | bishop-scheduler | time-scheduler |
| `~/Code/AIfred` | AIfred | AIfred |
| `~/Code/*` | (folder name) | (auto-detected) |

**Detects**:
- `git commit` via Bash
- `git -C <path> commit` for remote commits
- `mcp__git__git_commit` via Git MCP

**Storage**: `.claude/logs/cross-project-commits.json`

**Data Structure**:
```json
{
  "sessions": {
    "2026-01-06_My-Session": {
      "projects": {
        "AIProjects": { "commits": [...] },
        "grc-platform": { "commits": [...] }
      }
    }
  }
}
```

**On Commit**:
```
[cross-project-commit-tracker] Tracked: grc-platform@main - "Add user authentication..."
[cross-project-commit-tracker] Session total: 5 commits across 3 projects
```

**Integration**: Works with `/commits:status` command (shows cross-project summary).

**Source**: Design Pattern Integration - parallel session management

---

## Core Hooks (4)

### audit-logger.js
**Event**: PreToolUse | **Blocks**: No

Automatically logs all tool executions to `.claude/logs/audit.jsonl` in JSONL format ready for Loki ingestion.

**Configuration**:
```bash
export CLAUDE_AUDIT_VERBOSITY=standard  # minimal | standard | full
echo "Session Name" > .claude/logs/.current-session
```

### session-tracker.js
**Event**: Notification | **Blocks**: No

Tracks session lifecycle events (start, end, errors) and logs them to the audit file.

### docker-health-check.js
**Event**: PostToolUse | **Blocks**: No

After Docker modification commands, verifies the container came back healthy.

**Triggers on**: `docker restart`, `docker stop/start`, `docker-compose up/down/restart`

### memory-maintenance.js
**Event**: PostToolUse | **Blocks**: No

Tracks Memory MCP entity access for intelligent pruning decisions.

**Tracks**: Entity reads/writes, access frequency, last access timestamps
**Storage**: `.claude/agents/memory/entity-metadata.json`

**Features**:
- Entity access metadata (created, last accessed, access count)
- Tracks access sources (agents, commands, manual)
- Enables data-driven archival decisions for 90-day pruning
- Identifies stale vs frequently-used knowledge

---

## Security Hooks (4)

### secret-scanner.js
**Event**: PreToolUse | **Blocks**: Yes (on commit)

Scans staged files for secrets before git commits.

**Detects**:
- AWS keys, GitHub tokens, API keys (Anthropic, OpenAI, Slack, Discord)
- Database URLs with passwords, Private keys (RSA, SSH, PGP)
- JWT tokens, Generic password/secret patterns

**Behavior**:
- `git add` → Warns but allows
- `git commit` → Blocks if secrets found

### branch-protection.js
**Event**: PreToolUse | **Blocks**: Yes

Prevents dangerous git operations on protected branches (main, master, production, prod, release, stable).

**Blocks**: Force push, hard reset, deleting protected branches
**Warns**: Interactive rebase on protected branches

### credential-guard.js
**Event**: PreToolUse | **Blocks**: Yes

Monitors file operations to prevent credential exposure.

**Blocks reading**: SSH keys, AWS credentials, .env files, token files
**Warns on**: Config files that may contain secrets

### amend-validator.js
**Event**: PreToolUse | **Blocks**: Yes

Validates git commit --amend operations.

**Blocks**: Amending commits by other authors, amending pushed commits
**Allows**: Amending your own local commits

---

## Documentation Hooks (4)

### session-exit-enforcer.js
**Event**: PreToolUse | **Blocks**: No

Tracks session exit checklist progress and reminds about exit procedures.

**Tracks**: session-state.md updates, priorities updates, git commits/pushes

### paths-registry-sync.js
**Event**: PostToolUse | **Blocks**: No

Validates paths-registry.yaml consistency when external paths are referenced.

**Warns when**: New external paths found that aren't in registry

### context-reminder.js
**Event**: PostToolUse | **Blocks**: No

Prompts for documentation updates after significant discoveries.

**Tracks**: Service modifications, troubleshooting solutions
**Suggests**: Context file updates, session notes

### index-sync.js
**Event**: PostToolUse | **Blocks**: No

Keeps index files (_index.md) synchronized when new files are created in indexed directories.

### doc-sync-trigger.js
**Event**: PostToolUse | **Blocks**: No

Tracks significant code changes and suggests documentation synchronization.

**Significant Files**:
- `.claude/commands/` - Slash commands
- `.claude/agents/` - Agent definitions
- `.claude/hooks/*.js` - Hook implementations
- `src/`, `lib/` - Source code
- `Scripts/` - Automation scripts
- `docker-compose*.yaml` - Docker configurations

**Behavior**:
- Tracks Write/Edit operations on significant files
- After 5+ changes in 24 hours, suggests sync
- 4-hour cooldown between suggestions (no nagging)

**State**: `.claude/logs/.doc-sync-state.json`

**On Detection**:
```
[doc-sync-trigger] Documentation Sync Suggested
──────────────────────────────────────────────────
5 significant code changes in the last 24 hours:
  • .claude/commands/new-command.md
  • .claude/hooks/new-hook.js
  ...

Consider running:
  /agent memory-bank-synchronizer
```

**Integrates With**:
- `memory-bank-synchronizer` agent - The actor that performs sync
- `memory-maintenance.js` - Shares entity tracking patterns
- `self-correction-capture.js` - Feeds corrections to sync agent

**Source**: Design Pattern Integration Plan - Phase 3

---

## Infrastructure Hooks (2)

### docker-validator.js *(Consolidated)*
**Event**: PreToolUse | **Blocks**: Yes (on critical errors)

Consolidated Docker deployment validation combining compose, network, and environment checks.

**Compose Validation**:
- YAML syntax validation
- Security patterns (privileged, docker.sock mount)
- Hardcoded passwords, missing restart policy

**Network Validation**:
- Referenced networks exist
- External network declarations
- Standard network warnings (caddy-network, logging)

**Environment Validation**:
- env_file references exist
- Sensitive variables have values
- Empty/placeholder password warnings

*Replaces: compose-validator.js, network-validator.js, env-validator.js*

### port-conflict-detector.js
**Event**: PreToolUse | **Blocks**: Yes (on conflicts)

Checks for port conflicts before starting containers.

**Checks**: `docker run -p`, `docker-compose up` port mappings
**Shows**: Which process/container is using the port

---

## Workflow Hooks (7)

### project-detector.js
**Event**: UserPromptSubmit | **Blocks**: No

Detects project-related patterns in user prompts and injects appropriate guidance.

**Detection Modes**:

| Mode | Triggers | Guidance |
|------|----------|----------|
| **External Tool Evaluation** | "check out this tool", "what do you think of", + GitHub URL or tool indicators | Apply external-tool-evaluation-pattern.md |
| **Project Registration** | GitHub URL (without evaluation context) | Clone, register in paths-registry.yaml, create context file |
| **New Project** | "new project", "create a project", etc. | Create in ~/Code/, initialize, register |

**Evaluation Phrases**: "check out", "what do you think of", "evaluate this", "is it worth", "thoughts on", "worth adopting"

**Tool Indicators**: "tool", "library", "framework", "mcp", "cli", "workflow"

**On Detection**:
- Injects `additionalContext` with step-by-step guidance
- Points to relevant pattern files

**Related**:
- @.claude/context/patterns/external-tool-evaluation-pattern.md
- @.claude/commands/register-project.md
- @.claude/commands/new-code-project.md

### prompt-enhancer.js
**Event**: UserPromptSubmit | **Blocks**: No

Detects navigation and MCP-eligible patterns in user prompts and injects contextual guidance.

**Detected Patterns**:
- LSP Navigation: "go to definition", "find references", "where X defined", "list symbols"
- Docker MCP: "docker ps", "container status"
- Git MCP: "git status", "git log"

**Behavior**: Injects `additionalContext` with tool usage guidance before Claude chooses a tool.

**Related**: @.claude/context/patterns/prompt-enhancement-pattern.md (Phase 1)

### lsp-redirector.js
**Event**: PreToolUse | **Blocks**: Yes (on navigation queries)

Intercepts Grep calls that look like code navigation queries and redirects Claude to use LSP instead.

**Detected Patterns**:
- Definition lookups: "definition of X", "where X defined", "go to definition"
- Reference lookups: "references to X", "usages of X", "who calls X"
- Symbol lookups: "find function X", "find class X", "locate method X"
- Implementation lookups: "implementation of X", "where X implemented"

**Behavior**:
- Navigation queries → Blocks with message to use LSP tool
- Regular text searches → Allows Grep to proceed

**LSP Supported Files**: .ts, .tsx, .js, .jsx, .mjs

**Related**: @.claude/context/tools/lsp-integration.md, @.claude/context/patterns/prompt-enhancement-pattern.md

### mcp-enforcer.js
**Event**: PreToolUse | **Blocks**: No

Encourages use of MCP tools over bash equivalents.

**Suggests**: MCP alternatives for Docker, Git, Filesystem operations
**Tracks**: MCP vs Bash usage statistics

### priority-validator.js
**Event**: PostToolUse | **Blocks**: No

Tracks evidence for priority completion.

**Collects**: Git commits, file changes, service modifications
**Generates**: Session activity summaries for `/update-priorities`

### health-monitor.js
**Event**: PostToolUse | **Blocks**: No

Monitors Docker service health and alerts on degradation.

**Tracks**: Container health status changes
**Alerts**: When critical containers become unhealthy

**Critical containers**: caddy, n8n, open-webui, loki, grafana, promtail, homepage

### restart-loop-detector.js
**Event**: PostToolUse | **Blocks**: No

Detects containers stuck in restart loops.

**Thresholds**: Warning at 3 restarts, Critical at 5 restarts
**Provides**: Diagnostic commands and troubleshooting suggestions

---

## Hook Types Reference

| Type | When It Runs | Use For |
|------|--------------|---------|
| `SessionStart` | When Claude Code session begins | Auto-load context, initialize state |
| `UserPromptSubmit` | When user submits a prompt | Correction detection, prompt validation |
| `PreToolUse` | Before any tool executes | Logging, validation, blocking |
| `PostToolUse` | After successful tool execution | Verification, cleanup, notifications |
| `Notification` | On session events | Lifecycle tracking, alerts |
| `Stop` | When Claude Code session ends | Notifications, cleanup, state saving |
| `SubagentStop` | When spawned agent completes | Agent chaining, logging, orchestration |
| `PreCompact` | Before context compaction | Preserve critical state |

---

## Creating New Hooks

Claude Code hooks are **executable scripts** that read JSON from stdin and output JSON to stdout.

> **IMPORTANT (2026-01-21)**: The old `module.exports = { handler }` pattern does NOT work.
> Hooks must be executable scripts that process stdin/stdout.

**Template** (PreToolUse/PostToolUse):
```javascript
#!/usr/bin/env node
/**
 * My Hook - Description
 */

const fs = require('fs').promises;

async function handleHook(context) {
  const { tool_name, tool_input, tool_result } = context;

  // Your logic here

  // Return { proceed: true } to allow, { proceed: false, message: "reason" } to block
  return { proceed: true };
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8');

  let context;
  try {
    context = JSON.parse(input);
  } catch (err) {
    console.log(JSON.stringify({ proceed: true }));
    return;
  }

  const result = await handleHook(context);
  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.error(`[my-hook] Error: ${err.message}`);
  console.log(JSON.stringify({ proceed: true }));
});
```

**Make the file executable**: `chmod +x .claude/hooks/my-hook.js`

**Input Context by Event Type**:

| Event | Input Fields |
|-------|--------------|
| PreToolUse | `tool_name`, `tool_input` |
| PostToolUse | `tool_name`, `tool_input`, `tool_result` |
| UserPromptSubmit | `prompt` |
| Stop | `reason` |
| SubagentStop | `agentName`, `result`, `duration`, `success` |

**Output Format**:
- `{ proceed: true }` - Allow the operation
- `{ proceed: false, message: "reason" }` - Block the operation (PreToolUse only)
- `{ hookSpecificOutput: { additionalContext: "..." } }` - Inject context into conversation

---

## Log Format

Audit logs are written to `.claude/logs/audit.jsonl`:

```json
{
  "timestamp": "2025-12-06T10:30:00.000Z",
  "session": "Infrastructure Review",
  "who": "claude",
  "type": "tool_execution",
  "tool": "Bash",
  "parameters": { "command": "docker ps" },
  "verbosity": "standard"
}
```

**Loki labels** (for Promtail config):
- `job`: "claude-audit"
- `session`: Session name
- `who`: "user" | "claude" | "system"
- `type`: "tool_execution" | "session_event" | "user_prompt"

---

## Troubleshooting

**Hooks not running?**
- Verify shebang line exists: `#!/usr/bin/env node`
- Make sure file is executable: `chmod +x .claude/hooks/my-hook.js`
- Must use stdin/stdout pattern (NOT the old module.exports pattern)
- Test manually: `echo '{"tool_name":"Test"}' | node .claude/hooks/my-hook.js`

**Logging not working?**
- Check `.claude/logs/` directory exists
- Verify write permissions

**Hook blocking unexpectedly?**
- Ensure `console.log(JSON.stringify({ proceed: true }))` is called
- Check for uncaught exceptions (wrap in try/catch)
- Review stderr for hook messages (`console.error`)

**False positives in secret-scanner?**
- Add patterns to `isFalsePositive()` function
- Use placeholders like `example`, `placeholder`, `test_`

**MCP suggestions annoying?**
- Edit `SUGGESTION_COOLDOWN` in mcp-enforcer.js (default: 1 minute)
