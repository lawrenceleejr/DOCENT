# DOCENT — Visual Design Improvement Plan

**Direction:** Bold & modern — a saturated signature color, larger/expressive
type, gradient accents on the hero surfaces, high contrast throughout.
**Scope:** Full redesign, all screens, foundation-first.

Charts already use a validated dataviz palette (`components/vizTheme.ts`) — that
palette is preserved. This plan re-themes the *app chrome* around it and rebuilds
each screen's layout, then does an accessibility + mobile pass.

---

## Phase 0 — Design foundation (tokens)

The root cause of the "un-themed scaffold" look: `MantineProvider` in `main.tsx`
has **no `theme` prop**. Fix that first — one theme touches every screen.

**`frontend/src/theme.ts` (new)** — `createTheme({ ... })`:

- **Brand color scale** — a custom 10-step `brand` (indigo→violet family) registered
  as `primaryColor`. Bold, saturated, and distinct from the chart blue/green so
  data never competes with chrome.
- **Signature gradient** — `defaultGradient: { from: 'indigo.6', to: 'violet.5' }`,
  used on the login hero, primary CTAs, active-nav indicator, and stat-tile accents.
- **Typography** — self-hosted variable fonts via `@fontsource-variable/*` (no
  runtime CDN dependency, works behind nginx offline):
  - Body/UI: **Inter Variable**
  - Display (wordmark, page titles, hero, stat numbers): **Space Grotesk** (or Sora)
  - `headings.fontFamily` → display; `fontFamily` → Inter; a modest type scale bump.
- **Surfaces & contrast** — explicit dark palette: near-black base (`#0c0c10`),
  elevated cards (`#16161c`) with a faint violet-tinted border; light base `#fbfbfe`.
  Raise "dimmed" ink one step so secondary text clears WCAG AA on both surfaces.
- **Radius & shadows** — `defaultRadius: 'md'`, a soft elevation on cards; consistent
  `spacing`.
- **Component defaults** — `Card` (radius/withBorder/shadow), `Button`
  (gradient variant for primary CTAs), `Badge`, `Table`, `Input` defaults so we
  stop repeating props per-page.

**`main.tsx`** — import fonts, pass `theme`, keep `defaultColorScheme="dark"`,
add `<ColorSchemeScript>` equivalent handling. Set app `<title>` + favicon.

**Deliverable check:** every screen visibly shifts to the brand look with zero
per-page edits yet.

---

## Phase 1 — Identity & app shell

- **Brand mark** — a small inline SVG logo (a stylized outreach/node motif) as a
  reusable `<Logo/>` component; pair with the "DOCENT" wordmark in the display font.
- **Header (`Layout.tsx`)** — brand mark + wordmark on the left; nav tabs with a
  gradient active indicator and clearer hover; polished theme toggle (not a bare
  boxed icon); tidy user menu. Sticky, subtle bottom border, slight blur backdrop.
- **Login / Register** — replace the centered void with a **two-panel layout**:
  left hero panel (gradient wash + brand mark + "Reach out." tagline + one line of
  mission copy + a faint science/community motif); right form panel. Collapses to a
  single column with a compact hero band on mobile.

---

## Phase 2 — Dashboard (`DashboardPage.tsx`)

- **Stat tiles → KPI row** (per dataviz stat-tile guidance): each tile gets an icon,
  a high-contrast display-font value, a semantic accent stripe/tint, and a
  **context subline** (e.g. "across 8 venues", "4 active this period"). Tabular-nums.
- **Host-relationship panel** — currently one tiny bar in a big empty box. Fix:
  enforce a min plot height only when data exists, add a proper **empty state**
  ("No host relationships recorded yet") when the series is empty/near-empty, and
  right-size the panel so it doesn't read as broken.
- **Chart polish** (keep the palette): rounded 4px data-ends anchored to baseline,
  2px lines, ensure crosshair+tooltip hover layer is present on the time series and
  per-bar tooltips on breakdowns, recessive grid, selective direct labels.
- Section the dashboard with light headers/grouping so it scans top-to-bottom.

---

## Phase 3 — Forms (`VisitFormPage.tsx`, venue modal)

- Break the long single column into **titled sections** ("Status & venue",
  "Event details", "Host", "Reflection") as subtle grouped blocks/cards with
  consistent vertical rhythm — much less monotonous, easier to scan.
- Style the status SegmentedControl and Rating to the brand; primary submit uses
  the gradient button.
- Keep the responsive `SimpleGrid` work from the mobile pass.

---

## Phase 4 — Lists & detail pages

- **Tables** (visits, venues, admin, schedule) — sticky header, refined row
  hover/zebra, tabular-nums on numeric columns, consistent badge styling, and real
  **loading skeletons** + **empty states** (icon + message + primary action)
  instead of blank/"No X".
- **Detail pages** (visit, venue) — stronger header block (title + status/type
  badges + key facts), brand-styled action buttons, cleaner field layout.

---

## Phase 5 — Map (`MapPage.tsx`)

- Brand-style the filter/legend bar to match the new chrome; dark-mode-legible
  controls; harmonize gap/reached/venue marker colors with the palette (reached =
  chart green, your-venue = brand, gap = a warm neutral). Polish popups.
- (Tiles render fine in real deploys; sandbox proxy shows them gray.)

---

## Phase 6 — Mobile & accessibility pass

- **Fix status badge truncation** ("PL…"/"CO…") — don't let badges ellipsize; give
  the Status column room or switch small screens to a **stacked card list** for
  visits instead of a horizontally-scrolled table.
- **Fix header label clip** ("Schedul") — spacing/scroll-area tuning.
- Consider card-list layouts for the densest tables on `base` breakpoint.
- **Contrast audit** to WCAG AA (text, badges, buttons, disabled states); visible
  focus rings; check button-label contrast on gradient/solid CTAs.
- Re-run the dataviz palette validator for chart colors in both modes.

---

## Phase 7 — Finishing polish

- Notification styling, favicon + `<title>`, 404/empty-route treatment.
- Refresh `docs/screenshots/*` for the README with the new look.
- `npm run build` clean; full E2E screenshot pass (desktop + mobile, light + dark);
  commit + push to `claude/outreach-tracking-app-dtfdky`.

---

## Proposed palette (for review)

| Role | Value | Use |
|---|---|---|
| Brand primary | custom indigo→violet 10-step (`brand.6` ≈ `#6741d9`) | primaryColor, active nav, CTAs |
| Signature gradient | `indigo.6 → violet.5` | login hero, primary buttons, tile accents |
| Positive / reached | `#199e70` (chart green) | success, "reached" markers |
| Dark base / card | `#0c0c10` / `#16161c` | app bg / elevated surfaces |
| Light base | `#fbfbfe` | app bg (light mode) |
| Chart series | unchanged (`vizTheme.ts`) | data only |

Exact `brand` hex steps get finalized against contrast checks in Phase 0.

## New dependencies

- `@fontsource-variable/inter`, `@fontsource-variable/space-grotesk` (self-hosted
  fonts; no CDN/CSP concerns).
- Icons: `@tabler/icons-react` (Mantine's companion set) for stat tiles / empty states.

## Risks / notes

- Bundle size grows with fonts + icons — acceptable; can be trimmed with subset
  imports. Current bundle already ~1.2 MB (noted by Vite).
- Keep all behavior identical; this is a presentation-layer redesign. No API/schema
  changes.
