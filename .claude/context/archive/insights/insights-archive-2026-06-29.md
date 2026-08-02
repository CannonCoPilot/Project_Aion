# Insights Archive — 2026-06-29
# Rotated: 2026-06-29T16:46:20Z (1 entries)

### 2026-06-15 [2caacd7e64b5]

**Scope and velocity**: 43 requests across 3 days is aggressive — roughly 14 features/fixes per day. The committed code (R1–R8) is well-tested (235→277 tests) and went through adversarial review. The uncommitted batch (R9–R43) represents a much larger surface area (+1,410 lines) without a corresponding test expansion. The 3 critical errors all live in the uncommitted code, which suggests the review→fix→commit cycle that caught issues in R1–R3 wasn't applied to the later sprint.

**Pattern**: The errors cluster around "plumbing" — the wiring between UI intent and backend execution (multi-select → single param, resize → no observer, shared cache → silent unmask). The algorithms themselves are generally correct.

# Insights Archive — 2026-06-29
# Rotated: 2026-06-29T21:46:38Z (3 entries)

### 2026-06-15 [9c7d2b348cf9]

**Why integration testing matters here**: The backend and frontend audits each found issues *within* their domain, but the most insidious bugs live at the boundary — where the frontend sends `params.metric = enabled[0]` but the backend might actually support a `metrics` array, or where the manifest format doesn't contain the paths the frontend needs to switch resolutions. These cross-cutting issues are invisible to single-side reviews.

### 2026-06-15 [ff108de8b4ed]

The instructive contrast here is between the *two* pricing matchers. `proxy.py` strips the version digit (`claude-opus-4`) so it generalizes across the whole Opus 4.x line — resilient to a model bump. `jsonl_parser.py` matches the *full* key as a substring, so it's brittle: it breaks silently the moment the minor version changes. Same data, same intent, two implementations — and only one survived the bump. When you change a value that fans out across a system, the audit isn't "find the variable," it's "find every *matcher* that consumes it," because a permissive matcher hides the staleness a strict one exposes. The sonnet fallback made it worse: the failure mode wasn't an error, it was a plausible-but-wrong number — the exact silent-failure class your own data-quality memory warns about.

### 2026-06-15 [2c4e02081a05]

- **`-p aifred-pro-dev`** — pins the compose *project name* to the one the running containers belong to. Without it, compose derived `alfred-dev` from the directory and tried to create a whole parallel stack (hence the postgres name conflict).
- **`--no-deps`** — touches *only* usage-proxy, so postgres/pulse/pipeline are never recreated.
- **explicit `docker stop … ; docker rm …` then `up -d`** — a clean single-container recreate.

The decapitation guard I'm adding on top: since this proxy *is* my own `ANTHROPIC_BASE_URL`, I chain a `/health` poll into the **same** Bash command so it doesn't return until the new proxy is confirmed live — guaranteeing my next inference call has a working proxy to route through. The image is already rebuilt with my changes, so this is just a recreate.

