# Insights Archive — 2026-06-26
# Rotated: 2026-06-26T13:25:21Z (1 entries)

### 2026-06-13 [5b52924e962e]

**Session summary**: The "Analysis tab has no options" bug turned out to be a fundamental Zustand state management flaw affecting **all 14 components** in the app, not just the Analysis panel. ES6 getters defined in a Zustand store are silently destroyed by `Object.assign` during state updates — the getter function is evaluated once, and its return value replaces the getter definition. Since the store initializes with no active project, the frozen value is always `null`/`{}`, making every component that reads project data via the convenience getters silently broken.

The 4-agent parallel review also uncovered: a correctness bug in the Gumbel calibration (vertical gap recurrence computed horizontally, producing inflated significance scores), a path traversal gap in the search endpoint, and resource leaks in SQLite connection handling.

**Key architectural lesson**: Don't use ES6 `get` syntax in Zustand stores. Use selector functions (`getActiveProject(s)`) or Zustand's `subscribeWithSelector` middleware for derived state.

