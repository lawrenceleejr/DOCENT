# DOCENT — visual identity

How anything outward-facing should look and read: social posts, slide decks,
posters, one-pagers, conference material, web pages, README imagery. It is
descriptive of what the app already is, not a separate marketing skin — the
palette, the type, and the motion all come from the product.

**Sources of truth.** Colours and fonts live in `frontend/src/theme.ts`; the
mark and its animation live in `design/logo/` (`Logo.tsx`, `LogoReveal.tsx`,
`LogoReveal.css`, `logo-mark.svg`). This file explains how to use them away
from the app. If the two ever disagree, the code wins and this file gets
updated. Product-language and privacy rules in `CLAUDE.md` apply to every word
and pixel here.

---

## 1. The idea

The mark is a hub radiating three orbits with community nodes sitting exactly
on them — an outreach ripple that is also an atom or a solar system: a
distributed network reaching outward. Every other decision descends from it.

Two principles govern composition:

**One continuous surface.** Anything with parts — a carousel, a deck, a
multi-page handout — is composed as a single canvas and then cut, rather than
assembled from separate frames. Backgrounds, orbit arcs, and connective threads
cross the cuts; cards and screenshots run past an edge and finish on the next
piece. The seams should be the least interesting thing about it.

**The motion is the app's.** Never re-draw or re-time the reveal. Link
`design/logo/LogoReveal.css` and reuse its classes (`dc-tile`, `dc-ring1..3`,
`dc-wave`, `dc-flash1..3`, `dc-core`, `dc-letter`). A poster-scale ripple is
the same `dc-wave` element scaled up, not a lookalike. Change the app's
animation and every piece of material follows on the next render.

---

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| Brand primary | `#6d41ec` | The signature violet; gradient start |
| Gradient end | `#b14fe0` | Paired with the primary at 120–150° |
| Brand 5 / 4 / 3 | `#7d4ff5` `#8f68fb` `#a98dff` | Accents, links, small type on dark |
| Brand 1 / 0 | `#e4dcff` `#f3f0ff` | Headline ink on dark, chip text |
| Ground | `#0b0b10` | Base surface for posters and video |
| Card surface | `#131318` / `#16161c` | Screenshot frames, terminals, panels |
| Hairline | `rgba(255,255,255,0.13)` | Card borders, dividers |
| Body ink | `#c9c9d4` | Running copy on dark |
| Dimmed ink | `#a2a2b3` | Captions, secondary lines |

Semantic colours are the app's own map markers and are **only** for data
meaning, never decoration: gap `#e8843a` (amber), reached `#199e70` (green),
your venue `#6d41ec` (violet).

Rules:

- Dark ground by default. Light backgrounds are for print documents only, and
  then the violet ramp shifts to `#6d41ec` on `#f6f5fb`.
- Violet is the only accent. Do not introduce a second brand hue — depth comes
  from large, soft radial washes of the same violet at 15–60% opacity.
- Gradients are for the mark, one headline phrase, and CTA surfaces. Never for
  body text, never as a full-bleed background.
- Keep body copy at or above `#c9c9d4` on dark for legibility at thumbnail size.

## 3. Typography

**Space Grotesk** (700) for display: wordmark, headlines, numbers, stat
figures. **Inter** (400–600) for everything read in sentences. A monospace face
appears only inside terminal panels. Both are bundled in the repo — never link
a font CDN, and never let a piece silently fall back to a system face.

On a 1080-wide poster surface:

| Role | Face | Size | Tracking / leading |
|---|---|---|---|
| Wordmark | Space Grotesk 700 | 116 px | `0.06em` |
| Headline | Space Grotesk 700 | 76 px | `-0.015em`, 1.06 |
| Cover line | Space Grotesk 700 | 62 px | `-0.01em`, 1.16 |
| Lede | Inter 400 | 29–36 px | 1.5 |
| Chip / caption | Inter 500 | 21–25 px | — |
| Lockup tagline | Inter 500 | 30 px | `0.16em`, two lines |

Scale these proportionally for other canvas widths; keep the ratios.

- One gradient phrase per headline, set with `<em>` and a
  `linear-gradient(120deg, #c7b6ff, #e9b6ff, #ffd9f4)` text clip. Two competing
  gradient phrases in one composition is one too many.
- No eyebrows or section labels above headlines. The headline is the only voice
  on a slide; a label above it just repeats the headline in smaller type.
- Typographic apostrophes and quotes (`’` `“ ”`), em dashes for the turn in a
  sentence, no exclamation marks anywhere.

## 4. Layout

- **Margins**: 84 px on a 1080-wide surface (7.8%). Headline block starts about
  a fifth of the way down, body copy under it, imagery below and bleeding off
  an edge.
- **Cards** (screenshots, terminals, panels): 20 px radius, 1 px hairline
  border, a 44 px title bar with three muted dots, a deep soft shadow, and a
  tilt between −2.5° and +2.5°. Every card bleeds off at least one edge.
- **Vary every card**: width, angle, and vertical position should differ piece
  to piece. Identical placement across parts is what makes a set read as a
  template instead of a surface.
- **Spill**: where parts are viewed in sequence, let cards cross the cut by
  40–140 px so each part opens with a sliver of the one before it.
- **The ripple**: concentric orbits centred on the mark, opacity tapering from
  about 0.18 to 0.05 as radius grows, with community nodes snapped exactly onto
  the arcs and a dashed thread stitched between them. It runs behind everything
  and must never cross type — reserve a clear band for it.
- **Furniture**: a small mark plus `DOCENT` wordmark at 62% opacity, and, in a
  sequence, a progress rail of dashes with the current one filled in gradient.
- Restraint at the centre: the tightest ripple rings fade back behind the
  lockup so the wordmark is the only loud thing there.

## 5. Motion

All timings come from `LogoReveal.css` and should not be edited for a
deliverable:

- **Reveal** — tile springs in (0.72 s), nodes pop (0.5–1.56 s), rings ripple
  out (0.68–1.12 s), wordmark letters rise (1.35 s+), tagline fades (2.15 s).
  Everything has settled by ~3.7 s.
- **Steady state** — a radar ping sweeps out of the core every 5 s: the wave is
  live for the first 29% of the cycle, then the cycle is completely quiet from
  29% to 93%, then the core swells for the next launch.

Two derived rules:

- **Stills** freeze the whole timeline at one instant, 40% into a ping cycle —
  after the sweep has passed, so no stray arc crosses the frame. Every part of a
  multi-part piece must be frozen at the *same* instant, or the seams show.
- **Loops** may splice the timeline to tighten the rhythm — the app's 5 s
  spacing is right for a login screen and sleepy for a 10 s social loop. Splice
  only at points inside the quiet window (29–93%), where every element is at
  rest, so the joins are invisible. Never retime a keyframe to achieve this.
- Honour `prefers-reduced-motion` in anything that runs in a browser.

## 6. Copy

**Voice.** Plain, concrete, second person. Short declaratives that name real
things — "the classroom visit, the festival demo table, the observing night,
the podcast" — rather than abstractions like "engagement activities". Confident
without selling: state what the software does and let the reader conclude. No
exclamation marks, no "revolutionize", no emoji in headlines.

**Vocabulary.**

| Use | Not |
|---|---|
| Distributed (the D in DOCENT) | Decentralized |
| communicators | researchers, users |
| science outreach — named early, in the first or second beat | outreach, engagement, activities |
| Reach out · Track your impact | slogans invented per piece |
| Broad Impact (for the grant-reporting sense) | broader impacts, impact statement |
| events | visits, entries |
| gap / reached (venue coverage) | uncovered, targeted |

**Arc.** A multi-part piece follows: hook → the problem, named concretely →
the answer, naming DOCENT explicitly at the pivot ("With DOCENT, …") → two or
three proof beats showing the real product → the ask. Every part after the
pivot should show the app, not describe it.

**Never.**

- Invented statistics, adoption numbers, or testimonials.
- Login credentials, access codes, or anything that goes stale in a
  public-facing piece.
- Private fields — descriptions, reflections, ratings, host contact details —
  or communicator identities in anything public. The privacy invariants in
  `CLAUDE.md` are not relaxed for marketing.
- Email-based features. They do not exist and must not be implied.

## 7. Imagery

- Use real screenshots of the dark theme from `docs/screenshots/`, seeded with
  `./scripts/seed-demo.sh`. Say plainly that the data is a demo whenever the
  piece could be read as real activity.
- Do not mock up UI that exists. The one exception is a capture that is
  physically impossible — OpenStreetMap tiles render client-side and come out
  blank in a static screenshot — and then the illustration must use the app's
  real colours and terminology, and the substitution gets noted in the source.
- Screenshots always sit in the standard card frame; never bare on the ground.

## 8. Output specs

| Deliverable | Spec |
|---|---|
| Instagram carousel | 1080 × 1350 (4:5) per slide, cut from one `N × 1080` wide canvas |
| Instagram story / reel | 1080 × 1920, same margins scaled |
| Video | H.264 High, `yuv420p`, 30 fps, CRF 18, `+faststart`, even dimensions |
| Slides | 16:9 at 1920 × 1080, same tokens, cards and ripple scaled 1.4× |
| Web / artifact pages | Brand tokens, fonts inlined, both light and dark themes |
| Delivery | JPEG q2 for phones, PNG for archives, plus a zip for desktop |

Production pattern that works: build the whole surface as one HTML page, drive
a headless browser, freeze the animation timeline, then screenshot each region.
`design/social/` (untracked) holds a working example of this.

Rendered marketing assets are **not** committed to the repository — only the
sources and this guide.

## 9. Before shipping

- [ ] Every colour traces to a token above; no new hue slipped in.
- [ ] Both fonts actually loaded — no system-face fallback.
- [ ] One gradient phrase per composition, no eyebrows above headlines.
- [ ] Cards vary in width, angle, and height, and each bleeds off an edge.
- [ ] The ripple crosses no type; the whole set is frozen at one instant.
- [ ] "Science outreach" appears in the first or second beat.
- [ ] Distributed, communicators, events, gap/reached — all correct.
- [ ] No invented numbers, no private fields, no credentials, no email features.
- [ ] Demo data disclosed.
- [ ] Legible at thumbnail size: headline readable, body copy above `#c9c9d4`.
