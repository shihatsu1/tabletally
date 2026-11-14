# Pusoy (13-card Chinese poker)

Status: research draft for review. Items marked **[UNVERIFIED]** rest on one source or conflicting sources. Pusoy here is the 13-card game, a different game from Pusoy Dos.

## Sources

- [S1] Wikipedia, "Chinese poker": <https://en.wikipedia.org/wiki/Chinese_poker>
- [S2] OfficialGameRules, "Chinese Poker (Pusoy)": <https://officialgamerules.org/game-rules/chinese-poker-pusoy/>
- [S3] PlayTime, "Pusoy Guide": <https://playtime.fit/pusoy/> (app-site, Philippine framing)
- [S4] Pokeree, "Chinese Poker rules": <https://www.pokeree.com/rule/detail/id-16.html> (seen in search only, not read)

No Philippine-published source was found. Treat all Philippine house-rule claims as **[UNVERIFIED]** until a native player confirms them.

## Players and deal

- 2 to 4 players, 4 is standard because all 52 cards are used [S1, S2, S3]. Standard deck, no jokers, 13 cards each. With fewer than 4 players the extra cards are set aside [S2].

## Setting hands, order and fouls

- Each player splits 13 cards into **back** (5), **middle** (5), **front** (3).
- Strength order: back >= middle >= front. The front can only be high card, a pair or three of a kind (no straights or flushes in the front, except as a natural) [S1, S2].
- A **foul** (mis-set, "miscall", "倒水") is an invalid arrangement. Penalties differ:
  - S2: the fouler automatically loses all three rows to every valid opponent.
  - S3: "typically 3 units forfeited", hand disqualified.
  - S1: penalised, amount not stated.
  - Royalties of a fouled hand are void in most rulesets.
- Both players fouled in the same pair: no source says. **[UNVERIFIED]** App default: no exchange between them.

## Pairwise comparison

Rows are compared front vs front, middle vs middle, back vs back, **against each opponent separately** [S1, S2]. A row tie scores 0.

A **scoop** (sweep, "全壘打" in S1) is winning all three rows against one opponent. S1 and S2 disagree on whether it adds a bonus and how much (see scoring systems).

## Scoring systems

All amounts are integers per pair, then summed for each player. `unit` is the host's stake. Net amounts always sum to zero.

### 1-6 system

- Each row won is +1 unit, lost is -1, tie 0.
- Scoop: S2 says a scoop is worth 6 in total (3 row points plus a 3-point bonus). S1's description of 1-6 has no scoop bonus. **Conflict; scoop bonus is a host option** (default +3 so a scoop is 6).

### 2-4 system

- Row win +1, loss -1, plus +1 for winning the majority of rows (2 or 3 of 3) [S1, S2].
- A scoop is therefore 3 + 1 = 4 [S2].

### Worked example (3 players, unit 1)

| Pair | Front | Middle | Back | Result |
|---|---|---|---|---|
| A vs B | A | B | A | A wins 2-1 |
| A vs C | A | A | A | A scoops C |
| B vs C | B | B | C | B wins 2-1 |

| Player | 1-6 (scoop = 6) | 2-4 (scoop = 4) |
|---|---|---|
| A | (+1) + (+6) = **+7** | (+2) + (+4) = **+6** |
| B | (-1) + (+1) = **0** | (-2) + (+2) = **0** |
| C | (-6) + (-1) = **-7** | (-4) + (-2) = **-6** |
| Sum | 0 | 0 |

The A-B pair under 2-4 follows S1's worked example (Amy/Bob): rows net +1, plus 1 majority bonus = 2; under 1-6 with no scoop involved the result is 1.

### Royalties (optional, vary by group)

Royalties are bonus units for strong hands, declared before the reveal. Sources give different tables, so the app uses a host-editable table with presets:

| Row / hand | S1 | S2 "classic" | S3 |
|---|---|---|---|
| Front three of a kind | 3 | 3 | 3 |
| Middle full house | 1 | 2 | not listed |
| Middle four of a kind | 3 | 4 | 4 |
| Middle straight flush | 4 | 5 | 5 |
| Middle royal flush | not listed | 5 | 10 |
| Back four of a kind | 2 | 4 | 2 |
| Back straight flush | 3 | 5 | 3 |
| Back royal flush | not listed | 5 | 5 |

Whether royalties are paid by **every** opponent regardless of who wins the row [S3], or only when the row is also won [S2, "some groups"], is a host option. Whether a royalty replaces or adds to the normal 1-unit row value is also a host option [S2: usually replaces].

### Naturals and specials (optional, off by default)

S1 lists special 13-card hands with Taiwanese/Chinese values: three flushes 3, three straights 4, six and a half pairs 6, four triplets 8, all one colour 10, all low or all high 12, three quads 20, three straight flushes 24, 12 royal alphabets 32, **dragon** (one of each rank) 36, pure dragon 108. S2 lists examples without values. S3 mentions none. The dragon the project brief mentions is therefore **[UNVERIFIED] for the Philippines**; the app will ship an empty, host-defined naturals table with S1's list as a selectable preset. A natural cannot be scooped [S1].

## Result entry: fastest accurate phone input

Three ways were considered:

| Option | Taps for 4 players | Verdict |
|---|---|---|
| A. Per pair, per row | 6 pairs x 3 rows = 18 | Slow, error-prone |
| B. Per hand outcome per pair | 6 | Loses row detail, needed for royalties and 2-4 |
| C. **Row ranking** | 3 (one drag/tap-order per row) | **Recommended** |

**Option C:** for each row (front, middle, back) the host taps players from best to worst. Tapping two players "equal" makes a tie group. Every pairwise result is derived exactly from the three rankings, so nothing is lost. Then toggles per player: `foul`, royalty chips (row + hand), natural. A matrix view (option A) stays available for corrections.

## Implementation status (build step 6)

Implemented in `src/games/pusoy/` and tested in `test/pusoy.test.ts` (each worked example above is a test; every random round is checked to be zero-sum, integer and bounded, at 2, 3 and 4 players):

- **Scoring:** every pair is scored on its own, then summed per player. `units = (rows won - rows lost)`, plus a **majority bonus** for winning 2 or 3 rows and a **scoop bonus** for winning all 3. The 1-6 preset is majority 0 / scoop 3 (a scoop pays 6); the 2-4 preset is majority 1 / scoop 0 (a 2-1 win pays 2, a scoop pays 4). Both bonuses can be edited.
- **Result entry:** the app never sees the cards. The host taps the players from best to worst in each of the three rows (a Tie button for equal hands, the last player filled in automatically), marks any **fouls**, and optionally royalties and naturals. A live preview shows everyone's result before saving.
- **Fouls:** the fouled player is left out of the rows and either loses all three rows to every valid player (default, counts as a scoop) or pays a flat number of units to each. Two players fouling exchange nothing with each other (my assumption, no source says).
- **Royalties (off by default):** three source tables as presets (classic, Wikipedia, PlayTime) and an editable table. Paid by every opponent, or only by opponents beaten in that row. They are added on top of the row result, not replacing it. A fouled hand earns none.
- **Naturals (off by default):** Wikipedia's list and values as the starting table (dragon 36, pure dragon 108, ...). A natural wins its value from each opponent without any row comparison; the higher natural wins its own value and equal naturals draw. Whether these exist in Philippine play is unverified.

Not implemented: surrender, a "sweep all opponents" bonus, and a helper that suggests how to set your 13 cards into front, middle and back (this would need a poker-hand ranker; see the questions below).

## Maintainer's answers (2026-11-13) and what the app now does

1. **Point system: 2-4.** A 2-1 win pays 2, a scoop pays 4. This is the default (1-6 is still a preset).
2. **Foul: lose all rows to everyone** (counts as a scoop). Default, unchanged.
3. and 4. **Royalties and special hands follow the Philippine apps (Tongits Go style).** No official rulebook was found for that app, so the figures come from Philippine card-site guides and are **[UNVERIFIED]**:
   - Royalties on, "classic" table, paid by every opponent: three of a kind in front 3, full house in middle 2, four of a kind 4, straight flush 5.
   - Naturals on: six pairs 3, three straights 3, three flushes 3, **dragon 13** (wins from every opponent without comparing rows). Every other natural is off (amount 0); the host can edit any amount or load the Wikipedia list.
5. **Hand-setting helper: no for Pusoy** (removed 2026-11-13 on request); only Pusoy Dos and Tong-its have one. The Pusoy Dos helper runs on the player's own phone and sends nothing to the Worker.
   - Pusoy Dos (`src/games/pusoy-dos/hand.ts`): pick your cards and it shows the fewest plays that go out (single, pair, triple, straight, flush, full house, four plus one, straight flush), weakest to strongest, a CARDS box, and a warning about 2s when the deuce option is on. Straight rules differ by table; it uses 3 up to 2 without wrapping.


## Digital play (in the app)

Used when a table is created with "Play in the app" (2 to 4 players; computers can fill seats). The scoring options above (point system, royalties, naturals) apply unchanged and the result goes through the same scorer.

- 13 cards each from a shuffled 52-card deck (fewer players leave cards unused).
- **Everyone sets their three rows at the same time and in secret.** When the last player has set (or the time limit runs out) all hands are revealed together and compared row against row, against each opponent.
- The host's time per turn is multiplied by 6 for setting rows (for example 30 seconds gives 3 minutes), and one shared clock runs for everyone still setting. When it runs out, a safe arrangement is set for each player who is still pending.
- **The app does not accept a mis-set hand**, so a foul cannot happen in digital play. The back must be at least as strong as the middle, and the middle at least as strong as the front (a tie is allowed).
- Hand ranks (five cards): straight flush > four of a kind > full house > flush > straight > three of a kind > two pair > pair > high card. **[UNVERIFIED choice]** The wheel (A-2-3-4-5) is the lowest straight and A-K-Q-J-10 the highest; suits never break ties; a flush is compared card by card from the highest. The front (three cards) is three of a kind > pair > high card; a five-card middle is compared with the front by hand type, then by the deciding ranks.
- Royalties are detected from the rows (three of a kind in front, full house / four of a kind / straight flush / royal flush in the middle, four of a kind / straight flush / royal flush in the back) and paid as set in the options.
- **Naturals:** a player dealt a natural that this table plays (value above 0) may declare it instead of setting rows, and is paid by every other player without comparing rows. Detected: three flushes, three straights, six pairs, four triplets, same colour, all low (2-8) or all high (8-A), three four-of-a-kinds, three straight flushes, twelve royals, dragon, pure dragon. **[UNVERIFIED]** Aces count high in "all high", and "six pairs" allows a spare card.
- Computers: Easy sets a random valid hand (and declares a natural half of the time). Normal sets the strongest-looking valid hand but now and then (about 1 hand in 4) just sets any valid hand. Hard picks the arrangement with the best chance of winning rows against a random hand, including the majority and royalty bonuses. All declare the best natural when it is allowed (Easy sometimes). Computers only see their own cards.
- The screen holds the 13 cards like a hand: 3 on top (the front), 5 in the middle, 5 at the bottom (the back), dealt in a random mix. A player taps one card, then another to swap them, so the rows are always 3-5-5. Rows are outlined once the player has started rearranging and the order is wrong, and the rules are behind a small toggle at the side (no header text). There is no card-setting suggestion for human players.
