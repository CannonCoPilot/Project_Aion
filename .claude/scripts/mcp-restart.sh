#!/bin/bash
# mcp-restart.sh — Trigger MCP server hot-reload by touching the watched file
# Usage: mcp-restart.sh <server-name>
#
# Works with mcp-hot-reload proxy configured in .mcp.json.
# The proxy watches specific files — touching them triggers a restart.

PROJECT_ROOT="$HOME/Claude/Project_Aion"

# Map server names to their watched files
declare_watch_files() {
    case "$1" in
        jarvis-rag)
            echo "$PROJECT_ROOT/infrastructure/rag-service/mcp_server.py"
            ;;
        jarvis-graphiti)
            echo "$PROJECT_ROOT/infrastructure/rag-service/graphiti_mcp_server.py"
            ;;
        *)
            echo ""
            ;;
    esac
}

if [ -z "$1" ]; then
    echo "Usage: mcp-restart.sh <server-name>"
    echo ""
    echo "Hot-reload enabled servers:"
    echo "  jarvis-rag       — RAG/Qdrant MCP server"
    echo "  jarvis-graphiti  — Graphiti/Neo4j MCP server"
    echo ""
    echo "Note: Other MCP servers (npm-based) require full session restart."
    exit 1
fi

SERVER_NAME="$1"
WATCH_FILE=$(declare_watch_files "$SERVER_NAME")

if [ -z "$WATCH_FILE" ]; then
    echo "ERROR: Server '$SERVER_NAME' is not configured for hot-reload."
    echo "Only jarvis-rag and jarvis-graphiti support hot-reload."
    echo "Other servers require a full Claude Code session restart."
    exit 1
fi

if [ ! -f "$WATCH_FILE" ]; then
    echo "ERROR: Watched file not found: $WATCH_FILE"
    exit 1
fi

echo "Triggering hot-reload for: $SERVER_NAME"
echo "  Touching: $WATCH_FILE"
touch "$WATCH_FILE"
echo "Done. Server should restart within ~300ms (debounce)."
