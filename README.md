# WORLDIFACT — AI Worlds Made Real

WORLDIFACT is a public competition demo where an interactive 3D valley connects five AI-first worlds:

1. **Chess Cube 512 AI** — 8×8×8 chess experimentation with AI and custom board/piece design.
2. **Terra — Fix ISS** — story-driven ISS repair simulation plus clearly labeled Earth-observation context.
3. **8 Planets in 8 Days** — platform adventure preview across eight distinct planetary restoration missions.
4. **Enchanted AI Shop** — prompt/reference driven object design prototype with separate geometry and appearance review.
5. **AI Game Lab** — model archive and scene-composition prototype for characters, vehicles, buildings and environment assets.

## Current demo scope

- Browser-based React + TypeScript + Vite app with a full-screen 3D starting world.
- Keyboard/mouse desktop controls plus touch controls for mobile.
- River proximity reveals portal previews; users can click portals, press `E` near a portal, or use accessible link cards.
- Lazy-loaded route content with loading and WebGL fallback UI.
- GAME/MAKE workflow examples with explicit readiness states:
  - `concept`
  - `game-ready`
  - `validation-required`
  - `manufacturing-reviewed`
- Manufacturability is never assumed from visual rendering alone; checks are explicitly listed.

## DEMO-mode boundaries

The Enchanted AI Shop and AI Game Lab are **DEMO** interfaces in this repository version.
No production quote/order/model-delivery/manufacturer link is claimed without a verified backend integration.

## External portal configuration

Optional external Chess Cube demo URL:

```bash
VITE_WORLDIFACT_CHESS_DEMO_URL=
```

Only `http(s)` values are accepted at runtime.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build and preview

```bash
npm run lint
npm run build
npm run preview
```

## Controls

- **Move:** `WASD` or Arrow keys
- **Look:** mouse/touch drag
- **Enter nearby portal:** `E`
- **Touch mode:** on-screen directional controls + Enter Portal button

## Accessibility and routing

- Accessible non-3D portal list for keyboard and assistive technology use.
- Cloudflare Pages SPA route refresh support via `public/_redirects`.
- Direct routes:
  - `/portal/chess-cube-512-ai`
  - `/portal/terra-fix-iss`
  - `/portal/8-planets-in-8-days`
  - `/portal/enchanted-ai-shop`
  - `/portal/ai-game-lab`

## Technical architecture

- **React 19 + TypeScript + Vite 8**
- **Three.js** for the starting world rendering
- **React Router** for portal routes
- Central typed portal config: `src/config/portals.ts`
- Shared asset workflow typing: `src/types/worldifact.ts`

## Cloudflare Pages deployment notes

This project is compatible with static hosting on Cloudflare Pages:

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback enabled by `public/_redirects` (`/* /index.html 200`)
