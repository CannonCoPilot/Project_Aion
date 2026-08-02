# Weekly Summary: Adaptive Headway Regulation (2026-07-22 through 2026-07-29)

**Week Ending:** 2026-07-29  
**Owner:** Dispatch Systems Engineering  
**Status:** Design phase complete; ready for implementation kickoff next week.

---

## Executive Summary

This week, the team moved from "headway violations are a persistent operational problem" to "we have a detailed plan to solve it with adaptive headway regulation (AHR)." Design documents, data schema, and implementation roadmap are now in place. The Line 5 bunching incident on Monday (INC-2026-0729) validated the need and motivated final sign-off from operations leadership.

**Key outcome:** AHR is scheduled to enter implementation phase next Monday (2026-08-05). Dwell model retraining is the critical path; if the updated model achieves ≤15 sec RMSE with accessibility features, we're on track for staging deployment by 2026-08-25.

---

## Work Completed

### Design & Specification

- **ZTA-001: Adaptive Headway Regulation** (main design doc)
  - System architecture: 15-minute prediction window, discrete event simulation, micro-interventions.
  - Phased rollout: Week 1–3 dwell model, Week 4–5 simulator, Week 6–8 staging (Line 7), Week 9–12 rollout.
  - Contingency identified: if dwell model RMSE doesn't improve to ≤15 sec, we pivot to lightweight ABM for confidence checks.

- **ADR-0003: Discrete Event Simulation vs. Agent-Based Modeling**
  - Decided on DES as the first approach. Rationale: speed (50 ms per vehicle), transparency (ops team can understand each step), offline validation on 100K historical trips.
  - ABM remains a valid fallback if DES precision drops below 75% in staging.
  - Implementation plan: 4-week validation gate; decision point at end of week 3 (if precision <75%, escalate).

### Data Model & Infrastructure

- **SCHEMA-vehicle-telemetry-v2.md** (PostgreSQL + TimescaleDB)
  - Defined tables: vehicles, trips, stops, telemetry_gps (10 Hz, partitioned by month), telemetry_door (event-driven), telemetry_occupancy (1 Hz).
  - Derived tables: trip_dwell_stats (daily rollup), headway_snapshots (5-minute intervals for dashboards).
  - Tradeoff decisions documented: GPS at 10 Hz vs. 1 Hz (chose 10 Hz for first 7 days, then archive to 1 Hz); occupancy fusion (weight + camera) with confidence scores.
  - Queries optimized for model training (dwell by stop/hour/dow) and operational dashboards (headway status per stop).

### Incident & Root Cause

- **INC-2026-0729: Line 5 Bunching Cascade (2026-07-28)**
  - Timeline: Central Station dwell at T-512 exceeded forecast by 80 sec (accessibility boarding). Cascaded to T-511 and T-510 within 26 minutes. Resolved with manual hold; 42-minute incident.
  - Root cause: Dwell model doesn't segment by accessibility demand. Lack of predictive headway system (dispatch discovered the problem only when four vehicles were misaligned).
  - Corrective actions: Immediate (retrain dwell model), medium-term (build headway dashboard, deploy AHR).
  - Simulation result: AHR would have predicted the bunching at 17:35 (before the cascade) and issued a 20-sec hold to T-512. Cascade prevented. Passengers see zero impact (T-512 was already delayed by the accessibility dwell).

### Team Discussions & Decisions

- **Dwell model retraining (data engineering)**
  - Current model RMSE: ±20 sec. Adding accessibility_event as a feature should improve to ±12–15 sec.
  - Historical data extraction: 6 months of door sensor logs + schedule data, ready for training set assembly.
  - Timeline: Model training by 2026-08-04. Validation holdout set ready by 2026-08-01.

- **Headway prediction simulator (architecture)**
  - DES chosen over ABM for speed and transparency.
  - Baseline deterministic parameters: historical median travel times (by stop pair, time of day), predicted dwell from model, deterministic signal timing.
  - Validation strategy: replay simulator offline on 30 days of historical GPS traces. Measure precision/recall of "will bunching occur" predictions.

- **Operational readiness (dispatch ops)**
  - Line 7 identified as staging line (lowest passenger volume, most tolerant of experimental features).
  - Driver briefing prepared (manual override always available, intervention is advisory, expected to see occasional 20–30 sec holds).
  - Dispatch team to monitor headway dashboard (new artifact) starting 2026-08-01 for baseline metrics.

---

## Metrics & Baseline

Before AHR, Line 5 bunching incidents: **1.2 per week** (defined as 2+ vehicles within 6 minutes).

**Simulation results** (offline on historical traces):
- If AHR issues holds at predicted bunching: incidents reduced to **~0.3 per week** (75% reduction).
- Operational cost of interventions: ~3 holds per shift on Line 7 (~2% of vehicle stops). Within acceptable range.
- Passenger wait time impact: +5 sec average (a 20-sec hold distributed across passengers boarding over 5 min). Outweighed by bunching-avoidance benefit (12+ min waits prevented).

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Dwell model retraining doesn't improve RMSE | Medium | Staging delayed 2 weeks | Escalate to data eng.; consider synthetic data augmentation. |
| Driver opt-out rate >30% in staging | Low | Interventions ignored; bunching continues | Adjust intervention heuristic (softer holds, better timing). |
| Headway predictions systematically off by >60 sec | Low | False positives; dispatch loses trust | Fallback to manual dispatch; revisit simulator assumptions. |
| GPS dropout causes simulator to operate on stale data | Low | Mispredicted hold timing | Require <2 sec GPS age; fall back to dead-reckoning. |

**Most likely blocker:** Dwell model retraining. If accessibility data doesn't separate cleanly from general ridership variation, RMSE improvement will be modest. Mitigation: parallel track lightweight ABM if retraining stalls.

---

## Next Week's Priorities (2026-08-05 onward)

1. **Data extraction & model training** (data eng.)
   - Extract 6 months dwell data + accessibility labels.
   - Train XGBoost; baseline RMSE on held-out set.
   - Goal: ≤15 sec RMSE by 2026-08-04.

2. **Simulator implementation** (dispatch systems eng.)
   - Build deterministic stop-by-stop simulator using historical travel times + predicted dwell.
   - Implement headway detection (flag if any downstream headway <3.5 min).
   - Integrate into existing dispatch backend (API endpoint: `POST /predict-headway?vehicle_id=T-512`).

3. **Validation infrastructure** (QA/analytics)
   - Replay simulator on 30 days of historical GPS.
   - Measure precision/recall: "Simulator predicts bunching; did it actually happen?"
   - Target: ≥80% recall, ≥75% precision.

4. **Headway dashboard** (frontend)
   - Prototype dashboard showing real-time headway status per stop (compliant / at-risk / bunching).
   - Snapshot every 5 seconds; dispatch can see trends and early warning.

---

## What Worked This Week

- **Incident timing:** The Line 5 bunching cascade on Monday gave the team a concrete motivator. Simulation results on that incident convinced operations leadership to greenlight AHR.
- **Design document discipline:** ZTA-001 forced us to reason through interventions, phased rollout, and success criteria upfront. Caught the "dwell model is the constraint" issue early.
- **Cross-team collaboration:** Data eng., dispatch ops, QA, and frontend all contributed to schema, implementation plan, and success criteria. Reduced later surprises.

---

## What Needs Improvement

- **Model governance:** Before retraining, we should have a formal sign-off process. Currently, data eng. trains the model, validation happens after. Recommend: model change review (does new model violate any operational constraints?).
- **Staging readiness:** Driver briefing and onboarding happen late (week 6). Should be earlier so training begins concurrently with simulator development.

---

## Appendix: File Index

| Document | Purpose | Status |
|---|---|---|
| ZTA-001-headway-regulation.md | Main system design | Final |
| INC-2026-0729-line5-bunching-cascade.md | Incident post-mortem | Final |
| ADR-0003-simulation-architecture.md | Architecture decision (DES vs. ABM) | Awaiting team sign-off |
| SCHEMA-vehicle-telemetry-v2.md | PostgreSQL + TimescaleDB schema | Ready for data eng. review |
| WEEK-SUMMARY-2026-07-29.md | This document | Final |

All documents live in `.claude/context/protos-sandbox/` (JICM test lane).

---

**Next summary:** 2026-08-05 (weekly cadence).

**Prepared by:** Dispatch Systems Engineering  
**Reviewed by:** [pending operations sign-off]
