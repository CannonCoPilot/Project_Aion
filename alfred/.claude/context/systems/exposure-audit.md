# Nightly Exposure Audit

**Purpose**: Catch public-endpoint drift on day 1, not day 13.

**Origin**: Built as security-remediation-2026-04 T3.4 (AIProjects-izlk) in response to the 2026-04-07 google-token-vault incident, where the vault was publicly reachable with no authentication for 13 days and no automated check detected it.

---

## How it works

1. **Enumerate**: Parses `~/Docker/mydocker/caddy/Caddyfile` for every `*.example.com { ... }` block and extracts the hostname.
2. **Probe**: For each hostname, curls a set of sensitive paths unauthenticated (no cookies, no headers, no auth) with an 8s timeout.
3. **Compare**: Matches each response code against `~/AIProjects/.claude/registries/public-endpoints-allowlist.yaml`.
4. **Alert**: Any unexpected response → creates a `waiting:david` Pulse task with `risk:critical` + sends a Telegram alert.

**Sensitive paths probed** (current set):
`/`, `/api`, `/api/v1`, `/api/v1/users`, `/admin`, `/health`, `/login`, `/dashboard`, `/.env`, `/config`

---

## Files

| File | Purpose |
|---|---|
| `~/AIProjects/.claude/jobs/bin/exposure-audit.sh` | The scanner script |
| `~/AIProjects/.claude/registries/public-endpoints-allowlist.yaml` | Expected-state declaration |
| `~/AIProjects/.claude/data/exposure-audit/latest.json` | Latest report (always) |
| `~/AIProjects/.claude/data/exposure-audit/YYYY-MM-DD-HHMM.json` | Historical reports |
| `~/AIProjects/.claude/jobs/registry.yaml` (`exposure-audit` entry) | Nexus job registration |

## Schedule

Runs nightly at **03:00** via Nexus cron (`cron: "0 3 * * *"`). Uses `engine: script`, no LLM cost.

## Exit codes

- `0` — clean, no drift
- `1` — drift detected (Telegram alert + Pulse task created)
- `2` — audit failed to run (config missing, dependencies missing, etc.)

## Allowlist format

```yaml
default_accepted_codes: [400, 401, 403, 404, 301, 302, 307, 308, 000]

hostnames:
  example.example.com:
    description: "What this service is"
    notes: "Why the rules are what they are"

    # Option 1: catchall for SPAs (any probe path returns one of these codes)
    all_paths_accepted: [200, 302]

    # Option 2: per-path overrides (highest precedence)
    expected:
      "/api/v1/users": [401]
      "/admin": [302, 401]
```

**Resolution precedence**: `expected[path]` > `all_paths_accepted` > `default_accepted_codes`.

### When to use each

- **`expected`** — for specific paths that must return specific codes (e.g., authenticated API endpoints that must return 401 on unauth)
- **`all_paths_accepted`** — for SPAs where the frontend catches any path and serves `index.html` with 200. This is the common case for most self-hosted web apps (OpenWebUI, Home Assistant, Authentik, n8n, etc.).
- **`default_accepted_codes`** — the global fallback. Includes `400` because some reverse proxies (Synology WebDAV, Caddy IP-gates) return 400 rather than 401/403.

## Running manually

```bash
# Full run (alerts on drift)
bash ~/AIProjects/.claude/jobs/bin/exposure-audit.sh

# Dry run (no alerts, exit 1 on drift)
bash ~/AIProjects/.claude/jobs/bin/exposure-audit.sh --dry-run

# Print the latest report
bash ~/AIProjects/.claude/jobs/bin/exposure-audit.sh --report
```

## Adding a new service

When you add a new public service to the Caddyfile:

1. **Before** deploying, add an entry to `public-endpoints-allowlist.yaml` with `description` and expected codes
2. Deploy the service
3. Run `bash ~/AIProjects/.claude/jobs/bin/exposure-audit.sh --dry-run` to verify no drift
4. Commit both the Caddyfile change and the allowlist change together

If you forget step 1, the next nightly run will flag the host as `undeclared` and create a Pulse task for you to add the entry.

## Known limitations

1. **Content-type blind** — The audit only checks HTTP response codes. A service that returns `200 text/html` for `/.env` (SPA catchall) looks the same as a service leaking its `.env` file. Mitigated by explicit `all_paths_accepted` declarations for SPAs. **Future enhancement**: add content-type awareness so text/plain or text/json 200s on `/.env`, `/config` are flagged even for SPA hosts.
2. **Static path list** — The set of probed paths is hardcoded in the script. Adding `/secrets`, `/backup`, or other paths requires editing the script.
3. **Caddyfile-only** — If a service is exposed via a different ingress (Cloudflare Tunnel without Caddy, nginx, direct port), the audit won't see it. This is acceptable for the homelab because Caddyfile is the single source of truth.

## What this would have caught

The google-token-vault incident would have been caught on **day 1** instead of day 13:

- Vault was in Caddyfile at `services.example.com` with no `forward_auth` import
- Audit would have probed `https://services.example.com/api/v1/users` unauthenticated
- It would have returned `200` with the token vault JSON response
- `services.example.com` would have been flagged as undeclared, AND `/api/v1/users → 200` would have been flagged as drift
- Telegram alert + Pulse task at 03:00 on 2026-03-26

That's the binding mechanism the Phase 0 + Tier 0 work was missing.

## Related

- `.claude/context/security/remediation-plan-2026-04.md` — parent remediation project
- `.claude/context/security/credential-exposure-report-2026-04-07.md` — incident root report
- `.claude/jobs/bin/pulsar-runner.sh` — similar `engine: script` job pattern
- T3.5 Caddyfile pre-commit lint (AIProjects-8dnh) — catches bad config at commit time, complements this runtime audit
