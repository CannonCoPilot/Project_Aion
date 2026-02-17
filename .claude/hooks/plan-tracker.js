#!/usr/bin/env node
// plan-tracker.js — Track active plan file on ExitPlanMode
// PostToolUse hook: matcher ^ExitPlanMode$
//
// When ExitPlanMode fires, finds the most recently modified .md in
// .claude/plans/ and writes its path to .claude/context/.active-plan.
// Ennoia and jicm-prep-context.sh read this to maintain plan awareness.

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const plansDir = path.join(projectDir, '.claude/plans');
const activePlanFile = path.join(projectDir, '.claude/context/.active-plan');

// Read stdin (required for PostToolUse hooks, but we don't need the content)
let input = '';
try {
    input = fs.readFileSync('/dev/stdin', 'utf8');
} catch (e) {
    // stdin may not be available in all contexts
}

// Find most recently modified plan file
try {
    const files = fs.readdirSync(plansDir)
        .filter(f => f.endsWith('.md') && f !== 'README.md')
        .map(f => ({
            name: f,
            fullPath: path.join(plansDir, f),
            mtime: fs.statSync(path.join(plansDir, f)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 0) {
        fs.writeFileSync(activePlanFile, files[0].fullPath);
    }
} catch (e) {
    // Non-fatal — plan tracking is advisory
    process.stderr.write(`plan-tracker: ${e.message}\n`);
}

// Pass through — no blocking, no modifications
console.log(JSON.stringify({}));
