# Changelog

All notable changes to TableTally. Dates are in Asia/Tokyo.

## Unreleased

### Changed
- Every table is now played in the app: the server shuffles, deals and runs the turns, and records each hand. The score-only mode (typing in results from a real deck) is gone, along with hand-added players without a phone, the manual turn timer and the private hand helpers.
- Round history is read-only. The host can void the last hand (after a confirmation) and bring it back until the next hand is recorded. Poker hands cannot be voided, because each hand starts from the last hand's chips.
- Cards use a public-domain deck (Byron Knoll's vector playing cards): number cards show their real pips, and J, Q and K show court art. The whole deck is one 584 KB image. Cards narrower than 40 px use a large rank and suit so they stay readable.
- Hands are held like real cards: Pusoy Dos, Tong-its and Poker show an arc fan, and Pusoy shows the top 3, middle 5 and bottom 5 overlapping from back to front.
- At the end of a Pusoy hand, everyone sees everyone's three rows, marked won, lost or tie against their own rows, with the points for each pair. "Last hand" reopens the previous hand after the next one is dealt (all games).
- A visitor who opens a table link sees the table's name, game and free seats before giving a name, instead of a red error. A full or already-started table says so.
- Join a table is now at the top of the home page.
- While the connection is down, the hand cannot be played (it is greyed out and says "Reconnecting"), so a move is never silently lost.
- Seat strip: card counts as small card backs, poker stacks labelled as chips and a dealer badge, and totals no longer dominate.
- Event banners are smaller, shorter, sit below the seat strip and never queue up stale winners.
- One SVG icon set replaces mixed emoji and Unicode action icons. Emoji reactions stay.

### Fixed
- Selected chip buttons were dark text on dark felt (1.91:1); they now use the readable brass pair.
- The waiting room's edge seats no longer spill off narrow screens.
- "Back to start" was a button inside a link; it is a single link now.
- Sound on/off is translated.
