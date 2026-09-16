# Contest status — AI Game Lab P0, 16 September 2026

Decision: **P0 implementation in progress; final contest readiness is NO-GO.** The current competition priority is one clear AI Game Lab flow: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`. The other four worlds stay connected but are not the P0 completion gate.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Official Product Hunt contest page names the GPT-6 Astra Challenge and 18 September 2026. Re-open the form/rules before final submission |
| Production baseline | DEPLOYED | https://worldifact.xodobrox.workers.dev; shared Oracle health bridge deployed and production smoke passed |
| AI Game Lab P0 | REVIEW BRANCH; GREEN CI | PR #13 / `feat/p0-game-lab-astra-20260916` makes `/lab` the native reference workbench, requires Astra Structured Output `WorldBlueprint + AssetSpec`, validates both server-side, applies the blueprint to the Three.js scene and exposes a visible Astra trace with separate GAME/MAKE plans. Current exact-head CI is green |
| WorldBlueprint | IMPLEMENTED / TESTED | Strict schema and server validation already existed; P0 keeps the visible scene application path and makes it the primary judging flow |
| AssetSpec | IMPLEMENTED ON PR #13 | New strict contract includes GAME geometry/material/animation/gameplay plan and MAKE candidate dimensions/material/process/constraints. MAKE validation status is forced to `validation-required` |
| Visible Astra role | IMPLEMENTED ON PR #13 | UI explicitly shows `PROMPT / IMAGE → GPT-6 ASTRA → WORLD BLUEPRINT + ASSET SPEC → SCENE CHANGE → GAME / MAKE` and lets the user inspect generated blueprint/spec JSON |
| GAME output | PARTIAL / TRUTHFUL | Procedural preview geometry can be added to the scene and exported as GLB. This is not claimed as an Oracle-generated production asset unless a separate Blender job actually produces it |
| MAKE output | BLOCKED / VALIDATION REQUIRED | Candidate manufacturing plan only. No manufacturing-ready file, quote, order or approval is claimed |
| Oracle VM | STORAGE EXPANDED; SERVICES HEALTHY | OCI boot volume is 100 GB. Linux now sees `sda=100G`, `sda3=97.9G`, root LV `82.9G`, root filesystem `83G` with about `54G` free. `froge-worker` and `froge-tunnel` both remained active. Running connector remains v33 / character standard 20 / OpenAI / gpt-6-astra |
| Oracle storage economics | COST APPROVED; RESIZE COMPLETE | Owner approved 100 GB provided yearly incremental cost stays <= EUR 40. Oracle documents 200 GB combined boot/block storage in the home region as Always Free for eligible tenancies; actual billing remains tenancy-specific. No second data disk was created |
| Five-world Oracle bridge | DEPLOYED READ-ONLY | All five world cards report shared Oracle readiness; secrets stay server-side |
| Oracle prompt job path | PR #12 GREEN; NOT DEPLOYED | Owner-only prompt submit/poll path is reviewed and green behind `ENABLE_ORACLE_JOBS=false`. Image-to-Oracle remains `BLOCKED_UNVERIFIED` |
| Paid Astra | OWNER COST APPROVED; NOT YET ARMED | Owner approved up to USD 5 total for the first pilot, with an absolute shared ceiling of 4 attempts over 3 hours. Current production remains paid-OFF until the merge/deploy approval and pilot workflow activation |
| Public no-login P0 | PREPARED ON PR #13 | Reviewed public pilot path removes login friction only when hard-capped rate limit, expiry and Durable Object global request ceiling are armed. Default automatic releases stay OFF |
| Android/browser QA | PARTIAL | Owner screenshot confirms `/control` on Android and five Oracle-ready cards. Full P0 WebGL interaction/accessibility/fallback QA remains |
| Launch materials | DRAFT | Final genuine screenshots/video need the real LIVE Astra run and visible GAME/MAKE trace |

## Current P0 implementation

PR #13 is layered on PR #12 so the infrastructure write path and the contest-facing Astra path remain reviewable separately.

The P0 server request uses `gpt-6-astra` through the Responses API, keeps `OPENAI_API_KEY` server-side, uses strict Structured Outputs, validates prompt/image size, rate limits, times out, and preserves the explicit DEMO fallback. A LIVE result must contain both a valid `WorldBlueprint` and a valid `AssetSpec`. Applying the result changes the 3D scene; the trace panel exposes the generated plan to the user/juror.

The Oracle Blender path remains separate because the current public connector contract verifies prompt jobs but not reference-image jobs. A real Oracle-produced GLB must be labeled as such only after a succeeded job and artifact retrieval.

## Approved pilot envelope

Owner approval recorded 16 September 2026:

- Oracle boot volume target: **100 GB — completed**.
- Oracle incremental cost ceiling: **EUR 40/year**.
- Astra pilot spending ceiling: **USD 5 total**.
- Hard execution ceiling: **4 shared attempts maximum** over **3 hours**.
- Suggested allocation: 3 public P0 Astra blueprint/spec calls + 1 owner-only Oracle prompt job.
- No batch of Blender jobs; start with one controlled Oracle prompt job only after production deployment.
- These approvals do not by themselves authorize merging or production deployment; those remain separate explicit gates.

Current OpenAI model documentation identifies `gpt-6-astra` as the production model ID and lists text pricing at USD 10 / 1M input tokens and USD 50 / 1M output tokens. Image input is supported through the Responses API. The product hard cap remains the primary spend control.

## Immediate gates

1. Obtain explicit merge/deploy approval for PR #12 + PR #13; do not infer it from the cost approval.
2. After deployment, arm the reviewed manual pilot for 4 attempts / 3 hours and keep the USD 5 spending ceiling.
3. Run clean-session public P0 evidence: text prompt first, optional image second → LIVE Astra response → validated blueprint/spec → visible scene change → GAME/MAKE panels. Capture response evidence and media.
4. Run one owner-only Oracle prompt job; call its GLB GENERATED only after a succeeded job and artifact retrieval.
5. Complete Android/WebGL interaction, accessibility and fallback QA.
6. Only after P0 works, reconnect the same engine to Enchanted AI Shop and the other worlds.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present a procedural preview as an Oracle-generated 3D model, a MAKE candidate as manufacturing-ready, or an estimate as an actual quote/order.
