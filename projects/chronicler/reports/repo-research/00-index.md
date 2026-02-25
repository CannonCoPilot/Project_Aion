# Repository Research — Master Index

**Part 1 of Research Synthesis**
**Date**: 2026-02-25
**Repos Analyzed**: 17 (across 9 report files)
**Total Features Extracted**: 100+

---

## Report Index

| # | Report File | Repos Covered | Feature Count |
|---|-------------|---------------|---------------|
| 01 | `01-df-ai.md` | df-ai | 12 features (F-AI-01 through F-AI-12) |
| 02 | `02-df-narrator.md` | df-narrator | 7 features (F-NR-01 through F-NR-07) |
| 03 | `03-legends-viewers.md` | LegendsBrowser, LegendsBrowser2, LegendsViewer-Next, DwarvenSurveyor | 13 features (F-LV-01 through F-LV-13) |
| 04 | `04-weblegends.md` | weblegends | 9 features (F-WL-01 through F-WL-09) |
| 05 | `05-dfhack-infrastructure.md` | dfhack-53.10-r1, dfhack-client-python, df-structures | 10 features (F-DH-01 through F-DH-10) |
| 06 | `06-mod-managers.md` | DF-Modloader, ModHearth, Nexus-Mod-Manager, DFHack data/ | 10 features (F-MM-01 through F-MM-10) |
| 07 | `07-mydfhackscripts.md` | myDFHackScripts | 9 features (F-MS-01 through F-MS-09) |
| 08 | `08-dwarf-therapist.md` | DwarfFortressLogger (Dwarf Therapist) | 14 features (F-DT-01 through F-DT-14) |
| 09 | `09-dfhack-plugins-scripts.md` | DFHack plugins (86) + scripts (170+) | Capability catalog |

---

## Feature-to-Component Mapping

### World History & Demographics Visualizer
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-LV-01 | Interactive Leaflet.js World Map | LegendsViewer-Next |
| F-LV-02 | Family Tree / Relationship Graph | LegendsViewer-Next |
| F-LV-07 | Entity/Civilization Overview Dashboard | All legends viewers |
| F-LV-08 | Paginated World Object Browsing | LegendsViewer-Next |
| F-LV-10 | Map Generation from Terrain Data | LegendsViewer-Next, DwarvenSurveyor |
| F-LV-11 | Hyperlinked Navigation | All viewers |
| F-LV-12 | Written Content / Art Form Browsing | LegendsViewer-Next |
| F-NR-01 | Entity Importance Scoring | df-narrator |
| F-NR-03 | Conflict Aggregation | df-narrator |
| F-NR-04 | Artifact Journey Tracking | df-narrator |
| F-WL-07 | Entity Detail Pages | weblegends |

### Database Explorer Tools
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-LV-03 | Comprehensive Event Type Coverage (143 types) | LegendsViewer-Next |
| F-LV-04 | World Bookmark / Quick Access | LegendsViewer-Next |
| F-LV-06 | Full-Text Search | LegendsBrowser2 |
| F-LV-09 | 60+ Enum Types for DF Concepts | LegendsViewer-Next |
| F-LV-13 | CP437 to UTF-8 Encoding | All viewers, weblegends |
| F-WL-08 | Paginated List Views | weblegends |
| F-DH-01 | Complete Lua Memory Access Paths | df-structures |
| F-DH-02 | 141+ Event Type Definitions | df-structures |
| F-MS-04 | Comprehensive Statistics Feature Set | myDFHackScripts |
| F-DT-10 | Adaptive Color Scaling | Dwarf Therapist |
| F-DT-11 | Sort/Filter/Group Dwarves | Dwarf Therapist |

### AI Dwarf Fortress Storyteller
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-NR-01 | Entity Importance Scoring | df-narrator |
| F-NR-02 | Rivalry/Alliance Detection | df-narrator |
| F-NR-05 | RAG-Optimized Chunking | df-narrator |
| F-NR-06 | Figure Biography Generation | df-narrator |
| F-NR-07 | Combat Event Classification | df-narrator |
| F-WL-02 | 96 Event Type Renderers (natural language) | weblegends |
| F-DH-07 | Personality/Trait System (75KB) | df-structures |
| F-MS-03 | Death Cause Resolution Chain | myDFHackScripts |
| F-DT-03 | Personality Trait Viewer (50 facets) | Dwarf Therapist |
| F-DT-05 | Emotion/Thought Tracking | Dwarf Therapist |
| F-DT-13 | Need Satisfaction Tracking | Dwarf Therapist |

### AI Dwarf Fortress Player
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-AI-01 | Autonomous Decision Engine Architecture | df-ai |
| F-AI-02 | Population State Machine | df-ai |
| F-AI-03 | Military Squad Management | df-ai |
| F-AI-04 | Stocks Tracking (130+ Categories) | df-ai |
| F-AI-05 | Trade Automation | df-ai |
| F-AI-06 | Noble/Position Management | df-ai |
| F-AI-07 | Blueprint Room Planning | df-ai |
| F-AI-08 | Pet/Animal Management | df-ai |
| F-AI-09 | JSON Event Logging | df-ai |
| F-AI-11 | Announcement Monitoring | df-ai |
| F-AI-12 | Citizen/Enemy Classification | df-ai |

### Dwarf Fortress Mod Manager
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-MM-01 | Mod Metadata System | DF-Modloader |
| F-MM-02 | Dependency Resolution Engine | DF-Modloader, ModHearth |
| F-MM-03 | Modpack Profile System | ModHearth, Nexus-Mod-Manager |
| F-MM-04 | Raw File Object Type Taxonomy | DF-Modloader |
| F-MM-05 | Raw Syntax Version Translation | DF-Modloader |
| F-MM-06 | Transactional File Operations | Nexus-Mod-Manager |
| F-MM-07 | Steam Workshop Integration | ModHearth |
| F-MM-08 | Blueprint/Template Management | DFHack data/ |
| F-MM-09 | Mod Content Preview | DF-Modloader |
| F-MM-10 | Game Launch Integration | ModHearth, NMM |

### Dwarf Fortress Labor Manager
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-DT-01 | Labor Assignment Spreadsheet | Dwarf Therapist |
| F-DT-02 | Role-Based Labor Optimization | Dwarf Therapist |
| F-DT-06 | Skill Progression Display | Dwarf Therapist |
| F-DT-07 | Health/Injury Display | Dwarf Therapist |
| F-DT-08 | Equipment Status Overview | Dwarf Therapist |
| F-DT-09 | Custom Profession Templates | Dwarf Therapist |
| F-DT-12 | Activity Monitoring | Dwarf Therapist |
| F-DH-08 | Labor/Profession System | df-structures |

### Data ETL / CDM / Infrastructure
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-DH-03 | Unit Data Model (149KB structure) | df-structures |
| F-DH-04 | EventManager Tick Callback System | DFHack core |
| F-DH-05 | DFHack Script Ecosystem (170+ Scripts) | DFHack scripts |
| F-DH-06 | Python Async RPC Client | dfhack-client-python |
| F-DH-09 | exportlegends Script | DFHack scripts |
| F-DH-10 | Symbol/Address Mapping | df-structures |
| F-LV-05 | XML Structure Auto-Analysis | LegendsBrowser2 |
| F-MS-01 | Generic Watcher Pattern | myDFHackScripts |
| F-MS-02 | Multi-Domain Event Logging | myDFHackScripts |
| F-MS-05 | Enum Resolution Pattern | myDFHackScripts |
| F-MS-09 | Structured Log Format | myDFHackScripts |
| F-WL-01 | Live In-Memory Data Access Patterns | weblegends |
| F-WL-05 | Static Export System | weblegends |
| F-AI-10 | WebLegends Integration (Live Dashboard) | df-ai |

### Cross-Cutting Features
| Feature ID | Feature Name | Source Repo |
|-----------|-------------|-------------|
| F-WL-03 | Wikipedia-Style Navigation | weblegends |
| F-WL-04 | World Map from Live Memory | weblegends |
| F-WL-06 | Plugin Extension API | weblegends |
| F-MS-06 | In-Game Visualization (Charts) | myDFHackScripts |
| F-MS-07 | Book/Written Content Monitoring | myDFHackScripts |
| F-MS-08 | Petition Tracking | myDFHackScripts |
| F-DT-04 | Belief System Viewer (44 beliefs) | Dwarf Therapist |
| F-DT-14 | Memory Layout Configuration | Dwarf Therapist |
| F-WL-09 | CP437 Stream Buffer | weblegends |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Repos analyzed | 17 |
| Report files | 9 |
| Total features extracted | 94 (uniquely identified) |
| Features per component (avg) | 10-14 |
| Event types documented | 143 (LegendsViewer-Next) + 96 (weblegends) |
| DFHack plugins relevant | 20+ |
| DFHack scripts relevant | 30+ |
| Languages encountered | C++, Python, Java, Go, C#, Lua, TypeScript |

---

## Top Priority Features (Not Yet In Chronicler)

1. **F-LV-01 Interactive World Map** — Leaflet.js map is the most requested visualization feature
2. **F-LV-02 Family Tree Visualization** — Cytoscape.js relationship graphs
3. **F-DT-02 Role-Based Labor Optimization** — AI-assisted labor assignment
4. **F-AI-01 Autonomous Decision Engine** — Foundation for the AI Player
5. **F-NR-01 Entity Importance Scoring** — Narrative ranking for Storyteller
6. **F-MM-01 Mod Metadata System** — Unique Chronicler feature, no precedent
7. **F-MS-04 40+ Community-Validated Statistics** — Feature wishlist from players
8. **F-LV-03 143 Event Type Coverage** — Ensure complete event handling
9. **F-DT-01 Labor Assignment Spreadsheet** — Core Labor Manager feature
10. **F-WL-05 Static Export System** — Share world history offline
