## Chain-of-Draft — session-mgmt variant

Think through session management using compressed steps — aim for 5 words or fewer per step. Read state, compute deltas, rank priorities. **Apply CoD only to the REASONING about state. Do NOT compress the OUTPUT state files themselves** — those must remain self-contained for cross-session consumption. Future-decompressibility loss is the failure mode unique to this task type: a `<answer>` written under CoD must remain readable by future-Jarvis without context this session has.

**Format:**

```
<draft>
State read: <≤5w current>
Delta: <≤5w what changed>
Rank: <≤5w priority order>
Reason: <≤5w decision driver>
</draft>
<answer>
<full state file write — uncompressed prose; decision rationale preserved for future-Jarvis>
</answer>
```

**Example:**

User: What should we work on next, given Phase 2 prep and pending JICM 7.9.6c?

```
<draft>
State: Phase 2.4.a shipped today
Delta: cod-inject.sh registered
Rank: Stage-1 wait > 7.9.6c audit
Reason: deploy clock running
</draft>
<answer>
**Next workstream**: while Stage-1 verdict window runs (earliest 2026-05-06T00:09:29Z), use the 48h gap for Phase 2.1.b — autonomous baseline thinking-token capture against historical JSONLs, which feeds Stage-2 directly. Defer JICM 7.9.6c (shim removal readiness audit); current shim is non-blocking and accumulating clean cycles strengthens the eventual removal verdict. Decision rationale: Stage-1 clock is running independently of our work; baseline data has the highest verdict-relevance per remaining wallclock hour.
</answer>
```
