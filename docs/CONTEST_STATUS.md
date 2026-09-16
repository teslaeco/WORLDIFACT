# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 implementation in progress; final contest readiness is NO-GO.** The current competition priority is one clear AI Game Lab flow: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`. The other four worlds stay connected but are not the P0 completion gate.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Official Product Hunt contest page names the GPT-6 Astra Challenge and 18 September 2026. Re-open the form/rules before final submission |
| Production baseline | DEPLOYED | https://worldifact.xodobrox.workers.dev; shared Oracle health bridge deployed and production smoke passed |
| AI Game Lab P0 | REVIEW BRANCH | PR #13 / `feat/p0-game-lab-astra-20260916` makes `/lab` the native reference workbench, requires Astra Structured Output `WorldBlueprint + AssetSpec`, validates both server-side, applies the blueprint to the Three.js scene and exposes a visible Astra trace with separate GAME/MAKE plans |
| WorldBlueprint | IMPLEMENTED / TESTING | Strict schema and server validation already existed; P0 keeps the visible scene application path and makes it the primary judging flow |
| AssetSpec | IMPLEMENTED ON PR #13 | New strict contract includes GAME geometry/material/animation/gameplay plan and MAKE candidate dimensions/material/process/constraints. MAKE validation status is forced to `validation-required` |
| Visible Astra role | IMPLEMENTED ON PR #13 | UI explicitly shows `PROMPT / IMAGE → GPT-6 ASTRA → WORLD BLUEPRINT → SCENE CHANGE → GAME / MAKE` and lets the user inspect generated blueprint/spec JSON |
| GAME output | PARTIAL / TRUTHFUL | Procedural preview geometry can be added to the scene and exported as GLB. This is not claimed as an Oracle-generated production asset unless a separate Blender job actually produces it |
| MAKE output | BLOCKED / VALIDATION REQUIRED | Candidate manufacturing plan only. No manufacturing-ready file, quote, order or approval is claimed |
| Oracle VM | LIVE HEALTH VERIFIED; STORAGE URGENT | Running connector v33 / character standard 20 / OpenAI / gpt-6-astra is healthy. Owner reports only about 2 GB free now; do not start a Blender batch before storage is expanded and rechecked |
| Five-world Oracle bridge | DEPLOYED READ-ONLY | All five world cards report shared Oracle readiness; secrets stay server-side |
| Oracle prompt job path | PR #12 GREEN; NOT DEPLOYED | Owner-only prompt submit/poll path is reviewed and green behind `ENABLE_ORACLE_JOBS=false`. Image-to-Oracle remains `BLOCKED_UNVERIFIED` |
| Paid Astra | OWNER APPROVED IN PRINCIPLE; NUMERIC PILOT CEILING REQUIRED | User authorized paid Astra use on 16 Sep. Before incurring spend, set a concrete request ceiling/expiry and preview/public access policy, then deploy the approved P0 configuration |
| Public no-login P0 | INCOMPLETE | Current LIVE blueprint path still expects a preview access code. Contest P0 requires a clean-session public flow without login; replace maker-code friction with a tightly budgeted public pilot or another reviewed public allowance before launch |
| Android/browser QA | PARTIAL | Owner screenshot confirms `/control` on Android and five Oracle-ready cards. Full P0 WebGL interaction/accessibility/fallback QA remains |
| Launch materials | DRAFT | Final genuine screenshots/video need the real LIVE Astra run and visible GAME/MAKE trace |

## Current P0 implementation

PR #13 is layered on PR #12 so the infrastructure write path and the contest-facing Astra path remain reviewable separately.

The P0 server request uses `gpt-6-astra` through the Responses API, keeps `OPENAI_API_KEY` server-side, uses strict Structured Outputs, validates prompt/image size, rate limits, times out, and preserves the explicit DEMO fallback. A LIVE result must contain both a valid `WorldBlueprint` and a valid `AssetSpec`. Applying the result changes the 3D scene; the trace panel exposes the generated plan to the user/juror.

The Oracle Blender path remains separate because the current public connector contract verifies prompt jobs but not reference-image jobs. A real Oracle-produced GLB must be labeled as such only after a succeeded job and artifact retrieval.

## Immediate gates

1. Finish exact-head CI for PR #13 and fix any failures; do not merge/deploy on a red head.
2. Expand Oracle storage before new Blender jobs. Back up first; online boot-volume expansion is preferred for the fastest P0 recovery, then extend the Linux filesystem and verify free space.
3. Obtain a concrete paid pilot ceiling and expiry. Recommended first pilot: three WORLDIFACT Astra requests plus one Oracle prompt-only Blender job, with a small hard dollar ceiling.
4. After explicit merge/deploy approval, deploy PR #12 + PR #13 and the reviewed paid flags/limits.
5. Run clean-session public P0 evidence: text prompt first, optional image second → LIVE Astra response → validated blueprint/spec → visible scene change → GAME/MAKE panels. Capture response evidence and media.
6. Only after P0 works, reconnect the same engine to Enchanted AI Shop and the other worlds.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a procedural preview as an Oracle-generated 3D model, a MAKE candidate as manufacturing-ready, or an estimate as an actual quote/order.
