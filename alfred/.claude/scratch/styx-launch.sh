#!/usr/bin/env zsh
# Styx daemon relaunch wrapper (Phase A sentinel-fix restart).
# Mirrors the original tmux pane wrapper so behaviour is unchanged.
cd /Users/nathanielcannon/Claude/Project_Aion/alfred
export TMUX_SESSION='aion' ALFRED_DIR='/Users/nathanielcannon/Claude/Project_Aion/alfred'
bash '/Users/nathanielcannon/Claude/Project_Aion/alfred/.claude/jobs/lib/host-executor-bridge.sh' --daemon
echo 'Styx stopped.'
read
