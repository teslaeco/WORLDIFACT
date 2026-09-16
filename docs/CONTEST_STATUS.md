# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 has real LIVE Astra evidence, but final contest readiness remains NO-GO pending final device QA and launch preparation. Owner Android QA now proves the local 8 Planets mini test renders; the owner requested the main expedition view to return as the default and the mini test to move into a tab. AI Game Lab also needs an explicit World #5 reference tab and visible no-cost examples. These changes are prepared on `feat/world-tabs-audit-20260916` and are not production until owner-approved merge/deploy.**

Reference flow: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Re-open the official Product Hunt contest page, launch guide and submission form immediately before scheduling/submitting |
| Production | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; current production commit `4a83543fba174e9a66eb53356798f99fa448b86c` |
| Five primary worlds | SOURCE/ROUTE VERIFIED | Exactly five portal IDs/routes; automated release checker requests all primary routes over HTTPS |
| Chess Cube 512 AI | OWNER-REPORTED WORKING / ROUTE VERIFIED | `/chess` hands off to the public Chess Cube site; final dedicated screenshot still useful |
| Terra — Fix ISS | OWNER-REPORTED WORKING / COPIED APP VERIFIED | `/iss` is assembled into the release manifest; Earth observation remains separate and labelled |
| 8 Planets in 8 Days | MINI TEST ANDROID PASS / UX CHANGE PREPARED | Owner screenshot at 13:15 shows the no-login mini test rendering. Branch restores the WORLDIFACT expedition view as default, keeps Mini test as a tab and leaves the older FORGE prototype as an external reference |
| Enchanted AI Shop | OWNER-REPORTED WORKING | `/shop` remains connected; manufacturing claims stay validation-required |
| AI Game Lab P0 | LIVE IMPLEMENTATION DEPLOYED / UX CHANGE PREPARED | Native `/lab`, WebGL, validated Blueprint+AssetSpec and GAME/MAKE. Branch adds World #5 Forge Studio/ForgeMCP tabs plus three no-cost DEMO examples |
| Text Astra proof | LIVE / GENERATED | Reservation #1: `Green Valley Solar Rover Workshop`, 3 objects, 905 provider-reported tokens |
| Image Astra proof | LIVE / GENERATED | Reservation #3: `Blue and Green Valley Garden`, 6 objects, 1,594 tokens; response `resp_074915dbcf617af1016aaa3474281c87d19318b0b7abbbae56` |
| Failed Astra image attempt | SAFE FAILURE | Reservation #2 returned sanitized HTTP 502; no retry and no secret leakage |
| GAME / MAKE contract | VERIFIED | Separate GAME and MAKE; MAKE forced to `validation-required` |
| Public pilot quota | EXHAUSTED / HARD CAPPED | Exactly 4/4 approved reservations consumed. No further paid generation without new explicit owner approval |
| Oracle VM | HEALTHY | 100 GB boot volume; root ~83 GB with ~54 GB free; worker/tunnel active |
| Oracle job | LIVE / GENERATED-UNREVIEWED | Job `4a1db549-cc82-4b2e-bf15-7877e06fc968` succeeded after 249.9 s |
| Oracle GLB | VERIFIED BINARY / QUALITY UNREVIEWED | 204,732 B; SHA-256 `73823a6e463df2b91a716c1afb50068cc150ed6003a177073f9048528c4c4dbc`; glTF 2.0; 30 meshes; 7 materials; no textures/images/animations |
| Launch materials | DRAFT | Capture screenshots/video only after final repaired production build passes device QA |

## Five-world QA milestone

Production release run `35088686381` passed verify, foundation assembly, deploy-check, deployment and public HTML/API smoke for commit `4a83543fba174e9a66eb53356798f99fa448b86c`. The release checker requests every primary world route and verifies copied Chess/ISS/Terra application assets. This is HTTP/build evidence, not a substitute for physical Android WebGL QA.

Detailed matrix: `docs/WORLD_QA_2026-09-16.md`.

## Prepared 8 Planets change

- default tab: **Original WORLDIFACT view** — eight-stage expedition map with selectable planet mission/hazard detail;
- second tab: **Mini test** — the working Move/Jump/progress interaction shown in owner Android QA;
- external reference: original FORGE World Builder opens separately because its cross-site iframe was visibly unreliable on Android;
- truth boundary: main expedition surface is a DEMO view and the full eight-level platforming campaign remains **PLANNED**.

## Prepared AI Game Lab change

- native WORLDIFACT P0 remains the primary view;
- visible **World #5 · Forge Studio** reference tab opens the public Forge Studio page from project instructions;
- ForgeMCP source is available beside it;
- three no-cost example prompts are available: Forest rover workshop, Lunar repair base and Neptune maker town;
- examples use only `demoBlueprint` + `localSceneResult`, return `DEMO / MOCK`, `model=null`, and MAKE `validation-required`;
- zero OpenAI/Oracle calls are made by these examples.

## LIVE P0 evidence

1. **#1 LIVE Astra text — PASS.** `Green Valley Solar Rover Workshop`; 3 objects; 905 tokens.
2. **#2 LIVE Astra image — SAFE FAILURE.** Sanitized HTTP 502; no retry.
3. **#3 LIVE Astra image — PASS.** `Blue and Green Valley Garden`; 6 objects; MAKE `validation-required`; 1,594 tokens; blueprint SHA-256 `4af2418993a9052db2b2265c6a4e235c3ebc0d2298ba0ef43f0fb0982b4feb1b`.
4. **#4 Oracle prompt job — PASS at generation/job level.** Astra/Codex/Blender completed and produced the retrieved GLB.

## Immediate gates

1. Run exact-head CI for `feat/world-tabs-audit-20260916`.
2. Do not merge/deploy until explicit owner approval.
3. After deployment, re-test `/planets`: expedition view first; Mini test tab works; external FORGE link opens separately.
4. Re-test `/lab`: all three local examples change the scene; output remains `DEMO · MOCK`; World #5 public reference opens; LIVE remains blocked under exhausted 4/4 quota.
5. Re-open `/chess`, `/iss`, `/shop` and `/terra` in the same clean Android session and record any failure.
6. Run desktop QA and accessibility/responsive checks.
7. Decide a separate launch-time Astra allowance only if judges should make fresh LIVE requests.
8. Visually review the Oracle GLB before any quality/manufacturing claim.
9. Capture final launch media and re-open official contest pages immediately before scheduling/submission.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a local DEMO as an Astra result, procedural preview as Oracle-generated geometry, the Oracle `GENERATED-UNREVIEWED` GLB as quality-approved/manufacturing-ready, or a MAKE candidate as production-ready.
