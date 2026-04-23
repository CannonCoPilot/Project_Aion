---
name: pulse-ops
version: 1.0.0
description: Task management via shared Pulse API — cross-Archon task visibility
category: task-management
tags: [pulse, tasks, labels, archon, aifred]
---

# Pulse Operations Skill

Manage tasks in the shared Pulse backend. Both Jarvis (Master Archon) and AIfred (Operations Archon) read/write to the same Pulse instance.

## Quick Reference

| Need | MCP Tool | Example |
|------|----------|---------|
| List tasks | `pulse_list` | `pulse_list(status="open", label="agent:jarvis")` |
| Show details | `pulse_show` | `pulse_show(task_id="AION-abc123")` |
| Create task | `pulse_create` | `pulse_create(title="Fix bug", labels="agent:jarvis,domain:coding")` |
| Update task | `pulse_update` | `pulse_update(task_id="AION-abc123", status="in_progress")` |
| Close task | `pulse_close` | `pulse_close(task_id="AION-abc123", reason="Done")` |
| Stats | `pulse_stats` | `pulse_stats()` |

## Label Conventions

| Label | Meaning |
|-------|---------|
| `agent:jarvis` | Task owned by Jarvis |
| `agent:aifred` | Task owned by AIfred |
| `agent:shared` | Either Archon may handle |
| `domain:*` | Work area (infrastructure, coding, research, creative) |
| `auto:ready` | Eligible for automated execution |
| `risk:safe` | Can be executed without approval |

## Rules

- Always tag Jarvis-created tasks with `agent:jarvis`
- Do not modify tasks with `agent:aifred` unless delegated
- `agent:shared` tasks: first Archon to claim wins
- Pulse API: `http://localhost:8700`
