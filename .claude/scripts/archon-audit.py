#!/usr/bin/env python3
"""Audit Archon lanes against the skeleton (persona imports, identity, home, launch, settings/hooks, JICM files, memory
index, Qdrant). Read-only. Usage: archon-audit.py fielding fleming urist genie. Written 2026-10-27 (W3, Fielding/Fleming
port); validated by its failures on urist/genie. Add a lane to LANES to audit it."""
import json, os, re, subprocess, sys, urllib.request
A = '/Users/nathanielcannon/Claude/Project_Aion'; C = f'{A}/.claude/context'; H = os.path.expanduser('~')
LAUNCH = open(f'{A}/.claude/scripts/launch-aion.sh').read()
LANES = {'fielding': dict(win=12, var='FIELDING', name='Fielding'), 'fleming': dict(win=6, var='FLEMING', name='Fleming'), 'urist': dict(win=2, var='URIST', name='Urist'), 'genie': dict(win=4, var='GENIE', name='Genie')}
def run(c): return subprocess.run(c, shell=True, capture_output=True, text=True).stdout
def audit(n):
    L = LANES[n]; bad = []; ok = []
    def chk(cond, msg): (ok if cond else bad).append(msg)
    # persona + imports
    p = f'{A}/.claude/personas/{n}/CLAUDE.md'; ps = open(p).read()
    imps = re.findall(r'^@(\S+)', ps, re.M)
    chk(imps, 'persona force-loads files')
    for i in imps: chk(os.path.exists(i), f'import resolves: {i}')
    chk(f'{C}/psyche/{n}-identity.md' in imps, 'identity is force-loaded')
    chk(f'{C}/inbox/{n}.md' in imps, 'inbox is force-loaded')
    for path in set(re.findall(r'`(/Users/[^`\s]+)`', ps)):
        chk(os.path.exists(path.rstrip('/')), f'persona path exists: {path}')
    # home
    chk(os.path.isfile(f'{A}/projects/{n}/README.md'), 'projects/<n>/README.md')
    for d in ('arxiv', 'papers'):
        chk(os.path.isdir(f'{A}/projects/{n}/{d}'), f'projects/{n}/{d} resolves')
    # launch
    m = re.search(rf'^{L["var"]}_LAUNCH_DIR="([^"]+)"', LAUNCH, re.M); cwd = m.group(1)
    chk(os.path.isdir(cwd), f'launch dir exists: {cwd}')
    chk(os.path.isfile(f'{cwd}/CLAUDE.md'), 'cwd CLAUDE.md (domain law) exists')
    env = re.search(rf'local env_{n}="([^"]+)"', LAUNCH).group(1)
    for k in ('ARXIV_STORAGE_PATH', 'SCHOLAR_DOWNLOAD_PATH'):
        v = re.search(rf'{k}=(\S+)', env); chk(v and os.path.isdir(v.group(1)), f'{k} dir exists: {v.group(1) if v else None}')
    chk(f'JARVIS_SESSION_ROLE={n}' in env and f'GRAPHITI_GROUP_ID={n}-core' in env and f'JICM_RAG_COLLECTION={n}-sessions' in env, 'env role/graph/rag keys match')
    chk(f'JARVIS_WINDOW={L["win"]}' in env, f'env JARVIS_WINDOW={L["win"]}')
    sa = re.search(rf'local sysappend="(You are W\d+:{L["name"]}[^"]*)"', LAUNCH).group(1)
    chk("'" not in sa, 'sysappend has no apostrophe (it is single-quoted at launch)')
    for mc in re.findall(rf'local {n}_mcp\w*="([^"]+)"', LAUNCH):
        mc = mc.replace('$PROJECT_DIR', A).replace(f'${L["var"]}_LAUNCH_DIR', cwd)
        try: json.load(open(mc)); chk(True, f'mcp config valid: {mc}')
        except Exception as e: chk(False, f'mcp config valid: {mc} ({e})')
    tw = run(f"/Users/nathanielcannon/bin/tmux list-windows -t aion -F '#{{window_index}} #{{window_name}}'")
    chk(f'{L["win"]} {L["name"]}' in tw.splitlines(), f'tmux window {L["win"]} is named {L["name"]}')
    # settings
    s = json.load(open(f'{cwd}/.claude/settings.json'))
    chk('statusLine' in s and os.path.exists(s['statusLine']['command'].split()[-1]), 'statusLine script exists')
    cmds = [h['command'] for ev in s.get('hooks', {}).values() for e in ev for h in e['hooks']]
    for c in cmds:
        f = [t for t in c.replace('&', ' ').split() if t.startswith('/') or '$' in t]
        f = [t.replace('$CLAUDE_PROJECT_DIR', cwd) for t in f]
        for t in f: chk(os.path.exists(t), f'hook file exists: {t}')
    chk(any('bash-safety-guard.js' in c for c in cmds), 'bash safety guard registered')
    # JICM
    for f in (f'jicm/registry/{n}.json', f'.current-{n}-uuid', f'.scratchpad.{n}.md', f'inbox/{n}.md', f'jicm/chain/{n}.jsonl', f'jicm/checkpoints/{n}.compressed.md'):
        chk(os.path.exists(f'{C}/{f}'), f'jicm file: {f}')
    chk(os.path.getsize(f'{C}/inbox/{n}.md') < 60000, f'inbox small enough to force-load ({os.path.getsize(f"{C}/inbox/{n}.md")} B)')
    lbl = run(f"/bin/bash -c 'source {A}/.claude/scripts/jicm-config.sh >/dev/null 2>&1; jicm_key_paths {n}; echo \"$JK_LANE_LABEL|$JK_GIT_DIRS\"'").strip()
    chk(lbl.split('|')[0] != '', 'JK_LANE_LABEL set'); 
    for g in lbl.split('|')[1].split(':'): chk(os.path.isdir(f'{g}/.git') or os.path.isfile(f'{g}/.git'), f'JK git dir is a repo: {g}')
    slug = '-' + cwd.strip('/').replace('/', '-'); uuid = open(f'{C}/.current-{n}-uuid').read().strip()
    chk(os.path.isfile(f'{H}/.claude/projects/{slug}/{uuid}.jsonl'), f'current session transcript exists ({uuid[:8]})')
    # memory
    md = f'{H}/.claude/projects/{slug}/memory'; idx = open(f'{md}/MEMORY.md').read()
    links = set(re.findall(r'\]\(([^)]+\.md)\)', idx)); files = {f for f in os.listdir(md) if f.endswith('.md') and f != 'MEMORY.md'}
    miss = sorted(l for l in links if not os.path.exists(f'{md}/{l}')); chk(not miss, f'memory index links resolve {miss or ""}')
    orphan = sorted(files - links); chk(not orphan, f'every memory file is indexed {orphan or ""}')
    # RAG collections
    try:
        cols = {c['name'] for c in json.load(urllib.request.urlopen('http://localhost:6333/collections', timeout=5))['result']['collections']}
        for k in ('context', 'research', 'sessions', 'codebase'): chk(f'{n}-{k}' in cols, f'qdrant {n}-{k}')
    except Exception as e: chk(False, f'qdrant reachable ({e})')
    return ok, bad
for n in sys.argv[1:]:
    ok, bad = audit(n)
    print(f'\n== {n}: {len(ok)} ok, {len(bad)} FAIL'); [print('  FAIL', b) for b in bad]
