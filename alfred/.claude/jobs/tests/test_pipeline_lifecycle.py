#!/usr/bin/env python3
"""
Integration tests for pipeline v2 full lifecycle.

Requires:
  - Pulse API running at localhost:8800
  - Ollama running at localhost:11434
  - Services accessible at ../services/

Run: python -m pytest .claude/jobs/tests/test_pipeline_lifecycle.py -v
"""
import json
import os
import subprocess
import sys
import time
import unittest
import uuid
from pathlib import Path

import requests

PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
SERVICES_DIR = Path(__file__).parent.parent / "services"
PROJECT_DIR = Path(__file__).parent.parent.parent.parent.resolve()

TEST_TIMEOUT = 60


def pulse_healthy() -> bool:
    try:
        r = requests.get(f"{PULSE_API}/health", timeout=3)
        return r.ok
    except Exception:
        return False


def ollama_healthy() -> bool:
    try:
        r = requests.get("http://localhost:11434/api/version", timeout=3)
        return r.ok
    except Exception:
        return False


def create_test_task(title: str, description: str = "", labels: list | None = None,
                     metadata: dict | None = None) -> str:
    payload = {
        "title": f"[TEST] {title}",
        "description": description or f"Automated test task: {title}",
        "priority": "medium",
        "labels": labels or ["staging:wait", "evaluated:no", "queued:no",
                              "active:no", "completed:no", "blocked:no",
                              "project:test", "phase:test"],
        "metadata": metadata or {},
        "actor": "test-harness",
    }
    r = requests.post(f"{PULSE_API}/tasks", json=payload, timeout=5)
    r.raise_for_status()
    return r.json()["id"]


def get_task(task_id: str) -> dict:
    r = requests.get(f"{PULSE_API}/tasks/{task_id}", timeout=5)
    r.raise_for_status()
    return r.json()


def close_task(task_id: str):
    try:
        requests.post(f"{PULSE_API}/tasks/{task_id}/close",
                      json={"notes": "test cleanup"}, timeout=5)
    except Exception:
        pass


def run_service(service_name: str, task_id: str, task: dict | None = None,
                timeout: int = TEST_TIMEOUT) -> subprocess.CompletedProcess:
    env = {
        **os.environ,
        "TASK_ID": task_id,
        "PULSE_API": PULSE_API,
        "PULSE_PORT": "8800",
        "PROJECT_DIR": str(PROJECT_DIR),
        "OLLAMA_URL": OLLAMA_URL,
    }
    if task:
        env["TASK_JSON"] = json.dumps(task)
    script = SERVICES_DIR / f"{service_name}.py"
    return subprocess.run(
        [sys.executable, str(script)],
        env=env, capture_output=True, text=True, timeout=timeout,
    )


def has_label(task: dict, label: str) -> bool:
    return label in task.get("labels", [])


def wait_for_label(task_id: str, label: str, timeout: int = TEST_TIMEOUT) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        task = get_task(task_id)
        if has_label(task, label):
            return task
        time.sleep(1)
    raise TimeoutError(f"Task {task_id} never reached label {label} within {timeout}s")


@unittest.skipUnless(pulse_healthy(), "Pulse API not available at localhost:8800")
class TestTaskCreation(unittest.TestCase):
    def setUp(self):
        self.task_ids = []

    def tearDown(self):
        for tid in self.task_ids:
            close_task(tid)

    def test_create_task_has_initial_labels(self):
        tid = create_test_task("Initial labels test")
        self.task_ids.append(tid)
        task = get_task(tid)
        self.assertTrue(has_label(task, "staging:wait"))
        self.assertTrue(has_label(task, "evaluated:no"))
        self.assertTrue(has_label(task, "queued:no"))
        self.assertTrue(has_label(task, "active:no"))
        self.assertTrue(has_label(task, "completed:no"))
        self.assertTrue(has_label(task, "blocked:no"))
        self.assertEqual(task["status"], "open")


@unittest.skipUnless(pulse_healthy() and ollama_healthy(),
                     "Pulse or Ollama not available")
class TestStageService(unittest.TestCase):
    def setUp(self):
        self.task_ids = []

    def tearDown(self):
        for tid in self.task_ids:
            close_task(tid)

    def test_stage_produces_structured_output(self):
        tid = create_test_task(
            "Write a health check script",
            description="Create a bash script that checks if Ollama is running and reports status."
        )
        self.task_ids.append(tid)

        # Claim staging:wait → staging:processing (mimics pipeline-watcher)
        requests.post(f"{PULSE_API}/tasks/{tid}/conditional-update", json={
            "precondition": {"label_value": "staging:wait"},
            "set_labels": ["staging:processing"],
            "remove_labels": ["staging:wait"],
            "actor": "test-harness",
        }, timeout=5)

        result = run_service("stage", tid)
        self.assertEqual(result.returncode, 0, f"stage.py failed: {result.stderr}")

        task = get_task(tid)
        self.assertTrue(has_label(task, "staging:done"),
                        f"Expected staging:done, got labels: {task['labels']}")
        meta = task.get("metadata", {})
        self.assertIn("stage_output", meta, "Missing stage_output in metadata")
        self.assertIn("staged_at", meta, "Missing staged_at timestamp")


@unittest.skipUnless(pulse_healthy() and ollama_healthy(),
                     "Pulse or Ollama not available")
class TestEvaluateService(unittest.TestCase):
    def setUp(self):
        self.task_ids = []

    def tearDown(self):
        for tid in self.task_ids:
            close_task(tid)

    def test_evaluate_assigns_persona_and_evaluates(self):
        tid = create_test_task(
            "Verify Ollama health endpoint",
            description="Check that localhost:11434/api/version returns a valid response.",
            labels=["staging:done", "evaluated:no", "queued:no", "active:no",
                    "completed:no", "blocked:no", "project:test", "phase:test"],
            metadata={"stage_output": {
                "structured_description": "Verify Ollama health endpoint responds correctly.",
                "expected_output": "Confirmation that Ollama API is reachable",
                "scope": "Read-only verification, no modifications",
                "file_paths": [],
                "suggested_type": "verify",
                "suggested_priority": "low",
            }},
        )
        self.task_ids.append(tid)

        requests.post(f"{PULSE_API}/tasks/{tid}/conditional-update", json={
            "precondition": {"label_value": "evaluated:no"},
            "set_labels": ["evaluated:processing"],
            "remove_labels": ["evaluated:no"],
            "actor": "test-harness",
        }, timeout=5)

        result = run_service("evaluate", tid, timeout=120)
        self.assertEqual(result.returncode, 0, f"evaluate.py failed: {result.stderr}")

        task = get_task(tid)
        self.assertTrue(has_label(task, "evaluated:done"),
                        f"Expected evaluated:done, got labels: {task['labels']}")
        assigned = [l for l in task["labels"] if l.startswith("assigned:")]
        self.assertTrue(len(assigned) > 0, "No assigned:persona label set")
        meta = task.get("metadata", {})
        self.assertIn("evaluate_output", meta, "Missing evaluate_output in metadata")


@unittest.skipUnless(pulse_healthy(), "Pulse API not available")
class TestOrchestrateService(unittest.TestCase):
    def setUp(self):
        self.task_ids = []

    def tearDown(self):
        for tid in self.task_ids:
            close_task(tid)

    def test_orchestrate_queues_standalone_task(self):
        tid = create_test_task(
            "Standalone orchestrate test",
            labels=["staging:done", "evaluated:done", "queued:no", "active:no",
                    "completed:no", "blocked:no", "project:test", "phase:test",
                    "assigned:test-reviewer"],
        )
        self.task_ids.append(tid)

        result = run_service("orchestrate", tid)
        self.assertEqual(result.returncode, 0, f"orchestrate.py failed: {result.stderr}")

        task = get_task(tid)
        self.assertTrue(has_label(task, "queued:done"),
                        f"Expected queued:done, got labels: {task['labels']}")
        meta = task.get("metadata", {})
        self.assertIn("chain_id", meta, "Missing chain_id in metadata")


@unittest.skipUnless(pulse_healthy() and ollama_healthy(),
                     "Pulse or Ollama not available")
class TestExecutorOllamaPath(unittest.TestCase):
    def setUp(self):
        self.task_ids = []

    def tearDown(self):
        for tid in self.task_ids:
            close_task(tid)

    def test_executor_ollama_completes(self):
        tid = create_test_task(
            "Ollama executor test",
            description="Say hello and confirm you are working.",
            labels=["staging:done", "evaluated:done", "queued:done", "active:no",
                    "completed:no", "blocked:no", "project:test", "phase:test",
                    "assigned:test-reviewer"],
            metadata={
                "model": "qwen3:8b",
                "stage_output": {
                    "structured_description": "Say hello and confirm you are working.",
                    "expected_output": "A greeting message.",
                    "scope": "No file changes.",
                    "file_paths": [],
                },
            },
        )
        self.task_ids.append(tid)

        requests.post(f"{PULSE_API}/tasks/{tid}/conditional-update", json={
            "precondition": {"label_value": "active:no"},
            "set_labels": ["active:claiming"],
            "remove_labels": ["active:no"],
            "actor": "test-harness",
        }, timeout=5)

        result = run_service("executor", tid, timeout=120)
        self.assertEqual(result.returncode, 0, f"executor.py failed: {result.stderr}")

        task = get_task(tid)
        self.assertTrue(has_label(task, "active:done"),
                        f"Expected active:done, got labels: {task['labels']}")
        meta = task.get("metadata", {})
        self.assertIn("executed_at", meta, "Missing executed_at")
        self.assertEqual(meta.get("executor_engine"), "ollama")


@unittest.skipUnless(pulse_healthy(), "Pulse API not available")
class TestLifecycleCircuitBreaker(unittest.TestCase):
    def setUp(self):
        self.task_ids = []

    def tearDown(self):
        for tid in self.task_ids:
            close_task(tid)

    def test_lifecycle_exhausted_blocks_permanently(self):
        """Verify diagnose.py blocks a task permanently when lifecycle_resets >= cap.

        NOTE: This test is sensitive to the live pipeline-watcher. If the watcher
        processes the task concurrently, labels may race. The test uses staging:done
        + evaluated:no + blocked:diagnosing which the watcher skips (blocked:diagnosing
        is an early-return in process_task).
        """
        tid = create_test_task(
            "Lifecycle breaker test",
            labels=["staging:done", "evaluated:no", "queued:no", "active:no",
                    "completed:no", "blocked:diagnosing", "project:test"],
            metadata={
                "lifecycle_resets": 3,
                "diagnose_attempts": 1,
                "review_output": {"passed": False, "summary": "test failure"},
            },
        )
        self.task_ids.append(tid)

        result = run_service("diagnose", tid, timeout=30)
        self.assertEqual(result.returncode, 0, f"diagnose.py failed: {result.stderr}")

        time.sleep(0.5)
        task = get_task(tid)
        self.assertTrue(
            has_label(task, "blocked:yes") or has_label(task, "reason:lifecycle-exhausted"),
            f"Expected blocked:yes or reason:lifecycle-exhausted, got labels: {task['labels']}"
        )


if __name__ == "__main__":
    unittest.main()
