#!/bin/bash
# =============================================================================
# Claude Code Environment Configuration
# =============================================================================
# Source this from your ~/.zshrc or ~/.bashrc:
#   source ~/Claude/Project_Aion/.claude/scripts/claude-code-env.sh
#
# These settings optimize Claude Code's context management.
#
# Last updated: 2026-02-06 (threshold analysis + forensic reconstruction)
# =============================================================================

# -----------------------------------------------------------------------------
# CONTEXT MANAGEMENT SETTINGS
# -----------------------------------------------------------------------------

# Maximum output tokens per response (default: 32000, max: 64000)
# Lower values increase usable context before lockout.
# 15000 is a good balance - high enough for substantial responses,
# low enough to maximize context utilization.
# export CLAUDE_CODE_MAX_OUTPUT_TOKENS=15000

# CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
#
# Controls when auto-compaction triggers (1-100). Default: ~95%.
# Only LOWER values have effect; higher values are ignored.
# Effective trigger is ~10% below set value due to internal reserves
# (output buffer + compact operation buffer).
#
# With default 95%:
#   Effective trigger: ~85% of context window (~170K tokens)
#
# SET IN THE LAUNCHER, NOT HERE (2026-08-01).
# launch-aion.sh exports CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 for every lane —
# ~800K on a 1M window, a last-resort backstop far above JICM's 300K soft /
# 330K hard (jicm-config.sh). JICM owns the normal clear+resume cycle.
#
# ORDERING INVARIANT: JICM soft < JICM hard << autocompact pct * window.
# The override is a PERCENTAGE of the window; JICM's thresholds are ABSOLUTE
# tokens in a different file, so nothing enforces the ordering automatically.
# It has already broken once: a surviving 50% override (=500K) fired BEFORE a
# 550K JICM soft threshold and preempted every cycle it was meant to backstop.
# If you change either side, re-derive the other.
#
# Do not set a second value here — two sources for one knob is how it drifts.

# -----------------------------------------------------------------------------
# NOTES ON THRESHOLDS (v5.7.0)
# -----------------------------------------------------------------------------
#
# Threshold cascade (200K context window, 15K output reserve):
#
#   45% (90K)   - JICM "approaching" warning
#   55% (110K)  - JICM compression trigger (/intelligent-compress)
#   ~85% (170K) - Claude Code auto-compact (default, effective)
#   ~95% (190K) - Claude Code auto-compact (configured, pre-reserves)
#
# Why 55% for JICM? Forensic analysis (2026-02-06) showed:
#   - /intelligent-compress gets QUEUED behind current work
#   - A multi-step turn (file read + analysis + edits) can add 40K tokens
#   - The compression skill itself only adds ~2K tokens
#   - Need headroom: 55% + 20% (queuing) + 1% (skill) + 5% (agent) = 81%
#   - 81% < 85% auto-compact = safe
#
# =============================================================================
