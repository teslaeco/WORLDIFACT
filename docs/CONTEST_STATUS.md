# Contest status — WORLDIFACT, 16 September 2026

Decision: **NO-GO for final contest launch until the repaired AI Shop completes one clean Android REAL 3D generation and the final five-world device pass.** Core P0 has real LIVE Astra evidence, a verified prior Oracle/Blender GLB, green CI, and the repaired native AI Shop is now deployed.

Reference flows:

- concept: `PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible scene change → GAME / MAKE`;
- real Shop model: `PROMPT → GPT-6 ASTRA / Oracle connector → Blender job → SAME-JOB recovery/polling → validated GLB → in-page 3D preview → explicit download`.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE VERIFIED; FINAL FORM REVIEW PENDING | Re-open official Product Hunt contest page, launch guide and submission form immediately before scheduling/submitting |
| Production | DEPLOYED | `https://worldifact.xodobrox.workers.dev`; repaired app merge commit `d26e13b842b05bf57179378d71dd2def0f8ec5d6` |
| Production CI | VERIFIED | Main verify, foundations and deploy-check all passed after merge |
| Production deploy | VERIFIED | Cloudflare deploy and public HTML/assets/DEMO smoke completed successfully |
| Five primary worlds | SOURCE/ROUTE VERIFIED | Exactly five primary routes remain configured |
| Chess Cube 512 AI | ROUTE VERIFIED | `/chess` hands off to the public Chess Cube app |
| Terra — Fix ISS | COPIED APP VERIFIED | `/iss` is assembled into the release manifest; Earth observation remains separately labelled |
| 8 Planets in 8 Days | DEPLOYED / DEVICE RE-TEST NEEDED | `/planets` remains native WORLDIFACT with external FORGE reference separated |
| AI Shop legacy FORGE page | LEGACY EXPORT ONLY | Android screenshot proved `FORGE-projekt.json` download; it is no longer the primary generation flow |
| AI Shop repaired native `/shop` | DEPLOYED | Dedicated generator UI, same-job recovery, persisted job id, bounded polling/model retries, in-page GLB, explicit download only |
| AI Shop portal entry | DEPLOYED / ANDROID RE-TEST NEEDED | Mobile portal collision/reach made more forgiving; route resolves directly to `/shop` |
| AI Shop image-to-model | BLOCKED_UNVERIFIED | REAL Oracle connector remains prompt-only until reference-image input is proven end-to-end |
| AI Game Lab P0 | DEPLOYED | Native `/lab`; validated Blueprint+AssetSpec; GAME/MAKE separation; local DEMO and LIVE evidence remain distinct |
| Text Astra proof | LIVE / GENERATED | Validated provider result recorded |
| Image Astra proof | LIVE / GENERATED | Validated provider result recorded |
| Oracle job evidence | LIVE / GENERATED-UNREVIEWED | Previous controlled Oracle job succeeded and produced a GLB |
| Oracle GLB evidence | VERIFIED BINARY / QUALITY UNREVIEWED | glTF 2.0 artifact verified by server-side binary/header/hash checks; no manufacturing approval implied |
| Shared paid pilot | ARMED / HARD CAPPED | Absolute cumulative ceiling is exactly 6; paid `/api/blueprint` stays OFF; Oracle jobs are enabled for at most one additional repaired-Shop REAL 3D test |
| Shop pilot smoke | VERIFIED | First post-deploy smoke hit stale edge state; rerunning the same no-cost workflow passed without any paid generation |
| Launch materials | DRAFT | Capture final screenshots/video only after repaired production passes Android + desktop QA |

## Repaired AI Shop deployment

PR #26 was merged after exact-head CI passed. Production deployment then passed full verify, foundation assembly, deploy-check, secret synchronization, Cloudflare deployment, and public HTML/assets/DEMO smoke.

The native `/shop` now provides:

- one paid POST per REAL 3D job only;
- job id persisted before submission;
- no automatic paid POST retry after a lost response;
- recovery by polling the same saved job id after refresh/network interruption;
- bounded retries for transient fetch, HTTP 429 and 5xx status/model reads;
- generated GLB loaded into the page before any download;
- explicit GLB download action only;
- `LIVE / GENERATED-UNREVIEWED` truth label;
- MAKE remains validation-required.

## Paid pilot state

The marker-gated Shop workflow deployed a cumulative ceiling of exactly 6 with:

- `ENABLE_PAID_GENERATION=false`;
- `PUBLIC_PILOT=true`;
- `ENABLE_ORACLE_JOBS=true`;
- `GENERATION_REQUEST_LIMIT=6`;
- a three-hour expiry window;
- no paid generation performed by CI.

The first immediate smoke ran before edge propagation completed and failed its status assertion. The exact same no-cost workflow was rerun; the second attempt passed the Shop pilot smoke. No paid generation was used by either workflow attempt.

## Immediate gates

1. Android clean-session test: meadow portal → `/shop`.
2. Submit one REAL 3D prompt only once.
3. Confirm progress survives transient mobile/network failures by recovering the same job id.
4. Confirm the completed GLB renders in-page and nothing downloads automatically.
5. Verify the explicit GLB download button separately.
6. Re-test `/planets`, `/lab`, `/chess`, `/iss` and `/terra` in the same Android session.
7. Run desktop/responsive/accessibility QA.
8. Visually review the generated GLB before any quality or manufacturing claim.
9. Capture final launch media only after production device QA passes.
10. Re-open official contest rules, launch guide and submission form immediately before Product Hunt scheduling/submission.

## Truth boundary

Use `LIVE / DEMO / PLANNED / BLOCKED` and `REAL / GENERATED / MOCK`. Never present the legacy JSON brief as a generated 3D model, a failed-fetch job as a successful artifact, procedural preview geometry as Oracle-generated geometry, `GENERATED-UNREVIEWED` as quality-approved, or a MAKE candidate as manufacturing-ready.
