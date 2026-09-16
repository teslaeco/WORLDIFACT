# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 has real LIVE Astra evidence, but final contest readiness remains NO-GO pending final device QA and launch preparation. Production commit `43f38429d5b99bdcaac8a8f6c1ddd6c367981947` includes the native Enchanted AI Shop correction from PR #22. Owner Android QA at 15:08 confirmed the new `/shop` DEMO changes the WORLDIFACT scene without an automatic download, but it also exposed a larger product gap: neither the DEMO surface nor the legacy Forge `Przygotuj zlecenie` action creates a new figurine/model GLB. A real Shop model-generation frontend is now prepared on `fix/real-shop-model-generation-20260916` and remains unmerged/un-deployed pending exact-head CI plus explicit cost/deployment approval.**

Reference flows:

- concept: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible scene change → GAME / MAKE`;
- real Shop model: `PROMPT → GPT-6 ASTRA / Oracle connector → Blender job → validated GLB → in-page 3D preview → explicit download`.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Re-open the official Product Hunt contest page, launch guide and submission form immediately before scheduling/submitting |
| Production | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; current production app commit `43f38429d5b99bdcaac8a8f6c1ddd6c367981947` |
| Five primary worlds | SOURCE/ROUTE VERIFIED | Exactly five portal IDs/routes; automated release checker requests all primary routes over HTTPS |
| Chess Cube 512 AI | OWNER-REPORTED WORKING / ROUTE VERIFIED | `/chess` hands off to the public Chess Cube site; final dedicated screenshot still useful |
| Terra — Fix ISS | OWNER-REPORTED WORKING / COPIED APP VERIFIED | `/iss` is assembled into the release manifest; Earth observation remains separate and labelled |
| 8 Planets in 8 Days | DEPLOYED / DEVICE RE-TEST NEEDED | Primary WORLDIFACT expedition view is back; Mini test remains available as a tab; older FORGE builder is an external reference only |
| Enchanted AI Shop legacy reference | FAIL CONFIRMED ON ANDROID | `Przygotuj zlecenie` opens a download confirmation for `FORGE-projekt.json`; this is a project-brief export, not model generation |
| Enchanted AI Shop native DEMO | ANDROID PASS FOR NO-AUTO-DOWNLOAD / NOT A FIGURINE GENERATOR | Owner 15:08 screenshot confirms the scene changes in WORLDIFACT; DEMO remains procedural `MOCK` and does not create a new figurine GLB |
| Enchanted AI Shop real model frontend | PREPARED / NOT DEPLOYED | Branch wires prompt-only owner-gated `/api/oracle/jobs` submission, job polling, server-validated GLB retrieval and in-page Three.js GLB preview; explicit download only |
| Enchanted AI Shop image-to-model | BLOCKED_UNVERIFIED | Existing Oracle connector contract is prompt-only; do not claim uploaded reference images drive the real Blender model until verified end-to-end |
| AI Game Lab P0 | DEPLOYED | Native `/lab`, WebGL, validated Blueprint+AssetSpec, GAME/MAKE, World #5 reference tab and three no-cost examples |
| Text Astra proof | LIVE / GENERATED | Reservation #1: `Green Valley Solar Rover Workshop`, 3 objects, 905 provider-reported tokens |
| Image Astra proof | LIVE / GENERATED | Reservation #3: `Blue and Green Valley Garden`, 6 objects, 1,594 tokens; response `resp_074915dbcf617af1016aaa3474281c87d19318b0b7abbbae56` |
| Failed Astra image attempt | SAFE FAILURE | Reservation #2 returned sanitized HTTP 502; no retry and no secret leakage |
| GAME / MAKE contract | VERIFIED | Separate GAME and MAKE; MAKE forced to `validation-required` |
| Shared paid pilot quota | EXHAUSTED / HARD CAPPED | Exactly 4/4 approved reservations consumed. No further paid Astra/Oracle generation without a new explicit owner-approved ceiling |
| Oracle VM | HEALTHY | 100 GB boot volume; root ~83 GB with ~54 GB free; worker/tunnel active |
| Oracle job evidence | LIVE / GENERATED-UNREVIEWED | Job `4a1db549-cc82-4b2e-bf15-7877e06fc968` succeeded after 249.9 s |
| Oracle GLB evidence | VERIFIED BINARY / QUALITY UNREVIEWED | 204,732 B; SHA-256 `73823a6e463df2b91a716c1afb50068cc150ed6003a177073f9048528c4c4dbc`; glTF 2.0; 30 meshes; 7 materials; no textures/images/animations |
| Launch materials | DRAFT | Capture screenshots/video only after final repaired production build passes device QA |

## AI Shop Android finding after PR #22

The 15:08 owner screenshot confirms that PR #22 solved the immediate Android auto-download regression on the native WORLDIFACT `/shop`: the local DEMO changes the visible 3D scene and no download confirmation appears from the DEMO action.

That QA also clarified the real requirement. The user expects a newly generated figurine/model, not a procedural world preview. The old Forge page still opens `FORGE-projekt.json` because its `Przygotuj zlecenie` action is an export/brief workflow. It must remain labelled as a legacy reference rather than as the active generator.

Prepared branch `fix/real-shop-model-generation-20260916` adds the missing real-model frontend without enabling cost:

- submits `worldId=enchanted-ai-shop`, UUID and prompt to the existing same-origin owner-gated `/api/oracle/jobs` route;
- never exposes the Oracle endpoint or Oracle bearer token to the browser;
- polls the reviewed job status endpoint while showing the job state and elapsed time;
- when the job succeeds, fetches the server-validated GLB through `/api/oracle/jobs/:id/model` as a Blob;
- renders that Blob in-page with Three.js `GLTFLoader` and orbit controls;
- does **not** trigger a browser download automatically; download is an explicit separate button;
- labels the artifact `LIVE / GENERATED-UNREVIEWED` and keeps manufacturing suitability unapproved;
- blocks REAL generation when a reference image is selected because the reviewed Oracle job contract is still prompt-only;
- leaves `ENABLE_ORACLE_JOBS=false` and the exhausted shared budget unchanged until explicit owner approval for cost and production deployment.

## Five-world QA milestone

Production release for commit `43f38429d5b99bdcaac8a8f6c1ddd6c367981947` passed verify, foundation assembly, deploy-check, deployment and public HTML/assets/DEMO API smoke. The release checker requests every primary world route and verifies copied Chess/ISS/Terra application assets. This is HTTP/build evidence, not a substitute for physical Android WebGL QA.

Detailed matrix: `docs/WORLD_QA_2026-09-16.md`.

## LIVE P0 evidence

1. **#1 LIVE Astra text — PASS.** `Green Valley Solar Rover Workshop`; 3 objects; 905 tokens.
2. **#2 LIVE Astra image — SAFE FAILURE.** Sanitized HTTP 502; no retry.
3. **#3 LIVE Astra image — PASS.** `Blue and Green Valley Garden`; 6 objects; MAKE `validation-required`; 1,594 tokens; blueprint SHA-256 `4af2418993a9052db2b2265c6a4e235c3ebc0d2298ba0ef43f0fb0982b4feb1b`.
4. **#4 Oracle prompt job — PASS at generation/job level.** Astra/Codex/Blender completed and produced the retrieved GLB.

## Immediate gates

1. Get green exact-head CI for `fix/real-shop-model-generation-20260916`.
2. Do not enable Oracle writes, raise the cumulative generation ceiling, merge, or deploy the real-model Shop change without explicit owner approval.
3. If cost is approved, use one controlled prompt-only Oracle job to verify: submit → progress → succeeded → GLB fetched into page → model renders → no automatic download.
4. After a successful controlled job, re-test `/shop` on Android and desktop, including cancel/error paths and WebGL fallback.
5. Keep image-to-model `BLOCKED_UNVERIFIED` until the Oracle connector contract accepts and proves reference-image input.
6. Re-test `/planets`, `/lab`, `/chess`, `/iss` and `/terra` in the same clean Android session.
7. Run accessibility/responsive checks.
8. Visually review any generated Oracle GLB before quality/manufacturing claims.
9. Capture final launch media and re-open official contest pages immediately before scheduling/submission.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a local DEMO as an Astra result, procedural preview as Oracle-generated geometry, the Oracle `GENERATED-UNREVIEWED` GLB as quality-approved/manufacturing-ready, a downloaded project brief as a generated 3D model, or a MAKE candidate as production-ready.
