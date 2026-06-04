#!/usr/bin/env python3
"""Tests for Pulse Maximal enforcement — dimension schema, auto-init, validation, guarded transitions."""
import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.modules["asyncpg"] = MagicMock()
sys.modules["httpx"] = MagicMock()
sys.modules["yaml"] = MagicMock()
sys.modules["fastapi"] = MagicMock()
sys.modules["fastapi.responses"] = MagicMock()


class TestDimensionSchema(unittest.TestCase):
    """Change 1: Pipeline dimensions schema is complete and correct."""

    def setUp(self):
        from app import PIPELINE_DIMENSIONS, DEFAULT_PIPELINE_LABELS
        self.dims = PIPELINE_DIMENSIONS
        self.defaults = DEFAULT_PIPELINE_LABELS

    def test_six_dimensions_defined(self):
        self.assertEqual(len(self.dims), 6)
        expected = {"staging", "evaluated", "queued", "active", "completed", "blocked"}
        self.assertEqual(set(self.dims.keys()), expected)

    def test_defaults_cover_all_dimensions(self):
        self.assertEqual(len(self.defaults), 6)
        dims_in_defaults = {l.split(":")[0] for l in self.defaults}
        self.assertEqual(dims_in_defaults, set(self.dims.keys()))

    def test_default_values_are_valid(self):
        for dim, spec in self.dims.items():
            self.assertIn(spec["default"], spec["values"],
                          f"Default '{spec['default']}' not in valid values for {dim}")

    def test_staging_has_processing_state(self):
        self.assertIn("processing", self.dims["staging"]["values"])

    def test_active_has_claiming_state(self):
        self.assertIn("claiming", self.dims["active"]["values"])

    def test_completed_has_reviewing_state(self):
        self.assertIn("reviewing", self.dims["completed"]["values"])


class TestParseDimensionLabel(unittest.TestCase):
    """Change 1: parse_dimension_label correctly identifies dimension labels."""

    def setUp(self):
        from app import parse_dimension_label
        self.parse = parse_dimension_label

    def test_valid_dimension_label(self):
        self.assertEqual(self.parse("staging:wait"), ("staging", "wait"))
        self.assertEqual(self.parse("active:running"), ("active", "running"))

    def test_non_dimension_label(self):
        self.assertIsNone(self.parse("type:bug"))
        self.assertIsNone(self.parse("project:dashboard"))
        self.assertIsNone(self.parse("assigned:autofix-executor"))

    def test_no_colon(self):
        self.assertIsNone(self.parse("parked"))
        self.assertIsNone(self.parse("nolabel"))

    def test_empty_string(self):
        self.assertIsNone(self.parse(""))


class TestValidateDimensionLabel(unittest.TestCase):
    """Change 1: validate_dimension_label catches invalid values."""

    def setUp(self):
        from app import validate_dimension_label
        self.validate = validate_dimension_label

    def test_valid_label_returns_none(self):
        self.assertIsNone(self.validate("staging:wait"))
        self.assertIsNone(self.validate("staging:done"))
        self.assertIsNone(self.validate("active:running"))

    def test_invalid_value_returns_error(self):
        err = self.validate("staging:invalid")
        self.assertIsNotNone(err)
        self.assertIn("Invalid value", err)

    def test_non_dimension_always_valid(self):
        self.assertIsNone(self.validate("type:bug"))
        self.assertIsNone(self.validate("project:anything"))
        self.assertIsNone(self.validate("random:stuff"))

    def test_transient_states_valid(self):
        self.assertIsNone(self.validate("staging:processing"))
        self.assertIsNone(self.validate("active:claiming"))
        self.assertIsNone(self.validate("completed:reviewing"))
        self.assertIsNone(self.validate("evaluated:processing"))


class TestEnforceDimensionUniqueness(unittest.TestCase):
    """Change 3: enforce_dimension_uniqueness removes conflicting labels."""

    def setUp(self):
        from app import enforce_dimension_uniqueness
        self.enforce = enforce_dimension_uniqueness

    def test_removes_same_dimension(self):
        labels = ["staging:wait", "evaluated:no", "type:bug"]
        result = self.enforce(labels, "staging:done")
        self.assertNotIn("staging:wait", result)
        self.assertIn("evaluated:no", result)
        self.assertIn("type:bug", result)

    def test_non_dimension_label_passes_through(self):
        labels = ["staging:wait", "type:bug"]
        result = self.enforce(labels, "type:feature")
        self.assertIn("staging:wait", result)
        self.assertIn("type:bug", result)

    def test_multiple_in_same_dimension_all_removed(self):
        labels = ["staging:wait", "staging:processing", "evaluated:no"]
        result = self.enforce(labels, "staging:done")
        staging_labels = [l for l in result if l.startswith("staging:")]
        self.assertEqual(len(staging_labels), 0)


class TestGuardedTransitions(unittest.TestCase):
    """Change 4: v2 transitions have precondition guards."""

    def setUp(self):
        from app import TRANSITIONS
        self.trans = TRANSITIONS

    def test_v2_stage_done_requires_processing(self):
        self.assertIn("staging:processing", self.trans["v2-stage-done"]["requires"])

    def test_v2_evaluate_done_requires_processing(self):
        self.assertIn("evaluated:processing", self.trans["v2-evaluate-done"]["requires"])

    def test_v2_execute_start_requires_claiming(self):
        self.assertIn("active:claiming", self.trans["v2-execute-start"]["requires"])

    def test_v2_review_pass_requires_reviewing(self):
        self.assertIn("completed:reviewing", self.trans["v2-review-pass"]["requires"])

    def test_v2_unblock_requires_blocked(self):
        self.assertIn("blocked:yes", self.trans["v2-unblock"]["requires"])

    def test_v2_reset_has_no_requires(self):
        self.assertNotIn("requires", self.trans["v2-reset-to-staging"])

    def test_v1_transitions_have_no_requires(self):
        for name in ["approve", "modify", "pause", "claim", "complete", "executor-fail"]:
            self.assertNotIn("requires", self.trans[name],
                             f"v1 transition '{name}' should not have requires")


class TestV1Deprecated(unittest.TestCase):
    """Change 8: v1 transitions are marked deprecated."""

    def setUp(self):
        from app import V1_DEPRECATED_TRANSITIONS
        self.deprecated = V1_DEPRECATED_TRANSITIONS

    def test_all_v1_marked(self):
        expected = {"approve", "modify", "pause", "claim", "complete", "executor-fail"}
        self.assertEqual(self.deprecated, expected)


class TestAutoInitLabels(unittest.TestCase):
    """Change 2: Task creation logic produces correct default labels."""

    def setUp(self):
        from app import DEFAULT_PIPELINE_LABELS, parse_dimension_label, validate_dimension_label
        self.defaults = DEFAULT_PIPELINE_LABELS
        self.parse = parse_dimension_label
        self.validate = validate_dimension_label

    def test_simulated_create_no_caller_labels(self):
        caller_labels = []
        labels = list(self.defaults)
        for cl in caller_labels:
            err = self.validate(cl)
            self.assertIsNone(err)
        self.assertEqual(len(labels), 6)
        self.assertIn("staging:wait", labels)
        self.assertIn("blocked:no", labels)

    def test_simulated_create_with_dimension_override(self):
        caller_labels = ["staging:done", "type:bug"]
        labels = list(self.defaults)
        for cl in caller_labels:
            err = self.validate(cl)
            self.assertIsNone(err)
            parsed = self.parse(cl)
            if parsed:
                dim, _ = parsed
                labels = [l for l in labels if not l.startswith(f"{dim}:")]
            if cl not in labels:
                labels.append(cl)
        self.assertIn("staging:done", labels)
        self.assertNotIn("staging:wait", labels)
        self.assertIn("type:bug", labels)
        self.assertEqual(len([l for l in labels if l.startswith("staging:")]), 1)

    def test_simulated_create_rejects_invalid_dimension_value(self):
        err = self.validate("staging:nonexistent")
        self.assertIsNotNone(err)


if __name__ == "__main__":
    unittest.main()
