# Plan: Add Service Pre-Flight to launch-jarvis-tmux.sh

## Context

Both `jarvis-rag` and `jarvis-graphiti` MCP servers failed at session start because the MLX embedding server (`localhost:8000`) wasn't running. The tmux launcher creates 6 windows (Claude sessions + support scripts) but performs zero dependency checks. Services like Docker containers, MLX embeddings, and LiteLLM are assumed to be running — when they're not, MCP calls fail silently until someone notices.

**Goal**: Add a service pre-flight phase to `launch-jarvis-tmux.sh` that ensures all dependencies are healthy before launching Claude, and starts the MLX embedding server in its own tmux window.

## Approach

Modify `launch-jarvis-tmux.sh` (v2.3 → v2.4) to add a pre-flight section between argument parsing and session creation. Keep it simple — sequential health checks with auto-start for services we control.

### Changes to `.claude/scripts/launch-jarvis-tmux.sh`

**1. Add pre-flight function block** (after line 113, before "Check if session already exists")

```
preflight_services()
```

Checks (in order):
1. **Docker Engine** — `docker info` (fail-fast if Docker Desktop not running)
2. **Docker Compose stack** — `docker compose ps --format json` in `infrastructure/`. If any of the 5 containers are not "running", run `docker compose up -d` and wait up to 30s for health.
3. **Ollama** — `curl -sf localhost:11434/api/version`. Warning only if down (macOS launchd manages it; we can't start it).
4. **MLX Embedding Server** — `curl -sf localhost:8000/health`. If down, start via tmux window `MLX-Embed` (new W6 or utility window outside the main 6). Wait up to 15s for health endpoint.
5. **LiteLLM Proxy** — `curl -sf localhost:4000/health`. If down, start as background process. Wait up to 10s.

Each check prints a status line: `✓ Service (port)` or `✗ Service — starting...` or `⚠ Service — not available (warning)`.

**2. MLX Embed tmux window**

Rather than a numbered window (which would shift W5 Jarvis-dev), create a utility window named `MLX-Embed` that sits after the main windows. The launcher already creates windows by name, not by index — this fits the pattern.

Command for the window:
```bash
"$TMUX_BIN" new-window -t "$SESSION_NAME" -n "MLX-Embed" -d \
    "cd '$PROJECT_DIR/infrastructure/qwen3-embeddings-mlx' && bash start-server.sh; echo 'MLX-Embed stopped.'; read"
```

**3. LiteLLM startup** (if not running)

Start as a background process (matching existing pattern — it's been running as a detached process since Feb 21):
```bash
cd "$PROJECT_DIR/infrastructure" && .venv/bin/litellm --config litellm-config.yaml --port 4000 &>/tmp/litellm.log &
```

**4. Add `--skip-preflight` flag**

For fast relaunches where services are known-good. Skips all health checks.

**5. Update banner and summary**

Add service status to the "Jarvis is ready!" output block.

### Files Modified

| File | Change |
|------|--------|
| `.claude/scripts/launch-jarvis-tmux.sh` | Add `preflight_services()` function, MLX-Embed window, LiteLLM auto-start, `--skip-preflight` flag. Version bump to v2.4. |

No new files created — everything fits in the existing launcher.

### What We're NOT Doing

- Not adding a separate pre-flight script (unnecessary abstraction for one caller)
- Not dockerizing MLX or LiteLLM (they need host GPU/Metal access)
- Not adding Ollama auto-start (managed by macOS launchd)
- Not changing window numbering (W0-W5 stays the same; MLX-Embed is appended)

## Verification

1. Kill MLX embed server, then run `launch-jarvis-tmux.sh` → should auto-start MLX-Embed window and wait for health
2. Stop a Docker container, then run launcher → should `docker compose up -d` and wait for health
3. Run with `--skip-preflight` → should skip all checks
4. Run when everything is already healthy → should pass through quickly (~2s)
5. Verify MCP calls work from W0 after launch (jarvis-rag search, jarvis-graphiti search)
