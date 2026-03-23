# Jarvis — Portable Installation Guide

Instructions for deploying Jarvis on a new machine or user account. Shell scripts and JS hooks use `$HOME`/`process.env.HOME` for portability. Config files, YAML, JSON, and documentation require per-install edits documented below.

---

## Prerequisites

- **macOS** (ARM64 preferred; Intel compatible)
- **Claude Code** CLI installed
- **tmux** at `$HOME/bin/tmux`
- **Docker** (PostgreSQL, Qdrant, Neo4j, Redis, n8n)
- **Node.js** 18+ and **Python 3.12+**
- **Git** with SSH key access

---

## Step 1: Clone the Repository

```bash
# Clone to the expected location
mkdir -p ~/Claude
git clone https://github.com/davidmoneil/AIfred.git ~/Claude/Jarvis
cd ~/Claude/Jarvis
git checkout Project_Aion
```

The default project path is `$HOME/Claude/Jarvis`. If you use a different path, set `CLAUDE_PROJECT_DIR` in your shell profile and adjust paths below accordingly.

---

## Step 2: Executable Files (Already Portable)

Shell scripts (`.sh`) and JavaScript hooks (`.js`) use `$HOME` and `process.env.HOME` with env var fallbacks. **No edits needed** unless your project root is not `$HOME/Claude/Jarvis`.

If your project root differs, set these environment variables:
```bash
export JARVIS_PROJECT_DIR="$HOME/your/custom/path"
export CLAUDE_PROJECT_DIR="$JARVIS_PROJECT_DIR"
```

---

## Step 3: Config Files (Per-Install Edits Required)

These files contain literal paths that JSON/YAML cannot dynamically resolve. Replace the original username with yours.

### 3.1 MCP Configuration (`.mcp.json`)

**Location**: `$PROJECT_ROOT/.mcp.json`

Replace all occurrences of the original home directory with yours:
```bash
cd ~/Claude/Jarvis
sed -i '' "s|/Users/nathanielcannon|$HOME|g" .mcp.json
```

Key paths to verify after edit:
- `BASE_DIR` — should point to your Jarvis root
- Python binary paths — should match your infrastructure venv
- MCP server script paths

### 3.2 Infrastructure MCP Config (`infrastructure/.mcp.json`)

```bash
sed -i '' "s|/Users/nathanielcannon|$HOME|g" infrastructure/.mcp.json
```

### 3.3 Claude Code Settings (`.claude/settings.json`)

**Location**: `$PROJECT_ROOT/.claude/settings.json`

```bash
sed -i '' "s|/Users/nathanielcannon|$HOME|g" .claude/settings.json
```

This updates permission deny rules (secrets read protection, AIfred write protection). Verify the paths in the `deny` arrays match your actual directory structure.

### 3.4 Paths Registry (`paths-registry.yaml`)

**Location**: `$PROJECT_ROOT/paths-registry.yaml`

```bash
sed -i '' "s|/Users/nathanielcannon|$HOME|g" paths-registry.yaml
```

This is the master path registry. After editing, verify:
- `compose_base` points to your Docker directory
- `projects_root` points to your Claude workspace root
- `aifred_baseline.path` points to the AIfred clone

### 3.5 Workspace Allowlist (`.claude/config/workspace-allowlist.yaml`)

```bash
sed -i '' "s|/Users/nathanielcannon|$HOME|g" .claude/config/workspace-allowlist.yaml
```

### 3.6 Evolution Queue (`.claude/state/queues/evolution-queue.yaml`)

```bash
sed -i '' "s|/Users/nathanielcannon|$HOME|g" .claude/state/queues/evolution-queue.yaml
```

### One-Liner for All Config Files

```bash
cd ~/Claude/Jarvis
for f in .mcp.json infrastructure/.mcp.json .claude/settings.json \
         paths-registry.yaml .claude/config/workspace-allowlist.yaml \
         .claude/state/queues/evolution-queue.yaml; do
    [ -f "$f" ] && sed -i '' "s|/Users/nathanielcannon|$HOME|g" "$f"
done
```

---

## Step 4: Documentation Files (Optional, Cosmetic)

~235 Markdown files contain hardcoded paths for documentation purposes. These are cosmetic — they don't affect runtime behavior. If you want accurate paths in docs:

```bash
cd ~/Claude/Jarvis
find . -name '*.md' -not -path './.git/*' \
    -exec grep -l '/Users/nathanielcannon' {} \; \
    | xargs sed -i '' "s|/Users/nathanielcannon|$HOME|g"
```

**Note**: This modifies ~235 files. Consider whether the cosmetic benefit is worth the large git diff.

---

## Step 5: Claude Code Memory Directory

Claude Code stores per-project memory in a directory named after the project path:

```
~/.claude/projects/-Users-<username>-Claude-Jarvis/memory/
```

The directory name is derived by replacing `/` with `-` in the project path and dropping the leading `-`. If your username differs, Claude Code will create a new directory automatically on first run. The `MEMORY.md` file and other memories from the original install will need to be copied:

```bash
# Identify your project slug
PROJECT_SLUG=$(echo "$HOME/Claude/Jarvis" | tr '/' '-' | sed 's/^-//')

# Copy memory from original (if migrating)
OLD_SLUG="Users-nathanielcannon-Claude-Jarvis"
NEW_DIR="$HOME/.claude/projects/-${PROJECT_SLUG}/memory"
mkdir -p "$NEW_DIR"
cp -r "$HOME/.claude/projects/-${OLD_SLUG}/memory/"* "$NEW_DIR/" 2>/dev/null

# Update paths inside MEMORY.md
sed -i '' "s|/Users/nathanielcannon|$HOME|g" "$NEW_DIR/MEMORY.md"
```

---

## Step 6: Credentials

Create the credentials file (gitignored):

```bash
mkdir -p .claude/secrets
cat > .claude/secrets/credentials.yaml << 'EOF'
github:
  aifred_token: "ghp_YOUR_GITHUB_PAT_HERE"
# Add other credentials as needed
EOF
```

---

## Step 7: Infrastructure Services

```bash
# Start Docker services
cd infrastructure
docker compose up -d

# Set up Python venv for infrastructure
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Start MLX embeddings server (Apple Silicon only)
bash qwen3-embeddings-mlx/start-server.sh
```

---

## Step 8: tmux Setup

Ensure tmux is at the expected location:
```bash
# If tmux is elsewhere, create a symlink
mkdir -p ~/bin
ln -sf $(which tmux) ~/bin/tmux
```

Launch the Jarvis tmux session:
```bash
bash .claude/scripts/launch-jarvis-tmux.sh
```

---

## Step 9: Verify

```bash
# Check for any remaining hardcoded paths in executable files
echo "=== Shell scripts ==="
grep -rn '/Users/nathanielcannon' --include='*.sh' . | grep -v '.git/' | wc -l

echo "=== JavaScript ==="
grep -rn '/Users/nathanielcannon' --include='*.js' . | grep -v '.git/' | grep -v node_modules | wc -l

echo "=== Config files ==="
for f in .mcp.json infrastructure/.mcp.json .claude/settings.json paths-registry.yaml; do
    hits=$(grep -c '/Users/nathanielcannon' "$f" 2>/dev/null || echo 0)
    echo "  $f: $hits remaining"
done
```

All counts should be 0.

---

## Environment Variables Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOME` | (system) | Base for all path resolution |
| `CLAUDE_PROJECT_DIR` | `$HOME/Claude/Jarvis` | Project root (set by Claude Code) |
| `JARVIS_PROJECT_DIR` | `$CLAUDE_PROJECT_DIR` | Jarvis-specific override |
| `TMUX_BIN` | `$HOME/bin/tmux` | tmux binary location |

---

*Jarvis Portable Install Guide v1.0.0 — Project Aion*
