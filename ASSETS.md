# Third-party assets and libraries

Every third-party asset, font or runtime library the app uses, with its source and license. Licenses were read from each package's own files on 2026-11-14. Re-check before adding anything, and only add assets that are CC0, public domain or permissively licensed.

## Runtime libraries (shipped to the browser)

| Library | Version | License | Used for |
|---|---|---|---|
| [Svelte](https://svelte.dev) | 5.57 | MIT | UI framework |
| [canvas-confetti](https://github.com/catdad/canvas-confetti) | 1.9.4 | ISC | winner confetti (loaded on demand) |
| [qrcode](https://github.com/soldair/node-qrcode) | 1.5.4 | MIT | join QR code (generated in the browser, loaded on demand) |

## Fonts (self-hosted, shipped)

| Font | Package | License | Used for |
|---|---|---|---|
| [Fraunces](https://github.com/undercasetype/Fraunces) by Undercase Type | `@fontsource-variable/fraunces` 5.3 | SIL Open Font License 1.1 | titles, totals, callouts |
| [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) by Mathieu Triay | `@fontsource-variable/bricolage-grotesque` 5.3.0 | SIL Open Font License 1.1 | interface text |

## Playing cards

`public/cards/deck.webp` is one sprite of the 52 card faces from **Vector Playing Cards** by Byron Knoll, as collected at <https://github.com/notpeter/Vector-Playing-Cards>. The project states: "These images, scripts and their output … are released into the public domain, or optionally licensed under the WTFPL in jurisdictions where the public domain is not a recognized legal concept." The original artwork was released into the public domain on Google Code (vector-playing-cards). The SVGs were rendered at 280 x 407 px per card and packed into a 13 x 4 WebP sprite (rows spades, hearts, diamonds, clubs; columns A to K). Card backs are drawn in CSS.

## Sounds

None are shipped as files. The chip click and win jingle are synthesised in the browser with the Web Audio API (`src/web/lib/effects.svelte.ts`).

## Images

Generated with Codex imagegen for this project; the prompts are saved in `assets/generated/concepts/PROMPTS.md`. They are original to this repository and released under its license.

- `assets/generated/brand/app-icon-1024.png`: the app icon. Web copies (`public/icons/`, including a maskable version and a 32 px favicon) are resized from it.
- `public/brand/logo-lockup.webp`: the logo lockup (concept 1), resized for the home page.
- `public/brand/og.jpg`: the share preview, made from the logo with Georgia text (rendered into the image; Georgia is not shipped).
- Concept art from the design phase stays out of the repository (it is listed in `.gitignore`); only its prompts are kept.

## Build and test tooling (not shipped)

Vite, `@sveltejs/vite-plugin-svelte`, Vitest, TypeScript 6, `svelte-check`, Wrangler and `@cloudflare/workers-types`. All are open source; see each package for its license.
