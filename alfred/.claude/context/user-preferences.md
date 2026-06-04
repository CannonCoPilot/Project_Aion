# User Preferences

Configured during AIfred Pro Dev setup on 2026-04-23.

## Profile Layers

Active: **general, homelab, development, production**

All four layers — maximum hook coverage for multi-stack home lab with active development.

## Automation Level

**Full Automation** — routine non-destructive actions run without prompting.
Destructive or flagged-risky actions still require explicit confirmation.

## Features Enabled

| Feature | Setting |
|---------|---------|
| Memory MCP | Yes (Docker Gateway stdio, volume `aifred-mcp-memory`) |
| Session Management | Automated (auto-commit and exit) |
| GitHub Sync | Yes, SSH to `git@github.com:CannonCoPilot/Project_Aion.git`, branch `main` |
| Parallel Dev (worktrees) | Yes |
| Branch Naming | `type/name` (feat/, fix/, chore/, docs/) |

## Homelab

- **Primary compose dir**: `~/Claude/AIFred-Pro-Dev`
- **Critical services**: aifred-dev-dashboard, aifred-dev-pulse, aifred-dev-postgres
- **NAS**: None registered
- **SSH remote hosts**: None

## Production

- **Deployment gates**: Always require confirmation
- **Audit retention**: 90 days

## Development

- **Projects root**: `~/Claude`
- **This repo is a dev workspace** — changes go to `main` branch, PRs upstream

## Notes

- Session mode set to **automated** (vs prompted in prod AIFred instance)
- This is the dev/contribution workspace for AIFred-Pro, not a personal prod instance
