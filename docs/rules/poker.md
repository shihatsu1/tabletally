# Poker (home cash game tracking)

Status: research draft for review. Items marked **[UNVERIFIED]** are conventions with no cited source.

## Scope

TableTally tracks money-in and money-out in **chips**. It never tracks hands, pots, bets or rules of play, and it never touches money. No gameplay rules page beyond a short pointer is needed.

## What the module tracks

Per player: a list of **buy-ins** (initial + rebuys, in chips) and a **final cash-out** (chips). Events are timestamped and editable with a reason, like any other round history.

## Chip ratio and exact math

The host sets a chip-to-money ratio. To keep integer-only math the ratio is stored as two integers, for example `chips : minorUnits = 100 : 50` (100 chips = 50 minor units). Everything in the ledger is stored in **chips**. Conversion to money happens once, at settlement, from the net chips.

When `net_chips * minorUnits / chips` is not a whole number, the remainder is distributed with the largest-remainder method so rounded amounts still sum to zero. Decision for the maintainer: is that acceptable, or should the app refuse ratios that cannot divide evenly?

## Net and settlement

`net_i = cashout_i - sum(buyins_i)` in chips. Winners are net positive. Settlement uses the shared fewest-payments solver. Common advice in tracker apps is the same: each player's net, then losers pay winners in as few transfers as possible [PartyPot FAQ, vendor page].

## Chips in must equal chips out

`sum(all buy-ins)` must equal `sum(all cash-outs)`. Every chip that went into the game must come out of it, so the two totals match.

**Example.** Three players each buy in 1000 chips, so 3000 chips are in. At the end they cash out A 1800, B 900, C 200, which totals 2900. The nets are A +800, B -100, C -800, and they add up to -100, not 0. Someone would pay or receive the wrong amount. The usual cause is a forgotten rebuy or a miscounted stack (common causes per vendor guidance: unrecorded rebuys, bank float, change errors, a pocketed chip [PartyPot blog, pokerchipforum thread]).

**What the app does:** it shows the difference in red (here "100 chips missing") and does not settle until it is fixed. The host has two ways to fix it, and nothing is changed silently:

1. Correct a buy-in or cash-out entry. History records the reason.
2. Assign the difference to one chosen player, for example the person who miscounted, as an adjustment line.

Decision (recommended, simplest): no third "house" option, so settlement always sums to zero.

## Implementation status (build step 7)

Implemented in `src/games/poker/` and tested in `test/poker.test.ts` and the room test. One **round is one night**. For each player the host enters every buy-in and rebuy (chips) and the final cash-out (chips); a draft is kept on the host's phone so a refresh does not lose the night.

- Net chips = cash-out - buy-ins. Net units = net chips converted once with the integer ratio `chips : moneyUnits` (largest remainder, always sums to zero). Default ratio 1:1, usual buy-in 100.
- Chips in must equal chips out. If not, the round is refused with "N chips are missing / N extra chips came out". The host fixes an entry or **assigns the difference to one chosen player** (that player's net absorbs it, shown in history). Assigning when nothing differs is refused. No house option.
- 2 to 10 players. Tournament mode, a who-pays-whom list and a per-hand record are not built (the last was never planned).

## Tournament mode (optional, later)

Placement payouts: host sets the buy-in, number of entries and a payout table in whole percentages of the prize pool, in integers, with the largest-remainder rule so shares sum to the pool. A common home-game convention is 50/30/20 for three places, 65/35 for two, 100 for winner-take-all **[UNVERIFIED: no source found in this pass; presets will be editable]**. No hand tracking, blinds clock or bounty logic is planned.

## Result entry proposal

A table with a row per player: `Buy-ins` (tap "+ rebuy" with a preset amount), and at the end a single `Cash-out` field per player. A footer shows `chips in`, `chips out`, `difference` in red when non-zero.

## Sources

- PartyPot FAQ and blog pages (vendor): <https://partypotapp.com.advisoryapps.com/faq/what-is-poker-settlement-app/> and <https://partypotapp.com.advisoryapps.com/blog/poker-chips-dont-add-up-cash-out/>
- PokerChipForum thread on home-game money handling: <https://www.pokerchipforum.com/threads/how-do-you-handle-money-in-home-cash-games-%E2%80%94-collect-upfront-or-settle-at-the-end.140488/>

These are marketing or forum pages and were not read in full. The settlement math itself (net per player, then match debtors to creditors) is standard arithmetic and does not depend on them.


## Digital play (in the app)

Used when a table is created with "Play in the app". TableTally still never handles, holds or moves money: the chips are **play chips**, a score that the room's ledger converts with the host's chip ratio exactly like a home game played with real chips. No real-money betting.

- 2 to 6 players (computers can fill seats). Standard 52-card deck, **no-limit Texas Hold'em**.
- The dealer button moves one seat every hand. The small blind is left of the button and the big blind next to it. **Heads-up:** the button posts the small blind, acts first before the flop and last after it.
- Blinds are set in the game options (chips); the default is 1 and 2 for a 100-chip buy-in.
- Every hand starts from each player's current stack. A player with no chips buys back in for one buy-in before the next hand (that buy-in is not counted as winnings).
- Betting: fold, check, call, or raise to an amount. **[UNVERIFIED house rule choice]** A raise must be at least the size of the last full raise (or the big blind). An all-in that is smaller than a full raise must be called but does not let players who already acted raise again.
- Side pots: built from what each player put in. A bet nobody can call is returned. Ties split the pot, and an odd chip goes to the first winner left of the button. Hands are compared as the best five of seven cards; the wheel (A-2-3-4-5) is the lowest straight; suits never break ties.
- At the end only players who went to a showdown show their cards. If everyone else folds, the winner does not have to show.
- **Ledger:** each hand is one round of the normal Poker module: buy-in = the stack at the start of the hand, cash-out = the stack at the end, so chips in always equal chips out and totals sum to zero.
- Time limit: optional, chosen when the host deals. When it runs out a player checks if that is free, otherwise folds.
- Computers: Easy calls a lot, rarely raises and sometimes folds to big bets. Normal judges its hand by a quick strength guess against the pot odds and is a little careless (about 1 action in 7 is off). Hard simulates how often its hand would win against random hands, compares that with the pot odds, raises for value and bluffs a little from late position. Computers only see their own two cards and what is on the table.
