# Third-party assets and libraries

Every third-party asset or runtime library used by the app is listed here with its source and license. Licenses were read from each package's own `package.json` on 2026-11-13. Re-check before adding anything new, and only add assets that are CC0 or permissively licensed.

## Runtime libraries (ship to the browser)

| Library | Version | License | Used for |
|---|---|---|---|
| [Svelte](https://svelte.dev) | 5.57 | MIT | UI framework |
| [Motion](https://motion.dev) | 14.13 | MIT | score count-up animation |
| [canvas-confetti](https://github.com/catdad/canvas-confetti) | 1.9.4 | ISC | winner confetti (loaded on demand) |
| [qrcode](https://github.com/soldair/node-qrcode) | 1.5.4 | MIT | join QR code (generated in the browser) |

## Build and test tooling (not shipped)

Vite, `@sveltejs/vite-plugin-svelte`, Vitest, TypeScript 6, `svelte-check`, Wrangler, `@cloudflare/workers-types`. All are open source; see each package for its license. `npm audit` reports two low-severity advisories in `deepmerge` (a dev dependency of the Svelte Vite plugin, no fix available upstream); they do not affect the shipped app.

## Sounds

None are shipped as files. The chip click and win jingle are synthesised in the browser with the Web Audio API (`src/web/lib/effects.svelte.ts`).

## Images

All images are AI-generated with Codex imagegen for this project, and the prompts are saved beside them in `assets/generated/`. They are original to this repo and are released under the repo's license.

- `assets/generated/concepts/logo-concept-1.png`: the chosen logo lockup. A web copy is `public/brand/logo-lockup.jpg`.
- `assets/generated/brand/app-icon-1024.png`: the app icon, an edit of concept 1. Web copies are in `public/icons/`.
- The other files in `assets/generated/concepts/` are unused design concepts.

Playing-card faces will come from a CC0 / public-domain SVG deck (first choice `notpeter/vector-playing-cards`) when card art is added. Its license text will be recorded here before any file is copied in.
