#!/bin/bash
#
# get-credential.sh — resolve ONE secret from the gitignored credentials.yaml.
#
# Usage:
#   .claude/scripts/get-credential.sh .database.neo4j.password        # prints value
#   .claude/scripts/get-credential.sh .database.neo4j.password --or-empty
#
# Exit codes:
#   0  resolved, value on stdout
#   3  NOT resolvable (missing file / missing yq / absent key). Diagnostic on STDERR,
#      nothing on stdout. With --or-empty, exits 0 and prints nothing instead.
#
# ─────────────────────────────────────────────────────────────────────────────
# WHY THIS FILE EXISTS — two parsing traps that each hand back a WRONG secret
# silently. Both were live in this repo on 2026-08-24. Do not re-implement inline.
#
# TRAP 1 — credentials.yaml is a MULTI-DOCUMENT yaml file (`---` separated).
#   `yq -r '.database.neo4j.password' file` prints the value for the doc that has
#   it, AND a literal `---` separator, AND `null` for every doc that lacks it.
#   Naive capture yields a 41-char string spanning the separator instead of the
#   32-char password, and `| head -1` returns `null` or `---` whenever the key
#   lives in any document but the first. Different keys live in different docs
#   here (github → doc 0, annas_archive + database → doc 1), so a helper that
#   works for one key silently breaks for another.
#
# TRAP 2 — `// empty` IS A JQ IDIOM AND IS NOT VALID IN MIKEFARAH yq v4.
#   `yq -r '.x // empty'` fails with `lexer: invalid input text "empty"`, exits
#   non-zero and prints NOTHING. Under the usual `2>/dev/null` that is
#   indistinguishable from "key absent". get-github-pat.sh:31 carried exactly
#   this and its yq branch had been dead for months, silently falling through to
#   a grep/sed fallback that happened to work. jq's `// empty` is fine; yq's is not.
#
# ⚠️ A WRONG SECRET AND A MISSING SECRET BOTH PRESENT AS "auth failed" downstream,
# which is why these survived. Verify a change here by SHA, not by "it connected":
#   printf %s "$(get-credential.sh .database.neo4j.password)" | shasum -a 256
# and compare against the value the consumer used before. Never echo the secret.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail   # NOT -e: a failed lookup is a return value here, not a crash.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CREDENTIALS_FILE="${AION_CREDENTIALS_FILE:-$PROJECT_ROOT/.claude/secrets/credentials.yaml}"

KEY="${1:-}"
MODE="${2:-}"

_fail() {
    # Diagnostics go to stderr so a caller doing $(...) captures an EMPTY value,
    # never an error string that would be used as if it were the password.
    echo "get-credential: $1" >&2
    [[ "$MODE" == "--or-empty" ]] && exit 0
    exit 3
}

[[ -z "$KEY" ]] && _fail "usage: get-credential.sh <.dotted.path> [--or-empty]"
[[ "$KEY" == .* ]] || _fail "path must start with '.' (got: $KEY)"
[[ -r "$CREDENTIALS_FILE" ]] || _fail "credentials file unreadable: $CREDENTIALS_FILE"
command -v yq >/dev/null 2>&1 || _fail "yq not on PATH (brew install yq)"

# Document-agnostic read. `-r` emits raw scalars; we then drop the artifacts that
# multi-doc output introduces (`---` separators, `null` for docs lacking the key)
# and take the first real value. See TRAP 1/2 above for why each filter is here.
#
# Caveat, stated rather than hidden: a secret whose literal value is `null`, `---`
# or empty is indistinguishable from "absent" under this filter. No credential in
# this repo has such a value; if one ever does, this returns "not found", loudly.
VALUE="$(yq -r "$KEY" "$CREDENTIALS_FILE" 2>/dev/null \
         | grep -vx -e '---' -e 'null' -e '' \
         | head -1)"

[[ -n "$VALUE" ]] || _fail "key not found in credentials.yaml: $KEY"

printf '%s\n' "$VALUE"
