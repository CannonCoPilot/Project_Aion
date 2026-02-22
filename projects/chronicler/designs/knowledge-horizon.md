# Knowledge Horizon — Dynamic Database Masking Design

## Concept

The Knowledge Horizon is a dynamic masking system that limits the LLM's search space within the Chronicler database. Instead of giving the LLM access to all ~1.65M CDM records across 35 tables, the mask exposes only data relevant to the fortress and its inhabitants, growing organically as in-game conditions change.

**Goals**:
- Reduce LLM search space so it can be more thorough in sequential queries
- Prevent the LLM from drawing inferences based on information a fortress wouldn't logically have
- Dynamically expand the mask as migrants arrive, squads raid, diplomats visit

---

## Masking Dimensions

### 1. Geographic Scope
- **Always visible**: The region containing the fortress, adjacent regions
- **Masked by default**: Distant regions, other continents
- **Revealed by**: Migrants from distant sites, trade caravan origins, raid targets

### 2. Civilization Scope
- **Always visible**: The fortress's parent civilization structure (government type, notable positions)
- **Masked by default**: Internal details of foreign civilizations
- **Revealed by**: Diplomatic contact, wars, raids on foreign sites

### 3. Individual Scope
- **Always visible**: All fortress inhabitants (units table), their direct family
- **Masked by default**: Individuals with no connection to fortress denizens
- **Revealed by**: Arrival at fortress, family connection to a resident, organizational overlap

---

## Visibility Caveats

Rules governing what should be visible and under what conditions. These refine the broad masking dimensions above with DF-specific logic.

### CAV-001: Organization Membership Propagation
**Status**: Always visible (with restrictions)

Connections between units through shared organizations should elevate visibility, but with nuance:

| Organization Type | Visibility Rule |
|-------------------|-----------------|
| **Cults / Secret Societies** | A member carries knowledge of all other members of that cult |
| **Military Squads** | Members know their squad-mates and chain of command |
| **Guilds / Craft Groups** | Members know other guild members at the same site |
| **Religious Orders** | Members know other worshippers of the same deity at nearby sites |
| **Civilization (broad)** | Members do NOT carry knowledge of every single civilization member |

**Rationale**: A cult is small and secretive — members know each other. A civilization has thousands of members — no individual carries a mental model of all of them.

### CAV-002: Civilization Nobles and Administrators
**Status**: Always visible

All civilization members should carry knowledge of:
- Civilization-level nobles (king, queen, duke, baron, etc.)
- Administrators (bookkeeper, manager, expedition leader)
- Law-givers and military commanders

These are public figures whose roles are known civilization-wide.

### CAV-003: Previous Residence Knowledge
**Status**: Always visible

A dwarf should carry knowledge of all inhabitants of their previous residences (sites where they lived before migrating to the fortress). This includes:
- Other residents who lived there concurrently
- Notable structures and site features
- Local government and notable figures

**Derivation**: Cross-reference `hf_site_links` for previous residencies, then expose all HFs with overlapping site links at those sites.

### CAV-004: Starting Dwarf Background Generation
**Status**: Requires implementation (new game process)

Dwarf Fortress starting dwarves (the initial 7) do **not** have historical figure backgrounds — they exist only as units, not as entries in the legends data. This creates a knowledge gap.

**Proposed heuristic**:
1. Check known relationships of starting dwarves (spouse, children via unit data)
2. Assign parentage from the civilization's HF pool based on name/race matching
3. Assign previous residency to the civilization's capital or a nearby site
4. Generate synthetic `hf_site_links` and `hf_links` entries for these dwarves
5. Mark synthetic entries with a `source = 'inferred'` flag so they're distinguishable from legends data

**Trigger**: Run on first `chronicler watch` cycle for a new fortress (when unit count <= 7 and no HF matches exist).

### CAV-005: Family Chain Propagation
**Status**: Always visible (depth-limited)

Family relationships propagate visibility transitively, but with depth limits:
- **Depth 1**: Spouse, children, parents — always visible
- **Depth 2**: Siblings, grandparents, in-laws — visible if alive
- **Depth 3+**: Extended family — masked unless another caveat reveals them

### CAV-006: Event-Based Revelation
**Status**: Dynamic

Certain history events should unmask previously hidden data:
- **War declaration**: Reveals the enemy entity's leadership, sites, and military
- **Caravan arrival**: Reveals the sending civilization's trade goods and diplomats
- **Migrant wave**: Reveals each migrant's previous site and social connections
- **Raid/expedition return**: Reveals sites visited and entities encountered
- **Artifact acquisition**: Reveals the artifact's creation history and previous owners

### CAV-007: LLM Inference Restrictions
**Status**: Permanent rule

The LLM should be instructed:
- Do NOT infer events or relationships not present in the unmasked data
- Do NOT speculate about masked regions or civilizations
- When asked about unknown areas, state that the fortress has no intelligence on that topic
- Treat the Knowledge Horizon as an in-world limitation, not a system limitation

---

## Implementation Approach

### Preferred: View-Based Masking
Create PostgreSQL views that filter base tables through a `visibility` predicate:
```sql
CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE id IN (SELECT hf_id FROM knowledge_horizon WHERE visible = true);
```

The `knowledge_horizon` table stores per-HF (and per-entity, per-site) visibility flags, updated by the watcher when new data arrives.

### Alternative: Materialized Subset
Copy visible rows into shadow tables, refreshed on each watcher cycle. Faster queries but higher storage cost and sync complexity.

### Recommendation
Start with view-based masking — simpler, no data duplication, naturally consistent. If query performance becomes an issue with 60K+ HFs, add materialized views with incremental refresh.

---

## Exploration Prerequisites

Before implementing, use the Database Explorer to:
1. Map organization types present in `entities` and `hf_entity_links`
2. Count HFs per organization type to size the visibility tiers
3. Trace a sample dwarf's connections through `hf_links`, `hf_site_links`, `hf_entity_links` to validate propagation rules
4. Identify starting dwarves in the `units` table that lack HF matches

---

*Design created 2026-02-22, Session 32*
*Informed by user discussion on data-slimming, tier propagation, and DF peculiarities*
