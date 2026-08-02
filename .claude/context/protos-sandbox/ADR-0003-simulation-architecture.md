# ADR-0003: Headway Prediction — Discrete Event Simulation vs. Agent-Based Modeling

**Date:** 2026-07-29  
**Status:** Proposed (awaiting team discussion)  
**Context:** Designing the prediction engine for adaptive headway regulation (ZTA-001).

---

## Problem

The adaptive headway regulation system needs to predict, every 5 seconds, whether the next 15 minutes of vehicle movement will result in headway violations (bunching). Two architectural approaches are viable:

1. **Discrete Event Simulation (DES):** Simulate each vehicle's journey stop-by-stop, using deterministic stop times, predicted dwell, and observed speed profiles.
2. **Agent-Based Modeling (ABM):** Each vehicle is an autonomous agent with behavioral rules (e.g., "accelerate if more than 5 min behind schedule"). Agents interact (jam when queued), and emergent behavior produces headway evolution.

Both can predict bunching. They differ in fidelity, latency, and maintainability.

---

## Option 1: Discrete Event Simulation (DES)

### How It Works

For each vehicle on the line:
1. **Observe** current state: position, speed, trip_id, next stops.
2. **Simulate** forward 15 min using:
   - Observed speed (from telemetry)
   - Predicted dwell (from XGBoost model)
   - Deterministic signal timing (queried from signal controller)
   - Historical stop-to-stop travel times (median from past 30 days)
3. **Output:** predicted arrival time at every downstream stop for this vehicle and the vehicle behind it.
4. **Detect:** if any arrival times diverge to <3.5 min, flag as at-risk.

### Pseudocode

```python
def simulate_headway(vehicle_id, lookahead_minutes=15):
    current = get_vehicle_state(vehicle_id)
    previous_vehicle = get_vehicle_state(previous_trip_id(vehicle_id))
    
    current_predictions = []
    prev_predictions = []
    
    for stop in upcoming_stops(vehicle_id, lookahead_minutes):
        # Predict arrival at this stop
        travel_time = get_historical_travel_time(
            current.current_stop_id, stop.id, 
            time_of_day=now().hour
        )
        dwell = predict_dwell(
            stop.id, stop.is_major_transfer, 
            current.occupancy, now().hour
        )
        
        arrival_time = current.time + travel_time
        departure_time = arrival_time + dwell
        current_predictions.append({
            'stop_id': stop.id,
            'arrival': arrival_time,
            'departure': departure_time
        })
        
        current.time = departure_time
    
    # Repeat for previous vehicle (same logic)
    prev_predictions = simulate_headway(previous_vehicle.id)
    
    # Compare headways
    for i, (curr_stop, prev_stop) in enumerate(zip(current_predictions, prev_predictions)):
        headway = curr_stop['arrival'] - prev_stop['arrival']
        if headway < 3.5 * 60:  # 3.5 minutes in seconds
            flag_at_risk(vehicle_id, stop_id, headway)
```

### Pros

- **Deterministic:** Same inputs → same outputs. Easy to debug and reason about.
- **Fast:** ~50 ms per vehicle (200 vehicles × 50ms = 10s total, re-run every 5s leaves headroom).
- **Transparent:** Each step (travel time, dwell, signal) is observable and can be logged for debugging.
- **Domain-familiar:** Operations team understands "we simulate stop-by-stop" intuitively.

### Cons

- **Fragile to model assumptions:** If the dwell model is biased (e.g., underestimates dwell by 10 sec on rainy days), all predictions will be systematically wrong.
- **No emergent effects:** Doesn't capture passenger rerouting (people waiting for the next vehicle if headways tighten). Doesn't capture driver behavior (experienced drivers sometimes maintain headway by soft acceleration).
- **Hard to validate offline:** The simulation is a black box once deployed. We can validate against historical traces, but surprises in the live system will be hard to explain.

---

## Option 2: Agent-Based Modeling (ABM)

### How It Works

Each vehicle is an agent with behavior rules:

```python
class VehicleAgent:
    def step(self):
        # 1. Observe: where am I, how full, how many min behind schedule?
        delay = self.scheduled_arrival_time - now()
        occupancy = self.passenger_count / self.capacity
        
        # 2. Decide: should I accelerate, coast, or hold?
        if delay > 3 * 60:
            # More than 3 min behind: accelerate (up to 10% speed boost)
            self.speed_target = self.normal_speed * 1.10
        elif delay < -1 * 60:
            # More than 1 min ahead: ease off
            self.speed_target = self.normal_speed * 0.95
        else:
            # On schedule: maintain normal speed
            self.speed_target = self.normal_speed
        
        # 3. Act: move closer to target speed (don't jerk)
        self.speed = lerp(self.speed, self.speed_target, accel=0.1)
        self.position += self.speed * dt
        
        # 4. Interact: am I queued behind another vehicle?
        next_vehicle = self.get_next_vehicle_ahead()
        if next_vehicle and distance(self, next_vehicle) < 50m:
            # Force slow down (collision avoidance)
            self.speed = min(self.speed, next_vehicle.speed)
```

For 15-minute prediction: instantiate agents, step them forward 900 times (1 sec per step), record arrivals.

### Pros

- **Captures emergent behavior:** If a vehicle ahead slows, followers naturally adapt. If multiple vehicles bunch, the cluster behavior emerges from individual rules.
- **Passenger rerouting:** We can add a rule: "if headway ahead is <4 min, newly arriving passengers wait for the next vehicle." This naturally reduces dwell on the bunched vehicle.
- **Driver experience:** Can model different driver styles (conservative vs. aggressive). Real driver behavior will map to one of our archetypes.
- **Realistic:** More closely matches actual transit operations.

### Cons

- **Slow:** 900 simulation steps × 200 vehicles × ~1 ms per step = 180 ms per re-run. Re-running every 5 sec means 36% of CPU is spent on prediction. Tight budget.
- **Nondeterministic (if we add randomness):** If agents have stochastic behavior (e.g., "small chance of driver inattention"), predictions vary. Hard to debug.
- **Tuning nightmare:** Each agent parameter (acceleration, delay threshold, etc.) must be calibrated. If the model says "all bunching happens because drivers accelerate too aggressively," but drivers aren't actually aggressive, predictions will be wrong.
- **Hard to validate:** If the simulation predicts bunching but it doesn't happen live, was the model wrong or was the live system different?

---

## Decision: Discrete Event Simulation (DES)

**Chosen:** DES (Option 1).

### Rationale

1. **Speed:** 50 ms per vehicle allows 10 re-runs per 5-second cycle. This headroom is crucial: if dwell-model retraining happens and predictions shift, we can spike compute usage without missing a cycle.

2. **Transparency:** When the system issues an intervention (hold for 20 sec), the team can ask "why?" and trace through the simulation. With ABM, the answer is "emergent behavior from agent rules," which is harder to defend operationally.

3. **Validation cost:** We have 6 months of historical GPS traces. We can replay the simulator offline, comparing predicted vs. actual arrivals for every stop on every trip. That's ~100K trips to validate. With ABM, the same validation would require calibrating 5–10 agent parameters, and we'd never be confident we got it right.

4. **Incrementalism:** DES is a lower-risk first step. If it works (predicts 80%+ of bunching incidents), we're done. If it doesn't work (model blindness to certain failure modes), we can pivot to ABM knowing where the gaps are.

### The Caveat

DES succeeds only if the dwell model is good (RMSE ≤15 sec). The team has already started retraining with accessibility features. If retraining improves from ±20 sec to ±15 sec, DES will predict headway within ±30 sec on 15-minute horizons (error compounds: ~2 sec per stop × 15 stops). That's acceptable for a 3.5-min threshold (240 sec).

If retraining doesn't help (RMSE stays ±20 sec), we'll see false positives (predicting bunching that doesn't happen) at ~15% rate. That's tolerable for month 1; by month 3, if still stuck, we revisit ABM.

---

## Alternatives Considered & Rejected

### Option 3: Hybrid (DES + lightweight ABM)

Simulate deterministically, but if the deterministic prediction is close to the 3.5-min threshold (within ±1 min), run a 10-second ABM "confidence check" to see if driver behavior changes the outcome.

**Why rejected:** Adds complexity without clear benefit. Either DES is good enough (don't need ABM), or it's not (use full ABM). The middle ground is hard to debug.

### Option 4: Pure machine learning (neural network predicting bunching)

Train an LSTM on historical traces to predict "will vehicles bunch in the next 15 min?" as a binary classifier.

**Why rejected:** Black box (can't explain to dispatch why an intervention is needed). Also requires massive training data (100K+ trips), and we'd still need to simulate to generate intervention recommendations.

---

## Implementation Plan

1. **Week 1:** Build deterministic simulator using historical travel-time medians and dwell model.
2. **Week 2:** Validate offline on 30 days of historical traces. Measure precision/recall of bunching detection.
3. **Week 3:** Deploy to staging (shadow mode). Log all predicted interventions; compare to real bunching events.
4. **Week 4:** If precision >75%, enable interventions on Line 7. If <75%, investigate false-positive sources and retune.

---

## Success Criteria

- Predicts ≥80% of bunching incidents (recall ≥0.80).
- Predicts ≤30% false positives (precision ≥0.70).
- Latency ≤100ms per run (under 10% of 5-sec cycle time).

If DES achieves these by end of month 1, it's the baseline for all future headway work. If not, we escalate to ABM.

---

## Open Questions for Team Discussion

1. **Driver behavior modeling:** Should we hardcode "drivers maintain ±5% speed variation," or should we measure actual driver speed profiles? (This affects travel-time prediction accuracy.)

2. **Signal timing uncertainty:** Do we have accurate signal timing for all signals on all lines? If some signals have 10+ sec variance, should we add a confidence interval around predictions?

3. **Fallback on model failure:** If dwell prediction fails (RMSE degrades suddenly), what's the safe default? Currently, we'd issue more conservative interventions (e.g., hold for 30 sec instead of 20 sec). Is that acceptable?

---

## Approval

- [  ] Engineering lead (approval pending)
- [  ] Operations lead (approval pending)
- [  ] Data engineering (approval pending)

This ADR is ready for team review. Comments welcome.
