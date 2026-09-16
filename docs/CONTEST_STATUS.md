# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 has real LIVE Astra evidence, but final contest readiness remains NO-GO pending device QA and launch preparation. Owner Android QA found two additional presentation failures: the external 8 Planets iframe is blank, and `/lab` says DEMO only while offering no usable local DEMO action. A no-cost fix is prepared on `fix/nonworking-embedded-worlds-20260916`.**

Reference flow: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Re-open the official Product Hunt contest page, launch guide and submission form immediately before scheduling/submitting |
| Production | DEPLOYED | `https://worldifact.xodobrox.workers.dev` |
| AI Game Lab P0 | LIVE IMPLEMENTATION DEPLOYED | Native `/lab`; validated `WorldBlueprint + AssetSpec`; Three.js scene; GAME/MAKE separation |
| Text Astra proof | LIVE / GENERATED | Reservation #1: `Green Valley Solar Rover Workshop`, 3 scene objects, `Workshop Rover`, 905 provider-reported tokens |
| Image Astra proof | LIVE / GENERATED | Reservation #3: `Blue and Green Valley Garden`, 6 objects, `Blue Garden Monument`, 1,594 tokens; response `resp_074915dbcf617af1016aaa3474281c87d19318b0b7abbbae56` |
| Failed Astra image attempt | SAFE FAILURE | Reservation #2 returned sanitized HTTP 502; no retry and no secret leakage |
| GAME / MAKE contract | VERIFIED | Separate GAME and MAKE plans; MAKE forced to `validation-required` |
| Public pilot quota | EXHAUSTED / HARD CAPPED | Exactly 4/4 approved reservations consumed. No further paid generation without new explicit owner approval |
| Oracle VM | HEALTHY | 100 GB boot volume; root ~83 GB with ~54 GB free; worker/tunnel active after expansion |
| Oracle job | LIVE / GENERATED-UNREVIEWED | Job `4a1db549-cc82-4b2e-bf15-7877e06fc968` succeeded after 249.9 s |
| Oracle GLB | VERIFIED BINARY / QUALITY UNREVIEWED | 204,732 B; SHA-256 `73823a6e463df2b91a716c1afb50068cc150ed6003a177073f9048528c4c4dbc`; glTF 2.0; 30 meshes; 7 materials; no textures/images/animations |
| Portal navigation hotfix | DEPLOYED / SOURCE+CI PASS | PR #19 routes non-current portals out of `/lab`; production CI and deploy passed; full owner-device cross-route re-test remains |
| AI Game Lab Android UI | PARTIAL | WebGL scene and controls render. LIVE correctly blocked by exhausted quota. Current production lacks a usable local DEMO action |
| AI Game Lab no-cost fallback | PREPARED | Fix branch adds `Try DEMO locally · no API cost`, produces clearly-labelled `DEMO / MOCK`, changes scene and exposes local Blueprint/AssetSpec |
| 8 Planets Android | FAIL ON CURRENT PRODUCTION | `/planets` displays a blank/broken external FORGE World Builder iframe on owner Android |
| 8 Planets no-login fallback | PREPARED | Fix branch replaces the primary iframe with local eight-stage `DEMO · MOCK GAMEPLAY`; original FORGE prototype stays an external link; full campaign remains PLANNED |
| Other tested pages | OWNER-REPORTED WORKING | User reports other tested pages work; exact per-route evidence still needs recording |
| Launch materials | DRAFT | Capture screenshots/video only after device QA of the repaired production build |

## LIVE P0 evidence

The approved pilot used a persistent absolute ceiling of four reservations. Provider failures were intentionally not refunded and automatic generation retry was disabled.

1. **#1 LIVE Astra text — PASS.** `Green Valley Solar Rover Workshop`; 3 objects; `Workshop Rover`; 905 tokens.
2. **#2 LIVE Astra image — SAFE FAILURE.** Sanitized HTTP 502; no retry.
3. **#3 LIVE Astra image — PASS.** `Blue and Green Valley Garden`; 6 objects; `Blue Garden Monument`; MAKE `validation-required`; 1,594 tokens; blueprint SHA-256 `4af2418993a9052db2b2265c6a4e235c3ebc0d2298ba0ef43f0fb0982b4feb1b`.
4. **#4 Oracle prompt job — PASS at generation/job level.** Astra/Codex/Blender completed and produced the retrieved GLB.

## Current Android findings and prepared fix

### AI Game Lab

Current production correctly blocks new LIVE Astra generation because the 4/4 pilot is exhausted. The owner device nevertheless sees `DEMO only` with no usable DEMO generation button. The fix branch activates the existing local validated `demoBlueprint` / `localSceneResult` path so a visitor can enter a prompt and see a no-cost, clearly marked `DEMO / MOCK` scene change. It does not call OpenAI or Oracle and cannot be represented as a LIVE Astra result.

### 8 Planets in 8 Days

Current `/planets` depends on an iframe pointing to the external FORGE World Builder prototype. Owner Android shows a broken blank frame. The fix branch makes WORLDIFACT itself provide a no-login local eight-stage DEMO with Move, Jump, course progress and planet selection. The external prototype remains available only through a separate link. This is intentionally labelled DEMO/MOCK; the complete eight-level game remains PLANNED.

## Immediate gates

1. Get green exact-head CI for `fix/nonworking-embedded-worlds-20260916`.
2. Obtain explicit owner approval before merge/deploy.
3. Re-test `/lab` on Android: local DEMO changes the scene, output says `DEMO · MOCK`, GAME/MAKE is visible, and portal routing remains functional.
4. Re-test `/planets` on Android: local content renders without the broken remote iframe and controls respond.
5. Test portrait + landscape and record exact routes that pass.
6. Run desktop QA.
7. Decide a separate launch-time Astra budget only if judges should be able to make fresh LIVE requests.
8. Visually review the Oracle GLB before using it as a quality claim.
9. Capture real launch media and finalize Product Hunt copy.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a local DEMO as an Astra result, procedural preview as Oracle-generated geometry, the Oracle `GENERATED-UNREVIEWED` GLB as quality-approved/manufacturing-ready, or a MAKE candidate as production-ready.
