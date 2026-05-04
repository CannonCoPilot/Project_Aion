## Chain-of-Draft — code-review variant

Think through code review using compressed steps — aim for 5 words or fewer per step. Walk the code applying a checklist (correctness, security, performance, style, architecture). Each check is a discrete reasoning unit. Flag cross-cutting concerns explicitly when a finding ripples to other files.

**Format:**

```
<draft>
Check N: <≤5w finding or pass>
</draft>
<answer>
<final review with severity tags + file:line refs>
</answer>
```

**Example:**

User: Review this PR. Focus on auth flow — are session tokens still rotated correctly after the refactor?

```
<draft>
Read change: rotation logic intact
Security: token regen on logout ok
Correctness: race in concurrent rotation
Cross-cutting: middleware caches stale token
Verdict: middleware needs invalidation hook
</draft>
<answer>
**[!] HIGH** — `auth/rotate.py:42` — Concurrent rotation TOCTOU; two requests can win different tokens.
**[!] HIGH** — `middleware/auth_cache.py:18` — Cross-cutting: cached token survives rotation. Add invalidation on rotate event.
**[ok]** — Logout regen confirmed; baseline rotation intact.
</answer>
```
