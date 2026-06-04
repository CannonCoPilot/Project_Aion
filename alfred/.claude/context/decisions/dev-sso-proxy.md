# Decision: Dev Stack SSO/Proxy Configuration

**Date**: 2026-04-23
**Status**: Decided
**Decided by**: autofix-executor (pipeline:approved P4-T04)

## Context

AIFred-Pro-Dev is the development twin of the production AIFred-Pro stack. The question is whether dev services should share production's Authentik + Caddy (via additional `*-dev.onomatologos.org` subdomains) or run without SSO on localhost only.

## Options Considered

### Option A: Share prod Authentik + Caddy
- Add `*-dev.onomatologos.org` subdomains to Caddy config
- Dev services routed through prod SSO
- Publicly accessible behind Authentik

### Option B: Localhost-only, no SSO
- Dev services bind to `localhost` or `127.0.0.1` only
- Access via port-forwarding or local browser
- No Authentik dependency

## Decision: **Option B — Localhost-only, no SSO**

## Rationale

1. **Isolation**: Dev must not depend on prod auth infrastructure. A prod Authentik outage should never block dev work.
2. **Safety**: Dev experiments (schema changes, API breaks, bad configs) must never reach publicly-accessible endpoints.
3. **Simplicity**: No DNS provisioning, no Caddy config changes, no Authentik client registration per service. Dev stack comes up with `docker compose up` only.
4. **Standard practice**: Localhost-only is the universal default for dev environments.

## Implementation Plan

1. `docker-compose.dev.yml` overrides `ports:` to bind to `127.0.0.1:<port>` for all services (P4-T02).
2. Remove any Caddy-related services from the dev compose overlay.
3. Remove Authentik-related environment variables from dev `.env` (P4-T03).
4. Services are accessed directly via `http://localhost:<port>` during dev.
5. No subdomain DNS entries needed for dev.

## Trade-offs Accepted

- Developers cannot share a live dev URL externally (acceptable — use prod for demos).
- No SSO means manual login or no auth in dev (acceptable — tighten only if needed).
