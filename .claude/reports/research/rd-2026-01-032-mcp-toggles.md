# Research Report: rd-2026-01-032 — /mcp Enable|Disable Quick Toggles

**Date**: 2026-03-22
**Status**: COMPLETE
**Result**: ADOPT (already partially in use; formalize)
**Source**: Claude Code v2.1.78 MCP documentation

---

## Summary

The `/mcp` command is a native Claude Code feature for managing MCP servers. It provides an interactive interface to add, remove, authenticate, and view MCP server status. Combined with `claude mcp add/remove` CLI commands and the `ENABLE_TOOL_SEARCH` env var, this replaces Jarvis's custom `mcp-enable.sh`/`mcp-disable.sh` scripts.

## Current Native Capabilities

### `/mcp` Interactive Command
- View all connected MCP servers and their status
- Authenticate with OAuth 2.0 remote servers
- See tool counts per server
- Clear authentication for servers

### `claude mcp` CLI Commands
```bash
claude mcp add <name> --transport <type> <url>   # Add new server
claude mcp remove <name>                          # Remove server
claude mcp add --scope user|project|local         # Scoped installation
```

### Tool Search (Deferred Loading)
- `ENABLE_TOOL_SEARCH=true` (already set in Jarvis launcher)
- Loads MCP tool schemas on-demand via `ToolSearch` tool
- Reduces context overhead: tools listed as names only until needed
- Claude fetches full schema when it decides to use a tool

### Plugin-Managed MCPs
- Plugins can bundle MCP servers
- Connect automatically at session start
- Managed via `/plugin` not `/mcp`
- `/reload-plugins` to connect/disconnect

## Comparison with Jarvis's Current Approach

| Feature | Jarvis Custom Scripts | Native /mcp |
|---|---|---|
| Add server | `mcp-enable.sh` edits `.mcp.json` | `claude mcp add` |
| Remove server | `mcp-disable.sh` edits `.mcp.json` | `claude mcp remove` |
| View status | `mcp-status.sh` | `/mcp` interactive |
| Authentication | Manual config | Built-in OAuth 2.0 |
| Scoped install | Not supported | user/project/local scopes |
| Tool search | `ENABLE_TOOL_SEARCH=true` | Same (already adopted) |

## Jarvis-Specific Considerations

### What Still Needs Custom Management
- **jarvis-rag** and **jarvis-graphiti** — custom Python MCP servers with hot-reload. These are configured in `.mcp.json` with `mcp-hot-reload` wrapper, not standard `claude mcp add`. The native command doesn't support hot-reload wrappers.
- **Service health checks** — native `/mcp` shows connection status but doesn't check if the backing service (Qdrant, Neo4j, MLX) is healthy. The launcher pre-flight still needed.

### What Can Be Simplified
- **mcp-enable.sh / mcp-disable.sh / mcp-status.sh** — these scripts are largely superseded by `claude mcp` CLI. Can be archived.
- **suggest-mcps.sh** — the session-start hook's MCP suggestion logic is no longer needed; tool search handles on-demand loading.

## Recommendations

1. **Archive** `mcp-enable.sh`, `mcp-disable.sh`, `mcp-status.sh` — use native `claude mcp` commands
2. **Keep** `.mcp.json` for custom servers (jarvis-rag, jarvis-graphiti) that need hot-reload
3. **Keep** `ENABLE_TOOL_SEARCH=true` in launcher (already set)
4. **Document** `/mcp` as the primary MCP management interface in MEMORY.md

---

*Research Report rd-2026-01-032 — W5:Jarvis-dev, 2026-03-22*
