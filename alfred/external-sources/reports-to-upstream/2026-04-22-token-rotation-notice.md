# Security Notice — Rotate GitHub PAT Token

> **Migration note (2026-06-04)**: This document was addressed to the original upstream (davidmoneil/AIFred-Pro). Alfred-Dev has since been migrated to Project Aion (CannonCoPilot/Project_Aion). The content below is historical and preserved as-is.

**Date**: 2026-04-22
**From**: CannonCoPilot (AIFred-Pro fork operator)
**To**: David O'Neil (davidmoneil/AIFred-Pro upstream)
**Severity**: High — credential exposure
**Delivery**: Via Synology sync space (next sync) + GitHub issue/DM as backup

## Summary

During the AIFred-Pro fresh-install setup on JARVIS.local (macOS), a GitHub
Personal Access Token (PAT) was discovered embedded in the `origin` and
`upstream` git remote URLs of the vanilla David release:

- `origin`: `github_pat_11BKIRCZY0uUpYvRgTTySI_...` (truncated in logs)
- `upstream` (previous): `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`

Both tokens have been **removed locally** by switching the remotes to SSH
(`git@github.com:...`) and confirming the project-wide credential helper is
`osxkeychain`. Tokens are no longer present in any local config.

## Requested action

1. Rotate both PAT tokens at GitHub → Settings → Developer settings → Personal
   access tokens. The `ghp_` token in particular should be revoked immediately
   — it grants broad account scope.
2. Audit your upstream AIFred-Pro repository and any install scripts that may
   be emitting PATs into remote URLs during setup.
3. Consider switching the reference install flow to use SSH by default, or to
   use `gh auth login` instead of embedding PATs in `git clone`/`git remote
   set-url` commands.

## Why this is sync-delivered

This repo's `external-sources/reports-to-upstream/` convention is the agreed
channel for forks to surface findings for upstream triage. The same sync
already carries `2026-04-22-macos-compat-fixes.md` (BUG-01, BUG-02) which will
deliver this file the next time the space syncs.

If faster delivery is needed, please escalate via GitHub DM / issue comment on
`davidmoneil/AIFred-Pro`.

## Traceability

- Pulse task: `AION-0396c039` (plan-id P1-T03)
- AIFred-Pro-fork fixes commit: remote-URL rewrites + global
  `credential.helper osxkeychain` applied 2026-04-22 during setup session
- No external disclosure of the token values was made by the fork operator
