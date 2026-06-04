"""
Phase 2/3 Test Suite — Token-based Pulse Usage Endpoints

Integration tests against the live aifred-dev-pulse container at :8800.
Validates the 4 refactored /api/v1/usage/* endpoints.

All endpoints source data ONLY from proxy-captured Anthropic API headers.
With no proxy traffic routed, all should return 'no_proxy_data' status.

"Session" = Anthropic's 5h rolling window, NOT Claude Code session.

Requires: aifred-dev-pulse running on port 8800.
Run:  pytest test_usage_endpoints.py -v
"""

import httpx
import pytest

BASE = "http://localhost:8800/api/v1/usage"


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE, timeout=10) as c:
        yield c


# ═══════════════════════════════════════════════════════════════════════════════
# 1. SESSION WINDOW (Anthropic 5h/7d rolling windows)
# ═══════════════════════════════════════════════════════════════════════════════

class TestSessionWindow:
    def test_returns_200(self, client):
        r = client.get("/session-window")
        assert r.status_code == 200

    def test_no_proxy_data_state(self, client):
        """Without proxy traffic, should return no_proxy_data."""
        d = client.get("/session-window").json()
        # Either has real data OR shows no_proxy_data
        assert d.get("status") == "no_proxy_data" or "unified_status" in d

    def test_structure_when_no_data(self, client):
        d = client.get("/session-window").json()
        if d.get("status") == "no_proxy_data":
            assert "message" in d
            assert "proxy" in d["message"].lower()

    def test_no_dollar_references(self, client):
        d = client.get("/session-window").json()
        text = str(d)
        assert "cost" not in text.lower()
        assert "spend" not in text.lower()
        assert "budget" not in text.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SESSION TOKENS (token breakdown in current 5h window)
# ═══════════════════════════════════════════════════════════════════════════════

class TestSessionTokens:
    def test_returns_200(self, client):
        r = client.get("/session-tokens")
        assert r.status_code == 200

    def test_no_proxy_data_state(self, client):
        d = client.get("/session-tokens").json()
        assert d.get("status") == "no_proxy_data" or "tokens_spent" in d

    def test_token_fields_when_data_present(self, client):
        d = client.get("/session-tokens").json()
        if "tokens_spent" in d:
            assert "input_tokens" in d
            assert "output_tokens" in d
            assert "cache_read_tokens" in d
            assert "cache_write_tokens" in d
            assert "utilization" in d
            assert isinstance(d["tokens_spent"], int)

    def test_no_dollar_references(self, client):
        d = client.get("/session-tokens").json()
        text = str(d)
        assert "cost" not in text.lower()
        assert "usd" not in text.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 3. MODEL TOKENS (per-model token counts in 5h window)
# ═══════════════════════════════════════════════════════════════════════════════

class TestModelTokens:
    def test_returns_200(self, client):
        r = client.get("/model-tokens")
        assert r.status_code == 200

    def test_no_proxy_data_state(self, client):
        d = client.get("/model-tokens").json()
        assert d.get("status") == "no_proxy_data" or "models" in d

    def test_model_structure_when_data_present(self, client):
        d = client.get("/model-tokens").json()
        if "models" in d and d["models"]:
            model = d["models"][0]
            assert "model" in model
            assert "total_tokens" in model
            assert "input_tokens" in model
            assert "output_tokens" in model
            assert "request_count" in model

    def test_no_dollar_references(self, client):
        d = client.get("/model-tokens").json()
        text = str(d)
        assert "cost" not in text.lower()
        assert "usd" not in text.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 4. MESSAGE SIZES (per-request token sizes for histogram)
# ═══════════════════════════════════════════════════════════════════════════════

class TestMessageSizes:
    def test_returns_200(self, client):
        r = client.get("/message-sizes")
        assert r.status_code == 200

    def test_no_proxy_data_state(self, client):
        d = client.get("/message-sizes").json()
        assert d.get("status") == "no_proxy_data" or "messages" in d

    def test_message_structure_when_data_present(self, client):
        d = client.get("/message-sizes").json()
        if "messages" in d and d["messages"]:
            msg = d["messages"][0]
            assert "input_tokens" in msg
            assert "output_tokens" in msg
            assert "total_tokens" in msg
            assert "model" in msg
            assert "timestamp" in msg

    def test_max_message_tokens_present(self, client):
        d = client.get("/message-sizes").json()
        if "max_message_tokens" in d:
            assert isinstance(d["max_message_tokens"], int)

    def test_no_dollar_references(self, client):
        d = client.get("/message-sizes").json()
        text = str(d)
        assert "cost" not in text.lower()
        assert "usd" not in text.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 5. OLD ENDPOINTS REMOVED
# ═══════════════════════════════════════════════════════════════════════════════

class TestOldEndpointsRemoved:
    """Verify all dollar-based endpoints are gone."""

    @pytest.mark.parametrize("endpoint", [
        "/budget", "/burn-rate", "/current",
        "/daily", "/weekly", "/monthly",
        "/sessions", "/ingest",
    ])
    def test_old_endpoint_returns_404(self, endpoint):
        r = httpx.get(f"http://localhost:8800/api/v1/usage{endpoint}", timeout=5)
        assert r.status_code == 404, f"{endpoint} should be 404 but got {r.status_code}"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. REGRESSION — EXISTING PULSE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# 6. SESSION BUDGET HISTORY (Improvement #1 — per-window budget estimation)
# ═══════════════════════════════════════════════════════════════════════════════

class TestSessionBudgetHistory:
    def test_returns_200(self, client):
        r = client.get("/session-budget-history")
        assert r.status_code == 200

    def test_has_windows_array(self, client):
        d = client.get("/session-budget-history").json()
        assert "windows" in d
        assert "total_windows" in d
        assert isinstance(d["windows"], list)

    def test_window_structure_when_data_present(self, client):
        d = client.get("/session-budget-history").json()
        if d["windows"]:
            w = d["windows"][0]
            assert "window_reset" in w
            assert "first_request" in w
            assert "total_tokens" in w
            assert "final_utilization" in w
            assert "estimated_budget" in w
            assert "confidence_label" in w
            assert "day_of_week" in w
            assert "day_name" in w
            assert "hour_of_day" in w

    def test_confidence_labels_valid(self, client):
        d = client.get("/session-budget-history").json()
        valid = {"high", "medium", "low", "insufficient_data"}
        for w in d["windows"]:
            assert w["confidence_label"] in valid

    def test_day_of_week_valid(self, client):
        d = client.get("/session-budget-history").json()
        for w in d["windows"]:
            assert 0 <= w["day_of_week"] <= 6
            assert w["day_name"] in {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}

    def test_budget_positive_when_present(self, client):
        d = client.get("/session-budget-history").json()
        for w in d["windows"]:
            if w["estimated_budget"] is not None:
                assert w["estimated_budget"] > 0


# ═══════════════════════════════════════════════════════════════════════════════
# 7. WINDOW TRANSITIONS (Improvement #3 — reset boundary detection)
# ═══════════════════════════════════════════════════════════════════════════════

class TestWindowTransitions:
    def test_returns_200(self, client):
        r = client.get("/window-transitions")
        assert r.status_code == 200

    def test_has_transitions_array(self, client):
        d = client.get("/window-transitions").json()
        assert "transitions" in d
        assert "total_transitions" in d
        assert isinstance(d["transitions"], list)

    def test_transition_structure_when_data_present(self, client):
        d = client.get("/window-transitions").json()
        if d["transitions"]:
            t = d["transitions"][0]
            assert "transition_at" in t
            assert "new_window_reset" in t
            assert "old_window_final_util" in t
            assert "new_window_first_util" in t
            assert "utilization_drop" in t
            assert "gap_seconds" in t


# ═══════════════════════════════════════════════════════════════════════════════
# 8. BURN RATE CURVE (Improvement #4 — utilization over time per window)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBurnRateCurve:
    def test_returns_200(self, client):
        r = client.get("/burn-rate-curve")
        assert r.status_code == 200

    def test_has_windows_array(self, client):
        d = client.get("/burn-rate-curve").json()
        assert "windows" in d
        assert "total_windows" in d

    def test_window_has_points(self, client):
        d = client.get("/burn-rate-curve").json()
        if d["windows"]:
            w = d["windows"][0]
            assert "window_reset" in w
            assert "day_name" in w
            assert "points" in w
            assert isinstance(w["points"], list)

    def test_points_structure(self, client):
        d = client.get("/burn-rate-curve").json()
        if d["windows"] and d["windows"][0]["points"]:
            p = d["windows"][0]["points"][0]
            assert "elapsed_seconds" in p
            assert "utilization" in p
            assert "cumulative_tokens" in p
            assert "seq" in p

    def test_points_ordered_by_seq(self, client):
        d = client.get("/burn-rate-curve").json()
        if d["windows"]:
            for w in d["windows"]:
                seqs = [p["seq"] for p in w["points"]]
                assert seqs == sorted(seqs)

    def test_utilization_generally_increasing(self, client):
        """Utilization should trend upward, but may dip if concurrent sessions age out."""
        d = client.get("/burn-rate-curve").json()
        if d["windows"]:
            for w in d["windows"]:
                utils = [p["utilization"] for p in w["points"]]
                if len(utils) >= 2:
                    assert utils[-1] >= utils[0]  # end >= start


# ═══════════════════════════════════════════════════════════════════════════════
# 9. CACHE EFFECTIVENESS (Improvement #5)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheEffectiveness:
    def test_returns_200(self, client):
        r = client.get("/cache-effectiveness")
        assert r.status_code == 200

    def test_no_proxy_data_or_valid(self, client):
        d = client.get("/cache-effectiveness").json()
        assert d.get("status") == "no_proxy_data" or "overall_cache_hit_ratio" in d

    def test_structure_when_data_present(self, client):
        d = client.get("/cache-effectiveness").json()
        if "overall_cache_hit_ratio" in d:
            assert 0 <= d["overall_cache_hit_ratio"] <= 1
            assert "total_input_tokens" in d
            assert "total_cache_read_tokens" in d
            assert "estimated_savings_factor" in d
            assert "points" in d

    def test_points_have_rolling_avg(self, client):
        d = client.get("/cache-effectiveness").json()
        if "points" in d and d["points"]:
            p = d["points"][0]
            assert "cache_hit_ratio" in p
            assert "rolling_avg" in p
            assert "model" in p
            assert "timestamp" in p

    def test_savings_factor_positive(self, client):
        d = client.get("/cache-effectiveness").json()
        if "estimated_savings_factor" in d:
            assert d["estimated_savings_factor"] >= 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# 10. REJECTION EVENTS (Improvement #6 — 429 forensics)
# ═══════════════════════════════════════════════════════════════════════════════

class TestRejectionEvents:
    def test_returns_200(self, client):
        r = client.get("/rejection-events")
        assert r.status_code == 200

    def test_has_rejections_array(self, client):
        d = client.get("/rejection-events").json()
        assert "rejections" in d
        assert "near_misses" in d
        assert "total_rejections" in d
        assert "total_near_misses" in d

    def test_rejection_structure_when_data_present(self, client):
        d = client.get("/rejection-events").json()
        if d["rejections"]:
            r = d["rejections"][0]
            assert "timestamp" in r
            assert "model" in r
            assert "five_hour_utilization" in r
            assert "day_name" in r
            assert "hour_of_day" in r

    def test_near_miss_structure_when_data_present(self, client):
        d = client.get("/rejection-events").json()
        if d["near_misses"]:
            nm = d["near_misses"][0]
            assert "timestamp" in nm
            assert "utilization" in nm
            assert nm["utilization"] >= 0.8

    def test_counts_match_arrays(self, client):
        d = client.get("/rejection-events").json()
        assert d["total_rejections"] == len(d["rejections"])
        assert d["total_near_misses"] == len(d["near_misses"])


# ═══════════════════════════════════════════════════════════════════════════════
# 11. REGRESSION — EXISTING PULSE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestPulseRegression:
    def test_health_endpoint(self):
        r = httpx.get("http://localhost:8800/api/v1/health", timeout=5)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_tasks_endpoint(self):
        r = httpx.get("http://localhost:8800/api/v1/tasks", timeout=5)
        assert r.status_code == 200
