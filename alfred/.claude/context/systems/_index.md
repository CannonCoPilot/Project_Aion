# Systems Documentation Index

Infrastructure and service documentation for the home lab environment.

---

## Quick Access

| System | File | Purpose |
|--------|------|---------|
| **Inventory** | @inventory.md | **CANONICAL**: All services, ports, URLs, access types |
| Architecture | @architecture-summary.md | Infrastructure overview |
| **Nexus** | @nexus.md | Autonomous operations platform (dispatcher, executor, personas) |
| **Nexus Security** | @nexus-security-standards.md | Security enforcement layers, design principles, persona checklist |
| **Exposure Audit** | @exposure-audit.md | Nightly public endpoint drift detection (catches unexpected public exposures on day 1) |
| **Nexus Sources of Truth** | @nexus-sources-of-truth.md | Canonical file registry for all Nexus work |
| UDM Pro | @udm-pro.md | Network gateway |
| Backup | @backup-strategy.md | Backup policy |

---

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| [docker/](./docker/_index.md) | Docker services on AIServer |
| [logging/](./logging/_index.md) | Logging infrastructure |
| [headless-claude/](./headless-claude/) | Headless Claude subsystems (message bus) |
| [homelab/](./homelab/) | Home lab overview |
| [n8n/](./n8n/) | n8n workflow documentation |
| [hosting/](./hosting/) | External hosting (Bluehost) |
| [servers/](./servers/) | Server-specific docs |

---

## Files in This Directory

### Core Infrastructure
- `inventory.md` - **CANONICAL**: All services, ports, URLs, access types
- `architecture-summary.md` - Quick reference (full: knowledge/reference/architecture-details.md)
- `aiserver-gpu-issue.md` - AMD GPU driver hang causing system freezes
- `udm-pro.md` - UDM Pro consolidated guide
- `ssh-workflows.md` - SSH patterns and workflows
- `mediaserver-operations.md` - MediaServer operations
- `media-automation.md` - Radarr/Sonarr/qBittorrent/Plex pipeline: endpoints, creds extraction, remote path mappings, seed-limit gotcha, API recipes
- `ollama-strix-halo.md` - Ollama on Strix Halo (ROCm/GPU compatibility)

### Nexus — Autonomous Operations Platform
- `nexus.md` - Full component map: dispatcher, executor, personas, message bus
- `nexus-security-standards.md` - **Security enforcement architecture, design principles, persona checklist, DEFAULT_POLICY reference**
- `nexus-sources-of-truth.md` - Canonical file registry (Document Guard protected)
- `nexus-plumbing-map.md` - Dependency map, data flows, state files, label state machine
- `nexus-persona-evolution.md` - Vision: multi-persona delegation, typed workflows, voice differentiation
- `nexus-revamp-spec.md` - Nexus revamp specification (Phases 1-4)
- `nexus-notifications-design.md` - Notification routing and preferences
- `stage-lifecycle.md` - Task stage pipeline (stage: label progression)
- `workflow-inventory.md` - Every path a task can travel: entry points, stages, transitions
- `task-automation.md` - Task automation pipeline (scoring, digest, autofix)
- `cost-management-policy.md` - Cost governance: budget philosophy, cap tiers, headroom audit, anomaly detection
- `bash-allowlist-findings.md` - Headless persona bash permissions audit

### Loom (Training Data Capture)
- `loom-training-schema.md` - Golden I/O pair schema for training data capture from NEXUS runs
- `loom-capture-points.md` - Capture point specification for executor success/failure paths
- `loom-quality-signals.md` - Quality signal taxonomy, scoring rubric, and negative example policy
- `loom-curation-pipeline.md` - End-to-end curation pipeline from raw capture to golden dataset
- `loom-integration-design.md` - How golden captures become queryable Loom content nodes for few-shot retrieval
- `loom-lora-strategy.md` - Fine-tuning export format, per-persona datasets, LoRA hyperparameters, adapter deployment

### Aurora (Nexus Tenant)
- `aurora.md` - Aurora creative surprise system
- `aurora-debugging-runbook.md` - Aurora debugging procedures

### Notifications
- `notification-architecture-review.md` - Notification system architecture review
- `notification-routing-policy.md` - Notification routing rules

### Backup & Recovery
- `backup-strategy.md` - Restic backup strategy
- `backup-disaster-recovery.md` - DR procedures
- `weekly-health-check.md` - Health check procedures

### Integrations & External
- `claude-agent-mcp.md` - Claude agent via n8n MCP
- `homelab-mcp-server.md` - Custom MCP server for Claude Desktop/n8n
- `obsidian-openwebui-sync.md` - Obsidian → OpenWebUI knowledge base sync
- `playwright-mcp.md` - Playwright MCP usage
- `agent-system.md` - Custom agent system
- `log-schema.md` - Canonical log schema for Loki
- `owasp-agentic-mitigations.md` - OWASP agentic AI risk mitigations

---

**Last Updated**: 2026-03-17
