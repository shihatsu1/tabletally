# Contributing to TableTally

Thanks for helping. TableTally lets friends play card games on their phones and keeps the score. It never handles, holds or moves money and has no real-money betting (Poker uses play chips that are only a score). Please keep it that way.

## Ground rules

- **Exact integer math only.** No floating point in scoring, the ledger or totals. Amounts are safe integers of at most 1e12 (`src/core/integer.ts`).
- **Totals always sum to zero.** A game's `score()` returns every player and sums to exactly 0.
- **Everything free.** No paid services; the app runs on Cloudflare's free plan.
- **Privacy.** No tracking, no ads, and no real names or secrets in the repo, fixtures or history. Use anonymous players (A, B, C, D) in tests.
- **Each phone sees only its own cards.** The server holds every hand while it is played; an engine's `viewFor` must never include another player's hidden cards (a finished hand may reveal them).
- **Only CC0, public-domain or permissively licensed assets**, each listed in `ASSETS.md` with its source and license.

## Setup

Needs Node.js 22.12 or newer.

```
npm install
npm test             # unit tests (Vitest)
npm run typecheck    # core and tests, the Worker, and the Svelte app
npm run lint         # house rules (tools/lint.mjs) and the English/Filipino key check
npm run build        # builds dist/, which the Worker serves
npm run dev:worker   # local Worker on :8787 (needs dist/)
npm run smoke        # end-to-end checks against the running dev Worker
```

Run `npm run smoke` after any change under `src/worker/`; it is the test that exercises the Durable Object, WebSockets, the host key and the request limits. The Worker allows 10 new tables per address per minute, so wait a minute between two smoke runs.

(The maintainer's checkout sits on an exFAT drive and uses `tools/npm-install.sh`. You do not need it.)

## Stress tests

Randomized suites, all seeded so a failure prints a seed you can replay:

```
npm run stress:quick                 # about a minute
npm run stress                       # thousands of games per suite (STRESS_N scales it: 0.05 quick, 10 long soak)
node tools/stress.mjs URL            # live: hundreds of real WebSocket games; start that Worker with
                                     #   npx wrangler dev --port 8788 --var TT_RATE_LIMIT:off (test only)
node tools/stress.mjs --persist      # also kills and restarts a private Worker mid-hand
```

`test/stress/*.stress.test.ts` check every engine against independent oracles (brute-force hand rankers, side-pot and meld solvers), privacy (a view may depend only on what the viewer can know), JSON round-trips and table permissions.

## Adding a game

Adding a game does not change the core. A game has four parts:

1. **Rules.** Write `docs/rules/<game>.md`: how the app plays it, the scoring with worked examples, choices where sources disagree, open questions and sources.
2. **Scoring module**, `src/games/<id>/index.ts`, exporting a `GameModule` (`src/core/game.ts`):
   - `id` is saved in every table, so never rename it.
   - `playerCounts`, `defaultSetup`, `validateSetup`: host options. Options and round input are untrusted JSON; use the guards in `src/core/check.ts`.
   - `validate` and `score`: pure functions (no I/O, no `Date`, no randomness) that return a zero-sum `Net` with every player.
   Register it in `src/games/index.ts`.
3. **Engine**, `src/games/<id>/engine.ts`, implementing `PlayEngine` (`src/core/play.ts`), registered in `src/games/engines.ts`:
   - Pure and JSON-serialisable. `start(setup, players, seed)` shuffles with `rngFrom(seed)`: tests pass a number so games replay; the server passes a cryptographic source.
   - `viewFor(state, playerId)` is all a phone or a computer player ever sees.
   - `result(state)` returns the scoring module's round input (without `stake`), so totals, history and voiding are reused.
   - `bot(view, level, seed)` for `easy | normal | hard`; `timeoutMove(view)` must always be legal.
   - Test that computers only make legal moves, every hand ends, and stronger levels win more often (see `test/pusoy-dos-engine.test.ts`).
4. **Screens**, `src/web/games/<id>/`: a `Play.svelte` (the hand being played) and a `Setup.svelte` (host options), registered with `defineUi<View, Move, Setup>({ ... })` in `src/web/games/index.ts` together with `describe`, `winnerOf`, `banners` and `rules`, and optionally `seat` (what the seat strip shows), `stake` (the deal's stake label) and `Status`. `defineUi` checks each screen against the game's own types. Hold cards with `CardFan` or `HeldRows`.

Every UI string goes through `src/web/lib/i18n.svelte.ts` in English and Filipino, using the game's native terms. For a plural, add `<key>.one` with the singular English text. Group variations are host options, not hard-coded rules.

## Pull requests

- Keep changes focused. Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` first; CI runs the same plus the smoke test.
- Describe what changed and why. Screenshots at phone size help for screen changes.
- By contributing you agree your work is released under the MIT license.
- Please follow the [code of conduct](CODE_OF_CONDUCT.md). Security problems go to the private channel in [SECURITY.md](SECURITY.md), not to a public issue.
