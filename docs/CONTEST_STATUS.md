# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 has real LIVE Astra evidence, but final contest readiness remains NO-GO pending final device QA and launch preparation. Production commit `06ea9218d6e74929834d6b93257d0db473272273` restored the primary 8 Planets expedition view, kept Mini test as a tab and added World #5 / example tabs in Game Lab. New owner Android QA found a separate Enchanted AI Shop regression: the legacy public Forge Studio downloads `FORGE-projekt.json` from its creation action instead of rendering a newly generated result. A native WORLDIFACT shop fix is prepared on `fix/native-ai-shop-generation-20260916`.**

Reference flow: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Re-open the official Product Hunt contest page, launch guide and submission form immediately before scheduling/submitting |
| Production | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; current production commit `06ea9218d6e74929834d6b93257d0db473272273` |
| Five primary worlds | SOURCE/ROUTE VERIFIED | Exactly five portal IDs/routes; automated release checker requests all primary routes over HTTPS |
| Chess Cube 512 AI | OWNER-REPORTED WORKING / ROUTE VERIFIED | `/chess` hands off to the public Chess Cube site; final dedicated screenshot still useful |
| Terra — Fix ISS | OWNER-REPORTED WORKING / COPIED APP VERIFIED | `/iss` is assembled into the release manifest; Earth observation remains separate and labelled |
| 8 Planets in 8 Days | DEPLOYED / DEVICE RE-TEST NEEDED | Primary WORLDIFACT expedition view is back; Mini test remains available as a tab; older FORGE builder is an external reference only |
| Enchanted AI Shop legacy reference | FAIL OBSERVED ON ANDROID | Owner screenshot shows the creation action opening a download confirmation for `FORGE-projekt (3).json` instead of an on-page generated result |
| Enchanted AI Shop native fix | PREPARED | `/shop` becomes a native WORLDIFACT generation surface; DEMO changes the 3D preview on-page and downloads occur only through explicit export buttons; legacy Forge Studio becomes a labelled reference link |
| AI Game Lab P0 | DEPLOYED | Native `/lab`, WebGL, validated Blueprint+AssetSpec, GAME/MAKE, World #5 reference tab and three no-cost examples |
| Text Astra proof | LIVE / GENERATED | Reservation #1: `Green Valley Solar Rover Workshop`, 3 objects, 905 provider-reported tokens |
| Image Astra proof | LIVE / GENERATED | Reservation #3: `Blue and Green Valley Garden`, 6 objects, 1,594 tokens; response `resp_074915dbcf617af1016aaa3474281c87d19318b0b7abbbae56` |
| Failed Astra image attempt | SAFE FAILURE | Reservation #2 returned sanitized HTTP 502; no retry and no secret leakage |
| GAME / MAKE contract | VERIFIED | Separate GAME and MAKE; MAKE forced to `validation-required` |
| Public pilot quota | EXHAUSTED / HARD CAPPED | Exactly 4/4 approved reservations consumed. No further paid generation without new explicit owner approval |
| Oracle VM | HEALTHY | 100 GB boot volume; root ~83 GB with ~54 GB free; worker/tunnel active |
| Oracle job | LIVE / GENERATED-UNREVIEWED | Job `4a1db549-cc82-4b2e-bf15-7877e06fc968` succeeded after 249.9 s |
| Oracle GLB | VERIFIED BINARY / QUALITY UNREVIEWED | 204,732 B; SHA-256 `73823a6e463df2b91a716c1afb50068cc150ed6003a177073f9048528c4c4dbc`; glTF 2.0; 30 meshes; 7 materials; no textures/images/animations |
| Launch materials | DRAFT | Capture screenshots/video only after final repaired production build passes device QA |

## AI Shop regression and prepared correction

Owner Android QA at approximately 13:47–13:49 showed the public Forge Studio surface. Pressing its creation/order action opened Android's download confirmation dialog for a file named like `FORGE-projekt (3).json`. This is useful as a project brief/export function, but it is not evidence of a working generation backend and should not be the primary WORLDIFACT Shop experience.

Prepared branch `fix/native-ai-shop-generation-20260916`:

- primary `/shop` renders the native WORLDIFACT studio instead of depending on the legacy remote iframe;
- prompt + optional image controls remain visible;
- `Generate DEMO concept · no download` updates the procedural Three.js preview on-page;
- DEMO is clearly `DEMO / MOCK` and `model=null`;
- reference image is only interpreted by future LIVE Astra; in DEMO it is only previewed locally;
- explicit `WorldBlueprint` / `AssetSpec` and GAME preview exports remain available, but only via explicit buttons;
- MAKE remains `BLOCKED / VALIDATION REQUIRED`;
- old Forge Studio remains accessible as `Legacy Forge Studio ↗`;
- no new Astra or Oracle request is made by this fix.

Detailed AI Shop device QA: `docs/AI_SHOP_QA_2026-09-16.md`.

## Five-world QA milestone

Production release for commit `06ea9218d6e74929834d6b93257d0db473272273` passed verify, foundation assembly, deploy-check, deployment and public HTML/API smoke. The release checker requests every primary world route and verifies copied Chess/ISS/Terra application assets. This is HTTP/build evidence, not a substitute for physical Android WebGL QA.

Detailed matrix: `docs/WORLD_QA_2026-09-16.md`.

## LIVE P0 evidence

1. **#1 LIVE Astra text — PASS.** `Green Valley Solar Rover Workshop`; 3 objects; 905 tokens.
2. **#2 LIVE Astra image — SAFE FAILURE.** Sanitized HTTP 502; no retry.
3. **#3 LIVE Astra image — PASS.** `Blue and Green Valley Garden`; 6 objects; MAKE `validation-required`; 1,594 tokens; blueprint SHA-256 `4af2418993a9052db2b2265c6a4e235c3ebc0d2298ba0ef43f0fb0982b4feb1b`.
4. **#4 Oracle prompt job — PASS at generation/job level.** Astra/Codex/Blender completed and produced the retrieved GLB.

## Immediate gates

1. Get green exact-head CI for `fix/native-ai-shop-generation-20260916`.
2. Do not merge/deploy that fix until explicit owner approval.
3. After deployment, re-test `/shop` on Android: Generate DEMO changes the preview and no download dialog appears.
4. Re-test `/planets`: expedition view first, Mini test works, external FORGE link opens separately.
5. Re-test `/lab`: all three local examples change the scene; output remains `DEMO · MOCK`; World #5 reference opens; LIVE remains blocked under exhausted 4/4 quota.
6. Re-open `/chess`, `/iss` and `/terra` in the same clean Android session and record any failure.
7. Run desktop QA and accessibility/responsive checks.
8. Decide a separate launch-time Astra allowance only if judges should make fresh LIVE requests.
9. Visually review the Oracle GLB before any quality/manufacturing claim.
10. Capture final launch media and re-open official contest pages immediately before scheduling/submission.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a local DEMO as an Astra result, procedural preview as Oracle-generated geometry, the Oracle `GENERATED-UNREVIEWED` GLB as quality-approved/manufacturing-ready, a downloaded project brief as a generated 3D model, or a MAKE candidate as production-ready.
