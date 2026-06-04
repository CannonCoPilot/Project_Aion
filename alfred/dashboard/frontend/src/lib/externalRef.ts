/**
 * Parses a task's external_ref field into one or more clickable link objects.
 *
 * Supported formats:
 *   - Full commit hash: abc1234567890... (40 chars) → GitHub commit URL
 *   - Short commit hash: abc1234 (7–12 hex chars) → GitHub commit URL
 *   - PR number: #123 → GitHub PR URL
 *   - Full URL: https://... → link as-is
 *   - Fallback: display raw value, no href
 *
 * githubRepo should be in "owner/repo" format (e.g. "CannonCoPilot/Project_Aion").
 * Read from VITE_GITHUB_REPO env var. When empty, commit/PR links are rendered
 * without an href (still visible, just not clickable).
 */

export interface ExternalRefLink {
  label: string
  href: string | null
  type: 'commit' | 'pr' | 'url' | 'raw'
}

const GITHUB_BASE = 'https://github.com'

// Matches 7–40 lowercase hex chars (git commit hashes)
const COMMIT_RE = /^[0-9a-f]{7,40}$/i

// Matches PR number like #123 or just 123 when prefixed
const PR_RE = /^#?(\d+)$/

// Matches full URLs
const URL_RE = /^https?:\/\/.+/

function buildGithubCommitUrl(repo: string, hash: string): string {
  return `${GITHUB_BASE}/${repo}/commit/${hash}`
}

function buildGithubPrUrl(repo: string, prNumber: string): string {
  return `${GITHUB_BASE}/${repo}/pull/${prNumber}`
}

/**
 * Returns the configured GitHub repo from the VITE_GITHUB_REPO env var.
 * Falls back to empty string if not set.
 */
export function getGithubRepo(): string {
  return (import.meta.env.VITE_GITHUB_REPO as string | undefined) ?? ''
}

/**
 * Parse a single token from external_ref into a link object.
 */
function parseToken(token: string, githubRepo: string): ExternalRefLink {
  // Full URL — link as-is
  if (URL_RE.test(token)) {
    return { label: token, href: token, type: 'url' }
  }

  // PR number (#123 or 123 preceded by # in original)
  const prMatch = token.match(PR_RE)
  if (token.startsWith('#') && prMatch) {
    const prNum = prMatch[1]
    const href = githubRepo ? buildGithubPrUrl(githubRepo, prNum) : null
    return { label: `#${prNum}`, href, type: 'pr' }
  }

  // Commit hash (7–40 hex chars)
  if (COMMIT_RE.test(token)) {
    const short = token.length > 12 ? token.slice(0, 7) : token
    const href = githubRepo ? buildGithubCommitUrl(githubRepo, token) : null
    return { label: short, href, type: 'commit' }
  }

  // Fallback: display raw
  return { label: token, href: null, type: 'raw' }
}

/**
 * Parse the full external_ref string. Multiple refs may be space-separated.
 * Returns an array of link objects (usually just one).
 */
export function parseExternalRef(
  ref: string,
  githubRepo: string = getGithubRepo()
): ExternalRefLink[] {
  const trimmed = ref.trim()
  if (!trimmed) return []

  // Split on whitespace to handle multiple refs
  const tokens = trimmed.split(/\s+/)
  return tokens.map(t => parseToken(t, githubRepo))
}
