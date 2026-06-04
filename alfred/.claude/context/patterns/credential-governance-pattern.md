# Credential Governance Pattern

## What It Does

Enforces **scope authorization** for credential access. Defines who can access which credential, for what purpose, and escalates when access falls outside those boundaries.

This fills a gap between:
- **Document Guard** — structural file protection (prevents unauthorized edits to files)
- **Credential scanning** — detects secrets being leaked into content
- **Credential Governance** (this) — scope authorization (who can access which credential, and how violations escalate)

## Why It Exists

An autonomous agent modified a Cloudflare IP address during a legitimate task — there was no policy boundary defining that the Cloudflare credential/config was out-of-scope. Document Guard protects file structure, credential scanning catches leaked secrets, but neither addresses **scope governance**.

## Architecture

```
credential-inventory.yaml          credential-governance.yaml
(catalog: what exists, where)  ←→  (policy: who can do what)
         ↓                                   ↓
  credential-guard.config.js ←── runtime policies (JS export)
         ↓
  credential-guard.js (PreToolUse hook)
    ├── File path matching (Edit/Write targets)
    ├── Variable name matching (Bash commands)
    ├── Consumer/persona authorization check
    └── Escalation routing
         ├── Interactive: warn-confirm | hard-block
         └── Headless: Pulse task | Telegram
```

## Key Files

| File | Purpose |
|------|---------|
| `.claude/registries/credential-governance.yaml` | Canonical policy source (YAML) |
| `.claude/hooks/credential-guard.config.js` | Runtime JS export (keep in sync with YAML) |
| `.claude/hooks/credential-guard.js` | Enforcement hook (PreToolUse) |
| `.claude/context/systems/credential-inventory.yaml` | Credential catalog (what exists, where) |
| `.claude/logs/credential-guard.jsonl` | Audit trail |
| `.claude/logs/.credential-guard-overrides.json` | Interactive override mechanism |

## Risk Tier Escalation

| Tier | Interactive | Headless |
|------|-------------|----------|
| **standard** | warn-confirm (context injected) | Pulse task (waiting:david) + block |
| **high-risk** | hard-block (override available) | Pulse task (waiting:david) + block |
| **critical** | hard-block (override available) | Telegram + Pulse task + block |

## How Authorization Works

1. Hook detects a governed credential via **file path** (Edit/Write) or **variable name** (Bash)
2. Checks `allowedConsumers` (file pattern match) and `allowedPersonas` (CLAUDE_PERSONA env var)
3. If authorized → proceed silently (audit logged)
4. If unauthorized → escalate per risk tier

## Override Workflow (Interactive Sessions)

1. Hook blocks the action and shows override instructions
2. User approves the access
3. Claude writes override file: `.claude/logs/.credential-guard-overrides.json`
4. Claude retries the action — override consumed (single-use, expires in 120s)

## Adding a New Credential to Governance

1. Ensure the credential exists in `credential-inventory.yaml` (catalog)
2. Add a policy entry to `credential-governance.yaml` with:
   - `id` matching the inventory
   - `risk_tier`, `file_patterns`, `variable_names`
   - `allowed_consumers` and `allowed_personas`
   - Optional `escalation` override
3. **Manually** add the matching JS entry to `credential-guard.config.js` (Document Guard blocks Claude from writing this file directly — human edit required, or use Document Guard override)
4. Test: attempt to edit a governed file or run a command with a governed variable

## Document Guard Protection

The governance files themselves are protected:
- `credential-governance.yaml` → Document Guard critical tier (key_deletion_protection, section_preservation)
- `credential-guard.config.js` → Document Guard critical tier (no_write_allowed)

This prevents the policies from being weakened without explicit approval.

## Related

- `secret-management-pattern.md` — SOPS + age encryption for secret storage
- `.claude/hooks/document-guard.js` — Structural file protection
- `.claude/hooks/secret-scanner.js` — Secret leak detection in git commits
