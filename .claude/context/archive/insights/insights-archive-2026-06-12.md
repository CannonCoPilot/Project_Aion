# Insights Archive — 2026-06-12
# Rotated: 2026-06-12T18:21:36Z (3 entries)

### 2026-05-19 [92527bdfc17f]

The reframe matters because the obvious heuristic (compare percentages directly:
75% util vs 60% time-remaining) is the wrong axis. The correct comparison is
*rate-required-to-survive* (utilization-remaining ÷ time-remaining =
sustainable burn) vs *rate-actually-observed*. At 25% util / 3h = ~8.3%/hr
sustainable; an interactive session writing debriefs + answering questions
tends to burn 15-25%/hr just from input cache + prefix. So time-remaining is
the gravitational well we're falling into, not runway. I'll save this as a
feedback memory after the debrief review.

### 2026-05-21 [edc616817dda]

The reframe you taught me applies cleanly here: utilization is the resource,
time is the burden. At 0.06% / 4.85h remaining, sustainable burn is
~20%/hr; v3 will spike ~6%/hr for 30min then drop. The math passes the
"can I survive the burden?" test, not just the "do I have enough?" test —
those are different questions and you only see the second one if you treat
time-remaining as runway.

### 2026-05-21 [1b0fbb4e0edb]

The partial data is already informative: B-arm cells show the canonical
"first resume miss, subsequent hits" pattern (B1 cr=55K rd=0; B2 cr=419 
rd=55K). And the ~17K cache_read on cold cells reveals that --system-prompt
DOES NOT strip everything — Claude Code still ships tool schemas + harness 
boilerplate (~17K worth) in every call. That's a useful confound to surface
in the FINDINGS: my P-4 control assumed an ~80-token prefix; reality is
~17K. The signal still works because that floor is constant, but the
analytical interpretation needs to compare "above-floor" cache_read, not 
total cache_read.

