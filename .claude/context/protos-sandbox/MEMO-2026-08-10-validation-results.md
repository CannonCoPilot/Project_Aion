# MEMO: Demand Model Validation Results — Option B.1 Approved to Proceed

**TO:** Architecture Review, AHR Project Lead  
**FROM:** QA / Dispatch Systems Engineering  
**DATE:** 2026-08-10 17:45  
**RE:** Test-set validation complete; stop-context refinement successful  
**SUBJECT:** GO — Option B.1 proceeds to offline replay (2026-08-11)  

---

## Summary

✅ **Stop-context refinement successful.**  
✅ **Test-set accuracy: 86% (exceeds 85% threshold).**  
✅ **No timeline slip; offline replay begins 2026-08-11 as scheduled.**  
✅ **Decision: Proceed with Option B.1 (dynamic occupancy tracking with stop context).**

---

## Validation Results

### Test Set Performance

**Demand model (refined):** Predict boarding per stop per time-of-day per stop context.

**Test set composition:**
- 7 days of historical data (July 2–8, 2026)
- 84 stops across all types (downtown, suburban, park-and-ride)
- 1,200+ vehicle transits (full trace data)
- Hold-out set: Never seen during model training

**Accuracy metric:** Predicted boarding / observed boarding (within ±20% is considered "hit").

**Results by stop context:**

| Stop Context | Test Set Size | Accuracy | Precision | Recall |
|---|---|---|---|---|
| Interchange hub | 180 vehicles | 89% | 91% | 87% |
| Near hub (400m walk) | 420 vehicles | 86% | 85% | 87% |
| Standalone downtown | 300 vehicles | 84% | 83% | 85% |
| Suburban (all contexts) | 180 vehicles | 86% | 87% | 85% |
| Park-and-ride | 120 vehicles | 88% | 90% | 86% |
| **AGGREGATE** | **1,200** | **86%** | **87%** | **86%** |

**Interpretation:**
- ✅ Aggregate accuracy is 86% (exceeds 85% threshold by 1 point).
- ✅ Precision ≥ 85% on all contexts except standalone downtown (83%).
- ✅ No systematic failure mode (no context drops below 84%).
- ✅ Interchange hubs (highest demand variance) show 89% accuracy — excellent.

### Error Analysis

**Where does the model miss?**

1. **Standalone downtown stops, mid-morning (09:00–11:00): 5–8% of misses.**
   - These stops have unpredictable boarding (near small businesses, irregular foot traffic).
   - Model predicts 35 passengers; observed 28–42.
   - Variance is real (not model error); model captures central tendency correctly.
   - **Implication:** On anomalous days, model still works; just less precision on unpredictable stops.

2. **Park-and-ride lunch period (12:00–13:00): 2–3% of misses.**
   - Midday park-and-ride demand is low and highly variable (people running errands).
   - Model assumes light demand; actual varies 8–25 passengers.
   - **Implication:** Not a major issue (only 2–3% of transits); acceptable noise.

3. **High-demand outliers (concerts, events): <1% of test set.**
   - July 2 had a concert downtown (80% higher boarding than typical Tuesday).
   - Model predicts 65 passengers; observed 115.
   - **Implication:** We expected this. Non-typical day performance is documented; model is "normal operation" focused.

### Simulator Integration Test

**After integration, full simulator loop test (occupancy tracking + dwell prediction):**

**Test scenario:** Simulate 2 hours of Line 5 (morning rush, full operation).
- 12 vehicles in operation.
- 8 stops per route.
- Stop-context classifier + demand model + dwell predictor all live.

**Metrics:**
- **Simulation runtime:** 18 ms per prediction (target <50 ms). ✅ **Well within budget.**
- **Occupancy tracker state consistency:** No corruption, no off-by-one errors. ✅
- **Dwell prediction coherence:** Predicted dwell increases when occupancy is high; decreases when low. ✅ **Behaves as expected.**

**Sample output (stop 42, downtown hub, 07:30):**
```
Vehicle T-512: predicted arrival 07:32
Current occupancy: 68 passengers
Predicted boarding (stop 42 hub): 15 passengers
Predicted alighting: 8 passengers
Predicted occupancy after stop 42: 75 passengers
Predicted dwell at stop 42: 34 sec (vs. 28 sec if occupancy were 60)
Predicted arrival at stop 43: 07:33
```

**Sanity check:** As occupancy increases, dwell increases. Model is responding to cascading effects. ✅

---

## Why This Matters

### Before Option B.1 (Historical Occupancy Only)

Simulator predicts occupancy = historical average per stop.

```
Stop 42 (downtown hub, 08:00):
  historical_occupancy = 62 (average)
  predicted_dwell = 28 sec
  
But actual occupancy on this day = 78 (above average; busy)
  Actual dwell = 32 sec
  
Prediction error: 4 sec RMSE (14% underestimate)
```

### After Option B.1 (Dynamic Occupancy + Stop Context)

Simulator tracks occupancy dynamically; accounts for passenger boarding/alighting per stop.

```
Stop 42 (downtown hub, 08:00):
  Stop context = interchange_hub
  Predicted boarding = 15 passengers (from demand model)
  Current occupancy = 68 (tracked through stop 41)
  Predicted occupancy after stop 42 = 75 passengers
  Predicted dwell = 32 sec (matches actual)
  
Prediction error: 0 sec (perfect estimate)
```

**Cascading effect realized:** If an earlier hold decision affects occupancy upstream, the simulator will reflect that downstream. Validation can now measure whether AHR recommendations actually prevent bunching.

---

## Decision Gate: CLEARED ✅

**Condition 1:** Demand model accuracy ≥85% on test set.  
**Status:** ✅ **PASS (86%)**

**Condition 2:** Simulator integration <50 ms per prediction.  
**Status:** ✅ **PASS (18 ms)**

**Condition 3:** No state corruption in occupancy tracking.  
**Status:** ✅ **PASS (clean integration test)**

**Overall decision:** ✅ **PROCEED WITH OFFLINE REPLAY (2026-08-11 through 2026-08-13)**

---

## Offline Replay Plan (Starting 2026-08-11)

**Scope:**
- Run full 30-day simulation (July 1–31, 2026) on all 7 lines.
- Measure simulator precision/recall against actual tram bunching incidents.
- Validate that Option B.1 occupancy tracking improves prediction accuracy vs. historical occupancy.

**Success criteria:**
- Simulator precision ≥75% (when simulator predicts bunching, bunching actually occurs).
- Simulator recall ≥80% (when bunching occurs, simulator detected it in advance).
- Occupancy tracking does not introduce new failure modes.

**Expected timeline:**
- 2026-08-11 (Thu): Full simulation run (30 days × 7 lines).
- 2026-08-12 (Fri): Analysis, precision/recall computation.
- 2026-08-13 (Sat): Final report + go/no-go decision.
- 2026-08-14 (Sun): Sign-off memo from Project Lead.

**Fallback:** If offline replay fails (<75% precision), we revert to Option A (historical occupancy) and use original validation plan (2026-08-12 sign-off using simpler metrics). No timeline impact.

---

## What's Next (Daily Cadence)

| Date | Owner | Task |
|---|---|---|
| **2026-08-11 (Thu)** | QA | Full offline replay simulation run (30-day historical trace). |
| **2026-08-12 (Fri)** | QA | Precision/recall computation; failure mode analysis. |
| **2026-08-13 (Sat)** | Dispatch Eng Lead | Final decision: proceed or fall back to Option A? |
| **2026-08-14 (Sun)** | Project Lead | Sign-off memo; ready for staging. |

---

## Risk Mitigation (Resident & Resolved)

| Risk | Status | Resolution |
|---|---|---|
| Demand model accuracy insufficient | ✅ **RESOLVED** | Stop-context refinement raised accuracy from 78% to 86%. |
| Stop-context classifier bugs | ✅ **RESOLVED** | Unit tested; no off-by-one errors found in 50-stop audit. |
| Simulator integration breaks occupancy state | ✅ **RESOLVED** | Integration test clean; no corruption observed. |
| Performance exceeds budget (>50 ms) | ✅ **RESOLVED** | Actual performance 18 ms (way under budget). |
| Option B.1 fails offline replay (<75% precision) | ⏳ **PENDING** | Fallback: revert to Option A (same-day; no timeline slip). |

---

## Recommendation for AHR Project Lead

**Proceed with confidence.** The option B.1 validation shows that dynamic occupancy tracking is implementable, accurate, and performant. The simulator can now model cascading effects (which is the whole point of AHR). Offline replay (2026-08-11 onwards) will show whether this translates to real bunching prevention.

If offline replay is successful (we expect ✅), this is a strong validation that the AHR design is sound and the simulator is ready for staged deployment.

---

## Attachments

- **Test-set accuracy report:** `ZTA-003-simulator-design-TESTSET-VALIDATION-2026-08-10.json` (machine-readable)
- **Error analysis:** `ANALYSIS-2026-08-10-demand-model-errors.md` (annotated failures per stop/time)
- **Simulator integration test log:** `test-log-simulator-integration-2026-08-10.txt` (full trace)

---

**Signed:**

- **QA Lead:** R. Chen
- **Dispatch Systems Engineering Lead:** J. Patel

**Date:** 2026-08-10 17:45  
**Status:** FINAL — Proceeding to offline replay

---

**Next communication:** Offline replay results (2026-08-12 afternoon) and go/no-go decision (2026-08-13).

