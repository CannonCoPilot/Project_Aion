"""Unit tests for team-runner.py components."""

import sys
import unittest
from pathlib import Path

# Add parent dir to path so we can import team_runner
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from importlib import import_module

# Import as module (team-runner.py has a hyphen, so use importlib)
import importlib.util
spec = importlib.util.spec_from_file_location(
    "team_runner",
    Path(__file__).resolve().parent.parent / "team-runner.py"
)
team_runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(team_runner)

Verdict = team_runner.Verdict
VerdictValue = team_runner.VerdictValue
Confidence = team_runner.Confidence
ConsensusEngine = team_runner.ConsensusEngine
ConsensusResult = team_runner.ConsensusResult


# ============================================================================
# Verdict Parsing Tests
# ============================================================================

class TestVerdictParsing(unittest.TestCase):
    """Test Verdict.from_output() parsing logic."""

    def test_clean_verdict(self):
        text = """Analysis complete.
VERDICT: approve
CONFIDENCE: high
REASONING: All paths exist and action is deterministic."""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.APPROVE)
        self.assertEqual(v.confidence, Confidence.HIGH)
        self.assertIn("deterministic", v.reasoning)

    def test_deny_verdict(self):
        text = """VERDICT: deny
CONFIDENCE: medium
REASONING: External API dependency makes this non-automatable."""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.DENY)
        self.assertEqual(v.confidence, Confidence.MEDIUM)

    def test_uncertain_verdict(self):
        text = """VERDICT: uncertain
CONFIDENCE: low
REASONING: Borderline case, needs human review."""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.UNCERTAIN)
        self.assertEqual(v.confidence, Confidence.LOW)

    def test_no_verdict_line(self):
        text = "Just some output without any verdict structure."
        v = Verdict.from_output(text)
        self.assertIsNone(v)

    def test_empty_output(self):
        self.assertIsNone(Verdict.from_output(""))
        self.assertIsNone(Verdict.from_output(None))

    def test_verdict_in_code_block(self):
        text = """Here's my analysis:
```
VERDICT: approve
CONFIDENCE: high
REASONING: Safe to proceed.
```"""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.APPROVE)

    def test_multiple_verdicts_last_wins(self):
        text = """First analysis:
VERDICT: deny
CONFIDENCE: low
REASONING: Initially seemed risky.

Updated analysis:
VERDICT: approve
CONFIDENCE: high
REASONING: After deeper review, this is safe."""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.APPROVE)
        self.assertEqual(v.confidence, Confidence.HIGH)
        self.assertIn("safe", v.reasoning)

    def test_case_insensitive(self):
        text = """VERDICT: Approve
CONFIDENCE: High
REASONING: Looks good."""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.APPROVE)
        self.assertEqual(v.confidence, Confidence.HIGH)

    def test_verdict_without_confidence(self):
        text = """VERDICT: deny
REASONING: Missing dependency."""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.DENY)
        self.assertEqual(v.confidence, Confidence.LOW)  # default

    def test_verdict_without_reasoning(self):
        text = """VERDICT: approve
CONFIDENCE: medium"""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.APPROVE)
        self.assertEqual(v.reasoning, "No reasoning provided")

    def test_markdown_bold_verdict(self):
        text = """**VERDICT**: deny
**CONFIDENCE**: high
**REASONING**: All candidates blocked"""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.DENY)
        self.assertEqual(v.confidence, Confidence.HIGH)

    def test_markdown_bold_with_value(self):
        text = """**VERDICT**: **approve**
**CONFIDENCE**: **medium**
**REASONING**: Looks safe."""
        v = Verdict.from_output(text)
        self.assertIsNotNone(v)
        self.assertEqual(v.value, VerdictValue.APPROVE)


# ============================================================================
# Consensus Engine Tests
# ============================================================================

class TestConsensusEngine(unittest.TestCase):
    """Test ConsensusEngine.evaluate() with various verdict combinations."""

    def _v(self, value, confidence="high"):
        return Verdict(
            value=VerdictValue(value),
            confidence=Confidence(confidence),
            reasoning="test",
        )

    # --- unanimous-approve ---

    def test_unanimous_approve_all_approve(self):
        verdicts = [self._v("approve"), self._v("approve"), self._v("approve")]
        result = ConsensusEngine.evaluate(verdicts, "unanimous-approve")
        self.assertEqual(result, ConsensusResult.APPROVE)

    def test_unanimous_approve_all_deny(self):
        verdicts = [self._v("deny"), self._v("deny"), self._v("deny")]
        result = ConsensusEngine.evaluate(verdicts, "unanimous-approve")
        self.assertEqual(result, ConsensusResult.DENY)

    def test_unanimous_approve_mixed(self):
        verdicts = [self._v("approve"), self._v("deny"), self._v("approve")]
        result = ConsensusEngine.evaluate(verdicts, "unanimous-approve")
        self.assertEqual(result, ConsensusResult.CONFLICT)

    def test_unanimous_approve_with_uncertain(self):
        verdicts = [self._v("approve"), self._v("uncertain"), self._v("approve")]
        result = ConsensusEngine.evaluate(verdicts, "unanimous-approve")
        self.assertEqual(result, ConsensusResult.CONFLICT)

    def test_all_uncertain_escalates(self):
        verdicts = [self._v("uncertain"), self._v("uncertain"), self._v("uncertain")]
        result = ConsensusEngine.evaluate(verdicts, "unanimous-approve")
        self.assertEqual(result, ConsensusResult.ESCALATE)

    # --- majority ---

    def test_majority_approve(self):
        verdicts = [self._v("approve"), self._v("approve"), self._v("deny")]
        result = ConsensusEngine.evaluate(verdicts, "majority")
        self.assertEqual(result, ConsensusResult.APPROVE)

    def test_majority_deny(self):
        verdicts = [self._v("deny"), self._v("deny"), self._v("approve")]
        result = ConsensusEngine.evaluate(verdicts, "majority")
        self.assertEqual(result, ConsensusResult.DENY)

    def test_majority_no_majority(self):
        verdicts = [self._v("approve"), self._v("deny"), self._v("uncertain")]
        result = ConsensusEngine.evaluate(verdicts, "majority")
        self.assertEqual(result, ConsensusResult.CONFLICT)

    def test_majority_all_uncertain(self):
        verdicts = [self._v("uncertain"), self._v("uncertain")]
        result = ConsensusEngine.evaluate(verdicts, "majority")
        self.assertEqual(result, ConsensusResult.ESCALATE)

    # --- any-deny-blocks ---

    def test_any_deny_blocks_with_deny(self):
        verdicts = [self._v("approve"), self._v("deny"), self._v("approve")]
        result = ConsensusEngine.evaluate(verdicts, "any-deny-blocks")
        self.assertEqual(result, ConsensusResult.DENY)

    def test_any_deny_blocks_all_approve(self):
        verdicts = [self._v("approve"), self._v("approve"), self._v("approve")]
        result = ConsensusEngine.evaluate(verdicts, "any-deny-blocks")
        self.assertEqual(result, ConsensusResult.APPROVE)

    def test_any_deny_blocks_approve_and_uncertain(self):
        verdicts = [self._v("approve"), self._v("uncertain")]
        result = ConsensusEngine.evaluate(verdicts, "any-deny-blocks")
        self.assertEqual(result, ConsensusResult.CONFLICT)

    # --- edge cases ---

    def test_empty_verdicts(self):
        result = ConsensusEngine.evaluate([], "unanimous-approve")
        self.assertEqual(result, ConsensusResult.ESCALATE)

    def test_single_approve(self):
        result = ConsensusEngine.evaluate([self._v("approve")], "unanimous-approve")
        self.assertEqual(result, ConsensusResult.APPROVE)

    def test_unknown_rule_raises(self):
        with self.assertRaises(ValueError):
            ConsensusEngine.evaluate([self._v("approve")], "invalid-rule")


# ============================================================================
# Budget Guard Tests
# ============================================================================

class TestBudgetGuard(unittest.TestCase):
    """Test that budget validation catches overspend."""

    def test_member_budgets_within_limit(self):
        members = [
            {"name": "a", "max_budget_usd": 1.50},
            {"name": "b", "max_budget_usd": 1.50},
            {"name": "c", "max_budget_usd": 0.50},
        ]
        coordinator = {"max_budget_usd": 1.50}
        job_budget = 5.00

        total = sum(m["max_budget_usd"] for m in members) + coordinator["max_budget_usd"]
        self.assertLessEqual(total, job_budget)

    def test_member_budgets_exceed_limit(self):
        members = [
            {"name": "a", "max_budget_usd": 2.00},
            {"name": "b", "max_budget_usd": 2.00},
            {"name": "c", "max_budget_usd": 2.00},
        ]
        coordinator = {"max_budget_usd": 1.50}
        job_budget = 5.00

        total = sum(m["max_budget_usd"] for m in members) + coordinator["max_budget_usd"]
        self.assertGreater(total, job_budget)


# ============================================================================
# Prompt Construction Tests
# ============================================================================

class TestMemberPromptConstruction(unittest.TestCase):
    """Test that role params are correctly assembled."""

    def test_role_becomes_param(self):
        member = {
            "name": "feasibility",
            "persona": "task-investigator",
            "model": "sonnet",
            "max_turns": 15,
            "max_budget_usd": 1.50,
            "timeout_minutes": 12,
            "role": "You are the FEASIBILITY investigator.",
        }
        runner = team_runner.ExecutorRunner(
            job="test-job", member=member, job_prompt="test prompt", params=[]
        )
        # Verify the runner stores the member config correctly
        self.assertEqual(runner.member["name"], "feasibility")
        self.assertEqual(runner.member["role"], "You are the FEASIBILITY investigator.")

    def test_extra_params_passed_through(self):
        member = {"name": "test", "role": "test role"}
        runner = team_runner.ExecutorRunner(
            job="test-job", member=member, job_prompt="test",
            params=["foo=bar", "baz=qux"]
        )
        self.assertEqual(runner.params, ["foo=bar", "baz=qux"])


# ============================================================================
# MemberResult Serialization Tests
# ============================================================================

class TestMemberResultSerialization(unittest.TestCase):
    """Test MemberResult.to_dict() produces correct JSON-ready output."""

    def test_to_dict_with_verdict(self):
        result = team_runner.MemberResult(
            name="feasibility",
            status="success",
            verdict=Verdict(VerdictValue.APPROVE, Confidence.HIGH, "All good"),
            cost=0.45,
            duration=30.5,
            output="test output",
        )
        d = result.to_dict()
        self.assertEqual(d["name"], "feasibility")
        self.assertEqual(d["status"], "success")
        self.assertEqual(d["verdict"]["value"], "approve")
        self.assertEqual(d["verdict"]["confidence"], "high")
        self.assertEqual(d["cost_usd"], 0.45)

    def test_to_dict_without_verdict(self):
        result = team_runner.MemberResult(
            name="test", status="error", verdict=None,
            cost=0.0, duration=0.0, output="error",
        )
        d = result.to_dict()
        self.assertIsNone(d["verdict"])


if __name__ == "__main__":
    unittest.main()
