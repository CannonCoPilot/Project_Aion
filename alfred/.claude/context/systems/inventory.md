# Infrastructure & Project Inventory

**Purpose**: Single source of truth mapping every service, project, and external endpoint
**Last Updated**: 2026-02-11
**Live Discovery**: 67+ running containers, 2 systemd services, 5 hosts

---

## External Access Summary

### Public (Internet-Accessible via Cloudflare)

| Subdomain | Service | Auth | Host | CF Proxy |
|-----------|---------|------|------|----------|
| `example.com` | KLYX Terminal | None (public demo) | AIServer | Proxied |
| `klyx.example.com` | KLYX Terminal | None (public demo) | AIServer | Proxied |
| `n8n.example.com` | n8n Workflows | Built-in | AIServer | Proxied |
| `chat.example.com` | OpenWebUI Chat | Built-in | AIServer | Proxied |
| `auth.example.com` | Authentik SSO | Built-in | AIServer | Proxied |
| `audiobooks.example.com` | AudioBookShelf | Built-in | NAS Primary | Proxied |
| `abs-upload.example.com` | ABS Direct Upload | Built-in | NAS Primary | DNS-only |
| `plex.example.com` | Plex Media | Built-in | MediaServer | Proxied |
| `mcp.example.com` | MCP Gateway | Authentik + secret path | AIServer | Proxied |
| `homelab-mcp.example.com` | MCP Server (SSE) | Secret UUID path | AIServer | DNS-only |
| `teleport.example.com` | Teleport SSH | MFA (TOTP) via CF Tunnel | AIServer | Proxied |
| `sync.example.com` | Obsidian WebDAV | WebDAV auth | NAS Primary | DNS-only |
| `tasks.example.com` | Beads Dashboard | Authentik | AIServer | DNS-only |
| `journal.example.com` | Daily Journal | Built-in | AIServer | DNS-only |
| `earth2.example.com` | Earth 2.0 Board Game | None (playtesting) | AIServer | Proxied |

> **DNS-only** = Cloudflare gray cloud. DNS resolves to origin IP; no CF edge protection. Required for services using SSE streaming, WebDAV, or where CF proxy breaks ACME cert provisioning. See [CloudFlare DNS Proxy Decisions](#cloudflare-dns-proxy-decisions) below.

### Authentik-Protected (Internet-Accessible, SSO Required)

| Subdomain | Service | Host |
|-----------|---------|------|
| `home.example.com` | Homepage Dashboard | AIServer |
| `scratch.example.com` | CodeCloud (Scratch) | AIServer |
| `log.example.com` | Grafana Logging | AIServer |
| `scanner.example.com` | Kali Scanner | AIServer |

### LAN Only (Private Network Access)

| Subdomain | Service | Host |
|-----------|---------|------|
| `ha.example.com` | Home Assistant | AIServer |
| `adguard.example.com` | AdGuard Home DNS | AIServer |
| `listenarr.example.com` | Listenarr Audiobooks | AIServer |
| `osint.example.com` | SpiderFoot OSINT | AIServer |
| `misp.example.com` | MISP Threat Intel | AIServer |
| `kuma.example.com` | Uptime Kuma | SpareServer |
| `nas.example.com` | Synology DSM | NAS Primary |

### External Hosting (Bluehost)

| Domain | Type | Status |
|--------|------|--------|
| `cisoexpert.com` | Astro static blog | Active |
| `dungeonmasterforge.com` | WordPress + DMForge plugin | Active |
| `puppypalsutah.com` | Primary domain | Active |

---

## AIServer (<gateway-ip>96)

**Hardware**: GMKtec EVO-X2, AMD Ryzen AI Max+ 395 (16c/32t), 128GB RAM
**OS**: Ubuntu Linux 6.17.0
**Role**: Primary production server

### Deployment Notes

Some containers are custom-built from source and require `docker compose build` (not just restart) when code changes:

| Container | Source | Build Command | Notes |
|-----------|--------|---------------|-------|
| `nexus-dashboard` | `~/Code/nexus-dashboard` | `cd ~/Code/nexus-dashboard && docker compose build && docker compose up -d` | Multi-stage Dockerfile (frontend build + server build). Code changes require full rebuild — restart only picks up config/volume changes. |
| `pulse` | `~/Code/pulse` | `cd ~/Code/pulse && docker compose build && docker compose up -d` | FastAPI app with Dockerfile |
| `security-researcher` | `~/Code/security-researcher` | `cd ~/Code/security-researcher && docker compose build && docker compose up -d` | Custom image |

Most other containers use pre-built images (e.g., `n8n`, `open-webui`) where `docker compose pull && docker compose up -d` is sufficient.

### Docker Containers (57 running)

#### AI & Automation

| Container | Image | Port | URL | Caddy Route |
|-----------|-------|------|-----|-------------|
| `n8n` | n8nio/n8n:latest | 5678 | https://n8n.example.com | Yes (public) |
| `open-webui` | open-webui:main | 3000→8080 | https://chat.example.com | Yes (public) |
| `mcp-gateway` | docker/mcp-gateway | 8080 | https://mcp.example.com | Yes (Authentik) |
| `aiprojects-api` | aiprojects-api | 8090→8000 | http://<gateway-ip>96:8090 | No |
| `searxng` | searxng/searxng:latest | 8080 (internal) | Internal only | No |
| `security-researcher` | security-researcher | 8420→8080 | http://<gateway-ip>96:8420 | No | ~/Code/security-researcher |
| `pulse` | pulse (FastAPI) | 8700 | http://<gateway-ip>96:8700 | No | ~/Code/pulse |
| `nexus-dashboard` | nexus-dashboard | 8600 | https://tasks.example.com | Yes (Authentik) | ~/Code/nexus-dashboard |

#### Voice & Audio

| Container | Image | Port | URL | Caddy Route |
|-----------|-------|------|-----|-------------|
| `whisper-transcribe` | faster-whisper-server:cpu | 9001→8000 | http://<gateway-ip>96:9001 | No |
| `chatterbox-tts` | chatterbox-tts | 8100→8004 | http://<gateway-ip>96:8100 | No |
| `voice-character-api` | voice-character-system | 8200 | http://<gateway-ip>96:8200 | No |
| `aurora-web` | nginx:alpine | 8350→80 | http://<gateway-ip>96:8350 | No |

#### Development Projects

| Container | Image | Port | URL | Caddy Route | Project |
|-----------|-------|------|-----|-------------|---------|
| `grc-frontend-dev` | grc-platform-frontend | 3002 | http://<gateway-ip>96:3002 | No | ~/Code/grc-platform |
| `klyx-terminal` | klyx-terminal | 3000-3001 (internal) | https://example.com | Yes (public) | ~/Code/klyx-terminal |
| `cisoexpert-site` | cisoexpert | 4321→80 | http://<gateway-ip>96:4321 | No | ~/Code/cisoexpert-site |
| `scripture-graph-ui` | viz-frontend | 3085→80 | http://<gateway-ip>96:3085 | No | ~/Code/lds-scriptures |
| `scripture-graph-api` | viz-backend | 8000 (internal) | Internal only | No | ~/Code/lds-scriptures |
| `spiderfoot` | spiderfoot:v4.0 | 5002→5001 | https://osint.example.com | Yes (LAN) | ~/Code/kali-scanner |
| `pai-frontend` | pai-observability | 5172→80 | http://<gateway-ip>96:5172 | No | ~/Code/pai-observability |
| `pai-backend` | pai-observability | 4000 | http://<gateway-ip>96:4000 | No | ~/Code/pai-observability |
| `codecloud` | codecloud | 8601 | https://scratch.example.com | Yes (Authentik) | ~/Code/codecloud |
| `time-scheduler-app` | time-scheduler-app | 5001→5000 | http://<gateway-ip>96:5001 | No | ~/Code/time-scheduler |

#### GRC Supabase Stack (11 containers)

| Container | Port | Notes |
|-----------|------|-------|
| `supabase_kong_GRC_Unified_Platform` | 54321→8000 | API Gateway |
| `supabase_studio_GRC_Unified_Platform` | 54323→3000 | Database UI |
| `supabase_db_GRC_Unified_Platform` | 54322→5432 | PostgreSQL 17 |
| `supabase_auth_GRC_Unified_Platform` | 9999 (internal) | GoTrue auth |
| `supabase_rest_GRC_Unified_Platform` | 3000 (internal) | PostgREST |
| `supabase_realtime_GRC_Unified_Platform` | 4000 (internal) | Realtime |
| `supabase_storage_GRC_Unified_Platform` | 5000 (internal) | Storage API |
| `supabase_pg_meta_GRC_Unified_Platform` | 8080 (internal) | Postgres Meta |
| `supabase_analytics_GRC_Unified_Platform` | 54327→4000 | Logflare |
| `supabase_inbucket_GRC_Unified_Platform` | 54324→8025 | Test email |
| `supabase_vector_GRC_Unified_Platform` | (none) | Vector/logging |

#### Media Automation (Arr Stack)

| Container | Image | Port | URL |
|-----------|-------|------|-----|
| `radarr` | linuxserver/radarr | 7878 | http://<gateway-ip>96:7878 |
| `sonarr` | linuxserver/sonarr | 8989 | http://<gateway-ip>96:8989 |
| `prowlarr` | linuxserver/prowlarr | 9696 | http://<gateway-ip>96:9696 |
| `listenarr` | listenarr:canary | 5000 | https://listenarr.example.com |
| `autoheal-arr` | willfarrell/autoheal | (none) | Health monitor for Arr stack |

#### Smart Home

| Container | Image | Port | URL | Caddy Route |
|-----------|-------|------|-----|-------------|
| `homeassistant` | home-assistant:stable | 8123 (host net) | https://ha.example.com | Yes (LAN) |

#### Security & Identity

| Container | Image | Port | URL | Caddy Route |
|-----------|-------|------|-----|-------------|
| `authentik_server` | goauthentik/server | 9000, 9443 | https://auth.example.com | Yes (public) |
| `authentik_worker` | goauthentik/server | (none) | Background worker | No |
| `authentik_postgres` | postgres:16-alpine | 5432 (internal) | Internal only | No |
| `oauth2-proxy` | oauth2-proxy:latest | 4180 | Legacy proxy | No |
| `teleport` | teleport-distroless:18.6.1 | 3022-3025,3080 (internal) | https://teleport.example.com | CF Tunnel |
| `cloudflared` | cloudflare/cloudflared | (none) | Tunnel connector | CF Tunnel |
| `nuclei` | projectdiscovery/nuclei | (none) | Vuln scanner engine | No |
| `cloud_enum` | heywoodlh/cloud_enum | (none) | Cloud asset discovery | No |
| `kali_scanner_dashboard` | kali_scanner_dashboard | 8080 (internal) | https://scanner.example.com | Yes (Authentik) |
| `kali_scanner_db` | postgres | 5432 (internal) | Scanner database | No |
| `kali_scanner_normalizer` | kali_scanner_normalizer | (none) | Data normalizer | No |
| `kali_scanner_redis` | redis | 6379 (internal) | Scanner cache | No |

#### Threat Intelligence

| Container | Image | Port | URL | Caddy Route |
|-----------|-------|------|-----|-------------|
| `misp-core` | misp-core | 443 (internal) | https://misp.example.com | Yes (LAN) |
| `misp-db` | mysql | 3306 (internal) | Internal only | No |
| `misp-redis` | redis | 6379 (internal) | Internal only | No |
| `misp-modules` | misp-modules | (none) | Internal only | No |
| `misp-enrichment` | misp-enrichment | 3200 | http://<gateway-ip>96:3200 | No |

#### Monitoring & Logging

| Container | Image | Port | URL | Caddy Route |
|-----------|-------|------|-----|-------------|
| `grafana` | grafana/grafana | 3001→3000 | https://log.example.com | Yes (Authentik) |
| `loki` | grafana/loki | 3100 | http://<gateway-ip>96:3100 | No |
| `promtail` | grafana/promtail | 9080 | http://<gateway-ip>96:9080 | No |
| `prometheus` | prom/prometheus | 9090 | http://<gateway-ip>96:9090 | No |
| `glances` | nicolargo/glances | 61208-61209 | http://<gateway-ip>96:61208 | No |
| `alloy` | grafana/alloy:latest | 4317, 4318, 12345 | http://<gateway-ip>96:12345 (UI) | No |
| `abs-exporter` | abs-exporter | 9123 | http://<gateway-ip>96:9123 | No |
| `cloudflare-exporter` | lablabs/cloudflare_exporter | 8080 (internal) | Prometheus target (cloudflare job) | No |
| `homepage` | gethomepage/homepage | 3081→3000 | http://<gateway-ip>96:3081 | No (iFrame in Organizr) |
| `organizr` | organizr/organizr | 3080→80 | https://home.example.com | Yes (Authentik) |

#### Infrastructure

| Container | Image | Port | URL | Caddy Route |
|-----------|-------|------|-----|-------------|
| `caddy` | caddy:latest | 80, 443, 443/udp | Reverse proxy | N/A (IS the proxy) |
| `adguard` | adguardhome | 53, 3003→80 | https://adguard.example.com | Yes (LAN) |
| `watchtower` | nickfedor/watchtower | (none) | Auto-updater (4h, label-based) | No |

#### Databases

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `postgres-unified` | ankane/pgvector | 5434 | All DBs: n8n, pgvector_db, scripture_graph, voice_jobs |
| `time-scheduler-db` | postgres:16-alpine | 5433 | Bishop Scheduler DB |
| `ne04j` | neo4j:latest | 7473-7474, 7687 | Graph database |

### Systemd Services (Non-Docker)

| Service | Port | URL | Notes |
|---------|------|-----|-------|
| `ollama.service` | 11434 | http://<gateway-ip>96:11434 | LLM inference (3 models) |

---

## MediaServer (<server-ip>)

**Hardware**: i7-12700KF (32GB RAM) + GMKtec EVO-X2
**OS**: Windows
**Role**: Media streaming, Plex, log shipping

| Service | Port | External URL | Notes |
|---------|------|-------------|-------|
| Plex Media Server | 32400 | https://plex.example.com | Public |
| Pi-hole DNS | 53 | N/A | Legacy, to decommission |
| Grafana Alloy | 12345 (UI) | N/A | Plex log shipper → Loki |

---

## SpareServer (<gateway-ip>03)

**Hardware**: 12GB RAM, 227GB disk
**OS**: Debian 12 (bookworm)
**Role**: Monitoring

| Service | Port | External URL | Notes |
|---------|------|-------------|-------|
| Uptime Kuma | 3001 | https://kuma.example.com | LAN only |
| Portainer | 9000 | http://<gateway-ip>03:9000 | LAN only |

---

## NAS Primary (<nas-ip>) - Synology DS1520+

**Hardware**: 20GB RAM, 27TB storage (34% used)
**Role**: Storage, Docker host

| Service | Port | External URL | Notes |
|---------|------|-------------|-------|
| AudioBookShelf | 13378 | https://audiobooks.example.com | Public |
| WebDAV (Obsidian Sync) | 5006 | https://sync.example.com | Public |
| Synology DSM | 5001 | https://nas.example.com | LAN only |
| Portainer | (unknown) | N/A | Docker management |

---

## NAS Backup (<gateway-ip>00) - Synology DS1513+

**Role**: Backup target, document scanning, secondary storage

| Service | Port | Notes |
|---------|------|-------|
| SSH | 222 | LAN only |
| NFS | 2049 | Enabled |
| Synology DSM | 5001 | LAN only |

### Shares

| Share | Purpose | Notes |
|-------|---------|-------|
| Backup | Primary backup target | Main role of this NAS |
| Scanner | Home scanner document storage | Scanner saves directly here |
| Forensics | Forensics data | Needs inventory |
| Mobile | Mobile device backups/sync | Needs inventory |
| music | Music library | Needs inventory |
| Syslog | Syslog collection | Needs inventory |
| sftp | SFTP drop | Needs inventory |
| DavidONeil | Personal files | Light usage |
| Games | Games | Light usage |
| homes | Synology user home dirs | Default Synology share |
| usbshare1 | USB external storage | Needs inventory |

---

## Network Infrastructure

| Device | IP | Role |
|--------|-----|------|
| UniFi Dream Machine Pro | <gateway-ip> | Router, firewall, Unifi controller |
| 24-port PoE Switch | (managed) | Network switching |
| 3x UniFi AP AC Pro | (managed) | Wireless access points |

**DNS**: AdGuard Home (AIServer <gateway-ip>96:53) primary, Pi-hole (MediaServer) legacy
**Domain**: example.com (Cloudflare DNS, Bluehost registrar)
**Firewall**: Port 443 open to all IPs (CF-only rule no longer active as of 2026-03-24)

---

## CloudFlare DNS Proxy Decisions

CF proxy (orange cloud) provides origin IP hiding, DDoS mitigation, and basic WAF — but breaks streaming protocols (SSE, WebDAV) and Caddy's ACME cert provisioning. Services below are DNS-only (gray cloud) and rely on Caddy WAF filters + per-service auth instead.

| Domain | Proxy Status | Reason | Confirmed |
|--------|-------------|--------|-----------|
| `homelab-mcp.example.com` | DNS-only (gray) | SSE streaming breaks, ACME fails | 2026-02-23 (incident), reconfirmed 2026-03-24 |
| `sync.example.com` | DNS-only (gray) | WebDAV incompatible with CF proxy | Reconfirmed 2026-03-24 |
| `tasks.example.com` | DNS-only (gray) | ACME cert conflicts through CF proxy | Reconfirmed 2026-03-24 |
| `journal.example.com` | DNS-only (gray) | ACME cert provisioning fails through proxy | Reconfirmed 2026-03-24 |
| `abs-upload.example.com` | DNS-only (gray) | Direct upload protocol | Existing |
| All other `*.example.com` | Proxied (orange) | Standard CF edge protection | Default |

**Protection for DNS-only services**: Caddy WAF (60+ attack path blocks, scanner UA blocking, security headers) + per-service auth (Authentik, WebDAV auth, UUID path, built-in). See `caddy-waf-options.md` for upgrade path (Coraza WAF) if deeper protection is needed.

---

## Code Projects Inventory

| Project | Path | Deployed? | Container(s) | External URL | Stack |
|---------|------|-----------|---------------|-------------|-------|
| GRC Platform | ~/Code/grc-platform | Yes | grc-frontend-dev + 11 Supabase | http://<gateway-ip>96:3002 | Next.js + Supabase |
| KLYX Terminal | ~/Code/klyx-terminal | Yes | klyx-terminal | https://example.com | Astro + React + Express |
| Bishop Scheduler | ~/Code/time-scheduler | On Pause | time-scheduler-app, time-scheduler-db | http://<gateway-ip>96:5001 | React + Express + PostgreSQL |
| Kali Scanner | ~/Code/kali-scanner | On Pause | spiderfoot, kali_scanner_dashboard + stack | https://scanner.example.com + https://osint.example.com | Python + PostgreSQL |
| PAI Observability | ~/Code/pai-observability | Yes | pai-frontend, pai-backend | http://<gateway-ip>96:5172 | Vue + Bun + Loki |
| CISO Expert Site | ~/Code/cisoexpert-site | Yes (local + Bluehost) | cisoexpert-site | http://<gateway-ip>96:4321 + https://cisoexpert.com | Astro + Tailwind |
| CodeCloud | ~/Code/codecloud | On Pause | codecloud | https://scratch.example.com | React + Scratch 3.0 |
| Voice Character System | ~/Code/voice-character-system | Yes | voice-character-api | http://<gateway-ip>96:8200 | TypeScript + SQLite |
| LDS Scriptures | ~/Code/lds-scriptures | Yes | scripture-graph-ui, scripture-graph-api | http://<gateway-ip>96:3085 | Python + D3.js |
| Context Structure Research | ~/Code/context-structure-research | No | None | N/A | Bash + Python |
| Outlook Intel | ~/Code/outlook-intel | No | None | N/A | Python + SQLite |
| AIfred Document Guard | ~/Code/aifred-document-guard | No (plugin) | None | N/A | JavaScript |
| Claude Code Research | ~/Code/claude-code-research | No | None | N/A | Research only |
| Loom | (not started) | No | None | N/A | Concept only |
| My AI Obsidian Plugin | NAS/.obsidian/plugins/my-ai | No (plugin) | None | N/A | TypeScript |

---

## On Pause

Active projects with Homepage tiles but containers currently stopped. Start with `docker compose up -d` when needed.

| Service | Compose File | Containers | Caddy Route |
|---------|-------------|------------|-------------|
| CodeCloud (Scratch) | ~/Code/codecloud/docker-compose.yml | codecloud | scratch.example.com |
| Bishop Scheduler | ~/Code/time-scheduler/docker_compose.yml | time-scheduler-app (DB stays running) | None |
| Kali Scanner | ~/Docker/mydocker/kali-scanner/docker-compose.yml | kali_scanner_dashboard, kali_scanner_db, kali_scanner_normalizer, kali_scanner_redis | scanner.example.com |

## Archived

Only archived services are removed from the Homepage.

| Service | Was | Archived Date | Reason |
|---------|-----|---------------|--------|
| Archon | archon stack (4 containers) | 2025-10-31 | Unhealthy, deprecated |
| Supabase (standalone) | supabase stack (7 containers) | 2025-10-31 | Part of Archon, removed |
| Appsmith | appsmith container | ~2025 | Unused, never adopted |
| OpenClaw | openclaw-gateway.service (port 18789) | 2026-02-25 | Archived by request, config backed up to ~/openclaw-archive-20260225.tar.gz |

---

## Port Map (AIServer Host Ports)

| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | LAN |
| 53 | AdGuard DNS | LAN (<gateway-ip>96 only) |
| 80 | Caddy HTTP | Public (redirects to 443) |
| 443 | Caddy HTTPS | Public (all IPs, Caddy WAF) |
| 3000 | OpenWebUI | Docker internal, proxied via Caddy |
| 3001 | Grafana | Docker, proxied via Caddy |
| 3002 | GRC Platform | LAN |
| 3003 | AdGuard Admin | LAN |
| 3080 | Organizr | Proxied via Caddy |
| 3081 | Homepage | LAN (iFrame in Organizr) |
| 3085 | Scripture Graph UI | LAN |
| 3100 | Loki | LAN |
| 3389/3390 | GNOME Remote Desktop | LAN |
| 4000 | PAI Backend | LAN |
| 4180 | OAuth2-Proxy | Docker internal |
| 4317 | Alloy OTLP gRPC | Docker internal |
| 4318 | Alloy OTLP HTTP | Docker internal |
| 4321 | CISO Expert Site | LAN |
| 5000 | Listenarr | LAN, proxied via Caddy |
| 5002 | SpiderFoot | LAN, proxied via Caddy |
| 5140 | Syslog (Promtail) | LAN |
| 5172 | PAI Frontend | LAN |
| 5433 | Bishop Scheduler DB | LAN |
| 5434 | PGVector | LAN |
| 5678 | n8n | Proxied via Caddy |
| 7473-7474 | Neo4j HTTP/HTTPS | LAN |
| 7687 | Neo4j Bolt | LAN |
| 7878 | Radarr | LAN |
| 8080 | MCP Gateway | Proxied via Caddy |
| 8090 | AIProjects API | LAN |
| 8100 | Chatterbox TTS | LAN |
| 8123 | Home Assistant | LAN, proxied via Caddy |
| 8200 | Voice Character API | LAN |
| 8350 | Aurora Web (nginx static) | LAN |
| 8989 | Sonarr | LAN |
| 9000 | Authentik | Proxied via Caddy |
| 9001 | Whisper Transcribe | LAN |
| 9002 | Portainer Agent | LAN |
| 9080 | Promtail metrics | LAN |
| 9090 | Prometheus | LAN |
| 9123 | ABS Exporter | LAN |
| 9443 | Authentik HTTPS | LAN |
| 9696 | Prowlarr | LAN |
| 11434 | Ollama | LAN (systemd) |
| 12345 | Alloy Debug UI | LAN |
| 54321-54327 | Supabase (GRC) | LAN |
| 61208-61209 | Glances | LAN |

---

## Internal Automation Systems

### Task Automation Readiness

Labels every Pulse task with `auto:` (ready/candidate) and `risk:` (safe/moderate/destructive). Stage-driven pipeline with autonomous execution of approved tasks.

| Component | Type | Schedule | Details |
|-----------|------|----------|---------|
| `task-evaluator` | Headless job | Every 1h | intake → route/queue: risk/capability/automation scoring |
| `task-investigator` | Headless job | Daily @9pm | Evaluates candidates at stage:route, promotes or blocks |
| `task-score` | Headless job | Daily @8pm | Retroactive labeler for unlabeled tasks |
| `task-executor` | Headless job | Every 2h | Self-queries and executes `auto:ready + risk:safe` tasks |
| `task-executor-infra` | Headless job | Every 1h (temp) | Infrastructure deployments: capability:infrastructure |
| `task-research` | Headless job | Every 1h | Executes `pipeline:approved + type:research` tasks, writes to Obsidian |
| `pipeline-watchdog` | Headless job | Every ~5 min | Label integrity, gate-stage validation, deprecated cleanup |
| `autofix-executor` | Persona | — | Focused implementer with 10 safety constraints |
| Scoring rules | Reference doc | — | `.claude/jobs/lib/autofix-scoring-rules.md` |

Context doc: `.claude/context/systems/task-automation.md`

### Project Aurora

Autonomous nightly surprise system. Three-phase pipeline: Think → Build → Present.

| Component | Type | Schedule | Details |
|-----------|------|----------|---------|
| `aurora-think` | Headless job | Nightly ~10 PM | Generates and scores 3-5 surprise ideas |
| `aurora-build` | Headless job | Nightly ~11 PM | Builds the selected surprise |
| `aurora-present` | Headless job | Morning ~6 AM | Publishes to Obsidian, Telegram, aurora-web |
| `aurora-web` | Docker (nginx) | Always-on | Static hosting at aurora.example.com:8350 |
