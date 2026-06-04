# Alfred-Dev — Dev Workshop

This repo is the **development sibling** of `~/Claude/AIFred-Pro`. It exists
so Claude can safely draft, test, and iterate on AIfred source changes
without touching the running prod stack. All prod source modifications start
here; a human-reviewed PR promotes them to prod.

## Port + Container Map (dev vs prod)

| Service | Prod container | Prod port | Dev container | Dev port |
|---------|---------------|:---------:|---------------|:---------:|
| Pulse API | `aifred-pulse` | 8700 | `aifred-dev-pulse` | **8800** |
| Dashboard | `aifred-dashboard` | 8600 | `aifred-dev-dashboard` | **8701** |
| Postgres | `aifred-postgres` | 5432 internal | `aifred-dev-postgres` | 5432 internal |

Dashboard port is **8701** (not the strict +100 = 8700) to avoid colliding
with prod Pulse. See `.claude/context/decisions/dev-space-isolation.md` (synced
from prod).

## Networks, Volumes, Project name

- Network: `aifred-dev-network` (dev does NOT join `caddy-network`; access is local only)
- Volumes: `aifred-dev-postgres-data`, `aifred-dev-dashboard-data`
- Compose project name: `aifred-pro-dev` (must be passed explicitly via `--project-name`)

## Starting / stopping the dev stack

```bash
cd ~/Claude/Alfred-Dev

# Start
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  --project-name=aifred-pro-dev \
  up -d

# Status
docker compose --project-name=aifred-pro-dev ps

# Logs (follow)
docker compose --project-name=aifred-pro-dev logs -f <service>

# Stop (preserves volumes)
docker compose --project-name=aifred-pro-dev down

# Stop + wipe data (dangerous)
docker compose --project-name=aifred-pro-dev down -v
```

## Pulse API examples

```bash
# Hit dev Pulse specifically
curl http://localhost:8800/api/v1/health

# Dev dashboard
open http://localhost:8701   # or whatever browser

# Dev Pulse + prod Pulse should never share data — confirm:
curl -s http://localhost:8800/api/v1/tasks | jq '.total'   # dev count
curl -s http://localhost:8700/api/v1/tasks | jq '.total'   # prod count
```

## Secrets / `.env`

`.env` in this directory holds dev-only secrets (DB password, dashboard
token, VAPID keys). It is gitignored. **Do not copy prod `.env` here**, and
do not copy dev `.env` to prod. They intentionally diverge:

- Prod DB name: `pulse`  ·  Dev DB name: `pulse_dev`
- Prod DB user: `pulse`  ·  Dev DB user: `pulse_dev`
- Independent `PULSE_DASHBOARD_TOKEN` and VAPID keypair

## Differences from prod

- Dev bypasses Caddy/Authentik SSO (no `caddy-network` membership). Access
  dev services directly on `localhost` — no `https://tasks.onomatologos.org/`
  equivalent.
- Dev dashboard image re-uses the prod-built
  `aifred-pro-nexus-dashboard:latest`. If dev needs to diverge, rebuild
  from this directory's `dashboard/` and re-tag.
- Dev does not run the launchd headless agents (dispatcher/event-watcher/
  watchdog/pulse) — those remain prod-only. Run jobs manually here as needed.
- No Grafana / Prometheus / Pushgateway in dev by default — the overlay only
  brings up postgres + pulse + dashboard.

## Sync-from-prod workflow

When prod gets new overlay commits you want in dev:

```bash
cd ~/Claude/Alfred-Dev
git fetch prod-local    # remote set to /Users/nathanielcannon/Claude/AIFred-Pro
git merge --ff-only prod-local/main
```

A safety branch (e.g. `pre-sync-safety-2026-04-23`) is recommended before
non-fast-forward merges.

## Promote dev → prod

The canonical path is: commit locally on a feature branch in this repo, push
to `origin` (the `CannonCoPilot/AIFred-Pro` fork), open a PR into prod, have
it human-reviewed, merge. The `target:aifred-pro` + `pipeline:needs-approval`
Pulse labels flag the associated ticket for human review before promotion.

## Related decision docs

- `.claude/context/decisions/archon-architecture.md`
- `.claude/context/decisions/dev-space-isolation.md`
- `.claude/context/decisions/pulse-sharing-model.md`
- `.claude/context/decisions/dev-sso-proxy.md`
- `.claude/context/patterns/archon-protocol-v0.md`
- `.claude/plans/2026-04-22-multi-space-setup.md`

---

*Last updated 2026-04-23 (P4-T07 docs).*
