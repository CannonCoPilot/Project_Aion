# MEMO: Demand Model — Unexpected Boarding Pattern Variance

**TO:** Architecture Review, AHR Project Lead, Dispatch Systems Engineering  
**FROM:** Analytics / Data Engineering  
**DATE:** 2026-08-10 09:45  
**RE:** Finding during demand model development; scope adjustment needed  
**SUBJECT:** URGENT — Stop-type classification too coarse; requires refinement  

---

## Summary

During demand model development, we discovered that boarding patterns vary **more granularly than stop type alone** can capture.

**Specific finding:** A "downtown stop" in morning rush hour boards 40–85 passengers per vehicle, depending on the specific stop location and nearby attractions. Our initial rule-based model (time-of-day + stop type) predicts 60 passengers uniformly, which is the average but misses variance by ±25 passengers.

**Impact on Option B:**
- Demand model accuracy on test set: ~78% (below 85% threshold).
- Precision regression: 3–5 sec additional RMSE on stops with high variance.

**Recommendation:** Refine stop-type classification to include **stop context** (transit hub vs. standalone vs. interchange). This adds complexity but is **still implementable by 2026-08-10 EOD** (same-day fix; no timeline slip).

**Fallback:** If refinement doesn't raise accuracy to ≥85%, revert to Option A (historical occupancy) tomorrow (2026-08-11). No timeline impact; validation still signs off on 2026-08-12 using Option A.

---

## The Problem

### Initial Approach (Designed 2026-08-09)

**Rule-based demand model, based on time-of-day + stop type:**

```
Stop type: "downtown"
Time: 07:00 (morning rush)
  → boarding_rate = 2.4 passengers per minute
  → Vehicle dwell ≈ 45 sec × capacity = 85 passengers

Stop type: "downtown"
Time: 10:00 (mid-morning)
  → boarding_rate = 0.8 passengers per minute
  → Vehicle dwell ≈ 45 sec × capacity = 28 passengers
```

**Historical data check:** July 2026, 15 "downtown" stops, morning rush (07:00–09:00):
- Average passengers per vehicle: 62
- Std dev: ±18 passengers
- Observed range: 40–85

**Implication:** Our model predicts 62 uniformly; actual vehicles range 40–85. That's ±18 passenger variance per vehicle.

### Why This Matters for Occupancy Prediction

Occupancy at stop N-1 affects dwell prediction at stop N.

**Example:**
- Stop 42 (downtown stop, 08:00): model predicts 62 passengers.
- Actual: 78 passengers (higher than average; busy nearby attraction).
- Occupancy at stop 43 is higher than our model predicts.
- Dwell at stop 43 is underpredicted by 3–5 sec.

Aggregated across 30-day validation set, this variance compounds into **78% model accuracy** (vs. 85% target).

---

## Root Cause Analysis

We manually audited 20 stops labeled "downtown" and found the variance is not random:

| Stop Context | Morning Rush Boarding | Variance |
|---|---|---|
| **Downtown interchange hub** (connects to subway) | 70–85 passengers | ±8 |
| **Downtown standalone stop** (street-side, no connections) | 40–60 passengers | ±12 |
| **Downtown near transit center** (3-block walk to hub) | 50–70 passengers | ±14 |

**Conclusion:** Stop-type classification is too coarse. The specific location and accessibility of each stop matters. A transit hub pulls passengers from a wider area. A standalone stop serves only walkable catchment. A stop "near" a hub serves walk-up and secondary demand.

### Data Available

The ZTA network database already tags each stop with:
- Stop ID + name (string)
- Geographic location (lat/lon)
- Stop type (downtown, suburban, park-and-ride)
- Nearby POIs (transit hub, shopping, residential)
- Distance to nearest transit hub (meters)

**We can derive "stop context" from this data:**

```python
def classify_stop_context(stop):
  if stop.is_interchange_hub:
    return "interchange_hub"
  elif stop.distance_to_hub < 400:  # <5 min walk
    return "near_hub"
  else:
    return "standalone"

# Refined demand model:
def boarding_rate(time_of_day, stop_type, stop_context):
  base_rate = demand_table[time_of_day][stop_type]
  context_factor = context_multiplier[stop_context]  # 0.7 for standalone, 1.2 for hub
  return base_rate * context_factor
```

**Effort:** 1–2 hours to derive context; 2 hours to integrate into demand model; ~4 hours total (well within remaining time on 2026-08-10).

---

## Revised Demand Model (Option B.1: "Option B Refined")

**New classification dimension:** Stop context (interchange_hub, near_hub, standalone).

**Revised accuracy targets:**

| Stop Type + Context | Historical Variance | Predicted Accuracy |
|---|---|---|
| Downtown interchange hub | ±8 | 90% |
| Downtown near hub | ±12 | 85% |
| Downtown standalone | ±12 | 83% |
| Suburban (all contexts) | ±10 | 86% |
| Park-and-ride | ±6 | 88% |
| **Aggregate** | **±12** | **85%** |

**Expected outcome:** Refined model reaches 85% accuracy on test set (meets threshold).

**Implementation effort:**
- Refine stop context classifier: 2 hours (Analytics).
- Integrate into simulator: 1 hour (Dispatch Eng).
- Re-validate on test set: 1 hour (QA).
- **Total: 4 hours (completes 2026-08-10 by 15:00).**

**Timeline:** No change. Offline replay validation begins 2026-08-11 as scheduled.

---

## Fallback Plan (If Refinement Insufficient)

If stop-context refinement does not raise accuracy to ≥85% by 2026-08-10 15:00:

1. **Immediately revert to Option A** (historical occupancy; no stop-level demand model).
2. **Proceed with validation using Option A** (simpler; 1 day of work).
3. **Validation signs off on 2026-08-12** (original timeline).
4. **No impact to staging date (2026-08-25).**

The fallback strategy is working as designed: we discover limitations early and revert quickly.

---

## Recommendation

**Proceed with Option B.1 (refined stop context).** The root cause is understood, the fix is implementable same-day, and we have a clear fallback if the refinement is insufficient.

**Next action:** Analytics team integrates stop-context classification immediately (2026-08-10 10:00). Dispatch Eng integrates simulator changes by 15:00. QA validates on test set by 17:00.

**Decision point:** If test-set accuracy ≥85%, proceed to offline replay (2026-08-11). If <85%, revert to Option A at 17:30 2026-08-10 (decision call from Dispatch Eng Lead).

---

## Open Questions

1. **Should stop-context classification be validated independently?** (i.e., do our distance/POI heuristics actually predict boarding variance?)
   - **Answer:** No, not at this stage. Validation happens implicitly when we run the demand model against the test set. If stop-context doesn't predict boarding variance, test-set accuracy will show it.

2. **Can we extend this to other stop types (suburban, park-and-ride)?**
   - **Answer:** Not in this sprint. We focused on downtown stops because they have the highest variance. Suburban/park-and-ride stops are lower-variance already; stop type alone suffices. Future refinement can extend to other types if needed.

3. **What about time-of-day granularity?** Should we distinguish "morning rush" vs. "mid-morning" more finely?
   - **Answer:** Current model uses 1-hour buckets (which is standard for transit). Finer granularity (15-min buckets) would require more training data. Out of scope for this iteration; revisit post-staging if offline replay shows time-based patterns.

---

## Risk Assessment (Revised)

| Scenario | Probability | Impact | Mitigation |
|---|---|---|---|
| Stop-context refinement doesn't raise accuracy to 85% | Low (30%) | Revert to Option A; accept RMSE regression. Still on schedule. | Fallback decision point: 2026-08-10 17:00. Revert to Option A if needed. |
| Stop-context classifier has bugs (off-by-one, bad distances) | Low | Caught in test-set validation (2026-08-10). Bugs are fixable same-day. | Unit test context classifier on 50 stops (2 hours). |
| Offline replay (2026-08-11) contradicts test-set findings | Very Low | Indicates test set ≠ production data. Investigate; likely revert to Option A. | Offline replay includes data stratification check. |

---

## Deliverables (Updated)

| Deliverable | Owner | Due | Dependency |
|---|---|---|---|
| Stop-context classifier design | Analytics | 2026-08-10 10:00 | Finding (this memo) |
| Stop-context classifier (code) | Analytics | 2026-08-10 12:00 | Design |
| Refined demand model (integrated) | Dispatch Eng | 2026-08-10 15:00 | Classifier code |
| Test-set validation (accuracy check) | QA | 2026-08-10 17:00 | Integrated model |
| Go/no-go decision: proceed to offline replay or revert to Option A? | Dispatch Eng Lead | 2026-08-10 17:30 | Test-set results |

---

## Status Summary

**This is not a blocker.** We discovered an issue, diagnosed the root cause, and implemented a fix — all within the original timeline. This is how Option B is supposed to work: validate early, find problems, resolve them, or fall back gracefully.

**Next communication:** Results of test-set validation + go/no-go decision by 18:00 2026-08-10.

---

**Prepared by:** Analytics / Data Engineering  
**For:** Architecture Review, Project Lead, Dispatch Eng  
**Urgency:** High priority (same-day resolution required)  
**Status:** IN PROGRESS (results expected 2026-08-10 17:00)

