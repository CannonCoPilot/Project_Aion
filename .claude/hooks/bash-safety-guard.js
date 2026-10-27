#!/usr/bin/env node
/**
 * Bash Safety Guard — Consolidated PreToolUse Hook
 *
 * Merges 6 security hooks into a single process for ~83% spawn reduction:
 *   1. checkCredentials()    — credential-guard.js
 *   2. checkDangerousOps()   — dangerous-op-guard.js
 *   3. checkBranchProtection() — branch-protection.js
 *   4. checkWorkspaceBounds()  — workspace-guard.js
 *   5. checkAmendSafety()    — amend-validator.js
 *   6. checkSecrets()        — secret-scanner.js
 *
 * Registered under two matchers in settings.json:
 *   ^Bash$            → all 6 checks (short-circuit on first block)
 *   ^(Read|Write|Edit)$ → credential + workspace checks only
 *
 * Execution order: fast regex checks first, async git checks later.
 * Short-circuits on first { continue: false } result.
 *
 * Created: 2026-02-09 (B.3 Hook Consolidation, Merge 1)
 * Source hooks: credential-guard.js, branch-protection.js, amend-validator.js,
 *              workspace-guard.js, dangerous-op-guard.js, secret-scanner.js
 */

const path = require('path');
const { exec, execSync } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// ============================================================
// CREDENTIAL GUARD — Patterns & Functions
// ============================================================

// EXACT-NAME CREDENTIAL MATCHING (rewritten 2026-09-08)
// These used to be UNANCHORED regexes tested against the whole path, so each matched a
// SUBSTRING ANYWHERE in it. `/\.anthropic/` blocked every path containing that text,
// `/\.openai/` likewise, and `/\.github\/.*token/` blocked any file under a .github
// directory whose name merely mentioned a token. Ordinary project files -- notes, configs,
// documentation about an API -- tripped a credential refusal, and every false block is a
// nudge toward reaching for a bypass.
//
// Matching is now on the EXACT BASENAME, or on an exact two-segment path tail where the
// parent directory is what carries the meaning (a file called `config` is nothing; the one
// inside `.aws` is a credential). Substring matching is gone, so
// `research/anthropic-pricing.md` and `.github/workflows/token-refresh.yml` are ordinary
// files again.
//
// The two FAMILY rules at the bottom are the deliberate exceptions, kept narrow and
// enumerated because their members are genuinely unbounded: you cannot list every
// `.env.<stage>` a project might invent, nor every filename a cloud service-account key is
// downloaded under. Everything else is an exact string comparison.

// Exact basenames.
const BLOCKED_BASENAMES = new Set([
  // dotenv
  '.env',
  // shell / package-manager credential files
  '.netrc', '.npmrc', '.pgpass', '.my.cnf',
  // shell history (routinely carries pasted secrets)
  '.bash_history', '.zsh_history',
  // ssh PRIVATE keys only. The `.pub` counterparts are public by definition and stay
  // readable -- the old `/\.ssh\/id_/` prefix rule blocked those too, for no benefit.
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'id_ed25519_sk', 'id_ecdsa_sk',
  // conventional secret stores
  'credentials.json', 'secrets.yaml', 'secrets.yml',
]);

// Exact two-segment tails, for names only meaningful inside a particular directory.
const BLOCKED_PATH_TAILS = new Set([
  '.aws/credentials', '.aws/config',
  '.docker/config.json',
  '.anthropic/config.json', '.anthropic/credentials.json',
  '.openai/auth.json',
  'gh/hosts.yml',          // ~/.config/gh/hosts.yml — GitHub CLI token store
  '.kube/config',
]);

// Directories whose every member is key material.
const BLOCKED_DIR_SEGMENTS = ['.password-store', '.gnupg'];

// FAMILY RULES -- the only non-exact matches, deliberately narrow.
function isCredentialFamily(base) {
  if (base.startsWith('.env.')) return true;                      // .env.<anything>
  if (/^service-account[-_.].*\.json$/.test(base)) return true;   // cloud service-account keys
  return false;
}

const JARVIS_ALLOWED = [
  /\.claude\/config\//, /\.claude\/state\//, /\.claude\/context\//,
  /\.claude\/settings\.json$/, /paths-registry\.yaml$/
];

const WARN_PATHS = [
  /config\.ya?ml$/, /settings\.json$/, /\.conf$/,
  /docker-compose.*\.ya?ml$/
];

const CREDENTIAL_PATTERNS = [
  /password\s*[:=]/i, /api[_-]?key\s*[:=]/i, /secret[_-]?key\s*[:=]/i,
  /access[_-]?token\s*[:=]/i, /auth[_-]?token\s*[:=]/i,
  /private[_-]?key\s*[:=]/i, /bearer\s+[A-Za-z0-9_\-.]+/i
];

function normalizePath(filePath) {
  return filePath
    .replace(/^~/, process.env.HOME || '')
    // Undo shell backslash escaping BEFORE any name comparison. `cat \.env` is a genuine
    // read: the shell turns `\.` into `.`. The old unanchored regexes caught it by accident
    // (matching `.env` at the tail of the literal token `\.env`); exact-basename matching
    // would compare `\.env` against `.env` and let it through. Unescaping restores the
    // shell's own semantics, which is what actually decides which file gets opened.
    // A real filename containing a backslash is vanishingly rare, and the only effect there
    // is a MORE conservative match.
    .replace(/\\(.)/g, '$1');
}

// ── Refusal shape ───────────────────────────────────────────────────────────
// 🔴 2026-09-03: every refusal below used to `return { continue: false, reason }`.
// For a PreToolUse hook that is the WRONG shape. `continue:false` is the blunt
// "abandon the whole turn" escape hatch — the harness reports
// "PreToolUse:Bash hook stopped continuation: Execution stopped by hook" and the
// assistant's entire turn dies. Observed live the moment this guard was repaired:
// a diagnostic command that merely CONTAINED the text of a dangerous pattern
// killed the turn outright.
//
// The correct way to refuse ONE tool call is hookSpecificOutput.permissionDecision
// = "deny", which declines that call, hands the model the reason, and lets the turn
// continue so it can adapt. That is the difference between a guard and a kill switch.
// `continue: true` is kept alongside it so the turn is explicitly allowed to proceed.
function _deny(reason) {
  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
}

function isJarvisAllowed(filePath) {
  const normalized = normalizePath(filePath);
  return JARVIS_ALLOWED.some(p => p.test(normalized));
}

function isBlockedCredentialPath(filePath) {
  const normalized = normalizePath(filePath);
  if (isJarvisAllowed(normalized)) return false;

  // POSIX paths only. Empty and '.' segments are dropped so './x' and 'a//x' normalise.
  const parts = normalized.split('/').filter(function (seg) { return seg && seg !== '.'; });
  if (!parts.length) return false;
  const base = parts[parts.length - 1];

  if (BLOCKED_BASENAMES.has(base)) return true;
  if (isCredentialFamily(base)) return true;
  if (parts.length >= 2 && BLOCKED_PATH_TAILS.has(parts[parts.length - 2] + '/' + base)) return true;
  // Any file inside a key-material directory, at any depth.
  if (parts.slice(0, -1).some(function (seg) { return BLOCKED_DIR_SEGMENTS.indexOf(seg) !== -1; })) return true;

  return false;
}

function isWarnCredentialPath(filePath) {
  const normalized = normalizePath(filePath);
  if (isJarvisAllowed(normalized)) return false;
  return WARN_PATHS.some(p => p.test(normalized));
}

function containsCredentials(content) {
  if (!content) return false;
  return CREDENTIAL_PATTERNS.some(p => p.test(content));
}

// Returns the FIRST blocked-credential path referenced anywhere in a Bash command, or null.
//
// 🔴 REWRITTEN 2026-09-03. The previous version matched a fixed list of reader verbs
// (cat/less/more/head/tail/vi/nano) and returned only the FIRST capture. It therefore missed
// every other way a shell reads a file: `grep pat .env`, `< .env`, `cd dir && cat .env`,
// `awk/sed/sort/tac/xxd/base64 .env`, `python -c "open('.env')"`, and any second path in a
// command whose first path was innocent. Those gaps did not matter while the CLI's
// `Read(**/.env)` deny rules were also in force. They matter now: those deny rules are being
// removed because, as of CLI 2.1.259, their mere existence makes Claude Code prompt for any
// Bash command whose cwd it cannot statically resolve — the interruption this whole change
// exists to eliminate.
//
// So protection MOVES from the CLI layer to here, and this function has to be at least as
// thorough as the rules it replaces. Verb matching cannot be, so it is abandoned: tokenize
// the command and test EVERY token. A blocked path is blocked no matter which program touches
// it or where it sits in the pipeline.
//
// Splitting on shell metacharacters (whitespace, ; | & < > ( ) and quotes) is what lets a
// redirect target and a post-`&&` operand be seen at all. Tokens are stripped of a leading
// `=` value form (`--file=.env`) since 2.1.259 called that case out explicitly.
function extractBashReadPath(command) {
  if (!command) return null;
  let cmd = String(command);

  // ── Strip heredoc BODIES before tokenizing ────────────────────────────────
  // A heredoc body is DATA the command writes, not a path it reads. Without this the
  // tokenizer flags any document that merely MENTIONS a blocked path — which it did
  // immediately: appending a note containing the literal text "Read(**/.env)" to a scratchpad
  // was denied as credential access. Blocking someone for writing the WORD is the difference
  // between a guard and a censor, and it would have made this hook impossible to document.
  //
  // Matches `<<EOF`, `<<'EOF'`, `<<"EOF"`, `<<-EOF`, and removes through the closing
  // delimiter (or to end-of-string if unterminated, which is the safe direction: an
  // unterminated heredoc means everything after it is body text, not operands).
  // NOTE the deliberate absence of the `m` flag. With `m`, `$` matches at EVERY line break,
  // so the lazy `[\s\S]*?` terminated at the first newline and the body was never stripped —
  // the rule looked right and did nothing, and only the separate glob rule masked it in
  // testing. Without `m`, `$` means end-of-string, which is the correct fallback for an
  // unterminated heredoc. The delimiter is matched as its own line via explicit newlines.
  cmd = cmd.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n[\s\S]*?(?:\r?\n\2(?:\r?\n|$)|$)/g, ' ');

  // ── Drop PATTERN operands before treating tokens as paths ─────────────────
  // The splitter below breaks on `|` and on quotes, so a grep alternation
  // `grep -iE 'credential|secret|\.env|token'` shatters into the bare token `\.env`, which
  // reads exactly like a path and was denied as credential access — while doing nothing but
  // LISTING FILENAMES. Same family as the glob and heredoc rules above: rule syntax is not
  // an access.
  //
  // A blanket "skip anything with regex metacharacters" would be a BYPASS, not a fix:
  // `cat \.env` is a real read (the shell unescapes `\.` to `.`), and it is indistinguishable
  // from the grep case at the token level. The distinguishing fact is ARGUMENT POSITION — the
  // token is the *pattern* operand of a pattern-consuming tool, not a path operand. So parse
  // that position instead of guessing from the token's shape.
  //
  // Deliberately narrow: only the pattern operand is dropped. `grep foo .env` still blocks on
  // `.env`, `-f patternfile` keeps its operand (that IS a path), and every non-pattern command
  // is untouched.
  const PATTERN_TOOLS = new Set(['grep','egrep','fgrep','rg','ripgrep','ag','ack','sed','awk','gawk']);
  // Flags whose NEXT token is the pattern itself (drop it).
  const PATTERN_FLAGS = new Set(['-e','--regexp','--expression']);
  // Flags whose NEXT token is a value but NOT a positional (skip position accounting only).
  const VALUE_FLAGS = new Set(['-m','--max-count','-A','--after-context','-B','--before-context',
                               '-C','--context','--include','--exclude','--exclude-dir',
                               '-f','--file','-d','--directories','--color','--colour']);

  // Quote-aware split into pipeline segments so each segment's command word is knowable.
  const segments = [];
  {
    let cur = '', q = null, seg = [];
    const push = () => { if (cur) { seg.push(cur); cur = ''; } };
    for (let i = 0; i < cmd.length; i++) {
      const ch = cmd[i];
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
      if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') { push(); if (seg.length) segments.push(seg); seg = []; continue; }
      if (/\s/.test(ch)) { push(); continue; }
      if (ch === '(' || ch === ')' || ch === '<' || ch === '>') { push(); continue; }
      cur += ch;
    }
    push(); if (seg.length) segments.push(seg);
  }

  const raw = [];
  for (const seg of segments) {
    const base = (seg[0] || '').split('/').pop();
    if (!PATTERN_TOOLS.has(base)) { raw.push(...seg); continue; }
    let sawPattern = false;
    for (let i = 1; i < seg.length; i++) {
      const tok = seg[i];
      if (PATTERN_FLAGS.has(tok)) { i++; sawPattern = true; continue; }        // drop the pattern
      const eqFlag = tok.match(/^(--regexp|--expression)=/);
      if (eqFlag) { sawPattern = true; continue; }                             // drop --regexp=...
      // `-f FILE` / `--file FILE` supplies the patterns FROM A FILE, so this segment has no
      // positional pattern and every later operand is a real path. Without setting sawPattern
      // here, `grep -f pats.txt .env` consumed `.env` as "the pattern" and stopped blocking a
      // genuine credential read — a bypass this fix introduced and this line closes.
      if (tok === '-f' || tok === '--file') sawPattern = true;
      if (VALUE_FLAGS.has(tok)) { if (seg[i + 1] !== undefined) raw.push(seg[i + 1]); i++; continue; }
      if (tok.startsWith('-') && tok.length > 1) continue;                     // other flags
      if (!sawPattern) { sawPattern = true; continue; }                        // first positional = pattern
      raw.push(tok);                                                           // remaining = real paths
    }
  }
  
  for (let tok of raw) {
    // Glob PATTERNS are rule syntax, not paths. `Read(**/.env)` is a permission rule being
    // discussed; `**/.env` cannot be opened by any program. Real accesses name real paths.
    if (tok.includes('*') || tok.includes('?')) continue;
    // `--opt=path` / `-f=path` → keep only the value side.
    const eq = tok.indexOf('=');
    if (eq > -1 && eq < tok.length - 1) tok = tok.slice(eq + 1);
    // Strip a trailing comma/colon that shell-adjacent prose sometimes leaves attached.
    tok = tok.replace(/[,:]+$/, '');
    if (!tok || tok === '-' || tok === '--') continue;
    // Only consider things that could plausibly be a path or a dotfile name.
    if (!/[./]/.test(tok)) continue;
    if (isBlockedCredentialPath(tok)) return tok;
  }
  return null;
}

function checkCredentials(tool, parameters) {
  let filePath = null;
  let isWrite = false;
  let content = null;

  switch (tool) {
    case 'Read':
      filePath = parameters?.file_path || parameters?.path || null;
      break;
    case 'Write':
      filePath = parameters?.file_path || parameters?.path || null;
      isWrite = true;
      content = parameters?.content;
      break;
    case 'Edit':
      // Edit doesn't expose full file content; skip credential content check
      filePath = parameters?.file_path || parameters?.path || null;
      break;
    case 'Bash':
      filePath = extractBashReadPath(parameters?.command || '');
      break;
    default:
      return null;
  }

  if (!filePath) return null;

  if (isBlockedCredentialPath(filePath)) {
    console.error('\n[bash-safety-guard/credentials] BLOCKED: Credential file access');
    console.error(`  File: ${filePath}`);
    console.error('  Reason: This file type may contain sensitive credentials\n');
    return _deny(`Blocked: Cannot access credential file ${path.basename(filePath)}`);
  }

  if (isWarnCredentialPath(filePath)) {
    console.error(`[bash-safety-guard/credentials] Warning: Config file access — ${filePath}`);
  }

  if (isWrite && content && containsCredentials(content)) {
    console.error('\n[bash-safety-guard/credentials] WARNING: Content may contain credentials');
    console.error(`  File: ${filePath}`);
    console.error('  Recommendation: Use environment variables or .gitignore\n');
  }

  return null; // no block
}

// ============================================================
// DANGEROUS OPERATION GUARD — Patterns & Functions
// ============================================================

// `Delete system root` lets /tmp and /private/tmp through to isForbiddenPath(), which denies
// all of it except this project's scratchpads. /private/tmp is the real path of /tmp on
// macOS and is what the harness hands every session; without it a session could write its
// scratch files but not clean them up.
const BLOCK_OPS = [
  { name: 'Delete system root', pattern: /rm\s+(-[rfRvfi]+\s+)*\/(?!Users|home|tmp|private\/tmp\/)/, message: 'Attempting to delete system root directories' },
  { name: 'Delete entire home', pattern: /rm\s+(-[rfRvfi]+\s+)*~\/?$/, message: 'Attempting to delete entire home directory' },
  { name: 'Sudo recursive delete', pattern: /sudo\s+rm\s+(-[rfRvfi]+\s+)*(\/|~)/, message: 'Sudo recursive delete on root or home' },
  { name: 'Format filesystem', pattern: /mkfs(\.[a-z0-9]+)?\s+/i, message: 'Filesystem format command detected' },
  { name: 'Raw disk write', pattern: /dd\s+.*if=.*of=\/dev\//, message: 'Raw disk write operation detected' },
  { name: 'Force push to main', pattern: /git\s+push\s+.*--force.*\s+(main|master)\b/, message: 'Force push to main/master branch' },
  { name: 'Force push main (alt)', pattern: /git\s+push\s+(-f|--force)\s+.*\s*(main|master)/, message: 'Force push to main/master branch' },
  { name: 'Recursive chmod 777 root', pattern: /chmod\s+(-R\s+)?777\s+\//, message: 'Recursive chmod 777 on root' },
  { name: 'Fork bomb', pattern: /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/, message: 'Fork bomb detected' },
  { name: 'Overwrite boot sector', pattern: /dd\s+.*of=\/dev\/(sd[a-z]|nvme|hd[a-z])$/, message: 'Overwriting disk device' },
];

const WARN_OPS = [
  { name: 'Recursive delete', pattern: /rm\s+(-[rfRvfi]*r[rfRvfi]*|-[rfRvfi]*R[rfRvfi]*)\s+/, message: 'Recursive delete operation' },
  { name: 'Git hard reset', pattern: /git\s+reset\s+--hard/, message: 'Hard reset will discard uncommitted changes' },
  { name: 'Git clean force', pattern: /git\s+clean\s+(-[fd]+|--force)/, message: 'Will delete untracked files' },
  { name: 'Chmod recursive', pattern: /chmod\s+-R\s+/, message: 'Recursive permission change' },
  { name: 'Chown recursive', pattern: /chown\s+-R\s+/, message: 'Recursive ownership change' },
  { name: 'Kill all processes', pattern: /pkill\s+-9\s+|killall\s+-9\s+/, message: 'Force killing processes' },
];

function checkDangerousOps(command) {
  if (!command.trim()) return null;

  for (const { name, pattern, message } of BLOCK_OPS) {
    if (pattern.test(command)) {
      console.error('\n[bash-safety-guard/dangerous-ops] BLOCKED');
      console.error(`  Pattern: ${name}`);
      console.error(`  Reason: ${message}`);
      console.error(`  Command: ${command.length > 80 ? command.substring(0, 80) + '...' : command}\n`);
      return _deny(`Blocked: ${message}`);
    }
  }

  for (const { name, pattern, message } of WARN_OPS) {
    if (pattern.test(command)) {
      console.error(`[bash-safety-guard/dangerous-ops] Warning: ${name} — ${message}`);
    }
  }

  return null;
}

// ============================================================
// BRANCH PROTECTION — Patterns & Functions
// ============================================================

const PROTECTED_BRANCHES = ['main', 'master', 'production', 'prod', 'release', 'stable'];

const DANGEROUS_GIT = [
  { pattern: /git\s+push\s+.*--force(?:-with-lease)?/i, action: 'force push', severity: 'high' },
  { pattern: /git\s+push\s+-f\s/i, action: 'force push', severity: 'high' },
  { pattern: /git\s+reset\s+--hard/i, action: 'hard reset', severity: 'medium' },
  { pattern: /git\s+rebase\s+.*-i/i, action: 'interactive rebase', severity: 'low' },
  { pattern: /git\s+branch\s+-[dD]\s+(main|master|production)/i, action: 'delete protected branch', severity: 'high' },
  { pattern: /git\s+push\s+.*:\s*(main|master|production)/i, action: 'delete remote protected branch', severity: 'high' },
];

async function getCurrentBranch() {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD 2>/dev/null');
    return stdout.trim();
  } catch { return null; }
}

function isProtectedBranch(name) {
  if (!name) return false;
  return PROTECTED_BRANCHES.some(p => name.toLowerCase() === p.toLowerCase());
}

function getTargetBranch(command) {
  const pushMatch = command.match(/git\s+push\s+(?:[^\s]+\s+)?([^\s]+)$/i);
  if (pushMatch) return pushMatch[1];
  const remoteMatch = command.match(/origin\/(\S+)/i);
  if (remoteMatch) return remoteMatch[1];
  return null;
}

async function checkBranchProtection(command) {
  if (!command.includes('git ')) return null;

  for (const { pattern, action, severity } of DANGEROUS_GIT) {
    if (!pattern.test(command)) continue;

    const currentBranch = await getCurrentBranch();
    const targetBranch = getTargetBranch(command) || currentBranch;
    const affectsProtected = isProtectedBranch(currentBranch) || isProtectedBranch(targetBranch);

    if (affectsProtected && severity === 'high') {
      console.error('\n[bash-safety-guard/branch] BLOCKED');
      console.error(`  Action: ${action}`);
      console.error(`  Branch: ${targetBranch || currentBranch}`);
      console.error(`  Protected branches: ${PROTECTED_BRANCHES.join(', ')}\n`);
      return _deny(`Blocked: ${action} on protected branch ${targetBranch || currentBranch}`);
    }

    if (affectsProtected) {
      console.error(`[bash-safety-guard/branch] Warning: ${action} on protected branch`);
    } else if (severity === 'high') {
      console.error(`[bash-safety-guard/branch] Warning: ${action} on ${currentBranch || 'unknown'}`);
    }

    break; // only report first matching pattern
  }

  return null;
}

// ============================================================
// WORKSPACE GUARD — Patterns & Functions
// ============================================================

const AIFRED_BASELINE = (process.env.HOME + '/Claude/Archive/AIfred');
const AIFRED_PRO_PRODUCTION = (process.env.HOME + '/Claude/AIFred-Pro');
const JARVIS_WORKSPACE = (process.env.HOME + '/Claude/Project_Aion');
const AUTHORIZED_WORKSPACES = [
  process.env.HOME + '/Claude/Project_Aion',
  process.env.HOME + '/Claude/Projects',
];

const FORBIDDEN_PATHS = [
  '/', '/etc', '/usr', '/bin', '/sbin', '/var', '/System', '/Library', '/Applications',
  path.join(process.env.HOME || '', '.ssh'),
  path.join(process.env.HOME || '', '.gnupg'),
];

function isBaselinePath(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(targetPath);
  return (resolved === AIFRED_BASELINE || resolved.startsWith(AIFRED_BASELINE + '/'))
      || (resolved === AIFRED_PRO_PRODUCTION || resolved.startsWith(AIFRED_PRO_PRODUCTION + '/'));
}

// Populated per-invocation from the hook payload's `scratchpad_dir` (see handler). Held in
// an object rather than a bare `let` so the value set in handler() is visible here without
// threading it through every call site.
const SESSION_SCRATCHPAD = { path: null };

// macOS aliases /tmp to /private/tmp. path.resolve() does not follow symlinks, so a command
// spelling `/tmp/claude-501/...` would miss a payload that says `/private/tmp/...`.
function canonTmp(p) {
  return p === '/tmp' || p.startsWith('/tmp/') ? '/private' + p : p;
}

// Is `resolved` inside a scratchpad of THIS project, from this session or an earlier one?
//
// The harness lays scratchpads out as <tmp>/claude-<uid>/<project-slug>/<session>/scratchpad,
// and a JICM clear starts a NEW session, so the payload names a NEW directory after every
// cycle. An exact-prefix match on the current dir alone therefore blocked every multi-session
// job at its first cycle: Fielding's census readers had folders under the pre-cycle session's
// scratchpad, and the post-cycle session was denied "Forbidden system path" on its own work.
// Reproduced 2026-10-13 from this lane: same write, current session allowed, prior one denied.
//
// The widening is to sibling sessions of the same project slug ONLY, derived from the payload
// path rather than guessed. Other projects' scratchpads and the rest of /private/tmp stay
// forbidden. Jobs that must outlive the machine's tmp sweep belong in ~/Claude/Staging or a
// project `.claude/scratch/`, which are under /Users and never reach this check.
function isProjectScratchpad(resolved) {
  const own = SESSION_SCRATCHPAD.path;
  if (!own) return false;
  const target = canonTmp(resolved);
  const current = canonTmp(own);
  if (target === current || target.startsWith(current + '/')) return true;
  if (path.basename(current) !== 'scratchpad') return false;
  const projectRoot = path.dirname(path.dirname(current));
  if (!target.startsWith(projectRoot + '/')) return false;
  // Exactly <session>/scratchpad below the project root, then anything. One segment for the
  // session id, so `..`-free resolved paths cannot reach the project root itself.
  const rest = target.slice(projectRoot.length + 1).split('/');
  return rest.length >= 2 && rest[0] !== '' && rest[1] === 'scratchpad';
}

// Character devices that are WRITE SINKS, not filesystem locations. `2>/dev/null` appears
// in a large share of ordinary shell commands, and `/dev/null` is not under /Users, so the
// catch-all rule below classified it as a forbidden system path and denied the command.
// Observed immediately after this guard was repaired: a routine diagnostic using
// `2>/dev/null` came back "Blocked: Forbidden system path /dev/null".
//
// Writing to these is meaningless-by-design, never destructive. Note this is an EXACT-match
// list, not a /dev prefix exemption — /dev/sda and friends must stay forbidden, and the
// BLOCK_OPS raw-disk-write patterns cover those separately.
const WRITE_SINKS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', '/dev/zero']);

function isForbiddenPath(targetPath) {
  if (!targetPath) return false;
  // Strip shell punctuation that a write-path extractor drags along with the operand.
  // `... 2>/dev/null)"` yielded the token `/dev/null)"`, which failed the exact-match sink
  // check below and was denied as a forbidden system path — blocking an ordinary command.
  // Normalising here rather than in each extractor keeps every caller consistent.
  const cleaned = String(targetPath).replace(/^[\s'"`(]+/, '').replace(/[\s'"`);,:&|]+$/, '');
  if (!cleaned) return false;
  const resolved = path.resolve(cleaned);
  if (WRITE_SINKS.has(resolved)) return false;
  // Sanctioned project scratchpads win over the outside-/Users rule. Derived from the
  // payload-supplied directory only — never a blanket /tmp or /private/tmp exemption,
  // which would re-open the system temp dirs the Filesystem Policy forbids.
  if (isProjectScratchpad(resolved)) return false;
  for (const forbidden of FORBIDDEN_PATHS) {
    if (resolved === forbidden) return true;
    if (forbidden === '/' && !resolved.startsWith('/Users')) return true;
  }
  for (const forbidden of FORBIDDEN_PATHS) {
    if (forbidden !== '/' && resolved.startsWith(forbidden + '/')) return true;
  }
  return false;
}

function isJarvisWorkspace(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(targetPath);
  return AUTHORIZED_WORKSPACES.some(ws => resolved.startsWith(ws));
}

// WRITE TARGETS, read by a small shell scanner, not by regexes over the raw command (2026-10-21).
// The old extractor ran />\s*(\S+)/ (and six command patterns) over the raw text and returned the
// FIRST hit only. It failed both ways:
//   - a '>' inside quotes is text: awk '/<!-- UNREAD -->/{p=1} p' was denied as a write to '/{p=1}';
//   - '>>' captured its own second '>' as the "path", so NO append redirect was ever checked;
//   - 'echo a > ok; echo b > /etc/x' checked ok only, and so did a later rm after a harmless redirect.
// One pass now yields (1) every redirect target and (2) the VISIBLE command: non-shell heredoc
// bodies dropped, and non-shell quoted text kept as ONE word (its whitespace -> \x01), so the
// command-word patterns (rm, cp, mkdir ...) see real commands and not prose or a script file's
// body ('cat > solve.sh <<EOF ... mkdir -p /app ... EOF' writes a file; it runs nothing).
// Text a shell RUNS is scanned as commands: bash/sh -c '...', eval "...", bash <<EOF.
// Replayed against 31,811 real commands from every lane's transcripts before shipping.
const RUN_SHELL = /(?:^|[\s;|&(`])(?:\S*\/)?(?:bash|sh|zsh|dash|ksh)(?:\s+-[A-Za-z]+)*\s*$/;
const RUN_SHELL_C = /(?:^|[\s;|&(`])(?:\S*\/)?(?:bash|sh|zsh|dash|ksh)(?:\s+-[A-Za-z]+)*\s+-[A-Za-z]*c[A-Za-z]*\s*$/;
const RUN_EVAL = /(?:^|[\s;|&(`])eval\s+$/;
// ...but a shell string handed to a container or another host runs THERE, not on this machine:
// 'docker run img bash -c "mkdir -p /tmp/o"' writes inside the container (replay, 2026-10-21).
const ELSEWHERE = /(?:^|[\s;|&(`])(?:docker|podman|nerdctl|kubectl|ssh|utmctl|limactl)\s/;
const WORD_END = new Set([' ', '\t', '\n', ';', '|', '&', '<', '>', '(', ')']);
const JOIN = '\x01';              // stands for whitespace inside one quoted word

function _quoteEnd(s, i) {
  const q = s[i];
  for (let k = i + 1; k < s.length; k++) {
    if (q === '"' && s[k] === '\\') { k++; continue; }
    if (s[k] === q) return k;
  }
  return s.length - 1;
}

function _unquote(s, i, e) {
  return s.slice(i + 1, e).replace(s[i] === '"' ? /\\(["\\$`])/g : /$^/, '$1');
}

// One shell word from k, quotes removed. Returns [word, index after it].
function _readWord(s, k) {
  let w = '';
  while (k < s.length && !WORD_END.has(s[k])) {
    if (s[k] === '\\') { w += s[k + 1] || ''; k += 2; continue; }
    if (s[k] === "'" || s[k] === '"') { const e = _quoteEnd(s, k); w += _unquote(s, k, e); k = e + 1; continue; }
    w += s[k++];
  }
  return [w, k];
}

function scanShell(cmd, depth = 0) {
  const targets = [];
  let vis = '';
  if (!cmd || depth > 3) return { targets, visible: vis };
  const n = cmd.length;
  const heredocs = [];            // pending { delim, strip, shell }: bodies start after the next newline
  let i = 0, stmt = 0;
  const run = text => { const r = scanShell(text, depth + 1); targets.push(...r.targets); vis += ' ' + r.visible + ' '; };
  while (i < n) {
    const c = cmd[i];
    if (c === '\\') { vis += cmd.slice(i, i + 2); i += 2; continue; }
    if (c === '#' && (i === 0 || /\s/.test(cmd[i - 1]))) {          // comment to end of line
      const j = cmd.indexOf('\n', i); i = j === -1 ? n : j; continue;
    }
    if (c === "'" || c === '"') {
      const e = _quoteEnd(cmd, i);
      const inner = _unquote(cmd, i, e);
      const before = cmd.slice(stmt, i);
      if ((RUN_SHELL_C.test(before) || RUN_EVAL.test(before)) && !ELSEWHERE.test(before)) run(inner);
      else vis += inner.replace(/\s/g, JOIN);
      i = e + 1; continue;
    }
    if (c === '\n') {
      vis += c; i++;
      while (heredocs.length) {
        const h = heredocs.shift();
        const start = i;
        let end = n;
        while (i < n) {
          let j = cmd.indexOf('\n', i); if (j === -1) j = n;
          const line = h.strip ? cmd.slice(i, j).replace(/^\t+/, '') : cmd.slice(i, j);
          if (line === h.delim) { end = i; i = Math.min(j + 1, n); break; }
          i = j + 1;
        }
        if (end === n) i = n;
        if (h.shell) run(cmd.slice(start, end));
      }
      stmt = i; continue;
    }
    if (c === '<' && cmd[i + 1] === '<') {
      if (cmd[i + 2] === '<') { vis += '<<<'; i += 3; continue; }    // here-string
      let k = i + 2, strip = false;
      if (cmd[k] === '-') { strip = true; k++; }
      while (cmd[k] === ' ' || cmd[k] === '\t') k++;
      const [delim, next] = _readWord(cmd, k);
      if (delim) heredocs.push({ delim, strip, shell: RUN_SHELL.test(cmd.slice(stmt, i)) && !ELSEWHERE.test(cmd.slice(stmt, i)) });
      vis += ' ';
      i = Math.max(next, i + 2); continue;
    }
    if (c === '>') {
      let k = i + 1;
      if (cmd[k] === '>' || cmd[k] === '|') k++;
      if (cmd[k] === '(') { vis += ' '; i = k + 1; continue; }        // process substitution >(...)
      if (cmd[k] === '&') {                                           // >&2, >&- : fd dup/close
        if (/[0-9-]/.test(cmd[k + 1] || '')) { vis += ' '; i = k + 2; continue; }
        k++;                                                          // >& file : both streams
      }
      while (cmd[k] === ' ' || cmd[k] === '\t') k++;
      const [w, next] = _readWord(cmd, k);
      if (w) targets.push(w);
      vis += ' ';
      i = Math.max(next, k, i + 1); continue;
    }
    if (c === ';' || c === '|' || c === '(' || (c === '&' && cmd[i + 1] !== '>')) stmt = i + 1;
    vis += c; i++;
  }
  return { targets, visible: vis };
}

function extractWritePaths(tool, parameters) {
  if (tool === 'Write' || tool === 'Edit') {
    const p = parameters?.file_path || parameters?.path;
    return p ? [p] : [];
  }
  if (tool !== 'Bash') return [];
  const command = parameters?.command || '';
  const { targets, visible } = scanShell(command);
  const out = [...targets];
  // Command-word writers, on the VISIBLE command: each pattern's first hit, at a word start ('perform /x' is not rm).
  const B = String.raw`(?:^|[\s;|&(\x60])`;
  const writePatterns = [
    new RegExp(B + String.raw`tee\s+(?:-a\s+)?(\S+)`), new RegExp(B + String.raw`mv\s+\S+\s+(\S+)`),
    new RegExp(B + String.raw`cp\s+\S+\s+(\S+)`), new RegExp(B + String.raw`rm\s+(?:-[rf]+\s+)?(\S+)`),
    new RegExp(B + String.raw`mkdir\s+(?:-p\s+)?(\S+)`), new RegExp(B + String.raw`touch\s+(\S+)`),
  ];
  for (const p of writePatterns) {
    const m = visible.match(p);
    if (m && m[1]) out.push(m[1].split(JOIN).join(' '));
  }
  if (command.includes(AIFRED_BASELINE)) out.push(AIFRED_BASELINE);
  if (command.includes(AIFRED_PRO_PRODUCTION) && !command.includes(AIFRED_PRO_PRODUCTION + '-Dev')) out.push(AIFRED_PRO_PRODUCTION);
  return out;
}

function checkWorkspaceBounds(tool, parameters) {
  const WRITE_TOOLS = ['Write', 'Edit', 'Bash'];
  if (!WRITE_TOOLS.includes(tool)) return null;
  for (const targetPath of extractWritePaths(tool, parameters)) {
    const r = _checkOneWritePath(tool, targetPath);
    if (r) return r;
  }
  return null;
}

function _checkOneWritePath(tool, targetPath) {
  if (!targetPath) return null;

  if (isBaselinePath(targetPath)) {
    console.error('\n[bash-safety-guard/workspace] BLOCKED — AIfred Baseline Modification');
    console.error(`  Path: ${targetPath}`);
    console.error('  The AIfred baseline repository is READ-ONLY.\n');
    return _deny(`Blocked: AIfred baseline is read-only`);
  }

  if (isForbiddenPath(targetPath)) {
    console.error('\n[bash-safety-guard/workspace] BLOCKED — Forbidden System Path');
    console.error(`  Path: ${targetPath}\n`);
    return _deny(`Blocked: Forbidden system path ${targetPath}`);
  }

  if ((tool === 'Write' || tool === 'Edit') && !isJarvisWorkspace(targetPath)) {
    console.error(`[bash-safety-guard/workspace] Warning: Operation outside Jarvis workspace — ${targetPath}`);
  }

  return null;
}

// ============================================================
// AMEND VALIDATOR — Functions
// ============================================================

const EXPECTED_AUTHORS = [
  /david\s*moneil/i, /davidmoneil/i, /claude/i, /anthropic/i,
  /noreply@anthropic\.com/i, /aircannon/i, /CannonCoPilot/i
];

async function getHeadCommitInfo() {
  try {
    const { stdout } = await execAsync('git log -1 --format="%H|%an|%ae|%s" 2>/dev/null');
    const [hash, authorName, authorEmail, subject] = stdout.trim().split('|');
    return { hash, authorName, authorEmail, subject };
  } catch { return null; }
}

async function isCommitPushed(hash) {
  try {
    const { stdout } = await execAsync(`git branch -r --contains ${hash} 2>/dev/null`);
    return stdout.trim().length > 0;
  } catch { return false; }
}

function isExpectedAuthor(authorName, authorEmail) {
  const combined = `${authorName} ${authorEmail}`;
  return EXPECTED_AUTHORS.some(p => p.test(combined));
}

async function checkAmendSafety(command) {
  if (!command.includes('git commit') || !command.includes('--amend')) return null;

  const headInfo = await getHeadCommitInfo();
  if (!headInfo) {
    console.error('[bash-safety-guard/amend] Warning: Could not get commit info');
    return null;
  }

  if (!isExpectedAuthor(headInfo.authorName, headInfo.authorEmail)) {
    console.error('\n[bash-safety-guard/amend] BLOCKED — Amending another author\'s commit');
    console.error(`  Author: ${headInfo.authorName} <${headInfo.authorEmail}>`);
    console.error(`  Subject: ${headInfo.subject?.substring(0, 50)}...\n`);
    return _deny('Cannot amend commit by different author');
  }

  const isPushed = await isCommitPushed(headInfo.hash);
  if (isPushed) {
    try {
      const { stdout } = await execAsync('git status -sb 2>/dev/null');
      const aheadMatch = stdout.match(/\[ahead (\d+)/);
      const ahead = aheadMatch ? parseInt(aheadMatch[1]) : 0;

      if (ahead === 0) {
        console.error('\n[bash-safety-guard/amend] BLOCKED — Commit already synced to remote');
        console.error('  Amending would require force push. Create a new commit instead.\n');
        return _deny('Cannot amend commit that exists on remote');
      }
      console.error('[bash-safety-guard/amend] Warning: Branch ahead of remote — amend may be okay');
    } catch {
      // fall through
    }
  }

  return null;
}

// ============================================================
// SECRET SCANNER — Functions
// ============================================================

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  // {40,} not {40}: with the 'g' flag a fixed width slices a long run into consecutive
  // 40-char chunks and judges each chunk alone. A PyPI URL in uv.lock then yields a chunk of
  // 39 hex + '/', which is neither all-hex nor a 3-segment path, so 1,221 lockfile URLs read
  // as AWS secrets (found 2026-10-21, sixth false-positive class in this pattern). Judging
  // the maximal run lets the path rule see the whole URL path. A genuine secret is still a
  // run of at least 40 class characters, so nothing that matched before is missed.
  { name: 'AWS Secret Key', pattern: /[A-Za-z0-9\/+=]{40,}/ },
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: 'Generic API Key', pattern: /[aA][pP][iI][-_]?[kK][eE][yY][\s]*[=:]\s*["']?[A-Za-z0-9_\-]{20,}/ },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  // Userinfo in a URL cannot contain whitespace, '/' or '@'. The previous class pairs
  // ([^:]+ and [^@]+) both matched NEWLINES, so this ran from a bare '://localhost:7687'
  // across ~400 chars of unrelated shell until it found any '@' anywhere later in the
  // file, and reported the whole span as a leaked password. Constrain to the actual URL
  // grammar: this still catches user:pass@host, and no longer matches across lines.
  { name: 'Password in URL', pattern: /:\/\/[^:\s\/@]+:[^@\s\/]+@/ },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
];

const FALSE_POSITIVE_INDICATORS = ['example', 'placeholder', 'your_', 'xxx', 'test_', 'dummy', 'sample'];

function isFalsePositive(match) {
  const lower = match.toLowerCase();
  if (FALSE_POSITIVE_INDICATORS.some(ind => lower.includes(ind))) return true;

  // ZERO-ENTROPY REJECTION.
  // The 'AWS Secret Key' pattern is /[A-Za-z0-9\/+=]{40}/ -- unanchored, and '=' is in the
  // class -- so ANY 40-character separator line matches it. Every banner-commented shell
  // script in this repo ('# ====...====') therefore reads as three leaked AWS secrets, and
  // the block only surfaces the first time such a file is staged. That is the worst kind of
  // guard failure: it fires constantly on noise, which trains the operator to reach for a
  // bypass, and a guard that is routinely bypassed protects nothing.
  //
  // A real base64 secret is high-entropy: a 40-char AWS secret key has ~30 distinct
  // characters. Requiring merely FIVE distinct characters discards separator runs, ruler
  // lines and padding while staying far below anything a genuine secret could hit. The
  // patterns themselves are NOT weakened -- this only filters matches that cannot be secrets.
  const distinct = new Set(match).size;
  // FLOOR RAISED 5 -> 15 (2026-10-27, Fielding's retro sweep). OCR garbage from back-matter
  // advertisement pages makes 40-105 char runs from 5-12 distinct letters WITH a few capitals,
  // so the all-lower-case rule below misses them. A random 40-char base64 key averages ~30
  // distinct characters (64 * (1 - (63/64)^40)); under 15 is far outside anything a key yields.
  // These runs were committed before only because their 2.6 MB register exceeded the old 1 MiB
  // read buffer and was silently skipped (fixed in 2542608), so the next commit would block.
  if (distinct < 15) return true;

  // FILESYSTEM PATHS ARE NOT CREDENTIALS.
  // '/' is in the AWS-secret class, so any 40-character run of an absolute path matches --
  // '/Users/nathanielcannon/Claude/Projects/m' is 40 chars with ~19 distinct characters, so
  // it sails past the entropy floor above. Every persona file and every script that names an
  // absolute path therefore read as leaked AWS secrets. A credential does not contain a
  // '/Users/' or '/home/' segment, so this discards path noise without weakening the pattern
  // for anything that could actually be a secret.
  if (/\/(Users|home|opt|var|usr|Applications)\//.test(match)) return true;

  // RELATIVE PATHS ARE NOT CREDENTIALS EITHER.
  // The absolute-path rule above only catches matches carrying a /Users/ or /home/
  // segment. A repository-relative path has none, so 40-character runs like
  // "alfred/dashboard/server/dist/routes/jarv" and
  // "claude/context/archive/insights/insights" still passed the entropy floor and
  // blocked a commit of ordinary notes (found 2026-09-09, fourth false-positive
  // class in this one pattern). Three or more slash-separated word-like segments is
  // a path, not a base64 secret: real base64 has no reason to place separators
  // between pronounceable segments.
  const segs = match.split('/');
  if (segs.length >= 3 && segs.filter(x => /^[A-Za-z0-9_.-]*$/.test(x)).length === segs.length) {
    return true;
  }

  // A HEX DIGEST IS NOT A BASE64 CREDENTIAL.
  // Fifth false-positive class in this one pattern (found 2026-09-19, blocking an
  // experiment's provenance.json). The class is /[A-Za-z0-9\/+=]{40}/, so the first 40
  // characters of a 64-char sha256 match it: 15 distinct characters clears the entropy
  // floor, there is no /Users/ segment, and there are no slashes to read as a path. Every
  // run's provenance file records a save-file checksum, and 49 of them were already
  // committed before this fired -- so the guard blocked one file while ignoring the same
  // value in the rest of the tree, which is the signature of a rule that is wrong rather
  // than a leak that is real.
  //
  // A base64 credential draws on the full 62-character alphabet; the odds of 40 such
  // characters landing entirely inside [0-9a-f] are effectively zero. So an all-hex run is
  // a digest (md5/sha1/sha256), never an AWS secret key. This does NOT weaken the pattern
  // for a genuine credential, and a hex API token assigned to a variable is still caught by
  // the 'api_key =' and 'secret_key =' patterns above, which key on the assignment.
  if (/^[0-9a-fA-F]+$/.test(match)) return true;

  // SOURCE CODE IS NOT A CREDENTIAL.
  // "claudeInChromeDefaultEnabled===undefined" is a JS comparison, 40 chars of the
  // secret class. Base64 padding only ever appears at the END of a value, so an
  // "=" run sitting mid-string is an operator, not padding.
  if (/==[^=]/.test(match.slice(0, -2))) return true;

  // AN ALL-LOWER-CASE LETTER RUN IS NOT A BASE64 CREDENTIAL.
  // Seventh false-positive class in this one pattern (found 2026-10-27 by Fielding, blocking a
  // commit): OCR of upside-down scanned pages reads as runs like 'ccscccsscoesceseseeseceesce...'
  // (9 such in cr_corrected_pages.json, 18 in its decisions register). A base64 key draws on
  // 64 characters; the chance that 40 of them are all lower-case letters is (26/64)^40 ~ 3e-16.
  // Real keys keep matching (mixed case, digits); an 'api_key = ...' assignment is still caught
  // by its own pattern, which keys on the assignment, not the alphabet.
  if (/^[a-z]+$/.test(match)) return true;

  // AN '=' INSIDE A RUN IS A DELIMITER, NOT PADDING -- JUDGE EACH SIDE.
  // Eighth false-positive class in this one pattern (found 2026-10-27 by Genie, blocking a
  // data-health commit): ProTraits trait names such as 'ecosystemtype=' + 'nonmarinesaline...'
  // are key=value runs of lower-case words. The all-lower-case rule misses them only because
  // of the '='. Base64 padding sits at the END; an '=' with characters after it separates an
  // assignment, and a secret on either side is still a 40-character run by itself. So split
  // there and judge each side: 'KEY=' + a real 40-char key keeps flagging, while two short
  // words joined by '=' cannot. Sides under 40 characters were never secret-length.
  const body = match.replace(/=+$/, '');
  if (body.includes('=')) {
    return body.split('=').every(side => side.length < 40 || isFalsePositive(side));
  }

  return false;
}

// WHICH REPOSITORY DOES THIS COMMIT RUN IN? (2026-10-27, reported by Fielding.)
// checkSecrets used to run `git diff --cached` in the HOOK's cwd, i.e. the session's directory,
// so `cd <worktree> && git commit` and `git -C <repo> commit` were scanned against the WRONG
// index (or none): a worktree commit went through unscanned. And the trigger was the literal
// text 'git commit', which `git -C <repo> commit` does not contain. Now every statement is
// walked in order: `cd DIR` moves the current directory, `git [-C DIR]... commit` records it.
// Returns { dirs, unresolved }: a cd/-C target holding a shell variable other than $HOME
// cannot be resolved statically, and the caller refuses rather than scan the wrong tree.
function commitRepoDirs(command, baseCwd) {
  const dirs = new Set();
  const unresolved = [];
  let cur = baseCwd;
  let lastUnresolved = '';
  const expand = w => w.replace(/^~(?=\/|$)/, process.env.HOME || '~').replace(/\$\{?HOME\}?/g, process.env.HOME || '$HOME');
  const resolveIn = (base, w) => {
    const e = expand(w);
    if (/[$`]/.test(e) || base === null) return null;
    return path.resolve(base, e);
  };
  // Split into statements at top level (quotes respected): ; | & newline ( ) { }.
  const stmts = [];
  let buf = '';
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "'" || c === '"') { const e = _quoteEnd(command, i); buf += command.slice(i, e + 1); i = e; continue; }
    if (c === '\\') { buf += command.slice(i, i + 2); i++; continue; }
    if (';|&\n(){}'.includes(c)) { stmts.push(buf); buf = ''; continue; }
    buf += c;
  }
  stmts.push(buf);
  for (const st of stmts) {
    const words = [];
    let k = 0;
    while (k < st.length) {
      while (k < st.length && /\s/.test(st[k])) k++;
      if (k >= st.length) break;
      const [w, next] = _readWord(st, k);
      words.push(w);
      k = Math.max(next, k + 1);
    }
    let j = 0;
    while (j < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[j])) j++;   // env prefixes
    if (j >= words.length) continue;
    const cmd = words[j];
    if (cmd === 'cd' || cmd === 'pushd') {
      const target = words[j + 1] && words[j + 1] !== '--' ? words[j + 1] : (words[j + 2] || process.env.HOME || '~');
      const r = resolveIn(cur, target);
      cur = r;                       // null = unresolvable; it matters only if a commit runs there
      if (r === null) lastUnresolved = `cd ${target}`;
      continue;
    }
    if (cmd === 'git' || /\/git$/.test(cmd)) {
      let dir = cur, m = j + 1;
      while (m < words.length && words[m].startsWith('-')) {
        if (words[m] === '-C') { const r = resolveIn(dir, words[m + 1] || ''); if (r === null && dir !== null) lastUnresolved = `git -C ${words[m + 1]}`; dir = r; m += 2; continue; }
        if (words[m] === '-c') { m += 2; continue; }
        m++;
      }
      if (words[m] === 'commit') {
        if (dir === null) unresolved.push(lastUnresolved || 'an unresolvable directory');
        else dirs.add(dir);
      }
    }
  }
  return { dirs: [...dirs], unresolved };
}

function checkSecrets(command, baseCwd) {
  if (!/\bcommit\b/.test(command) || !/\bgit\b/.test(command)) return null;
  const cwd0 = baseCwd || process.cwd();
  const { dirs, unresolved } = commitRepoDirs(command, cwd0);
  if (unresolved.length) {
    return _deny(`Blocked: the secret scan cannot tell which repository this commit runs in (${unresolved.join(', ')}). Use a literal path in cd / git -C so the staged files can be scanned.`);
  }
  // A commit the walker did not see (e.g. inside bash -c '...'): scan the session cwd, as before.
  if (dirs.length === 0 && command.includes('git commit')) dirs.push(cwd0);
  if (dirs.length === 0) return null;

  const findings = [];
  for (const dir of dirs) {
  let stagedFiles;
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8', cwd: dir });
    stagedFiles = output.trim().split('\n').filter(Boolean);
  } catch { continue; }

  for (const file of stagedFiles) {
    if (file.match(/\.(png|jpg|gif|ico|woff|ttf|pdf)$/i)) continue;

    let content;
    // execFileSync, not a shell string: a staged name with a space or quote must not break the read.
    // maxBuffer raised from Node's 1 MiB default: a larger staged file used to throw ENOBUFS into the
    // catch below and be SKIPPED, i.e. never scanned.
    try { content = require('child_process').execFileSync('git', ['show', ':' + file], { encoding: 'utf8', cwd: dir, maxBuffer: 256 * 1024 * 1024 }); }
    catch { continue; }

    for (const { name, pattern } of SECRET_PATTERNS) {
      const matches = content.match(new RegExp(pattern, 'g')) || [];
      for (const match of matches) {
        if (!isFalsePositive(match)) {
          findings.push({ file: dirs.length > 1 || dir !== cwd0 ? `${dir}: ${file}` : file, type: name, preview: match.substring(0, 20) + '...' });
        }
      }
    }
  }
  }

  if (findings.length > 0) {
    console.error('\n[bash-safety-guard/secrets] BLOCKED — Secrets detected in staged files\n');
    for (const f of findings) {
      console.error(`  File: ${f.file}  Type: ${f.type}  Preview: ${f.preview}`);
    }
    console.error('\n  Remove secrets, add to .gitignore, or use environment variables.\n');
    return _deny(`Blocked: ${findings.length} potential secret(s) in staged files`);
  }

  return null;
}

// ============================================================
// MAIN HANDLER — Dispatch by tool type
// ============================================================

async function handler(context) {
  // 🔴 FIELD NAME FIX (2026-09-03). This read `const { tool, tool_input } = context`, but
  // Claude Code sends the tool name as `tool_name`, NOT `tool`. So `tool` was ALWAYS
  // undefined, every `if (tool === 'Bash' | 'Read' | ...)` branch below was skipped, and
  // this entire guard returned {continue:true} for everything — including `rm -rf /`.
  // Proven by running the hook both ways: with `tool_name` it passed `rm -rf /`; with
  // `tool` it correctly BLOCKED it. Credential blocking, dangerous-ops, branch protection,
  // workspace bounds, amend safety and the secret scanner were all dead code.
  //
  // A security control that silently does nothing is the exact shape CLAUDE.md's
  // No Silent Degradation rule exists to forbid: it reported success (exit 0, continue:true)
  // while delivering none of its function, and nothing anywhere surfaced the gap.
  // `context.tool` is kept as a fallback so direct require()/unit-test callers still work.
  const tool = context.tool_name || context.tool;
  const parameters = context.tool_input || context.parameters || {};

  // Session scratchpad exemption. FORBIDDEN_PATHS contains '/', and isForbiddenPath()
  // treats any resolved path outside /Users as forbidden — which is correct for /etc and
  // /var, but Claude Code's own per-session scratchpad lives under /private/tmp/claude-501/
  // and the harness instructs every session to write temp files THERE rather than in the
  // project tree. Without this exemption, repairing the field name above would have
  // immediately started blocking the sanctioned temp directory. The path is taken from the
  // hook payload (`scratchpad_dir`), never guessed, so it cannot widen to /tmp generally.
  const scratchpadDir = context.scratchpad_dir || process.env.CLAUDE_SCRATCHPAD_DIR || null;
  if (scratchpadDir) SESSION_SCRATCHPAD.path = path.resolve(scratchpadDir);

  try {
    if (tool === 'Bash') {
      const command = parameters?.command || '';

      // 1. Credential check (fast regex)
      const credResult = checkCredentials(tool, parameters);
      if (credResult) return credResult;

      // 2. Dangerous ops check (fast regex)
      const dangerResult = checkDangerousOps(command);
      if (dangerResult) return dangerResult;

      // 3. Branch protection (async — git call)
      const branchResult = await checkBranchProtection(command);
      if (branchResult) return branchResult;

      // 4. Workspace bounds (fast path.resolve)
      const workspaceResult = checkWorkspaceBounds(tool, parameters);
      if (workspaceResult) return workspaceResult;

      // 5. Amend safety (async — git calls)
      const amendResult = await checkAmendSafety(command);
      if (amendResult) return amendResult;

      // 6. Secret scanner (sync execSync — only for git commit)
      const secretResult = checkSecrets(command, context.cwd);
      if (secretResult) return secretResult;

    } else if (tool === 'Read' || tool === 'Write' || tool === 'Edit') {
      // Non-Bash file tools: credential + workspace checks only
      const credResult = checkCredentials(tool, parameters);
      if (credResult) return credResult;

      const workspaceResult = checkWorkspaceBounds(tool, parameters);
      if (workspaceResult) return workspaceResult;
    }
  } catch (err) {
    console.error(`[bash-safety-guard] Error: ${err.message} — proceeding with caution`);
  }

  return { continue: true };
}

// Export for require() usage
module.exports = {
  name: 'bash-safety-guard',
  description: 'Consolidated security guard (credentials, dangerous ops, branch protection, workspace, amend safety, secrets)',
  event: 'PreToolUse',
  handler
};

// ============================================================
// STDIN/STDOUT HANDLER — Required for Claude Code hooks
// ============================================================
if (require.main === module) {
  const chunks = [];
  process.stdin.on('data', chunk => chunks.push(chunk));
  process.stdin.on('end', async () => {
    let context;
    try {
      context = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (err) {
      console.error(`[bash-safety-guard] Parse error: ${err.message}`);
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    try {
      const result = await handler(context);
      console.log(JSON.stringify(result));
    } catch (err) {
      console.error(`[bash-safety-guard] Handler error: ${err.message}`);
      console.log(JSON.stringify({ continue: true }));
    }
  });
}
