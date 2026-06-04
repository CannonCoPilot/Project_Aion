# Decision: Pulse Board Sharing Model

**Date**: 2026-04-22
**Decided by**: CannonCoPilot (user)
**Plan task**: P0-T03

## Decision

**Dev and prod Pulse boards are separated** — two distinct Pulse service instances.

| Space | Pulse endpoint |
|-------|---------------|
| AIFred Pro prod | `http://localhost:8700` (existing `aifred-pulse` container) |
| Jarvis prod | Writes to **prod Pulse at :8700** (same board) |
| AIFred-Pro-Dev | `http://localhost:8800` (new `aifred-dev-pulse` container, per P0-T04 port offset) |
| Jarvis-Dev | Writes to **dev Pulse at :8800** |

## Rationale

- Clean isolation: dev iteration doesn't clutter the prod board or consume prod budget
- Prod board stays quiet and authoritative; dev board is expected to churn
- Dashboard views stay meaningful — prod users aren't swamped by dev noise
- Mirrors real-world ops: staging environment has its own observability

## Non-goals

- No cross-board replication (prod/dev boards are fully independent)
- No auto-promotion of closed dev tasks to prod — dev tasks simply close in dev; equivalent prod tasks (if any) are tracked separately

## Implications for downstream plan

- P4-T02 (AIFred-Pro-Dev compose overlay) MUST provision a dedicated `aifred-dev-pulse` container + dev postgres; port 8800
- P5-T05 (Jarvis-Dev Archon wiring) points its `PULSE_API_URL` env var at `http://host.docker.internal:8800` (dev Pulse)
- P3-T01 (Jarvis→Pulse transport decision) simplifies: prod Jarvis points at `host.docker.internal:8700`
- Fresh P0-T02 concern: don't backfill the 135 closed tasks from prod into dev — start dev clean
