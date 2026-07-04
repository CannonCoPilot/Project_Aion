---
name: verify-before-apply-prior-fix
description: "When Sir says \"we've seen this before, apply your findings,\" first re-verify the prior conditions are actually present — don't pattern-match a prior root cause to a new incident."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 699fa11b-12a5-47a7-9993-1080e573c8f1
---

When Sir invokes a prior investigation ("we've seen this before, apply the fix"), do NOT jump straight to executing the prior remedy. First re-verify that the prior causal conditions are present in the CURRENT incident using live evidence, then apply the remedy only if the causal chain is intact.

**Why:** 2026-07-02: Sir hit repeated 529 errors on W0:Jarvis and asked me to apply the 2026-06-23 fix (suppress Protos + Styx seed-fork workload). I proposed SIGSTOPping Sir's active Protos tmux session. Sir pushed back: *"Really? This makes no sense to me. Explain. Prove your theory."* Live evidence falsified the theory — Styx was already paused (`.nexus-paused` present), Alfred was getting clean 200s on the same account, the 529 storm was a discrete Anthropic-side capacity dip that had already receded (00:45 UTC burst → 00:59 UTC recovery). The prior remedy would have destructively suspended Sir's session without cause.

**How to apply:** When Sir cites prior work:
1. Recall the prior diagnosis and enumerate its causal preconditions (e.g. "amplifier workload actively emitting requests," "session with huge context," "account-level throttling active").
2. Query live evidence for EACH precondition BEFORE acting. Log activity in tmux panes; recent HTTP status distribution in `docker exec aifred-dev-postgres psql -U pulse_dev -d pulse_dev -c 'SELECT ... FROM api_requests WHERE timestamp > NOW() - INTERVAL ...'`; process activity via `ps -ef`.
3. If any precondition is absent, the prior remedy is not the right remedy for THIS incident. Rebuild diagnosis from live evidence.
4. If Sir authorized a specific reversible action (e.g. SIGSTOP), still surface what you found and confirm before executing — a memory of authorization is not a memory of scope.

The convenient surface (prior diagnosis) is not the authoritative signal (live evidence). Related discipline: [[empirical-before-claim]], [[empirical-grounding-for-claims]], [[fallbacks-are-failures]].
