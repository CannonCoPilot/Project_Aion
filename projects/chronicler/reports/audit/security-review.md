# Chronicler Security Review

**Date**: 2026-03-10
**Reviewer**: Jarvis Code Review Agent (Opus 4.6)
**Scope**: Chronicler codebase at `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Score**: 7.5/10

---

## Executive Summary

Chronicler demonstrates solid security fundamentals for a local-network application: all database queries use parameterized statements via asyncpg, Jinja2 autoescaping is enabled, and the event rendering system consistently applies `markupsafe.escape()` before wrapping in `Markup()`. The primary concerns are the absence of security headers, no authentication layer (acceptable for localhost-only but risky if exposed), use of stdlib `xml.etree.ElementTree` without XXE hardening, and ~75 `|safe` template filter usages that create a maintenance fragility. No critical vulnerabilities were found.

---

## Methodology

1. Manual review of `chronicler/explorer/queries.py` (1,076 lines) for SQL injection patterns
2. Grep analysis of all `|safe` filter usage across 50+ Jinja2 templates (~75 instances)
3. Review of `chronicler/explorer/events.py` for XSS in event rendering (45+ `escape()` calls, `_link()` helper)
4. Review of XML parsing configuration for XXE/bomb protections
5. Review of `chronicler/explorer/__init__.py` / `app.py` for security headers and middleware
6. Dependency review via `pyproject.toml`

---

## Findings

### SEC-001 — No XXE Protection on XML Parsing [MEDIUM]

**File**: `chronicler/ingest/xml_parser.py`

Uses `xml.etree.ElementTree.parse()` without `defusedxml`. While `ET.parse()` in CPython doesn't expand external entities by default, it has no explicit protections against XML bombs (billion laughs) or DTD processing. Attack surface is narrow (files come from DF export, requires filesystem access).

**Fix**: Add `defusedxml` dependency or use custom parser with `forbid_dtd=True`.

---

### SEC-002 — No Security Headers [MEDIUM]

**File**: `chronicler/explorer/app.py`

No CSP, X-Frame-Options, X-Content-Type-Options, HSTS, or other security headers set. Without CSP, any XSS becomes more exploitable. Without X-Frame-Options, clickjacking possible.

**Fix**: Add `@web.middleware` with security headers or use appropriate aiohttp security middleware.

---

### SEC-003 — No Authentication or Authorization [LOW]

**File**: `chronicler/explorer/app.py`, all route handlers

No auth mechanism. All routes and API endpoints publicly accessible. Acceptable for localhost deployment. Risk if exposed on network — API exposes full DB query capabilities including export.

**Fix**: Verify localhost-only binding. Document security implications of non-localhost binding.

---

### SEC-004 — `|safe` Filter on Pre-Escaped HTML — Maintenance Fragility [LOW]

**Files**: Multiple templates in `chronicler/explorer/templates/`

~75 instances of `|safe` filter used to render pre-escaped HTML from `events.py`. The `_link()` function consistently applies `escape(name)` on all entity names (45+ calls). Current implementation is **correct**.

**Fragility**: Any future event renderer that forgets `escape()` creates XSS bypassing Jinja2 autoescaping.

**Fix**: Document escaping contract in `events.py`. Add XSS regression test with entity names containing `<script>` tags.

---

### SEC-005 — SQL Injection: All Queries Properly Parameterized [INFO]

**File**: `chronicler/explorer/queries.py` (1,076 lines)

All queries use asyncpg parameterized queries (`$1`, `$2`, etc.). Dynamic SQL exists for:
- Sort columns: protected by `ALLOWED_SORT_COLUMNS` whitelist
- Conditional WHERE: values always parameterized
- LIMIT/OFFSET: parameterized
- Search terms: parameterized ILIKE

No f-string interpolation of user input into SQL found. **Risk: None.**

---

### SEC-006 — Dynamic SQL Column Names Use Whitelist [INFO]

**File**: `chronicler/explorer/queries.py:82-100`

Sort columns validated against `ALLOWED_SORT_COLUMNS` before ORDER BY interpolation. Correct approach. No risk provided whitelist maintained.

---

### SEC-007 — JSONB Text Search Safe [INFO]

`details::text ILIKE $N` with parameterized search terms. Safe against injection.

---

### SEC-008 — Dependency Review [INFO]

**File**: `pyproject.toml`

- `flask>=3.0` / `aiohttp>=3.9` — current, verify aiohttp against CVE databases
- `asyncpg>=0.29` — current, well-maintained
- `lxml>=5.0` — version 5.x defaults safer for XXE
- Notable absence: `defusedxml` not in dependencies

---

### SEC-009 — Input Validation on Route Parameters [LOW]

Route parameters coerced to int by URL matching. Search terms passed to parameterized queries. No explicit length validation on search strings — very long strings could cause performance issues.

**Fix**: Add max length validation on search params (e.g., 500 chars).

---

## Recommendations (Prioritized)

| Priority | Finding | Action |
|----------|---------|--------|
| 1 | SEC-001 | Add `defusedxml` dependency |
| 2 | SEC-002 | Add security headers via middleware |
| 3 | SEC-004 | Document escaping contract; add XSS regression test |
| 4 | SEC-003 | Verify localhost-only binding |
| 5 | SEC-009 | Input length validation on search |
| 6 | SEC-008 | Pin `aiohttp` to specific patched version |

---

## Phase 3 Readiness Assessment

**Verdict: CONDITIONAL PASS**

Phase 3 introduces network communication with DFHack bridge, WebSocket connections, and monitoring dashboard.

1. **Must-fix**: SEC-002 (security headers) — WebSocket and live data endpoints increase attack surface
2. **Should-fix**: SEC-001 (XXE) — if Phase 3 introduces new XML ingestion paths
3. **Monitor**: SEC-003 (auth) — if application binds to non-localhost for bridge communication

SQL injection and XSS defenses are solid and require no changes for Phase 3.
