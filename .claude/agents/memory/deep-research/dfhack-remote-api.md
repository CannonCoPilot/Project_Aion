# DFHack Remote API Research — Key Facts

Date: 2026-02-20

## Connection
- Port: 5000 (localhost only by default, configurable in dfhack-config/remote-server.json)
- Config: allow_remote=false (local only); port=5000
- Protocol: custom framing over TCP with protobuf payloads

## Handshake
- Client sends: b'DFHack?\n' + int(1).to_bytes(4, 'little')  (12 bytes total)
- Server replies: b'DFHack!\n' + int(1).to_bytes(4, 'little') (12 bytes total)

## Message Frame (8 bytes)
- Bytes 0-1: method_id (int16 little-endian, signed)
- Bytes 2-3: padding (unused, zero)
- Bytes 4-7: payload_size (int32 little-endian)
- Then: payload bytes (protobuf)

## Special IDs
- -4: QUIT
- -3: RPC_REPLY_TEXT (CoreTextNotification)
- -2: RPC_REPLY_FAIL (CoreErrorNotification, result codes: OK=0, FAILURE=1, NOT_FOUND=3)
- -1: RPC_REPLY_RESULT (success response)
-  0: BindMethod (CoreBindRequest → CoreBindReply with assigned_id)
-  1: RunCommand (CoreRunCommandRequest)
-  Built-in also: RunLua (CoreRunLuaRequest)

## Proto files
- library/proto/CoreProtocol.proto — EmptyMessage, CoreBindRequest/Reply, CoreRunCommandRequest, CoreRunLuaRequest
- library/proto/BasicApi.proto — GetWorldInfoOut, ListUnitsOut, ListSquadsOut, etc.
- plugins/remotefortressreader/proto/RemoteFortressReader.proto — all RFR types

## Key RPC Methods (RemoteFortressReader plugin)
All require plugin='RemoteFortressReader' in BindMethod call.

### Data retrieval
- GetVersionInfo() → VersionInfo
- GetMapInfo() → MapInfo (block grid size + position + world/save names)
- GetViewInfo() → ViewInfo (viewport pos/size + cursor pos)
- GetWorldMap() / GetWorldMapNew() → WorldMap (full world grid)
- GetWorldMapCenter() → WorldMap
- GetRegionMaps() / GetRegionMapsNew() → RegionMaps
- GetBlockList(BlockRequest) → BlockList (tile data by region)
- GetUnitList() → UnitList (all units, lightweight: id+pos+race)
- GetUnitListInside(BlockRequest) → UnitList (units in region)
- GetItemList() → MaterialList
- GetPlantList(BlockRequest) → PlantList
- GetMaterialList() → MaterialList
- GetGrowthList() → MaterialList
- GetCreatureRaws() → CreatureRawList
- GetPartialCreatureRaws(ListRequest) → CreatureRawList
- GetPlantRaws() → PlantRawList
- GetPartialPlantRaws(ListRequest) → PlantRawList
- GetBuildingDefList() → BuildingList
- GetTiletypeList() → TiletypeList
- GetLanguage() → Language
- GetReports() → Status (list of Report messages: announcements, combat)
- CopyScreen() → ScreenCapture

### Game state
- GetPauseState() → SingleBool
- SetPauseState(SingleBool) → void
- GetGameValidity() → SingleBool
- GetSideMenu() → SidebarState
- SetSideMenu(SidebarCommand) → void

### Control (dangerous)
- MoveCommand, JumpCommand, MiscMoveCommand, MovementSelectCommand
- SendDigCommand(DigCommand) → void
- PassKeyboardEvent(KeyboardEvent) → void
- MenuQuery() → MenuContents
- CheckHashes(), ResetMapHashes()

## Core RPC Methods (no plugin)
- GetVersion() → StringMessage
- GetWorldInfo() → GetWorldInfoOut (mode, save_dir, world_name, civ_id, site_id, etc.)

## Critical Limitation: UnitDefinition is SHALLOW
GetUnitList returns only: id, is_valid, pos_x/y/z, race, profession
For deep data (skills, attributes, needs, mood) you must use Lua via RunCommand/RunLua

## Report structure
Report: type, text, color, duration, flags {continuation, unconscious, announcement}, repeat_count, position, id, year, time

## Python client situation
- Reference local repo: /Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/
  - Minimal (3 commits, 2021), no pip package, requires CMake to generate protos
  - asyncio-based, clean @remote decorator pattern
- McArcady fork: similar minimal codebase
- Best Python approach: build on local blendwarf pattern + generate protos from DFHack source
- Alternative: kunesj/DFHackRPC (more complete but old, 0.44.x vintage)

## Lua data access (in-game, via RunCommand or RunLua)
Lua has FULL access to df.global.world.* including:
- df.global.world.units.active — complete unit list with all fields
- df.global.world.status.reports — announcements/combat
- df.global.world.incidents.all — deaths with causes/killers
- df.global.world.agreements.all — petitions
- df.global.world.artifacts.all — artifacts
- df.global.plotinfo.main.fortress_site — fortress info
- df.global.world.world_data.name — world name
- dfhack.world.ReadCurrentDay/Month/Year()
- dfhack.units.isCitizen(), getRaceName(), getAge(), etc.
Events: eventful plugin for ITEM_CREATED, UNIT_DEATH, JOB_COMPLETED, INVASION

## Coordinate system
- BlockRequest uses BLOCK coordinates (divide tile coords by 16)
- Map tile coords are block_coord * 16 + offset
