# Contest status — WORLDIFACT, 16 September 2026

Decision: **NO-GO for final contest launch until the MPC2 generator port reaches production and completes one clean Android REAL 3D generation plus the final five-world device pass.** Core P0 has real LIVE Astra evidence, a verified prior Oracle/Blender GLB, and the replacement MPC2 Shop port is exact-head CI green on PR #27.

Reference flows:

- concept: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible scene change → GAME / MAKE`;
- real Shop model: `PROMPT → GPT-6 ASTRA / Oracle connector → Blender job → SAME-JOB recovery/polling → validated GLB → in-page 3D preview → explicit download`.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Re-open official Product Hunt contest page, launch guide and submission form immediately before scheduling/submitting |
| Production | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; current production merge commit `d26e13b842b05bf57179378d71dd2def0f8ec5d6` |
| Production CI | VERIFIED | Main verify, foundations and deploy-check all passed after PR #26 merge |
| Production deploy | VERIFIED | Cloudflare deploy and public HTML/assets/DEMO smoke completed successfully |
| Five primary worlds | SOURCE/ROUTE VERIFIED | Exactly five primary routes remain configured |
| Chess Cube 512 AI | ROUTE VERIFIED | `/chess` hands off to the public Chess Cube app |
| Terra — Fix ISS | COPIED APP VERIFIED | `/iss` is assembled into the release manifest; Earth observation remains separately labelled |
| 8 Planets in 8 Days | DEPLOYED / DEVICE RE-TEST NEEDED | `/planets` remains native WORLDIFACT with external FORGE reference separated |
| AI Shop legacy FORGE page | LEGACY EXPORT ONLY | Android screenshot proved `FORGE-projekt.json` download; it is not the active generator |
| AI Shop production `/shop` | ANDROID UI FAIL | Generic absolute `.webgl-fallback` can cover the Shop controls, leaving only the 3D placeholder visible |
| AI Shop MPC2 port PR #27 | PREPARED / EXACT-HEAD CI GREEN | Replaces the placeholder-first surface with the proven MPC2 ModelStudio / RemoteGenerator interaction pattern adapted to WORLDIFACT's reviewed Oracle/Astra/Blender backend |
| AI Shop portal entry | SOURCE VERIFIED / DEVICE RE-TEST NEEDED | Portal route remains `/shop`; after PR #27 the generator controls are the first mobile surface |
| AI Shop image-to-model | BLOCKED_UNVERIFIED | REAL Oracle connector remains prompt-only until reference-image input is proven end-to-end |
| AI Game Lab P0 | DEPLOYED | Native `/lab`; validated Blueprint+AssetSpec; GAME/MAKE separation; local DEMO and LIVE evidence remain distinct |
| Text Astra proof | LIVE / GENERATED | Validated provider result recorded |
| Image Astra proof | LIVE / GENERATED | Validated provider result recorded |
| Oracle job evidence | LIVE / GENERATED-UNREVIEWED | Previous controlled Oracle job succeeded and produced a GLB |
| Oracle GLB evidence | VERIFIED BINARY / QUALITY UNREVIEWED | glTF 2.0 artifact verified by server-side binary/header/hash checks; no manufacturing approval implied |
| Shared paid pilot | HARD CAPPED | Absolute cumulative ceiling is exactly 6; paid `/api/blueprint` stays OFF; Oracle jobs remain separately gated |
| Launch materials | DRAFT | Capture final screenshots/video only after repaired production passes Android + desktop QA |

## PR #27 — direct MPC2 generator port

Android QA at 20:16–20:17 showed that `/shop` still rendered only the full-height `3D result appears here` placeholder. The root cause is the Shop reusing the generic `.webgl-fallback` class, which is globally `position:absolute; inset:0` and can cover the generator controls.

PR #27 removes that failure mode and ports the proven interaction pattern from `teslaeco/Froge-MPC-2-test`:

- source reference: `src/components/ModelStudio.tsx` + `src/blender/RemoteGenerator.tsx` (MIT repository);
- generator controls are first on Android/mobile, 3D preview second;
- prompt → one Oracle/Astra/Blender job → same-job polling/recovery → GLB loaded into the page;
- the job id is persisted before POST and the paid POST is never automatically repeated;
- transient mobile/network failures retry reads for the same job id;
- explicit GLB download only after a successful in-page preview;
- reference-image → REAL 3D remains blocked until verified;
- generated output remains `GENERATED-UNREVIEWED`; MAKE remains validation-required.

Exact-head CI for PR #27 passed `npm ci`, full `npm run verify`, foundation assembly and `deploy:check`.

## Repaired AI Shop deployment from PR #26

PR #26 was merged after exact-head CI passed. Production deployment then passed full verify, foundation assembly, deploy-check, secret synchronization, Cloudflare deployment, and public HTML/assets/DEMO smoke.

The backend recovery contract remains valid and is reused by PR #27:

- one paid POST per REAL 3D job only;
- job id persisted before submission;
- no automatic paid POST retry after a lost response;
- recovery by polling the same saved job id after refresh/network interruption;
- bounded retries for transient fetch, HTTP 429 and 5xx status/model reads;
- generated GLB loaded into the page before any download;
- explicit GLB download action only.

## Immediate gates

1. Merge/deploy PR #27 after owner approval.
2. Android clean-session test: meadow portal → `/shop` and confirm prompt + Generate button appear immediately.
3. Submit one REAL 3D prompt only once when a paid slot is explicitly available.
4. Confirm progress survives transient mobile/network failures by recovering the same job id.
5. Confirm the completed GLB renders in-page and nothing downloads automatically.
6. Verify the explicit GLB download button separately.
7. Re-test `/planets`, `/lab`, `/chess`, `/iss` and `/terra` in the same Android session.
8. Run desktop/responsive/accessibility QA.
9. Visually review the generated GLB before any quality or manufacturing claim.
10. Capture final launch media only after production device QA passes.
11. Re-open official contest rules, launch guide and submission form immediately before Product Hunt scheduling/submission.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present the legacy JSON brief as a generated 3D model, a failed-fetch job as a successful artifact, procedural preview geometry as Oracle-generated geometry, `GENERATED-UNREVIEWED` as quality-approved, or a MAKE candidate as manufacturing-ready.
