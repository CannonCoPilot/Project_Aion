# MEMO: Dwell Model Retraining — Data Extraction Findings

**TO:** Dispatch Systems Engineering (AHR team lead)  
**FROM:** Data Engineering (Analytics)  
**DATE:** 2026-08-01 10:30 AM  
**RE:** Critical findings from accessibility data extraction; timeline impact  
**STATUS:** Requires immediate decision on scope/timeline  

---

## Summary

We began extraction of 6-month accessibility event data yesterday (2026-07-30). Preliminary analysis surfaced **three data quality issues** that constrain the dwell model retraining:

1. **Ramp deployment logs are incomplete** at 47 stops (out of 287). Historical data likely missing ramp events; extraction coverage ~83%.
2. **Occupancy sensor accuracy varies by vehicle model.** Newer trams (2023+) report binary door open/close; older trams (2018–2022) also report load (weight in kg). Accessibility features cross models unpredictably.
3. **Rider assist events lack timestamps.** Dispatcher logs record rider assist as trip-level (not stop-level), requiring cross-reference with door logs to infer stop; manual audit needed.

**Impact:** The current extraction plan assumes ~9,600 accessibility events in training set. With coverage issues, we have **~7,100 validated events (~74% of target).** This reduces the signal for training and increases prediction uncertainty.

**Decision Required:** Proceed with 74% coverage and accept 1–2 sec RMSE regression, or extend extraction by 2–3 days to retrofit missing data and achieve 90%+ coverage?

---

## Issue 1: Ramp Deployment Log Gaps (83% Coverage)

### Finding

Cross-checked ramp deployment logs against manual operator logs (dispatch system) for July 2026.

**Result:**
- **47 stops missing ramp logs entirely.** These stops either lack dedicated ramp hardware (older infrastructure) or never recorded ramp deployment events in the system.
- **Of 287 stops, 240 have complete ramp logs (83% coverage).**
- **Stop types affected:**
  - Park-and-ride stops (13 stops): low accessibility infrastructure; rarely used.
  - Suburban low-ridership stops (24 stops): historical low traffic; ramp deployment uncommon.
  - Downtown central stops with high traffic (10 stops): ramp logs **ARE available**, but some gaps in 2–3 week periods (system downtime?).

### Root Cause

Investigation with infrastructure team revealed:
- **Hardware:** Older tram models (T3 class, 2016–2019) don't have electronic ramp sensors. Ramp deployment is manual (driver deploys hydraulic ramp, no log).
- **Software:** Newer tram models (T4, T5 class, 2020+) log ramp deployment automatically, but legacy dispatch system didn't centralize these logs until late 2024. Historical data before Feb 2026 was dropped.
- **Data migration:** When logs were centralized (Feb 2026), some stops' historical records weren't migrated (manual oversight during system upgrade).

### Immediate Workaround

**Option A (Keep as-is; 83% coverage):**
- Train model on stops with complete logs (240 stops).
- For missing 47 stops, fall back to prior model (higher uncertainty).
- **Impact:** Reduces training signal; RMSE on affected stops ~25 sec (no improvement from retraining).
- **Passenger impact:** Park-and-ride and suburban stops continue to have poor headway predictions. Low risk operationally (low passenger volume), but theoretically incomplete.

**Option B (Manual retrofit; 2–3 day delay):**
- Contact operations; request manual accessibility event logs for Feb–Jul 2026 at the 47 problem stops.
- Cross-check with trip logs and occupancy records to infer accessibility events where electronic logs are absent.
- Heuristic: if trip dwell > 80 sec at a low-traffic stop + occupancy changed + no electronic ramp log, mark as likely accessibility event.
- **Impact:** Increases coverage to ~90%; adds 1–2K synthetic accessibility events.
- **Cost:** 2–3 days of manual audit + data entry.
- **Risk:** Synthetic events may be mislabeled; reduces signal purity.

### Recommendation

**Proceed with Option A (83% coverage).** Rationale:

1. **Time-critical:** AHR staging is scheduled for 2026-08-25 (25 days away). Losing 2–3 days for marginal coverage gain is not justified.
2. **Operational risk is low:** The 47 problem stops account for ~12% of passenger volume (low-traffic and park-and-ride). Headway prediction errors there don't cascade (passengers are sparse; bunching is rare).
3. **Model uncertainty is acceptable:** RMSE regression on these stops (25 sec vs. target 15 sec) is noted in model card as a known limitation. Staging can proceed with a caveat.
4. **Technical debt:** Schedule a follow-up in Q4 2026 to retrofit missing logs and retrain model (lower priority).

---

## Issue 2: Vehicle Model Heterogeneity in Occupancy Reporting

### Finding

Occupancy sensors report data differently across tram models:

| Tram Model | Year | Occupancy Data | Door Log | Issue |
|---|---|---|---|---|
| T3 (legacy) | 2016–2019 | None (manual count) | Manual (dispatch) | No digital occupancy; accessibility events inferred from schedules only. |
| T4 (current) | 2020–2022 | Weight (kg) from floor sensors | Auto (electronic) | Weight correlates with ridership but doesn't distinguish boarding method. |
| T5 (newest) | 2023+ | Binary door state (open/close events) + passenger count (IR counter) | Auto (electronic + ramp sensor) | Full signal; best quality. |

**Problem:** The training set mixes all three models. When a T4 tram boards 3 passengers at a stop with ramp deployed, the model sees:
- `occupancy_change = +150 kg` (weight of 3 passengers, typical ~50 kg each)
- `accessibility_event = 1` (ramp log)

But for a T4 tram boarding 3 passengers **without ramp**, we see:
- `occupancy_change = +150 kg` (same weight)
- `accessibility_event = 0`

**The model conflates weight with boarding method.** Ramp deployment adds 10–20 sec to boarding time for the same number of passengers, but occupancy_change is identical.

**Impact:** Feature `occupancy_change` has different semantics across vehicle models. This increases prediction variance and weakens the signal for accessibility features.

### Data Distribution

- **T3 trams:** ~8% of fleet (60 vehicles); ~2% of trips in training set (low revenue hours, mainly night service).
- **T4 trams:** ~42% of fleet (280 vehicles); ~65% of trips in training set.
- **T5 trams:** ~50% of fleet (330 vehicles); ~33% of trips in training set.

**T5 are newest but not yet primary revenue fleet.** Fleet rotation is gradual; T3 will run for 5+ more years.

### Solution

**Stratify training by vehicle model.** Add `vehicle_model` as a feature (categorical: T3, T4, T5).

**Allows the model to:**
1. Learn different feature weights per model (e.g., occupancy_change_t4 vs. occupancy_change_t5).
2. Handle T3 trams (no occupancy data) by falling back to schedule + historical precedent.
3. Reduce prediction variance by accounting for measurement differences.

**Implementation:** Already planned in ZTA-002 (feature set includes `vehicle_model`). No scope change required.

**Risk:** Adds complexity to model deployment (model must know vehicle class of tram at prediction time). But existing dispatch system tracks this; integration is straightforward.

**Action:** No decision required; document in model card as a known source of heterogeneity.

---

## Issue 3: Rider Assist Events Lack Stop-Level Timestamps

### Finding

Dispatcher logs record rider assist events at the **trip level**, not stop level:

**Example trip log entry:**
```
trip_id: T-512-20260728-1735
route_id: Line5
vehicle_id: T-512
rider_assist_requested: true
assistance_type: "wheelchair_boarding"
duration: 94 seconds
```

**Missing:** Which stop did this occur at?

Our current feature engineering assumes we can link a rider assist event to a specific stop using the trip route + timestamp. But trip logs don't record stop timestamps; only the total trip duration.

**Workaround:** Cross-reference with door logs (if available) to infer the stop where door was open longest. But this is **error-prone and manual.**

**Scale of issue:**
- **Total rider assist events in 6 months:** ~480 events (0.8% of trips).
- **Rider assist events with unambiguous stop assignment:** ~360 (75%).
- **Rider assist events requiring manual audit:** ~120 (25%).

### Manual Audit Process

For the 120 ambiguous events, QA manually reviewed trip logs + door logs + dispatch notes:

- **Assigned correctly (90 events):** Pattern matched on duration and door open time.
- **Ambiguous (30 events):** Multiple possible stops or stops where rider assist was requested but other factors (signal delay, traffic) contributed to extended dwell.

### Impact on Training

If we exclude the 30 ambiguous events:
- Training set loses 30 rider assist examples (of ~480 total).
- Remaining 450 events are high-confidence.
- **No significant impact on model accuracy** (450 is sufficient for gradient boosting to learn patterns).

**But:** We may slightly underestimate rider assist dwell times (if the excluded 30 events were particularly long).

### Recommendation

**Exclude the 30 ambiguous events from training.** Rationale:

1. **Signal purity:** 450 high-confidence examples > 480 examples with 6% noise.
2. **No impact on RMSE:** Gradient boosting is robust; 450 is sufficient for rare-class learning.
3. **Operational safety:** If we misclassify a rider assist event to the wrong stop, the dwell model learns incorrect patterns and reduces confidence downstream.

**Action:** QA finalizes manual audit by 2026-08-02 EOD; provides clean 450-event list to data eng.

---

## Revised Training Set Composition

### Original Plan (ZTA-002)

- Total events: 2.7M
- Breakdown:
  - STANDARD: 2.43M (90%)
  - RAMP: ~240K (9%)
  - RIDER_ASSIST: ~27K (1%)

### Revised Plan (with coverage adjustments)

| Category | Original | Adjusted | Delta | Notes |
|---|---|---|---|---|
| STANDARD | 2.43M | 2.40M | -1.2% | Fewer events due to incomplete ramp logs at 47 stops. |
| RAMP | 240K | 200K | -17% | 40K ramp events excluded (stops with <80% log coverage). |
| RIDER_ASSIST | 27K | 21.6K | -20% | 30 ambiguous events excluded; remaining ~450 high-confidence. |
| **Total** | **2.7M** | **2.62M** | **-3%** | Minor reduction; still sufficient. |

### Impact on Model

- **Reduced signal:** 3% fewer events; RMSE impact: +0.3–0.5 sec (model has fewer rare-class examples).
- **Stratified RMSE (expected):**
  - STANDARD: ≤14 sec (unchanged; 90% of data)
  - RAMP: ≤19 sec (up 1 sec due to fewer examples)
  - RIDER_ASSIST: ≤26 sec (up 1 sec due to fewer examples)
- **Target:** Still achievable at RMSE ≤15 sec (acceptable headroom).

---

## Timeline Impact

**No delay to 2026-08-04 deadline.** Here's why:

| Task | Original Plan | Revised Plan | Impact |
|---|---|---|---|
| Data extraction | 2 days (Jul 30–31) | 2 days (Jul 30–31) | No change; we proceed with 83% coverage. |
| Data cleanup (audit + exclude ambiguous events) | 0.5 day (Aug 1 morning) | 0.5 day (Aug 1 morning) | QA audit already in progress; no extension. |
| Training | Aug 1–3 | Aug 1–3 | No change; same hyperparameter tuning. |
| Validation + sign-off | Aug 4 | Aug 4 | No change. |

**Cumulative impact:** 0 days. We absorb the data quality issues without timeline delay.

---

## Risks & Mitigation

| Risk | Probability | Mitigation |
|---|---|---|
| RMSE regresses to 16–17 sec (misses 15 sec target) | Medium | Expected regression ~0.5 sec from fewer examples. Headroom of 1–2 sec built into escalation plan (synthetic augmentation). |
| T4/T5 vehicle model heterogeneity reduces precision | Low | Model already includes vehicle_model feature; tree splits can handle it. No additional risk beyond original plan. |
| Rider assist dwell times systemically underestimated | Low | Excluded only 30 ambiguous events (6% of rider assist class). Impact on overall RMSE negligible (<0.1 sec). |

---

## Decisions Required

**By 2026-08-01 EOD, confirm:**

1. ✓ **Proceed with Option A (83% coverage)** for ramp logs? [Recommended: YES]
2. ✓ **Keep vehicle_model as a feature** (no additional work; already planned)? [Recommended: YES]
3. ✓ **Exclude 30 ambiguous rider assist events** from training? [Recommended: YES]

**If all three are YES:** Extraction resumes without delay; training begins Aug 1 evening.

**If any is NO:** Contact data eng immediately; we'll adjust scope and revise timeline.

---

## Open Questions for Dispatch Systems Eng

1. **Operational tolerance:** If headway predictions on 47 park-and-ride/suburban stops are ~25 sec RMSE (vs. target 15 sec), does this constrain AHR deployment? Low passenger volume suggests low risk; confirm?

2. **T3 tram sunset:** Are T3 trams scheduled for retirement? If yes, training model on their incomplete data is lower priority (they'll be gone). If no, we should retrofit their data later.

3. **Escalation threshold:** If retraining achieves 16 sec RMSE (1 sec over target), do we escalate to synthetic augmentation, or is 16 sec acceptable for staging? Clarify threshold.

---

## Next Steps (2026-08-01)

- [ ] Data eng awaits sign-off decisions (see above) by EOD today.
- [ ] QA finalizes manual audit of 120 ambiguous rider assist events by EOD 2026-08-02.
- [ ] Training pipeline validates data quality checks (missing values, outliers) by 2026-08-02.
- [ ] Hyperparameter tuning begins 2026-08-02 evening (50 trials, ~6 hrs wall clock).
- [ ] Best model selected + test RMSE measured by EOD 2026-08-03.
- [ ] Sign-off decision (proceed or escalate) by EOD 2026-08-04.

---

**Prepared by:** Analytics Team Lead  
**Reviewed by:** [Data Eng Lead]  
**Status:** Awaiting decision

---

## Appendix: Detailed Coverage Map

**Stops with complete ramp logs (240 stops):** All downtown stops + major transfer centers + hospitals.

**Stops with partial/missing ramp logs (47 stops):**
- Park-and-ride: 13 stops (Q5 corridor, airport link)
- Suburban low-traffic: 24 stops (outer lines)
- Downtown with gaps: 10 stops (central area; 2–3 week downtime periods visible)

Contact infrastructure team for details on any specific stop.

