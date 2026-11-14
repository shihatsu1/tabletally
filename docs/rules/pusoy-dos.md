# Pusoy Dos (Filipino Big Two)

Status: research draft for review. Items marked **[UNVERIFIED]** rest on one source or conflicting sources.

TableTally is a score tracker. This file covers only what the app must know: player counts, how a round ends, and how each scoring system turns a result into points.

## Sources

- [S1] Pagat, "Big Two": <https://www.pagat.com/climbing/bigtwo.html>
- [S2] Wikipedia, "Big two" / "Pusoy Dos": <https://en.wikipedia.org/wiki/Pusoy_Dos>
- [S3] CardRules+, "How to Play Pusoy Dos": <https://cardrulesplus.com/games/pusoy-dos/>
- [S4] PlayFaceToFace, "Pusoy Dos guide": <https://www.playfacetoface.com/pusoydos/guide> (a platform's own ruleset, not a Philippine standard)

No Filipino-language or Philippine-published source was found in this pass. Philippine claims below rest on S3 and S4, which agree with each other. A native-speaker check by the maintainer is needed.

## Players and deal

| Players | Deal | Source |
|---|---|---|
| 4 (standard) | 13 cards each, all 52 dealt | S1, S2, S3 |
| 3 | **Conflict.** International: 17 each, last card face up in the centre, taken by the holder of the lowest card [S1]. Philippine: remove one suit (usually diamonds), 13 each [S3] **[UNVERIFIED]** | S1, S3 |
| 2 | Varies: 17 each (18 set aside), 21 each (10 unused), or 13 each (26 unused) [S1]. S3 and S4 give no 2-player deal | S1 |

**Why it matters to scoring:** the cards-left penalty tiers are relative to the starting hand size. The app stores a `startingHandSize` per player count, defaults 13/13/17 by source, and the host can override it.

## Cards and play (reference only)

- Rank low to high: 3 4 5 6 7 8 9 10 J Q K A 2.
- **Philippine suit order, high to low: diamonds, hearts, spades, clubs** [S3, S4]. International Big Two uses spades, hearts, clubs, diamonds [S1], and some tables use it, so the host should confirm.
- **Philippine opening card: 3 of clubs** must be in the first play of the match [S3, S4]. International play opens with the 3 of diamonds [S1].
- Plays: single, pair, triple, or five-card poker hand (straight, flush, full house, four of a kind plus a card, straight flush). A play can only be beaten by the same shape. Three passes clear the table.
- Five-card hand details (A-2-3-4-5 ranking, flush ordering) differ between sources and do not affect scoring. Not covered here.

## How a round ends

The first player to empty their hand wins the round. The others cannot beat the final play [S1]. The winner leads the next round [S3, S4].

Round input the app needs: **winner**. Optional, depending on the scoring system: cards left per other player, and how many 2s were in the winner's final play.

## Scoring systems

All amounts are integers. `stake` is the host's integer unit (points or minor currency units) and can change between rounds. Net amounts always sum to zero.

### 1. Winner-take-all (fixed stake per loser)

Each loser pays `stake` to the winner. Cards left are irrelevant.

- Winner: `+stake * (n - 1)`. Each loser: `-stake`.
- Not described in S1 to S4. It is the system in the project's real-game test case (anonymized), so it is a required system. **[UNVERIFIED as a documented convention]**

Worked example, 4 players, stake 50, A wins: A +150, B -50, C -50, D -50.

**Regression test (from a real game, anonymized):** players A, B, C, D, 15 rounds with the winners in order.

| Stake | Winners |
|---|---|
| 50 | A, B, B, D, C |
| 200 | D, D, B, C, B, C, A, D |
| 300 | A, C |

Net for player `i` = `sum(stake * (n * wins_at_stake - rounds_at_stake))` over stakes. Total stakes `50*5 + 200*8 + 300*2 = 2450`.

| Player | Stake-weighted wins | Net |
|---|---|---|
| A | 50 + 200 + 300 = 550 | 4 * 550 - 2450 = **-250** |
| B | 100 + 400 = 500 | 4 * 500 - 2450 = **-450** |
| C | 50 + 400 + 300 = 750 | 4 * 750 - 2450 = **+550** |
| D | 50 + 600 = 650 | 4 * 650 - 2450 = **+150** |

Sum = 0. Expected settlement (3 payments): **B pays C 450; A pays C 100; A pays D 150.** This matches the target in the project brief; the arithmetic was checked by hand here and will become the first unit test.

### 2. Cards-left penalty (per-card, with tiers)

The winner scores 0. Each other player scores a penalty based on cards left [S1]:

| Cards left (13-card hand) | Penalty per card | Source |
|---|---|---|
| 1 to 9 | 1 | S1 (basic game), S3 |
| 10, 11, 12 | 2 (doubled) | S1, S3 |
| 13 | 3 (tripled, 39 points) | S1, S3 ("hindi nakatira") |

Variations from S1, each a host option:
- Tiers: double at 8 or 9, triple at 10 to 12, quadruple at 13.
- Stacked doubling: double at 8+, double again at 10+, and so on.
- No tiers: 1 point per card.
- Doubling only for the player who led the first card (S1, "starter-only").
- Extra penalties for holding the 2 of diamonds (-1) or all four 2s (-4) at round end [S3 only] **[UNVERIFIED]**.

**How penalties become money.** Two settlement modes, both from [S1] and [S3]:
- **Winner-only:** the winner collects each loser's penalty. Losers do not pay each other.
- **Pairwise:** every pair settles the difference in their penalties.

Worked example, 4 players, stake 1 per point, A wins; B has 5 cards left, C has 10, D has 13.
Penalties: B 5, C 10 * 2 = 20, D 13 * 3 = 39. A 0.

| Player | Winner-only | Pairwise (`sum_s - n * s_i`, sum_s = 64) |
|---|---|---|
| A (0) | +64 | 64 - 0 = +64 |
| B (5) | -5 | 64 - 20 = +44 |
| C (20) | -20 | 64 - 80 = -16 |
| D (39) | -39 | 64 - 156 = -92 |
| Sum | 0 | 0 |

Note the winner-only table has B losing 5 while pairwise has B gaining 44. They are different systems and the host must choose one.

### 3. Deuce multiplier on the winner's final play

Applies on top of system 1 or 2.

- S1 (Pusoy Dos entry): if the winner's last play contains 2s, the winner scores 2 for one 2, 4 for two, 8 for three, 16 for four. As a multiplier: `2^k` for `k` 2s in the final play, `k` from 1 to 4.
- S1 (separate variation): all-2s final play doubles the others' penalties.
- S2: doubles if the winner's last play is a 2, a four of a kind, or a straight flush.

The exact Philippine convention is **[UNVERIFIED]**. The app makes it a host option: multiplier mode `off`, `x2^k`, or `x2 once`, plus an optional list of extra doubling hands.

Worked example, winner-take-all, stake 50, 4 players, A wins with a pair of 2s as final play: `k = 2`, multiplier 4, each loser pays 200, A +600, others -200.

### 4. Play-until-one-remains (placement points)

Play continues after the first player goes out. Finishing order scores **5, 3, 1, 0** for 1st to 4th in 4 players [S1, "play-until-one-remains version"]. S1 does not say how the points settle, and the 3-player and 2-player point tables are not given. **[UNVERIFIED]** The app will let the host edit the table per player count.

Pairwise settlement: net for player `i` = `stake * (n * p_i - sum_p)`.
Worked example: order A, B, C, D gives points 5, 3, 1, 0 and sum 9. Stake 10: A `10 * (20 - 9) = +110`, B `+30`, C `-50`, D `-90`. Sum 0.

### 5. Generic pairwise settlement

Systems 2 and 4 use the pairwise form. For score vector `s`, net_i = `stake * sum_j (s_j - s_i)` where lower is better (penalties), or `(s_i - s_j)` where higher is better (placement points).

## Input screen proposal (phone)

1. Tap the winner. In winner-take-all mode the round is saved.
2. Cards-left mode: after the winner, a stepper row per loser (default = starting hand size minus 0, tap to adjust). Penalty shown live.
3. Deuce option: chip row `0 1 2 3 4` for the number of 2s in the final play.
4. Stake shown at the top; tap to change for the next round.

## Implementation status (build step 3)

Implemented in `src/games/pusoy-dos/index.ts` and tested in `test/pusoy-dos.test.ts` against every worked example above, at 2, 3 and 4 players:

- Scoring systems 1 to 4 as host options: winner-take-all, cards-left (tier presets: standard, tiered-8, flat; winner-only or pairwise settlement), and play-until-one-remains placement with editable points.
- Deuce multiplier as `off`, `pow2` (2, 4, 8, 16) or `double-once`.
- The real 15-round game replays through the real module and gives C +550, D +150, A -250, B -450 and the three expected payments.
- The default is winner-take-all, with the deuce multiplier off (the user's group plays winner takes all with 13 cards each). The penalties for cards left are an optional scoring system, chosen **when the table is created** (the create-table form shows the options) or on the table screen before the first round. Options lock once the first round is saved.

Defaults chosen where the sources conflict, all changeable by the host: 13 cards dealt for every player count (17 is an option), winner-only settlement, placement points 5/3/1/0 for four players and 3/1/0 and 1/0 as unverified starting values for three and two players.

Not implemented: stacked doubling, starter-only doubling, the 2-of-diamonds and four-2s extras (single source), Taiwan fixed payments, custom tier editing (presets only).

## Open questions for the maintainer

1. Philippine 3-player deal (remove a suit vs 17 cards)? 
2. Is the deuce multiplier `2^k` as in S1, or only a single x2?
3. Is the pairwise or the winner-only penalty settlement the norm in your group?
4. Is "winner-take-all" in your group always `stake` from every loser? (The regression case assumes yes.)


## How other apps and sites score it (checked 2026-11-13)

No page found documents Tongits Go's own Pusoy Dos, so nothing could be copied from it. Other apps and guides agree on the shape: the first player out wins and everyone else is charged for cards left.

- Flat 1 point per card left, doubled at 10-12 cards, tripled at 13 cards (the player never played). Two guides give this, and it is the `standard` tier preset already in the app.
- A band style (low penalty for 1-3 cards, moderate 4-6, heavy 7+, a "burn" at 13) with no numbers published. The `tiered-8` and `flat` presets, or editing the tiers, cover it.
- One strategy guide adds an extra 4 points for holding all four 2s at the end. It is called a house rule and one source only, so it is not built.
- At least one app lets the table switch card penalties on or off, which matches the app's winner-take-all (no penalties) versus cards-left choice.
- Money games settle a fixed peso amount per point after each hand. The app never settles money.
- Suit order and the 2s disagree between sources, so the helper and rules follow the Philippine order and the host confirms.

Sources: [CardRules+](https://cardrulesplus.com/games/pusoy-dos/), [Okbet guide](https://games.okbet.com/how-to-play-pusoy-dos-rules-ranking-online/), [PlayFaceToFace](https://www.playfacetoface.com/pusoydos/guide), and a Philippine App Store listing for a Pusoy Dos app.


## Digital play (in the app)

Used when a table is created with "Play in the app". The app shuffles, deals and enforces these rules; the scoring options above (winner takes all, penalties for cards left, play until one remains, deuce multiplier) apply unchanged and the result goes through the same scorer.

- Ranks low to high 3 4 5 6 7 8 9 10 J Q K A 2. Suits low to high clubs, spades, hearts, diamonds.
- Each player is dealt the "cards dealt" option (13 by default, 17 offered for cards-left), fewer when the deck cannot cover the table.
- **[UNVERIFIED choice]** The holder of the lowest dealt card (normally the 3 of clubs) leads every hand, and the first play must contain that card. Some tables let the previous winner lead instead.
- Plays: single, pair, triple, or five cards (straight < flush < full house < four of a kind plus one < straight flush). Same size as the lead, and higher. Equal ranks are broken by suit (pairs by the higher card). Straights use five ranks in a row without wrapping; J-Q-K-A-2 counts.
- **[UNVERIFIED choice]** Flushes compare card by card from the highest; full houses by the triple; four of a kind by the four.
- You may pass unless you are leading. **[UNVERIFIED choice]** After passing you are out of that trick. When everyone else has passed, the player of the last play leads again (the next player in seat order if they went out).
- The first player out wins the hand (all scoring systems except "play until one remains", which goes on until one player is left).
- The deuce multiplier counts the 2s in the winner's final play.
- Turn limit: optional, chosen when the host deals. When it runs out, a safe move is played for the player (a pass, or the lowest card when leading).
- Computers: Easy plays a random legal move (passes about 3 times in 10 when it can). Normal keeps sets together, saves 2s and is a little careless (about 1 move in 4 is random). Hard plans its hand into the fewest plays, counts the cards already played, and blocks a player who is one card from going out. Computers see only their own cards and what is on the table.
