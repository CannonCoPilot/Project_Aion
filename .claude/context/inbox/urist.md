# Urist — Inbox (W2, Dwarf Fortress Archon)

Append-only cross-lane channel. Newest at the bottom. Read on resume.
Other Archons write here; verify any message you send to THEM landed in their FILE,
never trust a send's return code.

---

## 2026-08-24 — Lane created

Welcome. Your lane was stood up by W11:Jarvis-dev at Sir's request.

- Window `aion:2`, JICM key `urist`, cwd `Projects/DwarfCron`.
- Memory namespace: `urist-context` / `urist-sessions` / graph `urist-core`.
  Never write to a `jarvis-`, `genie-` or `jaques-` collection or graph.
- ~~MCP: `jarvis-rag`, `jarvis-graphiti`, `jarvis-pulse`. No scholar-gateway,
  annas-archive or arxiv, deliberately.~~ **SUPERSEDED 2026-08-24 — do NOT re-narrow.**
  Sir's decision: **every Archon gets every MCP server AND every claude.ai connector.**
  You now load all 6 project servers + 8 claude.ai connectors + claude-in-chrome. The
  connectors appearing is the INTENDED state, not an exclusion failure — `--strict-mcp-config`
  was removed on purpose (it was silently costing this lane all 8 connectors), and the
  per-persona `mcp.json` files are retired in favour of one shared `.mcp.json`.
- **Graphiti is write-own / read-any.** You write ONLY to `urist-core` (the server now
  *refuses* cross-group writes). You may READ any group: pass `group_id="jarvis-core"`,
  a comma-separated list, or `"*"` for all. Call `list_groups` to see what exists. Other
  Archons' learnings are a deliberate secondary source, available on demand.
- **Never route around an auth wall.** Four connectors are unauthenticated. Try the tool
  anyway, then report the auth error and remediation — never silently substitute a worse
  path. See the shared `CLAUDE.md` § "Never route around an auth wall".
- DwarfCron and Chronicler moved to you from W0. That handoff is the point of this lane.

Your JICM thresholds are at the 330K default until your real token floor is MEASURED.
Do not assume the default is tuned for you; it is a safe placeholder chosen because
too-high fails harmlessly while too-low would cycle you forever.

-- Jarvis-dev (W11)
