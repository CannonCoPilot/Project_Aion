# Girderpriced Gameplay Plan — Playing Until Collapse

**Fortress**: Girderpriced / Thobteshkad (site 2212)
**World**: Orid Zurko / "The Universe of Cyclones" (world_id=3)
**Civilization**: civ_id 1042
**Date of Plan**: 2026-03-22
**Current State**: Y256 Autumn (tick 275,599), PAUSED
**Objective**: Observe and record the fortress's decline and collapse without intervention
**Data Sources**: Live DFHack probes, bridge v9 state file (4.7MB, tick 275,539), DB denizen registry (world_id=3)

---

## 1. Current Fortress Assessment

### Population Summary

| Category | Count | Details |
|----------|-------|---------|
| **Citizen dwarves** | 13 | Pass `dfhack.units.isCitizen()` — the "official" population |
| **Non-citizen civ dwarves** | 15 | Same civ_id, NOT citizens (insane, undead, or stripped of status) |
| **Necromancer visitors** | 4 | Dwarf necromancers visiting the tavern |
| **Raised corpses** | 21+ | 9 elf soldiers + 12 human soldiers — walking dead from defeated invasions |
| **Tame animals** | ~16 | Dogs, cats, horses, llamas, yak, camel, boar, donkey, alpaca, goose, hen, rabbit, reindeer |
| **Wild creatures** | ~40+ | 12 crundles, 8 bugbats, 7 dralthas, 2 thrush monsters (demons), 6 magma crabs, 8+ ravens, 1 fire imp, 1 weasel, 1 owl |
| **Total fortress units** | 28 | Per bridge `fortress_count` |
| **Total active units on map** | ~110+ | Everything alive/undead/active |

### The Six Necromancers

| Name | Role | Unit ID | HF ID | Status |
|------|------|---------|-------|--------|
| **Dastot Dedukotad "Manorhands"** | Expedition Leader | 2773 | 4489 | **CITIZEN — IMMORTAL** (no hunger/thirst/sleep) |
| **Geshud Itebobur "Postheroes"** | Doctor Necromancer | 1891 | 9495 | Non-citizen, stress=41,780 |
| Inod Monomcatten "Paperchannels" | Brewer Necromancer | 15681 | — | Visitor |
| Ast Alothostar "Boltedburied" | Ranger Necromancer | 15680 | — | Visitor |
| Momuz Avuznekol "Minedskulls" | Blacksmith Necromancer | 15683 | — | Visitor |
| Sodel Kivishlak "Lancerinsight" | Peasant Necromancer | 15684 | — | Visitor |

These necromancers have raised the corpses of TWO defeated invasion armies (elven + human) that now roam the fortress as undead.

### 13 Citizens (live game, verified)

| # | Unit ID | Name | Profession | Stress | Notes |
|---|---------|------|-----------|--------|-------|
| 1 | 17703 | Lorbam Edamadas "Keypassed" | Woodworker | -13,680 | Only happy dwarf. Died in incident Y251 (cause_45) but now alive — likely raised/recovered |
| 2 | 2558 | Kogan Domasduthal "Guildworth" | Peasant | 16,840 | Died in incident Y251 (cause_45) but alive now |
| 3 | 17828 | Adil Atirtun "Dyedoor" | Mason | 28,550 | HIGH. Died in incident Y252 (cause_45) but alive |
| 4 | 17831 | Zasit Berasiz "Earthflash" | Woodcrafter | 18,880 | Died in incident Y252 (cause_45) but alive |
| 5 | 17832 | Erib Mebzuthnazom "Oardream" | Stonecrafter | 27,350 | HIGH. Died in incident Y252 (bleeding) but alive |
| 6 | 17833 | Inod Analkeskal "Lullshot" | Weaver | 25,000 | HIGH. Died in incident Y251 (cause_45) but alive |
| 7 | **2773** | **Dastot Dedukotad "Manorhands"** | **Expedition Leader / Necromancer** | **31,400** | **IMMORTAL**. HF 4489, worldgen figure |
| 8 | 18069 | Isak Nishetur "Trade" | Planter | 17,760 | HF 49985 — spawned citizen |
| 9 | 18070 | Sakil Thetustelis "Purgethins" | Planter | 10,230 | HF 49986 — spawned |
| 10 | 18071 | Rintor Luruzlir "Hate" | Planter | 70 | HF 49987 — spawned, calm |
| 11 | 18072 | Uzar Megidnar | Planter | 17,567 | HF 49988 — spawned |
| 12 | 18073 | Olmul Deshlirbonun | Planter | 0 | HF 49989 — spawned, calm |
| 13 | 2667 | Dumed Kubuktarem "Lancedfates" | Planter | 25,960 | HIGH. HF 35260, worldgen figure |

### 15 Non-Citizen Civ Dwarves (alive but not citizens — insane, undead, or status-stripped)

| Unit ID | Name | Profession | Stress | Likely State |
|---------|------|-----------|--------|--------------|
| 17701 | Cerol Konosathel "Brassringed" | Miner | 44,565 | VERY HIGH — original embarker |
| 17702 | Kib Idsezuk "Rockslapped" | Planter | 20 | Calm |
| 17704 | Melbil Uzolmozir "Oilyrouts" | Stonecrafter | -8,840 | Happy — original embarker |
| 17705 | Erush Edtullimul "Groovedgold" | Fisherdwarf | 38,960 | VERY HIGH |
| 17706 | Minkot Noramthikut "Relievedbook" | Mason | 6,540 | Moderate — died Y251 (drowning) |
| 17707 | Monom Ilidkubuk "Rulelance" | Administrator | 30,415 | HIGH |
| 17827 | Asob Duthnurbim "Guardsling" | Miner | 39,160 | VERY HIGH — died Y252 (cause_22) |
| **1875** | **Etur Egendatan "Giftiron"** | **Clothier** | **100,000** | **MAXIMUM STRESS — COMPLETELY INSANE. Died Y251 (hunger)** |
| 1891 | Geshud Itebobur "Postheroes" | Doctor Necromancer | 41,780 | VERY HIGH — second necromancer |
| 2548 | Sakzul Kosothulzest "Palacewrings" | Gem Cutter | 12,565 | Moderate — died Y251 (hunger) |
| 15279 | Bim Libashnazom "Axedreams" | Stonecrafter | 17,520 | Moderate |
| 18264 | Zasit Atolnomal "Findstaff" | Merchant | 2,400 | Low — visitor/merchant |
| 18266 | Dumed Logemsazir "Paintbridges" | Hammerdwarf | 0 | Calm |
| 12833 | Ushrir Matulgoden "Danceropes" | Peasant | 43,340 | VERY HIGH — died Y251 (hunger) |
| 18068 | Bidok Sharsidstetir "Blight" | Planter | -130 | Happy — died Y253 (thirst) but alive |

### Raised Invasion Corpses (21 active undead)

| Race | Type | Count |
|------|------|-------|
| Elf | Spearman Corpse | 3 |
| Elf | Hammerman Corpse | 3 |
| Elf | Swordsman Corpse | 3 |
| Elf | Maceman Corpse | 2 |
| Human | Spearman Corpse | 4 |
| Human | Maceman Corpse | 3 |
| Human | Hammerman Corpse | 3 |
| Human | Axeman Corpse | 2 |
| **Total** | | **21** |

### Resources (live game, tick 275,599)

| Resource | Count | Source | Status |
|----------|-------|--------|--------|
| Prepared food | 0 | Live `FOOD` query | CRITICAL |
| Drink | 0 | Live `DRINK` query | CRITICAL |
| Meat | 1 | Live `MEAT` query | Last scrap |
| Fish | 3 | Live `FISH` query | Minimal |
| Cheese | 5 | Live `CHEESE` query | Minimal |
| Seeds | 45 | Live query | Planting possible |
| Plants | 7 | Live query | Barely any |
| **Bridge food_stocks** | **3** | **Bridge fortress_state** | **Counts prepared meals differently** |
| Bridge drink_stocks | 0 | Bridge fortress_state | Confirmed zero |
| Buildings | 29 | Bridge | Intact |
| Ghosts | 0 | Live query | None currently |
| Wealth | 962 total / 20,706 imported | Bridge | Modest |

### Incident History (50 recorded incidents, Y251–Y255)

| Year | Deaths | Primary Causes | Key Events |
|------|--------|---------------|------------|
| Y251 | ~12 | Hunger (4), bleeding (2), drowning (1), cause_45 (4), cause_22 (1) | **Tantrum chain**: Cerol drowns Minkot → Minkot kills Lorbam → Lorbam kills Inod → Inod kills Kogan → Kogan kills Geshud. Multiple starvation deaths. |
| Y252 | ~20 | Cause_45 (3), cause_22 (10+), bleeding (8), murdered (1) | **Mass undead event at t154,560**: 10+ units die simultaneously (cause_22 — likely necromancer/undead attack). Elf and human invasion corpses appear. |
| Y253 | 3 | Thirst (1), bleeding (1), murdered (2) | Bidok dies of thirst, sporadic combat |
| Y254 | 3 | Bleeding (2), hunger (2) | Animals dying of starvation, fire imp combat |
| Y255 | 2 | Bleeding (1), murdered (1) | Fire imp (18082) kills invaders |

**5 invasions** recorded in fortress_state.

### Key Anomaly: Dead Dwarves Walking

Many citizens and non-citizens **died in recorded incidents** but are currently **alive and active** (ghost=false). Possible explanations:
1. **Necromantic resurrection** — 6 necromancers present with power to raise dead
2. **DFHack spawning** — some were recreated via `dfhack.units.create` + `makeown` during emergency recovery
3. **Incident records may track attacks, not confirmed deaths** — some may have survived injuries

### Non-Dwarf Visitors (DB records — all DEPARTED)

The 14 non-dwarf sentient visitors (5 humans, 4 goblins, 4 kobolds, 1 elf) recorded in the denizen registry from Y251 are **no longer present** in the live game. They have all departed or died.

---

## 2. Predicted Collapse Sequence

### Phase A: Thirst/Hunger Crisis (next ~50,000 ticks / ~1 DF month)
- 0 drink, 9 edible items (1 meat + 3 fish + 5 cheese) for 28+ dwarves
- Thirst counter depletes before hunger in DF
- 12 mortal citizen dwarves at risk; Dastot immune
- 15 non-citizen dwarves also at risk (unless undead — undead don't need food)
- Key question: **are the "dead but walking" dwarves truly undead** (no food needs) or alive (will starve)?

### Phase B: Stress Cascade (concurrent with starvation)
- **Etur already at 100,000** (maximum insane) — may attack others
- 6 dwarves above 25,000 stress among citizens alone
- 5 non-citizen dwarves above 38,000 stress (Cerol 44.5K, Erush 39K, Asob 39.2K, Geshud 41.8K, Ushrir 43.3K)
- Deaths will spike stress for survivors → tantrum spiral
- With 21 undead corpses wandering around, live dwarves may be attacked by raised dead

### Phase C: Necromancer Chaos
- 6 necromancers may raise any new corpses as they die
- Dead citizens could become undead and attack survivors
- The undead army (21 elf + human corpses) may turn hostile if necromancer control lapses
- Fire imp (18082) is still active and has killed 3 units in incidents

### Phase D: Ghost/Undead Spiral
- Dead citizens without coffins/memorials become ghosts
- Ghost-ward DFHack script may or may not still be active (unknown)
- With many simultaneous deaths, ghost-ward could be overwhelmed
- Ghosts terrify living dwarves → more stress → more deaths

### Phase E: Final Stand — Dastot Alone
- Dastot Dedukotad "Manorhands" (immortal necromancer, HF 4489) will be the last citizen
- Cannot die from hunger/thirst/sleep deprivation
- May continue raising dead, surrounded by his undead army
- **Collapse declared when all mortal citizens are dead**

---

## 3. Gameplay Strategy

### Principle: PURE OBSERVATION
Do NOT intervene. No food spawning, no citizen creation, no danger neutralization. Let the fortress die naturally. Record everything for Chronicler.

### Pre-Run Checks
1. Verify ghost-ward status (is the repeat job still active?)
2. Run bridge once to get a fresh baseline snapshot
3. Note any popups that need clearing before game advancement

### Data Capture Cadence

| Phase | Interval | Method | Capture Focus |
|-------|----------|--------|---------------|
| Pre-collapse (now) | Every 5,000 ticks | Step + probes | Baseline: all populations, stress, food, undead status |
| Active decline | Every 2,000 ticks | Step + probes + announcements | Deaths, stress spikes, necromancer raises, tantrum events |
| Rapid collapse | Every 1,000 ticks | Step + probes + announcements | Final deaths, ghost appearances, undead behavior |
| Post-collapse | Once | Full probe + legends export + bridge snapshot | Final state, complete history |

### Per-Cycle Probe Commands

```lua
-- 1. Citizen count + stress
for _,u in ipairs(df.global.world.units.active) do if dfhack.units.isCitizen(u) then print(u.id .. '|' .. dfhack.units.getReadableName(u) .. '|stress=' .. (u.status.current_soul and u.status.current_soul.personality.stress or 'N/A')) end end

-- 2. Non-citizen civ dwarves (undead/insane check)
local civ=df.global.plotinfo.civ_id; for _,u in ipairs(df.global.world.units.active) do if u.civ_id==civ and not dfhack.units.isCitizen(u) and df.creature_raw.find(u.race).creature_id=='DWARF' then print(u.id .. '|' .. dfhack.units.getReadableName(u) .. '|stress=' .. (u.status.current_soul and u.status.current_soul.personality.stress or 'N/A')) end end

-- 3. Food/drink detail
print('food=' .. #df.global.world.items.other.FOOD .. ' drink=' .. #df.global.world.items.other.DRINK .. ' meat=' .. #df.global.world.items.other.MEAT .. ' fish=' .. #df.global.world.items.other.FISH .. ' cheese=' .. #df.global.world.items.other.CHEESE .. ' seeds=' .. #df.global.world.items.other.SEEDS .. ' plants=' .. #df.global.world.items.other.PLANT)

-- 4. Recent announcements (last 10)
local a=df.global.world.status.announcements; local n=#a; for i=math.max(0,n-10),n-1 do print('Y' .. a[i].year .. ' t' .. a[i].time .. ': ' .. a[i].text) end

-- 5. Ghost + popup check
local g=0; for _,u in ipairs(df.global.world.units.active) do if u.flags3.ghostly then g=g+1 end end; print('Ghosts=' .. g .. ' Popups=' .. #df.global.world.status.popups)
```

---

## 4. Collapse Criteria

The fortress is declared **COLLAPSED** when:

1. **All mortal citizen dwarves are dead** (12 of 13) — regardless of Dastot, non-citizens, or undead
2. OR **population drops to 1** (just Dastot) and no migrants possible
3. OR **tantrum spiral + undead chaos makes fortress unrecoverable**

### End-of-Fortress Protocol

1. Let the final deaths play out naturally
2. Capture final state: all unit lists, stress, announcements, food/drink, incident count
3. Run `exportlegends` for post-collapse world history XML (new legends data will include fortress deaths)
4. Record complete announcement log
5. Quicksave for archive
6. Document full timeline: Y250 founding → Y251 tantrum chain → Y252 mass undead event → recovery → Y256 starvation collapse

---

## 5. Narrative Value for Chronicler

This fortress provides **exceptionally rich** multi-layered narrative data:

- **Necropolis arc**: A fortress of the dead — 6 necromancers, 21 walking corpses, 15 former citizens who died and somehow walk again. Girderpriced is less a dwarven settlement and more a necromancer's domain
- **Dastot's saga**: HF 4489, a worldgen necromancer who became expedition leader — presiding over a fortress of the resurrected. The one who literally cannot die, surrounded by those he raised
- **Geshud's role**: A Doctor necromancer — healing and raising in equal measure. The medical and the macabre intertwined
- **The tantrum chain of Y251**: Cerol → Minkot → Lorbam → Inod → Kogan → Geshud — a cascade of murder, each killer becoming the next victim. A perfect narrative sequence
- **The mass death of Y252**: 10+ units dying at the same tick (t154,560) — an invasion overwhelming the fortress in a single moment
- **Raised armies**: Elf and human soldiers who invaded to conquer, were defeated, and now serve in death — walking the halls of the fortress they tried to destroy
- **Multi-cause collapse**: starvation, tantrums, undead violence, insanity (Etur at 100K), necromantic chaos — not one death cause but many interwoven
- **World depth**: 49,614 HFs and 527,304 events in Orid Zurko — every character has a history waiting to be told
- **Data layers**: Live bridge (4.7MB state), 50 incidents, denizen registry (315 records), legends XML, CDC unit events — multiple granularities of the same apocalypse

---

## 6. Timeline Estimate

| Event | Estimated Tick | Notes |
|-------|---------------|-------|
| First thirst deaths | t300,000–325,000 | ~1 DF month from now |
| Etur violence (100K stress) | Any moment | Already insane — may attack at any tick |
| Stress spiral spreads | t310,000–340,000 | Deaths trigger cascade |
| Undead chaos possible | Unpredictable | Necromancer control could lapse |
| Half mortal citizens dead | t330,000–360,000 | |
| All mortals dead | t350,000–403,200 | Winter or early Y257 |
| Dastot alone with undead army | t403,200+ (Y257) | Final state |

Total estimated observation: **10–15 minutes real time** with step-and-capture cycles.

---

## 7. Data Corroboration Notes

| Data Point | Live Game (t275,599) | Bridge (t275,539) | DB (denizen registry) | Status |
|-----------|---------------------|-------------------|----------------------|--------|
| Citizens | 13 (isCitizen) | 28 fortress_units | 14 dwarf residents | **Bridge captures all civ units; DB is stale** |
| Food | 0 prepared | food_stocks=3 | — | **Bridge counts edible items (meat/fish/cheese); live FOOD=0 means no prepared meals** |
| Drink | 0 | drink_stocks=0 | — | Consistent |
| Invasions | — | invasion_count=5 | — | Bridge only |
| Incidents | — | 50 incidents | — | Bridge only |
| Non-dwarf visitors | 0 in live game | — | 14 in DB | **All departed since DB snapshot** |
| Necromancer visitors | 4 (live isVisitor) | — | — | Live game only |
| Raised corpses | 21 (live query) | — | — | Live game only |
| Ghosts | 0 | — | — | Confirmed none |

**Key lesson**: No single data source tells the full story. The bridge captures fortress metrics and incidents, the live game reveals unit classification (citizen/visitor/undead), and the DB preserves historical records. All three are needed for accurate assessment.

---

*Plan prepared 2026-03-22 — fully corroborated across live game, bridge state, and DB*
*Ready for user review and CLAUDE.md integration*
