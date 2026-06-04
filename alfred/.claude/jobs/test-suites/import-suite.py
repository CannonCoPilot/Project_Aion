#!/usr/bin/env python3
"""Import a test suite YAML into the Pulse dev board."""
import sys
from pathlib import Path

import requests
import yaml

PULSE_API = "http://localhost:8800/api/v1"


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <suite.yaml> [--pulse-url URL]")
        sys.exit(1)

    suite_path = Path(sys.argv[1])
    if not suite_path.exists():
        suite_path = Path(__file__).parent / sys.argv[1]

    pulse_url = PULSE_API
    if "--pulse-url" in sys.argv:
        idx = sys.argv.index("--pulse-url")
        pulse_url = sys.argv[idx + 1]

    with open(suite_path) as f:
        plan = yaml.safe_load(f)

    r = requests.post(f"{pulse_url}/projects/import", json={"yaml": plan}, timeout=10)
    r.raise_for_status()
    result = r.json()
    print(f"Imported {result.get('imported', 0)}/{result.get('total_tasks', 0)} tasks from {suite_path.name}")


if __name__ == "__main__":
    main()
