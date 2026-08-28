# Insights Archive — 2026-08-21
# Rotated: 2026-08-22T04:55:35Z (12 entries)

### 2026-07-18 [71822359565b]

The roadmap is a *buildable-spec* document: every Phase 0/1 item carries an **acceptance criterion that proves it** (honoring No-Silent-Degradation), and it explicitly holds itself to "a fresh session could build Phase 0 from this without asking a question." My session's work maps directly onto **0.3(c)** — "Namespace JICM state + durable-state per lane (W0 vs dev)" — whose acceptance criterion is "*W0 state provably uncontaminated across a mixed session.*" I proved exactly that (W0 checkpoint md5 byte-identical across a dev prep run). And **0.3(d)** — the `refresh --fire` actuator — is now built and gated. The honest move, which the document itself demands, is to update it to reflect verified reality.

### 2026-07-18 [c3a83cd32edc]

**0.3(b) is a robustness fix, not an overflow bug.** W0 runs Fable-5, and `jicm-gate.sh` has no `*fable-5*` arm — so it falls to the `*) WINDOW=1000000` default. But **1M is Fable-5's actual window**, so the default is *accidentally correct*: W0 is **not** at risk of overflowing before JICM fires. What remains is legibility/robustness — JICM *defaults* to 1M rather than *recognizing* Fable-5, and the model extraction can whiff to `<synthetic>` (which I saw live). The fix is to add an explicit `*fable-5*|*mythos-5*` arm and harden the model-id extraction so the window is derived from a real model string. Valuable, but **not urgent** — it doesn't gate anything the way I feared.

### 2026-07-18 [0392471ee9f7]

**The `<synthetic>` tail also zeroes the token count** — and this is almost certainly why W0's state read `tokens:0` earlier. The usage extraction (`jicm-gate.sh:112`) takes the *last* assistant message's `.message.usage`, but a synthetic tail message has no `usage` → `null` → **tokens=0**, so JICM goes blind to W0's real context size exactly when a synthetic message lands last. My model-extraction fix skips synthetic; the usage extraction must do the same, or the model reads right while the tokens read zero.

### 2026-07-18 [937f50412153]

The w/vv call turned out to be **three faces, not two**: roman body=`w`, italic=`w` (NT) / `vv` (OT), and **display titling caps=`VV`** (a distinct fount with no W). The trap is that a roman w-sort is physically *cut* as two overlapping v's, so at high zoom it looks identical to genuine `vv` — over-zooming past ~5× at 400 DPI just pixelates and proves nothing. The reliable test is a capital-W at 2–5× gestalt.

### 2026-07-18 [35766678dd90]

Sound scratchpad pruning drops **completed-work narrative and delivery manifests** (recoverable from disk/git/provenance) while keeping **forward plan + live infra + "don't re-derive" findings**. The stale material here: the per-locus GT manifest, KEY CORRECTION #1/#2 (now baked into GT provenance), the tool-hardening blow-by-blow (now in the code), and the argument-p104 apply narrative. The one live decision-point buried in that block — *roman-lowercase w/vv awaiting Sir's ratification* — gets promoted up into DURABLE FINDINGS so it survives the prune.

### 2026-07-18 [063d206730b6]

**Two prior design generations are in tension, and reconciling them IS the design.** The v8 doc argues JICM should become *thin per-session hooks + prep script, no watcher, no tmux* — because (it claims) the hook stdin payload carries a full `context_window` object, making per-session sensing native. It even pre-identifies my exact namespacing fix (§6: "per-session state files via `session_id` suffix"). **But** the *current, working* `jicm-gate.sh` header explicitly says the opposite — "context_window is NOT in any hook event's stdin; the JSONL transcript is canonical." And critically, v8 admits **a hook cannot invoke `/clear` programmatically** — so v8 relies on a *human* to clear, which is impossible for autonomous chains/Protos. That's precisely why the tmux send-keys actuator (my `jicm-self.sh`) is non-negotiable for the multi-session/chain requirement.

### 2026-07-18 [af3174114ef4]

The current Claude Code hooks doc confirms hook stdin carries **only** `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode` (+ `prompt` on UserPromptSubmit, and notably **`model`** on SessionStart) — **no `context_window`, no token count** anywhere. So the v8 design's founding premise ("read context_window from hook stdin, delete the watcher") was **wrong**; the working v7.9 `jicm-gate` is right to parse the JSONL transcript. The upside: each session's UserPromptSubmit hook receives *its own* `transcript_path`, so **per-session sensing is already native** — the only fix is namespacing the output by `session_id` (which the v8 doc itself flagged as the multi-session fix). And v8's fatal limitation — **a hook cannot invoke `/clear`** — is exactly why the tmux send-keys actuator I built (`jicm-self.sh`) is non-negotiable for autonomous chains/Protos.

### 2026-07-18 [b6955bb53aa8]

The keystone that makes this whole design safe is one function: `jicm_key_paths`. Because `key=w0` returns the *exact* legacy paths, every subsequent generalization — the gate writing `JK_STATE`, the actuator preparing `JK_COMPRESSED` — is automatically a no-op for W0 until we deliberately migrate it in Phase 3. The unified system and the untouched-W0 guarantee coexist through a single conditional.

### 2026-07-18 [791780d96e5d]

Your genesis-16 hand-pass is the proof: the **same word is set both ways on one page** — `law`/`lawful` is `w` in some lines and `vv` in others, and L43 keeps `vvere` but changes `vviues→wiues` on a *single line*. The compositor just grabbed whichever sort was in the case. So there is **no lexical or positional rule** — an OCR must classify each w-glyph **visually by stroke connectivity** (joined = `w`, gapped = `vv`) and must **not** dictionary-normalize, or it erases the genuine-`vv` minority you preserve.

### 2026-07-18 [98c0b4f34a7e]

**Two migration seams I must sequence carefully.** The dev lane's *working* signal/checkpoint paths (`.jicm-clear-now.dev.signal`, `.compressed-context-ready.dev.md`) differ from what `jicm_key_paths dev` now returns (`jicm/signals/clear-now.dev.signal`, `jicm/checkpoints/dev.compressed.md`). The actuator (step 1) writes the *new* paths; `session-start.sh` (step 3) must read the *new* paths. They move together — and because live-fire stays **gated** in Phase 1, there's no window where a half-migrated dev lane fires against mismatched paths. This is why the phase order (actuator → session-start → *then* canary-fire) is a safety property, not just tidiness.

### 2026-07-18 [045abf2e96d4]

This is the classic `${v:+X}${v:-Y}` trap. I wanted "basename if set, else `<unresolved>`". But `:+` yields `X` when set **and** `:-` yields the *variable's value* when set (`:-` only substitutes `Y` when **unset/empty**). So for a set variable both halves expand: basename **+** full path. The fix is a plain `if`. It's display-only (the real `TRANSCRIPT` var is correct — the cycle fired the right paths), but in a project whose whole thesis is *legibility*, a lying status line is worth fixing.

### 2026-07-18 [78a74a044bd1]

This is the *intended* consequence of the finding-1 fix, not a regression. My harness2 "unknown session" test fired `gate` with **no** `JARVIS_WINDOW` and **no** role, and asserted it namespaces to `session_id`. But the finding-1 fix *deliberately* maps unset-window-non-dev → `w0` (the recovery path — a W0 session resumed outside the launcher has no `JARVIS_WINDOW` but is still W0). In the Jarvis hook domain (only w0 + dev exist), an unset-window non-dev session *is* W0, so routing it to the legacy file is correct — and matches pre-v9 behavior. The test's expectation is what's stale: a *genuine* stray needs an explicitly-set non-zero window (`JARVIS_WINDOW=7`), which doesn't occur in this domain. The real anti-contamination invariant (**dev** never touches W0) still holds.

