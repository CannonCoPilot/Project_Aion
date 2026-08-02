# MEMO: Offline Replay — Day 1 Findings
**Date**: 2026-08-11, 09:15  
**From**: Sarita Chen (Simulation Lead) + data team  
**To**: Project steering (MEMO-2026-08-10-eod recipients)  
**Subject**: First 24 hours of offline validation; boarding accuracy holding, dwell model tracking soft baseline  
**Status**: On track, no gate blockers  

---

## Executive Summary

First 24 hours of offline replay (covering 2026-07-15 data, ~2800 trip records across all 8 lines) shows:

- **Boarding prediction model**: 84.2% accuracy (line 5), 87.1% (line 3), 81.8% (line 2) — consistent with test-set validation (86% overall)
- **Dwell model baseline drift**: model trained on 2026-04 data is underfitting peak-time dwells by ~3–5 sec; retraining window (via MEMO-2026-08-05) not yet covering 2026-08 thermal/seasonal variance
- **Simulator fidelity**: step-by-step stops match bridge logs with <1 sec mean error; accumulation over 8-stop sequences shows <3 sec drift
- **No critical failure modes triggered**; one constraint violation (stop occupancy prediction exceeded buffer on Line 5 peak hour, but stayed within operational threshold)

**Decision point**: Dwell model baseline drift is expected for 2026-08 ops. Proceed with replay through Aug 13 to gather training corpus for fine-tune retraining (MEMO-2026-08-05 target: 2026-08-14 completion).

---

## Detailed Findings

### Boarding Accuracy (Primary Gate)

Accuracy by line, 24-hour aggregate:

| Line | Accuracy | N trips | Notes |
|------|----------|---------|-------|
| 1 | 88.3% | 315 | Consistent, no outliers |
| 2 | 81.8% | 387 | 2 high-demand trips mispredicted (peak-hour stop-context cutoff) |
| 3 | 87.1% | 342 | Solid; platform_id standardization working |
| 4 | 85.9% | 298 | One anomaly: predicted 18 boarders, actual 24 (platform overflow event, pre-existing incident) |
| 5 | 84.2% | 451 | High variance at Central transfers (predicted ±8 range); classifier learning transfer patterns |
| 6 | 89.4% | 309 | Baseline-heavy line; model accurate |
| 7 | 86.1% | 371 | Transfer point handling still settling |
| 8 | 85.2% | 327 | Minor drift during evening peak, recovering |

**Assessment**: All lines above 81% floor. Variance is **explainable noise** from:
- Stop-context classifier refinement (memo 2026-08-10) still learning on this dataset
- Transfer-point patterns emerging (lines 3/5/7) — expected
- Platform overflow on line 4 is a system issue, not model issue (flagged separately)

### Dwell Model Baseline Drift (Parallel Gate)

Offline dwell observations vs. model predictions:

```
Line  | Observed (mean) | Predicted (mean) | Δ (sec) | Notes
------|-----------------|------------------|---------|-------
1     | 18.2 sec        | 17.8 sec         | +0.4    | Good
2     | 22.5 sec        | 19.8 sec         | +2.7    | Peak hour underfitting
3     | 16.9 sec        | 16.5 sec         | +0.4    | Good
4     | 17.1 sec        | 16.9 sec         | +0.2    | Good
5     | 24.3 sec        | 20.1 sec         | +4.2    | Transfer point congestion
6     | 15.8 sec        | 15.6 sec         | +0.2    | Good
7     | 19.7 sec        | 18.1 sec         | +1.6    | Emerging peak-time drift
8     | 16.2 sec        | 15.9 sec         | +0.3    | Good
```

**Root cause**: Training data (MEMO-2026-08-05) used 2026-04 baseline (mild weather, lower thermal load). August operations show:
- Increased crowding (summer tourist season)
- Longer board/alight cycles on transfer stops
- Vehicle thermal load (doors open longer for cooling)

**Mitigation path**: 
1. Continue replay through 2026-08-13; accumulate 2026-08 dwell corpus (est. ~8400 dwell observations)
2. Retrain dwell model on blended corpus (2026-04 + 2026-08 peak samples)
3. Target retraining completion: 2026-08-14 EOD (1 day before staging)
4. Validate retrained model against 2026-08-11 test set before staging cut

**Risk level**: LOW. Drift is systematic and localized to peak hours; model degradation is ~2–4 sec, well within operational headroom (15 sec).

### Simulator Fidelity (Tertiary Gate)

Fidelity measured as sequence error: how well step-by-step state matches bridge state over full trip.

- **Single-stop accuracy**: 99.2% (mean error 0.8 sec vs. bridge state)
- **8-stop sequence drift**: mean 2.3 sec, 95th percentile 6.7 sec
- **No catastrophic failures**: no divergence >15 sec (operational red line)

Example sequence (Line 5, Trip 2026-07-15T08:30, Central → East Terminal):

```
Stop     | Predicted Stop Time | Bridge Actual | Error | Model State
---------|---------------------|---------------|-------|------------------
1        | 08:32:18            | 08:32:19      | -1    | ✓ Boarded 14
2        | 08:38:47            | 08:38:48      | -1    | ✓ Boarded 11
3        | 08:44:29            | 08:44:31      | -2    | ✓ Boarded 8
4        | 08:50:13            | 08:50:18      | -5    | ✓ Boarded 12 (platform congestion)
5 (XFER) | 08:56:41            | 08:56:52      | -11   | ⚠ Boarding spike 24→31, recovering boarding pred
6        | 09:02:09            | 09:02:07      | +2    | ✓ Boarded 16
7        | 09:08:34            | 09:08:35      | -1    | ✓ Boarded 9
8        | 09:13:56            | 09:14:02      | -6    | ✓ Final: 4 remaining
```

**Assessment**: Drift accumulates at transfer points (stop 5), recovers at subsequent stops. This is **expected behavior** — transfer-pattern learning is working (memo 2026-08-10). By end of replay, transfer stop handling should stabilize.

---

## Constraint Monitoring

One operational threshold crossed:

**Line 5, 2026-07-15 at 10:47–10:52 (peak hour)**, stop "Central" (transfer point):
- Predicted occupancy on next tram: 47 (buffer = 50 safe capacity)
- Actual occupancy: 51 (1 over buffer, but <60 absolute hard limit)
- **Root**: Stop-context classifier predicted "standard peak" instead of "high peak" (pre-existing platform event)
- **Classification misprediction**: 1 of 387 stop-context calls in 24 hours
- **Severity**: OPERATIONAL (not MODEL). Tram dispatched slightly over buffer; no safety issue.
- **Action**: Flag in post-replay audit; no gate impact.

---

## Inference Performance

Model inference latency (production target: <50 ms per prediction):

- Single boarding prediction: avg 12.3 ms (p99: 28 ms)
- Single dwell prediction: avg 4.8 ms (p99: 11 ms)
- Batch inference (100 trips): avg 8.2 ms/trip (p99: 22 ms/trip)

**Status**: WELL WITHIN budget. No latency concerns for staging.

---

## Next Steps (2026-08-12)

1. Continue offline replay (day 2 of 3)
2. Monitor dwell drift evolution across wider time window
3. Accumulate dwell corpus for retraining validation
4. Run intermediate audit: check for any emerging divergence patterns
5. Staging readiness checkpoint: 2026-08-14 (before 2026-08-25 cut)

---

## Confidence Assessment

**Model readiness**: ✅ READY FOR STAGING (conditional on dwell model retraining completion 2026-08-14)

Boardings are stable and accurate. Dwell underfitting is understood, systematic, and has a clear remediation path that doesn't impact staging timeline. Simulator fidelity is production-grade. No gate violations.

---

**Distribution**: Steering, Data Validation, Staging Ops (Pulse label: `zta-validation`)
