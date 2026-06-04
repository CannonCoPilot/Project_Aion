# Decision: Archon Architecture — v0 Direction

**Date**: 2026-04-22
**Decided by**: CannonCoPilot (user)
**Plan task**: P0-T05
**Note**: This is the DIRECTION. Detailed protocol spec is P2-T01.

## Decision

**Archon v0 = task-emission only.** Archons write to Pulse; they do NOT receive commands from AIFred.

## What an Archon IS (v0)

An Archon is any service, session, workflow, or agent that:

1. **Identifies itself** by including `archon:<name>` label on every task it creates (e.g., `archon:jarvis`, `archon:jarvis-dev`, `archon:headless-dispatcher`)
2. **Emits work** to a Pulse board by `POST /api/v1/tasks` with appropriate labels (`source:<source>`, `capability:<type>`, `domain:<area>`, `risk:<level>`)
3. **Does NOT listen** for commands from AIFred — pure outbound in v0
4. **May register itself** (optional) by creating an `archon:registration` task on startup with its capabilities

## v0 Scope Boundaries — Explicit NOT IN v0

- ❌ AIFred → Archon command channel (no bidirectional RPC)
- ❌ Archon capability negotiation or discovery beyond label inspection
- ❌ Archon health monitoring with forced restart (Pulse just sees stale registrations)
- ❌ Cross-Archon coordination (Archons don't talk to each other directly)
- ❌ Authentication (v0 assumes trusted network; Pulse API is open on local net)
- ❌ Rate limiting or quota enforcement per Archon

## v0 Lifecycle (minimal state machine)

```
  [not registered]
        │ Archon starts
        ▼
  [active]  ◄────────┐
        │            │ emits tasks
        │ stops      │ normally
        ▼            │
  [idle]  ───────────┘
        │ no emissions in 24h
        ▼
  [stale]   (just a label, no action taken)
```

**Liveness is implicit**: an Archon is "active" if it recently emitted a task (last 24h); "idle" otherwise; "stale" if > 24h.

## AuthN/AuthZ (v0)

- **Network-based**: Pulse API on `host.docker.internal` (macOS) or `aifred-network` internal DNS. Anyone who can reach the API can write.
- **No per-Archon auth**: v0 trusts all archons on the local machine
- **Record but don't enforce**: `archon:<name>` label shows who claimed to write; this is honor-system, not cryptographic
- **Future (not v0)**: per-Archon API tokens via Authentik service accounts

## Rationale

Task emission is the 80% value path. Bidirectional protocols add weeks of engineering (transport, auth, callback endpoints, failure semantics) for use cases that don't exist yet. Emission-only ships in days, covers Jarvis → AIFred integration, and creates the **label conventions and tooling** that a future bidirectional v1 can build on.

## Success criteria (v0)

- Jarvis prod emits session-end tasks to AIFred Pulse; tasks visible under `archon:jarvis` filter
- Jarvis-Dev emits session-end tasks to dev Pulse; filter `archon:jarvis-dev` works
- `archon/register` utility works; archons can self-identify with a manifest
- Zero bidirectional commands needed to complete the plan

## Open for v1 (deferred)

- AIFred dispatches commands back to Archons (e.g., "run this workflow")
- Archon heartbeats with timeout + auto-restart
- Authenticated Archon channels
- Inter-Archon messaging
