# Tongits Go: what the app looks like, and what we borrowed

Observed on 2026-11-13 by stepping through two public YouTube gameplay videos frame by frame. Nothing here is copied: these are descriptions in our own words, and every feature in TableTally is our own design and artwork.

- "How to Play Tongits Go Tagalog Tutorial": <https://www.youtube.com/watch?v=qTeW96qf_70> (the main Tongits table)
- "Super Tongits Tutorial - Tongits Go NEW GAMEPLAY": <https://www.youtube.com/watch?v=dqqHvVaxHU8> (lobby and the Super Tongits mini-game)
- A third video, "HOW TO PLAY TONGITS GO || ACTUAL ON GAME TUTORIAL", is a 7-year-old sideways recording of the old blue-table version and was not used.

The app is real-money oriented (coins, chip stores, cash-out videos), which TableTally deliberately is not.

## What the main table shows

- A turquoise felt table seen from above. Opponents sit at the top corners with a round photo or avatar, a name, a coin balance, and a small red badge with how many cards they hold.
- A **pot bar** at the top centre with the pot amount and two crowns beside it.
- Centre: the face-down stock with a number on it, and the face-up discard with an arrow showing whose turn is next.
- Melds laid down by each player appear as small groups of cards near their seat.
- Your hand is a fan of large cards along the bottom. Beside it a **POINT box** shows the points of your cards that are not in melds, and the number drops as you group them.
- Four action buttons: Drop, Fight, **Group** (auto-arranges the hand into melds), Dump.
- A bottom-right strip of **emoji**, **chat** and **voice** buttons.
- A small banner message for events ("The game starts, good luck!"), a "play 3 hands" mission chip, and the room's bet level at the top right.
- The lobby is a grid of coloured game tiles with sparkle backgrounds. The Super Tongits mini-game has a cartoon dealer, stacks of chips on four betting areas, chips that fly onto the table, a countdown, a jackpot ticker, and scrolling chat messages.

## What we did with it

| Their idea | Our version | Status |
|---|---|---|
| Table with avatars and balances | Felt oval with seats, initials avatars and running totals (not coins) | Done |
| Pot bar with crowns | Pot in the table centre, plus two crowns that show who is one win from collecting it | Done |
| POINT box | A prominent POINT box in the hand helper | Done |
| Group button | The hand helper groups your hand automatically and offers other groupings | Done |
| Chips fly onto the table | Chips fly from the losers to the winner when a round is saved | Done |
| Event banner text | Big banners (TONG-ITS!, BURNED!, POT!, SUNOG!) and a "game starts" banner when the timer begins | Done |
| Countdown | Ring around the player on the clock, plus the clock panel | Done |
| Emoji reactions | Eight emoji reactions that float over your seat for everyone; nothing is stored | Done |
| Chat and voice | Not built: free text needs moderation and stores personal data. Emoji only | Skipped on purpose |
| Card-count badges, melds on table, Drop/Fight/Dump | These need the cards played in the app. TableTally does not deal or run the game | Not applicable |
| Coins, shop, jackpot, missions, daily rewards, cash-out | Real-money and gamification features. TableTally never handles money | Not applicable |
| Cartoon dealer, 3D room | Artwork we do not have yet | Possible later with generated art |
