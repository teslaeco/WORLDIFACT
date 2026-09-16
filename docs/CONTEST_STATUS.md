# Contest status — WORLDIFACT, 16 September 2026

Decision: **NO-GO for final launch until the repaired AI Shop passes production Android QA. Core P0 has real LIVE Astra evidence and a verified Oracle/Blender GLB, but the owner reproduced a mobile `Failed to fetch` during REAL 3D polling and confirmed the legacy FORGE page still downloads a JSON project brief instead of generating a model. PR #26 contains the replacement native Shop flow and is exact-head CI green; merge/deploy still require explicit owner approval.**

Reference flows:

- concept: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible scene change → GAME / MAKE`;
- real Shop model: `PROMPT → GPT-6 ASTRA / Oracle connector → Blender job → SAME-JOB recovery/polling → validated GLB → in-page 3D preview → explicit download`.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Re-open official Product Hunt contest page, launch guide and submission form immediately before scheduling/submitting |
| Production | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; current main commit before PR #26: `83ca1b9ecd65b15260b112ae685e99b87cacd7d4` |
| Five primary worlds | SOURCE/ROUTE VERIFIED | Exactly five primary routes remain configured |
| Chess Cube 512 AI | ROUTE VERIFIED | `/chess` hands off to the public Chess Cube app |
| Terra — Fix ISS | COPIED APP VERIFIED | `/iss` is assembled into the release manifest; Earth observation remains separately labelled |
| 8 Planets in 8 Days | DEPLOYED / DEVICE RE-TEST NEEDED | `/planets` remains native WORLDIFACT with external FORGE reference separated |
| AI Shop legacy FORGE page | FAIL / LEGACY EXPORT ONLY | Android screenshot shows `FORGE-projekt.json` download; do not use it as the active generator |
| AI Shop current production REAL 3D | FAIL OBSERVED ON ANDROID | Job reached `building`, then status/model polling surfaced `Failed to fetch`; this must not trigger a second paid POST |
| AI Shop PR #26 | PREPARED / CI GREEN / NOT DEPLOYED | Dedicated `/shop`, same-job recovery, job id persisted before POST, transient polling/model retries, in-page GLB, explicit download only |
| AI Shop portal entry | FIX PREPARED / NOT DEPLOYED | Mobile portal radius/reach adjusted so Enchanted AI Shop entry and Interact are more forgiving while preserving false-crossing tests |
| AI Shop image-to-model | BLOCKED_UNVERIFIED | REAL Oracle connector remains prompt-only until reference-image input is proven end-to-end |
| AI Game Lab P0 | DEPLOYED | Native `/lab`; validated Blueprint+AssetSpec; GAME/MAKE separation; local DEMO and LIVE evidence remain distinct |
| Text Astra proof | LIVE / GENERATED | `Green Valley Solar Rover Workshop`; provider usage recorded |
| Image Astra proof | LIVE / GENERATED | `Blue and Green Valley Garden`; provider response evidence recorded |
| Oracle job evidence | LIVE / GENERATED-UNREVIEWED | Previous controlled Oracle job succeeded and produced a GLB |
| Oracle GLB evidence | VERIFIED BINARY / QUALITY UNREVIEWED | glTF 2.0 artifact verified by server-side binary/header/hash checks; no manufacturing approval implied |
| Shared paid pilot | HARD CAPPED | Prior cumulative ceiling was 5. Owner explicitly approved one additional controlled repaired-Shop test; PR #26 raises the absolute cumulative ceiling only to 6, never resets usage, and keeps paid `/api/blueprint` OFF |
| Launch materials | DRAFT | Capture final screenshots/video only after repaired production passes Android + desktop QA |

## Android AI Shop failure reproduced

Owner screenshots at approximately 17:01 show the native WORLDIFACT Shop successfully submitting a REAL 3D job and reaching `building`, followed by temporary status unavailability and finally a raw `Failed to fetch`. The same screenshots confirm that the legacy FORGE page still opens Android's download confirmation for `FORGE-projekt (3).json` when its old order/brief action is pressed.

The correct interpretation is:

- the old FORGE action is a project-brief export, not model generation;
- the native WORLDIFACT Shop is the competition generation surface;
- network loss after submit must recover the **same job id** and must never silently spend another paid request;
- successful GLB output must appear in-page first; download is a separate explicit action.

## PR #26 — repaired E2E Shop

Branch `fix/ai-shop-e2e-20260916` / PR #26 adds:

- a dedicated native `/shop` page, removing the legacy FORGE export page from the primary generation path;
- job id saved locally **before** the one allowed POST;
- no automatic POST retry if the submit response is lost;
- recovery by polling the same saved job id after refresh/network interruption;
- bounded retry handling for transient fetch, HTTP 429 and 5xx status/model reads;
- in-page `OracleModelPreview` for the generated GLB;
- explicit user-triggered GLB download only;
- `LIVE / GENERATED-UNREVIEWED` truth label and continued MAKE validation requirement;
- more forgiving mobile water-portal radius/reach while keeping automated crossing tests valid;
- `docs/CODEX_TASK_AI_SHOP_E2E.md` with the exact implementation brief;
- marker-gated pilot ceiling change from cumulative 5 to cumulative 6 for exactly one additional owner-approved test; CI performs no paid generation.

Exact-head CI after the portal adjustment passed `npm ci`, full `npm run verify`, foundations and `deploy:check`.

## LIVE P0 evidence

1. **LIVE Astra text — PASS.** Validated WorldBlueprint + AssetSpec.
2. **LIVE Astra image — SAFE FAILURE then PASS on the approved evidence sequence.** Failed attempt returned a sanitized error; successful attempt produced validated generated output.
3. **Oracle/Blender — PASS at prior controlled job level.** A generated GLB was retrieved and structurally verified.
4. **Current Android REAL 3D attempt — NETWORK/RECOVERY FAIL.** Job progressed to `building`, but browser-side polling eventually surfaced `Failed to fetch`; artifact success is not claimed.

## Immediate gates

1. Obtain explicit owner approval to merge PR #26 and deploy production.
2. After normal production smoke passes, allow the marker-gated Shop workflow to raise only the cumulative ceiling from 5 to 6; CI itself must spend zero paid requests.
3. Android clean-session test: meadow portal → `/shop` → one prompt → one REAL 3D POST → same-job recovery if network/status fails → GLB renders in page → no automatic download.
4. Verify explicit GLB download button separately.
5. Re-test `/planets`, `/lab`, `/chess`, `/iss` and `/terra` in the same Android session.
6. Run desktop/responsive/accessibility QA.
7. Visually review generated GLB before any quality or manufacturing claim.
8. Capture final launch media only after the production repair passes.
9. Re-open official contest rules, launch guide and submission form immediately before Product Hunt scheduling/submission.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present the legacy JSON brief as a generated 3D model, a failed-fetch job as a successful artifact, procedural preview geometry as Oracle-generated geometry, `GENERATED-UNREVIEWED` as quality-approved, or a MAKE candidate as manufacturing-ready.
