# System 7: Communications — External Interfaces & Inter-Archon Protocol

**Purpose**: How AIFred-Pro communicates with the outside world — Telegram notifications for humans, the Archon Protocol for multi-archon coordination, and the file-based collaboration system for asynchronous cross-team work.

**Verified**: 2026-04-23 — every claim sourced from direct file reads.

---

## Architecture Overview

```
  AIFred-Pro
    │
    ├── Telegram Bot (@KeryxArchon_bot)
    │   ├── .claude/jobs/lib/send-telegram.sh (standalone CLI)
    │   ├── .claude/jobs/lib/msgbus.sh (message bus)
    │   └── STATUS: CONFIGURED (token + chat_id set in .claude/jobs/.env)
    │
    ├── Archon Protocol
    │   ├── .claude/context/patterns/archon-protocol-v0.md (spec)
    │   ├── Pulse API (task-emission only in v0)
    │   └── Shared_Projects/ (file-based async)
    │
    ├── Message Bus
    │   ├── .claude/jobs/lib/msgbus.sh (event store)
    │   └── Dashboard WebSocket (live delivery)
    │
    └── External Sources
        └── external-sources/ (scaffold + reports-to-upstream/)
```

---

## Subsystem 7.1: Telegram Bot

### Configuration (verified from .claude/jobs/.env)
- Bot name: `@KeryxArchon_bot`
- `TELEGRAM_BOT_TOKEN`: **Populated** (set in `.claude/jobs/.env`)
- `TELEGRAM_CHAT_ID`: **Populated** (set in `.claude/jobs/.env`)
- **Status: CONFIGURED** — not disabled

### How Messages Are Sent

**File**: `.claude/jobs/lib/send-telegram.sh` — standalone CLI script (NOT a bash function in callback.sh)

Usage:
```bash
send-telegram.sh --message "text"
send-telegram.sh --message "text" --severity critical
send-telegram.sh --question "Restart Plex?" --job plex-troubleshoot --options "Approve|Deny|Skip"
```

- Sources `.claude/jobs/.env` for token/chat_id
- Guards on empty credentials (exits with error)
- API: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

### Quiet Hours (from registry.yaml)

Notifications suppressed during configured hours:
- Weekday: 22:00–07:00 (America/Denver)
- Weekend: 23:00–09:00
- `critical` severity bypasses quiet hours
- Batch release when DND ends

---

## Subsystem 7.2: Archon Protocol

**Specification**: `.claude/context/patterns/archon-protocol-v0.md`

### v0 Design: Task-Emission Only

> "Archon v0 is task-emission only. Archons write tasks to a Pulse board. They do NOT receive commands from AIFred."

Key principles:
- Each Archon has a globally-unique identifier
- Communication flows through Pulse task board
- No direct command channel from AIFred to archons in v0

### Shared_Projects (Async Collaboration)

File-based async collaboration via Synology Drive:
- `Shared_Projects/Questions/` — YAML frontmatter Q&A files
- `Shared_Projects/Debriefs/` — Session reports
- `Shared_Projects/Status/` — Focus area tracking

---

## Subsystem 7.3: Message Bus

**File**: `.claude/jobs/lib/msgbus.sh`

Event store for notifications:
- Written by Nexus executor on job completion/failure
- Read by Dashboard via WebSocket or polling
- Rotation: `lib/msgbus-rotate.sh`
- Relay: `lib/msg-relay.sh`

---

## Subsystem 7.4: External Sources

**Location**: `external-sources/`

| Path | Content | Status |
|------|---------|--------|
| `configs/` | Intended for external config links | Empty |
| `docker/` | Intended for docker-compose links | Empty |
| `logs/` | Intended for external log links | Empty |
| `reports-to-upstream/` | Reports for David's review | 2 files |
| `README.md` | Documentation | Exists |
| `.gitkeep` | Git empty dir preservation | Exists |

Reports in `reports-to-upstream/`:
- `2026-04-22-macos-compat-fixes.md`
- `2026-04-22-token-rotation-notice.md`

---

## Cross-System Integration

| Source | Target | Mechanism | Status |
|--------|--------|-----------|--------|
| Nexus → Telegram | Failure alerts | send-telegram.sh | Configured |
| Nexus → Dashboard | Live updates | msgbus.sh → WebSocket | Working |
| Nexus → Pulse | Job completion | Triggers system | Working |
| Archon Protocol → Pulse | Task emission | REST API | Working |
| External sources → Upstream | Reports to David | Synology Drive sync | Working |

---

## Files Comprising This System

| File | Role | Verified |
|------|------|----------|
| `.claude/jobs/lib/send-telegram.sh` | Telegram notification CLI | Yes |
| `.claude/jobs/lib/msgbus.sh` | Message bus | Yes |
| `.claude/jobs/lib/msg-relay.sh` | Message relay | Yes |
| `.claude/jobs/lib/msgbus-rotate.sh` | Message bus rotation | Yes |
| `.claude/jobs/lib/telegram-callback-handler.sh` | DEPRECATED (2026-03-12) | Yes |
| `.claude/context/patterns/archon-protocol-v0.md` | Archon Protocol spec | Yes |
| `external-sources/README.md` | External sources documentation | Yes |
| `external-sources/reports-to-upstream/*.md` | 2 upstream reports | Yes |

**Files that DO NOT exist** (from prior versions): `lib/callback.sh`, `.claude/orchestration/inter-archon-protocol.md`, `.claude/agents/liaison.md`, `.claude/agents/incident-responder.md`, `.claude/skills/telegram-ops/SKILL.md`, `.claude/context/patterns/communication.md`, `tests/unit/test_telegram.py`

---

*System 7: Communications — verified 2026-04-23. Every claim sourced from direct file reads.*
