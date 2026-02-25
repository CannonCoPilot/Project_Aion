# Repository Research Report: df-narrator

**Repository**: `GitRepos/df-narrator`
**Author**: Custom (chatbot integration tool)
**Language**: Python 3
**Purpose**: Generate structured Markdown lore documents from DF legends XML for chatbot ingestion
**Files**: 2 Python files (~32KB total)

---

## Repository Overview

df-narrator is a standalone Python script that parses a Dwarf Fortress legends.xml file in a single pass and produces a structured Markdown document covering the world's most notable figures, sites, conflicts, and artifacts. The output is designed for chatbot ingestion — chunked into ~1000-character retrieval segments suitable for semantic search RAG systems.

This is the closest existing tool to Chronicler's "AI Storyteller" concept, though it operates offline on static XML rather than against a live database.

---

## Architecture & Key Components

### Core Parser (`df_narrator.py`)
- Single-pass XML parsing using `df_legends_common.py` helper
- Scoring models for figures, sites, conflicts, and artifacts
- Rivalry detection via event co-appearance
- Markdown generation with section headers sized for RAG chunking

### Shared Library (`df_legends_common.py`)
- XML parsing utilities (clean_xml, parse_xml)
- Entity resolution functions (resolve_hf, resolve_site, resolve_entity)
- Historical figure field constants (HF_FIELDS)
- Event sorting and formatting

### Scoring Models

**Figure Scoring**:
```
score = min(events * 2, 500) + kills * 15
      + type bonuses (DEITY +120, NECROMANCER +100, FORCE +90, VAMPIRE +80, MEGABEAST +70)
      + relationship/position/artifact/sphere/skill/site/entity bonuses
```

**Site Scoring**:
```
score = events + (deaths * 2) + (collections * 5) + (structures * 3)
```

**Conflict Scoring**:
```
score = (deaths * 3) + (battles * 10) + (sites * 5) + duration_years
```

**Artifact Scoring**:
```
score = (events * 10) + (unique_holders * 20) + 30 if lost/stolen + 50 if named
```

### Output Structure
```
# The Legends of <World Name>
## World at a Glance
## Greatest Historical Figures (per-figure subsections)
## Most Storied Sites (per-site subsections)
## Wars and Great Conflicts (per-conflict subsections)
## Legendary Artifacts (per-artifact subsections)
## Notable Rivalries and Alliances
```

---

## Extractable Features for Chronicler

### F-NR-01: Entity Importance Scoring
- **User QoL**: Automatically rank historical figures, sites, conflicts, and artifacts by narrative importance — surface the most interesting content first
- **Implementation**: Multi-factor scoring with type bonuses, event counts, kill counts, relationship density, position holding, artifact association. Cap at 500 for event-based score to prevent pure volume from dominating.
- **Chronicler relevance**: Core ranking algorithm for Storyteller's "who/what to talk about first" decisions; NVS (Narrative Value Scoring) reference implementation

### F-NR-02: Rivalry/Alliance Detection
- **User QoL**: Discover figure pairs with the strongest connections (enemies, allies, co-participants) without manual exploration
- **Implementation**: `find_rivals_inline()` counts co-appearances across events for a given HF, overlays with recorded relationship types. Returns top-10 pairs by shared event count.
- **Chronicler relevance**: Relationship network visualization; "Tell me about X's enemies" query type for Storyteller

### F-NR-03: Conflict Aggregation
- **User QoL**: Automatically identify and rank wars by death toll, battle count, sites involved, and duration
- **Implementation**: Builds from XML collections with type filter for war/battle/siege/attack/raid/insurrection. Accumulates deaths, battle events, and involved sites per collection.
- **Chronicler relevance**: War timeline visualization; conflict narrative generation ("The War of Daggers lasted 47 years...")

### F-NR-04: Artifact Journey Tracking
- **User QoL**: Trace an artifact's complete history — creation, holders, thefts, storage, loss — in chronological order
- **Implementation**: Filters events by ARTIFACT_EVENT_TYPES set, tracks unique holders, detects lost/stolen status, sorts events chronologically.
- **Chronicler relevance**: Artifact detail page in Explorer; "Tell me the story of [artifact]" Storyteller capability

### F-NR-05: RAG-Optimized Chunking
- **User QoL**: Generated lore documents are pre-chunked for semantic retrieval, enabling natural-language queries about world history
- **Implementation**: Section headers and per-entity subsections sized to ~1000 characters for alignment with typical RAG chunk sizes. Each subsection is self-contained.
- **Chronicler relevance**: Even though Chronicler uses PostgreSQL rather than vector search for the Storyteller, the chunking strategy informs how to structure narrative context windows for LLM calls

### F-NR-06: Figure Biography Generation
- **User QoL**: Structured biographies including race, tags, birth/death, killer, event count, kills, spheres, artifacts, skills, and key event types
- **Implementation**: Per-figure data aggregation from XML elements, formatted as Markdown with categorized sections.
- **Chronicler relevance**: Template for the Storyteller's figure biography generation; People tab detail view content

### F-NR-07: Combat Event Classification
- **User QoL**: Automatic classification of events into combat categories (attacked site, field battle, siege, etc.)
- **Implementation**: COMBAT_EVENTS set with 12 event types. Used for site danger scoring and conflict building.
- **Chronicler relevance**: Event type taxonomy for the change detector and narrative routing

---

## Key Insights

1. **df-narrator is the only existing tool that generates narrative prose from DF data** — all other tools are viewers, not narrators
2. **The scoring models are battle-tested** and produce reasonable "importance" rankings — Chronicler should adopt similar (but SQL-based) scoring
3. **The tool is entirely offline** — it cannot access live game state, which is Chronicler's key differentiator
4. **RAM usage for large worlds (25MB+ XML) is hundreds of MB** — confirms the value of Chronicler's streaming iterparse approach
5. **The RAG chunking strategy** validates the approach of structuring output for LLM consumption
6. **Event co-appearance counting** for rivalry detection is simple but effective — could be enhanced with temporal weighting in Chronicler
