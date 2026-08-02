# ZTA-002: Dwell Model Retraining — Technical Implementation Plan

**Date Created:** 2026-07-30  
**Owner:** Data Engineering (Dispatch Analytics)  
**Status:** Planning / Ready for implementation 2026-08-05  
**Critical Path:** Yes (blocks AHR staging by 2026-08-25)

---

## Executive Summary

The current dwell time prediction model (trained Q1 2026) achieves ±20 sec RMSE across all stops and time periods. Analysis of the Line 5 bunching incident reveals the model's blind spot: **it does not segment by accessibility demand**, resulting in severe underprediction (80+ sec) when passengers using mobility devices board.

This document outlines the retraining strategy: add accessibility event as a categorical feature, retrain using 6 months of historical data, and validate against a held-out test set by 2026-08-04. If retraining achieves ≤15 sec RMSE, we proceed to AHR staging. If not, we escalate to synthetic data augmentation or lightweight ABM fallback.

**Timeline:** 6 days (2026-07-30 through 2026-08-04).

---

## Current State Analysis

### Existing Model (Q1 2026)

**Architecture:** XGBoost gradient-boosted decision trees.

**Features:**
- `hour_of_day` (0–23)
- `day_of_week` (0–6, Mon–Sun)
- `route_id` (tram line; 15 unique values)
- `stop_id` (station identifier; 287 unique across all lines)
- `weather_condition` (categorical: clear, rain, snow; inferred from historical logs)
- `is_peak_period` (binary; peak = 07:00–09:00, 16:00–19:00)
- `crowding_proxy` (inferred from odometry; occupancy at previous stop)

**Training Data:** 90 days (Q1 2026: Jan, Feb, Mar). **Sample count:** ~2.1M dwell events.

**Validation Method:** Time-series split (train on first 80 days, test on last 10 days).

**Current RMSE:** 20.3 sec (test set).

**Median Absolute Error (MAE):** 12.1 sec.

**90th Percentile Error:** 38 sec (long tail from accessibility and service disruptions).

---

### Blind Spot: Accessibility Demand

**Observation from INC-2026-0729:**
- Central Station (stop ID 42) at 17:35: predicted dwell = 28 sec, actual dwell = 108 sec.
- Manual inspection of door logs: 3 passengers using accessible boarding (ramp deployment, 15–20 sec each).
- Current model saw 3 passenger boardings (via occupancy), but did NOT segment by boarding method.

**Root Cause:** The current feature set conflates standard boarding with accessible boarding. When occupancy increases by N passengers, the model predicts a linear increase in dwell. Accessible boarding is **non-linear** (3 passengers with ramp = 60+ sec; 3 passengers standard = 12–18 sec).

**Impact on RMSE:**
- High-accessibility stops (medical centers, senior services): model RMSE ~28 sec.
- Low-accessibility stops: model RMSE ~17 sec.
- Weighted average (current): 20.3 sec.

**Why This Matters for AHR:**
- The dwell prediction error directly inflates headway prediction errors.
- If dwell is off by 80 sec, the simulator will mispredict bunching timing by ~80 sec, reducing precision.
- Validation target (≥75% precision) will fail unless RMSE improves.

---

## Retraining Strategy

### Phase 1: Data Extraction & Feature Engineering (2026-07-30 to 2026-08-01)

#### Data Sources

1. **Door Sensor Logs** (6 months: Feb–Jul 2026)
   - Table: `telemetry_door` (once we build it; for now, raw logs in CSV archive)
   - Fields: `trip_id`, `stop_id`, `timestamp`, `door_id`, `event_type` (open/close)
   - **Challenge:** Distinguish ramp deployment from standard door opening.
   - **Solution:** Ramp deployment logs a distinct `door_open_ramp` event (unique hardware signal). Cross-check against maintenance logs.
   - **Expected volume:** ~6.2M door events (6 months, 287 stops, ~10 events per stop per day).

2. **Accessibility Service Records** (6 months: Feb–Jul 2026)
   - Table: `service_accessibility` (new; ingest from dispatch logs)
   - Fields: `trip_id`, `stop_id`, `timestamp`, `ramp_deployed`, `rider_assist_requested`, `extended_hold_issued`
   - **Volume:** ~9,600 accessibility events (6 months, ~50 per day average; peaks on weekends).

3. **Trip & Schedule Data**
   - Table: `trips` (schedule adherence)
   - Fields: `trip_id`, `route_id`, `vehicle_id`, `stop_id`, `scheduled_arrival`, `actual_arrival`, `scheduled_departure`, `actual_departure`
   - **Volume:** ~500K trips (6 months, ~2,700 trips per day).

#### Feature Engineering

**New Features for Retrained Model:**

1. **`accessibility_event` (binary)**
   - `1` if ramp deployed at this stop on this trip; `0` otherwise.
   - Derived from `service_accessibility.ramp_deployed`.
   - **Cardinality impact:** Adds ~1.5% prevalence (9,600 events / 6.2M door events).

2. **`accessibility_demand_category` (categorical, 3 levels)**
   - **STANDARD:** No accessibility event; typical boarding.
   - **RAMP:** Ramp deployed; extended boarding time expected.
   - **RIDER_ASSIST:** Rider assistance requested (driver + dispatcher involved); highest dwell impact.
   - Derived from `service_accessibility`.
   - **Rationale:** Rider assist events are rarer but have outsized dwell impact (60–120 sec). Separate category allows model to learn distinct patterns.

3. **`num_accessible_boarders` (count, 0–N)**
   - Count of passengers boarding during accessibility event.
   - Derived by correlating door events with occupancy sensors and trip-level boarding counts.
   - **Challenge:** Occupancy sensors don't distinguish boarding method; use heuristic: if `accessibility_event=1`, assume first N passengers are accessible boarders (N inferred from occupancy delta).
   - **Validation:** Manual audit of 100 trips with `accessibility_event=1`; refine heuristic if accuracy <80%.

4. **`preceding_dwell_time` (seconds)**
   - Dwell time at previous stop (same trip).
   - Captures cascade effects (if previous stop was long, drivers may rush current stop).
   - **Domain:** 0–240 sec (clamped at 240).

5. **`is_accessible_stop` (binary)**
   - `1` if stop has dedicated accessibility infrastructure (priority platform, level access, wheelchair spaces); `0` otherwise.
   - Inferred from network graph (asset database).
   - **Rationale:** Ramps deploy faster at accessibility-first stops; reduce dwell prediction variance.

**Retained Features (no change):**
- `hour_of_day`, `day_of_week`, `route_id`, `stop_id`, `weather_condition`, `is_peak_period`, `crowding_proxy`.

**Dropped Features (redundancy):**
- None (all current features have signal; don't remove to maintain backward compat).

#### Training Data Assembly

**Process:**
1. Extract 6 months of door events, accessibility records, and trip schedules.
2. Compute dwell time for each trip-stop combination: `dwell = actual_departure - actual_arrival`.
3. Join with new features (accessibility event, demand category, etc.).
4. Stratify by accessibility level: separate datasets for STANDARD, RAMP, RIDER_ASSIST.
5. Combine into single training set with balanced class weights.

**Data Quality Checks:**
- Remove trips with dwell < 5 sec (data errors; door didn't fully open).
- Remove trips with dwell > 300 sec (service disruptions; unrelated to normal boarding).
- Flag and inspect trips with accessibility event and dwell < 20 sec (possible misclassification).
- Impute missing values (rare; weather data) using forward-fill from previous day.

**Expected Training Set Size:** ~2.7M dwell events (6 months, scaled from current 2.1M for Q1).

---

### Phase 2: Model Training (2026-08-01 to 2026-08-03)

#### Model Selection: Why XGBoost?

We will **retain XGBoost** as the base learner. Rationale:

1. **Interpretability:** Tree-based models allow us to inspect feature importance and decision rules. Critical for ops team to trust model behavior.
2. **Robustness to categorical features:** XGBoost handles categorical splits natively (route_id, stop_id, accessibility_demand_category). No one-hot encoding needed for high-cardinality features.
3. **Training speed:** ~5 min to train on 2.7M events (baseline was ~3 min on 2.1M).
4. **Established pipeline:** Our current validation harness is built around XGBoost; reusing it minimizes integration risk.
5. **Fallback clarity:** If retrained XGBoost fails to improve, we pivot to ensemble (XGBoost + simple rule-based model for accessibility events) rather than rewriting from scratch.

#### Hyperparameter Tuning

**Baseline (current model):**
- `max_depth`: 8
- `learning_rate`: 0.05
- `n_estimators`: 500
- `subsample`: 0.8
- `colsample_bytree`: 0.7
- `reg_lambda`: 1.0 (L2 regularization)

**Tuning Strategy (Bayesian Optimization, 50 trials):**

We will search the space:
- `max_depth`: [4, 12] (allow deeper trees for accessibility segmentation)
- `learning_rate`: [0.01, 0.1] (fine-grained search)
- `n_estimators`: [300, 800] (more boosting rounds if needed)
- `subsample`: [0.6, 1.0]
- `colsample_bytree`: [0.5, 1.0]
- `reg_lambda`: [0.1, 10.0] (regularization; prevent overfitting to accessibility features)

**Objective:** Minimize validation RMSE on held-out test set.

**Stopping Criterion:** If no improvement >0.5 sec RMSE for 10 consecutive trials, stop early.

#### Class Balancing

The new accessibility features are imbalanced:
- STANDARD: ~90% of events.
- RAMP: ~9% of events.
- RIDER_ASSIST: ~1% of events.

**Solution:** Use `scale_pos_weight` and instance weighting in XGBoost:
- Assign weight 1.0 to STANDARD events.
- Assign weight 3.0 to RAMP events (underrepresented).
- Assign weight 8.0 to RIDER_ASSIST events (severely underrepresented).
- Allows model to learn rare patterns without losing STANDARD boarding performance.

#### Validation Strategy (Time-Series Split)

**Dataset Split:**
- **Train:** Feb 1 – Jun 30 (5 months, ~2.25M events).
- **Validation (tuning):** Jul 1 – Jul 15 (2 weeks, ~0.22M events).
- **Test (final RMSE):** Jul 16 – Jul 31 (2 weeks, ~0.22M events).

**Rationale:**
- Preserves temporal order (don't train on July data, then test on June data).
- Test set includes recent incidents (Line 5 bunching on Jul 28), so RMSE will reflect model's ability to handle known blindspots.

**Holdout Strategy:** Never leak test set to hyperparameter tuning. Use validation set only.

#### Success Criteria

**Primary:** Test RMSE ≤ 15.0 sec.

**Secondary (stratified RMSE):**
- STANDARD boarding: ≤ 14 sec (must not degrade).
- RAMP boarding: ≤ 18 sec (critical improvement from current ~28 sec).
- RIDER_ASSIST: ≤ 25 sec (hard to predict; accept higher error).

**If Primary Fails (RMSE > 15.0 sec):**

**Escalation Path A (Synthetic Data Augmentation):**
- Generate synthetic accessibility events by replaying historical ramp deployments with perturbed occupancy levels.
- Example: if a ramp deployment took 65 sec with 2 accessible boarders, create variants with 1 boarder (40 sec) and 3 boarders (85 sec) by interpolation.
- Retrain on augmented set (original + synthetic, ratio 1:1).
- Expected gain: 1–2 sec RMSE if accessibility variance is the constraint.
- Timeline: +2 days.

**Escalation Path B (Lightweight ABM):**
- Fall back to simple rule-based model for accessibility events.
- Rule: `dwell_accessible = 25 sec baseline + (15 sec * num_accessible_boarders)`.
- Use XGBoost only for STANDARD boarding.
- Ensemble prediction: if `accessibility_event=1`, use rule; else use XGBoost.
- Expected accuracy: Simpler but more robust (rules are interpretable).
- Timeline: +1 day.

---

### Phase 3: Validation & Documentation (2026-08-04)

#### Offline Replay Validation

Once the model is trained, we will replay it against **30 days of historical GPS traces** (Jul 1–30) and measure:

**Metric 1: Prediction Error Distribution**
- Mean Absolute Error (MAE): target < 12 sec.
- Root Mean Square Error (RMSE): target ≤ 15 sec.
- 90th Percentile Error: target < 32 sec (vs. current 38 sec; acceptable 6 sec wiggle room).

**Metric 2: Recall by Accessibility Event**
- Of trips with `accessibility_event=1` in test set, what fraction did the model predict dwell > 20 sec?
- Target: ≥ 90% recall (catch accessibility events, avoid false negatives).

**Metric 3: False Positive Rate**
- Of trips with `accessibility_event=0` predicted as dwell > 60 sec, what fraction were actually < 30 sec (false alarm)?
- Target: < 5% false positive rate (avoid over-conservative estimates).

#### Compatibility Checks

Before sign-off:
1. **Compare model predictions on Q1 2026 data (old test set).** Ensure RMSE did not regress on historical data.
2. **A/B scenario:** Simulate Line 5 bunching incident with new model. If predicted dwell at Central Station would have been 95+ sec (vs. actual 108 sec), model is acceptable.
3. **Edge case audit:** Manually inspect 20 trips with highest prediction error. If errors are due to rare events (freight tram, special events), document as acceptable.

#### Model Card & Deployment Documentation

Write a **model card** documenting:
- Training date, feature set, hyperparameters.
- Test RMSE, stratified error by accessibility event.
- Known limitations (e.g., "model performs poorly on snow days; MAE +5 sec").
- Fallback rules (if prediction confidence < 0.7, use conservative 40-sec estimate).

---

## Risk & Mitigation

| Risk | Probability | Mitigation |
|---|---|---|
| Accessibility data extraction incomplete (ramp logs missing) | Medium | QA audit first 1,000 accessibility events manually; measure extraction accuracy. If <85%, use heuristic occupancy delta. |
| Retraining achieves only ±18 sec RMSE (misses target) | Medium | Escalate to synthetic data augmentation (+2 days) or ABM fallback (+1 day). Schedule decision point: 2026-08-03 EOD. |
| New model overfits to accessibility events, degrades on standard boarding | Low | Hold-out test set; stratified RMSE catches this. If STANDARD RMSE regresses >1 sec, retune regularization. |
| Data quality issues (missing values, outliers) undetected | Low | Data validation pipeline: unit tests on extraction; scatter plots of feature distributions. |

**Critical Path:** If retraining + escalation takes >6 days, we miss the 2026-08-04 deadline, and AHR staging slips to 2026-09-01. Mitigation: start extraction immediately on 2026-07-30; run parallel hyperparameter tuning (Bayesian opt on cloud instance) to compress timeline.

---

## Deliverables

| Deliverable | Owner | Due | Status |
|---|---|---|---|
| Data extraction script + validation tests | Data Eng | 2026-08-01 EOD | Planned |
| Retrained XGBoost model (model file + pickle) | Data Eng | 2026-08-03 EOD | Planned |
| Offline replay validation report (RMSE, stratified error) | QA/Analytics | 2026-08-03 EOD | Planned |
| Model card (docs + hyperparameters) | Data Eng | 2026-08-04 EOD | Planned |
| Sign-off decision (proceed with AHR or escalate) | Dispatch Eng Lead | 2026-08-04 EOD | Planned |

---

## Timeline & Critical Dates

```
2026-07-30 (Tue)  ← Document written; extraction begins
  ├─ Data extraction in progress (door logs, accessibility records)
  ├─ Feature engineering logic coded
  └─ Training pipeline updated for new features

2026-08-01 (Thu)  ← Extraction complete; training begins
  ├─ 2.7M event training set ready for XGBoost
  ├─ Hyperparameter tuning (Bayesian opt) starts (50 trials, ~5 hrs wall clock)
  └─ Validation set ready for tuning feedback loop

2026-08-03 (Sat)  ← Training complete; sign-off decision
  ├─ Best model identified (lowest validation RMSE)
  ├─ Test set RMSE measured (target ≤15 sec)
  ├─ Offline replay validation complete
  └─ **Decision point:** proceed with AHR (RMSE ≤15) or escalate (RMSE > 15)?

2026-08-04 (Sun)  ← Final sign-off
  ├─ Model card written
  ├─ Escalation (if needed) completed
  └─ AHR implementation team unblocked for simulator work (2026-08-05)
```

---

## Success Criteria

✓ **Primary:** Retrained model achieves test RMSE ≤ 15.0 sec by 2026-08-04.

✓ **Secondary:** Stratified RMSE on accessibility events (RAMP ≤ 18 sec, RIDER_ASSIST ≤ 25 sec).

✓ **Confidence:** Model card signed off by data eng. lead; no regression on Q1 test set.

If all criteria met → AHR unblocked for staging deployment 2026-08-25.

If any criterion unmet → Escalate (synthetic augmentation or ABM fallback) and re-evaluate 2026-08-04.

---

## Related Documents

- **ZTA-001-headway-regulation.md** (system design; references dwell model as critical path)
- **SCHEMA-vehicle-telemetry-v2.md** (data infrastructure; defines door events table)
- **INC-2026-0729-line5-bunching-cascade.md** (incident that motivated this retraining)
- **ADR-0003-simulation-architecture.md** (simulator architecture; depends on dwell RMSE)

---

**Prepared by:** Data Engineering  
**Reviewed by:** [Dispatch Systems Eng, pending]  
**Last Updated:** 2026-07-30

