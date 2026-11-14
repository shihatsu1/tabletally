# Existing score-tracking apps and how TableTally should differ

Status: desk research from App Store listings and search results on 2026-11-13. I did not install or test any app, so feature claims come from listings and may be out of date.

## What exists

### Poker home-game trackers
- **ChipUp** (iPhone): buy-ins, rebuys, cash-outs, suggests who pays whom.
- **Chip Stack** (iPhone): enter final chip counts, computes who owes what, data stays on the device.
- **PokerMates**: custom buy-ins, Venmo and PayPal links for settling up.
- **Pokertally**, **Home Poker - Track Buy-Ins**: rebuys, Venmo or Cash App links.
- **PartyPot**: one banker manages a virtual pot, claims fewest transfers, has a Tongits page. Marketing pages are vendor-written.

### Big Two / Pusoy Dos score keepers
- **Big2 Tracker** (iPhone): auto-calculated rounds, custom multipliers, **QR code sharing so others can follow live**. The closest existing competitor to our core idea.
- **Big2 Score Keeper** (iPhone, free): final scores and past games.
- **Big Scorekeep**: round scores, card trades, match history. Last update 2021 per its listing.
- **Big 2 Scoring Calculator**: custom per-card values, two settlement methods, paid after five free plays.
- **weirany/Big2** (GitHub): a tiny "Big 2 Score Card" app, 28 commits, 2 stars, license not shown. Not a competitor in reach, an example of how little open source exists.

### Tongits
Dedicated Tongits score trackers were hard to find. The results were mostly the games themselves (Tongits Plus, Tara Tongits, Tongits Kingdom), plus PartyPot's Tongits page.

### Pusoy (13-card)
No dedicated score tracker turned up in these searches. **[Not searched exhaustively.]**

## Gaps we can fill

1. **No install, both platforms.** The trackers found are iPhone-first apps. A browser app works on iPhone and Android over mobile data. (Android availability of each competitor was not checked.)
2. **One app for several games**, including the Filipino games that general score keepers ignore: Pusoy Dos with Philippine suit order and deuce multipliers, Pusoy, and Tong-its with burned, secret-set and ace bonuses.
3. **Live for everyone by QR code**, with no accounts. Big2 Tracker has QR sharing for Big Two, so this is table stakes for that game, not a differentiator by itself.
4. **Rules as options, not assumptions.** Tong-its and Pusoy differ table to table. A host-switchable option list is the differentiator, not one hard-coded rule set.
5. **Trustworthy ledger:** undo, edit with a reason, visible history for every player, exact integer math, fewest-payments settlement, and a chip-in/chip-out check for poker.
6. **Open source and privacy-first:** no accounts, no ads, no identifying analytics, rooms expire.
7. **Export and continue later:** Excel and PDF, plus resuming a tally on another day.

## Where we deliberately differ

- **No payment links** (no Venmo, PayPal, Cash App). The brief says the app never handles or transfers money, so settlement is a list of "who owes whom", nothing more. This is a product line to hold, even though competitors offer links.
- **No hand tracking** in poker. Only buy-ins and cash-outs.

## Decision for you

Do you want a short "how this differs from Big2 Tracker and PartyPot" section in the README, or keep the README about TableTally only?
