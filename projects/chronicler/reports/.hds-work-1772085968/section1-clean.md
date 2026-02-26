## 1. Product Vision

### 1.1 Mission Statement

**Chronicler** is a living record of every world Dwarf Fortress generates. It is the first tool in the DF ecosystem to combine persistent database storage, live fortress polling, legends XML ingestion, LLM-driven narrative generation, worldgen monitoring, and dynamic Knowledge Horizon masking in a single integrated system.

### 1.2 Two Core Purposes

**Purpose 1 -- The AI Storyteller**: A conversational interface that knows your world as well as any bard in it. Ask "who was the most tragic dwarf in history?" and get a coherent character study drawing on biography, relationships, and the events that shaped them.

**Purpose 2 -- The Living Atlas**: An all-inclusive data viewer in your browser, showing everything from world-generation demographics to current fortress population in real time.

### 1.3 Unique Position

Landscape Overview table categorizing the DF tool ecosystem into six distinct categories: (1) Legends Browsers (LegendsViewer-Next, LegendsBrowser, LegendsBrowser2) -- XML export files, batch parse in-memory web UI; (2) Live Game Servers (weblegends) -- DFHack C++ memory, real-time HTTP per-request render; (3) Autonomous Agents (df-ai) -- DFHack C++ memory, tick-based reactive loop; (4) Narrative Generators (df-narrator) -- XML export files, score + template LLM-sized output; (5) Infrastructure Tools (dfhack-client-python, DwarfFortressLogger, myDFHackScripts, DwarvenSurveyor, df-structures) -- mixed RPC/memory/Lua/XML; (6) Mod Management (DF-Modloader, ModHearth, PyLNP, PyDwarf, Nexus Mod Manager) -- filesystem + DFHack Lua.

Chronicler's unique position: No existing tool combines (1) persistent database storage, (2) live fortress polling, (3) legends XML ingestion, (4) LLM-driven narrative generation, (5) worldgen monitoring, (6) mod management awareness, and (7) labor/population management in a single integrated system.

Chronicler is the only tool that combines ALL of:
1. Persistent database storage (PostgreSQL)
2. Live fortress polling (DFHack bridge)
3. Legends XML ingestion (batch parse to CDM)
4. LLM-driven narrative generation (storyteller)
5. Worldgen monitoring (novel capability)
6. Dynamic Knowledge Horizon masking
7. Mod management awareness
8. Labor/population management (Dwarf Therapist-equivalent)

---
