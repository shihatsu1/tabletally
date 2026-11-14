# Tong-its (Tongits)

How TableTally plays and scores Tong-its. The app deals, checks every move and records each hand. Choices we made where sources disagree are marked **house choice**; open questions are at the end.

## Players and deal

- Exactly 3 players, one 52-card deck, no jokers [S1, S2].
- The dealer gets 13 cards and opens by discarding; the others get 12; the remaining 15 cards are the stock. **House choice:** the dealer is picked at random each hand (Pagat has the previous winner deal [S1]).

## Melds

- **Set:** 3 or 4 cards of one rank.
- **Run:** 3 or more cards in a row in one suit. The ace is low only (A-K-Q is not a run) [S1].
- A run grows at either end; a set only up to four.
- A four of a kind may be shown face down as a **secret**: the others see only that it exists. It counts as having shown a meld, and nothing can be added to it.
- Card points for comparing hands: A = 1, 2 to 10 face value, J, Q, K = 10. Lower is better.

## A turn

1. Draw from the stock, or take the top discard if it makes a meld with cards in your hand. A taken discard must be shown in a meld at once, and you cannot first use up the cards that meld needs.
2. Show melds, and lay cards off onto any shown meld (*sapaw*).
3. Discard one card.

While a hand is on, your phone shows **Points in hand**: what your cards would count if the hand ended now, after the best grouping.

## How a hand ends

| Ending | What happens |
|---|---|
| **Tong-its** | A player uses every card (melds, lay-offs, or the last card discarded). |
| **0 points (house rule)** | As soon as every card in a player's hand fits a meld (0 points), the hand ends as a Tong-its for that player, without laying the melds down. It is checked after each of their moves and when their turn starts (the dealer's opening 13 cards too). Melds still in the winner's hand count as if laid down: a four of a kind as a secret set, a run of five or more as a long run. The user's group rule, 2026-11-14. |
| **Draw (fight)** | At the start of your turn, if you have shown a meld, you may call Draw. Players with no meld shown fold on their own; the others fold or challenge. If everyone folds the caller wins an ordinary hand. Otherwise the lowest total wins and a tie goes to the challenger. A player an opponent has laid a card off onto (*sapaw*) cannot call Draw on their next turn (as the online apps play it; the user's group rule, 2026-11-14). |
| **Stock runs out** | The player who drew the last card finishes the turn; then the lowest total among players who showed a meld wins. **House choice:** a tie goes to the player who would have drawn next. |

**Burned (*sunog*):** a player who never showed a meld by the end of the hand.

**Sagasa** (**house choice**): a fourth card laid onto your own shown set of three, when you drew that card from the stock this turn.

## Scoring

The winner collects from each loser, in chips times the stake (points per chip, set when the host deals).

| Item | Online app style (the only preset) | Pagat (no longer offered) |
|---|---|---|
| Ordinary win | 1 | 1 |
| Tong-its | 1 more (2 in all) | 3 instead of 1 |
| Won a challenged Draw | 2 more (3 in all) | 3 instead of 1 |
| Each burned loser pays extra | 1 | 1 |
| Each ace the winner holds or showed | 1 (the maintainer's group; the app pays 0) | 1 |
| Each secret four of a kind | 2 | 3 |
| Sagasa | 1 | 0 |
| Runs of five or more | 0 | 0 (an option) |

Every amount is a host option before the first hand. The app offers one preset, **online app style**, because the maintainer's group plays the app's way, with 1 chip per ace added at their request (2026-11-14). The Pagat column is kept because tables created before then may use it; they still score the same. Its amounts come from a third-party review of the Tongits Go app (a real-money app, so the page is not linked); they are not checked against the app's own help. That app also takes 5% of every payout as a house cut; TableTally has no house and does not.

**House choice:** a challenged Draw pays the "won a challenged Draw" amount whoever wins it; no source says what a losing challenger pays.

### The pot

There is always a pot. Before every deal each player puts in the ante (2 chips by default, at least 1). A player who wins two deals in a row takes the pot, which holds one ante from each player for every deal since it was last taken. In the ledger this is recorded as each loser paying the winner `ante x deals` in that hand, so totals always add to zero and nothing is held.

### Worked examples (Pagat amounts, stake 1)

1. A wins on points holding 2 aces; B showed a meld; C is burned. B pays 1 + 2 = 3; C pays 1 + 2 + 1 = 4. **A +7, B -3, C -4.**
2. A goes out (Tong-its) with one secret four; nobody burned; no aces. Each pays 3 + 3. **A +12, B -6, C -6.**
3. A wins a challenged Draw; C is burned. B pays 3; C pays 3 + 1. **A +7, B -3, C -4.**

Online app style: C wins a challenged Draw with one secret four and a Sagasa, and A is burned. Each loser pays 1 + 2 (challenge) + 2 (secret) + 1 (Sagasa) = 6, and A pays 1 more: **A -7, B -6, C +13.** (`test/tong-its.test.ts` checks all of these.)

## Turn time and computer players

- The host can set a time per turn when dealing. When it runs out the rest of the turn is played for the player: draw from the stock, show a taken discard's meld if one is owed, then discard the highest card that is not in a suggested meld (or fold a Draw call).
- Easy discards at random and often does not show melds. Normal groups its hand for the fewest points, takes useful discards and discards at random about one time in three. Hard also keeps its discards safe from what has been played, and answers a Draw by comparing its total with a guess at the others'.
- Measured: Hard wins about 45% against two Normals (33% would be even); Normal about 64% against two Easys.

## Not built

The 5% house cut (no house), a joker mode, an instant win for a dealt hand that is all melds, and a "three wins in a row" pot.

## Open questions

1. What does a challenger who loses a Draw pay?
2. Does your group's pot carry past two deals, or need three wins?
3. The Tongits Go amounts above: do they match the app's own help screen?

## Sources

- [S1] Pagat, "Tong-its": <https://www.pagat.com/rummy/tong-its.html> (the main source for the standard rules and amounts)
- [S2] Wikipedia, "Tong-its": <https://en.wikipedia.org/wiki/Tong-its>
- What we borrowed from the Tongits Go app's screen design is in `docs/design/tongits-go-reference.md`.
