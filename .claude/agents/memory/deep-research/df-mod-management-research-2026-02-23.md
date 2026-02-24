# DF Mod Management Research — 2026-02-23

## Key Facts (for future sessions)

- DF v50+ uses SELECT/CUT tokens as native patch mechanism — no more file replacement required
- info.txt has REQUIRES_ID_BEFORE_ME, REQUIRES_ID_AFTER_ME, CONFLICTS_WITH_ID fields
- DFHack mod-manager.json stores modpacks as: [{name, default, modlist: [{id, version}]}]
- ModHearth queries mod data live from DF memory via DFHack Lua — requires DF to be running
- DF-Modloader (voliol) has a full working EDIT/OBJECT_TEMPLATE/COPY_TAGS_FROM compiler
- PyLNP uses three-way merge (vanilla/mod/accumulated) with difflib SequenceMatcher
- PyDwarf uses linked-list token representation with prev/next pointers — most sophisticated raw API
- Raw file load order by file header prefix (language_, creature_, entity_, etc.) NOT filename
- Duplicate object IDs cause "raw duplication" — trippy errors, not a clean last-wins
- SELECT appends to existing object; CUT forces removal of object from earlier mods
