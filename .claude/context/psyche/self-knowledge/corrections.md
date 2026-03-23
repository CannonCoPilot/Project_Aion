# Corrections Log
# Tracks user corrections to Jarvis behavior for AC-05 reflection cycles
#
# Format: date | category | correction | lesson
# Categories: approach, tool-use, communication, architecture, safety

# 2026-02-18 — File created by AC-06 self-evolution (session 24)
# No corrections logged yet for this session (infrastructure-focused, minimal user interaction)

# 2026-03-22 | approach | User corrected population count: "I only see 6 living citizens... not 13" — isCitizen() includes undead with residual flags; must use getCitizens() | Always cross-validate population counts with the strictest API (getCitizens > isCitizen > civ_id match)
# 2026-03-22 | judgment | User corrected premature abandonment: "follow Dastot to his last breath! We never surrender" — declared FPS death when game was merely slow under Prism emulation | Under ARM emulation, allow 5+ min before declaring simulation failure; "slow" ≠ "stopped"
