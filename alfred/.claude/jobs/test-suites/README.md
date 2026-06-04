# Pipeline Test Suites

Reusable task sets for testing the Pulse-Nexus Pipeline v2.

## Active Suites

| Suite | Tasks | Purpose | Runtime |
|-------|-------|---------|---------|
| `gospel-synopsis.yaml` | 6 | Lightweight pipeline test — doc creation, merging, chain deps | ~15 min |

## Archive (Previous Test Runs)

| File | Tasks | Origin | Date |
|------|-------|--------|------|
| `archive/token-compression.yaml` | 34 | TC demo — 8 phases, 7+ personas, token compression skill design | 2026-04-29 |
| `archive/aifred-pro-dev.yaml` | 23 | E2E pipeline test — 7 targeted test scenarios | 2026-04-29 |
| `archive/unknown.yaml` | 12 | Stress test — 15 concurrent tasks, chain dependency validation | 2026-04-29 |

## Usage

```bash
# Import a suite to the Pulse dev board
python3 .claude/jobs/test-suites/import-suite.py gospel-synopsis.yaml

# Or with a custom Pulse URL
python3 .claude/jobs/test-suites/import-suite.py gospel-synopsis.yaml --pulse-url http://localhost:8700/api/v1
```

## Design Guidelines

- **Target 5-8 tasks** per suite for fast iteration (<15 min total)
- **Include chain dependencies** to test orchestrator ordering
- **Mix persona types** to test persona routing
- **Use verifiable outputs** (files that can be checked for existence/content)
- **No human input required** — all tasks must be fully autonomous
