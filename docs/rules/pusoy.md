# Pusoy (13-card Chinese poker)

How TableTally plays and scores Pusoy, the 13-card game (a different game from Pusoy Dos). The app deals, checks every hand and records the result. Choices we made where sources disagree are marked **house choice**; open questions are at the end.

## Players and deal

- 2 to 4 players, 13 cards each from one 52-card deck. With fewer than four players the other cards are not used.

## Setting the three hands

- Everyone splits their 13 cards into a **top** row of 3, a **middle** row of 5 and a **bottom** row of 5, at the same time and in secret.
- The bottom must be at least as strong as the middle, and the middle at least as strong as the top (a tie is allowed). **The app does not accept a hand set the wrong way round, so a foul cannot happen.**
- Five-card ranks: straight flush > four of a kind > full house > flush > straight > three of a kind > two pair > pair > high card. The top row of 3 can only be three of a kind, a pair or high card.
- **House choice:** A-2-3-4-5 is the lowest straight and A-K-Q-J-10 the highest; suits never break ties; a flush compares card by card from the highest; the middle is compared with the top by hand type, then by the deciding ranks.
- On screen the cards are held like a real hand: the top 3 at the back, then the middle 5, with the bottom 5 in front. Tap one card and then another to swap them. The row type is shown beside each row.

## Comparing hands

Each row is compared with the same row of **every** other player: top with top, middle with middle, bottom with bottom. A tie scores nothing. Winning all three rows against one player is a **scoop**.

### Point systems

New tables use a fixed system: each opponent pays 1 point for a net row win or 2 for a scoop; ties pay nothing. The legacy systems below remain available for existing tables.

| System | Each row | Winning 2 or 3 rows | Scoop (all 3) |
|---|---|---|---|
| **2-4** (legacy) | +1 / -1 | +1 more | 3 + 1 = 4 |
| **1-6** | +1 / -1 | nothing | 3 + 3 = 6 |

Both bonuses can be changed by the host. The units are multiplied by the stake.

Example, 3 players, stake 1. A vs B: A wins top and bottom, B the middle. A vs C: A wins all three. B vs C: B wins top and middle.

| Player | 1-6 | 2-4 |
|---|---|---|
| A | +1 + 6 = **+7** | +2 + 4 = **+6** |
| B | -1 + 1 = **0** | -2 + 2 = **0** |
| C | -6 - 1 = **-7** | -4 - 2 = **-6** |

(`test/pusoy.test.ts`)

### Royalties (on by default)

Bonus units for strong rows, paid by every other player by default (or only by players whose row you beat). They are added to the row result. The default is the **classic** table: three of a kind on top 3, full house in the middle 2, four of a kind in the middle 4, straight flush in the middle 5, royal flush in the middle 5, four of a kind at the bottom 4, straight flush at the bottom 5, royal flush at the bottom 5. Two other tables are offered (Wikipedia, PlayTime) and every amount can be edited. **These defaults follow Philippine card-app guides and are not checked against an official rulebook.**

### Naturals (on by default)

A player dealt a special 13-card hand may declare it instead of setting rows, and is paid its value by every other player without comparing rows; two naturals compare by value, and equal ones draw. On by default: **dragon** (one card of every rank) 13; six pairs 3; three straights 3; three flushes 3. Every other natural is off (0) and can be switched on: four triplets, same colour, all low or all high, three four-of-a-kinds, three straight flushes, twelve royals, pure dragon. **House choice:** aces count high in "all high", and "six pairs" allows the spare card.

## After every hand: everyone's rows

When the last player has set (or the time runs out), every hand is shown to everyone. Each player's three rows are drawn as cards, with the hand type of each row. On your phone every other player's rows are marked **✓** (your row beat theirs), **✗** (theirs won) or **=** (tie), next to the points that changed hands between you and them and their total for the hand. The breakdown comes from the scorer itself, so it always matches the recorded totals. After the next deal, "Last hand" shows it again.

## Turn time and computer players

- The host's time per turn is multiplied by 6 for setting rows (30 seconds gives 3 minutes), on one clock shared by everyone still setting. When it runs out, a valid arrangement is set for each player still setting.
- Easy sets a random valid hand and declares a natural half the time. Normal sets the strongest-looking valid hand, but about 1 hand in 4 sets any valid hand. Hard picks the arrangement with the best chance of winning rows, counting the bonuses. All of them see only their own cards.
- Measured: Hard earns about +2.9 points a hand against three Normals and +12 against three Easys; Normal about +8 against three Easys.

## Not built

Surrender, a bonus for scooping every opponent, and a suggestion for how to set your cards (a deliberate choice: players set their own hands).

## Open questions

1. Royalty and natural amounts used by Philippine groups (the defaults come from app guides, not a rulebook).
2. Should royalties replace the row point instead of adding to it?

## Sources

- [S1] Wikipedia, "Chinese poker": <https://en.wikipedia.org/wiki/Chinese_poker>
- [S2] OfficialGameRules, "Chinese Poker (Pusoy)": <https://officialgamerules.org/game-rules/chinese-poker-pusoy/>
- [S3] PlayTime, "Pusoy Guide": <https://playtime.fit/pusoy/> (an app's guide with a Philippine framing)

No Philippine-published rulebook was found.
