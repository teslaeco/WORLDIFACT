# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 LIVE evidence exists; final contest readiness is still NO-GO pending clean-session/device QA, final media, and final Product Hunt form/rules review.** The reference flow is `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`. The other four worlds remain connected but are not the P0 completion gate.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Official Product Hunt contest page names the GPT-6 Astra Challenge and 18 September 2026. Re-open the official contest/form immediately before final submission |
| Production baseline | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; PR #12 and PR #13 are merged on `main` |
| AI Game Lab P0 | LIVE IMPLEMENTATION DEPLOYED | `/lab` is the native reference workbench; Astra Structured Output requires and validates both `WorldBlueprint` and `AssetSpec`; the validated blueprint drives the visible Three.js scene |
| Text Astra proof | LIVE / GENERATED | Paid pilot reservation #1 succeeded: `Green Valley Solar Rover Workshop`, 3 scene objects, main asset `Workshop Rover`, 905 total provider-reported tokens |
| Image Astra proof | LIVE / GENERATED | Paid recovery reservation #3 succeeded with a generated 512×512 reference PNG: `Blue and Green Valley Garden`, 6 scene objects, `Blue Garden Monument`, 1,594 total provider-reported tokens, response `resp_074915dbcf617af1016aaa3474281c87d19318b0b7abbbae56` |
| Failed image attempt | SAFE FAILURE | Reservation #2 used a tiny 1×1 PNG and the upstream request returned sanitized HTTP 502. The attempt still consumed the global reservation by design; no automatic retry occurred |
| AssetSpec / GAME / MAKE | VERIFIED CONTRACT | Astra output includes separate GAME and MAKE plans. MAKE is forced to `validation-required`; no manufacturing-ready file, quote, order or approval is claimed |
| Oracle VM | STORAGE EXPANDED; SERVICES HEALTHY | Boot volume 100 GB; Linux `sda=100G`, `sda3=97.9G`, root LV `82.9G`, root filesystem `83G` with about `54G` free. `froge-worker` and `froge-tunnel` remained active |
| Oracle model job | LIVE JOB SUCCEEDED; ARTIFACT REVIEW PENDING | Reservation #4 submitted owner-only job `4a1db549-cc82-4b2e-bf15-7877e06fc968` to connector v33. It reached `succeeded` after 249.9 s. Connector detail explicitly says the working result still has errors or incomplete evaluation and requires review. The GLB is **not yet labelled GENERATED** until retrieved and inspected |
| Five-world Oracle bridge | DEPLOYED | One server-side Oracle connection is shared by Chess, ISS, Planets, Shop and Game Lab; secrets stay server-side |
| Public pilot quota | EXHAUSTED / HARD CAPPED | The owner-approved cumulative ceiling was exactly 4 reservations. All four are consumed: text success, tiny-image safe failure, image success, Oracle job. Do not make any further paid generation call without a new explicit owner approval |
| Public no-login flow | IMPLEMENTED; LIVE QUOTA CURRENTLY EXHAUSTED | The no-login route is implemented and was proven with real Astra calls under rate limiting, expiry and persistent global quota. A launch allowance must be separately approved before public judges can make fresh LIVE calls |
| Android/browser QA | PARTIAL | `/control` was visually checked on Android. Full clean-session `/lab` WebGL interaction, accessibility and fallback QA remains |
| Launch materials | DRAFT | Capture genuine P0 screenshots/video from the deployed interface and clearly separate LIVE generated specifications, procedural GAME geometry and MAKE validation-required concepts |

## LIVE P0 evidence

The approved pilot had an absolute persistent ceiling of four reservations over three hours. Provider failures were intentionally not refunded and no automatic generation retries were allowed.

1. **Reservation #1 — LIVE Astra text:** success. `Green Valley Solar Rover Workshop`; 3 scene objects; `Workshop Rover`; 905 total tokens.
2. **Reservation #2 — LIVE Astra image:** safe failure. A 1×1 test PNG reached the provider and returned sanitized HTTP 502. No secret/provider body leaked and no retry was issued.
3. **Reservation #3 — LIVE Astra image:** success with a valid generated 512×512 PNG. `Blue and Green Valley Garden`; 6 objects; `Blue Garden Monument`; MAKE `validation-required`; 1,594 total tokens; blueprint SHA-256 `4af2418993a9052db2b2265c6a4e235c3ebc0d2298ba0ef43f0fb0982b4feb1b`.
4. **Reservation #4 — Oracle prompt job:** success at the job-state level. Job `4a1db549-cc82-4b2e-bf15-7877e06fc968` completed through connector v33 / Astra / Codex / Blender in 249.9 s. Its own detail says the result needs corrections/review; do not present the GLB as an approved or production-ready asset.

Recovery workflow run `35062964584` completed successfully. Pilot deployment version during the recovery was `51da4344-6372-4a4d-9382-eeb6e4f25977`.

## What P0 now proves

WORLDIFACT has real server-side GPT-6 Astra execution using Structured Outputs. A successful response contains validated `WorldBlueprint + AssetSpec`; the blueprint is accepted by the same client contract that changes the Three.js scene, while the UI exposes the generated plan and separates GAME from MAKE. Both text-only and image-input Astra requests have succeeded in production.

The Oracle path is a separate 3D-generation route. A real owner-only Oracle job reached `succeeded`, but artifact retrieval/inspection remains a separate evidence step. The connector itself reported that the working result needs review, so quality approval is not claimed.

## Immediate gates

1. Retrieve the succeeded Oracle job GLB read-only, verify GLB magic/version/size/hash and visually inspect it before using the label `GENERATED` for that file.
2. Run clean-session Android + desktop QA of `/lab`: scene change, blueprint/spec visibility, GAME/MAKE labels, WebGL/fallback and accessibility. No further paid call is permitted under the exhausted four-attempt pilot.
3. Decide a separate launch-time Astra allowance/cost ceiling if public Product Hunt visitors should be able to make fresh LIVE calls. Until approved, keep further paid generation blocked/exhausted rather than silently increasing the budget.
4. Capture real screenshots/demo video from the deployed product and finalize Product Hunt copy, Shoutouts, topics and Maker Comment.
5. Re-open the official contest page and final submission form immediately before scheduling/submitting.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a procedural preview as an Oracle-generated model, an Oracle job merely reaching `succeeded` as a quality-approved artifact, a MAKE candidate as manufacturing-ready, or an estimate as an actual quote/order.
