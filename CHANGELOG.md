# Changelog

All notable changes to TableTally. Dates are in Asia/Tokyo. Codes in brackets are the findings of the 2026-11-14 pre-release audit.

## 0.1.0 (unreleased, 2026-11-14)

### Play in the app only
- Every table is played in the app: the server shuffles, deals, checks every move and records each hand. Score-only tables (typing in results from a real deck) are gone, along with players added without a phone, the manual turn timer and the private hand helpers. This also closes the audit items that only concerned typed-in results [R01 entry form, U05, U08, U10, U11, U15, U16, Q04, C04].
- Round history is read-only. The host can void the last hand after a confirmation and bring it back until the next hand is recorded (a new `round.restore` ledger event). Poker hands cannot be voided, because every hand starts from the stacks the last one left [U09].
- History numbers hands by position, so a voided hand never leaves a gap [C05].

### Turn timer and Pusoy rows
- Time per turn is now a toggle instead of a dropdown: No limit, 30, 45 or 60 seconds in Pusoy Dos, Tong-its and Poker, and No limit, 1, 2 or 3 minutes in Pusoy (the time to set the whole hand). The time is exactly what you pick; Pusoy used to multiply it by six (30 seconds became 3:00). Each game remembers its own choice.
- The countdown is a large ring in the middle of the table that drains as time runs out, turning amber at 30 seconds and red, pulsing, at 10.
- Pusoy has a "Swap middle and bottom" button that trades the two five-card rows in one tap.
- Pusoy: the help button moved into the button row so it no longer covers the row labels on small phones, and after a hand everyone's cards stay inside their own box (they spilled over on phones).

### Cards and screens
- Real card faces from Byron Knoll's public-domain deck: number cards show their pips and J, Q, K show court art. The whole deck is one 584 KB image. Cards under 40 px wide switch to a big rank and suit so they stay readable.
- Hands are held like real cards: an arc fan in Pusoy Dos, Tong-its and Poker, and Pusoy's top 3, middle 5 and bottom 5 overlapping from back to front. Pickable fans keep a 32 px strip of every card to tap.
- After every Pusoy hand everyone sees everyone's rows, each marked ✓, ✗ or = against their own rows, with the points for each pair (worked out by the scorer, so they always match the totals). "Last hand" shows the previous hand again after the next deal, in every game.
- Seat strip: card counts drawn as small card backs, Poker stacks labelled in chips with a dealer badge, totals no longer the loudest thing [U13, Q08]. The play area gives the freed space to bigger cards [U12].
- One SVG icon set replaces mixed emoji and Unicode action icons; emoji reactions stay [U14].
- Callout banners are smaller, sit below the seat strip, last 1.2 s and never queue up an older winner [U07].
- The waiting room shows free seats, and the edge seats stay on screen at every width [U06].
- New typography and colour: Fraunces (titles, totals, callouts) and Bricolage Grotesque (interface), both OFL and served by the app; a 1.25 type scale; jeepney sign-painter offset shadows on the loud moments; refined brass, capiz-pearl, enamel-red and mint tokens.

### Joining, hosting, connection
- A phone that opens a table link sees the table's name, game and free seats before giving a name, instead of a red error. A full or already-started table says so. Phones without a seat only ever receive this preview: no names, scores or cards [U01, U02, U03].
- Join a table is at the top of the home page [U04].
- Creating a table returns a host key (only its hash is stored). On a new phone, "I am the host" plus the key takes the host seat back. The host can also hand the role to another person [R02].
- The host can remove a seat before the first hand [R03].
- The create form warns when the browser will not keep data (private window, blocked storage) [R05].
- While the connection is down the hand is greyed out and says "Reconnecting", and `send()` reports failure instead of silently dropping a move [R01].

### Scoring
- Poker converts the whole session at once: each hand carries the earlier chips (`prior`) and its number (`seq`), and scores convert(prior + hand) − convert(prior). Three one-chip wins at 3 chips to 1 unit now score one unit, like one three-chip win [C02].
- Equal rounding remainders no longer always favour the first seat: the seat that gets the odd unit moves with the hand number [C03].
- Pusoy Dos: with 17-card hands the top penalty tier still means "never played a card" (13 to 16 left pay the 10+ rate, 17 pays the top rate), and hand sizes the deck cannot deal to everyone are refused [C01].

### Security
- Cards are shuffled from `crypto.getRandomValues`, not from one 32-bit seed; `randInt` has no modulo bias [S05].
- Per-address rate limits on creating tables, status lookups and sockets are counted in one Durable Object per address so they hold across Cloudflare's isolates, with no storage writes [S01].
- Codes are checked against the real alphabet before any room Durable Object is touched, and a room Durable Object writes nothing until a table is actually created [S01, S02].
- Opaque or malformed `Origin` headers get a 403 instead of an exception [S03].
- Create requests are read with a 2 KB byte cap without buffering the rest [S04].
- Table codes are six characters (about 887 million) with unbiased generation [S06].

### Accessibility
- Selected chips use the readable brass pair (was 1.91:1) [A01]; light-mode "Live" green and the selected-option hint text pass AA [A02, A03]; the old Poker text is gone [A04].
- "Back to start" is a single link styled as a button [A05]; the QR code has an image role and a label naming the code [A06]; every view has a heading [A07]; the confetti canvas is hidden from screen readers [A08].
- Touch targets of 44 px for the menu, reactions, rules, rename, sound and language controls [A09, A10].
- Measured with axe-core on every screen at 375 and 390 px, dark and light: no WCAG 2.2 AA violations (target-size on overlapping fanned cards is the one rule axe flags; see "Known limits").

### Rules, copy and languages
- The four rule documents describe the app as it is now: house choices marked, worked examples tied to tests, open questions, plain sources; promotional gambling links removed [D01-D08, T04].
- The in-app rules and Poker text describe in-app play [D07]; proper English plurals through `<key>.one` strings instead of "(s)" [D10]; the "(unverified)" note left the preset description [D11]; Sound on/off is translated [D13].
- Filipino is complete: every one of the 404 strings has a Filipino version (a native speaker still needs to review them) [D12]. 141 strings used only by removed screens were deleted.
- Stale comments about hands never reaching the server, settlement and score-only screens are fixed [Q10].

### Code quality
- Shared guards in `src/core/check.ts` replace seven copies [Q03]. `Net` lives in `core/game.ts`; the unused settlement code is labelled as kept on purpose [Q09].
- Game screens register through `defineUi<View, Move, Setup>`, so each screen is type-checked against its own game [Q13]; seat details and stake labels moved into the registry, so shared screens no longer branch on game ids [Q08].
- No inert `eslint-disable` comments [Q02]; `npm run lint` checks the house rules and the English/Filipino parity [Q01]; static inline styles became classes [Q05]; named tunables [Q07]; development diagnostics for decoration failures and logged engine exceptions [Q06, R06]; the i18n audit understands keys chosen inside expressions [Q11].

### Performance and sharing
- The score count-up no longer needs the `motion` library and the QR library loads only for the invite card: main bundle 121.9 → 78.8 kB gzipped [P01].
- Icons re-encoded (512 px 328 → 105 kB), a 1 kB favicon, a separate maskable icon, a WebP logo (126 → 23 kB) [P02, P04].
- Open Graph and Twitter card tags with a share image; robots.txt [P03].
- Lighthouse mobile on the local server: Performance 99, Accessibility 100, Best Practices 100, SEO 100 (LCP 1.8 s, TBT 90 ms, CLS 0, 129 KiB).

### Project
- README and CONTRIBUTING rewritten for in-app play; real screenshots [O06].
- SECURITY.md, CODE_OF_CONDUCT.md, issue and pull request templates [O01]; version 0.1.0 and Node ≥ 22.12 [O02, O03]; ASSETS lists the deck, fonts and every image [O07].
- `CLAUDE.md`, the private audit, AppleDouble files and concept art are kept out of git; anonymous fixture names [D09, O04, O05, O08].
- Tests: a browser suite (`npm run e2e`) [T01]; the smoke test covers the lobby preview, void and restore, the host key and the request limits, and CI runs lint, quick stress, smoke and e2e [T02, T03]; restart persistence checked with `tools/stress.mjs --persist-only` [R04, local]. The misleading overflow test was replaced with an honest note [T05].

### Known limits
- axe's target-size rule measures turned cards by their bounding boxes and reports about 21 px for some fanned cards; the visible strip at each card's centre is 32 px.
- Not verified yet: a deployed Cloudflare instance (expiry alarms, real rate limiting across locations), real phones and mobile data, and a native speaker's review of the Filipino text. CI has not run, because nothing has been pushed.
