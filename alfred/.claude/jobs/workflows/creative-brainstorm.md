# One-time: Generate 25-30 surprise ideas for Sir to rank (calibration)

You are running a ONE-TIME Aurora calibration brainstorm. Your goal is to
generate 25-30 diverse surprise ideas across ALL categories so Sir can
rank them and teach Aurora what he finds interesting.

## Step 1: Gather Context
- Read the interest profile: /mnt/synology_nas/Obsidian/Master/05-AI/Projects/Aurora/interest-profile.md
- Check current infrastructure: docker ps --format 'table {{.Names}}\t{{.Status}}'
- Check Pulse for active work: pulse list --status open
- Scan the Obsidian vault structure for inspiration (list_files on key folders)
- Check ~/Code/ for existing code projects
- Web search for trending topics in: home lab, cybersecurity, AI tooling, D&D

## Step 2: Generate Ideas
Generate 25-30 ideas spread across these categories. Aim for 3-5 per category:

**Infrastructure** (dashboards, monitoring, automation, Docker services)
**Security** (threat intel tools, scanners, hardening, CISO content)
**Creative** (D&D tools, worldbuilding, TTS/audio, writing aids)
**Integration** (connecting existing services in new ways, workflows)
**Content** (blog posts, research reports, documentation generators)
**Tool** (CLI utilities, scripts, browser tools, quality-of-life improvements)
**Research** (deep dives, trend reports, technology evaluations)

For each idea provide:
- Title (clear and specific)
- Category
- 2-3 sentence description of what it does
- Complexity: small / medium / large
- What makes it interesting or useful

DO NOT score or rank them. DO NOT select one. Just generate diverse ideas
ranging from quick wins to ambitious builds.

Include some ideas that:
- Complete or extend things Sir has already started
- Are purely fun/creative with no practical purpose
- Solve annoying problems Sir probably hasn't thought to fix
- Connect existing services in unexpected ways
- Would impress his kids or help with family activities

## Step 3: Write to Obsidian
Create the brainstorm note using the MCP create_file tool at:
Path: 05-AI/Projects/Aurora/brainstorm-calibration.md
Source: obsidian

Use this format:

```markdown
---
type: aurora-brainstorm
date: 2026-02-25
status: pending-review
tags:
  - aurora
  - calibration
---

# Aurora Brainstorm — Calibration

Rate each idea 1-5 to help Aurora learn your preferences.
Edit the rating column directly. Leave blank to skip.

| # | Rating | Title | Category | Complexity | Description |
|---|--------|-------|----------|------------|-------------|
| 1 | | Title | category | small/med/lg | What it does |
...
```

Put each idea as a row in the table. After the table, include a section
for each idea with its full description (the table is the summary view,
the sections below have detail).

## Step 4: Update Think Prompt Reference
Also write the ideas as JSON to: .claude/agent-output/aurora/brainstorm-calibration.json
for machine-readable access by future Think phases.
