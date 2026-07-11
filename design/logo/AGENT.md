# DOCENT — new logo + animated reveal (handoff)

This package replaces the DOCENT brand mark and adds an animated reveal for the
auth / splash screen. Everything here is drop-in for the existing
`frontend` (React + TypeScript + Mantine v7).

## The mark

A central hub node radiating three orbital rings, with community nodes sitting
exactly on those orbits — it reads as an outreach ripple **and** as an
atom / solar system: a decentralized network reaching outward. It reuses the
existing brand gradient (`#6d41ec → #b14fe0`) so nothing else in the theme
changes.

## Files in this package

| File | Where it goes | What it is |
|---|---|---|
| `Logo.tsx` | `frontend/src/components/Logo.tsx` (**overwrite**) | Static mark + wordmark. Same exports/signatures as today (`LogoMark`, `Logo`) — no call sites change. |
| `LogoReveal.tsx` | `frontend/src/components/LogoReveal.tsx` (**new**) | Animated reveal component for the auth/splash screen. |
| `LogoReveal.css` | `frontend/src/components/LogoReveal.css` (**new**) | All motion for `LogoReveal` (namespaced `dc-*`; honours `prefers-reduced-motion`). |
| `logo-mark.svg` | `frontend/public/logo-mark.svg` (**new**) | Standalone mark for favicon / PWA icon / social. |
| `docent-logo-loop.gif` | (not for the app) | Transparent, seamless 5 s ping loop — for slides/Keynote. |
| `docent-logo-reveal.gif` | (not for the app) | Transparent reveal animation — for slides/Keynote. |

## Steps for the agent

1. **Replace the mark.** Overwrite `frontend/src/components/Logo.tsx` with the
   provided `Logo.tsx`. Exports and props are unchanged (`LogoMark({size})`,
   `Logo({size, showWordmark})`), so `Layout`, `AuthShell`, `EmptyState`, etc.
   keep working with no edits.

2. **Add the reveal component.** Copy `LogoReveal.tsx` and `LogoReveal.css`
   into `frontend/src/components/`.

3. **Use the reveal on the auth screen (recommended).** In
   `frontend/src/components/AuthShell.tsx`, on the gradient promo panel, replace
   the current static logo/heading lockup with:

   ```tsx
   import { LogoReveal } from './LogoReveal';
   // ...
   <LogoReveal size={200} showTagline />
   ```

   The reveal already renders the DOCENT wordmark and the tagline whose initials
   spell **D‑O‑C‑E‑N‑T**, so remove any now-duplicate wordmark/tagline text next
   to it. It's designed on a dark surface (the existing
   `linear-gradient(150deg,#4423a3,#6d41ec,#b14fe0)` panel is perfect).

4. **Favicon / app icon (optional but recommended).** Add
   `logo-mark.svg` to `frontend/public/` and point the icon links at it in
   `frontend/index.html`:

   ```html
   <link rel="icon" type="image/svg+xml" href="/logo-mark.svg" />
   ```

   For a rasterized PWA icon, render `logo-mark.svg` to 192×192 and 512×512 PNGs
   (any SVG→PNG step) and update the manifest.

5. **Fonts.** The reveal uses Space Grotesk (wordmark) and Inter (tagline),
   which the app theme already loads (`theme.ts`). No new font imports needed.

6. **Verify.** `npm run dev`, open the login screen: the mark should spring in,
   rings ripple out, nodes land on their orbits, the wordmark rises, then a
   radar "ping" sweeps out of the core once every ~5 s, lighting each ring and
   snapping its nodes bright as it passes. With OS "reduce motion" on, the
   finished mark shows with no animation.

## Notes

- `LogoReveal` props: `size` (px, default 184), `showTagline` (default true),
  `showReplay` (default false — a small replay button, handy for demos).
- No dependencies added; motion is plain CSS. The reveal plays once on mount;
  remount (route change / the replay button) replays it.
- The two GIFs are **presentation assets only** — do not add them to the app.
  They have transparent backgrounds (1‑bit alpha, so the rounded tile stays
  crisp on any slide). `-loop.gif` loops seamlessly; `-reveal.gif` plays the
  full entrance. Drag either straight onto a Keynote/PowerPoint slide.
