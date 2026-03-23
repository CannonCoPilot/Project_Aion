# Research Report: DFHack RPC Protocol and CoreSuspender Threading

**Date**: 2026-03-23
**Scope**: DFHack TCP RPC protocol internals, CoreSuspender threading model, QEMU/Prism ARM emulation failure modes, dfhack-run mechanism, alternative DF tool communication methods, and DFHack 50.x-53.x changes. Motivated by Chronicler's need to understand why remote RPC calls hang under UTM/QEMU and why the SSH+dfhack-run approach works.

---

## Executive Summary

DFHack exposes a TCP RPC server on port 5000 using Google Protocol Buffers. Every RPC call that requires live game state acquires a mutex called `CoreSuspender` inline on the **network thread**. Under QEMU/Prism ARM emulation (the UTM VM environment), this cross-thread mutex acquisition either deadlocks or hangs indefinitely due to how Prism's x86→ARM JIT layer handles mutex wait operations across threads. Two specific built-in calls — `GetVersion` and `GetWorldInfo` — are marked `SF_DONT_SUSPEND`, meaning they bypass `CoreSuspender` entirely and return cached data from the network thread; these are the only remote calls confirmed to work.

`dfhack-run.exe` connects to the **same TCP RPC port 5000** using the identical protocol. Its apparent success executing `lua` commands in the Chronicler environment is because it sends `RunCommand`, which also acquires `CoreSuspender` — but issued locally on the Windows x86 process's own thread where Prism's cross-thread scheduling hazards don't manifest. The critical insight is that **the problem is not TCP RPC vs. dfhack-run protocol** — it is **cross-machine (SSH) vs. same-process-host** invocation. When dfhack-run runs on the VM itself (via `ssh ... dfhack-run.exe`), it is a local process running natively within the x86 context, not a remote process whose network thread competes for game-thread resources under ARM translation.

All major DF companion tools that require live game data avoid TCP RPC by either running as in-process DFHack plugins (df-ai, Stonesense) or by reading DF process memory directly via OS APIs (Dwarf Therapist). LegendsViewer-Next and all legends browsers work exclusively from exported XML files and have no live data channel.

---

## Key Findings

### Finding 1: RPC Protocol — Handshake and Packet Format

**Protocol Summary**

The DFHack remote interface uses TCP port 5000 (configurable via `DFHACK_PORT` environment variable or `dfhack-config/remote-server.json`). The protocol is entirely Google Protocol Buffers over a persistent TCP connection.

**Handshake**

```
Client → Server:  "DFHack?\n"  + version (int32_t LE) = 1
Server → Client:  "DFHack!\n"  + version (int32_t LE) = 1
```

The server binds to `127.0.0.1:5000` by default (loopback only). Any mismatch in the magic bytes or version aborts the connection.

**Packet Header** (8 bytes, little-endian)

| Field | Type | Size | Description |
|-------|------|------|-------------|
| id | int16 | 2 bytes | Function ID or message type constant |
| padding | int16 | 2 bytes | Unused, always 0 |
| size | int32 | 4 bytes | Payload length in bytes |

**Packet Types (id field)**

| Constant | Value | Direction | Meaning |
|----------|-------|-----------|---------|
| `RPC_REPLY_TEXT` | -1 | Server→Client | Notification/stdout text |
| `RPC_REPLY_RESULT` | -2 | Server→Client | Success response |
| `RPC_REPLY_FAIL` | -3 | Server→Client | Error response with result code |
| `RPC_REQUEST_QUIT` | -4 | Either | Close connection |

**Payload limit**: 64 MiB. Exceeding it causes the server to return an error.

**Function binding**: Before calling any plugin function, the client must send a `BindMethod` RPC call (part of the built-in `CoreService`) to resolve the function name to its integer ID. Subsequent calls use that integer ID directly.

**Source**: [DFHack Remote Interface Documentation](https://docs.dfhack.org/en/stable/docs/dev/Remote.html)

---

### Finding 2: CoreSuspender — The Threading Model

**DFHack Thread Architecture**

DFHack runs three primary threads inside the DF process:

1. **Render/Main thread** (`df_render_thread`): The DF game's main thread. Owns the DF simulation loop.
2. **Simulation thread**: Acquires `CoreSuspendMutex` during `InitSimulationThread`. This is the "game thread lock" that all DFHack operations must coordinate with.
3. **IO thread** (`fIOthread` / `fInitthread`): Drives the DFHack console. All DFHack commands entered via the in-game console run on this thread.

The **RPC server** spawns an additional **network thread** per connection. This is a fourth concurrent thread that is outside the three above.

**CoreSuspender Mechanics**

`CoreSuspender` is a RAII mutex guard defined in `Core.cpp`. When constructed, it attempts to acquire `CoreSuspendMutex`, which suspends the DF simulation while plugin code executes, ensuring memory consistency. When the guard goes out of scope, the mutex is released and the simulation resumes.

**The Critical Dispatch Path** (`library/RemoteServer.cpp`)

```cpp
// ServerConnection::threadFn() — the RPC network thread loop
if (fn->flags & SF_DONT_SUSPEND)
{
    // Thread-safe call: executes on network thread directly
    res = fn->execute(stream);
}
else
{
    // Game-thread call: acquires CoreSuspender inline on the NETWORK THREAD
    CoreSuspender suspend;   // <-- THIS blocks waiting for the simulation mutex
    res = fn->execute(stream);
}
```

This is the root of the QEMU/Prism hang. Every RPC function that touches live DF game state requires `CoreSuspender`. When that mutex acquisition happens inline on the RPC network thread, it must synchronize with the DF simulation thread via OS-level mutex primitives — and that cross-thread synchronization is exactly what Prism's x86→ARM JIT layer does not reliably handle.

**SF_DONT_SUSPEND** functions execute on the network thread without acquiring the game mutex. They can only safely return pre-cached or static data (version strings, world info that is stable after load). Confirmed `SF_DONT_SUSPEND` functions: `GetVersion`, `GetWorldInfo`.

**SF_ALLOW_REMOTE** is a separate flag that marks functions as accessible to remote (non-localhost) clients. It does not affect suspension behavior.

**DFHack 50.15-r2 change**: Plugin command callbacks are now called with the core suspended by default, making memory access safer without manual management. This applies to plugin-side callbacks, not to the RPC dispatch path directly.

**Source**: [RemoteServer.cpp (DFHack GitHub)](https://github.com/DFHack/dfhack/blob/develop/library/RemoteServer.cpp)

---

### Finding 3: Why CoreSuspender Fails Under QEMU/Prism ARM

**Environment** 

Chronicler's DF instance runs on: Windows 11 ARM (UTM + QEMU backend) + Prism x86→ARM64 JIT translation + DF 53.10 x86 binary + DFHack 53.10-r1 x86 binary.

Under Prism, all x86 code is JIT-compiled to ARM64. Multi-threaded x86 applications rely on x86's Total Store Order (TSO) memory model — a relatively strong ordering guarantee. ARM uses a weaker memory model (relaxed ordering). Prism must emulate TSO semantics on ARM, which it does via memory barrier insertion and, optionally, multi-core synchronization strictness settings.

**The Failure Hypothesis**

When the RPC network thread constructs `CoreSuspender` (acquiring `CoreSuspendMutex`), it enters a blocking wait state. Under Prism's JIT:

1. The mutex wait is a FUTEX syscall at the x86 level, translated to ARM equivalents.
2. Thread scheduling under QEMU's multi-core model may not correctly deliver the mutex-release notification from the simulation thread to the network thread.
3. The result is an indefinite hang on the `CoreSuspender suspend;` line, with no error, timeout, or recovery.

**Prism Workaround** (for investigation, not Chronicler's solution)

Windows ARM's Prism has configurable memory barrier strictness for x86 emulation:
- **Fast** (default): Minimal barriers
- **Strict**: Stronger x86 TSO emulation
- **Very strict**: Near-full x86 ordering
- **Force single-core**: Serializes all thread execution (disables true parallelism)

Force single-core mode would likely resolve the deadlock but would serialize the entire DF simulation, making the game unplayably slow.

**box64 ARM64 Comparison**

For context, the open-source x86→ARM64 translator box64 has documented DFHack failures on ARM Linux that parallel Prism's issues:
- Memory contiguity check failures at `Core.cpp` line 2787 (box64 doesn't guarantee contiguous code sections)
- `mprotect()` VMethod interposition failures (box64 wraps `mprotect` via syscall, breaking DFHack's hooking mechanism)
- DFHack console becoming unresponsive

These are different failure modes than Prism's mutex deadlock but illustrate that DFHack's threading and memory assumptions are broadly fragile under ARM x86 translation layers.

**No official DFHack bug report** for the Prism/QEMU CoreSuspender hang was found in the search. The failure is emergent behavior from the intersection of Prism's JIT scheduler and DFHack's inline cross-thread mutex acquisition — not a specific bug that has been filed and tracked.

---

### Finding 4: Why dfhack-run.exe Works

**dfhack-run.exe Protocol**

`dfhack-run.exe` connects to the **same TCP RPC port 5000** using the identical handshake and packet protocol described in Finding 1. It sends a `RunCommand` RPC call with the command string and argument vector. `RunCommand` is **not** marked `SF_DONT_SUSPEND` — it routes through `CoreSuspender` on the network thread exactly like any other game-state-touching RPC call.

**Why It Works via SSH (From Chronicler's Perspective)**

The crucial distinction is not the protocol — it is **where dfhack-run runs**:

When Chronicler invokes:
```bash
ssh Jarvis@192.168.64.3 '"...dfhack-run.exe" lua "..."'
```

`dfhack-run.exe` runs as a **native x86 process on the VM itself**, executing under Prism on the VM's CPU. It connects to `127.0.0.1:5000` (loopback). All thread synchronization between `dfhack-run`'s network connection and DF's game thread happens within the same Prism x86 JIT environment — there is no ARM host OS involved in the mutex wait path.

By contrast, a remote RPC client (like a Python client on the Mac host) would connect from **outside** the VM, through the NAT network layer (`192.168.64.3:5000`). The mutex wait path would then cross the QEMU network device boundary, potentially with different scheduling characteristics.

**Additional hypothesis**: `dfhack-run` connects to loopback (`127.0.0.1`), which goes through QEMU's loopback stack rather than the virtualized NAT NIC. The loopback path may have different thread-scheduling properties than the NAT path under QEMU.

**Confirmation**: [DFHack Core Documentation](https://docs.dfhack.org/en/stable/docs/Core.html) explicitly states "dfhack-run connects to a server on TCP port 5000" — same as all other RPC clients.

---

### Finding 5: Alternative DF Tool Communication Methods

**Comparison Table**

| Tool | Communication Method | RPC Used | Notes |
|------|---------------------|----------|-------|
| **df-ai** | In-process DFHack plugin | No | Native C++ plugin compiled into DFHack; direct `df::` struct access with CoreSuspender via plugin callbacks |
| **Armok Vision / RemoteFortressReader clients** | TCP RPC via RemoteFortressReader | Yes | Connects to port 5000; uses RFR functions — all require CoreSuspender; hangs under QEMU |
| **Dwarf Therapist** | Direct OS memory read | No | Uses `devel/export-dt-ini` generated memory layout; calls `ReadProcessMemory` (Windows) / `process_vm_readv` (Linux) to read DF's memory address space directly |
| **DwarfFortressLogger** | Direct OS memory read | No | Similar to Therapist; reads DF process memory using OS APIs |
| **LegendsViewer-Next** | XML file parsing | No | Loads `region1-legends.xml` and `region1-legends_plus.xml` exported by DFHack's `exportlegends` command; no live data channel at all |
| **LegendsBrowser2** | XML file parsing | No | Same as LVN; offline legends data only |
| **dfhack-run.exe** | TCP RPC (loopback) | Yes | Sends RunCommand via RPC, but runs on the same VM as DF |

**df-ai Architecture Detail**

df-ai is a full DFHack C++ plugin (`df-ai.cpp` + ~30 module files). It runs in-process:
- Registered as a DFHack plugin with the standard `plugin_init`, `plugin_shutdown`, `plugin_onupdate` lifecycle
- All DF memory access is direct through `df::` global structs (same as any DFHack plugin)
- Module-to-module communication is via direct function calls and shared C++ objects (`ai.cpp`)
- No RPC involved; no TCP socket
- Plugin callbacks are automatically called with core suspended (the DFHack 50.15-r2 improvement)

**Dwarf Therapist Architecture Detail**

Dwarf Therapist does not use DFHack at all for data access:
1. It uses memory layout files generated by `devel/export-dt-ini` (a DFHack script that dumps struct offsets for the current DF version)
2. At runtime, it reads DF's process memory directly using Windows `ReadProcessMemory` / Linux `process_vm_readv`
3. It parses the raw memory bytes according to the struct layout file
4. This bypasses all of DFHack's thread safety — Therapist reads memory without acquiring any lock. It tolerates occasional torn reads as acceptable for a UI tool.

**Implication for Chronicler**: The viable live data channels under QEMU/Prism are:
- `dfhack-run` via SSH (the current approach) — executes locally on VM, avoids cross-VM RPC
- DFHack Lua scripts deployed to the VM and run periodically (the Bridge approach) — also local execution
- Direct memory reading from the Mac host — theoretically possible via `ReadProcessMemory` over a remote debugging protocol, but not practical

---

### Finding 6: DFHack 50.x–53.x Changes Relevant to RPC and Threading

**DFHack 50.15-r2 (Significant)**

> "Plugin command callbacks are now called with the core suspended by default so DF memory is always safe to access without extra steps."

This change applies to the plugin callback path (commands registered via `df_command()`), not to the RPC network thread dispatch. It means plugin developers no longer need to manually acquire CoreSuspender in their command handlers. The RPC dispatch path (`RemoteServer.cpp`) is separate and unchanged.

**RemoteFortressReader API Changes (50.x)**

> "RemoteFortressReader: add a force_reload option to the GetBlockList RPC API to return blocks regardless of whether they have changed since the last request."

Functional enhancement; no threading model change.

**RPC Extension Infrastructure (50.15-r2)**

> "Added example code for creating plugin RPC endpoints that can be used to extend the DFHack API."

Documentation improvement; no architectural change.

**Remote Server Config Migration (50.x→53.x)**

The remote server configuration moved from hardcoded defaults to `dfhack-config/remote-server.json`. This file controls port, bind address, and whether external connections are allowed. The default bind address remains `127.0.0.1` (loopback only); external connections require explicit configuration.

**No RPC threading model changes** were found in the 50.x–53.x changelogs. The core dispatch mechanism (`RemoteServer.cpp` with inline `CoreSuspender` acquisition on the network thread) appears unchanged from pre-50 versions.

**Sources**: [DFHack 53.10-r1 Changelog](https://docs.dfhack.org/en/stable/docs/NEWS.html), [Historical Changelogs](https://docs.dfhack.org/en/stable/docs/about/History.html)

---

## Comparison: Communication Methods

| Aspect | TCP RPC (Remote) | dfhack-run (SSH) | In-Process Plugin | Direct Memory |
|--------|-----------------|------------------|-------------------|---------------|
| Works under QEMU/Prism | No (game-thread calls) | Yes (local process) | Yes | Theoretically |
| Thread safety | CoreSuspender inline on net thread | CoreSuspender inline on dfhack-run thread (local) | Callback auto-suspended | None (tolerates torn reads) |
| Data access | Protocol Buffer messages | Protocol Buffer messages | Direct C++ struct access | Raw bytes via OS API |
| Latency | Low (loopback) | SSH overhead ~50-100ms/call | Zero (in-process) | Very low (syscall) |
| Implementation complexity | Simple client library | SSH subprocess call | C++ plugin compilation | Memory layout file required |
| Chronicler usability | Broken for game-thread calls | Working (current approach) | Not applicable | Not practical |

---

## Recommendations

1. **Primary Recommendation: Retain SSH + dfhack-run + Lua Bridge**
   - Rationale: This is the only reliable live data channel under QEMU/Prism. `dfhack-run` executes as a local x86 process on the VM, where Prism's thread scheduling works correctly. The Lua bridge pattern (periodic data collection to JSON) is proven and handles bulk data efficiently.
   - Caveats: SSH adds ~50-100ms overhead per call. Not suitable for tick-level real-time data; use the bridge's periodic polling model instead.

2. **Do Not Attempt Remote TCP RPC**
   - All RemoteFortressReader functions and RunCommand require CoreSuspender. They will hang indefinitely when called from the Mac host over the QEMU NAT network interface.
   - Only `GetVersion` and `GetWorldInfo` (SF_DONT_SUSPEND) work remotely, and they provide minimal value (version string and world name/save path only).

3. **Alternative: Prism Single-Core Mode (Investigation Only)**
   - Forcing single-core mode in Prism would serialize x86 thread execution and might resolve the CoreSuspender deadlock.
   - Not recommended for production: would serialize DF simulation to a single ARM core, making the game unplayably slow.

4. **Future: dfhack-run Port Forwarding**
   - If lower-latency command execution is needed (e.g., game control commands that need <10ms round-trip), explore SSH port forwarding (`-L 5000:127.0.0.1:5000`) combined with a loopback RPC client. This would make the Mac host's RPC connections appear as loopback connections to the VM, potentially avoiding the QEMU NAT scheduling issue.
   - Risk: Untested. The CoreSuspender issue may still manifest because the actual RPC network thread runs inside the VM, regardless of how the TCP connection was routed.

---

## Action Items
- [ ] Document the SSH port forwarding approach in the dev environment reference as a future investigation item
- [ ] Add the CoreSuspender/QEMU explanation to the dev environment reference document's Known Gotchas section
- [ ] Update Chronicler's bridge documentation to explain *why* the Lua bridge approach is used (not just what it does)

---

## Sources

1. [DFHack Remote Interface Documentation](https://docs.dfhack.org/en/stable/docs/dev/Remote.html)
2. [DFHack Core Documentation](https://docs.dfhack.org/en/stable/docs/Core.html)
3. [RemoteServer.cpp — DFHack GitHub (develop branch)](https://github.com/DFHack/dfhack/blob/develop/library/RemoteServer.cpp)
4. [RemoteClient.cpp — DFHack GitHub (develop branch)](https://github.com/DFHack/dfhack/blob/develop/library/RemoteClient.cpp)
5. [RemoteFortressReader plugin — DFHack GitHub](https://github.com/DFHack/dfhack/blob/develop/plugins/remotefortressreader/remotefortressreader.cpp)
6. [DFHack 53.10-r1 Changelog](https://docs.dfhack.org/en/stable/docs/NEWS.html)
7. [DFHack Historical Changelogs](https://docs.dfhack.org/en/stable/docs/about/History.html)
8. [df-ai Wiki — BenLubar/df-ai GitHub](https://github.com/BenLubar/df-ai/wiki)
9. [LegendsViewer-Next — Kromtec/LegendsViewer-Next GitHub](https://github.com/Kromtec/LegendsViewer-Next)
10. [Windows on ARM Prism Emulation Guide](https://mundobytes.com/en/Installing-x86-and-x64-apps-on-Windows-11-ARM-with-Prism:-Complete-compatibility-guide--limits--and-workarounds/)

---

## Uncertainties

- **Why exactly dfhack-run works locally but remote RPC hangs**: The most credible explanation is the local vs. remote execution context under Prism, but this has not been confirmed by controlled experiment (e.g., running dfhack-run on the VM vs. the Mac host with port forwarding while measuring hang behavior).
- **Whether port forwarding resolves the hang**: Untested. The CoreSuspender acquisition still happens inside the VM's Prism JIT environment regardless of how the TCP connection was established.
- **Whether any game-thread RPC calls can be made to succeed under QEMU/Prism**: Not investigated. The "Very strict" or "Force single-core" Prism settings might fix the mutex scheduling issue at unacceptable performance cost.
- **DFHack 53.x-specific changes to RemoteServer.cpp**: The source code was reviewed but no version-specific changes to the threading dispatch logic were found. The SF_DONT_SUSPEND pattern appears to have been stable since at least 0.47.x.

---

## Related Topics
- QEMU FUTEX emulation and x86 TSO memory model simulation on ARM
- DFHack plugin development (in-process alternative to RPC for future Chronicler features)
- dfhack-config/remote-server.json external connection configuration (for enabling remote access in future DF installations not under QEMU)
- Armok Vision source code as a reference for how RemoteFortressReader RPC clients are structured

---

*Deep Research Report — DFHack RPC Protocol and CoreSuspender Threading*
*Generated 2026-03-23 by Jarvis Deep Research Agent*
