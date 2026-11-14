# Stress-test report (2026-11-14)

Everything ran locally (vitest, a local `wrangler dev`, the local Chrome tab). Seeds are fixed, so any failure replays exactly. Commands are in `CONTRIBUTING.md` (`npm run stress`, `node tools/stress.mjs`, `tools/stress/monkey.js`, `tools/stress/i18n-audit.mjs`).

## What was run

| Level | What | Scale |
|---|---|---|
| 1. Engines | Every game against independent oracles (brute-force hand rankers, side-pot recomputation, meld and arrangement solvers), privacy ("a view may depend only on what the viewer can know"), JSON round-trips, determinism, garbage moves, deadlock checks | Pusoy Dos 21,600 hands / 795,800 moves; Tong-its 6,000 hands / 227,051 moves / 55,212 exhaustively checked steps; Pusoy 3,456 hands + 2,714 random and planted natural-hand deals + a brute-force search of all 72,072 arrangements per sampled hand; Poker 6,675 hands / 35,272 actions / 5,295 showdowns / 5,327 all-in hands, 40,000 seven-card comparisons, every payout recomputed independently |
| 2. Room and protocol | Random sequences of every message type from every kind of actor, malformed payloads, random clock jumps | 750 rooms, 190,023 operations, 15,350 accepted messages, 21 distinct rejection codes; 180,000 garbage messages through `parseClientMessage` and `cleanName` |
| 3. Live server | Real WebSockets: 100 concurrent-ish rooms (all games, solo and mixed), reconnects, twin sockets, strangers at full tables, rename storms, out-of-turn moves; 18 abuse checks; a hard kill and restart of the server mid-hand | 100 rooms / 234 hands / 45 reconnects / 0 hung / 0 unexpected errors; max state message 2.6 KB; 18 of 18 abuse checks; 6 of 6 persistence checks |
| 4. UI monkey | A script that clicks, types and selects at random in the real app, with the app in iframes of 320x568, 360x640, 390x844, 768x1024, 1024x768 and 640x360; both languages | Home, join by code, unknown/short/garbage room codes, score-only rooms (all 4 games, entry forms, history, hand helpers, turn timer, options), play lobbies, in-hand screens (all 4 games), a stranger arriving, the menu, renaming, reactions. Checks: page errors, console warnings, raw translation keys, bad values, missing labels, horizontal overflow, controls off screen, and the no-scroll rule |

## Bugs found and fixed

1. **Poker: pots split wrongly (engine).** Chips from players who folded created extra "levels", so one pot became several with the same winners and an odd chip was divided per level. 12 of 6,675 hands ended one chip off. Pots with the same eligible players are now merged. Regression tests added.
2. **Oval table crashed for 5 to 10 players (UI).** Seat positions existed only for 2 to 4 players, so a poker lobby or score-only table with 5+ players threw `Cannot read properties of undefined (reading 'x')`. Positions now exist for any size, and 7+ seats use a grid. Unit test added.
3. **Leaving a room threw TypeErrors (UI).** The room state was cleared before the page finished unmounting. It is now cleared after teardown, guarded by a session generation so a quick re-open is never affected.
4. **Filipino lobby overflowed (UI).** The three level buttons ran off a 360px screen.
5. **In-hand layout clipping (UI).** Pusoy's rows could be squeezed or clipped, its rules popover was clipped, Poker with six seats plus the reactions tray plus the raise panel overflowed, and Poker's raise controls were off screen on a phone held sideways. Rows now fit their height, the rules and reactions are overlays, and Poker uses two columns on a short wide screen.
6. **Missing labels (accessibility).** The Pusoy Dos "points per place" inputs after the first had no accessible name.
7. **Dev warning.** `bind:this` on non-reactive storage in `Seats.svelte`.
8. **Parser took `NaN`/`Infinity` (hardening).** Not reachable over real JSON, but `parseClientMessage` now requires finite numbers.

Smaller harness-only problems (false alarms, not app bugs) were fixed in the test code.

## Found but not fixed

- **243 interface strings have no Filipino translation** (English has 499 keys, Filipino 256). They fall back to English, so Filipino mode shows a mix. No key is used without being defined and none is duplicated. These need a native speaker (the Tagalog text was already marked as needing review).

## Not covered

- A real phone, real mobile networks, and the real deployed Cloudflare runtime (the local runtime was used; CPU limits and billing are unmeasured, and the heavier computers, Hard Pusoy and Poker, were not timed on Cloudflare).
- Room expiry after 24 hours (it cannot be shortened without a code change; the alarm path is covered by unit tests).
- Sound and vibration (vibration was removed).
