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

function decision(toolInput, toolName = 'Bash', extra = {}) {
  let out = '';
  try {
    out = execSync(`node ${JSON.stringify(GUARD)}`, {
      input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, ...extra }),
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
  // uv.lock shapes (2026-10-21). Built by concatenation like the secrets below, so this file
  // carries no 40-char run of its own. The URL is a real PyPI path from the WVU lockfile.
  ['PyPI wheel URL in uv.lock', 'url = "https://files.pythonhosted.org/packages/a9/d2/' + 'f4d173e22df740bc37b1d' + 'b102b386ba719b66e95b0f0d751f556b387e6d2' + '/anyio-4.15.1.tar.gz"', false],
  ['sha256 hash in uv.lock', 'hash = "sha256:' + '9f0b1c2d3e4f5a6b7c8d9e0f' + '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b' + '"', false],
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
  // Upside-down OCR garbage (2026-10-27, Fielding's corrected-pages registers): all lower-case.
  ['all-lower-case OCR run', '"' + 'ccscccsscoesceseseesec' + 'eescessotseneeeeteees' + '"', false],
  // Advertisement-page OCR (cr_section_speech_adjudicated.json): few distinct letters, some capitals.
  ['mixed-case OCR advert run', '"' + 'aaTttaeHhnnoeeTaaNnooh' + 'teeaAtnnheeoTaAtnheeo' + '"', false],
  // ProTraits trait names in a data-health record (2026-10-27, Genie): lower-case key=value runs.
  ['ProTraits key=value trait', '"' + 'ecosystemtype=' + 'nonmarinesalineandalkaline' + '"', false],
  ['ProTraits habitat trait',   '"' + 'knownhabitats=' + 'animalgastrointestinaltract' + '"', false],
  // The '=' split must not open a hole: an upper-case env name (in the class) before a real key.
  ['real key after KEY=',       'AWS_SECRET_ACCESS_KEY=' + 'wJalrXUtnFEMI2K7' + 'MDENGbPxRfiCYz' + 'JbQxWvKpNrTgHd', true],
  ['real key with padding',     'token: ' + 'wJalrXUtnFEMI2K7' + 'MDENGbPxRfiCYz' + 'JbQxWvKpNrTgHd' + '==', true],
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

// PROJECT SCRATCHPADS (2026-10-13). A JICM clear starts a new session with a new scratchpad,
// and the exemption matched only the CURRENT one, so a multi-session job was denied its own
// pre-cycle folders. Sibling sessions of the same project are now allowed. Everything else
// under /private/tmp, including other projects' scratchpads, must still block.
console.log('\n4. project scratchpads (sibling sessions allowed, the rest of tmp still forbidden)');

const TMPROOT = '/private/tmp/claude-501';
const PROJ = TMPROOT + '/-Users-x-Claude-Projects-Demo';
const SP = PROJ + '/sess-now/scratchpad';
const withSp = (toolInput, toolName = 'Bash') =>
  decision(toolInput, toolName, { scratchpad_dir: SP });

const spCases = [
  // ── allowed ──
  ['current scratchpad (Bash redirect)',  { command: `echo x > ${SP}/a.txt` },               'Bash',  'allow'],
  ['current scratchpad via /tmp alias',   { command: `echo x > ${SP.replace('/private', '')}/a.txt` }, 'Bash', 'allow'],
  ['prior session, same project',         { command: `echo x > ${PROJ}/sess-old/scratchpad/r/a.txt` }, 'Bash', 'allow'],
  ['prior session, Write tool',           { file_path: `${PROJ}/sess-old/scratchpad/a.json` }, 'Write', 'allow'],
  // ── still forbidden ──
  ['other project scratchpad',            { command: `echo x > ${TMPROOT}/-Users-x-Other/s/scratchpad/a` }, 'Bash', 'deny'],
  ['project root itself',                 { command: `echo x > ${PROJ}/a.txt` },               'Bash',  'deny'],
  ['session dir, not its scratchpad',     { command: `echo x > ${PROJ}/sess-old/a.txt` },      'Bash',  'deny'],
  ['lookalike segment scratchpadX',       { command: `echo x > ${PROJ}/sess-old/scratchpadX/a` }, 'Bash', 'deny'],
  ['dotdot escape from scratchpad',       { command: `echo x > ${SP}/../../../../etc-ish` },   'Bash',  'deny'],
  ['plain /tmp',                          { command: 'echo x > /tmp/a.txt' },                  'Bash',  'deny'],
  // ── cleanup: rm must follow the same boundary as writes ──
  ['rm own scratch file',                 { command: `rm -f ${SP}/a.txt` },                    'Bash',  'allow'],
  ['rm -rf prior session reader dir',     { command: `rm -rf ${PROJ}/sess-old/scratchpad/r` }, 'Bash',  'allow'],
  ['rm -rf the whole claude tmp root',    { command: `rm -rf ${TMPROOT}` },                    'Bash',  'deny'],
  ['rm -rf other project scratchpad',     { command: `rm -rf ${TMPROOT}/-Users-x-Other/s/scratchpad` }, 'Bash', 'deny'],
  ['rm -rf /private/var',                 { command: 'rm -rf /private/var/db' },               'Bash',  'deny'],
  ['rm -rf /private/tmp itself',          { command: 'rm -rf /private/tmp' },                  'Bash',  'deny'],
];
for (const [name, input, tool, want] of spCases) check(name, withSp(input, tool), want);
// With no scratchpad_dir in the payload there is nothing to derive from: prior sessions block.
check('no payload dir: prior session blocks',
  decision({ command: `echo x > ${PROJ}/sess-old/scratchpad/a.txt` }), 'deny');

// REDIRECT TARGETS (2026-10-21). The write-path extractor was a regex, />\s*(\S+)/, run on the
// raw command and returning only its FIRST hit. Two failures, one per direction:
//   noise:  awk '/<!-- UNREAD -->/{p=1} p' file  -> the '>' of '-->' inside the quoted awk
//           program read as a redirect to '/{p=1}', denied as a forbidden system path;
//   unsafe: echo a > ok.txt; echo b > /etc/x     -> only ok.txt was ever checked.
// A '>' inside quotes or a heredoc body is text, unless that text is itself run by a shell
// (bash -c '...', eval "...", bash <<EOF), and every redirect in the command is a target.
console.log('\n5. redirect targets (quoted text is not a redirect; every target is checked)');
const rdCases = [
  // ── noise: must NOT block ──
  ['quoted awk regex holding -->',          String.raw`awk '/<!-- UNREAD -->/{p=1} p' inbox/dev.md`, 'allow'],
  ['double-quoted arrow to a path',         `echo "a -> /etc/x"`,                                   'allow'],
  ['heredoc body with > /etc text',         'cat > notes.md <<\'EOF\'\nredirect like > /etc/x is blocked\nEOF', 'allow'],
  ['comment holding a redirect',            'ls # > /etc/x',                                        'allow'],
  ['fd dup 2>&1 then pipe',                 'make 2>&1 | tail -3',                                  'allow'],
  ['process substitution >(...)',           'tee >(wc -l) < in.txt',                                'allow'],
  ['redirect to /dev/null',                 'grep x f 2>/dev/null',                                 'allow'],
  // ── unsafe: MUST block ──
  ['second redirect is the forbidden one',  'echo a > ok.txt; echo b > /etc/x',                     'deny'],
  ['quoted forbidden target',               'echo a > "/etc/x"',                                    'deny'],
  ['append to forbidden',                   'echo a >> /usr/local/x',                               'deny'],
  ['&> to forbidden',                       'cmd &> /var/log/x',                                    'deny'],
  ['>| clobber to forbidden',               'echo a >| /etc/x',                                     'deny'],
  ['bash -c string redirect',               `bash -c 'echo a > /etc/x'`,                            'deny'],
  ['sh -c string after other flags',        `sh -e -c "echo a > /etc/x"`,                           'deny'],
  ['eval string redirect',                  `eval "echo a > /etc/x"`,                               'deny'],
  ['heredoc fed to bash',                   'bash <<\'EOF\'\necho a > /etc/x\nEOF',                 'deny'],
  ['rm after a harmless redirect',          'echo a > ok.txt && rm -rf /tmp/x',                     'deny'],
  // ── command words (mkdir, cp ...) read the VISIBLE command: a script file's body runs nothing ──
  ['script body written by heredoc',        'cat > solve.sh <<\'EOF\'\nmkdir -p /app/workdir\nEOF',  'allow'],
  ['command words inside quoted prose',     `echo "then mkdir -p /etc/foo"`,                        'allow'],
  ['mkdir inside bash -c',                  `bash -c 'mkdir -p /etc/foo'`,                          'deny'],
  ['cp to a quoted path with a space',      `cp a "/Library/Application Support/x"`,                'deny'],
  // ── a shell string run in a container or on another host writes THERE ──
  ['bash -c inside docker run',             `docker run --rm img bash -c "mkdir -p /tmp/o"`,        'allow'],
  ['ssh remote command string',             `ssh host 'echo a > /etc/x'`,                           'allow'],
  ['heredoc fed to a remote shell',         'ssh host bash <<\'EOF\'\necho a > /etc/x\nEOF',       'allow'],
  ['docker, then a LOCAL bash -c',          `docker ps; bash -c 'echo a > /etc/x'`,                 'deny'],
];
for (const [name, cmd, want] of rdCases) check(name, decision({ command: cmd }), want);

// ── 5. WHICH REPOSITORY a commit is scanned in (2026-10-27) ─────────────────
// The scan used the hook's cwd, so `cd <repo> && git commit` and `git -C <repo> commit` were
// scanned against the wrong index; and a staged file over 1 MiB threw ENOBUFS and was skipped.
// Real throwaway repos under .claude/scratch; GIT_* stripped so no test git can reach a real repo.
console.log('\n5. secret scan: the repository the commit runs in');
{
  const fs = require('fs');
  const root = path.resolve(__dirname, '../../scratch', `sg-repo-test-${process.pid}`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const sh = (cmd, cwd) => execSync(cmd, { cwd, env, stdio: 'ignore' });
  const mkrepo = (name, files) => {
    const d = path.join(root, name);
    fs.mkdirSync(d, { recursive: true });
    sh('git init -q && git config user.email t@t.invalid && git config user.name t', d);
    for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(d, f), body);
    sh('git add -A', d);
    return d;
  };
  const SECRET = 'aws_secret=' + 'wJalrXUtnFEMI2K7' + 'MDENGbPxRfiCYz' + 'JbQxWvKpNrTgHd';
  try {
    const dirty = mkrepo('dirty', { 'a.txt': SECRET + '\n' });
    const clean = mkrepo('clean', { 'a.txt': 'nothing here\n' });
    const big = mkrepo('big', { 'b.txt': 'x'.repeat(2 * 1024 * 1024) + '\n' + SECRET + '\n' });
    const here = path.resolve(__dirname, '../../..');   // the session cwd: NOT the repos above
    const repoCases = [
      ['cd <dirty> && git commit',          `cd ${dirty} && git commit -m x`, 'deny'],
      ['git -C <dirty> commit',             `git -C ${dirty} commit -m x`,    'deny'],
      ['cd <clean> && git commit',          `cd ${clean} && git commit -m x`, 'allow'],
      ['cd <clean>; git -C <dirty> commit', `cd ${clean}; git -C ${dirty} commit -m x`, 'deny'],
      ['staged file over 1 MiB',            `cd ${big} && git commit -m x`,   'deny'],
      ['cd $VAR (unresolvable) && commit',  'cd "$SOMEWT" && git commit -m x', 'deny'],
      ['cd $VAR, then no commit at all',    'cd "$SOMEWT" && git log --grep commit', 'allow'],
    ];
    for (const [name, cmd, want] of repoCases) check(name, decision({ command: cmd }, 'Bash', { cwd: here }), want);
    check('session cwd = <dirty>, bare commit', decision({ command: 'git commit -m x' }, 'Bash', { cwd: dirty }), 'deny');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

console.log(`\nPASS=${P} FAIL=${F}`);
process.exit(F === 0 ? 0 : 1);
