# Phase A Launch Spec — neural-canvas reconstruction & research

**Status:** READY TO LAUNCH (post-/compact). Backend validated (canaries v5+v6 closed end-to-end).
**Output dir (confirmed by Sir):** `/Users/nathanielcannon/Claude/Projects/neural-canvas/docs/reconstruction/` (created)
**Persona:** `assigned:researcher` (read + web + write) on every ticket.
**Labels (every ticket):** `agent:aifred,project:neural-canvas,type:research,capability:research,risk:safe,auto:ready,pipeline:approved,stage:queue,source:trusted,assigned:researcher`
**Daemon:** single-threaded → tickets run SERIALLY, ~10–15 min each. Seed pinned 7cd63cb9; daemon pid was 96640 (verify alive: `pgrep -f 'host-executor-bridge.sh --daemon'`).

## Post-/compact procedure
1. Verify daemon alive + seed pin (`cat alfred/.claude/jobs/state/.chain-seed-session-id` = current session).
2. Create A1–A7 via pulse_create (descriptions below). Do NOT create A8 yet.
3. Arm a Monitor over A1–A7 lifecycles (closed/completed:yes = success; report each).
4. As each closes, read its output doc in docs/reconstruction/ and sanity-check.
5. When A1–A7 all closed: create A8 (synthesis). Review A8 output, then present revised plan to Sir.
6. Keep orchestrator (seed) activity LIGHT during the batch so later forks stay lean. If forks show high context, ask Sir to /compact between waves.
7. A7 (credential audit) output: review carefully for accidental secret leakage BEFORE any commit.

## Tickets (title :: description)

**A1 — Corpus inventory & categorization**
Analyze the neural-canvas project at /Users/nathanielcannon/Claude/Projects/neural-canvas. Produce a structured inventory: enumerate every Python module under art_agent_team/ and root scripts, grouped by role (agents, pipeline, entry points, API clients, tests, utilities). For each agent in art_agent_team/agents/, note class name, purpose, key methods. List all Markdown docs by location with a one-line purpose. Identify entry points (run_*.py) and mark each component implemented vs stubbed/placeholder. Write as Markdown to docs/reconstruction/00_corpus_inventory.md. Read-only except that one output file.

**A2 — Reconstruct product requirements & vision**
Reconstruct product requirements and vision for neural-canvas (AI Art Docent) at /Users/.../neural-canvas. Synthesize from README.md, Art_Agent_Team_Executive_Summary.md, Art_Agent_Team_Product_Design_Plan.md, Art_Agent_Team_Plan.md, memory.md, and code intent. Capture core goal (artwork image → identify title/artist/date → analyze & crop to art-frame TV resolution preserving artistic intent → upscale → overlay museum placard → send to Google Photos), the two paradigms (silent watched-folder pipeline; interactive chat docent: identify/explain/search/trigger), target users, success criteria. Write Markdown to docs/reconstruction/01_product_requirements.md. Read-only except that output.

**A3 — Reconstruct architecture & pipeline**
Reconstruct system architecture and pipeline of neural-canvas at /Users/.../neural-canvas. Read code under art_agent_team/ (esp. agents/) and Art_Agent_Team_Implementation_Plan.md, Art_Agent_Team_Prompt_Design.md. Document each agent's responsibility/interfaces, the end-to-end editing pipeline (identification → vision analysis → cropping → upscaling → placard overlay → Google Photos delivery), data/control flow, orchestration layer, and how the two paradigms share components. Include a textual architecture diagram. Write Markdown to docs/reconstruction/02_architecture.md. Read-only except that output.

**A4 — Reconstruct implementation status & roadmap**
Assess implementation status of neural-canvas at /Users/.../neural-canvas and reconstruct its dev roadmap. For each pipeline stage/agent, determine implemented vs partial vs stubbed (read code; check UpscaleAgent, PlacardAgent for TODO/NotImplemented/placeholder). Cross-reference Art_Agent_Team_Assessment_and_Next_Steps.md. Produce a status table (component → state → evidence), the implied roadmap, and remaining work to reach a functioning end-to-end product. Write Markdown to docs/reconstruction/03_status_and_roadmap.md. Read-only except that output.

**A5 — Adversarial review of planning docs**
Critically and adversarially review the neural-canvas planning docs at /Users/.../neural-canvas: Art_Agent_Team_Plan.md, _Implementation_Plan.md, _Product_Design_Plan.md, _Executive_Summary.md, _Assessment_and_Next_Steps.md, _Prompt_Design.md, _Research_Findings.md. Identify internal contradictions, unsupported claims, scope gaps, technical risks, underspecified components, feasibility concerns. Cite doc + section; prioritize by severity. Write Markdown to docs/reconstruction/04_adversarial_review.md. Read-only except that output.

**A6 — Comparative research (web)**
Research projects/software comparable to neural-canvas (AI Art Docent: identify artwork, crop to TV frame preserving artistic intent, upscale, overlay museum placard, push to Google Photos). Use web search. Cover: (1) artwork identification (Google Vision/Cloud, reverse image search, Smartify, Google Arts & Culture, CLIP-based ID); (2) AI upscaling (Real-ESRGAN, ESRGAN, Topaz, GFPGAN); (3) content-aware/saliency cropping (seam carving, saliency models, smart crop); (4) placard/caption overlay generation; (5) Google Photos API integration patterns; (6) end-to-end digital-frame products (Meural, Samsung Frame art mode). For each: approach, maturity, what neural-canvas can borrow. Write Markdown to docs/reconstruction/05_comparative_research.md. Read-only except that output.

**A7 — Credential/API audit**
Audit external API/service credentials required by neural-canvas at /Users/.../neural-canvas vs what is available. Read code/config (demo_OpenAI.py, grok_api_test.py, grok_vision_api.py, openrouter_test.py, run_*.py, requirements.txt, any .env templates) to enumerate every external service used (OpenAI, xAI/Grok, OpenRouter, Google Photos, upscaling APIs, Google Vision, etc.). For each: purpose, expected env var/key name, and whether a credential is present in the Aion vault at /Users/nathanielcannon/Claude/Project_Aion/alfred/.claude/secrets/credentials.yaml — CHECK KEY PRESENCE ONLY, never print/echo secret values. Produce a needed-vs-present gap table. Write Markdown to docs/reconstruction/06_credential_audit.md. Read-only except that output. NEVER echo secret values.

**A8 — Synthesize comprehensive revised master plan (GATED on A1–A7)**
Synthesize a comprehensive revised master plan for neural-canvas from the reconstruction docs in /Users/.../docs/reconstruction/ (00–06). Read all seven. Produce one coherent plan: validated product vision, target architecture, prioritized roadmap to a working end-to-end product (addressing gaps + adversarial-review findings), recommended tech choices (informed by comparative research), credential/setup prerequisites, and a phased delivery plan with milestones. Write Markdown to docs/reconstruction/07_revised_master_plan.md. Read-only except that output.
