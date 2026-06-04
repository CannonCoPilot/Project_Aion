# UX Review: CompressionTrendChart — AION-997d06b8

**Reviewer**: ux-eng  
**Date**: 2026-04-29  
**Task**: [TC-23] Build before/after comparison widget with trend line visualization  
**Target**: TokenCompressionPage + CompressionTrendChart + ComparisonCard (pre-implementation)  
**Quality Level**: Standard  

---

## Summary

Pre-implementation UX review. The target files do not exist yet. This review surfaces UX requirements, consistency risks, and accessibility obligations that must be addressed during implementation.

**9 findings total: 2 Immediate, 4 Next Sprint, 3 Backlog.**

---

## Findings

### [CONSISTENCY] UX-01: File extension mismatch — .jsx vs .tsx

- **Location**: `src/pages/TokenCompressionPage.jsx`, `src/components/CompressionTrendChart.jsx`, `src/components/ComparisonCard.jsx`
- **User Impact**: No direct user impact at runtime, but mixing `.jsx` into an all-`.tsx` codebase breaks TypeScript type checking. Untyped components silently pass wrong props, producing runtime errors users experience as broken interactions (blank panels, NaN values in charts).
- **Expected**: New files use `.tsx` with explicit prop interfaces.
- **Recommendation**: Create all new files as `.tsx`. Example interface: `interface CompressionTrendChartProps { data: CompressionDataPoint[]; range: '7d' | '30d' | 'all'; onRangeChange: (range: '7d' | '30d' | 'all') => void; }`
- **Priority**: Immediate

---

### [UX] UX-02: TokenCompressionPage has no route or nav entry

- **Location**: `src/App.tsx` (lines 44–95), `src/components/layout/AppShell.tsx` (MAIN_NAV, lines 20–28)
- **User Impact**: The page would be completely unreachable. No route exists and no nav entry points to it. Users cannot find the feature.
- **Expected**: Page is accessible via URL and discoverable in navigation.
- **Recommendation**: 
  1. Add route in `App.tsx`: `<Route path="/compression" element={<TokenCompressionPage />} />`
  2. Add nav entry to `MAIN_NAV` in `AppShell.tsx` alongside `/usage`: `{ to: '/compression', label: 'Compression', icon: '⇒' }`
  3. Default time range to `'7d'` (most actionable short view).
- **Priority**: Immediate

---

### [ERROR-STATE] UX-03: Empty state must follow established NoProxyData pattern

- **Location**: `src/components/CompressionTrendChart.jsx` (future), `src/components/ComparisonCard.jsx` (future)
- **User Impact**: A blank chart or hanging spinner leaves users unable to distinguish between: compression disabled, loading, or needs configuration.
- **Expected**: A clear, actionable empty state explaining why there is no data and what to do.
- **Recommendation**: Use the same pattern as `NoProxyData()` in `UsagePage.tsx` (lines 70–82): centered ⊘ icon in a `surface-2` circle, primary `'No Compression Data'` label, secondary explanation like `'Token compression has not run yet. Data will appear after the first compression cycle.'` Do NOT show a blank chart area.
- **Priority**: Next Sprint

---

### [UX] UX-04: Time range selector should use pill/segmented control pattern

- **Location**: `src/components/CompressionTrendChart.jsx` (future)
- **User Impact**: An inconsistent or custom selector adds cognitive overhead. Users expect temporal controls to behave like other pages in the app.
- **Expected**: The time range selector feels native and consistent.
- **Recommendation**: Implement a pill-style segmented control with three buttons (`7d`, `30d`, `All`). Selected: `bg-surface-2 text-secondary font-semibold`. Unselected: `text-muted hover:text-secondary`. Position in panel header row (right side), matching the existing `'N windows'` badge placement in UsagePage panels (e.g., line 545–548). Default to `7d`.
- **Priority**: Next Sprint

---

### [ACCESSIBILITY] UX-05: Dual-area chart requires visible legend and accessible labels

- **Location**: `src/components/CompressionTrendChart.jsx` (future)
- **User Impact**: Color-only differentiation between "total tokens" and "tokens after compression" fails WCAG 1.4.1 (Use of Color). Users with color vision deficiency cannot distinguish the two areas. Screen readers cannot interpret unlabeled SVG charts.
- **Expected**: Both data series are distinguishable without color alone and accessible via keyboard.
- **Recommendation**:
  1. Include a visible `<Legend />` component (Recharts built-in) — not just tooltip-on-hover.
  2. Use opacity/fill-opacity difference in addition to color (e.g., 60% opacity for "total", 100% for "compressed").
  3. Add `aria-label` to `ResponsiveContainer`: `aria-label="Token consumption trend: total vs. compressed"`.
  4. Enable `keyboard={true}` on Recharts `<Tooltip />` for keyboard accessibility.
- **Priority**: Next Sprint

---

### [UX] UX-06: Before/After comparison card needs context and color-blind-safe highlighting

- **Location**: `src/components/ComparisonCard.jsx` (future)
- **User Impact**: Without context, users don't know what text is being shown or what the highlighting means. Background-color-only marking of removed words fails WCAG 1.4.1.
- **Expected**: Card explains the sample text source, defines highlighting, and uses accessible removed-word markers.
- **Recommendation**:
  1. Card title: `'Sample Compression — Most Recent Message'` (or similar).
  2. Show a legend: green strikethrough = removed; normal = retained.
  3. Display compression summary prominently: `'43% reduction • 1,420 → 812 tokens'`.
  4. Removed words: use `text-decoration: line-through` PLUS background highlight — never background color alone.
  5. If sample is synthetic/demo data, label it `'Illustrative example'`.
- **Priority**: Next Sprint

---

### [UX] UX-07: useCompressionStats() hook doesn't exist — loading/error states required

- **Location**: `src/api/` (future hook), `src/components/CompressionTrendChart.jsx` (future)
- **User Impact**: Without loading and error states, the component flashes blank content or throws unhandled exceptions that users see as a broken blank page.
- **Expected**: Hook returns `{ data, isLoading, error }` and all three states are handled.
- **Recommendation**: Follow `useSessionWindow()` pattern in `UsagePage.tsx` (lines 87–97): check `isLoading` first (show skeleton with `'Loading...'` at appropriate chart height — `h-48` for main chart, `h-24` for mini-chart), then check error/no-data (empty state), then render data.
- **Priority**: Next Sprint

---

### [UX] UX-08: Mini compression ratio chart needs axis labels and threshold reference line

- **Location**: `src/components/CompressionTrendChart.jsx` (future) — mini-chart section
- **User Impact**: A bare ratio value (e.g., `0.42`) without axis labels is ambiguous. Users don't know if this is good or bad, or even what unit it represents.
- **Expected**: Mini-chart Y axis is clearly labeled and optimal range is indicated.
- **Recommendation**:
  1. Label Y axis `'Avg Savings %'`; format tick values as `'42%'` not `'0.42'`.
  2. Add a horizontal `ReferenceLine` at a target ratio (e.g., 50%) with label `'Target'`.
  3. Use emerald color when above target, amber below — matching `UsagePage.tsx` traffic-light pattern (lines 155–161).
  4. Tooltip format: `'42% saved'` not `'0.42'`.
- **Priority**: Backlog

---

### [RESPONSIVE] UX-09: Page needs max-width constraint for wide screens

- **Location**: `src/pages/TokenCompressionPage.jsx` (future)
- **User Impact**: On wide screens, full-width charts and comparison cards become visually noisy. ComparisonCard text spans too many characters per line (>100 chars), reducing readability.
- **Expected**: Page content is constrained to a comfortable max-width matching other data pages.
- **Recommendation**: Wrap page in `<div className="space-y-6 max-w-5xl mx-auto">` — the exact pattern used in `UsagePage.tsx` line 995. `ComparisonCard` text area should be `max-w-3xl` to keep line length to 65–75 chars.
- **Priority**: Backlog

---

## Consistency Tokens (Copy-Paste Ready)

| Element | Class/Value |
|---------|-------------|
| Card container | `rounded-lg border border-default bg-surface-1 p-5` |
| Section heading | `text-sm font-semibold text-secondary` |
| Sub-label | `text-[10px] text-faint uppercase` |
| Tooltip style | `{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }` |
| Loading pattern | `h-24 flex items-center justify-center text-faint text-sm` — text: `Loading...` |
| Traffic light | emerald-500 (<60%), amber-500 (60–80%), red-500 (≥80%) |
| Page wrapper | `space-y-6 max-w-5xl mx-auto` |
| Empty state icon | `w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center` |

---

## Quick Wins for Implementer

1. Use `.tsx` extension (not `.jsx`) — prevents type safety gaps
2. Add `/compression` route to `App.tsx` immediately
3. Add nav entry alongside `/usage` in `MAIN_NAV` in `AppShell.tsx`
4. Reuse or extract `NoProxyData` component for empty states
5. Add `aria-label` to all `ResponsiveContainer` wrappers
6. Format compression ratio as percentage (`42%`) not decimal (`0.42`)
7. Wrap page in `max-w-5xl mx-auto` from day one

<!-- DIRECTIVES
{
  "version": 1,
  "directives": [
    {"type": "notify", "severity": "info", "summary": "UX review: 9 findings for CompressionTrendChart (AION-997d06b8) — 2 Immediate, 4 Next Sprint, 3 Backlog"}
  ]
}
-->
