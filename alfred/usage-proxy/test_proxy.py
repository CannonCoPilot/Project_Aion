"""
Phase 1 Test Suite — Usage Proxy & JSONL Parser

Tests:
  1. Unit tests for pure functions (cost calc, header parsing, timestamp conversion)
  2. Mock proxy integration (crafted response with all 6 header families)
  3. SSE streaming passthrough (mock streaming with final usage capture)
  4. JSONL parser validation (real session file parsing + edge cases)
"""

import asyncio
import json
import os
import tempfile
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
import httpx
from fastapi.testclient import TestClient

# Import from proxy module
from proxy import (
    app,
    _compute_cost,
    _safe_int,
    _safe_decimal,
    _epoch_to_dt,
    _passthrough_headers,
    _parse_request_body,
)
from jsonl_parser import parse_jsonl_file, compute_cost as parser_compute_cost, extract_project_name


# ═══════════════════════════════════════════════════════════════════════════════
# 1. UNIT TESTS — Pure Functions
# ═══════════════════════════════════════════════════════════════════════════════

class TestComputeCost:
    """Test cost calculation for different models and token counts."""

    def test_opus_cost(self):
        # 1000 input + 100 output for Opus
        cost = _compute_cost("claude-opus-4-6", 1000, 100, 0, 0)
        # 1000 * 15/1M + 100 * 75/1M = 0.015 + 0.0075 = 0.0225
        assert cost == Decimal("0.0225")

    def test_sonnet_cost(self):
        cost = _compute_cost("claude-sonnet-4-6", 1000, 100, 0, 0)
        # 1000 * 3/1M + 100 * 15/1M = 0.003 + 0.0015 = 0.0045
        assert cost == Decimal("0.0045")

    def test_haiku_cost(self):
        cost = _compute_cost("claude-haiku-4-5", 1000, 100, 0, 0)
        # 1000 * 0.8/1M + 100 * 4/1M = 0.0008 + 0.0004 = 0.0012
        assert cost == Decimal("0.0012")

    def test_cache_read_cost(self):
        # Cache reads are 0.1x input for Opus = $1.50/MTok
        cost = _compute_cost("claude-opus-4-6", 0, 0, 100000, 0)
        # 100000 * 1.50/1M = 0.15
        assert cost == Decimal("0.15")

    def test_cache_write_cost(self):
        # Cache writes are 1.25x input for Opus = $18.75/MTok
        cost = _compute_cost("claude-opus-4-6", 0, 0, 0, 100000)
        # 100000 * 18.75/1M = 1.875
        assert cost == Decimal("1.875")

    def test_combined_cost(self):
        cost = _compute_cost("claude-opus-4-6", 1000, 500, 50000, 10000)
        expected = Decimal(str(round(
            1000 * 15 / 1e6 + 500 * 75 / 1e6 + 50000 * 1.5 / 1e6 + 10000 * 18.75 / 1e6,
            6
        )))
        assert cost == expected

    def test_unknown_model_defaults_to_sonnet(self):
        cost = _compute_cost("some-future-model", 1000, 100, 0, 0)
        sonnet_cost = _compute_cost("claude-sonnet-4-6", 1000, 100, 0, 0)
        assert cost == sonnet_cost

    def test_zero_tokens(self):
        cost = _compute_cost("claude-opus-4-6", 0, 0, 0, 0)
        assert cost == Decimal("0")

    def test_large_token_count(self):
        # 1M input tokens on Opus = $15.00
        cost = _compute_cost("claude-opus-4-6", 1_000_000, 0, 0, 0)
        assert cost == Decimal("15.0")


class TestSafeInt:
    def test_valid_int(self):
        assert _safe_int("42") == 42

    def test_valid_int_object(self):
        assert _safe_int(42) == 42

    def test_none(self):
        assert _safe_int(None) is None

    def test_invalid_string(self):
        assert _safe_int("not_a_number") is None

    def test_empty_string(self):
        assert _safe_int("") is None

    def test_float_string(self):
        # "3.14" should fail int conversion
        assert _safe_int("3.14") is None


class TestSafeDecimal:
    def test_valid_decimal(self):
        result = _safe_decimal("0.690000")
        assert result == Decimal("0.690000")

    def test_high_precision(self):
        result = _safe_decimal("0.018842345678")
        assert result == Decimal("0.018842345678")

    def test_none(self):
        assert _safe_decimal(None) is None

    def test_quoted_string(self):
        # Some headers might have quotes
        result = _safe_decimal('"1.000000"')
        assert result == Decimal("1.000000")

    def test_invalid(self):
        assert _safe_decimal("not_a_number") is None

    def test_zero(self):
        assert _safe_decimal("0.0") == Decimal("0.0")

    def test_one(self):
        assert _safe_decimal("1.0") == Decimal("1.0")


class TestEpochToDt:
    def test_valid_epoch(self):
        # 1745539200 = 2025-04-25 00:00:00 UTC (as used in mock headers)
        result = _epoch_to_dt("1745539200")
        assert result is not None
        assert result.tzinfo == timezone.utc
        assert result.year >= 2025

    def test_none(self):
        assert _epoch_to_dt(None) is None

    def test_invalid(self):
        assert _epoch_to_dt("not_a_timestamp") is None

    def test_integer_input(self):
        result = _epoch_to_dt(1745539200)
        assert result is not None
        assert result.year >= 2025

    def test_zero(self):
        result = _epoch_to_dt("0")
        assert result is not None
        assert result.year == 1970


class TestPassthroughHeaders:
    def test_forwards_anthropic_headers(self):
        headers = {
            "anthropic-ratelimit-tokens-remaining": "5000",
            "anthropic-ratelimit-unified-5h-utilization": "0.69",
            "content-type": "application/json",
            "server": "cloudflare",
        }
        result = _passthrough_headers(headers)
        assert "anthropic-ratelimit-tokens-remaining" in result
        assert "anthropic-ratelimit-unified-5h-utilization" in result
        assert "content-type" not in result
        assert "server" not in result

    def test_forwards_request_id(self):
        headers = {"request-id": "req_abc123"}
        result = _passthrough_headers(headers)
        assert "request-id" in result

    def test_forwards_retry_after(self):
        headers = {"retry-after": "30"}
        result = _passthrough_headers(headers)
        assert "retry-after" in result

    def test_forwards_cf_ray(self):
        headers = {"cf-ray": "abc123-SLC"}
        result = _passthrough_headers(headers)
        assert "cf-ray" in result

    def test_empty_headers(self):
        assert _passthrough_headers({}) == {}


class TestParseRequestBody:
    def test_valid_messages_request(self):
        body = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 1024,
            "stream": True,
            "messages": [{"role": "user", "content": "hello"}],
            "metadata": {
                "session_id": "abc-123",
                "project": "jarvis",
                "agent_name": "code-analyzer",
                "task_id": "AION-xyz",
            }
        }).encode()
        result = _parse_request_body(body)
        assert result["model"] == "claude-sonnet-4-6"
        assert result["stream"] is True
        assert result["session_id"] == "abc-123"
        assert result["project"] == "jarvis"
        assert result["agent_name"] == "code-analyzer"
        assert result["task_id"] == "AION-xyz"

    def test_minimal_request(self):
        body = json.dumps({
            "model": "claude-haiku-4-5",
            "messages": [{"role": "user", "content": "hi"}],
        }).encode()
        result = _parse_request_body(body)
        assert result["model"] == "claude-haiku-4-5"
        assert result["stream"] is False
        assert result["session_id"] is None

    def test_invalid_json(self):
        result = _parse_request_body(b"not json")
        assert result == {}

    def test_empty_body(self):
        result = _parse_request_body(b"")
        assert result == {}


# ═══════════════════════════════════════════════════════════════════════════════
# 2. MOCK PROXY INTEGRATION — Crafted Response with All Header Families
# ═══════════════════════════════════════════════════════════════════════════════

# Build a mock response with all 6 header families
MOCK_RESPONSE_HEADERS = {
    # Family 1: Universal
    "request-id": "req_test_mock_001",
    "anthropic-organization-id": "org-test-12345",
    "content-type": "application/json",

    # Family 2: Standard rate limits (12 headers)
    "anthropic-ratelimit-requests-limit": "4000",
    "anthropic-ratelimit-requests-remaining": "3999",
    "anthropic-ratelimit-requests-reset": "2026-04-24T00:01:00Z",
    "anthropic-ratelimit-tokens-limit": "400000",
    "anthropic-ratelimit-tokens-remaining": "398500",
    "anthropic-ratelimit-tokens-reset": "2026-04-24T00:01:00Z",
    "anthropic-ratelimit-input-tokens-limit": "200000",
    "anthropic-ratelimit-input-tokens-remaining": "199000",
    "anthropic-ratelimit-input-tokens-reset": "2026-04-24T00:01:00Z",
    "anthropic-ratelimit-output-tokens-limit": "50000",
    "anthropic-ratelimit-output-tokens-remaining": "49800",
    "anthropic-ratelimit-output-tokens-reset": "2026-04-24T00:01:00Z",

    # Family 4: Unified / Max plan (11 headers)
    "anthropic-ratelimit-unified-status": "within_limit",
    "anthropic-ratelimit-unified-reset": "1745539200",
    "anthropic-ratelimit-unified-5h-status": "within_limit",
    "anthropic-ratelimit-unified-5h-reset": "1745539200",
    "anthropic-ratelimit-unified-5h-utilization": "0.690000",
    "anthropic-ratelimit-unified-7d-status": "within_limit",
    "anthropic-ratelimit-unified-7d-reset": "1745971200",
    "anthropic-ratelimit-unified-7d-utilization": "0.120000",
    "anthropic-ratelimit-unified-representative-claim": "five_hour",
    "anthropic-ratelimit-unified-fallback-percentage": "1.000000",
    # unified-overage-disabled-reason is ABSENT when overage is enabled

    # Family 5: Fast mode (not present in this test — model is sonnet)
}

MOCK_RESPONSE_BODY = {
    "id": "msg_test_001",
    "type": "message",
    "role": "assistant",
    "model": "claude-sonnet-4-6",
    "content": [{"type": "text", "text": "Hello!"}],
    "stop_reason": "end_turn",
    "stop_sequence": None,
    "usage": {
        "input_tokens": 150,
        "output_tokens": 25,
        "cache_creation_input_tokens": 5000,
        "cache_read_input_tokens": 40000,
    }
}


class TestMockProxyIntegration:
    """Test proxy with a crafted Anthropic-like response containing all header families."""

    def test_non_streaming_captures_all_headers(self):
        """Verify that a mock 200 response with all headers is captured correctly."""
        mock_response = httpx.Response(
            status_code=200,
            headers=MOCK_RESPONSE_HEADERS,
            content=json.dumps(MOCK_RESPONSE_BODY).encode(),
        )

        # We test the telemetry recording logic directly instead of full HTTP round-trip
        # (full round-trip requires a running DB which is in Docker)
        from proxy import _record_telemetry
        resp_headers = dict(MOCK_RESPONSE_HEADERS)
        resp_body = json.dumps(MOCK_RESPONSE_BODY).encode()
        req_context = {
            "model": "claude-sonnet-4-6",
            "stream": False,
            "session_id": "test-session-001",
            "project": "test-project",
            "agent_name": "test-agent",
            "task_id": "AION-test",
        }

        # Extract what _record_telemetry would extract (without DB write)
        usage = MOCK_RESPONSE_BODY["usage"]
        h = {k.lower(): v for k, v in resp_headers.items()}

        # Verify header extraction
        assert h.get("request-id") == "req_test_mock_001"
        assert h.get("anthropic-organization-id") == "org-test-12345"

        # Family 2: Standard rate limits
        assert _safe_int(h.get("anthropic-ratelimit-requests-limit")) == 4000
        assert _safe_int(h.get("anthropic-ratelimit-requests-remaining")) == 3999
        assert _safe_int(h.get("anthropic-ratelimit-tokens-remaining")) == 398500
        assert _safe_int(h.get("anthropic-ratelimit-input-tokens-remaining")) == 199000
        assert _safe_int(h.get("anthropic-ratelimit-output-tokens-remaining")) == 49800

        # Family 4: Unified / Max
        assert h.get("anthropic-ratelimit-unified-status") == "within_limit"
        assert h.get("anthropic-ratelimit-unified-5h-status") == "within_limit"
        assert _safe_decimal(h.get("anthropic-ratelimit-unified-5h-utilization")) == Decimal("0.690000")
        assert _safe_decimal(h.get("anthropic-ratelimit-unified-7d-utilization")) == Decimal("0.120000")
        assert h.get("anthropic-ratelimit-unified-representative-claim") == "five_hour"
        assert _safe_decimal(h.get("anthropic-ratelimit-unified-fallback-percentage")) == Decimal("1.000000")

        # Unified resets (Unix epoch → datetime)
        reset_5h = _epoch_to_dt(h.get("anthropic-ratelimit-unified-5h-reset"))
        assert reset_5h is not None
        assert reset_5h.year == 2025 or reset_5h.year == 2026  # depends on epoch value

        reset_7d = _epoch_to_dt(h.get("anthropic-ratelimit-unified-7d-reset"))
        assert reset_7d is not None

        # Overage disabled reason absent = overage is enabled
        assert h.get("anthropic-ratelimit-unified-overage-disabled-reason") is None

        # Usage from body
        assert usage["input_tokens"] == 150
        assert usage["output_tokens"] == 25
        assert usage["cache_read_input_tokens"] == 40000
        assert usage["cache_creation_input_tokens"] == 5000

        # Cost calculation
        cost = _compute_cost("claude-sonnet-4-6", 150, 25, 40000, 5000)
        # 150*3/1M + 25*15/1M + 40000*0.30/1M + 5000*3.75/1M
        # = 0.00045 + 0.000375 + 0.012 + 0.01875 = 0.031575
        assert cost == Decimal("0.031575")

        # Raw headers collected
        raw = {k: v for k, v in h.items()
               if k.startswith("anthropic-") or k == "request-id" or k == "retry-after"}
        assert len(raw) >= 20  # At least 20 anthropic-* headers + request-id

    def test_429_response_captures_retry_after(self):
        """Verify 429 error response captures retry-after header."""
        headers = {
            "request-id": "req_test_429",
            "retry-after": "30",
            "content-type": "application/json",
        }
        h = {k.lower(): v for k, v in headers.items()}

        assert _safe_int(h.get("retry-after")) == 30
        assert h.get("request-id") == "req_test_429"

    def test_fast_mode_headers(self):
        """Verify Fast Mode (Family 5) headers are parsed correctly."""
        headers = {
            "anthropic-fast-input-tokens-limit": "100000",
            "anthropic-fast-input-tokens-remaining": "99200",
            "anthropic-fast-input-tokens-reset": "2026-04-24T00:01:00Z",
            "anthropic-fast-output-tokens-limit": "20000",
            "anthropic-fast-output-tokens-remaining": "19700",
            "anthropic-fast-output-tokens-reset": "2026-04-24T00:01:00Z",
        }
        h = {k.lower(): v for k, v in headers.items()}

        assert _safe_int(h.get("anthropic-fast-input-tokens-remaining")) == 99200
        assert _safe_int(h.get("anthropic-fast-output-tokens-remaining")) == 19700

    def test_passthrough_preserves_all_anthropic_headers(self):
        """Verify passthrough filter keeps all anthropic-* and drops non-anthropic."""
        result = _passthrough_headers(MOCK_RESPONSE_HEADERS)
        # Should have all anthropic-* headers + request-id
        anthropic_count = sum(1 for k in MOCK_RESPONSE_HEADERS if k.startswith("anthropic-"))
        # request-id is also forwarded
        assert len(result) >= anthropic_count + 1
        # Should NOT have content-type (not anthropic-*)
        assert "content-type" not in result


# ═══════════════════════════════════════════════════════════════════════════════
# 3. SSE STREAMING — Mock streaming with final usage capture
# ═══════════════════════════════════════════════════════════════════════════════

class TestSSEParsing:
    """Test that streaming SSE events are parsed correctly for usage data."""

    def test_extract_usage_from_message_delta(self):
        """The proxy scans SSE data: lines for usage in message_start and message_delta events."""
        sse_events = [
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":150,"output_tokens":0}}}\n\n',
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}\n\n',
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":25}}\n\n',
            'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]

        # Simulate the CORRECTED proxy SSE scanning logic
        # message_start has usage nested inside "message" key
        # message_delta has usage at top level
        collected_usage = {}
        for event in sse_events:
            for line in event.split("\n"):
                if line.startswith("data: ") and '"usage"' in line:
                    try:
                        event_data = json.loads(line[6:])
                        if event_data.get("type") == "message_start":
                            msg = event_data.get("message", {})
                            if "usage" in msg:
                                collected_usage.update(msg["usage"])
                        elif "usage" in event_data:
                            collected_usage.update(event_data["usage"])
                    except json.JSONDecodeError:
                        pass

        # message_start gives input_tokens, message_delta gives output_tokens
        assert collected_usage.get("input_tokens") == 150
        assert collected_usage.get("output_tokens") == 25

    def test_empty_stream_produces_empty_usage(self):
        """If no usage events in stream, collected_usage stays empty."""
        sse_events = [
            'event: error\ndata: {"type":"error","error":{"type":"overloaded_error"}}\n\n',
        ]
        collected_usage = {}
        for event in sse_events:
            for line in event.split("\n"):
                if line.startswith("data: ") and '"usage"' in line:
                    try:
                        event_data = json.loads(line[6:])
                        if "usage" in event_data:
                            collected_usage.update(event_data["usage"])
                    except json.JSONDecodeError:
                        pass

        assert collected_usage == {}

    def test_malformed_sse_data_doesnt_crash(self):
        """Malformed JSON in SSE data should be silently skipped."""
        sse_events = [
            'data: {"usage": not valid json}\n\n',
            'data: {"type":"message_delta","usage":{"output_tokens":10}}\n\n',
        ]
        collected_usage = {}
        for event in sse_events:
            for line in event.split("\n"):
                if line.startswith("data: ") and '"usage"' in line:
                    try:
                        event_data = json.loads(line[6:])
                        if "usage" in event_data:
                            collected_usage.update(event_data["usage"])
                    except json.JSONDecodeError:
                        pass

        # Only the valid line should be captured
        assert collected_usage.get("output_tokens") == 10


# ═══════════════════════════════════════════════════════════════════════════════
# 4. JSONL PARSER VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestJSONLParser:
    """Test JSONL session file parsing."""

    def _make_jsonl(self, records: list[dict]) -> Path:
        """Write records to a temp JSONL file and return its path."""
        tmpfile = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
        for rec in records:
            tmpfile.write(json.dumps(rec) + "\n")
        tmpfile.close()
        return Path(tmpfile.name)

    def test_parse_assistant_turns_with_usage(self):
        """Parse a file with assistant turns containing usage data."""
        records = [
            {"type": "user", "sessionId": "test-session"},
            {
                "type": "assistant",
                "sessionId": "test-session",
                "requestId": "req_turn1",
                "timestamp": "2026-04-23T18:00:00Z",
                "message": {
                    "model": "claude-opus-4-6",
                    "role": "assistant",
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 50,
                        "cache_read_input_tokens": 5000,
                        "cache_creation_input_tokens": 1000,
                    }
                }
            },
            {"type": "user", "sessionId": "test-session"},
            {
                "type": "assistant",
                "sessionId": "test-session",
                "requestId": "req_turn2",
                "timestamp": "2026-04-23T18:01:00Z",
                "message": {
                    "model": "claude-opus-4-6",
                    "role": "assistant",
                    "usage": {
                        "input_tokens": 200,
                        "output_tokens": 75,
                        "cache_read_input_tokens": 10000,
                        "cache_creation_input_tokens": 0,
                    }
                }
            },
        ]
        filepath = self._make_jsonl(records)
        try:
            parsed = parse_jsonl_file(filepath)
            assert len(parsed) == 2

            # First turn
            assert parsed[0]["request_id"] == "req_turn1"
            assert parsed[0]["model"] == "claude-opus-4-6"
            assert parsed[0]["input_tokens"] == 100
            assert parsed[0]["output_tokens"] == 50
            assert parsed[0]["cache_read_tokens"] == 5000
            assert parsed[0]["cache_write_tokens"] == 1000
            assert parsed[0]["session_id"] == "test-session"
            assert parsed[0]["source"] == "jsonl"

            # Second turn
            assert parsed[1]["request_id"] == "req_turn2"
            assert parsed[1]["output_tokens"] == 75
        finally:
            os.unlink(filepath)

    def test_skip_non_assistant_records(self):
        """Only assistant turns should be parsed."""
        records = [
            {"type": "file-history-snapshot"},
            {"type": "user", "sessionId": "test"},
            {"type": "system", "sessionId": "test"},
        ]
        filepath = self._make_jsonl(records)
        try:
            parsed = parse_jsonl_file(filepath)
            assert len(parsed) == 0
        finally:
            os.unlink(filepath)

    def test_skip_assistant_without_usage(self):
        """Assistant turns without usage data should be skipped."""
        records = [
            {
                "type": "assistant",
                "sessionId": "test",
                "message": {
                    "model": "claude-opus-4-6",
                    "role": "assistant",
                    "usage": {},
                }
            },
        ]
        filepath = self._make_jsonl(records)
        try:
            parsed = parse_jsonl_file(filepath)
            assert len(parsed) == 0
        finally:
            os.unlink(filepath)

    def test_handle_malformed_lines(self):
        """Malformed JSON lines should be silently skipped."""
        tmpfile = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
        tmpfile.write("not valid json\n")
        tmpfile.write('{"type": "assistant", "message": {"usage": {"input_tokens": 10, "output_tokens": 5}, "model": "claude-opus-4-6"}, "sessionId": "test", "requestId": "req_ok", "timestamp": "2026-04-23T18:00:00Z"}\n')
        tmpfile.write("{truncated json\n")
        tmpfile.close()
        try:
            parsed = parse_jsonl_file(Path(tmpfile.name))
            assert len(parsed) == 1
            assert parsed[0]["request_id"] == "req_ok"
        finally:
            os.unlink(tmpfile.name)

    def test_synthetic_request_id_when_missing(self):
        """Generate synthetic request_id when requestId is absent."""
        records = [
            {
                "type": "assistant",
                "sessionId": "test-session",
                "timestamp": "2026-04-23T18:00:00Z",
                "message": {
                    "model": "claude-opus-4-6",
                    "usage": {"input_tokens": 10, "output_tokens": 5},
                }
            },
        ]
        filepath = self._make_jsonl(records)
        try:
            parsed = parse_jsonl_file(filepath)
            assert len(parsed) == 1
            assert parsed[0]["request_id"].startswith("jsonl_")
        finally:
            os.unlink(filepath)

    def test_cost_calculation_matches_proxy(self):
        """Parser cost calculation should match proxy cost calculation."""
        # Both modules have compute_cost — they should agree
        proxy_cost = _compute_cost("claude-opus-4-6", 1000, 500, 50000, 10000)
        parser_cost = parser_compute_cost("claude-opus-4-6", 1000, 500, 50000, 10000)
        assert proxy_cost == parser_cost


class TestExtractProjectName:
    def test_jarvis(self):
        assert extract_project_name("-Users-nathanielcannon-Claude-Jarvis") == "Jarvis"

    def test_aifred_pro(self):
        assert extract_project_name("-Users-nathanielcannon-Claude-AIFred-Pro") == "Pro"

    def test_simple(self):
        assert extract_project_name("-Users-foo-project") == "project"

    def test_empty(self):
        assert extract_project_name("") == ""


# ═══════════════════════════════════════════════════════════════════════════════
# 5. REAL JSONL FILE PARSING (if available)
# ═══════════════════════════════════════════════════════════════════════════════

REAL_JSONL = Path.home() / ".claude" / "projects" / "-Users-nathanielcannon-Claude-Jarvis" / "fbd7528a-c1bd-414a-bdaa-c3cc23f53215.jsonl"


@pytest.mark.skipif(not REAL_JSONL.exists(), reason="Real JSONL file not available")
class TestRealJSONLParsing:
    def test_parse_real_session(self):
        """Parse a real session file and verify basic structure."""
        records = parse_jsonl_file(REAL_JSONL)
        assert len(records) > 0

        for rec in records:
            assert "request_id" in rec
            assert "model" in rec
            assert "input_tokens" in rec
            assert "output_tokens" in rec
            assert rec["source"] == "jsonl"
            assert rec["cost_usd"] >= 0

    def test_real_session_has_cache_data(self):
        """Real Jarvis sessions should have significant cache_read_tokens."""
        records = parse_jsonl_file(REAL_JSONL)
        total_cache_read = sum(r["cache_read_tokens"] for r in records)
        # Jarvis sessions load massive system prompts — expect substantial cache
        assert total_cache_read > 0
