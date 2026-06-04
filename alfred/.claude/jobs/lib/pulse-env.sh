#!/usr/bin/env bash
# pulse-env.sh — Canonical Pulse API URL resolution.
#
# Sets PULSE_API_URL to the full Pulse API path (with /api/v1 suffix).
# Resolution priority:
#   1. PULSE_API_URL (already canonical, full path with /api/v1)
#   2. PULSE_API     (legacy alias of PULSE_API_URL)
#   3. PULSE_URL     (base URL; /api/v1 appended if missing)
#   4. fallback http://localhost:${PULSE_PORT:-8700}/api/v1
#
# Why this exists: bash and python observability libs historically used three
# different env-var names for the same Pulse base URL (PULSE_URL, PULSE_API,
# PULSE_API_URL). Sourcing this file gives every consumer a single canonical
# answer in PULSE_API_URL. Idempotent — sourcing twice is safe.

if [ -z "${PULSE_API_URL:-}" ]; then
    _pulse_src="${PULSE_API:-${PULSE_URL:-http://localhost:${PULSE_PORT:-8700}}}"
    case "$_pulse_src" in
        */api/v1)  PULSE_API_URL="$_pulse_src" ;;
        */api/v1/) PULSE_API_URL="${_pulse_src%/}" ;;
        */)        PULSE_API_URL="${_pulse_src}api/v1" ;;
        *)         PULSE_API_URL="${_pulse_src}/api/v1" ;;
    esac
    unset _pulse_src
fi
export PULSE_API_URL
