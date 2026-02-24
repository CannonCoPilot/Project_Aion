# Research Report: df-narrator + weblegends Deep Source Analysis

**Date**: 2026-02-23
**Scope**: Exhaustive source-level analysis of two DF legends tools — df-narrator (Python, XML-based narrative generation) and weblegends (C++ DFHack plugin, live in-game legends HTTP server) — for Chronicler product requirements.
**Repos Analyzed**:
- `/Users/nathanielcannon/Claude/GitRepos/df-narrator/` (2 Python files + README)
- `/Users/nathanielcannon/Claude/GitRepos/weblegends/` (94 event .cpp files + ~20 support files)

---

## Executive Summary

**df-narrator** is a single-pass Python script that parses a Dwarf Fortress `legends.xml` export and produces a structured Markdown document sized for LLM/chatbot ingestion. It implements four explicit scoring formulas (figures, sites, conflicts, artifacts) to rank entities by narrative importance, then generates templated natural-language descriptions per entity type. It does not use an LLM — all text is assembled from string templates and field values. The output is designed around 1000-character retrieval chunks.

**weblegends** is a C++ DFHack plugin that runs a multi-threaded HTTP server (ports 5080–5089) and renders live DF game data as a Wikipedia-style HTML site. It uses direct memory access through DFHack's `df::*` struct pointers — no XML parsing, no export files. It handles 94 distinct event types, each in its own `.cpp` file following a `do_event(ostream, context, event*)` dispatch pattern. The system is context-aware: when rendering a figure page, entity links within event text are suppressed (because you're already on that entity's page) but other entities are linked. Every entity type (figure, site, entity, structure, artifact, region, layer, era, event collection) gets its own routable page.

For Chronicler, df-narrator provides excellent scoring formulas and a battle-tested approach to entity ranking. weblegends provides a near-complete reference for every event type DF can produce and exactly what fields/text each renders.

---

## Part I: df-narrator

### 1. Scoring System — Complete Formulas

All scoring functions are inlined in `df_narrator.py` lines 51–111. The README also documents them.

#### score_figure (lines 51–70)

```python
def score_figure(hfid, hf, event_counts, kill_counts, artifact_by_holder):
    s = min(event_counts.get(hfid, 0) * 2, 500)   # events × 2, capped at 500
    s += kill_counts.get(hfid, 0) * 15              # kills × 15
    if hf.get("vamp"):  s += 80                     # VAMPIRE bonus
    if hf.get("necro"): s += 100                    # NECROMANCER bonus
    if hf.get("deity"): s += 120                    # DEITY bonus
    if hf.get("force"): s += 90                     # FORCE bonus
    if hf.get("mega"):  s += 70                     # MEGABEAST bonus
    s += min(len(hf.get("hf_links", [])) * 3, 100)  # HF relationships, capped at 100
    s += sum(20 for el in hf.get("entity_links", [])
             if el["type"] in ("position", "former_position", "position_claim"))  # leadership roles × 20
    s += len(artifact_by_holder.get(hfid, [])) * 30  # artifacts held × 30
    s += len(hf.get("spheres", [])) * 10             # deity spheres × 10
    skills = hf.get("skills", [])
    if skills:
        s += min(len(skills) * 2 + max(x["ip"] for x in skills) // 5000, 80)  # skill bonus, capped at 80
    s += min(len(hf.get("site_links", [])) * 5, 50)    # site associations, capped at 50
    s += min(len(hf.get("entity_links", [])) * 3, 60)  # entity links, capped at 60
    if hf.get("death_year", "-1") != "-1": s += 5      # death recorded: +5
    return s
```

**Key weights summary**: Events dominate (up to 500 pts). Deity type is next (120). Kills matter significantly (×15 each). Artifacts in possession are highly valued (×30 each).

**Megabeast detection** (line 548–550): Race must be in the hardcoded set `{DRAGON, HYDRA, COLOSSUS_BRONZE, CYCLOPS, ETTIN, GIANT, ROC, TITAN}`.

**Vampire detection** (line 545): any `active_interaction` containing "VAMPIRE" (case-insensitive).

**Necromancer detection** (line 546): any `active_interaction` containing "NECROMANCER" or "RAISE".

#### score_site (lines 73–78)

```python
def score_site(sid, site_events, site_event_types, site_collections, site_structures):
    evt_count = len(site_events.get(sid, []))
    deaths = site_event_types[sid]["hf died"]
    n_colls = len(site_collections.get(sid, []))
    n_structs = site_structures.get(sid, 0)
    return evt_count + deaths * 2 + n_colls * 5 + n_structs * 3
```

**Formula**: `events + (deaths × 2) + (event_collections × 5) + (structures × 3)`

Deaths are double-weighted. Collections (wars, battles, etc. that touch the site) are heavily weighted at 5x, reflecting that active combat involvement signals importance.

#### score_conflict_inline (lines 81–87)

```python
def score_conflict_inline(deaths, battle_count, sites_count, start_year, end_year):
    duration = max(0, int(end_year) - int(start_year))
    return deaths * 3 + battle_count * 10 + sites_count * 5 + duration
```

**Formula**: `(deaths × 3) + (battles × 10) + (sites_involved × 5) + duration_years`

Battle count is the dominant factor — a single multi-battle war outscores a massacre with no organized battles.

#### score_artifact_inline (lines 90–111)

```python
def score_artifact_inline(aid, artifact_events, artifacts_full):
    # ... counts unique holders from events and static fields
    s = len(events) * 10           # events × 10
    s += len(holders) * 20         # unique holders × 20
    s += 30 if has_lost_or_stolen  # lost/stolen bonus
    s += 50 if info.get("name", "").strip()  # named artifact bonus
    return s, len(holders), has_lost_or_stolen
```

**Formula**: `(events × 10) + (unique_holders × 20) + 30 if lost/stolen + 50 if named`

Named artifacts are heavily prioritized. An unnamed artifact with no events scores 0 and is filtered out (line 368: `if sc > 0`).

### 2. Narrative Generation

**Approach**: Pure template-based string assembly. No LLM involved. Every output sentence follows a deterministic template filled with entity field values. Example output pattern:

```
### Arîs Swordarm (DWARF, ID: 47) — Score: 284 — VAMPIRE
Born year 142, died year 398, killed by Meng Rofugrashed (DWARF).
Events: 89. Kills: 12. Relations: 7. Positions held: 2.
Spheres: darkness, deception.
Artifacts held: Evilcruelty the Spine of Misery.
Top skills: FIGHTER(45000), SWORDSMAN(39000), DODGER(12000).
Key events: hf died(3), attacked site(2), artifact given(1), ...
```

Time formatting uses a Dwarf Fortress calendar: year + seconds72 → day + month (Granite through Obsidian) using integer arithmetic. The `format_time()` function in `df_legends_common.py` implements this: `doy = sec // 1200 + 1`, month = `min((doy-1)//28 + 1, 12)`, day = `(doy-1) % 28 + 1`.

### 3. Entity Selection and Filtering

Selection is purely by score ranking with configurable N cutoffs:

- `--top-figures N` (default 10): Top N figures by `score_figure`
- `--top-sites N` (default 10): Top N sites by `score_site`
- `--top-wars N` (default 5): Top N event collections by `score_conflict_inline`
- `--top-artifacts N` (default 10): Top N artifacts with score > 0 by `score_artifact_inline`

**Conflict filtering** (lines 128–131): Only event collections with `type` in `{"war", "battle", "siege", "attack", "raid", "insurrection"}` are scored as conflicts. Other collection types (ceremonies, performances, etc.) are ignored.

**Artifact filtering**: Only artifacts with score > 0 are ranked (i.e., unnamed artifacts with no event history are excluded entirely).

**Rivalry detection**: Only computed among the top-figures set, not globally. Co-appearance = shared event count. Top 10 rivals per figure, top 5 rivals used for pair ranking, top 10 pairs output.

### 4. XML Parsing — Fields Extracted

**Parser**: Python's `xml.etree.ElementTree` (or `defusedxml` if available). Single full-tree parse, then `root.clear()` after extraction to free memory.

**Sites** (`.//sites/site`): `id`, `name`, `type`, `coords`, count of `structures/structure` children.

**Entities** (`.//entities/entity`): `id`, `name` only.

**Artifacts** (`.//artifacts/artifact`): `id`, `name`, `holder_hfid`, `creator_hfid`, and from child `item` element: `name_string` (item_name), `mat`.

**Historical Figures** (`.//historical_figures/historical_figure`):
- Identity: `id`, `name`, `race`, `caste`, `birth_year`, `death_year`, `associated_type`
- Active interactions: `<active_interaction>` text list (used to detect vampire/necromancer)
- Entity links: `<entity_link>` → `{link_type, entity_id}`
- HF links: `<hf_link>` → `{link_type, hfid}`
- Skills: `<hf_skill>` → `{skill, total_ip}`
- Spheres: `<sphere>` text list
- Site links: `<site_link>` → `{link_type, site_id}`
- Computed boolean flags: `vamp`, `necro`, `deity` (associated_type == "DEITY"), `force` (associated_type == "FORCE"), `mega` (race in hardcoded set)

**Events** (`.//historical_events/historical_event`): `id`, `type`, `year`, `seconds72` (stored as `sec`), then ALL other child elements as flat key→text dict. The HF_FIELDS set is used to identify which fields are historical figure IDs:

```python
HF_FIELDS = {
    'hfid', 'slayer_hfid', 'hfid1', 'hfid2', 'group_hfid', 'snatcher_hfid',
    'changee_hfid', 'changer_hfid', 'woundee_hfid', 'wounder_hfid',
    'doer_hfid', 'target_hfid', 'attacker_hfid', 'defender_hfid',
    'hist_fig_id', 'body_hfid', 'hfid_target', 'hfid_attacker',
    'hfid_defender', 'trickster_hfid', 'cover_hfid', 'student_hfid',
    'teacher_hfid', 'trainer_hfid', 'seeker_hfid',
}
```

**Kill detection**: Within `hf died` events, `slayer_hfid` → `kill_counts[slayer] += 1`. Victim→slayer mapping stored in `killed_by`.

**Event Collections** (`.//historical_event_collections/historical_event_collection`): `type`, `name`, `start_year`, `end_year`, `aggressor_ent_id` (or `attacking_enid`), `defender_ent_id` (or `defending_enid`), `site_id`, event ID list from `<event>` children.

### 5. Output Format

Markdown with H1 (world title), H2 sections, H3 per entity. Structure:

```markdown
# The Legends of [World Name] ([Altname])

## World at a Glance
- N years of recorded history
- N sites across N types, N civilizations/entities
- N historical figures, N recorded events, N artifacts

## Greatest Historical Figures
### [Name] ([Race], ID: N) — Score: N [— TAG/TAG]
Born year N, died year N, killed by [Name].
Events: N. Kills: N. Relations: N. Positions held: N.
Spheres: X, Y.
Artifacts held: [name1], [name2].
Top skills: SKILL(ip), SKILL(ip).
Key events: type(count), type(count).

## Most Storied Sites
### [Name] ([type], ID: N)
Coords: X,Y. Events: N. Deaths: N. Collections: N.
Top event types: type(count), ...
Notable figures: [Name1], [Name2].

## Wars and Great Conflicts
### [Name] (Years N–N)
Aggressor: [Entity]. Defender: [Entity].
Deaths: N. Battles: N. Sites involved: N. Score: N.
Sites: [Name1], [Name2].

## Legendary Artifacts
### [Name] ([mat] [item_type])
Created by [Name], year N.
Held by N figures. Events: N. Lost/stolen: Yes/No.
Current status: held by [Name] / whereabouts unknown.
Journey: Year N: type — [Name]; ...

## Notable Rivalries and Alliances
- **[Name A]** and **[Name B]** ([relationship]) — N shared events
```

Output is written to stdout; progress to stderr. Designed for ~1000-character chunk ingestion.

### 6. Event Processing and Classification

Events are classified into action sets used for filtering/scoring:

```python
COMBAT_EVENTS = {
    "attacked site", "hf attacked site", "field battle", "squad vs squad",
    "hf destroyed site", "plundered site", "site taken over", "razed structure",
    "hf simple battle event", "tactical situation", "site dispute", "reclaim site",
}

COLLECTION_WAR_TYPES = {"war", "battle", "siege", "attack", "raid", "insurrection"}

ARTIFACT_EVENT_TYPES = {
    "artifact created", "artifact given", "artifact lost", "artifact possessed",
    "artifact stored", "item stolen", "artifact claim formed", "masterpiece item",
}
```

The "artifact journey" section uses the subset: `{artifact created, artifact given, artifact lost, item stolen, artifact possessed, artifact stored}` with chronological sort by (year, sec).

### 7. Relationship Handling

**HF-to-HF**: Stored as `hf_links: [{type, hfid}]` per figure. Relationship type comes from the XML `<link_type>` element. Used for display count and rivalry detection (the `rel_map` in `find_rivals_inline`).

**HF-to-Entity**: `entity_links: [{type, eid}]`. Position/former_position/position_claim types contribute to the score (×20 each, uncapped). All entity links contribute to a secondary capped bonus (×3, cap 60).

**HF-to-Site**: `site_links: [{type, sid}]`. Up to 10 site links (×5 each, capped at 50 total).

**Rivalry as co-appearance**: Rivals are detected by scanning all events that mention a given figure's `hfid` and counting co-appearances of other figure IDs in the same event (using `HF_FIELDS`). The `rel_map` overlays formal relationship type if it exists.

**Relationships displayed**: Rival list shows other figure name, co-appearance count, and relationship label if available.

---

## Part II: weblegends

### 1. Architecture Overview

weblegends is a DFHack plugin (`DFHACK_PLUGIN("weblegends")`). On init it:
1. Registers two data export hooks (`WEBLEGENDS_DESCRIBE_EVENT_V0`, `WEBLEGENDS_ALLOCATE_LAYOUT_V1`) allowing other plugins to integrate.
2. Starts a TCP socket listener on ports 5080–5089 (first available).
3. Spawns a server thread that accepts connections, each handled by its own `Client` thread.

**DFHack Integration**: Direct C++ memory access via `df::historical_figure::find(id)`, `df::world_site::find(id)`, etc. These use DFHack's binary-search lookup tables into DF's live memory. A `CoreSuspender` is acquired at the start of each render call to pause DF's simulation thread while HTML is generated — ensuring data consistency.

**No caching**: Every HTTP request generates fresh HTML from live game data. No result caching exists. The `CoreSuspender` ensures data consistency but means DF is briefly paused per request.

**Export mode**: `weblegends-export <folder>` crawls all pages via a BFS queue, starting from `/`, following all `href` and `src` attributes, and writes static HTML files.

### 2. URL Routing

Defined in `http.cpp` lines 241–258:

| URL Pattern | Renders |
|-------------|---------|
| `/` | Home page (world summary) |
| `/ent-N` | Entity page (civ, religion, guild, etc.) |
| `/ents-N` | Entity list page N |
| `/fig-N` | Historical figure page |
| `/figs-N` | Figure list page N |
| `/item-N` | Artifact page |
| `/items-N` | Artifact list page N |
| `/site-N` | Site page |
| `/site-N/bld-M` | Structure (building) sub-page within site N |
| `/sites-N` | Site list page N |
| `/region-N` | World region page |
| `/regions-N` | Region list page N |
| `/layer-N` | Underground region (cavern/magma/underworld) page |
| `/layers-N` | Layer list page N |
| `/era-N` | History era page |
| `/eventcol-N` | Event collection page |
| `/eventcols-N` | Event collection list page N |
| `/faux-wikipedia.css` | Bundled CSS |
| `/region.png` | World map PNG |

Pagination uses `?page=N` query parameter. Pages contain up to 1000 events each.

### 3. Event Rendering — Complete List of 94 Event Types

Each event type has its own `.cpp` file in `events/`. All follow the same dispatch pattern through `event_dispatch()` in `helpers/event.cpp`. The `event()` wrapper function prepends temporal context: "In YEAR on the Nth of MONTH, " or "On the Nth of MONTH, " for same-year continuation.

**Complete event type list** (94 files):

| Event File | What It Renders |
|------------|-----------------|
| `add_entity_site_profile_flag.cpp` | Entity gains site profile flag |
| `add_hf_entity_honor.cpp` | HF receives honor from entity |
| `add_hf_entity_link.cpp` | HF gains connection to entity (position, membership) |
| `add_hf_hf_link.cpp` | HF forms link with another HF (marriage, master/apprentice) |
| `add_hf_site_link.cpp` | HF gains connection to site (lair, home, seat of power) |
| `agreement_concluded.cpp` | Agreement finalized between parties |
| `agreement_formed.cpp` | Agreement terms proposed |
| `artifact_claim_formed.cpp` | HF claims ownership of artifact |
| `artifact_copied.cpp` | Artifact duplicated (slabs/scrolls) |
| `artifact_created.cpp` | HF creates artifact; renders: "[HF] created [artifact] in [site]" or named: "[HF] bestowed a name upon [artifact]" |
| `artifact_destroyed.cpp` | Artifact destroyed |
| `artifact_found.cpp` | Artifact discovered |
| `artifact_given.cpp` | Artifact transferred HF→HF |
| `artifact_lost.cpp` | Artifact lost |
| `artifact_possessed.cpp` | HF becomes possessed, creates artifact |
| `artifact_recovered.cpp` | Artifact recovered after being lost |
| `artifact_stored.cpp` | Artifact stored at location |
| `artifact_transformed.cpp` | Artifact changes form |
| `assume_identity.cpp` | HF takes on false identity |
| `body_abused.cpp` | Corpse desecrated |
| `ceremony.cpp` | Ceremony performed at site |
| `change_creature_type.cpp` | HF transforms (werewolf, etc.) |
| `change_hf_body_state.cpp` | HF body state changes (entombed, resurrected, etc.) |
| `change_hf_job.cpp` | HF occupation changes |
| `change_hf_mood.cpp` | HF enters artifact-creation mood |
| `change_hf_state.cpp` | HF whereabouts change (born, settled, wandered, fled, refugee, visited) |
| `competition.cpp` | Competition event (wrestling, poetry, etc.) |
| `create_entity_position.cpp` | New administrative position created in entity |
| `created_building.cpp` | Structure built at site |
| `created_site.cpp` | New site founded |
| `created_world_construction.cpp` | Road/bridge/tunnel built |
| `creature_devoured.cpp` | Creature eaten |
| `dance_form_created.cpp` | New dance style created |
| `entity_action.cpp` | Entity takes bulk action |
| `entity_created.cpp` | New entity (civ, group) formed |
| `entity_law.cpp` | Entity passes law |
| `entity_persecuted.cpp` | Entity persecuted by another |
| `entity_razed_building.cpp` | Entity destroys structure at site |
| `gamble.cpp` | Gambling event |
| `hf_act_on_artifact.cpp` | HF interacts with artifact (study, hide, display) |
| `hf_act_on_building.cpp` | HF interacts with structure |
| `hf_attacked_site.cpp` | Individual HF attacks site |
| `hf_confronted.cpp` | HF confronted due to suspicion; renders "aroused general suspicion after appearing not to age / a murder" |
| `hf_destroyed_site.cpp` | HF destroys a site |
| `hf_does_interaction.cpp` | HF performs magical interaction on target; renders using interaction's `hist_string_1` and `hist_string_2` from game data |
| `hf_gains_secret_goal.cpp` | HF learns secret objective (immortality, etc.) |
| `hf_learns_secret.cpp` | HF learns necromantic/magical secret |
| `hf_preach.cpp` | HF preaches religion |
| `hf_recruited_unit_type_for_entity.cpp` | HF recruits creature type for entity |
| `hf_relationship_denied.cpp` | HF's relationship request denied |
| `hfs_formed_reputation_relationship.cpp` | Two HFs form reputation-based relationship |
| `hist_figure_abducted.cpp` | HF abducted |
| `hist_figure_died.cpp` | HF death with full death-cause rendering (see below) |
| `hist_figure_new_pet.cpp` | HF acquires pet |
| `hist_figure_reunion.cpp` | HFs reunite |
| `hist_figure_revived.cpp` | HF raised from death |
| `hist_figure_simple_action.cpp` | Simple solo HF action |
| `hist_figure_simple_battle_event.cpp` | Simple combat event (wrestling, etc.) |
| `hist_figure_travel.cpp` | HF travels between sites |
| `hist_figure_wounded.cpp` | HF wounded in combat |
| `item_stolen.cpp` | Item/artifact stolen |
| `knowledge_discovered.cpp` | HF discovers knowledge/scholarship |
| `masterpiece_created_arch_construct.cpp` | Masterwork architectural construction |
| `masterpiece_created_engraving.cpp` | Masterwork engraving |
| `masterpiece_created_food.cpp` | Masterwork food item |
| `masterpiece_created_item.cpp` | Masterwork item; renders "[HF] of [entity] created [artifact/masterwork material item] at [site]" |
| `merchant.cpp` | Merchant caravan event |
| `musical_form_created.cpp` | New musical style created |
| `performance.cpp` | Performance given |
| `poetic_form_created.cpp` | New poetic form created |
| `procession.cpp` | Procession/parade event |
| `reclaim_site.cpp` | Entity reclaims lost site |
| `regionpop_incorporated_into_entity.cpp` | Regional population absorbed into entity |
| `remove_hf_entity_link.cpp` | HF loses entity connection |
| `remove_hf_hf_link.cpp` | HF relationship ends (divorce, death of relation) |
| `remove_hf_site_link.cpp` | HF loses site connection |
| `site_died.cpp` | Site becomes abandoned/dead |
| `site_dispute.cpp` | Dispute over site ownership |
| `sneak_into_site.cpp` | HF infiltrates site |
| `spotted_leaving_site.cpp` | HF spotted leaving site |
| `squad_vs_squad.cpp` | Military squad combat |
| `tactical_situation.cpp` | Tactical battlefield event |
| `topicagreement_rejected.cpp` | Agreement offer rejected |
| `trade.cpp` | Trade conducted |
| `war_attacked_site.cpp` | War-context site attack |
| `war_destroyed_site.cpp` | War-context site destruction |
| `war_field_battle.cpp` | Field battle; renders "[attacker_civ] attacked [defender_civ] in [region]. [general_a] led the attack, and the defenders were led by [general_b]" |
| `war_peace_accepted.cpp` | Peace agreement accepted |
| `war_peace_rejected.cpp` | Peace agreement rejected |
| `war_plundered_site.cpp` | War-context site plundering |
| `war_site_new_leader.cpp` | War-context change of site leadership |
| `war_site_taken_over.cpp` | War-context site capture |
| `war_site_tribute_forced.cpp` | War-context tribute extraction |
| `written_content_composed.cpp` | Written work (book/scroll) composed |

### 4. Event Rendering Patterns — Detail

**Common pattern**: All event renderers write into a `std::ostream &` using `<<` operators. Entity references use either `link(s, entity)` (always generates `<a href=...>`) or `event_link(s, context, entity)` (suppresses link if entity matches the current page's context). This is the core cross-linking mechanism.

**Death event** (`hist_figure_died.cpp`) is the most detailed, handling 40+ death cause variants:
- NONE, OLD_AGE, HUNGER, THIRST, SHOT, BLEED, DROWN, SUFFOCATE, STRUCK_DOWN, SCUTTLE, COLLISION, MAGMA, MAGMA_MIST, DRAGONFIRE, FIRE, SCALD, CAVEIN, DRAWBRIDGE, FALLING_ROCKS, CHASM, CAGE, MURDER, TRAP, VANISH, QUIT, ABANDON, HEAT, COLD, SPIKE, ENCASE_LAVA, ENCASE_MAGMA, ENCASE_ICE, BEHEAD, CRUCIFY, BURY_ALIVE, DROWN_ALT, BURN_ALIVE, FEED_TO_BEASTS, HACK_TO_PIECES, LEAVE_OUT_IN_AIR, BOIL, MELT, CONDENSE, SOLIDIFY, INFECTION, MEMORIALIZE, SCARE, DARKNESS, COLLAPSE, DRAIN_BLOOD, SLAUGHTER, VEHICLE, FALLING_OBJECT, LEAPT_FROM_HEIGHT, DROWN_ALT2, EXECUTION_GENERIC

Each death cause produces a specific verb phrase (e.g. "was beheaded", "was burned to a crisp", "drowned"), then optionally appends weapon info via `do_weapon()`, then the slayer (HF or creature race), then age at death.

**Age calculation** at death: `age_years_days(born_year, born_seconds, died_year, died_seconds, years, days)`. Fractional ages displayed as HTML fractions: `&frac14;`, `&frac12;`, `&frac34;` if days >= 28*3, 28*6, 28*9 respectively.

**Interaction events** (`hf_does_interaction.cpp`): Text comes from the interaction definition's `hist_string_1` and `hist_string_2` fields (game raw data). This means biting text for vampires ("bit"), reanimation text for necromancers, etc. are pulled from game raws, not hardcoded.

**Circumstance/Reason** (`helpers/circumstance.cpp`): Events that have `circumstance` and `reason` fields (mainly artifact and HF actions) render additional context:

*Reasons*:
- `glorify_hf` → "in order to glorify [HF]"
- `artifact_is_heirloom_of_family_hfid` → "of the [HF] family"
- `as_a_symbol_of_everlasting_peace` → "as a symbol of everlasting peace"
- `artifact_is_symbol_of_entity_position` → "as a symbol of authority within [entity]"

*Circumstances*:
- `Death` → "after the death of [HF]"
- `Prayer` → "after praying to [HF]"
- `DreamAbout` → "after dreaming about [HF]"
- `Dream` → "after a dream"
- `Nightmare` → "after a nightmare"
- `FromAfar` → "from afar"

**Location rendering** (`helpers/location.cpp`): Every event that has `site`, `subregion`/`region`, `feature_layer`/`layer` fields (via SFINAE templates) calls `do_location()` which appends " in [structure] in [site] in [region] in [layer]", suppressing any element that matches the current page context.

**Missing event handler**: If no `.cpp` handler exists for a given event type, `do_event_missing()` falls back to calling DF's own `getSentence()` method on the event object and wraps it in an `<abbr>` tag with the event type/ID.

### 5. Figure Page Structure

From `render_figure.cpp`:

1. **Header**: Native + English name (e.g. "Kogan Uzolam, 'Blademaster'")
2. **Summary paragraph**: Race/caste description + categorize (species, sex symbol, deity/goddess status, curse name, body transformation) + spheres list + born/died years
3. **Curse/transformation**: If figure has an active curse with body transformation effects, the target caste's description is also rendered
4. **Related Figures** (`<h2>`): `<ul class="multicol">` of HF links with relationship type: mother, father, spouse/wife/husband, child/son/daughter, lover, deity worship (with strength levels: dubious/casual/[average]/faithful/ardent), companion, prisoner/imprisoner, master/apprentice/former_master/former_apprentice, pet_owner (shows "pet" if creature adopts owner, else "owner"), former_spouse, deceased_spouse
5. **Related Entities** (`<h2>`): Entity links with role: member, former_member, mercenary, former_mercenary, slave, former_slave, prisoner, former_prisoner, enemy, criminal, position (with sex-specific title and start year), former_position (with year range), position_claim, squad/former_squad (with squad name and years), occupation/former_occupation (with location and role: tavern_keeper, performer, scholar, mercenary, monster_slayer, scribe, messenger)
6. **Related Sites** (`<h2>`): Site links by type: occupation, seat_of_power, hangout, home (linking to specific structure if HOME_SITE_ABSTRACT_BUILDING), lair, prison
7. **History** (paginated, 1000 events/page): Chronological event list

### 6. Site Page Structure

From `render_site.cpp`:

1. **Header**: Site name
2. **Map**: Rendered via `render_map_coords()` — iterates the site's global bounding box coordinates, renders a minimap
3. **Summary paragraph**: Site type (fortress, dark fortress, cave, mountain hall, forest retreat, town/hamlet, important location, lair/simple_mound/simple_burrow/labyrinth/shrine/nest, castle/tower/monastery/fort, camp, tomb/vault monument)
4. **World Populations**: Animal populations via `render_world_populations()`
5. **Inhabitants**: Named historical figures (via nemesis records) + anonymous populations with counts and entity/civ affiliations
6. **Artifacts**: Currently at site
7. **Related Entities**: Entities with site links, with relationship types (capital, holy_city, monument, base_of_operation, residence, criminal_gang, primary_criminal_gang)
8. **Structures**: All buildings in the site (each is a sub-page link: `site-N/bld-M`)
9. **History** (paginated)

### 7. Entity Page Structure

From `render_entity.cpp`:

1. **Header**: Entity name
2. **Summary**: categorize (type: civilization, site government/population, vessel crew, migrating group, bandit gang, religion [with worshipped deities], military unit [mercenary/shadowy/versatile], outcasts, performance troupe, merchant company, guild)
3. **Administrative Positions**: Assigned positions with holder (or "vacant"), sex-specific title, squad if applicable, linked site if land-holder
4. **Related Entities**: Cross-linked entities
5. **Related Sites**: Site links with relationship type (capital, holy city, monument, base of operation, residence, criminal_gang/primary_criminal_gang)
6. **Members**: Named HF members + anonymous population counts by race + site residents by entity
7. **History** (paginated)

### 8. Cross-Linking Mechanism

The `link()` and `event_link()` functions are central to all cross-linking:

**`link(s, entity)`**: Always generates `<a href="TYPE-ID">NAME, DESCRIPTION</a>` with hover `title` attribute containing category info. Supports all 8 entity types. URL prefixes: `fig-`, `ent-`, `site-`, `item-`, `region-`, `layer-`, `era-`, `eventcol-`. Structure URLs: `site-N/bld-M`.

**`event_link(s, context, entity)`**: Context-aware linking. If `entity == context.entity` (e.g. rendering figure page and this event references that same figure), renders plain text (first name if available, translated last name otherwise). Otherwise delegates to `link()`. This prevents circular "you are here" links within a page's own event history.

**Zombie handling**: In `link(s, hf)`, if a figure has a `curse.original_histfig_id != -1`, renders as `<a href="fig-N">zombie</a>` with hover showing the original figure's categorization.

**Written content italicization**: In `event_link(s, context, item)`, if the artifact item has `itemimprovement_writingst` or `itemimprovement_pagesst` improvements (books/scrolls), the name is wrapped in `<em>` tags.

**Name translation**: Uses DFHack's `Translation::TranslateName()` to render both native Dwarvish and English names. The `name_translated()` helper wraps the native name in `<abbr title="ENGLISH">NATIVE</abbr>` if they differ.

### 9. DFHack Data Access Patterns

weblegends uses **direct memory access** exclusively through DFHack's generated struct bindings:

- `df::historical_figure::find(id)` — O(log n) binary search in `world->history.figures`
- `df::historical_entity::find(id)` — similarly in `world->entities.all`
- `df::world_site::find(id)` — in `world->world_data->sites`
- `df::artifact_record::find(id)` — in `world->artifacts.all`
- `df::creature_raw::find(race_id)` — in `world->raws.creatures.all`
- `binsearch_in_vector(vec, id)` — DFHack utility for sorted vector lookups

All rendering acquires `CoreSuspender suspend` to pause DF's game thread during data access. No file I/O during rendering — everything comes from DF's live memory.

### 10. Live Data vs. Legends Data

weblegends shows **both** live game state and legends data:

- **Legends data** (also in XML): Historical events, HF biographies, war histories — all from `world->history.events`, `world->history.figures`, etc.
- **Live game state** (not in XML): Current inhabitants at sites (`site->unk_1.nemesis`), current site ownership (`site->cur_owner_id`), current entity member counts, current artifact locations, `cur_year` / `cur_year_tick` for age calculations
- **World generation data** (accessible via DFHack only): Creature raws (for caste descriptions, gender symbols), interaction definitions (for `hist_string_1/2`), squad names, occupation records, entity position names

This gives weblegends significantly more richness than XML-based tools: it can say "dwarf tavern keeper at [Tavern Name]" with a link to the specific building, rather than just a position type string.

### 11. Performance and Caching

**No caching**: Each request re-renders from live data. This is intentional — game state changes continuously.

**Pagination**: Prevents catastrophic performance on figures/sites with thousands of events. History is grouped by year, then chunked at 1000 events per page. Within a year with many events, paragraphs are split by weeks (every 7-day DF period).

**Thread model**: One accept thread, one thread per connected client. Concurrent requests are possible. Each render takes a `CoreSuspender` which blocks — effectively serializing rendering with the DF game thread. Multiple concurrent requests could queue behind the CoreSuspender.

**Region map**: World map PNG is generated fresh on each `/region.png` request via `render_region_map()`.

**Export optimization**: `weblegends-export` uses a BFS queue with a `set<string>` deduplication to avoid re-exporting the same URL. This allows full static site generation.

---

## Comparison Table

| Aspect | df-narrator | weblegends |
|--------|-------------|------------|
| Data source | XML export file | Live DFHack memory |
| Language | Python 3 | C++ |
| Output | Markdown (chatbot ingestion) | HTML (browser/Wikipedia-style) |
| Narrative | Templated strings | Templated strings + game raws |
| Scoring | 4 explicit formulas | No scoring (shows everything) |
| Event types handled | Generic (type string + fields) | 94 typed handlers |
| Death causes | Not differentiated | 40+ specific causes |
| Cross-linking | Name strings only | `<a>` hyperlinks between pages |
| Live game state | No | Yes (inhabitants, current ownership, ages) |
| Caching | No (single pass) | No (per-request) |
| Pagination | No | Yes (1000 events/page) |
| Context-aware links | No | Yes (suppresses self-links) |
| Material rendering | String field only | Full material system (creature-unique names, state) |
| Interaction text | Not handled | From game raws (hist_string_1/2) |
| Circumstance/reason | Not rendered | Fully rendered |
| HF relationship types | Count only | 15+ named types with sex-specific labels |
| Site structure types | Not rendered | 12+ types (temple/tomb of X, guildhall, etc.) |

---

## Recommendations for Chronicler

### From df-narrator

1. **Adopt the scoring formulas verbatim** — they are well-calibrated and simple. The figure scoring formula in particular handles the most important edge cases (deity/vampire/necromancer type bonuses, skill IP normalization). These should become Chronicler's "importance" ranking for entity selection.

2. **Use the HF_FIELDS set** as the canonical list of XML fields that reference historical figure IDs. This set is not obvious from the XML structure alone. It represents accumulated knowledge about the schema.

3. **The co-appearance rivalry detection** is a lightweight but effective way to surface meaningful figure pairs. Worth implementing in Chronicler's narrative enrichment.

4. **COMBAT_EVENTS / COLLECTION_WAR_TYPES / ARTIFACT_EVENT_TYPES** classification sets should be imported into Chronicler's event taxonomy — these are correct and complete for pre-v53 DF.

5. **The seconds72 → calendar date formula** (`doy = sec // 1200 + 1`, month = `(doy-1)//28+1`, day = `(doy-1)%28+1`) should be used consistently in Chronicler's display layer.

### From weblegends

1. **The 94-event-type list is the canonical DF event type reference**. Every event type that DF can generate has a handler. This should inform Chronicler's event type taxonomy and which fields to extract for each type.

2. **Death cause rendering** (40+ variants in `hist_figure_died.cpp`) is the gold standard for death event display. Chronicler should render these as prose rather than raw type codes.

3. **The `hf_does_interaction` pattern** (pulling text from `hist_string_1` / `hist_string_2` in interaction definitions) is how vampire biting and necromantic raising get natural language. For Chronicler accessing data via DFHack, this same pattern should be used.

4. **Circumstance/reason text** (`helpers/circumstance.cpp`) adds crucial narrative context to why events happened. The 6 circumstance types and 4 reason types are fully enumerated and should be included in Chronicler's event narrative.

5. **Context-aware rendering** (the `event_context` struct and `event_link()` pattern) is the right model for Chronicler's narrative generation — when telling the story "from the perspective" of a given entity, suppress redundant self-references.

6. **Site structure type categorization** (12+ types: mead hall, keep, temple of X, dark tower, market, tomb of X, dungeon/sewers/catacombs, underworld spire, tavern, library, counting house, guildhall, tower) is comprehensive and should be included in Chronicler's structure taxonomy.

7. **Entity type categorization** (civilization, site government, vessel crew, migrating group, bandit gang, religion, military unit, outcast, performance troupe, merchant company, guild) maps directly to what Chronicler should store in its CDM `entity.type` field.

8. **The worship strength rendering** (dubious <10, casual <25, average <75, faithful <90, ardent ≥90) is a useful UX pattern for quantitative relationship strengths in narrative output.

---

## Action Items

- [ ] Integrate df-narrator's 4 scoring formulas into Chronicler's entity importance ranking (CDM `figure.importance_score`, `site.importance_score`, etc.)
- [ ] Add the 94 weblegends event types to Chronicler's event type taxonomy and ensure each has a narrative template
- [ ] Implement death cause rendering (40+ causes → prose) in Chronicler's narrative layer
- [ ] Add circumstance/reason rendering to artifact and HF action events
- [ ] Import `HF_FIELDS` set into Chronicler's XML parser as the canonical HF reference field list
- [ ] Implement the seconds72 calendar conversion consistently (same formula as df-narrator / weblegends)
- [ ] Add co-appearance rivalry detection to Chronicler's narrative enrichment pipeline
- [ ] Update Chronicler's entity type taxonomy to match weblegends' `categorize()` enumerations
- [ ] Ensure Chronicler's CDM captures `hf_does_interaction` hist_string text (from DFHack RPC, not XML)

---

## Sources

All findings are from direct source code analysis of local repositories:

1. `/Users/nathanielcannon/Claude/GitRepos/df-narrator/df_narrator.py` — main scorer and Markdown generator
2. `/Users/nathanielcannon/Claude/GitRepos/df-narrator/df_legends_common.py` — shared utilities, HF_FIELDS, XML parser
3. `/Users/nathanielcannon/Claude/GitRepos/df-narrator/README.md` — scoring formula documentation
4. `/Users/nathanielcannon/Claude/GitRepos/weblegends/helpers.cpp` — categorize(), link(), event_link(), history(), event_context::related()
5. `/Users/nathanielcannon/Claude/GitRepos/weblegends/helpers.h` — event_context struct, WEBLEGENDS_TYPES macro
6. `/Users/nathanielcannon/Claude/GitRepos/weblegends/helpers_event.h` — do_location(), do_circumstance_reason(), do_weapon() signatures
7. `/Users/nathanielcannon/Claude/GitRepos/weblegends/helpers/event.cpp` — event(), event_dispatch(), 1000-event pagination, year/date formatting
8. `/Users/nathanielcannon/Claude/GitRepos/weblegends/helpers/circumstance.cpp` — reason/circumstance text rendering
9. `/Users/nathanielcannon/Claude/GitRepos/weblegends/helpers/location.cpp` — do_location() implementation
10. `/Users/nathanielcannon/Claude/GitRepos/weblegends/render_figure.cpp` — HF page structure, all relationship types
11. `/Users/nathanielcannon/Claude/GitRepos/weblegends/render_site.cpp` — site page structure
12. `/Users/nathanielcannon/Claude/GitRepos/weblegends/render_entity.cpp` — entity page structure
13. `/Users/nathanielcannon/Claude/GitRepos/weblegends/render_home.cpp` — home page / sidebar
14. `/Users/nathanielcannon/Claude/GitRepos/weblegends/http.cpp` — URL routing, request dispatch
15. `/Users/nathanielcannon/Claude/GitRepos/weblegends/server.cpp` — TCP server, port 5080–5089, threading model
16. `/Users/nathanielcannon/Claude/GitRepos/weblegends/export.cpp` — BFS static site export
17. `/Users/nathanielcannon/Claude/GitRepos/weblegends/weblegends.cpp` — plugin init, DFHack registration
18. `/Users/nathanielcannon/Claude/GitRepos/weblegends/weblegends.h` — WebLegends class, Layout class, Client class
19. `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/hist_figure_died.cpp` — 40+ death cause rendering
20. `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/artifact_created.cpp` — artifact creation rendering
21. `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/war_field_battle.cpp` — field battle rendering
22. `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/hf_confronted.cpp` — confrontation rendering
23. `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/hf_does_interaction.cpp` — interaction text from game raws
24. `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/masterpiece_created_item.cpp` — masterwork item rendering
25. `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/change_hf_state.cpp` — HF state change (born/settled/wandered/fled)
26. All 94 event `.cpp` files in `/Users/nathanielcannon/Claude/GitRepos/weblegends/events/`

---

## Uncertainties

- **df-narrator megabeast detection**: The hardcoded race set (`{DRAGON, HYDRA, COLOSSUS_BRONZE, CYCLOPS, ETTIN, GIANT, ROC, TITAN}`) may not be complete for all DF versions. weblegends uses `creature_raw_flags::HAS_ANY_TITAN` / `HAS_ANY_FEATURE_BEAST` / `HAS_ANY_UNIQUE_DEMON` flags from creature raws instead — more robust.
- **weblegends event type completeness**: 94 files cover all known event types as of DFHack 53.x. Some newer DF releases may have added event types not covered (the fallback `do_event_missing()` handles these via DF's own `getSentence()`).
- **`hf_confronted.cpp` accuser field**: Only case 0 ("aroused general suspicion") is handled; other accuser values call `do_event_missing`. The field semantics are not fully documented.
- **df-narrator entity link bonus**: The formula has two separate entity link bonuses (position-type links ×20, plus all entity links ×3 capped at 60). Whether these double-count position links is unclear from the code — positions would score both bonuses.

## Related Topics

- Chronicler CDM schema mapping to weblegends entity types
- DFHack Lua scripting for hist_string extraction (complement to weblegends C++ approach)
- DF XML vs. DFHack live data trade-offs for Chronicler ingestion pipeline
- weblegends' `render_world_populations()` for population tracking
- weblegends' map rendering (`map.cpp`) for geographic context
