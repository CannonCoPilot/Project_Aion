# Incident Post-Mortem: Line 5 Bunching Cascade (2026-07-28)

**Incident ID:** INC-2026-0729  
**Date/Time:** 2026-07-28, 17:32–18:14 (42 minutes)  
**Lines Affected:** Line 5 (downtown express)  
**Severity:** High (passenger experience; no safety critical)  
**Investigators:** Dispatch Operations, Vehicle Engineering

---

## Timeline

**17:32** — Vehicle T-512 (4:15 PM trip) arrives at Central Station with 2-minute dwell forecast (standard for this time). Door sensors show 128 passengers on board (87th percentile full). Multiple passengers need the accessibility ramp.

**17:34** — Actual dwell: 3 minutes 22 seconds (predicted 2:00). Accessibility ramp deployment and slow boarding from a wheelchair user added ~80 seconds. Vehicle departs late.

**17:36** — Vehicle T-511 (4:20 PM trip, normally 4 min behind T-512) arrives at Central Station. With T-512 only 2 minutes ahead (instead of 4), this is the first headway compression. T-511 dwell forecast: 2:15. Actual observed: 2:40 (T-511 also had accessibility boarding).

**17:38–17:58** — Cascade unfolds:
- T-510 arrives 3.5 min behind T-511 (normal). But the "normal" was designed assuming 4-min spacing upstream. With T-511/T-512 already bunched, T-510 inherits the compressed headway downstream.
- T-510 experiences heavier-than-typical boarding at Civic Plaza stop (a commuter hub) because some passengers who would normally board T-512 or T-511 see them leaving too close together and wait for T-510.
- T-509 (one more vehicle back) is now 2.8 minutes behind T-510.

**18:00** — Dispatch center notices the issue (GPS shows four vehicles within a 10-minute window instead of the expected 16 minutes). Manual intervention begins: dispatch issues a hold order to T-510, requesting a 90-second hold at the next stop (Riverside Junction).

**18:02** — T-510 driver acknowledges hold and stops at Riverside Junction. T-509 is now 4.2 minutes behind and recovering.

**18:14** — T-510 resumes service. Headway cascade has been arrested, but passengers experienced significant waits (15 min for some commuters at stops between 17:45–18:05).

---

## Root Cause Analysis

**Primary:** Accessibility boarding at Central Station took longer than forecasted (80 seconds longer than the 2-minute model assumed).

**Secondary:** No predictive system caught the first compression and prevented the cascade. Dispatch discovered the problem only when four vehicles were already misaligned.

**Contributory factors:**
1. The dwell model (built 6 months ago on historical data) does not segment by accessibility demand. It assumes 2-minute average dwell at Central Station regardless of whether an accessibility passenger is boarding.
2. Passenger rerouting (people waiting for the next vehicle when they see close spacing) is not modeled. The system predicts dwell based on *historic* passenger loads, not real-time decisions.
3. No early-warning system exists. A 15-minute lookahead simulation would have predicted at ~17:35 that T-511 was at risk for bunching at downstream stops, and a gentle hold or speed adjustment for T-512 would have prevented the cascade.

---

## What Worked

- **Driver communication:** T-510 driver responded to the hold order immediately.
- **Dispatch alertness:** A human operator was actively monitoring GPS traces and noticed the compression within 28 minutes (reasonable for the scale of the system).
- **No safety incidents:** Despite the crowding and waits, no passenger injuries or vehicle-control events.

---

## What Didn't Work

- **Model recency:** The dwell model is trained on data that doesn't reflect current boarding patterns (post-summer, more tourists using accessibility services).
- **Manual intervention latency:** By the time dispatch noticed and issued a hold, three vehicles were already misaligned. An automated system could have acted at 17:35 when only two vehicles were at risk.
- **No feedback loop:** After the incident, the dwell model wasn't updated. Future predictions will still use the stale model.

---

## Corrective Actions (Immediate)

1. **Retrain dwell model** to include accessibility-status as a feature (accessible vs. standard boarding). Historical data available from door-sensor logs.
2. **Increase Central Station forecast dwell** from 2:00 to 2:45 until model is retrained (temporary safe upper bound).
3. **Brief dispatch on line 5 risk:** During peak hours (4–6 PM), central station is now an identified pinch point. Increase monitoring frequency.

---

## Corrective Actions (Medium Term)

1. **Build real-time headway monitoring dashboard** showing predicted vs. observed headway for all lines, updated every 5 seconds. Dispatch can see bunching risk before it happens.
2. **Implement adaptive headway regulation system** (see design doc ZTA-001). This would have prevented the cascade entirely by predicting at 17:35 and issuing a 20-second hold to T-512.
3. **Separate accessibility and standard queues** at major stops (Central, Civic, Union) so accessibility boarding doesn't inflate dwell for all passengers. This is a longer-term infrastructure project.

---

## Metrics & Lessons

**Before this incident, Line 5 bunching cascades were occurring ~1.2 times per week** (4–5 per month). This one was typical in severity but well-documented.

**Key insight:** The dwell model is the weak point. It doesn't account for:
- Accessibility demand (80 sec impact)
- Passenger rerouting (15% longer boarding when headways compress)
- Weather (on rainy days, dwell increases, but we don't track precipitation in the model)

If we can improve dwell prediction from ±20 sec (current model RMSE) to ±12 sec (possible with better feature engineering), we eliminate ~60% of bunching cascades, per our simulation.

---

## Action Items

| Owner | Action | Due | Priority |
|---|---|---|---|
| Engineering | Retrain dwell model with accessibility features | 2026-08-04 | High |
| Dispatch Ops | Update Central Station dwell forecast on scheduling system | 2026-07-29 | High |
| Engineering | Build real-time headway dashboard prototype | 2026-08-11 | Medium |
| Engineering | Scope adaptive headway regulation system | 2026-08-01 | Medium |

---

## Appendix: Simulation Results

If AHR had been deployed:
- **Prediction at 17:35:** Model would flag T-512 dwell as 80 sec longer than forecast.
- **Downstream impact:** Simulation shows T-511 and T-512 converging to 2.5-min headway at Civic Plaza.
- **Intervention:** Issue 20-sec hold to T-512 at Central Station (not 90 sec).
- **Outcome:** T-512 departs at 17:55 instead of 17:34. T-511 arrives Civic at 17:46, T-512 at 17:56. Headway = 10 minutes (compliant).
- **Passenger impact:** Zero change (T-512 arrival to downtown was already delayed by the accessibility dwell).

The hold would have been invisible to passengers and would have prevented the cascade.
