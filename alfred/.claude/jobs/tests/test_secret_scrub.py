#!/usr/bin/env python3
"""
Test suite for secret-scrub.py.

Run: python3 .claude/jobs/tests/test_secret_scrub.py

Verifies the scrub library correctly:
1. Catches all rule types (positive cases)
2. Doesn't false-positive on benign text (negative cases)
3. Produces correct REDACTED markers
4. Logs redactions to the audit JSONL
5. Handles edge cases (empty text, unicode, multiline, multiple secrets)

Created: 2026-04-08 as security-remediation-2026-04 T3.2 (AIProjects-v523)
"""
import json
import os
import sys
import tempfile
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

# Load the scrub module by absolute path (hyphenated filename can't be imported normally)
SCRUB_PATH = Path(__file__).parent.parent / "lib" / "secret-scrub.py"
secret_scrub = SourceFileLoader("secret_scrub", str(SCRUB_PATH)).load_module()


class TestSecretScrubPositive(unittest.TestCase):
    """Verify each rule fires on a known-good fake of its target type."""

    def _assert_caught(self, rule_name, sample):
        scrubbed, redactions = secret_scrub.scrub(sample, source="test")
        rules = [r["rule"] for r in redactions]
        self.assertIn(rule_name, rules,
                      f"Expected {rule_name} to fire on {sample[:60]}, got: {rules}")
        self.assertNotIn(sample, scrubbed,
                         f"Plaintext leaked through for {rule_name}")
        self.assertIn(f"[REDACTED:{rule_name}]", scrubbed)

    def test_anthropic_api_key(self):
        self._assert_caught("anthropic-api-key", "sk-ant-api03-" + "x" * 90)

    def test_openai_proj_key(self):
        self._assert_caught("openai-api-key-proj", "sk-proj-" + "a" * 130)

    def test_openai_classic_key(self):
        self._assert_caught("openai-api-key", "sk-" + "a" * 48)

    def test_github_pat_classic(self):
        # Real format: ghp_ + exactly 36 alphanumeric
        self._assert_caught("github-pat-classic", "ghp_" + "A" * 36)

    def test_github_pat_fine(self):
        self._assert_caught("github-pat-fine", "github_pat_" + "A" * 82)

    def test_gcp_api_key(self):
        # Real format: AIzaSy + 33 chars
        self._assert_caught("gcp-api-key", "AIzaSy" + "x" * 33)

    def test_slack_bot_token(self):
        self._assert_caught("slack-bot-token", "xoxb-123456-789-abcdefghijklmnopqrstuvwx")

    def test_brave_api_key(self):
        self._assert_caught("brave-api-key", "BSA" + "a" * 28)

    def test_aws_access_key(self):
        self._assert_caught("aws-access-key", "AKIAIOSFODNN7EXAMPLE")

    def test_telegram_bot_token(self):
        self._assert_caught("telegram-bot-token",
                            "8491249607:AAFXVFr3uqIcKtzqZ4IvScohaJZmO8dpvi4")

    def test_jwt(self):
        self._assert_caught("jwt",
                            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
                            "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ."
                            "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c")

    def test_resend_api_key(self):
        self._assert_caught("resend-api-key", "re_abc12345_" + "x" * 20)

    def test_secret_field_webhook(self):
        scrubbed, redactions = secret_scrub.scrub(
            "WEBHOOK_SECRET=ebbaafd30a9ed2631e90f8f90b68fef9e112ab622e9d039a",
            source="test"
        )
        self.assertEqual(len(redactions), 1)
        self.assertEqual(redactions[0]["rule"], "secret-field")
        self.assertIn("WEBHOOK_SECRET=[REDACTED:secret-field]", scrubbed)

    def test_secret_field_api_key(self):
        scrubbed, _ = secret_scrub.scrub(
            "API_KEY: 'abcdef0123456789xyz'", source="test"
        )
        self.assertIn("[REDACTED:secret-field]", scrubbed)

    def test_private_key_pem(self):
        sample = ("-----BEGIN RSA PRIVATE KEY-----\n"
                  + "ABCD" * 20 + "\n"
                  + "-----END RSA PRIVATE KEY-----")
        self._assert_caught("private-key-pem", sample)


class TestSecretScrubNegative(unittest.TestCase):
    """Benign text must not trigger any rule."""

    def _assert_clean(self, text):
        scrubbed, redactions = secret_scrub.scrub(text, source="test")
        self.assertEqual(len(redactions), 0,
                         f"False positive: {text[:60]} → {[r['rule'] for r in redactions]}")
        self.assertEqual(scrubbed, text)

    def test_plain_english(self):
        self._assert_clean("Hello world, this is a normal message.")

    def test_url_only(self):
        self._assert_clean("Visit https://example.com/api for docs")

    def test_short_hex_not_secret(self):
        self._assert_clean("commit hash: abc123def")

    def test_uuid_not_secret(self):
        # UUIDs have hyphens that break the alphanumeric runs in most rules
        self._assert_clean("uuid: 550e8400-e29b-41d4-a716-446655440000")

    def test_short_ghp_prefix_only(self):
        # Just the prefix, no full token, must not match
        self._assert_clean("the prefix is ghp_ followed by 36 chars")

    def test_partial_jwt(self):
        # Only one segment, missing the dot-separated structure
        self._assert_clean("eyJhbGciOiJIUzI1NiJ9 is a header")

    def test_code_with_short_strings(self):
        self._assert_clean('let x = "abc"; const y = "123";')


class TestMultipleSecrets(unittest.TestCase):
    """Multiple secrets in one text should all be caught."""

    def test_three_different_types(self):
        text = ("set TELEGRAM_BOT_TOKEN=8491249607:AAFXVFr3uqIcKtzqZ4IvScohaJZmO8dpvi4\n"
                "and ANTHROPIC_API_KEY=sk-ant-api03-" + "x" * 90 + "\n"
                "and ghp_" + "B" * 36)
        scrubbed, redactions = secret_scrub.scrub(text, source="test")
        rules = sorted({r["rule"] for r in redactions})
        self.assertIn("telegram-bot-token", rules)
        self.assertIn("anthropic-api-key", rules)
        self.assertIn("github-pat-classic", rules)
        self.assertNotIn("8491249607:AA", scrubbed)
        self.assertNotIn("sk-ant-api03-x", scrubbed)
        self.assertNotIn("ghp_BBB", scrubbed)


class TestEdgeCases(unittest.TestCase):
    def test_empty_string(self):
        scrubbed, redactions = secret_scrub.scrub("", source="test")
        self.assertEqual(scrubbed, "")
        self.assertEqual(redactions, [])

    def test_unicode_safe(self):
        text = "user 日本語 has key sk-ant-api03-" + "x" * 90 + " 完了"
        scrubbed, redactions = secret_scrub.scrub(text, source="test")
        self.assertEqual(len(redactions), 1)
        self.assertIn("日本語", scrubbed)
        self.assertIn("完了", scrubbed)


class TestAuditLog(unittest.TestCase):
    """Audit log writes should capture rule + length + masked prefix/suffix."""

    def test_audit_log_written(self):
        with tempfile.TemporaryDirectory() as td:
            os.environ["AIPROJECTS_ROOT"] = td
            text = "test " + "sk-ant-api03-" + "x" * 90
            secret_scrub.scrub(text, source="test:audit")

            log_path = Path(td) / ".claude" / "logs" / "secret-scrub.jsonl"
            self.assertTrue(log_path.exists())
            with open(log_path) as f:
                lines = f.readlines()
            self.assertGreater(len(lines), 0)
            entry = json.loads(lines[-1])
            self.assertEqual(entry["source"], "test:audit")
            self.assertEqual(entry["redaction_count"], 1)
            self.assertEqual(entry["redactions"][0]["rule"], "anthropic-api-key")
            self.assertEqual(entry["redactions"][0]["prefix"], "sk-a")
            # Audit log must NOT contain the full secret value
            for line in lines:
                self.assertNotIn("x" * 80, line,
                                 "Full secret value leaked into audit log")


if __name__ == "__main__":
    unittest.main(verbosity=2)
