# Mac Studio Full Migration Plan

## Context

Phase C of Roadmap II has been blocked pending Mac Studio availability. The Mac Studio is now reachable via SSH (`Jarvis@JARVIS.local` / `Jarvis@100.93.132.61` via Tailscale). This plan covers the full liftover of Jarvis and all Claude Code infrastructure from MacBook Air (source) to Mac Studio (target), followed by infrastructure expansion (databases, AI models).

**Source**: MacBook Air M4, 16GB RAM, macOS 26.2, user `aircannon`
**Target**: Mac Studio, user `Jarvis`, reachable via Tailscale at 100.93.132.61

### Decisions Made

- **Plugin cache**: SKIP — let it regenerate on Mac Studio (~911MB saved)
- **Operation mode**: FULL CUTOVER — Mac Studio becomes sole Jarvis host
- **AIfred baseline**: CLONE FRESH on Mac Studio (avoids stashed local modification)

### What We're Moving (~2.0GB after cleanup)

| Directory | Size | Contents |
|-----------|------|----------|
| `~/Claude/` | ~1.4GB | Jarvis (437MB), Projects (511MB), gptr-mcp (430MB), claude-code-docs (51MB) |
| `~/.claude/` | ~1.1GB | projects (905MB), settings, memory, hooks, scripts (excl. plugins, debug) |
| `~/.local/share/claude/` | ~173MB | Claude Code binary (latest 2.1.37 only) |
| `~/bin/` | ~1.3MB | Custom tmux 3.4 ARM64, cliclick |

**Excluded from transfer**: AIfred repo (clone fresh), plugins (regenerate), debug logs, old CC versions

### Critical Concerns

- **Username difference**: `aircannon` (source) vs `Jarvis` (target) — 15+ files with hardcoded paths
- **Custom tmux binary**: ARM64 Mach-O, must verify compatibility or rebuild
- **Credentials**: `.claude/secrets/credentials.yaml`, `.zshrc` API tokens, `gptr-mcp/.env`
- **Git remote has embedded PAT**: Security issue to address
- **Symlinks**: `jarvis-statusline.sh` → `~/.claude/scripts/`
- **Large disposable files**: `debug.log` (106MB), old session exports (50MB+), ML model caches (87MB)

---

## Phase 1: Pre-Migration Cleanup (Source Machine)

### 1.1 Clean disposable files before transfer

```bash
# Remove debug logs (~106MB)
rm -f ~/.claude/debug.log

# Remove old Claude Code versions (keep only latest 2.1.37, save ~346MB)
rm -rf ~/.local/share/claude/installed/claude-code-2.1.34/
rm -rf ~/.local/share/claude/installed/claude-code-2.1.36/

# Remove JICM session archives (gitignored runtime state)
rm -rf ~/Claude/Jarvis/.claude/jicm-sessions/
rm -f ~/Claude/Jarvis/.claude/logs/jicm-watcher.log.*

# Clear marketplace plugin cache if stale (~911MB, will regenerate)
# NOTE: Ask user — this is the biggest item. Skip if bandwidth isn't a concern.
```

**Estimated savings**: ~500MB-1.4GB depending on plugin cache decision

### 1.2 Inventory hardcoded paths

Files requiring `/Users/Jarvis` → `/Users/Jarvis` substitution:
- `.claude/secrets/credentials.yaml`
- `.claude/settings.json` (project paths)
- `.claude/projects/` directory names (contain source path hashes)
- `CLAUDE.md` (tmux binary path)
- `.claude/scripts/launch-jarvis-tmux.sh` (uses `$HOME`, likely OK)
- `.claude/hooks/*.js` (any absolute path references)
- `.zshrc` / `.zprofile` (PATH, NVM_DIR, aliases)
- Git remote URLs with embedded credentials

---

## Phase 2: Target Environment Setup (Mac Studio)

### 2.1 Install core dependencies

```bash
# SSH to Mac Studio
ssh Jarvis@100.93.132.61

# Install Homebrew (if not present)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install core tools
brew install yq jq git curl wget

# Install NVM + Node v24
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc
nvm install 24
nvm alias default 24

# Install Docker Desktop (for Phase C infrastructure)
brew install --cask docker

# Install tmux (system version first, custom binary later)
brew install tmux
```

### 2.2 Install Claude Code

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### 2.3 Create directory structure

```bash
mkdir -p ~/Claude ~/bin
```

---

## Phase 3: Data Transfer (rsync)

### 3.1 Transfer project files

```bash
# From source machine (MacBook Air):

# Transfer ~/Claude/ (all projects EXCEPT AIfred — will clone fresh)
rsync -avz --progress \
  --exclude='AIfred/' \
  --exclude='.git/objects' \
  --exclude='node_modules/' \
  --exclude='.claude/jicm-sessions/' \
  --exclude='.claude/logs/*.log.*' \
  --exclude='*.pyc' \
  --exclude='__pycache__/' \
  ~/Claude/ Jarvis@100.93.132.61:~/Claude/

# Transfer ~/.claude/ (settings, memory, project data)
rsync -avz --progress \
  --exclude='debug.log' \
  --exclude='debug/' \
  --exclude='plugins/' \
  ~/.claude/ Jarvis@100.93.132.61:~/.claude/

# Transfer custom binaries
rsync -avz --progress ~/bin/ Jarvis@100.93.132.61:~/bin/

# Transfer Claude Code installation
rsync -avz --progress ~/.local/share/claude/ Jarvis@100.93.132.61:~/.local/share/claude/
```

### 3.2 Transfer credentials (manual, not rsync)

```bash
# Securely copy credentials
scp ~/.claude/secrets/credentials.yaml Jarvis@100.93.132.61:~/.claude/secrets/

# Copy relevant .zshrc sections manually (API keys, PATH entries)
# Do NOT blindly copy entire .zshrc — machine-specific settings differ
```

### 3.3 Clone AIfred baseline fresh on Mac Studio

```bash
# On Mac Studio:
cd ~/Claude
git clone https://github.com/davidmoneil/AIfred.git
cd AIfred && git checkout main
# Verify baseline commit
git log --oneline -1
```

---

## Phase 4: Path Adaptation

### 4.1 Bulk path replacement

On the Mac Studio, fix hardcoded paths:

```bash
# Find all files referencing old username
grep -rl '/Users/Jarvis' ~/Claude/ ~/.claude/ --include='*.md' --include='*.yaml' --include='*.json' --include='*.js' --include='*.sh' 2>/dev/null

# For each file, replace /Users/Jarvis → /Users/Jarvis
# Use sed or targeted edits — review each file before bulk replace
```

### 4.2 Fix .claude/projects/ directory mapping

The `.claude/projects/` directory uses path-hash directories (e.g., `-Users-aircannon-Claude-Jarvis/`). These encode the project path and must be renamed:

```bash
# Rename project directory
mv ~/.claude/projects/-Users-aircannon-Claude-Jarvis/ \
   ~/.claude/projects/-Users-Jarvis-Claude-Jarvis/
```

### 4.3 Fix Git remotes

```bash
cd ~/Claude/Jarvis
# Remove embedded PAT from remote URL (security fix)
git remote set-url origin https://github.com/davidmoneil/AIfred.git
# PAT will be applied at push time via git-ops skill
```

### 4.4 Fix symlinks

```bash
# Recreate any broken symlinks
ln -sf ~/.claude/scripts/jarvis-statusline.sh ~/path/as/needed
```

### 4.5 Verify custom tmux binary

```bash
# Check if custom tmux works on Mac Studio
~/bin/tmux -V
# If it fails, rebuild from source or use Homebrew tmux
# Update CLAUDE.md tmux binary path if needed
```

---

## Phase 5: Post-Migration Validation

### 5.1 Claude Code basic validation

```bash
# On Mac Studio:
cd ~/Claude/Jarvis
claude --version
# Start a test session, verify CLAUDE.md loads
```

### 5.2 Jarvis infrastructure validation

```bash
# Launch tmux session
~/bin/tmux new-session -d -s jarvis -n Jarvis
# Verify session-start hook fires
# Verify JICM watcher can start
# Verify all 5 MCPs connect (memory, local-rag, fetch, git, playwright)
```

### 5.3 Git validation

```bash
cd ~/Claude/Jarvis
git status
git log --oneline -5
git remote -v
# Verify branch is Project_Aion, last commit is 5fa4b66
```

### 5.4 Hook validation

```bash
# Verify hooks directory is intact
ls ~/.claude/hooks/ | wc -l  # Should be ~29
# Start Claude Code session, check that hooks fire
```

### 5.5 Credential validation

```bash
# Test PAT extraction
yq -r '.github.aifred_token' ~/.claude/secrets/credentials.yaml | head -1
# Test git push capability (dry-run)
```

---

## Phase 6: Infrastructure Expansion (Post-Migration)

Once Jarvis is running on Mac Studio, set up additional infrastructure:

### 6.1 Docker Services (Phase C.1-C.5 from Roadmap II)

- **Supabase** (C.4): PostgreSQL + PostgREST + Auth — primary database
- **Obsidian sync** (C.2): Knowledge base integration
- **n8n** (C.3): Workflow automation
- **LSP services** (C.5): Language servers for code intelligence

### 6.2 AI Models (Phase D from Roadmap II)

- **Ollama**: Local LLM inference (embeddings, multimodal)
  - `nomic-embed-text` — embeddings for RAG
  - `llava` or `bakllava` — multimodal vision
  - `codellama` — code-specific tasks
- **Chroma/Qdrant**: Vector database for embeddings
- **Whisper**: Speech-to-text (optional)

### 6.3 Database Infrastructure

- **PostgreSQL** (via Supabase or standalone): Structured data, telemetry storage
- **SQLite**: Local fast storage for JICM metrics, experiment data
- **Redis**: Caching layer for MCP responses (optional)

---

## Execution Order

| Step | Phase | Description | Estimated Time |
|------|-------|-------------|----------------|
| 1 | 1.1 | Pre-migration cleanup | 5 min |
| 2 | 2.1 | Install Homebrew + core deps on Mac Studio | 10 min |
| 3 | 2.2 | Install Claude Code on Mac Studio | 5 min |
| 4 | 3.1 | rsync project files (~1.5GB) | 10-20 min |
| 5 | 3.2 | Transfer credentials (manual) | 5 min |
| 6 | 4.1-4.5 | Path adaptation + fixes | 15-20 min |
| 7 | 5.1-5.5 | Post-migration validation | 10-15 min |
| 8 | 6.1-6.3 | Infrastructure expansion | Subsequent sessions |

**Total migration time (Steps 1-7)**: ~60-80 minutes

---

## Verification Checklist

- [ ] Claude Code runs on Mac Studio and loads CLAUDE.md
- [ ] `git status` shows Project_Aion branch, correct last commit
- [ ] tmux session launches with 6 windows
- [ ] JICM watcher starts and monitors W0
- [ ] All 5 MCPs connect (memory, local-rag, fetch, git, playwright)
- [ ] Hooks fire correctly (session-start, pre/post tool use)
- [ ] Credentials accessible (PAT extraction works)
- [ ] No hardcoded `/Users/Jarvis` paths remain
- [ ] Git push works to origin/Project_Aion
- [ ] Session-state.md and current-priorities.md load correctly

---

## Decisions (Resolved)

1. **Plugin cache**: SKIP — regenerate on first use (saves 911MB transfer)
2. **Operation mode**: FULL CUTOVER — Mac Studio becomes sole Jarvis host
3. **AIfred baseline**: CLONE FRESH — clean checkout avoids stash/local-modification issues

---

*Plan for Phase C.0: Mac Studio Full Migration — Project Aion v5.10.0*
