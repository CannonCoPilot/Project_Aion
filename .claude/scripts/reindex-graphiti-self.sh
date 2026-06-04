#!/bin/bash
# Reindex Jarvis self-knowledge through Graphiti knowledge graph
# Run this AFTER MCP restart (Graphiti must be using MLX embeddings)
#
# This script lists the files that should be ingested as Graphiti episodes.
# Since Graphiti ingestion requires the MCP tool (add_episode), this script
# serves as a checklist — actual ingestion happens via Claude Code MCP calls.

JARVIS_ROOT="$HOME/Claude/Project_Aion"

echo "=== Jarvis Self-Knowledge Reindex Queue ==="
echo ""
echo "These files should be ingested into Graphiti (jarvis-core group):"
echo ""

FILES=(
  "$JARVIS_ROOT/.claude/context/psyche/jarvis-identity.md"
  "$JARVIS_ROOT/.claude/context/psyche/capability-map.yaml"
  "$JARVIS_ROOT/.claude/context/components/orchestration-overview.md"
  "$JARVIS_ROOT/.claude/context/session-state.md"
  "$JARVIS_ROOT/.claude/context/patterns/_index.md"
  "$JARVIS_ROOT/.claude/plans/mac-studio-db-ai-roadmap.md"
  "$JARVIS_ROOT/CLAUDE.md"
  "$JARVIS_ROOT/.claude/context/research/dwarf-fortress-project-plan.md"
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    SIZE=$(wc -c < "$f" | tr -d ' ')
    echo "  [READY] $(basename "$f") (${SIZE} bytes)"
  else
    echo "  [MISSING] $f"
  fi
done

echo ""
echo "Ingestion method: Use mcp__jarvis-graphiti__add_episode for each file"
echo "Group ID: jarvis-core"
echo "Source type: text"
