# AIfred Sync Ad-Hoc Assessment

**Generated**: 2026-03-22 18:35
**Baseline Commit**: `c27ba27` (AIfred v2.5.0)

---

## Key Discoveries

- **Massive divergence**: 283 files changed, 51K insertions across 22 commits. AIfred has effectively been rewritten from the v1.2.0 baseline Jarvis forked from. The two systems are no longer "same codebase, different config" — they are architecturally distinct projects sharing ancestry

- **Hook proliferation**: AIfred went from 15 to 32 hooks. This is the opposite of Jarvis's consolidation strategy (28 hooks, deliberate). The AIfred approach distributes behavior across many small hooks; Jarvis centralizes in AC components + Aion Quartet scripts. Neither is wrong — they serve different operational models

- **Beads replaces TodoWrite**: AIfred has moved to an external CLI task manager (`bd`). This is a significant philosophical shift — AIfred now depends on an npm package for core workflow. Jarvis's TodoWrite-based approach has zero external dependencies. The AIfred rationale is likely that `bv` TUI provides a human-readable dashboard without consuming tokens

- **Profile system is AIfred's answer to Jarvis's Archon layers**: Where Jarvis uses Nous/Pneuma/Soma with capability-map.yaml routing, AIfred uses composable YAML profiles (general/homelab/development/production). Both solve "configure behavior for context" but at different abstraction levels

- **Fresh Context Pattern is complementary to JICM**: AIfred's approach to context exhaustion (restart with clean slate) vs Jarvis's approach (compress and continue) represent genuinely different strategies. Jarvis preserves continuity; AIfred preserves consistency. Both have merit for different workloads

- **Compaction-essentials is the standout idea**: A static minimum-context file that always survives compaction. Jarvis's JICM generates compressed context dynamically, but has no guaranteed minimum. Adding a static essentials file would provide a reliable floor — even if the compression agent fails, the essentials are always available

---

## Questions Resolved

| Question | Resolution |
|----------|------------|
| Has AIfred diverged enough to stop syncing? | Nearly. Wholesale sync is no longer viable. Future syncs should be surgical (specific hooks, patterns, bug fixes) |
| Did AIfred fix the TCP RPC issue for Docker? | No — AIfred still uses MCP-based Docker management, not direct RPC. Different problem space |
| Does AIfred have a JICM equivalent? | No. AIfred has `pre-compact.js` (context preservation) but no proactive monitoring or compression triggering. The Watcher + JICM state machine is unique to Jarvis |
| Does AIfred have reflection/evolution? | Partially — the "upgrade" skill scans for updates. But no AC-05/06/07/08 pipeline. Jarvis's self-improvement system is significantly more mature |
| Is the parallel-dev skill worth porting? | No — it's a complex 19-file system that replicates what Jarvis's Agent tool `isolation: "worktree"` already provides natively. The Claude Code team's built-in worktree support makes the parallel-dev skill obsolete |

---

## Implications for Jarvis

- **Sync cadence should be reduced**: From monthly to quarterly or ad-hoc. The value of syncing diminishes as divergence increases. Future syncs should only target specific features flagged during R&D
- **Compaction-essentials is actionable**: This is a genuine improvement to JICM reliability. Implement as a complementary mechanism alongside the dynamic compression agent
- **Document Guard V1 fills a real gap**: Jarvis has branch protection but no file-level protection within Project_Aion. Subagents could accidentally overwrite `CLAUDE.md`, `session-state.md`, or `jarvis-identity.md`. A path-based guard hook is worth adapting
- **AIfred's hook count (32) validates Jarvis's consolidation strategy**: More hooks = more context cost + more maintenance. Jarvis deliberately kept hooks lean and pushed behavior into AC components and skills instead

---

## Recommended Next Steps

1. **Implement compaction-essentials.md** (1 hour): Create Jarvis-specific essentials file, wire into pre-compact.sh. This directly improves JICM reliability
2. **Adapt document-guard V1** (30 min): Port path-based protection only. Protect `CLAUDE.md`, `psyche/`, `session-state.md`, `current-priorities.md` from accidental subagent writes
3. **Update `paths-registry.yaml`** last_synced_commit to `c27ba27` (if proceeding with ports)
4. **Add to research-agenda.yaml**: "planning-mode-detector concept for AC-02" and "context-usage-tracker for AC-07 efficiency"
5. **Consider marking AIfred sync as low-priority**: The ROI of future syncs is declining as architectures diverge

---

## Blockers or Concerns

- **No blockers**: All ADOPT items are independent and can be implemented without user approval (low-risk, additive)
- **Concern: hook count creep**: If we adopt document-guard + port-conflict-detector, Jarvis goes from 28 to 30 hooks. Keep the total under 32 (AIfred's current count, which we've identified as excessive)
- **Concern: compaction-essentials maintenance**: The file must be manually kept in sync with architecture changes. Could become stale. Mitigation: add to AC-08 freshness audit

---

*Assessment generated during /sync-aifred-baseline — Jarvis v5.11.0*
