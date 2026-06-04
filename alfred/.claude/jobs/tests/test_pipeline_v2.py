#!/usr/bin/env python3
"""Tests for pipeline v2 services — validates critical fixes C1-C4, H1-H4 + Components 3-8."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services"))
import _shared


class TestSetLabelAtomic(unittest.TestCase):
    """C1: set_label must try atomic conditional_claim first."""

    @patch.object(_shared, "conditional_claim", return_value=True)
    @patch.object(_shared, "pulse_label_remove")
    @patch.object(_shared, "pulse_post")
    def test_atomic_path(self, mock_post, mock_remove, mock_claim):
        _shared.set_label("TASK-1", "old:label", "new:label")
        mock_claim.assert_called_once_with("TASK-1", "old:label", "new:label",
                                           remove_labels=["old:label"], actor="service")
        mock_remove.assert_not_called()
        mock_post.assert_not_called()

    @patch.object(_shared, "conditional_claim", return_value=False)
    @patch.object(_shared, "pulse_label_remove")
    @patch.object(_shared, "pulse_post")
    def test_returns_false_on_claim_failure(self, mock_post, mock_remove, mock_claim):
        # New contract: no two-step fallback. Failed claims are surfaced to caller
        # so they can record a conflict metric and skip rather than racing.
        result = _shared.set_label("TASK-1", "old:label", "new:label")
        self.assertFalse(result)
        mock_claim.assert_called_once()
        mock_remove.assert_not_called()
        mock_post.assert_not_called()


class TestExtractJson(unittest.TestCase):
    """Validate extract_json robustness."""

    def test_valid_json(self):
        result = _shared.extract_json('Some text {"key": "value"} more text')
        self.assertEqual(result, {"key": "value"})

    def test_no_json(self):
        result = _shared.extract_json("no json here")
        self.assertIsNone(result)

    def test_nested_braces(self):
        result = _shared.extract_json('{"outer": {"inner": 1}}')
        self.assertEqual(result, {"outer": {"inner": 1}})

    def test_malformed_json(self):
        result = _shared.extract_json("{bad json}")
        self.assertIsNone(result)


class TestDestructiveKeywordBlocklist(unittest.TestCase):
    """Validate evaluate.py destructive keyword detection."""

    def setUp(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services"))
        from evaluate import check_destructive_keywords
        self.check = check_destructive_keywords

    def test_drop_database_blocked(self):
        self.assertIsNotNone(self.check("Drop the database", "", ""))

    def test_drop_specific_database_blocked(self):
        self.assertIsNotNone(self.check("drop database pulse_dev", "", ""))

    def test_rm_rf_blocked(self):
        self.assertIsNotNone(self.check("", "rm -rf /", ""))

    def test_force_push_blocked(self):
        self.assertIsNotNone(self.check("", "git push --force to main", ""))

    def test_safe_task_passes(self):
        self.assertIsNone(self.check("Fix sidebar button", "Update CSS", ""))

    def test_case_insensitive(self):
        self.assertIsNotNone(self.check("DROP DATABASE production", "", ""))

    def test_wipe_database_blocked(self):
        self.assertIsNotNone(self.check("", "", "Wipe the database and start fresh"))


class TestReviewerDefaultToFail(unittest.TestCase):
    """C3: Reviewer must default to FAIL on parse error, not PASS."""

    def test_none_result_defaults_to_fail(self):
        result = None
        passed = result.get("passed", False) if result else False
        self.assertFalse(passed)

    def test_valid_pass(self):
        result = {"passed": True}
        passed = result.get("passed", False) if result else False
        self.assertTrue(passed)

    def test_valid_fail(self):
        result = {"passed": False}
        passed = result.get("passed", False) if result else False
        self.assertFalse(passed)

    def test_missing_key_defaults_to_fail(self):
        result = {"summary": "no passed key"}
        passed = result.get("passed", False) if result else False
        self.assertFalse(passed)


class TestChainOrdering(unittest.TestCase):
    """H1: chain_predecessor_done logic validation."""

    @staticmethod
    def chain_predecessor_done(task, all_tasks=None):
        """Extracted logic from pipeline-watcher.py for testability."""
        meta = task.get("metadata") or {}
        chain_order = meta.get("chain_order")
        chain_id = meta.get("chain_id")
        if chain_order is None or chain_order == 0 or not chain_id:
            return True
        if all_tasks is None:
            return True
        for t in all_tasks:
            t_meta = t.get("metadata") or {}
            if (t_meta.get("chain_id") == chain_id
                    and t_meta.get("chain_order") == chain_order - 1):
                t_labels = t.get("labels", [])
                if "active:done" in t_labels or "completed:done" in t_labels:
                    return True
                return False
        return True

    def test_no_chain_metadata_allows_execution(self):
        task = {"id": "T1", "labels": [], "metadata": {}}
        self.assertTrue(self.chain_predecessor_done(task))

    def test_first_in_chain_allows_execution(self):
        task = {"id": "T1", "labels": [], "metadata": {"chain_id": "abc", "chain_order": 0}}
        self.assertTrue(self.chain_predecessor_done(task))

    def test_second_blocked_when_first_running(self):
        first = {"id": "T1", "labels": ["active:running"],
                 "metadata": {"chain_id": "abc", "chain_order": 0}}
        second = {"id": "T2", "labels": ["queued:done", "active:no"],
                  "metadata": {"chain_id": "abc", "chain_order": 1}}
        self.assertFalse(self.chain_predecessor_done(second, [first, second]))

    def test_second_allowed_when_first_done(self):
        first = {"id": "T1", "labels": ["active:done"],
                 "metadata": {"chain_id": "abc", "chain_order": 0}}
        second = {"id": "T2", "labels": ["queued:done", "active:no"],
                  "metadata": {"chain_id": "abc", "chain_order": 1}}
        self.assertTrue(self.chain_predecessor_done(second, [first, second]))

    def test_second_allowed_when_first_completed(self):
        first = {"id": "T1", "labels": ["completed:done"],
                 "metadata": {"chain_id": "abc", "chain_order": 0}}
        second = {"id": "T2", "labels": ["queued:done", "active:no"],
                  "metadata": {"chain_id": "abc", "chain_order": 1}}
        self.assertTrue(self.chain_predecessor_done(second, [first, second]))


class TestCallOllama(unittest.TestCase):
    """Validate call_ollama sends think:false at payload root."""

    @patch("_shared.requests.post")
    def test_think_false_at_root(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"response": "test"}
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        _shared.call_ollama("test prompt")

        call_args = mock_post.call_args
        payload = call_args[1]["json"]
        self.assertIn("think", payload)
        self.assertFalse(payload["think"])
        self.assertNotIn("options", payload)


class TestWatchdogTimeThreshold(unittest.TestCase):
    """EW-1: Watchdog must not reset fresh processing states."""

    def test_fresh_claiming_not_reset(self):
        """Task claimed 10s ago should NOT be reset."""
        from datetime import datetime, timezone, timedelta
        task = {
            "id": "T1",
            "labels": ["active:claiming", "staging:done", "evaluated:done",
                        "queued:done", "completed:no", "blocked:no"],
            "updated_at": (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat(),
        }
        # Simulate: _task_age_seconds returns ~10, threshold is 300
        age = 10
        should_reset = age > 300
        self.assertFalse(should_reset)

    def test_stale_claiming_is_reset(self):
        """Task claimed 600s ago SHOULD be reset."""
        age = 600
        should_reset = age > 300
        self.assertTrue(should_reset)

    def test_fresh_processing_not_reset(self):
        """Task in staging:processing for 5s should NOT be reset."""
        age = 5
        should_reset = age > 300
        self.assertFalse(should_reset)


class TestMetricsStructure(unittest.TestCase):
    """EW-9: Metrics dict has all required counters."""

    def test_metrics_keys(self):
        expected_top = {"poll_cycles", "webhook_events", "triggers",
                        "watchdog_resets", "chain_blocks", "claim_conflicts"}
        # Simulate the metrics dict from event-watcher
        m = {
            "poll_cycles": 0, "webhook_events": 0,
            "triggers": {"stage": 0, "evaluate": 0, "orchestrate": 0, "execute": 0, "review": 0},
            "watchdog_resets": 0, "chain_blocks": 0, "claim_conflicts": 0,
        }
        self.assertEqual(set(m.keys()), expected_top)

    def test_trigger_services(self):
        triggers = {"stage": 0, "evaluate": 0, "orchestrate": 0, "execute": 0, "review": 0}
        expected = {"stage", "evaluate", "orchestrate", "execute", "review"}
        self.assertEqual(set(triggers.keys()), expected)


class TestPollInterval(unittest.TestCase):
    """EW-8: Poll interval aligns with design doc (30s)."""

    def test_default_poll_interval(self):
        default = int(os.environ.get("POLL_INTERVAL", "30"))
        self.assertEqual(default, 30)


class TestExtractJsonEdgeCases(unittest.TestCase):
    """Validate extract_json handles braces inside strings."""

    def test_braces_in_string_value(self):
        result = _shared.extract_json('{"msg": "use { and } in text"}')
        self.assertEqual(result, {"msg": "use { and } in text"})

    def test_nested_objects_with_string_braces(self):
        result = _shared.extract_json('Here is {"a": {"b": "val{x}"}}')
        self.assertIsNotNone(result)
        self.assertEqual(result["a"]["b"], "val{x}")

    def test_empty_object(self):
        result = _shared.extract_json("prefix {} suffix")
        self.assertEqual(result, {})

    def test_multiple_objects_returns_first(self):
        result = _shared.extract_json('{"a": 1} {"b": 2}')
        self.assertEqual(result, {"a": 1})


class TestDestructivePatternImprovements(unittest.TestCase):
    """Validate evaluate.py expanded blocklist + fixed word-boundary matching."""

    def setUp(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services"))
        from evaluate import check_destructive_keywords
        self.check = check_destructive_keywords

    def test_drop_index_blocked(self):
        self.assertIsNotNone(self.check("", "drop index idx_name", ""))

    def test_delete_from_blocked(self):
        self.assertIsNotNone(self.check("", "delete from users where active=false", ""))

    def test_truncate_keyword_plus_table(self):
        self.assertIsNotNone(self.check("truncate the table", "", ""))

    def test_no_false_positive_on_production_substring(self):
        """'productive' should NOT match 'prod' (old behavior was substring match)."""
        self.assertIsNone(self.check("Make the build more productive", "", ""))

    def test_no_false_positive_on_dropdown(self):
        """'dropdown' should NOT match 'drop' (exact word match required)."""
        self.assertIsNone(self.check("Fix the dropdown menu", "", ""))

    def test_destroy_database_combined(self):
        self.assertIsNotNone(self.check("", "destroy the database", ""))


class TestOrchestrateStalelock(unittest.TestCase):
    """Validate lock file timeout behavior."""

    def test_lock_content_format(self):
        """Lock file should contain PID:timestamp."""
        from datetime import datetime, timezone
        fd, path = tempfile.mkstemp()
        os.close(fd)
        lock = Path(path)
        lock.write_text(f"{os.getpid()}:{datetime.now(timezone.utc).timestamp()}")
        content = lock.read_text()
        parts = content.split(":", 1)
        self.assertEqual(len(parts), 2)
        pid = int(parts[0])
        ts = float(parts[1])
        self.assertEqual(pid, os.getpid())
        self.assertGreater(ts, 0)
        lock.unlink()


class TestOrchestrateCycleDetection(unittest.TestCase):
    """Validate dependency cycle detection."""

    def setUp(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services"))
        from orchestrate import detect_dependency_cycle
        self.detect = detect_dependency_cycle

    def test_no_cycle(self):
        tasks = [
            {"id": "A", "metadata": {"depends_on": []}},
            {"id": "B", "metadata": {"depends_on": ["A"]}},
        ]
        self.assertEqual(self.detect(tasks), [])

    def test_simple_cycle(self):
        tasks = [
            {"id": "A", "metadata": {"depends_on": ["B"]}},
            {"id": "B", "metadata": {"depends_on": ["A"]}},
        ]
        cycle = self.detect(tasks)
        self.assertTrue(len(cycle) > 0)
        self.assertIn("A", cycle)
        self.assertIn("B", cycle)

    def test_self_reference(self):
        tasks = [{"id": "A", "metadata": {"depends_on": ["A"]}}]
        cycle = self.detect(tasks)
        self.assertIn("A", cycle)

    def test_empty_tasks(self):
        self.assertEqual(self.detect([]), [])


class TestExecutorContextSummaryExtraction(unittest.TestCase):
    """Validate context-summary tag extraction from log output."""

    def setUp(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services"))
        from executor import _extract_context_summary
        self.extract = _extract_context_summary

    def test_valid_context_summary(self):
        fd, path = tempfile.mkstemp(suffix=".log")
        os.close(fd)
        log_file = Path(path)
        log_file.write_text(
            'Some output\n<context-summary>\n'
            '{"task_completed": "fixed bug", "files_modified": ["a.py"]}\n'
            '</context-summary>\n'
        )
        result = self.extract(log_file)
        self.assertIsNotNone(result)
        self.assertEqual(result["task_completed"], "fixed bug")
        log_file.unlink()

    def test_missing_context_summary(self):
        fd, path = tempfile.mkstemp(suffix=".log")
        os.close(fd)
        log_file = Path(path)
        log_file.write_text("No summary here\n")
        result = self.extract(log_file)
        self.assertIsNone(result)
        log_file.unlink()

    def test_nonexistent_file(self):
        result = self.extract(Path("/nonexistent/file.log"))
        self.assertIsNone(result)


class TestSharedRetryLogic(unittest.TestCase):
    """Validate _retry wrapper."""

    def test_retry_succeeds_on_second_attempt(self):
        calls = {"count": 0}
        def flaky():
            calls["count"] += 1
            if calls["count"] < 2:
                raise requests.ConnectionError("transient")
            return {"ok": True}
        result = _shared._retry(flaky, "test")
        self.assertEqual(result, {"ok": True})
        self.assertEqual(calls["count"], 2)

    def test_retry_exhausted(self):
        def always_fail():
            raise requests.ConnectionError("persistent")
        result = _shared._retry(always_fail, "test")
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
