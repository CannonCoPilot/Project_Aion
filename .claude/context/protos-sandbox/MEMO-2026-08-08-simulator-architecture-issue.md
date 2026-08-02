# MEMO: Simulator Architecture — Live Occupancy vs. Predicted Occupancy

**TO:** AHR Project Lead, Architecture Review  
**FROM:** Dispatch Systems Engineering (Simulation)  
**DATE:** 2026-08-08 14:15  
**RE:** Critical decision required; impacts simulator design and validation timeline  
**STATUS:** BLOCKING simulator implementation; decision needed by EOD 2026-08-08  

---

## Summary

Three days into simulator implementation, we've discovered an architectural choice that wasn't exposed in the design phase:

**Should the simulator predict occupancy dynamically (track each passenger), or use static historical occupancy as a feature?**

The decision **trades off accuracy against complexity**.

This memo presents both options, their tradeoffs, and a recommendation. **Decision required by EOD today to stay on 2026-08-12 validation milestone.**

---

## The Problem

### Current Design (ZTA-003)

The dwell time model takes `crowding_proxy` as a feature — occupancy at the previous stop (inferred from door sensors or load sensors).

**Example prediction:**

```python
dwell_features = {
  ...,
  "crowding_proxy": 0.72,  # occupancy at previous stop
}
predicted_dwell = model.predict(dwell_features) = 28 sec
```

**In the simulator loop, this means:**

```
For vehicle T-512 at stop N:
  previous_stop = N - 1
  previous_occupancy = actual_occupancy_at(stop N-1)  # From historical data
  predict_dwell(stop N, previous_occupancy)
```

**Implicit assumption:** Occupancy at stop N-1 is **known** (historical data already recorded).

### The Issue: Future Predictions Break the Assumption

When we predict **into the future** (15-minute horizon), the previous stop hasn't happened yet.

**Example scenario:**

```
Current time: 17:30 (actual)
Vehicle T-512: at stop 42 (actual)
Predicting arrival at stop 43: 17:33 (predicted)
Predicting occupancy at stop 42: ???

Vehicle T-512 boards/alights at stop 42 between 17:30 and 17:33.
Occupancy changes.
But we don't know how many passengers board/alight (not yet happened).
```

**What do we do?**

**Option A (Current Implementation):** Use *historical occupancy* at stop 42 (average from July data).
- **Assumption:** Occupancy at stop N-1 on 2026-08-05 = historical average occupancy at that stop.
- **Problem:** On unusual days (events, weather, disruptions), occupancy deviates significantly. Prediction becomes inaccurate.
- **Example:** If there's a concert downtown, occupancy at central stops is 20% higher than historical average. Our dwell predictions will be too conservative (underestimate dwell by 3–5 sec).

**Option B (Proposed):** Track occupancy *dynamically* in the simulation.
- **Approach:** For each vehicle, simulate passenger boarding/alighting at each stop based on demand model.
- **Advantage:** Accounts for cascading effects (if vehicle A is delayed, it picks up fewer passengers, allowing vehicle B to board more).
- **Disadvantage:** Requires a passenger demand model (currently doesn't exist). Adds ~30 lines of code, but more importantly, requires validation.

**Option C (Fallback):** Simplify; use fixed occupancy assumption.
- **Approach:** Assume all vehicles on the line operate at the same occupancy level (e.g., 70% capacity) throughout the prediction horizon.
- **Advantage:** Trivial to implement; no model needed.
- **Disadvantage:** Very crude; loses the benefit of dwell model's occupancy feature.

---

## Analysis

### Option A: Use Historical Occupancy (Current Design)

**Pseudocode:**

```python
def predict_dwell_at_future_stop(vehicle, stop, time):
  historical_occupancy = historical_occupancy_at_stop[stop][time.hour]  # Lookup table
  return dwell_model.predict({
    ...,
    "crowding_proxy": historical_occupancy,
  })
```

**Pros:**
- ✓ Simple; no additional model required.
- ✓ Fast; occupancy lookup is O(1).
- ✓ Reduces complexity; fewer moving parts to debug.
- ✓ Can validate quickly (offline replay on 30-day history).

**Cons:**
- ✗ **Inaccurate on non-typical days.** Concerts, weather disruptions, special events all cause occupancy spikes. Predictions regress.
- ✗ **Cascading effects not captured.** If vehicle A is held (per hold recommendation), passengers accumulate at previous stops. Vehicle B picks up more passengers. Dwell at downstream stops increases. Current model doesn't capture this feedback.
- ✗ **Occupancy feedback loop not modeled.** If AHR issues a hold, stops upstream of the hold accumulate passengers (waiting for held vehicle). Passengers board the next vehicle instead. Occupancy changes.

**Expected accuracy:**
- **Typical days (no disruptions):** ±12 sec RMSE (matches dwell model accuracy).
- **Non-typical days (spikes):** ±18 sec RMSE (3 sec regression).
- **Result:** ~15% of days have degraded accuracy.

### Option B: Dynamic Occupancy Tracking

**Pseudocode:**

```python
def simulate_vehicle(vehicle, horizon_time):
  occupancy = vehicle.current_occupancy
  for stop in vehicle.stops_until(horizon_time):
    # Predict boarding & alighting
    boarding = demand_model.predict_boarding(stop, occupancy, time)
    alighting = demand_model.predict_alighting(stop, occupancy, time)
    occupancy += boarding - alighting
    
    # Predict dwell based on updated occupancy
    dwell = dwell_model.predict({..., "crowding_proxy": occupancy})
    
    # Update vehicle state
    vehicle.occupancy = occupancy
```

**Pros:**
- ✓ **Captures cascading effects.** If vehicle A is held, downstream stops have higher occupancy, increasing dwell predictions at those stops.
- ✓ **Feedback loops represented.** Occupancy changes propagate through the simulation.
- ✓ **More realistic predictions.** On non-typical days, model adapts (if occupancy is high, predicts higher dwell).
- ✓ **Accounts for hold recommendations.** If we recommend holding T-512, the simulation can recalculate downstream occupancy/dwell for T-511.

**Cons:**
- ✗ **Requires demand model.** No existing model for "boarding per stop per time-of-day per occupancy level."
- ✗ **Adds complexity.** Occupancy tracking introduces state; harder to debug; more potential for off-by-one errors.
- ✗ **Validation overhead.** Need to validate demand model accuracy; adds 1–2 days to implementation.
- ✗ **Performance risk.** More computation per vehicle (currently ~1.5 ms per vehicle; could become ~3–5 ms).

**Expected accuracy:**
- **All days:** ±12–13 sec RMSE (consistent; no day-type regression).
- **Non-typical days:** ±15 sec RMSE (better than Option A on spikes).

**Implementation estimate:** 
- Demand model design: 0.5 days (reuse historical boarding patterns).
- Simulator integration: 0.5 days.
- Validation: 1 day.
- **Total: 2 days additional.**

**Timeline impact:** Validation milestone slips from 2026-08-12 to 2026-08-14 (2 days).

### Option C: Fixed Occupancy Assumption

**Pseudocode:**

```python
def predict_dwell_at_future_stop(vehicle, stop, time):
  fixed_occupancy = 0.70  # Assume all stops at 70% capacity
  return dwell_model.predict({
    ...,
    "crowding_proxy": fixed_occupancy,
  })
```

**Pros:**
- ✓ Trivial to implement (2 lines of code).
- ✓ Fastest (no lookup, no model call).
- ✓ No validation needed.

**Cons:**
- ✗ **Crude and unrealistic.** Loses the benefit of occupancy as a feature.
- ✗ **Prediction accuracy degraded.** Dwell model trained on occupancy ranges 0.3–0.95; fixing at 0.70 sacrifices variance modeling.
- ✗ **Cascading effects entirely absent.** Changes to occupancy (due to holds or disruptions) don't affect downstream dwell.

**Expected accuracy:** ±16–18 sec RMSE (significant regression from 12 sec baseline).

---

## Recommendation: Option B (Dynamic Occupancy) + Fallback to Option A

**Rationale:**

1. **Cascading effects are real.** The whole point of AHR is to prevent bunching. If we don't model how holds affect downstream occupancy/dwell, we're missing a critical feedback loop. Validation (offline replay) will show poor recall if we ignore this.

2. **Timeline is tight but feasible.** Implementation estimate is 2 days (demand model + integration + validation). We're currently at day 3 of 8-day implementation window (2026-08-05 through 2026-08-12). Slipping validation to 2026-08-14 still leaves 11 days before staging (2026-08-25); acceptable.

3. **Demand model is straightforward.** Historical boarding patterns are well-understood:
   - Peak hours (morning, evening): higher boarding rates.
   - Off-peak: lower boarding rates.
   - Stop type (downtown, suburban, park-and-ride): affects boarding/alighting ratios.
   - No ML needed; simple heuristic from historical data.

4. **Fallback strategy is clear.** If demand model validation fails (accuracy <80%), we fall back to Option A (historical occupancy) and accept the 3 sec RMSE regression on non-typical days. Staging still proceeds; we note the limitation in the model card.

**Implementation plan:**

```
2026-08-08 (Today)  ← Architecture decision (this memo)
  └─ DECISION: Proceed with Option B + fallback to A

2026-08-09 (Thu)
  ├─ Design demand model (historical patterns)
  ├─ Implement passenger boarding/alighting predictor
  └─ Integrate into simulator loop

2026-08-10 (Fri)
  ├─ Validation of demand model (historical accuracy on test set)
  └─ Full simulator integration test

2026-08-11 (Sat) – 2026-08-13 (Mon)
  ├─ Offline replay validation (30-day historical data)
  ├─ Precision/recall computation
  └─ Decision: proceed with dynamic occupancy or fall back to Option A?

2026-08-14 (Tue)
  └─ Final sign-off (if validation ≥75% precision, ready for staging)
```

**Success criteria for Option B:**
- Demand model accuracy ≥85% (predicted boarding matches observed) on hold-out test set.
- Offline replay: precision ≥75% (vs. current target).
- Computation time still <50 ms per prediction.

**If any fails:**
- Revert to Option A (historical occupancy).
- Accept ±18 sec RMSE on non-typical days (vs. target ±15 sec).
- Proceed to staging with caveat in model card.

---

## Open Questions for Architecture Review

1. **Cascading effects:** Is it acceptable to proceed to staging without fully modeling occupancy feedback (Option A), or is this a blocker? (impacts decision between B and A)

2. **Day-type variance:** How often are "non-typical days" (e.g., events, disruptions)? If rare (<5%), Option A accuracy degradation is acceptable. If common (>20%), Option B is necessary.

3. **Performance tolerance:** Current budget is <50 ms per prediction. Option B adds ~1–2 ms per vehicle (occupancy tracking). Is this acceptable, or must we stay <48 ms?

4. **Validation timeline:** Is slipping offline validation from 2026-08-12 to 2026-08-14 acceptable (2-day slip, but still 11 days before staging go-live)?

---

## Risk Assessment

| Scenario | Probability | Impact | Mitigation |
|---|---|---|---|
| Demand model doesn't validate (acc <80%) | Low | Fall back to Option A; accept RMSE regression. | Already planned. |
| Occupancy tracking breaks simulator logic (off-by-one errors) | Low | Caught in offline replay validation. | Comprehensive unit tests on demand model. |
| Computation time exceeds budget (<50 ms) | Very Low | Profile and optimize occupancy lookups. | Early performance testing (2026-08-09). |
| Cascading effects don't improve precision; Option B wastes 2 days | Medium | Validation will show this; revert to Option A. | Clear decision point at 2026-08-11 (before sign-off). |

---

## Deliverables (if Option B approved)

| Deliverable | Owner | Due | Dependency |
|---|---|---|---|
| Demand model design (boarding/alighting rules) | Analytics | 2026-08-09 EOD | Architecture decision |
| Passenger boarding predictor (code) | Dispatch Eng | 2026-08-09 EOD | Design |
| Simulator integration (occupancy tracking) | Dispatch Eng | 2026-08-10 EOD | Boarding predictor |
| Demand model validation (test set accuracy) | QA | 2026-08-10 EOD | Boarding predictor |
| Offline replay with dynamic occupancy | QA | 2026-08-13 EOD | Simulator integration |
| Decision: Option B proceed or fall back to A? | Dispatch Eng Lead | 2026-08-11 EOD | Offline replay results |

---

## Decision Gate (EOD 2026-08-08)

**What we need:**

- [ ] Architecture review approves Option B + Option A fallback
- [ ] Timeline slip to 2026-08-14 validation is acceptable
- [ ] Performance and accuracy expectations confirmed

**If approved:** Begin demand model design tomorrow (2026-08-09).

**If not approved:** Revert to Option A (historical occupancy) immediately; no timeline impact; proceed with original 2026-08-12 validation milestone.

---

**Prepared by:** Dispatch Systems Engineering (Simulation)  
**Needs review/approval by:** Architecture Review, AHR Project Lead  
**Decision deadline:** 2026-08-08 17:00 (EOD)

