# Stack recommendation

Status: proposal for review. Nothing is scaffolded until you approve a stack.

## Requirements

- Works in iPhone and Android browsers over mobile data. No install, no accounts.
- Live sync: every phone updates when the host saves a round.
- Rooms expire automatically. Minimal data stored. No tracking or identifying analytics.
- Free hosting that a hobbyist can deploy in under 15 minutes.
- Offline-tolerant (PWA): the host keeps working when data drops.
- Open source, easy for contributors: scoring as pure TypeScript functions with tests.

## Options compared

| | A. Cloudflare Workers + Durable Objects | B. Firebase Realtime Database | C. Supabase | D. Node + Socket.io on a small host | E. P2P (Yjs + WebRTC) |
|---|---|---|---|---|---|
| Sync model | One Durable Object per room, WebSockets | Client SDK, rules-based | Postgres + Realtime channels | Own server, rooms in memory or DB | Peer-to-peer, no server |
| Fits "room" naturally | **Yes**, a room is one object, single-writer | Partly, needs security rules per room | Partly, needs row-level security | Yes | Yes |
| Free tier (verified, see below) | 100k requests/day, SQLite storage, hibernating WebSockets | 100 simultaneous connections, 1 GB, 10 GB/month | 200 peak connections, 2M messages/month, project pauses after 1 week idle | Free tiers sleep or are limited, varies by host | Free |
| Room expiry | Built in: alarm API deletes storage | Needs a scheduled cleanup | Needs a scheduled job | Own cron | Nothing stored |
| Privacy control | Full, no third-party SDK | Google SDK and data | Third-party backend | Full | Full |
| Mobile-data reliability | Good (WebSocket over HTTPS) | Good | Good | Good | **Poor** (NAT and carrier networks block direct WebRTC without a TURN relay) |
| Deploy effort | `wrangler deploy`, one config | Console setup and rules | Project, schema, policies | Server, process manager, TLS | Static hosting only |
| Verdict | **Recommended** | Possible, more rules to maintain | Possible, pause-after-idle hurts | Fine, but needs a host that stays awake | Rejected for mobile data |

### Free-tier facts I checked (2026-11-13)

- Cloudflare Durable Objects Free plan: 100,000 requests/day, 13,000 GB-s duration/day, 5 million SQLite rows read/day, 100,000 rows written/day, 5 GB SQLite storage. Only SQLite-backed objects on Free. Hibernating WebSockets are not billed for duration while idle, and 20 incoming messages count as 1 request [Cloudflare pricing page].
- Firebase Spark plan: 100 simultaneous connections, 1 GB storage, 10 GB/month downloads, no payment method needed [Firebase pricing page].
- Supabase Free: 200 peak realtime connections, 2 million messages/month, 500 MB database, projects paused after 1 week of inactivity [Supabase pricing page].

A session of 20 rounds at 4 players is a few hundred small messages, so these limits are far above a friend-group's use. Limits change, so re-check before launch.

## Recommendation: A

**TypeScript throughout, Cloudflare Workers + Durable Objects for rooms, static front end on Cloudflare Pages (or the same Worker's assets).**

- **Front end:** Svelte 5 with Vite. Small bundles matter on mobile data, and Svelte's transitions pair well with Motion for the card and score animations. PWA via a service worker (`vite-plugin-pwa`).
- **Rooms:** one Durable Object per room code. It owns the event log (rounds, edits, undo) in its SQLite storage, validates and orders events, and broadcasts state to connected sockets. Single writer per room avoids merge conflicts.
- **Events not state:** the room stores an append-only event log. State is derived by replaying events through the pure scoring functions. That gives undo, edit-with-reason and full history without extra machinery, and it makes the same log exportable.
- **Identity:** each player gets a random device token stored in the browser. Rejoining after refresh sends the token back and the room maps it to the same player. No accounts. The host adds players manually for people without phones.
- **Expiry:** the object sets a Durable Object alarm for the expiry time (for example 24 hours after last activity, host-configurable up to a limit) and deletes its storage when it fires. "Continue another day" is an explicit export and re-import of the log, or a longer expiry chosen by the host. Open question below.
- **Shared code:** `src/core` (settlement, ledger, math) and `src/games/<game>` (pure scoring modules) in one package, imported by both the client and the Worker so the server never trusts a client-computed total. A single package is used on purpose: npm workspace symlinks break when `node_modules` lives in the APFS image.
- **Tests:** Vitest for the pure packages, Miniflare/`workerd` for room behaviour, Playwright for one or two smoke tests. GitHub Actions on every push.
- **Export:** SheetJS (Apache-2.0) for Excel and a small PDF library, both lazy-loaded. Both are loaded only when the user taps export.
- **QR:** a small open-source QR generator (for example `qrcode`, MIT) rendered client-side.
- **FX:** dropped on 2026-11-13. The room unit is only a currency label; nothing is converted.

### Why not the others

- **Firebase/Supabase** work but add a third-party SDK to every phone, need per-room security rules, and conflict with the "minimal data, no tracking" promise more than a first-party Worker does. Supabase's pause-after-idle also breaks a project that is used once a month.
- **Self-hosted Node + Socket.io** is the most familiar for contributors and a fine fallback, but free tiers sleep, so the first join after idle is slow.
- **P2P** has no server cost, but direct connections often fail over carrier networks, which the brief rules out.

### Risks

- Vendor lock-in to Cloudflare for the live layer. Mitigation: all game and ledger logic is in plain TypeScript packages, and the Durable Object is a thin adapter around them, so a Node adapter can be added later.
- A single Durable Object serialises one room. That is correct for a table of 2 to 8 players.
- Free-tier request limits are per account per day. Fine for a friend group, a concern only if the app becomes widely used. Mitigation: document the limit, and mention the paid plan.

## Decisions I need from you

1. Approve Cloudflare + Svelte as the stack, or pick another column.
2. Room lifetime: expire 24 hours after the last activity, with "keep this room for 30 days" as an opt-in? Or always export and re-import to continue another day?
3. Is it acceptable that the project's public demo is deployed on your own Cloudflare account?
