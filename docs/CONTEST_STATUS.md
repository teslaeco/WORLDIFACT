# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 technical flow has real LIVE evidence; final contest readiness is still NO-GO pending clean-session/device QA, final media, launch-time Astra allowance, and final Product Hunt form/rules review.** The reference flow is `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`. The other four worlds remain connected but are not the P0 completion gate.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Official Product Hunt contest page names the GPT-6 Astra Challenge and 18 September 2026. Re-open the official contest/form immediately before final submission |
| Production baseline | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; P0 implementation and owner-only Oracle artifact readback are on `main` |
| AI Game Lab P0 | LIVE IMPLEMENTATION DEPLOYED | `/lab` is the native reference workbench; Astra Structured Output requires and validates both `WorldBlueprint` and `AssetSpec`; the validated blueprint drives the visible Three.js scene |
| Text Astra proof | LIVE / GENERATED | Paid pilot reservation #1 succeeded: `Green Valley Solar Rover Workshop`, 3 scene objects, main asset `Workshop Rover`, 905 total provider-reported tokens |
| Image Astra proof | LIVE / GENERATED | Paid recovery reservation #3 succeeded: `Blue and Green Valley Garden`, 6 scene objects, `Blue Garden Monument`, 1,594 total provider-reported tokens, response `resp_074915dbcf617af1016aaa3474281c87d19318b0b7abbbae56` |
| Failed image attempt | SAFE FAILURE | Reservation #2 returned sanitized HTTP 502. The attempt still consumed the global reservation by design; no automatic retry occurred |
| AssetSpec / GAME / MAKE | VERIFIED CONTRACT | Astra output includes separate GAME and MAKE plans. MAKE is forced to `validation-required`; no manufacturing-ready file, quote, order or approval is claimed |
| Oracle VM | STORAGE EXPANDED; SERVICES HEALTHY | Boot volume 100 GB; Linux `sda=100G`, `sda3=97.9G`, root LV `82.9G`, root filesystem `83G` with about `54G` free. `froge-worker` and `froge-tunnel` remained active |
| Oracle model job | LIVE / GENERATED-UNREVIEWED | Job `4a1db549-cc82-4b2e-bf15-7877e06fc968` reached `succeeded` after 249.9 s. The resulting GLB was retrieved read-only and cryptographically/structurally verified. Connector detail still says the working result requires corrections/review, so visual/model-quality approval is not claimed |
| Oracle GLB evidence | VERIFIED BINARY / QUALITY UNREVIEWED | GLB: 204,732 bytes; SHA-256 `73823a6e463df2b91a716c1afb50068cc150ed6003a177073f9048528c4c4dbc`; glTF 2.0; Blender glTF exporter; 30 named meshes / 31 primitives, 30 nodes, 7 materials, 0 textures, 0 images, 0 animations, 5,132 declared vertices, 9,024 indexed elements. Provenance remains `GENERATED-UNREVIEWED` |
| Five-world Oracle bridge | DEPLOYED | One server-side Oracle connection is shared by Chess, ISS, Planets, Shop and Game Lab; secrets stay server-side |
| Public pilot quota | EXHAUSTED / HARD CAPPED | The approved cumulative ceiling was exactly 4 reservations. All four are consumed. Do not make another paid generation call without a new explicit owner approval |
| Public no-login flow | IMPLEMENTED; LIVE QUOTA CURRENTLY EXHAUSTED | The no-login route is implemented and was proven with real Astra calls under rate limiting, expiry and persistent global quota. A launch allowance must be separately approved before public judges can make fresh LIVE calls |
| Public HTTPS | VERIFIED HTTP | Automated no-browser evidence confirmed `/`, `/lab`, and `/api/health` respond over public HTTPS. This is not browser/WebGL/device QA |
| Android/browser QA | PARTIAL / MANUAL TEST REQUIRED | `/control` was visually checked earlier on Android. Full clean-session `/lab` WebGL interaction, scene change, accessibility and fallback QA remains |
| Launch materials | DRAFT | Capture genuine P0 screenshots/video from the deployed interface and clearly separate LIVE generated specifications, procedural GAME geometry, Oracle `GENERATED-UNREVIEWED` output and MAKE validation-required concepts |

## LIVE P0 evidence

The approved pilot had an absolute persistent ceiling of four reservations over three hours. Provider failures were intentionally not refunded and no automatic generation retries were allowed.

1. **Reservation #1 — LIVE Astra text:** success. `Green Valley Solar Rover Workshop`; 3 scene objects; `Workshop Rover`; 905 total tokens.
2. **Reservation #2 — LIVE Astra image:** safe failure. Provider returned sanitized HTTP 502; no secret/provider body leaked and no retry was issued.
3. **Reservation #3 — LIVE Astra image:** success. `Blue and Green Valley Garden`; 6 objects; `Blue Garden Monument`; MAKE `validation-required`; 1,594 total tokens; blueprint SHA-256 `4af2418993a9052db2b2265c6a4e235c3ebc0d2298ba0ef43f0fb0982b4feb1b`.
4. **Reservation #4 — Oracle prompt job:** success at the generation/job level. Job `4a1db549-cc82-4b2e-bf15-7877e06fc968` completed through connector v33 / Astra / Codex / Blender in 249.9 s.

## Oracle artifact evidence

The completed Oracle job was later retrieved through an owner-only, read-only endpoint. This retrieval did **not** reserve generation budget and did **not** call Astra or start Blender again.

- file size: **204,732 bytes**;
- SHA-256: **`73823a6e463df2b91a716c1afb50068cc150ed6003a177073f9048528c4c4dbc`**;
- glTF version: **2.0**;
- generator metadata: **Khronos glTF Blender I/O v4.3.47**;
- scene count: 1; nodes: 30; meshes: 30; primitives: 31;
- materials: 7; textures: 0; images: 0; animations: 0;
- declared vertices: 5,132; indexed elements: 9,024;
- provenance label: **`GENERATED-UNREVIEWED`**.

The structural report includes rover-related names such as `Chamfered chassis`, `Six low poly tires`, `Three solar panel frames`, `Solar cell array`, `Sensor mast`, camera lenses and rear vent slots. This confirms a real generated GLB with non-empty rover geometry, but it does **not** prove visual quality, printability or manufacturing readiness. The connector itself reported that corrections/review are still required.

Artifact review workflow run `35079392864` completed successfully and also confirmed public HTTP responses for `/`, `/lab`, and `/api/health`. The one-time review marker was removed after the evidence was captured so future deployments cannot repeat the artifact review accidentally.

## What P0 now proves

WORLDIFACT has real server-side GPT-6 Astra execution using Structured Outputs. Successful production requests returned validated `WorldBlueprint + AssetSpec`; the blueprint uses the same client contract that drives the Three.js scene, while the UI exposes the generated plan and separates GAME from MAKE. Both text-only and image-input Astra requests succeeded in production.

A separate owner-only Oracle route also completed an Astra/Codex/Blender job and produced a real GLB that was retrieved and structurally verified. This file is evidence of actual 3D generation, but remains `GENERATED-UNREVIEWED` until a human visually reviews the geometry/material result.

## Immediate gates

1. Run clean-session Android + desktop QA of `/lab`: scene rendering/change, blueprint/spec visibility, GAME/MAKE labels, WebGL/fallback, responsiveness and accessibility. No further paid call is permitted under the exhausted four-attempt pilot.
2. Visually review the retrieved Oracle GLB before using it in Product Hunt media or upgrading its status beyond `GENERATED-UNREVIEWED`.
3. Decide a separate launch-time Astra allowance/cost ceiling if public Product Hunt visitors should be able to make fresh LIVE calls. Until approved, keep further paid generation blocked/exhausted rather than silently increasing the budget.
4. Capture real screenshots/demo video from the deployed product and finalize Product Hunt copy, Shoutouts, topics and Maker Comment.
5. Re-open the official contest page and final submission form immediately before scheduling/submitting.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a procedural preview as an Oracle-generated model, an Oracle `GENERATED-UNREVIEWED` file as quality-approved or manufacturing-ready, a MAKE candidate as manufacturing-ready, or an estimate as an actual quote/order.
