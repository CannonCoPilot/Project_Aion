# Insights Archive — 2026-08-07
# Rotated: 2026-08-08T03:22:17Z (1 entries)

### 2026-07-08 [122269fe1df0]

The two folds are deliberately opposed. The modern fold collapses spelling variation to test *meaning recovered*; the archaic fold preserves spelling to test *surface fidelity*. That's why a faithful archaic OCR passes **both** (content matches modern Janvier via the skeleton; surface matches archaic s-dismas via the light fold), while a modernized transcription would pass modern but *fail* archaic — which is exactly what you want, because the deliverable's archaic layer (idx109) must reproduce the diplomatic surface, not a clean-up. The self-check at the bottom of the file proves the discrimination is real (`archaic-vs-sdismas − archaic-vs-modern ≥ 0.05` per differing word, compounding at chapter scale).

# Insights Archive — 2026-08-07
# Rotated: 2026-08-08T04:05:43Z (1 entries)

### 2026-07-08 [0fc85e8964e8]

So your idea #1 ("lift all sources into the same structure so matching is a coordinate 1:1") is **already done for scripture across all transcribed sources**, and OCR emits into the identical schema. The liftover you're asking about isn't a build-from-scratch — it's a *promotion*: make the skeleton-keyed reads the authoritative artifact and attach per-cell scores to them. The genuinely unbuilt part is **apparatus/marginalia** (only `madueke_b` currently carries `apparatus_blocks`) — which is also the harder coordinate problem, more below.

