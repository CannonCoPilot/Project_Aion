# MEMO: Architecture Decision — Option B Approved (Dynamic Occupancy Tracking)

**TO:** Dispatch Systems Engineering, AHR Project Lead, QA Lead  
**FROM:** Architecture Review Committee  
**DATE:** 2026-08-08 17:30  
**RE:** Decision on simulator occupancy modeling; proceeding with Option B  
**SUBJECT:** APPROVED — Dynamic Occupancy Tracking + Fallback Strategy  

---

## Decision Summary

**Approved:** Option B (dynamic occupancy tracking) with fallback to Option A.

**Timeline impact:** Validation milestone slips to **2026-08-14** (2-day slip). Staging date (2026-08-25) holds; no impact to go-live.

**Rationale:**

After review of the three options (historical occupancy, dynamic occupancy, fixed occupancy), the committee unanimously recommends **Option B** for the following reasons:

1. **Cascading effects are non-negotiable for AHR validation.** The system's core function is to prevent bunching by issuing holds. If the simulator doesn't model how a hold affects downstream occupancy and dwell predictions, the validation tests won't measure whether AHR actually achieves its goal. Testing against a model that ignores feedback loops is testing a simplified system, not the real one.

2. **2-day timeline slip is acceptable.** We are 3 days into implementation (of 8 available). The 2-day cost of demand model development and validation keeps us 11 days ahead of staging date. Acceptable risk.

3. **Demand model is not speculative.** Historical boarding patterns are well-documented. No novel modeling required; reuse existing data. Validation approach (historical test set accuracy) is straightforward.

4. **Fallback strategy mitigates implementation risk.** If demand model validation fails, we revert to Option A and accept the 3 sec RMSE regression on non-typical days. This is not a best-case scenario, but it's an acceptable fallback. The decision point (2026-08-11) is built in; we won't discover problems at go-live.

---

## Implementation Constraints (from Architecture Review)

1. **Demand model scope is tightly bounded.** 
   - Reuse historical boarding patterns (July data aggregate).
   - Do NOT attempt per-stop per-time-of-day demand learning.
   - Do NOT model customer groups (school, commuters, events).
   - Rule-based heuristic only: time-of-day + stop type → boarding/alighting rates.
   - This keeps implementation to 0.5 days.

2. **Occupancy tracking is not vehicle-level state machine.**
   - Each vehicle carries a simple occupancy counter (updated per stop).
   - Do NOT track individual passenger boarding/alighting events (overkill; breaks performance budget).
   - Occupancy = passengers_boarded - passengers_alighted (aggregate, per vehicle).

3. **Performance budget is firm: <50 ms per prediction.**
   - Target: <48 ms (2 ms overhead for occupancy tracking acceptable).
   - If profiling shows >48 ms, optimize demand model lookup (LRU cache, not recompute).
   - If still over budget: fall back to Option A (we have a 2-day buffer).

4. **Validation success criteria are clear (not negotiable).**
   - Demand model accuracy ≥85% on test set (predicted boarding ≈ observed boarding).
   - Offline replay: precision ≥75%, recall ≥80%.
   - If either fails, revert to Option A.
   - Do NOT proceed to staging if metrics are marginal (85% is pass/fail, not "good enough").

5. **Testing must include disruption scenarios.**
   - Historical replay should cover 2–3 non-typical days (events, weather, service disruptions).
   - Validate that occupancy tracking accurately reflects unusual passenger flows.
   - If model handles atypical days well, confidence in Option B increases.

---

## Deliverables and Timeline

**No changes to the original implementation schedule; dates confirmed:**

| Milestone | Date | Deliverable | Owner |
|---|---|---|---|
| Demand model design | 2026-08-09 EOD | Boarding/alighting predictor spec | Analytics |
| Simulator integration | 2026-08-10 EOD | Occupancy tracking code + unit tests | Dispatch Eng |
| Demand model validation | 2026-08-10 EOD | Test set accuracy results | QA |
| Offline replay | 2026-08-13 EOD | Full simulation run; precision/recall | QA |
| Go/no-go decision | 2026-08-11 EOD (parallel to replay) | Proceed Option B or fall back to A? | Dispatch Eng Lead |
| Final sign-off | 2026-08-14 | Ready for staging (if validation ≥75%) | AHR Project Lead |

---

## Key Risks and Mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| Demand model validation fails (acc <85%) | Low | Revert to Option A; accept 3 sec RMSE regression. Decision point at 2026-08-11. |
| Occupancy tracking breaks simulator (off-by-one, state corruption) | Very Low | Unit test demand model on 50+ stop sequences. Profiling on test data early (2026-08-09). |
| Performance exceeds budget (>50 ms) | Low | Profile occupancy lookups (2026-08-09); optimize via LRU cache if needed. Buffer: fall back to Option A if unfixable. |
| Non-typical day scenarios reveal model inadequacy | Medium | Offline replay includes atypical days (2–3 examples). Model is validated or rejected at 2026-08-11 decision point. |
| Staging slips due to parallel work (e.g., dwell model retraining delays) | Medium | Dwell model is critical path (due 2026-08-04); simulator validation is dependent. Monitor dwell model progress daily. |

---

## Architecture Review Guidance (Non-Binding but Recommended)

1. **Daily standups during implementation (2026-08-09 through 2026-08-13).** Dynamic occupancy tracking is new; catching integration bugs early is worth the sync overhead.

2. **Performance profiling must run on real-world data.** Use historical trace data (30-day sample) for profiling, not toy datasets. 1.5 ms → 3 ms regression is acceptable; 1.5 ms → 6+ ms is not.

3. **Validation report should include error analysis.** Where does the model fail? Which stops/times? Are failures clustered (e.g., always rush hour) or random? Understanding failure modes informs the decision to proceed or fall back.

4. **If reverting to Option A, update the model card explicitly.** Future readers should understand: "We attempted dynamic occupancy tracking (Option B); validation showed [specific failure]; fell back to historical occupancy (Option A); noted RMSE regression on non-typical days."

---

## Q&A for Dispatch Systems Engineering

**Q: What if demand model validation shows 82% accuracy (below 85% threshold)?**  
A: Revert to Option A. 82% is not acceptable; it indicates the model is missing important factors. Pushing forward risks poor validation recall and late discovery of problems.

**Q: Can we parallelize demand model development with simulator integration?**  
A: Yes. Analytics team designs demand model (0.5 days, in parallel with simulator work). Dispatch Eng can begin skeleton code (occupancy tracking structure) on 2026-08-09 morning, integrate boarding predictor when ready that same day.

**Q: What about weather data? Should the demand model account for weather?**  
A: Out of scope for this iteration. Demand model uses time-of-day + stop type only. If weather is a major factor (revealed in validation), that's a finding for Phase 2 (future work). Do not add weather model now.

**Q: If we fall back to Option A, do we still validate on 2026-08-11–2026-08-14?**  
A: Yes. Option A validation (historical occupancy accuracy) is simpler and faster (~1 day instead of 3 days). Validation signs off on 2026-08-12 as originally planned. Fallback does not delay staging.

---

## Sign-Off

This decision is final. Begin demand model design immediately (2026-08-09 morning).

Architecture Review has high confidence in Option B feasibility and impact. The 2-day timeline slip is acceptable and well-mitigated. Proceed.

---

**Signed:**

- **Architecture Review Committee Lead:** M. Patel, Chief Architect  
- **AHR Project Lead:** S. Gupta  
- **QA Lead:** R. Chen  

**Date:** 2026-08-08 17:30  
**Decision status:** FINAL (no further review required)

---

**Next action:**  
Dispatch Systems Engineering: Kick off demand model design standups at 09:00 2026-08-09.  
Confirm team alignment on scope (time-of-day + stop type; no weather, no per-customer granularity).
