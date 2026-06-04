# AI Infrastructure Hub - Architecture Summary

**Version**: 2.1 (Split from architecture-overview.md)
**Last Updated**: 2026-01-07
**Full Details**: @knowledge/reference/architecture-details.md

---

## Executive Summary

Personal home lab environment for AI orchestration, automation, and knowledge management. 5 physical hosts, 30+ Docker services.

### Key Capabilities

| Capability | Technology | URL/Access |
|------------|------------|------------|
| Workflow Automation | n8n (541 nodes, 2,709 templates) | https://n8n.example.com |
| AI Integration | MCP servers (7 active) | Local + Docker |
| Centralized Logging | Loki/Grafana/Prometheus | https://log.example.com (LAN) |
| Threat Intelligence | MISP (5 feeds) | https://misp.example.com |
| Reverse Proxy | Caddy + OAuth2 | Automatic HTTPS |
| AI Chat | OpenWebUI | https://chat.example.com |
| LLM Inference | Ollama | Local API (no models) |

---

## Infrastructure Hosts

| Host | IP | Role | Services |
|------|-----|------|----------|
| **AIServer** | <gateway-ip>96 | Production AI/Automation | n8n, Loki, Caddy, MCP Gateway, MISP |
| **MediaServer** | <server-ip> | Media & DNS | Plex, Pi-hole, Grafana Alloy |
| **SpareServer** | <gateway-ip>03 | Legacy | Nginx (phasing out) |
| **NAS Primary** | <nas-ip> | Storage & Docker | AudioBookShelf, 27TB storage |
| **NAS Backup** | <gateway-ip>00 | Backup Target | Backup destination |
| **UDM Pro** | <gateway-ip> | Network Gateway | Router, firewall, Unifi controller |

---

## High-Level Architecture

```
                              Internet
                                 │
                        ┌────────▼────────┐
                        │   UDM Pro       │
                        │  <gateway-ip>    │
                        └────────┬────────┘
               ┌─────────────────┼─────────────────┐
               │                 │                 │
      ┌────────▼────────┐ ┌─────▼─────┐ ┌────────▼────────┐
      │   AIServer      │ │MediaServer│ │      NAS        │
      │  <gateway-ip>96  │ │  .179     │ │   .96 / .100    │
      └────────┬────────┘ └───────────┘ └─────────────────┘
               │
    ┌──────────┼──────────────────────────┐
    │          │          │               │
  ┌─▼──┐  ┌───▼────┐  ┌──▼──────┐  ┌────▼────┐
  │n8n │  │Logging │  │  MISP   │  │MCP Gtwy │
  └────┘  │Stack   │  └─────────┘  └─────────┘
          └────────┘
```

---

## Docker Service Stacks (AIServer)

| Stack | Containers | Purpose |
|-------|------------|---------|
| **n8n** | n8n, postgres, pgvector, neo4j | Workflow automation |
| **Logging** | loki, grafana, promtail, prometheus | Centralized logging |
| **Caddy** | caddy, oauth2-proxy | Reverse proxy + auth |
| **MISP** | misp-core, misp-db, misp-redis, misp-modules | Threat intelligence |
| **AI** | open-webui, ollama | AI chat + local LLM |
| **MCP** | mcp-gateway | AI tool access |
| **Ops** | watchtower (x2), portainer | Auto-updates, management |

**Total**: 27 active containers across 3 hosts

---

## Network & Access

### External Access (Public)
- **Domain**: example.com
- **Auth**: OAuth2 Proxy (Google OAuth2)
- **SSL**: Let's Encrypt via Caddy (automatic)

### Subdomain Routing

| Subdomain | Service | Access |
|-----------|---------|--------|
| n8n.example.com | n8n | Public (OAuth2) |
| chat.example.com | OpenWebUI | Public (OAuth2) |
| misp.example.com | MISP | Public (OAuth2) |
| plex.example.com | Plex | Public |
| audiobooks.example.com | AudioBookShelf | Public |
| log.example.com | Grafana | LAN-only |
| nas.example.com | Synology DSM | LAN-only |

---

## MCP Integration

**7 Active Servers** (see @.claude/context/integrations/mcp-servers.md):

| Server | Transport | Tools | Purpose |
|--------|-----------|-------|---------|
| Filesystem MCP | stdio | 13 | Cross-directory file ops |
| Git MCP | stdio | 11 | Local repository ops |
| MCP Gateway | SSE | 31 | Memory, Fetch, Playwright |
| n8n-MCP | Docker stdio | 30+ | Workflow management |
| Docker MCP | stdio | 4 | Container management (off) |
| GitHub MCP | stdio | 27 | Remote repo ops (off) |
| SSH MCP | stdio | 7 | Remote system access (off) |

---

## Storage Architecture

### Local (AIServer)
- Docker volumes: /var/lib/docker/volumes
- Application data: $HOME/Docker/mydocker/

### NAS (Primary - 27TB, 34% used)
| Share | Purpose |
|-------|---------|
| Logging/ | Loki, Grafana, Prometheus data |
| main/backups/ | Service backups (GFS rotation) |
| Obsidian/ | Knowledge management vaults |
| Media/ | Movies, TV, music |
| AudioBooks/ | Audiobook library |

---

## Backup Strategy

**GFS Rotation**: Daily (30d local), Weekly (52w NAS), Monthly (forever)

| Service | Schedule | Retention |
|---------|----------|-----------|
| n8n PostgreSQL | Daily 2:00 AM | 30d local, 90d NAS |
| n8n Exports | Weekly Sun 3:00 AM | 90d local, 180d NAS |
| MISP | Daily 3:15 AM | 30d local, 90d NAS |
| OpenWebUI | Daily | 3-day retention |

---

## Security Summary

- **External**: OAuth2 Proxy with Google OAuth2 (8 authorized users)
- **Internal**: LAN-only restrictions via Caddy
- **SSH**: Key-based authentication only
- **Certificates**: Let's Encrypt (auto-renewal via Caddy)
- **Threat Intel**: MISP with 5 active feeds, real-time log enrichment

---

## Key Paths

| Purpose | Path |
|---------|------|
| Docker configs | $HOME/Docker/mydocker/ |
| AIProjects | ${PROJECT_DIR}/ |
| NAS mount | /mnt/synology_nas/ |
| MCP config | ~/.claude.json |
| Logging data | /mnt/synology_nas/Logging/ |
| Backups | /mnt/synology_nas/main/backups/ |

---

## Quick Reference

### Common Operations

```bash
# Check all containers
docker ps --format "table {{.Names}}\t{{.Status}}"

# Service logs
docker logs <container> --tail 50

# Restart service
docker compose -f ~/Docker/mydocker/<service>/docker-compose.yml restart

# Check Loki
curl http://localhost:3100/ready
```

### Grafana Access
- URL: http://<gateway-ip>96:3001 (or https://log.example.com from LAN)
- Auth: Admin credentials in .env file

### LogQL Examples
```logql
{container="n8n"} |= ""              # n8n logs
{job="udmpro"} |= "BLOCK"            # Firewall blocks
{job="systemd",unit="ssh.service"}   # SSH logs
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| @knowledge/reference/architecture-details.md | **Full detailed architecture** |
| @.claude/context/integrations/mcp-servers.md | MCP server configuration |
| @.claude/context/systems/logging/_index.md | Logging infrastructure |
| @.claude/context/systems/docker/ | Individual service docs |
| @paths-registry.yaml | All external paths |

---

**Full Details**: For complete service configurations, port mappings, diagrams, and appendices, see @knowledge/reference/architecture-details.md
