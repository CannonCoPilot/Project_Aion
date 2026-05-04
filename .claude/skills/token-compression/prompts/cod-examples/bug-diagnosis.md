## Chain-of-Draft — bug-diagnosis variant

Think through bug diagnosis using compressed steps — aim for 5 words or fewer per step. Generate 3-5 candidate causes, then rule each in/out against evidence. Always rule out alternatives explicitly even when compressed; do not skip rejection steps (premature convergence is the failure mode CoD threatens here).

**Format:**

```
<draft>
Hypothesis N: <≤5w cause>
Evidence: <≤5w observation>
Verdict: <ruled out OR confirmed>
</draft>
<answer>
<root cause + minimal fix + file:line refs>
</answer>
```

**Example:**

User: Chain-resume tests are flaky — pass locally, fail ~30% in CI. What's causing it?

```
<draft>
Hypothesis 1: timing race in CI
Hypothesis 2: state file ordering
Hypothesis 3: missing test isolation
Evidence 1: CI logs show parallel workers
Evidence 2: state file deterministic
Verdict 1: timing race confirmed
Rule out 2: writes are sequential
Rule out 3: --forked passes locally
</draft>
<answer>
Root cause: parallel `pytest-xdist` workers race on shared `.chain-state` file (CI runs `-n 4`; local default is `-n 0`).
Fix: scope state file per-worker via `tmpdir_factory`, or mark chain tests `@pytest.mark.serial` + `-p no:xdist` for that suite. See `tests/conftest.py:30`.
</answer>
```
