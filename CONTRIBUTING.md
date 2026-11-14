# Contributing to TableTally

Thanks for helping. TableTally is a score tracker for card games among friends. It never handles, holds or moves money, and it has no real-money betting (poker in the app uses play chips that are only a score). Please keep it that way.

## Ground rules

- **Exact integer math only.** No floating point in scoring, ledger or totals. Amounts are safe integers, at most 1e12 (`src/core/integer.ts`).
- **Totals always sum to zero.** A game's `score()` must return every player and sum to exactly 0.
- **Everything free.** No paid services; the app runs on Cloudflare's free tier.
- **Privacy.** No tracking, no ads, no real names or secrets in the repo, fixtures or git history. Use anonymous players (A, B, C, D) in tests.
- **Hands stay on the player's phone** in score-only tables: a hand helper never sends cards to the server. In play-in-the-app tables the server holds the hands, so engines must only ever send each player their own cards.
- **Only CC0 or permissively licensed assets**, each listed in `ASSETS.md` with source and license.

## Setup

```
npm install
npm test             # unit tests (Vitest)
npm run typecheck    # core+tests, worker, and Svelte
npm run build        # builds dist/, which the Worker serves
npm run dev:worker   # local Worker on :8787 (needs dist/)
npm run smoke        # end-to-end checks against a running `wrangler dev`
```

Run `npm run smoke` after any change under `src/worker/`; it is the only test that exercises the Durable Object and WebSockets.

(The maintainer's checkout sits on an exFAT drive and uses `tools/npm-install.sh`. You do not need it.)

## Stress tests

Beyond the unit tests there are randomized suites that hammer the app (all seeded, so a failure prints a seed you can replay):

```
npm run stress:quick                 # a minute: small scale
npm run stress                       # thousands of games per suite (STRESS_N scales it: 0.05 quick, 10 long soak)
node tools/stress.mjs                # live: hundreds of real WebSocket games against a running `wrangler dev`
node tools/stress.mjs --persist      # also kills and restarts a private wrangler mid-hand
node tools/stress/i18n-audit.mjs     # English vs Filipino keys, and keys used but not defined
```

`test/stress/*.stress.test.ts` check every engine against independent oracles (brute-force hand rankers, side-pot and meld solvers), privacy (a view may depend only on what the viewer can know), JSON round-trips and room permissions. `tools/stress/monkey.js` is a UI monkey you inject into the page (it drives the real app in iframes of many sizes and reports overflow, raw translation keys, console errors and missing labels); see `docs/stress-report.md`.

## Adding a game

Adding a game must not change the core. The pieces:

1. **Rules first.** Write `docs/rules/<game>.md`: sources cited, worked examples, anything unverified marked. Tests come from those examples, at every supported player count.
2. **Scoring module**: `src/games/<id>/index.ts` exports a `GameModule` (see `src/core/game.ts`):
   - `id`: stable machine id. It is saved in logs, so never rename it.
   - `playerCounts`, `defaultSetup`, `validateSetup`: host options. Setup and round input are untrusted JSON, so check types.
   - `validate` and `score`: pure functions, no I/O, no `Date`, no randomness. Return a zero-sum `Net` with every player.
   Register it in `src/games/index.ts` (one line).
3. **Browser UI**: `src/web/games/<id>/` with `Entry.svelte` (result entry) and `Setup.svelte` (host options), then register a `GameUi` in `src/web/games/index.ts` with `describe`, `winnerOf`, `banners` and `rules`. A `HandHelper` and a `Status` component are optional.
4. **Strings**: every UI string goes through `src/web/lib/i18n.svelte.ts` in English and Filipino, using the game's native terms.
5. **Tests** in `test/`, derived from the worked examples. Group variations are host-toggleable options, not hard-coded rules.

## Adding computer players (an engine) to a game

Digital play is opt-in per game. Implement `PlayEngine` (`src/core/play.ts`) in `src/games/<id>/engine.ts` and register it in `src/games/engines.ts`; then add a `Play` component to the game's `GameUi` (`src/web/games/index.ts`). Rules for engines:

- Pure and JSON-serialisable. All randomness comes from the seed (`src/core/rng.ts`), so a game can be replayed.
- `viewFor(state, playerId)` is the only thing a phone or a bot sees: never include another player's hidden cards (a finished hand may reveal them).
- `result(state)` returns the same input your score-only Entry screen produces (without `stake`), so scoring, history and undo are reused.
- Bots implement `bot(view, level, seed)` for `easy | normal | hard`, and `timeoutMove` must always be legal.
- Test that bots only make legal moves and every hand ends (see `test/pusoy-dos-engine.test.ts`), and that stronger levels win more often.

## Pull requests

- Keep changes focused. Run `npm test`, `npm run typecheck` and `npm run build` first; CI runs the same.
- Describe what changed and why. Screenshots help for UI changes.
- By contributing you agree your work is released under the MIT license.
