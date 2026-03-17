# Chronicler Error Handling Review

**Date**: 2026-03-10
**Reviewer**: Jarvis Code Review Agent (Opus 4.6)
**Scope**: Chronicler codebase at `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Score**: 4/10

---

## Executive Summary

Error handling is the weakest aspect of the Chronicler codebase. The ingestion pipeline has adequate error handling with structured logging and per-step try/except. However, the web layer has critical gaps: no error middleware, no try/except on any route handler (0 across 800+ lines of routes.py + api.py), no registered error handlers, and no consistent error response format. The database pool has no retry logic, no connection health checks, and no pool exhaustion handling. URL parameter parsing has no ValueError guards across 13 handlers. These gaps are adequate for batch-oriented Phase 1-2 usage but fundamentally insufficient for Phase 3's continuous operation requirements.

---

## Methodology

1. Count and analysis of all try/except patterns across the codebase
2. Error propagation path analysis from DB through query layer to routes
3. Review of logging patterns (module loggers, levels, context)
4. Assessment of error handler registration in aiohttp app
5. CLI error handling review
6. Database connection lifecycle and failure mode analysis

---

## Findings

### ERR-001 — No Error Middleware in aiohttp App [CRITICAL]

**File**: `chronicler/explorer/app.py`

The aiohttp application has no `@web.middleware` for error handling. No handlers registered for 404, 500, or database errors. Any unhandled exception returns aiohttp's default HTML error page.

**Impact**: Poor UX on errors. In debug mode, stack traces leak internal info (DB schema, paths, connection strings).

**Fix**: Add error middleware:
```python
@web.middleware
async def error_middleware(request, handler):
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except asyncpg.PostgresError:
        return web.Response(text="Database error", status=503)
    except ValueError:
        raise web.HTTPBadRequest(text="Invalid parameter")
    except Exception:
        logger.exception("Unhandled error")
        return web.Response(text="Internal server error", status=500)
```

---

### ERR-002 — Route Handlers Have Zero Try/Except [CRITICAL]

**Files**:
- `chronicler/explorer/detail_pages.py` — 13 handlers, 0 try/except
- `chronicler/explorer/filters.py` — 7 handlers, 0 try/except
- `chronicler/explorer/search.py` — 2 handlers, 0 try/except
- `chronicler/explorer/population.py` — 1 handler, 0 try/except
- `chronicler/explorer/export.py` — 2 handlers, 0 try/except
- `chronicler/explorer/dashboard.py` — 1 handler, 0 try/except

Total: ~26 handlers with 800+ lines, zero error handling. Any DB failure → raw 500 traceback.

**Fix**: Error middleware (ERR-001) handles this globally. Individual handlers should only catch handler-specific errors.

---

### ERR-003 — Database Pool Has No Retry Logic [CRITICAL]

**File**: `chronicler/db/pool.py`

`get_pool()` creates pool with no retry. If PostgreSQL is temporarily unavailable, pool creation fails immediately. No `command_timeout`, no `max_inactive_connection_lifetime`, no health checks.

**Impact**: Transient DB outage crashes entire app with no recovery. Critical for Phase 3 continuous operation.

**Fix**: Add retry loop with backoff, configure pool timeouts.

---

### ERR-004 — Unguarded `int()` on URL Parameters [HIGH]

**File**: `chronicler/explorer/detail_pages.py` (all handlers)

```python
figure_id = int(request.match_info['id'])
```

Navigating to `/figures/abc` → `ValueError` → HTTP 500 with raw traceback. Affects 13 handlers.

**Fix**: Helper function that raises `web.HTTPBadRequest`, or catch `ValueError` in error middleware.

---

### ERR-005 — No Query Error Handling (Zero try/except in queries.py) [HIGH]

**File**: `chronicler/explorer/queries.py` (1,076 lines)

Zero try/except blocks. All asyncpg errors (pool exhaustion, timeout, connection dropped) propagate directly to route handlers (which also have no error handling).

**Fix**: Global error middleware covers this. Optionally add query wrapper with timeout.

---

### ERR-006 — Post-Parse Pipeline Continues After Step Failure [HIGH]

**File**: `chronicler/ingest/post_parse.py:30-35`

Each enrichment step catches `Exception` broadly, logs error, continues. If `_extract_entity_site_links` fails, dependent steps like `_derive_site_founders` run on incomplete data. No rollback, no dependency graph.

**Fix**: Add critical flag to steps. Optionally run in transaction with rollback.

---

### ERR-007 — Bulk Load Has No Transaction Boundary [HIGH]

**File**: `chronicler/db/sync.py:168-180`

Each `executemany` runs in autocommit (asyncpg default). Failure partway through leaves DB with partial data. For DROP+recreate workflow this is acceptable; for Phase 3 incremental ingestion it's a data integrity risk.

**Fix**: Wrap in explicit transaction.

---

### ERR-008 — Broad Exception Catching in Pipeline [MEDIUM]

**File**: `chronicler/ingest/post_parse.py`

`except Exception as e` catches programming errors (TypeError, AttributeError) at same level as data errors. Some blocks use `logger.error(f"...: {e}")` instead of `logger.exception()` (loses traceback).

**Fix**: Use `logger.exception()` for full tracebacks.

---

### ERR-009 — No Graceful Shutdown Handling [MEDIUM]

**File**: `chronicler/explorer/app.py`

The `cleanup()` handler calls `close_pool()` but only on clean shutdown. No signal handlers for interrupted operations. Connection pool not explicitly closed on SIGTERM/SIGINT.

**Fix**: aiohttp `on_cleanup` should handle this. Verify pool.close() is called on all shutdown paths.

---

### ERR-010 — XML ParseError Not Caught [MEDIUM]

**File**: `chronicler/ingest/xml_parser.py:17-19`

`ET.parse()` raises `ParseError` for malformed XML. Not caught — propagates as raw traceback.

**Fix**: Wrap with clear error message.

---

### ERR-011 — Export Invalid Type Returns Plain Text Error [LOW]

**File**: `chronicler/explorer/export.py:55-58`

Returns `web.Response(text="Invalid entity type", status=400)` — inconsistent with other responses (HTML).

---

### ERR-012 — No Request/Response Logging [LOW]

No access logging middleware. No correlation between web requests and DB queries. No slow-query logging.

**Fix**: Add aiohttp access logging middleware and structured error logging.

---

## Error Response Consistency

| Scenario | Current Behavior |
|----------|-----------------|
| Entity not found | `raise web.HTTPNotFound(text=...)` — OK |
| Invalid export type | `web.Response(text=..., status=400)` — plain text |
| DB connection failure | Raw exception → 500 traceback |
| Malformed URL param | `ValueError` → 500 traceback |
| Template render error | Silent degradation (acceptable) |
| Query timeout | Raw asyncpg exception → 500 |

**No consistent error format exists.**

---

## Logging Assessment

| Area | Status |
|------|--------|
| Module-level loggers | GOOD — all modules define `logger = logging.getLogger(__name__)` |
| Ingestion logging | GOOD — timing and row counts per table |
| Post-parse logging | GOOD — per-step status |
| Request logging | MISSING |
| Error logging | POOR — most errors propagate unlogged |
| Query logging | MISSING |
| Structured logging | MISSING |

---

## Phase 3 Readiness Assessment

**Verdict: CONDITIONAL PASS — Significant work recommended**

Phase 3 introduces continuous operation (live bridge, WebSocket, worldgen monitoring) that fundamentally changes reliability requirements.

### Must-fix before Phase 3 Stage 3.1:
1. **ERR-001**: Error middleware — live dashboard must not crash on DB hiccups
2. **ERR-003**: Database retry logic — bridge causes frequent connection churn
3. **ERR-004**: URL parameter validation — prevents 13 handlers from 500 on bad input

### Should-fix before Phase 3 Stage 3.2:
4. **ERR-007**: Transaction boundaries — incremental ingestion must be atomic
5. **ERR-009**: Graceful shutdown — continuous operation needs clean resource cleanup
6. **ERR-012**: Request/query logging — monitoring dashboard needs observability

### Nice-to-have:
7. ERR-006, ERR-008, ERR-010 — quality-of-life improvements

The ingestion layer (Phase 1 code) has the strongest error handling. The explorer web layer (Phase 2 code) has the weakest. This imbalance should be corrected before Phase 3.
