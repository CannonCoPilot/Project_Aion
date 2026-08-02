# ZTA-001: Adaptive Headway Regulation System

**Status:** Design Phase  
**Owner:** Dispatch Systems (this engineer)  
**Last Updated:** 2026-07-29  
**Target Completion:** TBD

## Problem Statement

The Zephyr Transit Authority operates 14 tram lines across the downtown network, with peak-hour headways (time between consecutive vehicles) specified as 4–8 minutes depending on line and time-of-day. Currently, headway compliance is reactive: the central dispatch team monitors real-time vehicle spacing and issues manual interventions (hold-at-platform, speed-adjustment) when bunching (clusters of vehicles arriving together) occurs.

This is operationally expensive and reactive. When a tram encounters unexpected dwell time (passengers boarding/alighting takes longer than forecasted), or when signal timing becomes misaligned, a single disturbance can propagate downstream, creating a cascade where three consecutive vehicles bunch within 2–3 minutes. Passengers at downstream stops then face either a 12+ minute wait or pack into an overfull vehicle.

**Root cause:** We forecast headway compliance at schedule-build time (3 months prior) but operate with no real-time headway feedback loop. Drivers know their stop-to-stop times; dispatch knows vehicle GPS; but there is no model that predicts whether *this vehicle's dwell* will push the network into a bunching state, and no automated response to prevent it.

## Proposed Solution: Adaptive Headway Regulation (AHR)

Build a real-time service that:

1. **Ingests live GPS + door-state telemetry** (10 Hz) from the vehicle fleet
2. **Simulates forward 15 minutes** to forecast whether headway targets will be met
3. **Issues micro-interventions** (gentle hold-at-stop, speed variance within driver comfort) if the forecast predicts bunching
4. **Learns from outcome** to refine dwell-time estimates and forecast accuracy

### Key Design Choices

#### 1. Prediction Window: 15 Minutes

Why 15 min? A 4-minute headway means 3–4 vehicles in the prediction window simultaneously. Extending beyond 15 min introduces too many branch points (junction routing choices, schedule changes, signal timing variance). Shorter than 10 min leaves insufficient reaction time for a driver to adjust. 15 minutes balances reactivity against forecast noise.

#### 2. Dwell-Time Model

Dwell time (how long a tram stops) depends on:
- **Time of day** (0600–0900: boarding-heavy, ~60 sec; 1000–1600: lighter, ~35 sec)
- **Stop identity** (major transfer points like Central Station: ~90 sec; local stops: ~20 sec)
- **Vehicle occupancy on arrival** (fuller vehicles have longer dwell; empty vehicles board quickly)
- **Weather** (rain increases dwell by ~15%)
- **Recent service history** (if the previous vehicle was late, riders cluster at this stop)

The model will use a gradient-boosted tree (XGBoost) trained on 6 months of historical dwell data (we have that). Input features: stop_id, hour_of_day, day_of_week, vehicle_occupancy_arrival, precipitation, vehicle_delay_inbound. Target: dwell_duration.

Expected baseline RMSE on test set: ~12 seconds (current ±20 second variance in manual dispatch estimates, so this is an improvement).

#### 3. Headway Prediction: Discrete Event Simulation

For each vehicle currently active on a line:
- Simulate its progression stop-by-stop using (a) observed speed profile, (b) predicted dwell at each upcoming stop, (c) signal timing (deterministic, we own the signals).
- Run the same simulation for the vehicle behind it, assuming it maintains current speed.
- Output: predicted arrival time at every downstream stop for both vehicles.
- Headway = arrival(vehicle_N+1) - arrival(vehicle_N). If any downstream headway < 3.5 min, flag as at-risk.

Complexity: ~200 vehicles, ~500 stops, 15-minute prediction window = ~15,000 stop-passage events. At 10 Hz telemetry, we can afford to re-simulate every 5 seconds (50 ms compute budget per vehicle).

#### 4. Intervention Heuristic

If the simulation predicts bunching:

- **Delay the earlier vehicle** (hold at a stop for up to 30 seconds) rather than accelerating the later one. Rationale: accelerating consumes energy, stresses the platform, and is less comfortable for passengers.
- **Apply minimum intervention:** if a 10-second hold is sufficient, hold for 10 seconds, not 30. We don't want to inflate passenger wait times unnecessarily.
- **Driver override:** the intervention is advisory. Driver always has the final say (safety critical).
- **Fade out** if headway recovers naturally (no intervention needed).

#### 5. Learning Loop

Weekly, a batch job will:
- Compare predicted vs. observed dwell for all stops on all trips from the past week.
- Retrain the dwell model with new data.
- Log prediction errors by stop and hour to identify systematic biases (e.g., "our model underestimates dwell at the Central Station 07:45 peak").

This keeps the model honest and surfaces where human intuition or new passenger patterns are changing the system.

## Implementation Roadmap

**Phase 1 (Weeks 1–3):** Build dwell-time model, validate RMSE on held-out test set.  
**Phase 2 (Weeks 4–5):** Implement discrete event simulator; run offline against 2 weeks of historical GPS traces.  
**Phase 3 (Weeks 6–8):** Deploy to staging (shadow mode: predict but don't intervene). Log all would-be interventions. Measure false-positive rate (interventions that weren't needed).  
**Phase 4 (Weeks 9–12):** Gradually enable interventions on Line 7 (quietest line, lowest passenger volume). Measure actual headway compliance before/after.  
**Phase 5:** Expand to remaining lines.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Dwell model mispredicts (e.g., unexpected event at a stop) | Bunching happens despite prediction | Shadow mode for 4 weeks; log misses. Retrain weekly. |
| Driver ignores advisory and vehicle still bunches | Passenger experience worsens | Measure opt-in rate; if <70%, something is wrong with the heuristic (too frequent, too late). |
| GPS latency or dropout | Simulator operates on stale data, predicts wrong | Require <2 sec GPS age; fall back to dead-reckoning if older. |
| Signal timing changes mid-week | Simulator assumes static timing | Poll signal controller API hourly for timing changes. |

## Success Criteria

- **Headway compliance:** On Line 7 after Phase 4, mean headway variance should improve from current ±3.2 min to ±1.8 min (measured over 2-week period).
- **Passenger experience:** Reduce bunching-cascade incidents from ~2–3 per week to <1 per week.
- **Operational cost:** Reduce manual dispatch interventions by 40% (fewer conversations between dispatch and drivers).
- **Model accuracy:** Dwell RMSE ≤15 seconds on all stops.

## Open Questions

1. Should the intervention heuristic be symmetric (hold *or* accelerate), or is holding-only correct? Needs field testing.
2. The dwell model trains on historical data, but new transit patterns (e.g., a concert venue opening) aren't in the training set. Should we have a "anomaly mode" that flags predictions >2 standard deviations from normal?
3. How sensitive is the headway prediction to signal timing? If a traffic light timing changes by 10 seconds, does the predicted bunching still happen 80% of the time?

---

## Next Steps

1. Extract 6 months of dwell data from the live system (need DB query).
2. Split into train/test (80/20, stratified by stop and hour).
3. Train XGBoost model; establish baseline RMSE.
4. Begin discrete event simulator prototype.
