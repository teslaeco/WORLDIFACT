# WORLDIFACT — AI Worlds Made Real

WORLDIFACT is a browser 3D prototype connecting an explorable valley, a procedural scene studio and a manufacturing workbench.

**Public DEMO:** https://worldifact.xodobrox.workers.dev

The first successful public release passed [GitHub deployment and public HTTP verification](https://github.com/teslaeco/WORLDIFACT/actions/runs/34956564451) on 15 September 2026. HTTP checks are not evidence of browser gameplay, physical Android quality or real Astra generation. See [release automation and evidence](docs/AUTOMATION_STATUS.md) for the exact baseline and remaining gates.

## Field notes: Astra-assisted WORLDIFACT vs Meshy

[Read the photovoltaic rim case study](docs/ASTRA_VS_MESHY_RIM_CASE_STUDY.md) — 21 September 2026.

Our supplied previews look more orderly in several structural details, while Meshy's strongest supplied untextured result also preserves clear openings. This is a qualitative review of owner-supplied screenshots, not an independent benchmark or proof of exact geometry, speed, cost or print readiness. The article explains the Astra/Oracle/Blender attribution boundary and what still needs mesh-level validation.

## What is implemented

- A Three.js mirror-water world with five walk-in portals, an AI-generated alpine panorama, planar reflections, rover driving, workshop doors, and an analogue phone joystick with independent drag-to-look controls.
- AI Game Lab: prompt-driven DEMO scenes, valley/lunar/ocean biomes, editable colors and scales, object removal, device archive, composition, blueprint JSON and actual procedural GLB export.
- A server-only `gpt-6-astra` Responses API integration using a strict `WorldBlueprint` schema. Paid generation is disabled by default. Only a successful real request earns the LIVE label; provider-response tests so far use mocks.
- Preview access code, expiry, a persistent global reservation ceiling and per-IP throttling. Provider response IDs, scene hashes and reported token usage can be exported without secrets.
- Enchanted AI Shop: local GLB review with geometry/textured views and SHA-256, two supplier candidates, observed preliminary JLC3DP prices, explicit cost assumptions and a production revision checklist.
- Cloudflare Worker + static assets configuration, CI, main-branch release automation, optional secure OpenAI provisioning and a retained manual DEPLOY control.

WORLDIFACT now exposes five primary contest worlds at `/chess`, `/iss`, `/planets`, `/shop` and `/lab`. Each world has the shared validated GPT-6 Astra blueprint surface; when the paid LIVE gate is not armed, the same primary action falls back to an explicit no-cost `DEMO · MOCK` result instead of becoming unusable. Detailed Shop 3D model generation is a separate Oracle/Blender workflow and remains truthfully gated whenever that backend allowance is unavailable. Terra Earth observation is also available at `/terra` and remains distinct from the Fix ISS game simulation.

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

Move with WASD/arrows or the left analogue joystick; drag on the scene with another finger to look. Walk onto a glowing water disk to open its portal automatically, tap a portal, or use the nearby action button / E. The joystick stops on release, cancellation and focus loss. Direct portal links remain available below the scene if WebGL fails. See `docs/MIRROR_LAKE.md` for texture provenance and verification scope.

| Route | Current scope |
|---|---|
| `/` | Mirror Lake, rover, workshop, walk-in portal navigation |
| `/chess` | Chess Cube 512 AI + shared Astra blueprint generator |
| `/iss` | Fix ISS simulation + shared Astra blueprint generator |
| `/planets` | 8 Planets campaign + shared Astra blueprint generator |
| `/shop` | Customer 3D-model storefront + shared Astra blueprint generator |
| `/lab` | Native AI Game Lab world-blueprint generator and archive |
| `/terra` | Source/date-aware Earth observation presentation |
| `/privacy`, `/terms` | Data and preview notices; final operator contact requires review |

## Generation and data boundaries

The model creates a structured arrangement of six supported procedural object kinds, not an arbitrary high-detail reconstructed mesh. The optional image can guide LIVE composition; DEMO does not analyze it. A generated GLB contains geometry/materials, not the controller code or a certified fabrication file.

The archive stores up to 30 successful scene records in this browser's local storage. It is not cloud synchronization. Local GLB files are not uploaded by the viewer. Reference images are sent to the backend/provider only when the user requests enabled LIVE generation. See `PRIVACY.md`, `TERMS.md` and `docs/DATA_HANDLING.md`.

Every MAKE candidate requires process-specific mesh, wall, clearance, color-package and supplier review. The recovered legacy Queen is outside this repository and is not the current approved character. Quote tests are not orders or production approvals.

## Release and OpenAI setup

A main push or merge starts the verified DEMO release pipeline. Production environment approvals, if configured, still apply. Missing `OPENAI_API_KEY` produces a clear BLOCKED connection warning while allowing DEMO deployment. A supplied key is checked against the official model metadata endpoint and copied to the Worker secret store without appearing in the frontend. A successful configuration check is not LIVE evidence and cannot enable paid generation by itself.

See `docs/CLOUDFLARE_SETUP.md`, `docs/AUTOMATION_STATUS.md`, `docs/CONTEST_STATUS.md`, `docs/ASSET_LICENSES.md` and `docs/MANUFACTURING_AUDIT.md`. The public DEMO is deployed; the final contest launch remains NO-GO until real Astra evidence, browser/device QA and launch materials pass their separate gates. PR #2 and the redirect fix in PR #3 are merged; old draft PR #1 remains unmerged.

The source-code license is MIT; private source assets, third-party brands and linked projects are not relicensed by this repository.
