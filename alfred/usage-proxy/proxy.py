"""
AIFred-Pro Usage Proxy — Anthropic API Reverse Proxy with Telemetry Capture

Intercepts all Claude API traffic, captures response headers (rate limits,
unified budget state) and body usage data, writes to PostgreSQL, and forwards
everything transparently to the client.

Architecture:
  Claude Code → http://localhost:9800 → this proxy → https://api.anthropic.com
  (ANTHROPIC_BASE_URL)                                (upstream)

The proxy NEVER modifies requests or responses. It only observes and records.
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import asyncpg
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse

# ─── Configuration ───────────────────────────────────────────────────────────

UPSTREAM_URL = os.getenv("UPSTREAM_URL", "https://api.anthropic.com")
DB_HOST = os.getenv("PROXY_DB_HOST", "postgres")
DB_PORT = int(os.getenv("PROXY_DB_PORT", "5432"))
DB_NAME = os.getenv("PROXY_DB_NAME", "pulse_dev")
DB_USER = os.getenv("PROXY_DB_USER", "pulse_dev")
DB_PASS = os.getenv("PROXY_DB_PASSWORD", "")
PROXY_PORT = int(os.getenv("PROXY_PORT", "9800"))

# Model pricing (per million tokens, April 2026)
MODEL_PRICING = {
    "claude-opus-4-6":   {"input": 15.00, "output": 75.00, "cache_write": 18.75, "cache_read": 1.50},
    "claude-sonnet-4-6": {"input":  3.00, "output": 15.00, "cache_write":  3.75, "cache_read": 0.30},
    "claude-haiku-4-5":  {"input":  0.80, "output":  4.00, "cache_write":  1.00, "cache_read": 0.08},
}

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="AIFred Usage Proxy", version="1.0.0")
pool: Optional[asyncpg.Pool] = None
http_client: Optional[httpx.AsyncClient] = None


@app.on_event("startup")
async def startup():
    global pool, http_client
    pool = await asyncpg.create_pool(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USER, password=DB_PASS, min_size=1, max_size=5
    )
    http_client = httpx.AsyncClient(
        base_url=UPSTREAM_URL,
        timeout=httpx.Timeout(300.0, connect=10.0),
        follow_redirects=True,
    )


@app.on_event("shutdown")
async def shutdown():
    if http_client:
        await http_client.aclose()
    if pool:
        await pool.close()


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "upstream": UPSTREAM_URL, "version": "1.0.0"}


# ─── Proxy ───────────────────────────────────────────────────────────────────

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(request: Request, path: str):
    """Forward any request to the upstream Anthropic API and capture telemetry."""

    # Read request body
    body = await request.body()

    # Build upstream headers (forward everything except host)
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    # Parse request body for context (with x-aion-* header fallback for clients
    # that can't easily inject metadata.* into the body — e.g. claude-code's
    # internal SDK). See designs/reverse-proxy-paradigm-and-surfacing-2026-05-05.md §8.5.
    req_context = _parse_request_body(body, headers=headers)
    is_streaming = req_context.get("stream", False)

    if is_streaming:
        return await _handle_streaming(request, path, headers, body, req_context)
    else:
        return await _handle_non_streaming(request, path, headers, body, req_context)


async def _handle_non_streaming(request, path, headers, body, req_context):
    """Forward non-streaming request, capture full response."""
    upstream_resp = await http_client.request(
        method=request.method,
        url=f"/{path}",
        headers=headers,
        content=body,
    )

    resp_body = upstream_resp.content
    resp_headers = dict(upstream_resp.headers)

    # Parse and store telemetry (fire-and-forget)
    asyncio.create_task(_record_telemetry(
        resp_headers=resp_headers,
        resp_body=resp_body,
        req_context=req_context,
        http_status=upstream_resp.status_code,
    ))

    # Forward response transparently
    return JSONResponse(
        content=json.loads(resp_body) if resp_body else {},
        status_code=upstream_resp.status_code,
        headers=_passthrough_headers(resp_headers),
    )


async def _handle_streaming(request, path, headers, body, req_context):
    """Forward SSE streaming request without buffering, capture headers + final usage."""
    # httpx.stream() returns an async context manager — we need to hold it open
    # for the duration of the streaming response. We store it on a wrapper object
    # so the generator can access it after the context is entered.
    stream_ctx = http_client.stream(
        method=request.method,
        url=f"/{path}",
        headers=headers,
        content=body,
    )
    upstream_resp = await stream_ctx.__aenter__()

    resp_headers = dict(upstream_resp.headers)
    http_status = upstream_resp.status_code
    collected_usage = {}

    async def stream_generator():
        nonlocal collected_usage
        try:
            async for chunk in upstream_resp.aiter_bytes():
                # Scan SSE data: lines for usage in message_start and message_delta events
                try:
                    text = chunk.decode("utf-8", errors="replace")
                    for line in text.split("\n"):
                        if line.startswith("data: ") and '"usage"' in line:
                            event_data = json.loads(line[6:])
                            if event_data.get("type") == "message_start":
                                msg = event_data.get("message", {})
                                if "usage" in msg:
                                    collected_usage.update(msg["usage"])
                            elif "usage" in event_data:
                                collected_usage.update(event_data["usage"])
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass
                yield chunk
        finally:
            # After stream completes (or errors), record telemetry and close
            await _record_telemetry(
                resp_headers=resp_headers,
                resp_body=None,
                req_context=req_context,
                http_status=http_status,
                streaming_usage=collected_usage,
            )
            await stream_ctx.__aexit__(None, None, None)

    return StreamingResponse(
        stream_generator(),
        status_code=http_status,
        headers=_passthrough_headers(resp_headers),
        media_type=resp_headers.get("content-type", "text/event-stream"),
    )


# ─── Telemetry Recording ────────────────────────────────────────────────────

async def _record_telemetry(
    resp_headers: dict,
    resp_body: Optional[bytes],
    req_context: dict,
    http_status: int,
    streaming_usage: Optional[dict] = None,
):
    """Parse response headers + body and write to PostgreSQL."""
    try:
        # Extract usage from body or streaming accumulator
        usage = streaming_usage or {}
        if resp_body and not usage:
            try:
                body_json = json.loads(resp_body)
                usage = body_json.get("usage", {})
                # Capture model from response if not in request
                if not req_context.get("model") and "model" in body_json:
                    req_context["model"] = body_json["model"]
            except json.JSONDecodeError:
                pass

        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        cache_read = usage.get("cache_read_input_tokens", 0)
        cache_write = usage.get("cache_creation_input_tokens", 0)
        speed = usage.get("speed")

        # Compute cost
        model = req_context.get("model", "unknown")
        cost = _compute_cost(model, input_tokens, output_tokens, cache_read, cache_write)

        # Extract headers (case-insensitive lookup)
        h = {k.lower(): v for k, v in resp_headers.items()}

        # Collect raw anthropic-* headers
        raw = {k: v for k, v in h.items()
               if k.startswith("anthropic-") or k == "request-id" or k == "retry-after"}

        # Parse unified reset timestamps (Unix epoch → datetime)
        unified_5h_reset = _epoch_to_dt(h.get("anthropic-ratelimit-unified-5h-reset"))
        unified_7d_reset = _epoch_to_dt(h.get("anthropic-ratelimit-unified-7d-reset"))

        await pool.execute("""
            INSERT INTO api_requests (
                request_id, timestamp, organization_id,
                model, is_streaming, session_id, project, agent_name, task_id,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                speed, cost_usd,
                rl_requests_limit, rl_requests_remaining,
                rl_tokens_limit, rl_tokens_remaining,
                rl_input_remaining, rl_output_remaining,
                unified_status, unified_5h_status, unified_5h_utilization, unified_5h_reset,
                unified_7d_status, unified_7d_utilization, unified_7d_reset,
                unified_representative_claim, unified_fallback_pct, unified_overage_disabled,
                fast_input_remaining, fast_output_remaining,
                http_status, retry_after_secs, raw_headers, source
            ) VALUES (
                $1, NOW(), $2,
                $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12,
                $13, $14,
                $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24,
                $25, $26, $27,
                $28, $29, $30,
                $31, $32,
                $33, $34, $35, 'proxy'
            )
            ON CONFLICT (request_id) DO NOTHING
        """,
            h.get("request-id"),
            h.get("anthropic-organization-id"),
            req_context.get("model"),
            req_context.get("stream", False),
            req_context.get("session_id"),
            req_context.get("project"),
            req_context.get("agent_name"),
            req_context.get("task_id"),
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            speed,
            cost,
            _safe_int(h.get("anthropic-ratelimit-requests-limit")),
            _safe_int(h.get("anthropic-ratelimit-requests-remaining")),
            _safe_int(h.get("anthropic-ratelimit-tokens-limit")),
            _safe_int(h.get("anthropic-ratelimit-tokens-remaining")),
            _safe_int(h.get("anthropic-ratelimit-input-tokens-remaining")),
            _safe_int(h.get("anthropic-ratelimit-output-tokens-remaining")),
            h.get("anthropic-ratelimit-unified-status"),
            h.get("anthropic-ratelimit-unified-5h-status"),
            _safe_decimal(h.get("anthropic-ratelimit-unified-5h-utilization")),
            unified_5h_reset,
            h.get("anthropic-ratelimit-unified-7d-status"),
            _safe_decimal(h.get("anthropic-ratelimit-unified-7d-utilization")),
            unified_7d_reset,
            h.get("anthropic-ratelimit-unified-representative-claim"),
            _safe_decimal(h.get("anthropic-ratelimit-unified-fallback-percentage")),
            h.get("anthropic-ratelimit-unified-overage-disabled-reason"),
            _safe_int(h.get("anthropic-fast-input-tokens-remaining")),
            _safe_int(h.get("anthropic-fast-output-tokens-remaining")),
            http_status,
            _safe_int(h.get("retry-after")),
            json.dumps(raw),
        )
    except Exception as e:
        # Never let telemetry recording break the proxy
        print(f"[usage-proxy] telemetry error: {e}", flush=True)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _parse_request_body(body: bytes, headers: Optional[dict] = None) -> dict:
    """Extract model, stream flag, and metadata from the request body.

    Resolution order per attribution field (session_id, project, agent_name,
    task_id):
      1. body data.metadata.<field>       (preferred — survives proxy bypass)
      2. x-aion-<field> request header    (fallback — easier for clients we
                                           don't control like claude-code's
                                           internal SDK)
      3. None                              (logged but not enforced)

    Closes the attribution discipline gap documented in
    designs/reverse-proxy-paradigm-and-surfacing-2026-05-05.md §8.5.
    """
    h = {k.lower(): v for k, v in (headers or {}).items()}

    def _resolve(body_meta: dict, field: str) -> Optional[str]:
        return body_meta.get(field) or h.get(f"x-aion-{field.replace('_', '-')}")

    try:
        data = json.loads(body)
        meta = data.get("metadata") or {}
        return {
            "model": data.get("model"),
            "stream": data.get("stream", False),
            "session_id": _resolve(meta, "session_id"),
            "project": _resolve(meta, "project"),
            "agent_name": _resolve(meta, "agent_name"),
            "task_id": _resolve(meta, "task_id"),
        }
    except (json.JSONDecodeError, AttributeError):
        # Body unparseable — still try header fallback for attribution
        return {
            "session_id": h.get("x-aion-session-id"),
            "project": h.get("x-aion-project"),
            "agent_name": h.get("x-aion-agent-name"),
            "task_id": h.get("x-aion-task-id"),
        }


def _compute_cost(model: str, input_t: int, output_t: int, cache_read: int, cache_write: int) -> Decimal:
    """Compute cost in USD from token counts and model pricing."""
    # Try exact match, then prefix match
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        for key, val in MODEL_PRICING.items():
            if model and model.startswith(key.rsplit("-", 1)[0]):
                pricing = val
                break
    if not pricing:
        pricing = MODEL_PRICING.get("claude-sonnet-4-6", {"input": 3.0, "output": 15.0, "cache_write": 3.75, "cache_read": 0.30})

    cost = (
        (input_t * pricing["input"] / 1_000_000)
        + (output_t * pricing["output"] / 1_000_000)
        + (cache_write * pricing["cache_write"] / 1_000_000)
        + (cache_read * pricing["cache_read"] / 1_000_000)
    )
    return Decimal(str(round(cost, 6)))


def _passthrough_headers(resp_headers: dict) -> dict:
    """Select headers to forward to the client. Forward all anthropic-* and rate-limit headers."""
    forward = {}
    for k, v in resp_headers.items():
        kl = k.lower()
        if (kl.startswith("anthropic-") or kl == "request-id" or kl == "retry-after"
                or kl in ("x-request-id", "cf-ray")):
            forward[k] = v
    return forward


def _safe_int(val) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_decimal(val) -> Optional[Decimal]:
    if val is None:
        return None
    try:
        return Decimal(str(val).strip('"'))
    except Exception:
        return None


def _epoch_to_dt(val) -> Optional[datetime]:
    """Convert Unix epoch integer (from unified headers) to datetime."""
    if val is None:
        return None
    try:
        return datetime.fromtimestamp(int(val), tz=timezone.utc)
    except (ValueError, TypeError, OSError):
        return None


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PROXY_PORT)
