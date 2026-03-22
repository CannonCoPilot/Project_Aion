# Girderpriced Session Report — The Fall of Manorhands

**Session Date**: 2026-03-22 (Session 45)
**Fortress**: Girderpriced / Thobteshkad (site 2212)
**World**: Orid Zurko / "The Universe of Cyclones" (world_id=3)
**Civilization**: civ_id 1042
**Duration**: Y256 Autumn T275,599 → Y256 Winter T365,270 (89,671 ticks / ~2.2 DF months)
**Outcome**: FORTRESS COLLAPSED — Last citizen decapitated by undead at T365,266

---

## Executive Summary

Girderpriced, a fortress of 13 nominal citizens at the start of observation, was revealed upon closer inspection to contain only **1 true citizen**: Dastot Dedukotad "Manorhands", an immortal necromancer expedition leader. The remaining 7 dwarves passing `isCitizen()` were raised undead with residual citizenship flags; 2 more were non-citizen residents. DF's own `getCitizens()` API confirmed population = 1.

The fortress was surrounded by 37 hostile undead — corpses of defeated elf and human invasion armies, raised by the 6 necromancers who had passed through. Zero food, zero drink, zero hope.

At tick 365,266, the elf and human corpses that Dastot had once defeated finally killed him. An elf hammerman corpse fractured his skull while a human axeman corpse decapitated him. His severed head sailed off in an arc.

The immortal necromancer who could not die of hunger, thirst, or old age was destroyed by his own dead.

---

## Timeline

### Pre-Observation History (from incident records + bridge data)

| Year | Tick | Event |
|------|------|-------|
| ~Y250 | — | Fortress founded. 7 embarkers + early migrants |
| Y251 | various | **Tantrum chain**: Cerol drowns Minkot → Minkot kills Lorbam → Lorbam kills Inod → Inod kills Kogan. 4 die of hunger. ~12 total deaths |
| Y252 | T154,560 | **Mass undead event**: 10+ units die simultaneously. Elf + human invasion armies arrive and are defeated. Necromancers raise 21+ corpses |
| Y253 | various | Bidok dies of thirst, sporadic combat. 3 deaths |
| Y254 | various | Animal starvation, fire imp kills invaders. 3 deaths |
| Y255 | various | Fire imp combat. 2 deaths |
| Y256 | T15,358 | "Intruders! Drive them away!" |
| Y256 | T252,100 | "Your fortress is out of food!" |

### Observation Session (Y256 Autumn → Y256 Winter)

| Cycle | Tick | Citizens | Alive Dwarves | Undead | Key Events |
|-------|------|----------|---------------|--------|------------|
| Baseline (pre-session) | 275,599 | 13 (isCitizen) / 1 (getCitizens) | — | 32 | Food=0, Drink=0. Caravan departed without trading |
| Early probe | 281,244 | 9 (isCitizen) | — | 36 | 4 planters vanished. Rintor's severed neck attacking llama |
| Cycle 0 | 315,071 | 1 (real) | 10 | 37 | Corrected count. Dastot interrupted by corpses |
| Cycle 1 | 330,439 | 1 | 10 | 37 | Undead hunting stray cats. "Rintor's neck attacks donkey" |
| Cycle 2 | 341,649 | 1 | 10 | 37 | All food gone (0/0/0/0/0) |
| Cycle 3 | 352,245 | 1 | 10 | 37 | Stalemate — undead can't kill undead dwarves |
| Cycle 4 | 363,153 | 1 | 10 | 37 | Undead body parts flying. 45 new combat announcements |
| **Cycle 5** | **365,270** | **0** | **9** | **37** | **DASTOT KILLED. Decapitated by undead mob** |

### The Death of Dastot Manorhands — Tick-by-Tick

```
T365,184  Human axeman corpse attacks — Dastot jumps away
T365,185  Elf hammerman corpse strikes — deflected by copper battle axe
T365,195  Elf hammerman corpse bashes left knee — bone shattered
T365,195  Elf spearman corpse attacks — Dastot jumps away
T365,210  Elf spearman corpse stabs left lower arm — muscle torn
T365,215  Elf spearman corpse stabs left hand — muscle torn apart
T365,225  Elf hammerman corpse bashes right lower arm — bruised
T365,225  Elf swordsman corpse attacks — Dastot rolls away
T365,240  Elf hammerman corpse kicks right upper arm — bone bruised
T365,240  Elf swordsman corpse slashes right hand — muscle torn
T365,240  Elf spearman corpse stabs neck — spine fractured (!)
T365,250  Elf hammerman corpse scratches right hand
T365,257  Elf swordsman corpse stabs upper body — ribs shattered
T365,257  Elf spearman corpse stabs upper body — left lung torn
T365,257  Pond grabber leather dress BREAKS
T365,257  "The expedition leader necromancer is having trouble breathing!"
T365,266  Elf hammerman corpse bashes HEAD — skull fractured, spine nerves torn
T365,266  Human axeman corpse hacks HEAD — SEVERED. The part sails off in an arc.
```

Five undead attackers. 82 ticks of sustained assault. The killing blow: a bronze battle axe to the head.

---

## Final Census

| Category | Count | Details |
|----------|-------|---------|
| **Real citizens (getCitizens)** | **0** | All dead or raised |
| isCitizen alive (broad) | 7 | Raised dwarves with residual flags |
| Residents | 2 | Minkot, Asob (both undead — hunger/thirst=0) |
| Visitors | 0 | — |
| Invaders | 0 | — |
| **Undead hostile** | **37** | Raised elf + human invasion corpses |
| Undead friendly | 0 | None under fort control |
| Ghosts | 0 | — |
| Animals | 25 | Stray livestock (cats, dogs, donkeys, llamas) |
| Other | 10 | Wild creatures, demons |

### The 9 Walking Dead Dwarves (post-Dastot)

| Unit ID | Name | Former Profession | Stress | Notes |
|---------|------|-------------------|--------|-------|
| 17703 | Lorbam "Keypassed" | Woodworker | -13,680 | Died Y251, raised. Only "happy" dwarf |
| 2558 | Kogan "Guildworth" | Peasant | 16,840 | Died Y251 tantrum chain, raised |
| 17828 | Adil "Dyedoor" | Mason | 28,550 | Died Y252, raised |
| 17831 | Zasit "Earthflash" | Woodcrafter | 18,880 | Died Y252, raised |
| 17832 | Erib "Oardream" | Stonecrafter | 27,350 | Died Y252, raised |
| 17833 | Inod "Lullshot" | Weaver | 25,000 | Died Y251 tantrum chain, raised |
| 17706 | Minkot "Relievedbook" | Mason | 6,540 | Drowned Y251 by Cerol, raised. Resident |
| 17827 | Asob "Guardsling" | Miner | 39,160 | Died Y252, raised. Resident |
| 2667 | Dumed "Lancedfates" | Planter | 25,960 | Worldgen figure, raised |

All have hunger=0, thirst=0. They walk but do not live.

---

## Technical Findings

### Population Counting Discrepancy (Critical Bug Fix)

**Problem discovered during session**: Three layers of population filtering disagree.

| Layer | Filter | Girderpriced Result |
|-------|--------|-------------------|
| Bridge Lua `get_unit_summary()` | `race == player_race AND civ_id == plotinfo.civ_id` | 13 (all civ dwarves) |
| Controller `get_status()` | `dfhack.units.isCitizen(u) AND isAlive(u)` | 8 (includes raised undead) |
| Bridge `get_fortress_state()` | `#dfhack.units.getCitizens()` | 1 (true citizen only) |

**Root cause**: `isCitizen()` checks entity membership but doesn't exclude undead units that retain citizenship flags after being raised. `getCitizens()` is stricter — it internally calls `isSane()` which excludes zombified/berserk/insane units.

**Fixes applied** (this session):
1. `controller.py:get_status()` — switched from `isCitizen()` to `getCitizens()` for accurate count
2. `controller.py:survey_fortress()` — new method classifying ALL active units (citizens, residents, visitors, invaders, undead friendly/hostile, ghosts, animals)
3. `chronicler-bridge.lua:get_unit_summary()` — v10: added classification flags (`is_citizen`, `is_resident`, `is_visitor`, `is_undead`, `is_invader`, `is_sane`, `is_fort_controlled`, `hunger`, `thirst`) + `other_notable_units` array + `real_citizen_count`

### FPS Impact of Mass Undead Combat

With 37 hostile undead in constant combat + 25 animals + 10 dwarves (~72 active units), game simulation slowed to <1 tick/second under Prism ARM emulation. Each 10,000-tick advance took ~3 minutes real time. Without timestream, the fortress would have been functionally frozen.

### Data Collected

- **Session log**: `girderpriced-session-log.jsonl` (10 entries, baseline through final state)
- **Total announcements**: 1,568 (from fortress founding through collapse)
- **Observation ticks**: 89,671 (T275,599 → T365,270)
- **Game quicksaved** at final state

---

## Narrative Analysis

### The Arc of Girderpriced

**Act I — Foundation (Y250)**: Seven dwarves embark. A necromancer named Dastot leads them.

**Act II — The Tantrum Chain (Y251)**: Starvation triggers a cascade of murder. Cerol drowns Minkot, who kills Lorbam, who kills Inod, who kills Kogan, who kills Geshud. The dead accumulate. The necromancers raise them.

**Act III — The Invasions (Y252)**: Elf and human armies arrive. They are defeated. Their corpses are raised by the six necromancers. The fortress becomes a necropolis — more dead than living walk its halls.

**Act IV — The Slow Decay (Y253-Y256)**: Food runs out. Drink runs out. Migrants refuse to come. Caravans arrive but there's no trade depot. The living die one by one. The dead do not.

**Act V — The Last Stand (Y256 Winter)**: Dastot Manorhands stands alone — the sole recognized citizen, immortal, surrounded by 37 hostile undead he helped create. At tick 365,266, five of them corner him. An elf hammerman fractures his skull. A human axeman severs his head.

**Epilogue**: Nine dwarven corpses still walk the halls of Girderpriced. They were citizens once. They carry their professions and their stress and their names. But they are not alive. They are the fortress now.

### Key Narrative Themes

1. **The Necromancer's Hubris**: Dastot raised the dead to serve him; they destroyed him instead
2. **The Walking Dead Citizens**: 9 dwarves pass `isCitizen()` but not `getCitizens()` — a perfect metaphor for the living dead who retain the form of citizenship without its substance
3. **The Disembodied Neck**: Rintor Luruzlir's severed neck independently attacks livestock throughout the observation — pure DF horror-comedy
4. **The Weight of the Dead**: 37 hostile undead in constant combat caused FPS death, nearly freezing the simulation — the dead quite literally overwhelmed the world
5. **Ironic Justice**: The invasion armies came to conquer Girderpriced, failed, died, were raised, and then conquered it anyway

---

## Files Touched

| File | Change |
|------|--------|
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/controller.py` | Fixed `get_status()` to use `getCitizens()`; added `survey_fortress()` |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | v10: classification flags, wider unit capture, `real_citizen_count` |
| `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/girderpriced-session-report.md` | This report |
| `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/girderpriced-session-log.jsonl` | Raw session data |

---

*Report filed by Jarvis, 2026-03-22. Girderpriced: Y250–Y256. "The fortress is silent."*
