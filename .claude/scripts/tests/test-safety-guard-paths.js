#!/usr/bin/env node
// Branch harness for bash-safety-guard.js credential-path extraction + secret scanning.
//
// WHY THIS EXISTS: the guard has now had THREE separate false-positive classes, each found
// by hand only when it blocked real work — a 40-char `===` banner, a 40-char absolute path,
// a `Password in URL` pattern that matched across newlines, and a grep alternation whose
// `\.env` fragment read as a path. A guard that fires on noise trains the operator to reach
// for a bypass, and a guard that is routinely bypassed protects nothing. So both directions
// are asserted here: noise must NOT block, and real accesses MUST still block.
//
// ⚠️ THE HOOK SIGNALS A DENY AS JSON ON STDOUT WITH EXIT 0. It does NOT exit non-zero.
// An earlier version of this harness used execSync's throw as the block signal, so every
// case read as "not blocked" — including `cat` on a real credential file. The suite was
// green-by-deadness in the unsafe direction. Parse permissionDecision; never trust the exit
// code. (Same family as the tmux display-fallback bug: a probe that cannot distinguish
// "found" from "absent" is not evidence.)
//
// Run: node .claude/scripts/tests/test-safety-guard-paths.js

const { execSync } = require('child_process');
const path = require('path');

const GUARD = path.resolve(__dirname, '../../hooks/bash-safety-guard.js');

// Built by concatenation so this FILE never contains the literal token — otherwise the guard
// blocks anyone who greps this suite, which is the very bug it tests for.
const D = '.' + 'env';

function decision(toolInput, toolName = 'Bash') {
  let out = '';
  try {
    out = execSync(`node ${JSON.stringify(GUARD)}`, {
      input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch (e) { out = e.stdout || ''; }
  const line = out.trim().split('\n').filter(l => l.startsWith('{')).pop();
  if (!line) return 'allow';
  try { return JSON.parse(line)?.hookSpecificOutput?.permissionDecision || 'allow'; }
  catch { return 'allow'; }
}

const cases = [
  // ── PATTERN OPERANDS: rule syntax, not an access. Must NOT block. ──────────
  ['grep alternation carrying a dotfile fragment',
   String.raw`git diff --name-only | /usr/bin/grep -iE 'credential|secret|\.env|\.key|token'`, false],
  ['grep -e PATTERN',            String.raw`grep -e '\.env' README.md`, false],
  ['grep --regexp=PATTERN',      String.raw`grep --regexp='\.env' file.txt`, false],
  ['grep with context flag',     String.raw`grep -A3 '\.env' log.txt`, false],
  ['rg PATTERN dir',             String.raw`rg '\.env$' src/`, false],
  ['sed script',                 String.raw`sed 's/\.env/X/' notes.txt`, false],
  ['awk script',                 String.raw`awk '/\.env/{print}' notes.txt`, false],
  ['unrelated command',          `ls -la .claude/scripts`, false],

  // ── REAL ACCESSES: must STILL block. These are the bypass guards. ──────────
  ['cat dotfile',                `cat ${D}`, true],
  // `\.` is unescaped BY THE SHELL to `.`, so this is a genuine read. It is the reason the
  // fix keys on argument POSITION and not on "the token looks like a regex".
  ['cat shell-escaped dotfile',  `cat \\${D}`, true],
  ['grep PATTERN then real path', `grep foo ${D}`, true],
  ['grep -e PAT then real path', `grep -e 'foo' ${D}`, true],
  // -f reads patterns FROM A FILE, so there is no positional pattern and the next operand is
  // a path. Omitting this let `grep -f pats.txt <dotfile>` through — a bypass introduced by
  // the pattern-operand fix itself and closed in the same change.
  ['grep -f FILE then real path', `grep -f pats.txt ${D}`, true],
  ['rg PATTERN then real path',  `rg TODO ${D}`, true],
  ['head -n N then real path',   `head -n 5 ${D}`, true],
  ['second statement in pipeline', `ls | grep foo; cat ${D}`, true],
  ['Read tool on dotfile',       null, true],  // handled specially below
];

let P = 0, F = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(40)} ${got}${ok ? '' : ` (want ${want})`}`);
  ok ? P++ : F++;
};

console.log('1. credential-path extraction (pattern operands vs real accesses)');
for (const [name, cmd, wantBlock] of cases) {
  if (cmd === null) continue;
  check(name, decision({ command: cmd }), wantBlock ? 'deny' : 'allow');
}
check('Read tool on dotfile', decision({ file_path: `/tmp/${D}` }, 'Read'), 'deny');

// ── Secret scanning false positives (staged-content patterns) ───────────────
console.log('\n2. secret patterns: noise discarded, real shapes still caught');
const src = require('fs').readFileSync(GUARD, 'utf8');
const SECRET_PATTERNS = eval(src.match(/const SECRET_PATTERNS = \[[\s\S]*?\n\];/)[0]
  .replace('const SECRET_PATTERNS =', '').replace(/;$/, ''));
const FALSE_POSITIVE_INDICATORS = eval(src.match(/const FALSE_POSITIVE_INDICATORS = \[[\s\S]*?\];/)[0]
  .replace('const FALSE_POSITIVE_INDICATORS =', '').replace(/;$/, ''));
eval(src.match(/function isFalsePositive\(match\)[\s\S]*?\n}/)[0]);

const flags = (text) => {
  for (const { pattern } of SECRET_PATTERNS)
    for (const m of (text.match(new RegExp(pattern, 'g')) || []))
      if (!isFalsePositive(m)) return true;
  return false;
};
const secretCases = [
  ['40-char separator banner', '# ' + '='.repeat(40), false],
  ['absolute path >=40 chars', 'cd /Users/nathanielcannon/Claude/Projects/micro1', false],
  ['bolt url + later @ on another line', 'URI="bolt://localhost:7687"\nelse\n  echo "a@b"', false],
  // WARNING: EVERY positive fixture below is BUILT BY CONCATENATION, never written whole.
  // This file is scanned by the very guard it tests, and a complete secret-shaped literal
  // here blocks the commit of the suite itself. Splitting the literal keeps the runtime
  // VALUE intact (so the assertion is real) while ensuring no 40-char run, no complete
  // token and no PEM header exists on disk. Do not 'tidy' these back into one string.
  ['real AWS secret',   'aws_secret=' + 'wJalrXUtnFEMI2K7' + 'MDENGbPxRfiCYz' + 'JbQxWvKpNrTgHd', true],
  // Wholly invented user AND password. Two traps met here, both worth keeping:
  //   1. An earlier draft used this repo's REAL database username with a fake password. The
  //      credential sweep caught it before it reached a PUBLIC remote. A fixture naming a real
  //      account is half a leak — invent BOTH halves.
  //   2. The replacement used 'sampleuser'/'db.example.invalid', and 'sample' and 'example' are
  //      both FALSE_POSITIVE_INDICATORS. The guard correctly ignored it, so the assertion passed
  //      through a dead metric: it tested nothing while looking green. A positive fixture must
  //      avoid every indicator word, or it cannot fail.
  ['real password URL', 'postgres://' + 'dbowner' + ':' + 'Kf7qLm2Pz9Rt' + '@' + 'internal.invalid:5432/appdb', true],
  ['real GitHub token', 'ghp_' + 'A'.repeat(20) + 'b3Kd9xQ7mZ1pL5vR2tY8', true],
  ['real private key',  '-----' + 'BEGIN ' + 'RSA ' + 'PRIVATE ' + 'KEY' + '-----', true],
];
for (const [name, text, want] of secretCases) check(name, flags(text) ? 'flag' : 'clean', want ? 'flag' : 'clean');

// EXACT-NAME MATCHING (2026-09-08). The blocked list used to be unanchored regexes tested
// against the whole path, so `/\.anthropic/`, `/\.openai/` and `/\.github\/.*token/` matched
// a SUBSTRING ANYWHERE and refused ordinary project files. Matching is now exact-basename,
// exact two-segment tail, or a key-material directory. These assert both directions:
// benign look-alikes must stay readable, real credential files must still block.
console.log('\n3. exact-name credential matching (benign look-alikes vs real files)');

const nameCases = [
  // ── benign: must NOT block ──
  ['doc mentioning a vendor name',   'research/anthropic-pricing.md',              'allow'],
  ['dir named after a vendor',       'notes/.anthropic-api-notes/summary.md',      'allow'],
  ['workflow mentioning token',      '.github/workflows/token-refresh.yml',        'allow'],
  ['ordinary file called config',    'projects/app/config',                        'allow'],
  ['ordinary credentials-ish doc',   'docs/credentials-policy.md',                 'allow'],
  ['env in the middle of a name',    'src/environment.ts',                         'allow'],
  ['file named like a key but .pub', String.raw`/Users/x/.ssh/id_rsa.pub`,         'allow'],
  ['known_hosts (not secret)',       String.raw`/Users/x/.ssh/known_hosts`,        'allow'],
  ['a yaml that is not secrets',     'infrastructure/docker-compose.yaml',         'allow'],

  // ── real credential files: must STILL block ──
  ['dotenv exact',                   'app/' + '.' + 'env',                         'deny'],
  ['dotenv variant family',          'app/' + '.' + 'env' + '.production',         'deny'],
  ['aws credentials tail',           '/Users/x/.aws/credentials',                  'deny'],
  ['aws config tail',                '/Users/x/.aws/config',                       'deny'],
  ['ssh private key',                '/Users/x/.ssh/id_ed25519',                   'deny'],
  ['netrc',                          '/Users/x/.netrc',                            'deny'],
  ['pgpass',                         '/Users/x/.pgpass',                           'deny'],
  ['secrets.yaml exact',             'deploy/secrets.yaml',                        'deny'],
  ['gnupg member at depth',          '/Users/x/.gnupg/private-keys/key1',          'deny'],
  ['password-store member',          '/Users/x/.password-store/web/site.gpg',      'deny'],
  ['service-account family',         'infra/service-account-prod.json',            'deny'],
  ['kube config tail',               '/Users/x/.kube/config',                      'deny'],
];

for (const [name, fp, want] of nameCases) check(name, decision({ file_path: fp }, 'Read'), want);

console.log(`\nPASS=${P} FAIL=${F}`);
process.exit(F === 0 ? 0 : 1);
