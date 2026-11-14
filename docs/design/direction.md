# Design direction board: "Manila night table"

Status: concept round 1 for review. These are AI-generated concepts, not final assets. Prompts are in `assets/generated/concepts/PROMPTS.md`.

Palette: deep felt green `#0B3B2E`, warm brass `#C9A24B`, cream `#F3E9D2`, coral accent. Positive numbers mint, negative coral.

## Concepts

| File | What it explores | My read |
|---|---|---|
| `assets/generated/concepts/logo-concept-1.png` | Card fan over a capiz-shell fan, tally strokes, slab-serif wordmark | Strong. Reads as a score tracker at a glance. Wordmark is clean. Capiz fan is busy at small sizes, so the app icon should drop it and keep cards plus tally |
| `assets/generated/concepts/card-back-concept-1.png` | Card back with capiz lattice and an eight-point star medallion | Beautiful, but it reads as stained glass and Art Deco more than a parol lantern. Fine to keep as the card back, or push toward a parol next round |
| `assets/generated/concepts/hero-table-concept-1.png` | Landing hero: felt table, chips, bell, pencil, capiz lamp | Atmospheric, with clean room on the left for the headline. The chips are red and gold, which stays on palette |
| `assets/generated/concepts/game-icons-concept-1.png` | Four game icons on rounded squares | Good family look, but wrong in places: Pusoy Dos shows a heart card with no "2", the Pusoy rows are not 3/5/5 in the right layout, Tong-its shows diamonds only. Needs a second pass |
| `assets/generated/concepts/settlement-mood-concept-1.png` | End-of-session screen with confetti | The text rendered exactly as specified, including the test-case numbers. A good target for the motion work |

## Logo options (round 2, 2026-11-13)

| File | Idea | My read |
|---|---|---|
| `logo-concept-1.png` | Card fan over a capiz fan, tally strokes, slab-serif wordmark | Richest, best for the hero and README banner. Too detailed for an icon |
| `logo-concept-2.png` | Rounded-square badge with a tally bundle shaped like card edges, rounded sans wordmark | **Best app icon and favicon**, readable at 48px. The tally strokes look a little like a fence or a comb, so it needs one more pass |
| `logo-concept-3.png` | Jeepney sign-painting wordmark on a ribbon, spade card corner, tally strokes | Most Filipino and fun. Busy and retro, and the lettering will not scale down to an icon |
| `logo-concept-4.png` | One tilted card with a brass check stroke and a capiz scallop, serif wordmark | Calmest and most premium. Reads as a to-do app because of the check, so it needs a tally instead |

**My recommendation:** use 1 as the full lockup (README, landing hero), and a simplified 2 as the app icon and favicon, built from the tally-and-card idea. Concept 3 can become an optional splash screen. All four are AI concepts, so the final marks will be redrawn as SVG.

**Decision (2026-11-13): concept 1 is the logo.** The app icon is an edit of concept 1 without the wordmark (`assets/generated/brand/app-icon-1024.png`). Both are in use in the app. A hand-drawn SVG redraw of the logo is still to do.

## What the exploration says

- AI text rendering was reliable for short strings here, but icons and card faces are not. That supports the plan: **card faces come from a CC0 SVG deck**, and generated art is used for backgrounds, logo, backs and illustration.
- UI built in code will follow this mood but must be real components, not these mockups.
- Brass lines on deep green hold up in dark mode. The light-mode variant is still to design.

## Next art steps (not started)

1. Logo round 2: simplify for 48px and favicon, test on light and dark.
2. Card back round 2: try a parol lantern motif.
3. Game icons round 2: fix the per-game symbols, probably as SVG, not raster.
4. Decide fonts (a slab serif for display, a rounded sans for numbers).
5. Light mode.

## Decisions for you

1. Pick a logo direction, or ask for another round.
2. Keep the stained-glass card back, or try a parol?
3. Name fonts you already like, if any.
