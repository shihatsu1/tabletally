# Tong-its (Tongits)

Status: research draft for review. Items marked **[UNVERIFIED]** rest on one source or conflicting sources.

## Sources

- [S1] Pagat, "Tong-its": <https://www.pagat.com/rummy/tong-its.html> (primary for the standard scoring below)
- [S2] Wikipedia, "Tong-its": <https://en.wikipedia.org/wiki/Tong-its>
- [S3] Rummy Rule Book: <https://www.rummyrulebook.com/pages/tong-its/> (seen in search only)
- [S4] CardRules+, "How to Play Tongits": <https://cardrulesplus.com/games/tongits/> (seen in search only)
- App sites (Tongits Rush, Tongits Kingdom) were seen in search results only. They define secret melds and burn penalties differently. They are online-game rules, not table-game sources, so they are listed under variations and not treated as authority.

**Sources disagree on amounts and definitions. Amounts below are Pagat's. Every amount and rule is a host-editable option.**

## Players, deck, deal

- Exactly 3 players, one 52-card deck, no jokers [S1, S2].
- The dealer gets 13 cards, each other player 12. The rest is the face-down stock [S1, S2].
- First dealer is random. Afterwards the previous hand's winner deals [S1].

## Melds

- **Set:** 3 or 4 cards of the same rank.
- **Run:** 3 or more consecutive cards of one suit. Aces are low only (A-K-Q is not a run) [S1]. S2 calls a run of 4+ an "Escalera".
- A card belongs to one meld.
- Card values for totals: A = 1, J/Q/K = 10, others face value [S2].

## Turn (reference only)

Draw from the stock, or from the discard pile if the card forms a meld with your hand. Optionally expose melds and lay off cards onto any exposed meld (*sapaw*). Then discard [S1].

## How a hand ends

| Ending | Rule | Source |
|---|---|---|
| **Tong-its** | A player uses all cards in melds or lay-offs (or empties the hand) | S1, S2 |
| **Draw call (fight)** | An opened player calls Draw at the start of their turn. Others fold (caller wins) or challenge (lowest total wins; tie goes to the challenger) | S1, S2 |
| **Stock exhausted** | Hand ends after the drawer of the last card finishes. Opened players compare totals, lowest wins | S1, S2 |

**Burned (*sunog*, also *paksiw*):** a player who has not exposed any meld when the hand ends [S1, S2]. A hidden four of a kind counts as opening [S1].

**Hand outcome the app records:** winner, ending type, and per loser: burned yes/no. Per winner: number of aces in hand or own exposed melds, number of secret sets, and whether a run of 5+ was made (if that variant is on).

## Scoring (standard, per Pagat) in chips

The winner collects from **each** loser [S1]:

| Item | Chips | Source |
|---|---|---|
| Winning a hand (stock exhausted, or a fold) | 1 | S1 |
| Each ace the winner holds in hand or in their own exposed melds | +1 | S1 |
| Each burned loser pays extra | +1 (from that loser) | S1 |
| Each secret set of four (face down, or concealed in hand) | +3 | S1 |
| Winning by **Tong-its** | 3 instead of 1 | S1 |
| Winning a **challenged Draw** | 3 | S1 |

**Side pot [S1]:** before each deal every player adds 2 chips. A player wins the pot by winning two games in a row. Whether the pot keeps growing when nobody wins twice in a row is not stated. **[UNVERIFIED]** S2 says bets go to a pot won by two consecutive wins, with a variant needing three.

### Worked examples (3 players A, B, C; 1 chip = stake)

1. **Ordinary win.** A wins by lowest total. A holds 2 aces. B opened, C was burned.
   B pays 1 + 2 = 3. C pays 1 + 2 + 1 (burned) = 4. **A +7, B -3, C -4.** Sum 0.
2. **Tong-its with a secret set.** A goes out with one secret set of four, no aces held, B and C both opened.
   Each pays 3 (Tong-its) + 3 (secret set) = 6. **A +12, B -6, C -6.** Sum 0.
3. **Challenged Draw.** A calls Draw, B folds, C challenges and A has the lowest total. A wins a challenged Draw: each loser pays 3 (S1). If C is also burned, the extra 1 applies (burned player pays +1). **Outcome when a challenge fails is not described in S1.** **[UNVERIFIED]**

## Variations (each becomes a host on/off option)

| Variation | Source |
|---|---|
| Chips for secret sets / Tong-its / challenged Draw: 2 instead of 3 | S1 |
| Runs of 5 or more earn +3 extra chips | S1 |
| Ace bonus changed or removed. A scaled version pays "100 chips per ace" (app-site, unverified) | S1, app sites |
| Kings also count as bonus cards (some app sites) | app sites **[UNVERIFIED]** |
| Secret meld defined as 5+ cards, or 4 of a kind or a 5+ straight flush (online games) | app sites **[UNVERIFIED]** |
| *Sagasa*: a fourth card added to an opened set, drawn from the stock, counts as a secret | S2 (needs citation) **[UNVERIFIED]** |
| Pot: two consecutive wins, or three with an extra payment on the second | S1, S2 |
| Burned player simply loses the hand, no separate penalty | app sites **[UNVERIFIED]** |
| Immediate win if the starting 12 or 13 cards are already all melds ("Spread") | S2 **[UNVERIFIED]** |
| Joker mode (+2 jokers) with different payouts | S2 **[UNVERIFIED]** |
| Dealer rotation rule | S1 |

## Preset: "Tongits Go" app style

Tongits Go is an online, real-money app, so its pages are promotional and the rules below are **[UNVERIFIED]** until someone checks the in-game help. Source: a Tongits Go review page, <https://55bmw5.net/tongits-go-review/> (the CasinoPlus FAQ and a scoring-guide site could not be fetched).

- Card values: A = 1, 2 to 10 face value, J/Q/K = 10, lower is better. Matches S2.
- A **Fight** starts when a player lays down a meld that nobody has laid off on. The fought player accepts, declines, or is burned if they hold no melds or special melds.
- Settlement starts when the stock is empty. Payout multipliers are **added** per winning condition:

| Winning condition | Multiplier |
|---|---|
| Normal win | x1 |
| Tongits | x1 (so a Tongits win is 1 + 1 = 2 units, unlike Pagat's flat 3) |
| Win a challenge | x2 |
| Burned player | x1 |
| Secret meld | x2 |
| Sagasa | x1 |
| Bonus round | x1 |

- The page also multiplies the total by **0.95**. That is the platform's house cut. TableTally has no house, so the preset leaves it out. It is not part of a table game.
- Not stated: what a losing challenger pays, deal, pot, and whether "sum" adds the multipliers or the amounts. App default: add the multipliers, as in the Tongits Go example above.

The app ships two presets, **Pagat (standard)** and **Tongits Go (app style)**, both editable. Both are host options, not rules enforcement.

## Pot in the ledger

A running pot must keep the ledger zero-sum without handling money. Proposal: the pot is a **virtual account** that each deal's ante is moved into (-2 each), and its balance moves to the player who wins two in a row. Settlement therefore stays a single zero-sum set of net balances. This is a design decision for the maintainer.

## Result entry proposal

Tap winner, tap ending type (Tong-its / Draw won / Draw challenged / Stock out / Fold), then toggles: burned players, ace count stepper, secret-set stepper. The payment per loser is shown live. Pot updates itself.

## Implementation status (build step 5)

Implemented in `src/games/tong-its/` and tested in `test/tong-its.test.ts`, `test/hand.test.ts`, `test/clock.test.ts`:

- **Scoring:** three players, chips x "points per chip" per round. Both presets (Pagat standard, Tongits Go app style) and every amount are editable. Each of the three worked examples above is a test. The ending types are won on points, Tong-its, and won challenged draw. Burned losers, aces, secret sets, runs of five or more, Sagasa and the pot are all options. The Tongits Go preset adds chips instead of replacing them, as its page describes (unverified).
- **Defaults (user decision, 2026-11-13):** a new Tong-its table starts with the **Tongits Go app style** payments, and **there is always a pot** (ante 2 per player per deal, at least 1; it cannot be switched off). The Pagat preset is still available and also has the pot.
- **Pot:** modelled as "each loser also pays ante x deals to the winner" in the round where someone wins two in a row, so totals always stay at zero and no money is held. The entry screen suggests how many deals are in the pot.
- **Hand helper (private, on each phone, never sent to the table):** pick your cards and it shows the best way to group them into sets and runs, the points left over, other groupings, whether you can call Tong-its, four-of-a-kind secrets, aces held, which card to discard from a 13-card hand, and which cards would help from a smaller hand. It cannot see other players' cards. It was checked against an independent brute-force search.
- **Turn timer with pause by agreement (works in any game):** the host starts a timer of 15 to 90 seconds per turn. The player on the clock, or the host, passes the turn, and a turn that runs out rolls to the next player. Anyone can ask to pause, but the game only pauses if every player with a phone agrees within 20 seconds. If anyone says no, or the 20 seconds pass, the timer simply kept running. Players the host added by hand are not asked. Any player can resume. While a pause is being asked, and while the game is paused, a full-screen dialog blocks every phone so nobody can act. A turn that runs out is counted as a timeout for that player (shown on the clock, with a notice and a buzz) and play moves on to the next player. Tongits Go gives 10 seconds to draw and 20 to meld and discard, so 30 seconds is the default.

Not implemented: the Tongits Go 0.95 house cut (no house here), automatic Sagasa detection, who "folded", challenge-loss payment (the sources do not say), and a 17-card or joker mode.

## Open questions for the maintainer

1. Does your group use Pagat's amounts (1 / +1 per ace / +1 burned / +3 secret / 3 Tong-its), or others?
2. Is the pot played, and does it carry over past two games?
3. What does a challenger who loses pay?
4. Do you play Sagasa or Spread? Is there a joker mode?


## Digital play (in the app)

Used when a table is created with "Play in the app" (3 players; computers can fill the other seats). The payment options above apply unchanged; the app deals, enforces the turn rules and records the result.

- 52 cards. The dealer gets 13 and opens by discarding, the other two get 12, and the other 15 cards are the stock. **[UNVERIFIED choice]** The dealer is picked at random each hand (Pagat has the previous winner deal).
- A turn: draw from the stock, or take the top discard if it makes a meld with cards in your hand (you must show that meld at once, and you cannot use up the cards it needs first). Then show melds, lay cards off onto any shown meld (sapaw), and discard one card.
- Melds: sets of 3 or 4 of a rank; runs of 3+ in one suit with the ace low. A run grows at either end, a set only to four. A four of a kind can be shown face down (a secret: others see only that it exists, it counts as opened, and it cannot be added to).
- **Draw (fight):** at the start of your turn, if you have shown a meld, you may call Draw. Players who have not shown a meld fold on their own. The others fold or challenge. If all fold, the caller wins an ordinary hand. Otherwise the lowest hand total wins (A = 1, face cards 10) and a tie goes to the challenger. A challenged Draw is paid as "won a challenged draw" whoever wins it. **[UNVERIFIED]** What a losing challenger pays is not in the sources, so it follows the winner's ending.
- **Tong-its:** using every card (melds, lay-offs, or the last card discarded) ends the hand.
- **Stock out:** the player who drew the last stock card finishes their turn, then the lowest total among players who have shown a meld wins. **[UNVERIFIED]** A tie goes to the player who would have drawn next.
- **Burned:** anyone who never showed a meld when the hand ends.
- **Sagasa:** a fourth card laid onto your own shown set of three, if you drew that card from the stock this turn. **[UNVERIFIED]**
- The pot is worked out automatically: a player who wins two deals in a row collects it, and it holds one ante per deal since it was last emptied.
- Computers: Easy discards at random and often skips showing melds. Normal groups its hand to leave the fewest points, takes useful discards, and is a little careless (about one discard in three is random). Hard also keeps its discards safe using what has been played, and calls or answers a Draw by comparing its total with a guess at the others'. Computers only see their own cards and what is on the table.
