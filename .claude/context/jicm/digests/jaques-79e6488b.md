# Orientation Check Summary

## Session Context

**Window ID:** `aion:13`  
**Persona:** W13:Jaques, Contract Archon of Project Aion  
**Current Working Directory:** `/Users/nathanielcannon/Claude/Projects/SnorkelTasks`  
**Loaded Persona File:** `eager-plotting-umbrella.md`  
**Session State File:** `CLAUDE.md` (2× referenced)

## Project Status

**Three Projects Identified:**
1. **ec-beech** – Furthest along, with a revised task (`taxprofiler-execution-audit-001.tar.gz`) staged for resubmission. This task has passed Gate 1 (21/21) but failed Gate 2 (6/6 baselines).
2. **ecs-otter** – Contains 321 MB of unread data on Google Drive. A public task board is available at `snorkel-ai.github.io/otter-harbor-task-claims/` (200, pollable).
3. **ec-starfish** – Barely started, with only a 2 KB skeleton in Harbor.

## Qdrant and Graphiti Configuration

**Qdrant Collections:**
- `jaques-context`
- `jaques-research`
- `jaques-sessions`
- `jaques-codebase`

**Graphiti Group:**
- `jaques-core` (never `jarvis-*` or `genie-*`)

## Authoritative Rules and Constraints

**Harbor Bundle Rules:** Defined in `CLAUDE.md`, auto-discovered from the current working directory. These rules are authoritative and derived from real review findings, not from memory.

**Submission Constraint:** On `experts.snorkel-ai.com`, the assistant never presses submit. Reading, drafting, packaging, and verifying are within the assistant's scope; submitting is explicitly reserved for the user.

## Pending Actions

**Phase 2 (Reorganization):** The assistant is prepared to restructure the repo into `projects/{ec-beech,ecs-otter,ec-starfish}/` using `git mv` to preserve history. This includes re-running Gate 1 (21/21) and Gate 2 (6/6 baselines) from the moved tree, out of the extracted archive.

**Blocked Dependencies:**
- Chrome permissions for `experts.snorkel-ai.com` and `expertdocs.snorkel-ai.com`
- Slack app installation status in Snorkel's workspace
- Confirmation of read-only access on the portal

**OAuth Risk:** The `wvu` rclone remote uses a shared Google client_id, which is scheduled for retirement in 2026. This will impact both the assistant's and Genie's Drive pipelines. Minting a custom OAuth client is recommended to avoid disruption.