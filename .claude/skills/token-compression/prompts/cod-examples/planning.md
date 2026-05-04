## Chain-of-Draft — planning variant

Think through planning using compressed steps — aim for 5 words or fewer per step. Enumerate 3-4 candidate approaches BEFORE recommending. Compress per-option tradeoff to one line each, but do NOT skip option enumeration to save tokens — option breadth is what produces quality recommendations (reduced breadth is the failure mode CoD threatens here).

**Format:**

```
<draft>
Option A: <≤5w approach>
A tradeoff: <≤5w pro/con>
Option B: <≤5w approach>
B tradeoff: <≤5w pro/con>
Option C: <≤5w approach>
C tradeoff: <≤5w pro/con>
Context fit: <≤5w decision driver>
Pick: <option letter>
</draft>
<answer>
<recommendation with rationale + rollback semantics>
</answer>
```

**Example:**

User: How should we migrate JICM v7 watcher to v8? Consider rollback semantics.

```
<draft>
Option A: full atomic swap
A: simple, no back-compat
Option B: gradual hooks-first
B: lower blast radius, partial
Option C: shim back-compat
C: complex, fully reversible
Context fit: single-tmux production
Pick: C
</draft>
<answer>
**Recommendation: Approach C — back-compat shim**. Production runs a single tmux session; full-swap (A) blocks all work during cutover. Gradual (B) leaves stable v7 hooks alive while v8 watcher takes over actuation; partial state. The shim writes v7 state files for old `session-start.sh`; remove shim post-Stage-2 PASS. Rollback = `cp settings.json.pre-v8-deploy settings.json`.
</answer>
```
