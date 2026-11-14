# Pusoy Dos (Filipino Big Two)

How TableTally plays and scores Pusoy Dos. The app deals, checks every play and records each hand; this page is the reference for what it does. Choices we made where sources disagree are marked **house choice**, and questions still open are listed at the end.

## Players and deal

- 2 to 4 players, one 52-card deck, no jokers. 13 cards each by default.
- Three players may choose 17 cards each (the deck covers 3 x 17 = 51). A hand size the deck cannot cover for everyone is refused, so 17 is not offered for four players.
- With fewer than four players the cards that are not dealt stay out of the hand.

## Cards and plays

- Ranks low to high: 3 4 5 6 7 8 9 10 J Q K A 2.
- Suits low to high: clubs, spades, hearts, diamonds (the Philippine order [S3, S4]; international Big Two differs [S1]).
- Plays: a single, a pair, a triple, or five cards. Five-card hands rank straight < flush < full house < four of a kind plus one card < straight flush.
- A play must be the same size as the one on the table and higher. Equal ranks are decided by suit; a pair by its higher card.
- Straights are five ranks in a row without wrapping, and J-Q-K-A-2 counts. **House choice:** flushes compare card by card from the highest, full houses by the triple, four of a kind by the four.
- **House choice:** the holder of the lowest card dealt (normally the 3 of clubs) leads every hand, and that first play must contain it. Some tables let the previous winner lead.
- You may pass unless you are leading. **House choice:** after passing you are out of that trick. When everyone else has passed, the player of the last play leads again (or the next player in seat order if they have gone out).
- The first player out wins the hand. In "play until one remains" play continues until one player is left.

## Scoring

Every amount is a whole number, and each hand sums to zero. The stake is set by the host when dealing and can change from hand to hand.

### Winner takes all (default)

Each loser pays the stake to the winner: winner `+stake x (players - 1)`, each loser `-stake`. Cards left do not matter. This is how the maintainer's group plays.

Example, 4 players, stake 50, A wins: **A +150, B -50, C -50, D -50.** (`test/pusoy-dos.test.ts`)

**Canonical session** (a real game, anonymised; it is the project's regression test): players A, B, C, D, 15 hands with these winners.

| Stake | Winners |
|---|---|
| 50 | A, B, B, D, C |
| 200 | D, D, B, C, B, C, A, D |
| 300 | A, C |

A player's total is `sum over stakes of stake x (4 x wins - hands)`. The stakes add to 50 x 5 + 200 x 8 + 300 x 2 = 2450.

| Player | Stake-weighted wins | Total |
|---|---|---|
| A | 50 + 200 + 300 = 550 | 4 x 550 - 2450 = **-250** |
| B | 100 + 400 = 500 | **-450** |
| C | 50 + 400 + 300 = 750 | **+550** |
| D | 50 + 600 = 650 | **+150** |

Checked in `test/ledger.test.ts`, `test/pusoy-dos.test.ts` and `test/room.test.ts`.

### Penalties for cards left (optional)

The winner scores 0 and each other player is charged per card still held [S1, S3]:

| Cards left (13-card hand) | Per card |
|---|---|
| 1 to 9 | 1 |
| 10 to 12 | 2 |
| 13 (never played a card) | 3 |

Presets: **standard** (above), **tiered-8** (1 / 2 from 8 / 3 from 10 / 4 at 13) and **flat** (1 per card). With 17-card hands the top tier still means "never played a card": 13 to 16 cards pay the 10+ rate, and only 17 pays the top rate. (`test/pusoy-dos.test.ts`, "17-card hands")

Two ways to settle the penalties:

- **Winner-only:** the winner collects every loser's penalty.
- **Pairwise:** every pair settles the difference between their penalties.

Example, stake 1, A wins, B holds 5, C 10, D 13. Penalties: B 5, C 20, D 39.

| Player | Winner-only | Pairwise |
|---|---|---|
| A | +64 | +64 |
| B | -5 | +44 |
| C | -20 | -16 |
| D | -39 | -92 |

(`test/pusoy-dos.test.ts`)

### 2s in the winning play (optional)

Multiplies the payment when the winner's last play contains 2s: **x2 per 2** (2, 4, 8, 16 for one to four 2s) or **x2 once**. Example, winner takes all, stake 50, A goes out with a pair of 2s: x4, so each loser pays 200 and **A +600**. (`test/pusoy-dos.test.ts`)

### Play until one remains (optional)

Play continues after the first player goes out, and the finishing order earns points: 5 / 3 / 1 / 0 for four players [S1]. **House choice:** 3 / 1 / 0 for three and 1 / 0 for two; the host can change them. Pairwise: `net = stake x (players x points - total points)`.

Example, order A, B, C, D, stake 10, points total 9: **A +110, B +30, C -50, D -90.** (`test/pusoy-dos.test.ts`)

## Turn time and computer players

- The host can set a time per turn when dealing. When it runs out, a safe move is played: a pass, or the lowest card when leading.
- Easy plays a random legal move and passes about 3 times in 10 when it could play. Normal keeps sets together, saves its 2s and makes a random move about 1 time in 4. Hard plans its hand into the fewest plays, counts the cards already played and blocks a player who is one card from going out.
- Measured over many hands: Hard wins about 32% against three Normals (25% would be even), and Normal about 61% against three Easys.
- Computers see only their own cards and the table.

## Not built

Stacked doubling, doubling only for the starting player, extra penalties for holding the 2 of diamonds or all four 2s (one source only [S3]), and editing tiers card by card (presets only).

## Open questions

1. Three players in the Philippines: 17 cards each, or remove a suit and deal 13? [S1, S3 disagree]
2. Does the 2s multiplier double per 2, or only once?
3. Who leads the next hand: the 3 of clubs, or the previous winner?

## Sources

- [S1] Pagat, "Big Two": <https://www.pagat.com/climbing/bigtwo.html>
- [S2] Wikipedia, "Big two": <https://en.wikipedia.org/wiki/Big_two>
- [S3] CardRules+, "How to Play Pusoy Dos": <https://cardrulesplus.com/games/pusoy-dos/>
- [S4] PlayFaceToFace, "Pusoy Dos guide": <https://www.playfacetoface.com/pusoydos/guide> (one platform's own rules)

No Philippine-published rulebook was found. S3 and S4 agree on the Philippine suit order and the 3-of-clubs opening.
