# WORLDIFACT — AI Worlds Made Real

WORLDIFACT is a browser 3D prototype connecting an explorable valley, a procedural scene studio and a manufacturing workbench. This source is a review candidate. The application has not been deployed or verified in a browser during this audit.

## What is implemented

- A Three.js valley with five portals, mountains, river, bridge, rover driving, opening workshop doors, keyboard/mouse and touch controls.
- AI Game Lab: prompt-driven DEMO scenes, valley/lunar/ocean biomes, editable colors and scales, object removal, device archive, composition, blueprint JSON and actual procedural GLB export.
- A server-only `gpt-6-astra` Responses API integration using a strict `WorldBlueprint` schema. Paid generation is disabled by default. Only a successful real request earns the LIVE label; this branch has been tested with mocked provider responses only.
- Preview access code, expiry, a persistent global reservation ceiling and per-IP throttling. Provider response IDs, scene hashes and reported token usage can be exported without secrets.
- Enchanted AI Shop: local GLB review with geometry/textured views and SHA-256, two supplier candidates, observed preliminary JLC3DP prices, explicit cost assumptions and a production revision checklist.
- Cloudflare Worker + static assets configuration, CI verification and a manual production workflow.

Chess Cube 512 AI and 8 Planets are planned portal previews. Terra links to a separate project; a playable ISS mission and live Earth-observation feed are not integrated here. No complete five-game collection is claimed.

The original main-branch product vision is preserved in `docs/PROJECT_VISION.md` as a roadmap, separate from implemented features.

## Run locally

Use Node.js 24 and `npm ci`.

```sh
npm run dev:api
# In a second terminal:
npm run dev -- --host 127.0.0.1
```

Open the Vite URL. Its `/api` proxy points to `127.0.0.1:8787`. Without an approved backend key/configuration, local DEMO scene creation remains available.

`dev:api` is deliberately DEMO-only. For an approved live test, build once and use `npm run dev:worker` in place of `dev:api`; this uses the same Cloudflare Worker and Durable Object quota as deployment. Read `docs/CLOUDFLARE_SETUP.md` before setting secrets or enabling paid generation.

```sh
npm run verify
npm run deploy:check
```

Verification runs lint, TypeScript, unit/integration tests, a real local HTTP smoke test and the production build. The deployment check packages the Worker without publishing it. Neither replaces browser gameplay, Android or live AI verification.

## Controls and routes

Move with WASD/arrows, look by dragging, and press E near a portal or object. On-screen controls provide touch movement, door and vehicle actions. Direct portal links remain available if WebGL fails.

| Route | Current scope |
|---|---|
| `/` | Valley, rover, workshop, portal navigation |
| `/portal/ai-game-lab` | Scene studio and device archive |
| `/portal/enchanted-ai-shop` | Model review and manufacturing workbench |
| `/portal/chess-cube-512-ai` | Planned integration; optional `VITE_WORLDIFACT_CHESS_DEMO_URL` |
| `/portal/terra-fix-iss` | Context and external Terra project link |
| `/portal/8-planets-in-8-days` | Planned mission preview |
| `/privacy`, `/terms` | Data and preview notices; final operator contact requires review |

## Generation and data boundaries

The model creates a structured arrangement of six supported procedural object kinds, not an arbitrary high-detail reconstructed mesh. The optional image can guide LIVE composition; DEMO does not analyze it. A generated GLB contains geometry/materials, not the controller code or a certified fabrication file.

The archive stores up to 30 successful scene records in this browser's local storage. It is not cloud synchronization. Local GLB files are not uploaded by the viewer. Reference images are sent to the backend/provider only when the user requests enabled LIVE generation. See `PRIVACY.md`, `TERMS.md` and the implementation inventory in `docs/DATA_HANDLING.md`.

Every MAKE candidate requires process-specific mesh, wall, clearance, color-package and supplier review. The recovered legacy Queen is outside this repository and is not the current approved character. Quote tests are not orders or production approvals.

## Release preparation

See `docs/CLOUDFLARE.md`, `docs/CONTEST_STATUS.md`, `docs/ASSET_LICENSES.md` and `docs/MANUFACTURING_AUDIT.md`. The contest release is currently NO-GO: live Astra evidence, browser/device QA, public URL and launch materials remain outstanding. [PR #2](https://github.com/teslaeco/WORLDIFACT/pull/2) contains the source review; its implementation snapshot passed [GitHub verification](https://github.com/teslaeco/WORLDIFACT/actions/runs/34934275354). Check the PR for the latest commit status.

The source-code license is MIT; private source assets, third-party brands and linked projects are not relicensed by this repository.
