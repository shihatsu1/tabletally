# Poker (no-limit Texas Hold'em with play chips)

How TableTally plays and scores Poker. The chips are **play chips**: a score, converted to the table's unit at a ratio the host picks. Nothing is wagered, held or moved, and the app never touches money. Choices we made where usual rules vary are marked **house choice**.

## Players and the game

- 2 to 6 players (computers can fill seats), one 52-card deck, **no-limit Texas Hold'em**.
- Every player starts with one buy-in of chips (100 by default). Stacks carry from hand to hand. A player who runs out buys back in for one buy-in before the next hand; that buy-in is not counted as winnings.
- The dealer button moves one seat each hand. The small blind sits left of the button and the big blind next to it. **Heads-up:** the button posts the small blind, acts first before the flop and last after it.
- Blinds are a game option in chips (1 and 2 by default).

## Betting

- Fold, check, call, or raise to an amount (Min, half the pot, the pot, or all in are one tap each).
- **House choice:** a raise must be at least the size of the last full raise (or the big blind). An all-in smaller than a full raise must be called, but does not let players who already acted raise again.
- Side pots are built from what each player put in. A bet nobody can call goes back to its owner. Ties split the pot, and an odd chip goes to the first winner left of the button.
- Hands are the best five of seven cards; A-2-3-4-5 is the lowest straight; suits never break ties.
- Only players who reach a showdown show their cards. If everyone else folds, the winner does not show.

## Scoring

Each hand is one round in the table's history:

- `chips won = stack at the end of the hand - stack at the start` (a re-buy counts as chips put in).
- Chips become the table's unit at the host's whole-number ratio, `chips : units` (1 : 1 by default). Two whole numbers keep the arithmetic exact.
- **The session is converted as a whole, never hand by hand.** Each hand carries everyone's chips from the earlier hands, and its units are `convert(earlier + this hand) - convert(earlier)`. So the running totals always equal the whole session converted once, and small wins are not rounded away.
- When a conversion leaves a remainder, the largest remainders round up, so every hand still adds to exactly zero. When two remainders are equal, the seat that gets the extra unit moves along with the hand number, so no seat always gets it.

Example, ratio 3 chips : 1 unit. A wins 1 chip from B in each of three hands. Hand by hand each would round to 0, but the session is 3 chips, so after the third hand the totals are **A +1, B -1** (the same as one 3-chip win). Example, ratio 100 : 50, chips won +800, -100, -700: **+400, -50, -350.** (`test/poker.test.ts`)

Past hands cannot be voided, because every hand starts from the stacks the last one left.

## Turn time and computer players

- The host can set a time per turn when dealing. When it runs out the player checks if that is free, otherwise folds.
- Easy calls a lot, rarely raises and sometimes folds to big bets. Normal judges its hand with a quick strength guess against the pot odds and is off about one action in seven. Hard estimates how often its hand wins against random hands, compares that with the pot odds, raises for value and bluffs a little from late position.
- Computers see only their own two cards and the table.

## Not built

Tournaments (a payout table by finishing place), limit and pot-limit betting, and a blinds timer.

## Open questions

1. Should a busted player have the choice not to re-buy (sit out)?
