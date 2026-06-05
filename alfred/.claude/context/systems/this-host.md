---
name: this-host
type: system
role: primary-aifred-host
created: 2026-04-21
---

# This Host — JARVIS.local

Primary AIfred host and home lab workstation.

## Hardware

- **Platform**: macOS 26.2, Apple Silicon (arm64)
- **CPU**: 16 cores
- **RAM**: 128 GB
- **Disk**: 926 GB total, 654 GB available on /

## Network

- **Hostname**: JARVIS.local
- **Primary LAN IP**: 192.168.3.1
- **Secondary LAN**: 192.168.5.19, 192.168.2.1
- **Tailscale**: 100.93.132.61

## Docker Stacks

Three active compose stacks (17 containers, all healthy):

### aifred-* (6 containers)
AIfred core infrastructure — dashboard, Grafana, Prometheus, Pushgateway, Pulse task service, Postgres.
Compose location: likely `~/Claude/AIFred-Pro/docker-compose.yml` (registry to confirm in Phase 3).

### authentik (4 containers)
SSO identity provider — server, worker, Postgres, Redis. Fronted by Caddy at `onomatologos.org`.

### jarvis-* (5 containers)
Application stack — n8n (workflows), Redis, Qdrant (vector), Neo4j (graph), Postgres (ParadeDB).
Compose location: `~/Claude/Project_Aion/docker-compose.yml`.

### Supporting
- `caddy` — reverse proxy
- `exciting_liskov` (mcp-gateway) — MCP server runner

## Projects Root

`~/Claude/` — contains AIFred-Pro, AIFred-Pro-Dev, Jarvis, Jarvis-Dev, Archive, GitRepos, Projects, Shared_Projects.

## Tools Available

Git 2.53, Docker 29.2 + Compose v5.0.2, Node 24.13, Python 3.14, jq, yq, Homebrew 5.1.

## Known Issues

- `pulse` CLI symlinks (`/opt/homebrew/bin/pulse`, `~/.local/bin/pulse`) point to missing `./pulse/cli.py`. Pulse API is healthy via container; CLI needs reinstall (`git clone <pulse-repo> pulse` + `bash scripts/bootstrap.sh`).
- Git `origin` URL contains an embedded GitHub PAT — replace with SSH or credential helper.
