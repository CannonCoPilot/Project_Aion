# Research Report: DFHack on Windows 11 ARM (Prism x86-64 Emulation)

**Date**: 2026-02-24
**Scope**: Whether DFHack 53.10-r1 works on Windows 11 ARM (Prism x86-64 emulation), including architecture availability, community reports, and emulation compatibility risks for memory-introspection tools.

---

## Executive Summary

DFHack 53.10-r1 ships **x86-64 Windows and x86-64 Linux builds only** — there is no ARM build for either platform. Dwarf Fortress itself explicitly states "ARM versions of Windows will not be able to run DF," meaning the game and DFHack must run through Prism's x86-64 emulation layer.

The good news is that DFHack's attachment mechanism is architecturally clean for this scenario: it runs **in-process** by replacing SDL.dll rather than using kernel-mode drivers or external injection. Prism supports user-mode x86-64 emulation with high fidelity in Windows 11 24H2+, including new AVX/AVX2 instruction support as of late 2024. Because DFHack requires no kernel drivers and no cross-architecture DLL loading, it avoids the main class of tools that break on ARM.

However, **no one has publicly documented testing DF + DFHack under Windows 11 ARM Prism emulation**. The closest analogues (Wine x86-64, UTM nested emulation) suggest it is plausible but untested. For the UTM VM use case specifically, a further complication is that UTM on Apple Silicon runs Windows 11 ARM as a guest, which then uses Prism to emulate x86-64 — a double-translation chain with no GPU acceleration that will degrade performance.

---

## Key Findings

### Finding 1: DFHack Has No ARM Build — x86-64 Only

DFHack 53.10-r1 (released January 12, 2026) provides binary releases for:
- Windows 64-bit (x86-64)
- Linux 64-bit (x86-64)

No ARM variants exist for either platform. The official documentation states: "DFHack supports all operating systems and platforms that Dwarf Fortress itself supports, which at the moment is the 64-bit versions of Windows and Linux." The build system documents M1 (Apple Silicon) support for macOS only, but no Windows ARM or Linux ARM64 targets.

The DFHack GitHub issues tracker shows no open issues requesting Windows ARM or Linux ARM64 builds (search returned zero results for ARM/aarch64 in issue context).

**Sources**:
- [DFHack 53.10-r1 Installing docs](https://docs.dfhack.org/en/53.10-r1/docs/Installing.html)
- [DFHack Compilation docs](https://docs.dfhack.org/en/stable/docs/dev/compile/Compile.html)
- [DFHack releases page](https://github.com/DFHack/dfhack/releases)

---

### Finding 2: Dwarf Fortress Itself Explicitly Excludes ARM Windows

The Dwarf Fortress Wiki system requirements page states plainly: **"32-bit and ARM versions of Windows will not be able to run DF."**

This means both DF and DFHack must run under Prism's x86-64 emulation on any Windows 11 ARM device. There is no native ARM path.

**Source**: [Dwarf Fortress Wiki — System Requirements](https://dwarffortresswiki.org/index.php/System_requirements)

---

### Finding 3: DFHack's Attachment Mechanism is In-Process and Kernel-Free

This is the critical architectural finding for emulation compatibility. DFHack attaches to Dwarf Fortress via two mechanisms:

1. **SDL.dll replacement** (Windows): DFHack replaces `SDL.dll` in the DF install directory with its own version. When DF starts, it loads this modified SDL, which bootstraps DFHack into the same process.
2. **LD_PRELOAD** (Linux): DFHack shadows SDL API calls at the dynamic linker level.
3. **dfhooks callback API**: DF explicitly calls into DFHack at initialization and main-loop points.

Critically: DFHack runs **in the same process as DF**, requiring no external process attachment, no kernel-mode drivers, and no cross-architecture DLL loading. It intercepts DF's C++ virtual method dispatch tables and reads DF's memory directly from within the process address space.

This is important because Prism's main incompatibility class — "kernel mode components must be compiled as Arm64, no emulation exists in the kernel" — does not apply to DFHack. DFHack is entirely user-mode.

**Sources**:
- [DFHack Dev Intro docs](https://docs.dfhack.org/en/stable/docs/dev/Dev-intro.html)
- [DFHack/Installation — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Utility:DFHack/Installation)

---

### Finding 4: Prism x86-64 Emulation Capabilities and Limits (Windows 11 24H2+)

**What works:**
- Full user-mode x86 and x64 instruction translation via JIT compilation
- AVX and AVX2 support added in the late 2024 Prism update (previously a major gap)
- No special configuration needed — emulation is transparent to the app
- x64 apps see the full filesystem and registry without redirection (no WOW64 layer for x64)
- Apps don't detect they're emulated unless they call specific detection APIs
- Translated code blocks are cached per-module for subsequent launches

**What does NOT work:**
- Kernel-mode drivers — must be native Arm64 (no emulation in the kernel)
- Mixed-architecture DLL loading within a process (x86-64 process cannot load Arm64 DLL and vice versa)
- Applications that install capture drivers, low-level AV, or file filters

**For DFHack specifically**: DFHack is a user-mode x86-64 DLL loaded into an x86-64 DF process. Both DF and DFHack's SDL.dll replacement are x86-64, so there is no cross-architecture mismatch. Prism handles the entire process as a unit of x86-64 code. This is exactly the clean case that Prism is designed to handle.

**Sources**:
- [Microsoft: How emulation works on Arm](https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation)
- [Windows on ARM runs more apps with new Prism update](https://techcommunity.microsoft.com/blog/windowsosplatform/windows-on-arm-runs-more-apps-and-games-with-new-prism-update/4475631)
- [Windows Central: More x86 apps with Prism update](https://www.windowscentral.com/microsoft/windows-11/your-windows-11-on-arm-pc-can-now-run-even-more-x86-apps-and-games-thanks-to-microsofts-latest-prism-emulation-update)

---

### Finding 5: No Community Reports of DF + DFHack on Windows 11 ARM

An exhaustive search across GitHub issues, Reddit, Steam discussions, and Bay12 forums returned **zero reports** of anyone running Dwarf Fortress or DFHack on:
- Physical Windows 11 ARM hardware (Surface Pro X, Snapdragon X devices, Dev Kits)
- UTM (Windows 11 ARM guest on Apple Silicon)
- Parallels (Windows 11 ARM guest on Apple Silicon)

The Bay12 forums do contain a thread titled "Dwarf Fortress on Windows Surface?" but this predates the ARM Surface Pro era. No Steam community DFHack discussions mention ARM.

The absence of reports is itself informative: the DF community is primarily on x86-64 machines. ARM Windows users who game do so primarily on consumer Copilot+ PC devices (Surface Pro 11, Snapdragon X Elite laptops) released 2024+, and DF is not a mainstream title for that market segment.

---

### Finding 6: UTM Nested Emulation — Additional Complications

If the intended deployment is **UTM on Apple Silicon running Windows 11 ARM**, the chain becomes:

```
Apple Silicon (ARM64) hardware
  → UTM QEMU virtualization (near-native for ARM guests)
    → Windows 11 ARM guest OS
      → Prism x86-64 emulation
        → Dwarf Fortress + DFHack (x86-64)
```

Additional UTM-specific issues:
- **No GPU acceleration**: UTM currently lacks Direct3D/Metal GPU passthrough for Windows guests. DF uses software rendering fallback, which works but at reduced performance.
- **Performance overhead**: Nested translation (Prism inside a VM) incurs additional latency. DF is CPU-bound and single-threaded in its simulation loop, so this may be noticeable.
- **UTM's ARM virtualization**: UTM uses QEMU's ARM64 virtualization for Windows ARM guests, which runs near-native speed. The x86-64 emulation overhead is then added on top by Prism inside the guest. This is faster than having UTM emulate x86-64 directly (which would be single-core and extremely slow).

**Sources**:
- [UTM Windows 11 ARM gallery](https://mac.getutm.app/gallery/windows-11-arm)
- [UTM Windows 11 documentation](https://docs.getutm.app/guides/windows/)

---

### Finding 7: Analogous Memory-Introspection Tools Under Emulation

Cheat Engine 7.6 (February 2025) explicitly includes ARM/ARM64 CEServer files, indicating the Cheat Engine project is aware of ARM deployment. However, Cheat Engine on Windows ARM running x86-64 games under Prism has not been publicly documented as working or failing.

The closest analogue to DFHack's approach (in-process DLL, no kernel driver) is Wine's x86-64 emulation via Rosetta 2 on Apple Silicon — the DF Wiki mentions "Apple Silicon (ARM-based) users have had some success running Dwarf Fortress through Wine's x86-64 emulation (Rosetta 2)." This is a positive signal: if DF works under Wine+Rosetta2 (which also emulates x86-64 in user space), the analogous Prism scenario is plausible.

**Source**: [Dwarf Fortress Wiki — System Requirements](https://dwarffortresswiki.org/index.php/System_requirements)

---

## Comparison: Deployment Scenarios for DF + DFHack on ARM

| Scenario | Architecture | DFHack Expected to Work | Risk Level | Notes |
|----------|-------------|------------------------|------------|-------|
| Native x86-64 Windows | x86-64 (bare metal) | Yes (proven) | None | Baseline |
| Windows 11 ARM, Prism (bare metal Snapdragon) | ARM64 + Prism | Likely | Low | All user-mode; no kernel driver needed |
| UTM on Apple Silicon, Win11 ARM guest + Prism | ARM64 VM + Prism | Plausible | Medium | No GPU accel; double-translation |
| Parallels on Apple Silicon, Win11 ARM guest + Prism | ARM64 VM + Prism | Plausible | Low-Medium | Better GPU support than UTM |
| UTM x86-64 direct emulation | x86-64 QEMU | Likely but slow | High-perf | Single-core QEMU, very slow |

---

## Recommendations

1. **Primary Recommendation — Test on physical bare-metal Windows 11 ARM (Snapdragon X device) first.**
   - Rationale: Prism is mature on Snapdragon X hardware with 24H2. DFHack's in-process user-mode architecture is exactly what Prism is designed to handle. The risk of incompatibility is low.
   - How to test: Install DF Classic from Bay12 + DFHack manually (not Steam, as Steam adds another layer). Verify dfhooks loads and DFHack console appears.
   - Caveats: No one has publicly documented this. Treat it as an experiment.

2. **For UTM specifically:**
   - Run Windows 11 ARM (not x86-64 Windows) in UTM. This gives near-native ARM64 VM performance, with Prism handling the x86-64 translation inside the guest.
   - Do NOT attempt to run x86-64 Windows in UTM directly — QEMU's x86-64 emulation on ARM is single-core and too slow for DF gameplay.
   - Accept that there is no GPU acceleration in UTM — DF Classic (ASCII) is unaffected; DF Premium (tile graphics) may have issues.
   - DFHack's RPC functionality (TCP port 5000) should be unaffected by the emulation layer — network I/O is not emulation-sensitive.

3. **Fallback: Linux x86-64 in UTM.**
   - UTM can run x86-64 Linux with QEMU. DF and DFHack have native Linux x86-64 builds. This avoids Prism entirely.
   - Trade-off: Requires managing a Linux guest instead of Windows, but this is a cleaner isolation from ARM compatibility questions.

---

## Action Items
- [ ] Test DF + DFHack install on a Windows 11 ARM machine with Prism (Snapdragon X Elite laptop or dev kit if available)
- [ ] If UTM deployment is the target, install Windows 11 ARM (not x86-64) as the guest
- [ ] Verify DFHack console appears on first launch — this confirms dfhooks/SDL.dll hook loaded successfully
- [ ] Test RPC connectivity: `dfhack-client-python` from host connecting to VM TCP 5000
- [ ] If graphics are needed, evaluate Parallels over UTM for GPU support

---

## Sources

1. [DFHack 53.10-r1 Installing docs](https://docs.dfhack.org/en/53.10-r1/docs/Installing.html)
2. [DFHack Compilation docs](https://docs.dfhack.org/en/stable/docs/dev/compile/Compile.html)
3. [DFHack releases page — GitHub](https://github.com/DFHack/dfhack/releases)
4. [DFHack Dev Intro (attachment architecture)](https://docs.dfhack.org/en/stable/docs/dev/Dev-intro.html)
5. [Dwarf Fortress Wiki — System Requirements (ARM note)](https://dwarffortresswiki.org/index.php/System_requirements)
6. [DFHack/Installation — Dwarf Fortress Wiki (SDL.dll mechanism)](https://dwarffortresswiki.org/index.php/Utility:DFHack/Installation)
7. [Microsoft: How emulation works on Arm (Prism docs)](https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation)
8. [Windows on Arm runs more apps with new Prism update](https://techcommunity.microsoft.com/blog/windowsosplatform/windows-on-arm-runs-more-apps-and-games-with-new-prism-update/4475631)
9. [Windows Central: Prism update adds AVX/AVX2 support](https://www.windowscentral.com/microsoft/windows-11/your-windows-11-on-arm-pc-can-now-run-even-more-x86-apps-and-games-thanks-to-microsofts-latest-prism-emulation-update)
10. [Microsoft: Add Arm support to Windows apps (kernel driver limitations)](https://learn.microsoft.com/en-us/windows/arm/add-arm-support)
11. [DirectX Dev Blog: ARM gaming progress 2024](https://devblogs.microsoft.com/directx/step-forward-for-gaming-on-arm-devices-2024/)
12. [UTM Windows 11 ARM gallery page](https://mac.getutm.app/gallery/windows-11-arm)
13. [UTM Windows 11 documentation](https://docs.getutm.app/guides/windows/)
14. [Thurrott: Quick Hands-On UTM + Windows 11 ARM](https://www.thurrott.com/windows/windows-11/301460/quick-hands-on-macbook-air-m3-utm-windows-11-on-arm)

---

## Uncertainties

- No one has publicly confirmed DF + DFHack working on Windows 11 ARM under Prism (neither confirmed nor denied).
- Unknown whether Steam's overlay and DRM layer for DF Premium introduces additional x86-64/ARM compatibility complications on top of Prism.
- UTM GPU acceleration status may change — check UTM release notes for current Windows guest GPU support before deployment.
- Prism's JIT cache may behave unexpectedly for self-modifying code patterns (DFHack modifies DF's vtable entries at runtime). This is a low-probability risk but unconfirmed.

---

## Related Topics

- Linux ARM64 native DF build (Bay12 has not published one as of writing)
- Parallels Desktop ARM vs UTM for Windows gaming workloads
- Wine + Proton for DF on Apple Silicon (Rosetta2 path)
