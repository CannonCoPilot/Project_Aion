#!/usr/bin/env python3
"""Unit test for the /api/v1/pipeline/chain-test endpoint."""
import asyncio
import os
import sys
import unittest
from unittest.mock import MagicMock

# Mock heavy dependencies before importing app — follows the same pattern as
# test_pulse_dimensions.py so the module can be imported without a live DB,
# asyncpg, or a running FastAPI server.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.modules["asyncpg"] = MagicMock()
sys.modules["httpx"] = MagicMock()
sys.modules["yaml"] = MagicMock()


def _run(coro):
    """Execute a coroutine synchronously (compatible with Python 3.10+)."""
    return asyncio.run(coro)


class TestChainTestEndpoint(unittest.TestCase):
    """Tests for the /api/v1/pipeline/chain-test route handler."""

    def setUp(self):
        from app import pipeline_chain_test
        self.handler = pipeline_chain_test

    def test_returns_http_200_equivalent_dict(self):
        """Handler should return a dict (FastAPI serialises to HTTP 200 JSON)."""
        result = _run(self.handler())
        self.assertIsInstance(result, dict)

    def test_chain_field_is_operational(self):
        """The 'chain' key must equal 'operational'."""
        result = _run(self.handler())
        self.assertEqual(result["chain"], "operational")

    def test_step_field_is_one(self):
        """The 'step' key must equal 1 (first step of the pipeline chain)."""
        result = _run(self.handler())
        self.assertEqual(result["step"], 1)

    def test_full_response_structure(self):
        """Full response must match the expected JSON payload exactly."""
        result = _run(self.handler())
        self.assertEqual(result, {"chain": "operational", "step": 1})

    def test_no_extra_keys(self):
        """Response should contain exactly the two documented keys."""
        result = _run(self.handler())
        self.assertEqual(set(result.keys()), {"chain", "step"})


if __name__ == "__main__":
    unittest.main()
