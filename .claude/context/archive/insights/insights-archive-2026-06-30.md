# Insights Archive — 2026-06-30
# Rotated: 2026-06-30T14:31:20Z (4 entries)

### 2026-06-15 [9254dab90de2]

On a **subscription** plan (Max/Team), a per-request dollar cost genuinely *does not exist* as a server-side fact — you pay a flat monthly fee and Anthropic meters consumption as a **percentage of opaque rolling windows**, deliberately not exposing the underlying token-budget size or any dollar figure. So a tokens→$ table isn't just unreliable, it's measuring a quantity the billing model doesn't have. `unified_5h/7d_utilization` *is* the canonical "spend" signal — and the proxy already captures both into dedicated columns. This empirically vindicates the earlier `cost_usd = NULL` decision: there was never a header to wire in.

### 2026-06-15 [5b96161e5d03]

- The fix is a one-line **copy-on-read** instead of mutate-shared-state: `[{**chunk, "masked": False} for chunk in chunks]`. A shallow dict copy is enough because LASTZ only *reads* the inner `start`/`end`/`words` values — it never mutates them, so sharing those references is safe and cheap.
- This preserves the original author's intent (LASTZ should see full unmasked text) while eliminating the cache aliasing bug. The masked cache stays intact for metrics 2-4.

### 2026-06-15 [fabb12ab1822]

This also explains a blind spot from earlier in our session: every `tsc --noEmit` I ran reported "clean" — but the root `tsconfig.json` has `"files": []` and doesn't follow project references, so plain `tsc --noEmit` was **checking nothing**. Only `tsc -b` (build mode) actually typechecks the source. My TypeScript verifications during the W-fixes were therefore weaker than I represented them — the code changes were small and correct, but "tsc clean" overstated the evidence. I've saved this as a memory so I won't repeat the false-clean claim in future Palimpsest work.

### 2026-06-15 [0f0983e45d87]

The claim "build red is NOT caused by my work" is **partially inaccurate**. Two distinct error classes are conflated: (1) `JSX`-namespace errors are a real project-wide React-19 migration debt that predates the sprint, but (2) the `TS6133` unused-symbol errors sit in files the sprint rewrote (`DotplotView` grew 465 lines) — those are sprint-introduced dead code. With `noUnusedLocals` on, both classes equally block `npm run build`. The honest framing: the sprint didn't break a previously-green build, but it did add new dead-code errors it didn't clean up.

# Insights Archive — 2026-06-30
# Rotated: 2026-06-30T17:40:16Z (1 entries)

### 2026-06-15 [7f4540da37fb]

This fix has a **skeptical edge-case risk worth flagging**: the guard is `parts[-1][-1] is non-space AND text_content[0].isalpha()`. That over-fires on **drop-cap / styled-initial** markup common in literary EPUBs — e.g. `<span class="dropcap">I</span>t was...` becomes NavigableStrings `"I"` + `"t was"` → inserts a space → **"I t was"**. So the fix trades under-spacing (KJV "hesaid") for potential over-spacing on chapter openings. Whether it bites depends on the corpus's markup. This is exactly the kind of thing that looks fixed in a unit test but shows up visually in the Reading tab.

# Insights Archive — 2026-06-30
# Rotated: 2026-06-30T22:01:27Z (3 entries)

### 2026-06-15 [dc76e0878d36]

**B4 (track-toggle performance) — the claimed fix is NOT in the committed code.** The checkpoint insight asserted components "now use `useTrackVisibility(name)` ... converts O(N) re-renders to O(1)." But `trackStore.ts` has **no such selector** — and W2's changelog says `useTrackVisibility` was "removed as dead code." Worse, `toggleTrack`/`toggleTrackByIndex` still replace the **entire `tracks` object** on every toggle (`{...state.tracks, [name]: {...}}`). Any component subscribing to `tracks` re-renders on every toggle — the exact O(N) cost the user reported as "very slow." The fix described in the insight either never landed or was reverted.

**B3 concatenation fix ships with zero test coverage.** The +19 lines in `test_ingest.py` are the W8 colophon tests — none exercise the inline-space-insertion logic or a "hesaid" case. So both the fix and my drop-cap edge case are unverified by the suite.

### 2026-06-15 [753829befdae]

This is the most consequential finding of the audit. The user reported a **specific behavioral regression** (track toggling "very slow," number-keys laggy). The sprint built the correct fix — a per-track boolean selector that would convert O(N)→O(1) re-renders — but never wired the consumers to it, leaving it as dead code. Then the warning-cleanup pass (W2) "resolved" the dead-code lint by **deleting the fix** rather than completing it. The net effect: the regression is fully intact in shipped code, while the changelog reads "fixed." This is a textbook case of why "validate expected results" must mean *running/reading the behavior*, not trusting the commit message.

### 2026-06-15 [080a17a6a7b7]

The throughline of this whole task: "the changelog says fixed" and "the code is fixed" are different claims. The sprint's W2 cleanup *deleted* the half-built perf fix to silence a dead-code lint, and the store refactor left three components reading a field that no longer existed — yet the audit notes read "fully remediated." The tsc errors weren't noise to suppress; two of them (`ProjectStoreState`) *were* the runtime bug. That's why "clean up the tsc errors" and "fix the regression" turned out to be the same task.

# Insights Archive — 2026-06-30
# Rotated: 2026-06-30T22:55:49Z (1 entries)

### 2026-06-15 [fecfbfb29636]

- **No backend restart needed for the deletion.** `list_projects` re-reads `workspace.iterdir()` on every request, so removing the directories made `/api/projects` return `[]` immediately — the API is stateless over the filesystem, which is why the empty state appeared without bouncing the server.
- **Two independent entry points, one handler.** Both the header **+Import** and the empty-state **Import a text** button call the same `setShowImport(true)`, so the wizard (`ImportDialog`) is guaranteed identical from either path — the screenshot confirms the Title/Author inputs, the "Select File (EPUB, TXT, PDF, HTML, Markdown)" button, and the ✕ close all render over the dark scrim.

# Insights Archive — 2026-06-30
# Rotated: 2026-07-01T00:16:31Z (1 entries)

### 2026-06-15 [25b1f72fe0c5]

- **`aria-modal="true"` is a promise to assistive tech**, not an enforcement mechanism: it tells screen readers the rest of the page is inert, but it doesn't trap keyboard focus or wire up Escape on its own. The two genuine behaviors that complete a modal — Esc-to-close and a focus trap (focus the dialog on open, restore on close, keep Tab within it) — are still JS, not ARIA.
- **A `role="dialog"` with no accessible name is itself an axe/Lighthouse violation**, which is why I added `aria-label` alongside the two attributes you asked for — otherwise the change would have traded one a11y warning for another.

# Insights Archive — 2026-06-30
# Rotated: 2026-07-01T04:20:12Z (1 entries)

### 2026-06-16 [62446219bcde]

- **The "pending tab" pattern bridges a stateless landing page to per-text components.** The six analysis tools (Reading, Browser, TextHiC, Characters, Analysis, Compare) are all `viewStore` tabs that require a loaded text — so a tool click can't open anything by itself. Storing the chosen `TabId` and replaying it via `setActiveTab` at the moment a text is picked turns "pick a tool, then a text" into a single fluid launch, without coupling the landing page to the project lifecycle.
- **One handler, two entry semantics.** `handleSelect(id, tab=pendingTab)` defaults to the pending tab for library clicks but is called with an explicit `null` from Home's "Your texts" cards — so the same function opens a text in its chosen tool *or* in the default Reading view, depending on the entry point, with no duplicated load logic.

# Insights Archive — 2026-06-30
# Rotated: 2026-07-01T05:05:03Z (2 entries)

### 2026-06-16 [2a5f4749fb2a]

- Removing the two `headphones`-using items left that glyph orphaned in the `Icon` lookup map — deleting it alongside keeps the icon set honest (no dead entries accumulating as the skin evolves). The `doc` glyph stayed because "My Samples" still uses it.

### 2026-06-16 [d3a8e14feb08]

- I placed the two text categories (**Novels**, **Translations**) adjacent and the two research categories (**Papers**, **Scholars**) after them, so the list groups by kind rather than listing additions at the bottom — small ordering choice, but it makes the section scan as "texts, then scholarship."
- These remain **presentational labels** for now, like the rest of the sidebar nav (only **Home**, **All**, and **New Collection**/Import are wired). When you're ready, each could become a real filter — e.g., "Novels" vs "Translations" vs "Papers" would need a `category`/`type` field on project metadata to filter the grid by. Say the word and I'll wire them.

# Insights Archive — 2026-06-30
# Rotated: 2026-07-01T05:48:02Z (2 entries)

### 2026-06-16 [cd25563e7a1e]

- **Thumbnails as bundled static assets.** I captured real 1200×675 header screenshots into `browser/public/store/`, referenced as `/store/*.png`. They live in `public/` (not `src/assets/`) precisely because Vite's proxy only forwards `/api` and `/data` to the backend — anything else is served straight from `public/` in dev and copied into `dist/` for production, so the same `/store/...` URL works in both without touching the proxy.
- **The cover pattern generalized.** `StoreTile` reuses the `BookCover` approach: a tinted gradient sits as the tile's `background-image` and an `onError` handler swaps a broken/missing screenshot for the site name on that gradient — so a future dead screenshot degrades to a clean branded tile rather than an empty box.
- **External-link hygiene.** Each tile is a real `<a target="_blank" rel="noopener noreferrer">`, so opened sites can't reach back via `window.opener` — verified the attribute is present on all three.

### 2026-06-16 [1fd8cb91bcf7]

- **The decision gate is a git-state property, not a code property.** Because the prior session committed in two logical chunks but never pushed, `origin/main` is a stable rollback point — nothing here is irreversible *yet*. Pushing is the step that makes it visible to others, which is why it's the natural place to pause for confirmation.
- **The PNGs are the only consequential tracking decision.** They're binary screenshots (point-in-time captures of external sites). Committing them bloats repo history permanently and they go stale if those sites redesign — so "track vs. gitignore" is a real tradeoff, not a formality.

