# Codex task — contest finish: five Astra portals + Terra Earth EVA

Work only in `teslaeco/WORLDIFACT` on the review branch `feat/contest-five-portals-terra-earth`.

## Goal
Finish the September 18 GPT-6 Astra Challenge demo without duplicating existing systems or inventing readiness.

### 1. Five portal generation
- Reuse the existing server-side `/api/blueprint` GPT-6 Astra path.
- Accept `worldId` from the exact five `ORACLE_WORLD_IDS`; preserve backwards compatibility by defaulting omitted legacy requests to `ai-game-lab`.
- Keep the model exactly `gpt-6-astra` through the Responses API, strict `WorldBlueprint + AssetSpec`, current validation, rate limiting, timeouts, safe errors, server-only key and DEMO fallback.
- Add one reusable `PortalAstraGenerator` to Chess Cube, Terra/Fix ISS, 8 Planets and Enchanted AI Shop. AI Game Lab already owns the native generator; update it to submit `worldId: ai-game-lab`.
- Do not build five backends.
- A successful live call must visibly change a procedural preview and show `LIVE · GENERATED`; DEMO must show `DEMO · MOCK`. Failure must preserve the previous preview.

### 2. Terra/Fix ISS mission copy
- State that Terra ISS is a repair simulation created to explore the idea of repairing and preserving ISS as a human heritage object.
- Do not claim NASA endorsement or proven feasibility of preserving the full station in orbit.
- Show: `Sales starting soon — we are refining the model and manufacturing validation.`
- Add PLANNED wording that part of future sales revenue is planned for promotion/awareness supporting the ISS preservation campaign and link `https://c.org/QkbzHd5kWN`.
- Do not claim current donations or a guaranteed percentage.

### 3. EVA Earth — reuse Terra Observation
- Do NOT invent a new Earth asset.
- Adapt the actual Earth visual source logic from `Terraforming-Planet/Polar-Sun-Moon-Analysis` commit `c91d59eafb87cf9657f8bf78a5e431fb35665849`, especially `web/src/CleanRealisticEarthGlobe.tsx` (MIT).
- Reuse the same official NASA GIBS sources: `BlueMarble_ShadedRelief_Bathymetry` as the complete base and `VIIRS_SNPP_CorrectedReflectance_TrueColor` as the dated cloud-bearing true-colour layer.
- In `public/apps/iss`, replace/cover the current plain-blue EVA Earth without changing the rest of the simulator.
- If dated imagery fails, fall back to the complete Blue Marble base and label the source as a visual backdrop, never as a live observation.
- Preserve Terra Observation and NASA GIBS attribution.

### 4. ISS manufacturing truth boundary
- Keep sales `COMING SOON` and MAKE `VALIDATION REQUIRED`.
- Do not claim the current backend repairs the original 3MF/GLB unless that exact source file is actually passed into the worker.
- Prepare the paid ISS job path only under a one-job hard cost guard and no automatic retry. Do not spend or deploy without owner authorization.

### 5. Tests and documentation
- Add tests for exact five world IDs, unknown-world rejection, portal LIVE/DEMO labels, no client secret exposure, Terra Earth NASA source/attribution, ISS sales/heritage copy and no fake production-ready claim.
- Run lint, typecheck, unit, HTTP smoke, build and existing FAST/installer regressions.
- Update `docs/CONTEST_STATUS.md` with exact evidence after the milestone.
- Open a draft PR. Do not merge or production-deploy without owner approval.
