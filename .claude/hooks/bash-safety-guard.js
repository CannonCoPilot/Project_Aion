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

const BLOCK_OPS = [
  { name: 'Delete system root', pattern: /rm\s+(-[rfRvfi]+\s+)*\/(?!Users|home|tmp)/, message: 'Attempting to delete system root directories' },
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
  // Sanctioned session scratchpad wins over the outside-/Users rule. Exact-prefix match on
  // the payload-supplied directory only — never a blanket /tmp or /private/tmp exemption,
  // which would re-open the system temp dirs the Filesystem Policy forbids.
  if (SESSION_SCRATCHPAD.path &&
      (resolved === SESSION_SCRATCHPAD.path || resolved.startsWith(SESSION_SCRATCHPAD.path + '/'))) {
    return false;
  }
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

function extractWritePath(tool, parameters) {
  if (tool === 'Write' || tool === 'Edit') {
    return parameters?.file_path || parameters?.path || null;
  }
  if (tool === 'Bash') {
    const command = parameters?.command || '';
    const writePatterns = [
      />\s*(\S+)/, />>\s*(\S+)/, /tee\s+(?:-a\s+)?(\S+)/,
      /mv\s+\S+\s+(\S+)/, /cp\s+\S+\s+(\S+)/, /rm\s+(?:-[rf]+\s+)?(\S+)/,
      /mkdir\s+(?:-p\s+)?(\S+)/, /touch\s+(\S+)/,
    ];
    for (const p of writePatterns) {
      const m = command.match(p);
      if (m && m[1]) return m[1];
    }
    if (command.includes(AIFRED_BASELINE)) return AIFRED_BASELINE;
    if (command.includes(AIFRED_PRO_PRODUCTION) && !command.includes(AIFRED_PRO_PRODUCTION + '-Dev')) return AIFRED_PRO_PRODUCTION;
  }
  return null;
}

function checkWorkspaceBounds(tool, parameters) {
  const WRITE_TOOLS = ['Write', 'Edit', 'Bash'];
  if (!WRITE_TOOLS.includes(tool)) return null;

  const targetPath = extractWritePath(tool, parameters);
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
  { name: 'AWS Secret Key', pattern: /[A-Za-z0-9\/+=]{40}/ },
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
  if (distinct < 5) return true;

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

  // SOURCE CODE IS NOT A CREDENTIAL.
  // "claudeInChromeDefaultEnabled===undefined" is a JS comparison, 40 chars of the
  // secret class. Base64 padding only ever appears at the END of a value, so an
  // "=" run sitting mid-string is an operator, not padding.
  if (/==[^=]/.test(match.slice(0, -2))) return true;

  return false;
}

function checkSecrets(command) {
  if (!command.includes('git commit')) return null;

  let stagedFiles;
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    stagedFiles = output.trim().split('\n').filter(Boolean);
  } catch { return null; }

  if (stagedFiles.length === 0) return null;

  const findings = [];
  for (const file of stagedFiles) {
    if (file.match(/\.(png|jpg|gif|ico|woff|ttf|pdf)$/i)) continue;

    let content;
    try { content = execSync(`git show :${file}`, { encoding: 'utf8' }); }
    catch { continue; }

    for (const { name, pattern } of SECRET_PATTERNS) {
      const matches = content.match(new RegExp(pattern, 'g')) || [];
      for (const match of matches) {
        if (!isFalsePositive(match)) {
          findings.push({ file, type: name, preview: match.substring(0, 20) + '...' });
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
      const secretResult = checkSecrets(command);
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
