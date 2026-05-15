---
name: _template
description: Template for creating new agents - not an active agent
tools: Read, Write, Glob, Grep, Bash, TodoWrite
model: sonnet
---

# Agent: [Agent Name]

## Metadata
- **Purpose**: [Brief description]
- **Can Call**: [Other agents, or "none"]
- **Created**: [YYYY-MM-DD]
- **AC Component**: [If linked to AC-01 through AC-09, specify]

## Status Messages
- "Starting [task]..."
- "Gathering [resources]..."
- "Processing [data]..."
- "Finalizing [output]..."

## Expected Output
- **Results Location**: `.claude/agents/results/[agent-name]/`
- **Summary Format**: Brief overview with key findings

## Usage
```bash
# Via Task tool
subagent_type: [agent-name]
prompt: "Your task description"
model: sonnet  # or haiku for lightweight tasks
```

---

## Agent Prompt

You are a specialized agent for [specific purpose]. You work independently with your own context window.

### Your Role
[Detailed description of role and responsibilities]

### Your Capabilities
- [Capability 1]
- [Capability 2]
- [Capability 3]

### Your Workflow
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Output Requirements

1. **Results File** - Polished output with findings
2. **Summary** - 2-3 sentence overview for caller

### Guidelines
- Work independently and autonomously
- Use all available tools
- Be thorough but efficient
- Document your process

### Success Criteria
[What constitutes successful completion]

---

## Frontmatter Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Agent identifier (matches filename without .md) |
| `description` | Yes | One-line purpose description |
| `tools` | Yes | Comma-separated tool list of canonical tool names. **DO NOT use English prose** like `All tools` — the harness parses by comma-split and treats `All tools` as two phantom tools `["All", "tools"]`, granting zero tools and producing fabricated outputs. Omit the field to inherit all tools instead. See `.claude/context/patterns/subagent-output-fidelity.md`. |
| `model` | Recommended | `sonnet` (default), `haiku` (lightweight), `opus` (complex) |

**Canonical tool names**: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `LS`, `Bash`, `BashOutput`, `KillShell`, `WebFetch`, `WebSearch`, `TodoWrite`, `NotebookRead`, `NotebookEdit`, `Skill`, `ToolSearch`, `Agent`, `Task*`, `EnterPlanMode`/`ExitPlanMode`, `EnterWorktree`/`ExitWorktree`, `ScheduleWakeup`, `AskUserQuestion`, `Monitor`, `LSP`, `Cron*`, `PushNotification`, `RemoteTrigger`, `ListMcpResourcesTool`, `ReadMcpResourceTool`.

**Pre-flight validation**: Run `bash .claude/scripts/validate-agent-schemas.sh` after editing any agent file. It catches malformed `tools:` values + unknown tool names.

## Notes
[Additional context, limitations, considerations]
