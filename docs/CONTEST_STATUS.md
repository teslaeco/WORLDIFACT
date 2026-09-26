# WORLDIFACT — Oracle export recovery v4, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · CI PENDING · ORACLE APPLY/E2E PENDING.**

- Owner Cloud Shell evidence showed the v3 transient maintenance unit reached `failed` while `froge-worker.service` and `froge-tunnel.service` both remained `active`. The failure therefore belongs to the maintenance launcher path, not a dead Oracle worker/tunnel.
- v4 removes the transient `systemd-run` maintenance layer entirely. OCI Cloud Shell now runs the rollback-safe reviewed installer synchronously over the existing SSH channel and receives the exact installer JSON/error instead of collapsing to generic `LAUNCH_FAILED`.
- The installer still accepts only exact reviewed v33 source revisions, refuses active jobs/unknown server bytes, backs up the exact starting `server.py`, restarts only `froge-worker.service`, verifies `posthocExportRevision=2` + `legacyGlbExportRecoveryRevision=1`, and rolls back to the exact starting bytes if verification fails.
- The one explicitly approved live E2E test persists one UUID before submission. If phone/browser/SSH transport drops, re-running the same command resumes that same job id instead of creating a second model. Automatic generation retries remain **0**.
- E2E acceptance requires real validated bytes for GLB, PBR/texture ZIP, FBX and BLEND.
- No payment, checkout, supplier order or manufacturing approval is performed by this repair. Oracle maintenance itself sends no AI request; only the owner-approved one-job E2E stage may create a model.

---

# WORLDIFACT — P0 download/NPC repair live release, 26 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** PR #117 was squash-merged as `62d953c4dcc7a39282b978d5d8231e0fa1fdf706`.

- Main CI run `36234284770`: **SUCCESS**.
- Production workflow `36234284830`: **SUCCESS**.
- Cloudflare version: `c63a9626-0bc6-402e-b645-da08cbb4accf`.
- Public release smoke: **PASS** for 16 HTML routes, 43 matching hub assets and 105 original app entries/assets.
- The published same-origin ForgeMPC2 worker GLB was build-verified at 10,343,368 bytes / SHA-256 `4b7e83d07723be958e7325f1cd7afc509ebc72d61a6357925c824ac716052adf` and included in release verification.
- Production diagnostics report Oracle `CONNECTOR_READY`, `connectorVersion: 33`. This confirms the live Oracle connector is reachable; the deploy diagnostic does not currently expose `posthocExportRevision` / `legacyGlbExportRecoveryRevision`, so those exact revision markers are not inferred from this release log.
- The Android HTTP 429 self-throttling path is removed: missing PBR/FBX/BLEND recovery uses an `initial` artifact read, one cached no-AI prepare on 409, then one separately rate-limited `prepared` read.
- No paid AI/model request was made by CI or deployment.

---

# WORLDIFACT — Android export 429 + Forge worker delivery repair, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · CODE HEAD CI VERIFIED · MERGE / PRODUCTION / ORACLE CAPABILITY VERIFICATION PENDING.** Branch: `fix/p0-downloads-forge-same-origin-20260926`.

- **VERIFIED root cause from current source and owner screenshot:** the optional-export client performed GET → POST prepare → immediate GET. Both artifact GETs used the same Cloudflare rate-limit bucket, so the second read could return HTTP 429 with the exact UI error `Please wait before checking or submitting again.`.
- The client now reads an existing PBR/FBX/BLEND artifact first. Only HTTP 409 triggers one cached, idempotent, no-AI export-preparation request for that saved job and one retry marked as the `prepared` stage. The read-only world audit explicitly disables preparation and remains GET-only.
- Artifact read limits are isolated by signed job + format + bounded stage (`initial` / `prepared`), so the 409 recovery retry cannot throttle itself and PBR, FBX and BLEND do not share one bucket.
- **VERIFIED ForgeMPC2 source inventory:** pinned `teslaeco/Froge-MPC-2-test@bac2827fc1ec31e71dc0f5c586df43c507338725` contains one committed 3D character binary: `public/models/rapper-v10.glb` (10,343,368 bytes, Git blob `25d3a7f62fb97844843e3007d498a3d93a927d42`). No additional committed FBX/BLEND/GLB character library was found, so this repair does not invent missing characters.
- Build/verify now hydrates that exact immutable GLB, checks size/container/SHA-256, publishes it same-origin at `/world-assets/forge/rapper-v10.glb`, and production smoke must hash the published copy. The four mobile workers are moved closer to the hub and the verified asset upgrade starts after 600 ms (300 ms desktop); seven desktop task instances remain.
- The Forge worker is still a generic GAME character; task differences come from WORLDIFACT props/behavior. Procedural workers remain a truthful fallback if the verified GLB cannot load.
- **BLOCKED / separate dependency:** if an older completed Oracle job never produced PBR/FBX/BLEND, the production Oracle worker still needs the reviewed post-hoc export capability. Merged website code alone does not prove that VM capability is installed. Do not claim legacy missing exports fixed until production health confirms `posthocExportRevision=2` (or equivalent reviewed capability) and an owned saved job succeeds end-to-end.
- No Astra/OpenAI generation, model submission, checkout, payment, supplier order or manufacturing approval is performed by this repair.
- Code head `8c363cbdf267d6e9f8e4fe9fe86047601e9b3daa` passed all eight review workflows: Verify WORLDIFACT `36231931579`, ForgeMPC2 source `36231931585`, post-hoc export review `36231931583`, FAST worker `36231931569`, FAST install safety `36231931559`, Cloud Shell launcher `36231931607`, Oracle project-file review `36231931563`, and FAST cost guard `36231931560`. This documentation-only follow-up still requires its own exact-head checks before merge.

---

# WORLDIFACT — Grand Desert + Mountain Coast + living Forge workers, 26 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** PR #112 rebuilt the expansion on current main, passed all seven exact-head checks, and was squash-merged as `03c345d37e91d3b1af608084c64c676eb86d594f`.

- The central five-portal Riverlight meadow remains the hub. Walkable world bounds expand from roughly ±42 to ±174 GAME units and the meadow support plane expands to ±180.
- **Grand Desert** begins east/right of the hub at X≈52 and extends to X≈174 with a mobile-bounded dune mesh, rocks and an oasis. The existing editable excavation worksite at X 15–40 / Z 14–39 remains separate and functional.
- **Mountain Coast** begins west/left of the hub at X≈-52 with layered instanced ridges, green forested valleys, a GAME river and a visible western ocean/coast. The ocean is scenery at the far edge; it is not labelled real Earth observation.
- New terrain and workers are outside the five-portal line and do not replace Giant Tower, spawn or owner vehicles. Camera/fog/world movement limits expand to expose the new biomes.
- Living NPC plans use finite deterministic GAME loops: planting saplings, carrying material, assembling simple blocks and surveying. Mobile is capped at 4 NPCs; desktop at 7.
- Pinned ForgeMPC2 candidate: `teslaeco/Froge-MPC-2-test@bac2827fc1ec31e71dc0f5c586df43c507338725` / `public/models/rapper-v10.glb` / Git blob `25d3a7f62fb97844843e3007d498a3d93a927d42` / 10,343,368 bytes. Provenance and licensing are recorded in `ASSET_LICENSES.md`.
- The Forge GLB is loaded only after core world startup (12 s mobile / 6 s desktop), validated for expected byte length + GLB container and cloned for NPC visuals. Procedural GAME workers remain as a safe fallback if the optional remote asset is unavailable.
- NPC work loops are fictional GAME activity, not actual B2B labor, manufacturing validation or construction guidance.
- No paid generation, checkout, supplier order or manufacturing action is part of this feature. Physical Android FPS/visual acceptance and the remote Forge asset's real production fetch remain **UNKNOWN** until post-deploy device QA.
- Oracle post-hoc export installation remains a separate maintenance blocker; this world expansion does not claim that P0 worker capability is installed.
- Post-merge main CI run `36224932558`: **SUCCESS**. Production workflow `36224932571`: **SUCCESS**. Cloudflare version `ed1c98bd-5676-4179-9f56-94d724aa5b79` is live at `https://worldifact.xodobrox.workers.dev`.
- Production diagnostics reported `generation: NOT_REQUESTED` and Oracle `connectorVersion: 33`; this deployment did not spend a new model-generation request.
- Physical Android FPS/visual acceptance remains **UNKNOWN** until owner device QA.

---

# WORLDIFACT — universal owned downloads + no-AI post-hoc exports, 26 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · ORACLE POST-HOC EXPORT PATCH REVIEW/INSTALLATION PENDING.** Issue #104 records the owner-requested download repair.

- Completed model ownership, not monthly membership, is now the artifact access boundary. Signed receipt + account ownership are still required; another account cannot fetch the job.
- Successful owned SLOW/FAST Studio jobs report downloadable preview/file access. The Shop exposes GLB, PBR, FBX and Blender controls for the completed current job without a subscription gate.
- GLB download remains read-only. For PBR/FBX/BLEND, the client first performs the normal GET. On worker HTTP 409 it calls the new same-origin `POST /api/studio/jobs/:id/exports/prepare` once and retries that artifact.
- The preparation route is explicitly **NO AI / NO NEW GENERATION**: it proxies only to a reviewed Oracle worker post-hoc finalizer for the same saved job. It does not reserve generation allowance/credits, submit `/v1/jobs`, call Astra/OpenAI, create checkout or place a B2B order.
- A narrow worker source patch is under `tools/export_prepare/`. It targets the exact current FAST-v33 + project-files server SHA-256 `6795c356d67c72f4aed545505772182f907c9a242ad0cf0076689720a386bb14`, requires the job to be succeeded, requires the saved `model.glb` and `model.blend`, refuses to compete with an active generation, runs only `run_blender_finalize(..., finalize=True)`, verifies the base GLB SHA-256 did not change, and reports only actually available formats.
- Downloaded files are for user backup / downstream B2B review. They are **not** automatically MAKE-approved, manufacturing-ready, supplier-approved or ordered.
- Production Oracle installation is still **BLOCKED/PENDING** until the exact worker patch passes CI and can be applied through the existing controlled Oracle maintenance path. Site deployment alone must not claim missing worker exports are fixed.
- No paid model generation, payment, checkout, supplier order or manufacturing approval is part of this repair.

---

# WORLDIFACT — mobile Queen + Giant Tower + Shop artifact QA, 25 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · EXACT-HEAD CI / MERGE / PRODUCTION VERIFICATION PENDING.** Issue #101 records the owner-reported Android regression.

- **Queen:** the exact pinned Neptune Queen remains SHA-256 `1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba`, 27,676,800 decoded GLB bytes, Oracle source job `99397623-e45c-48dc-95ec-6f84446a54d5`. Build preparation now publishes the same verified GLB as two bounded raw static parts below the Cloudflare per-file ceiling. The mobile client reconstructs those exact bytes directly from static assets, validates the completed GLB header/length and uses three bounded retries. It no longer depends on the avatar Worker/content-encoding path for Queen rendering. The existing gzip/API release remains available for compatibility.
- **Release gate:** production smoke now hashes both Queen static raw parts against the exact build output before a release can pass. No substitute Queen is allowed.
- **Giant Tower:** client loading still uses the exact build/release-verified 585,484-byte GAME derivative, but Android rendering no longer depends on runtime WebCrypto. The model is grounded from its actual parsed bounds and moved to `(-8,-18)` with entrance at `(-8,-6.8)` so it is clearly ahead/left of the initial player while remaining outside the river/portal line.
- **Existing AI Shop job audit:** the five-portal world gains **Import last Shop model + test downloads**. It restores only the existing same-device signed Studio receipt, polls that same job and performs GET-only reads of GLB, PBR ZIP, FBX and BLEND. It never prepares/submits/resubmits generation. A valid GLB is added to the meadow with its embedded materials/textures; successful PBR/FBX/BLEND blobs trigger browser download attempts and every format reports its real success/failure.
- PBR ZIP / FBX / BLEND are **download-verification artifacts only**; Three.js renders the GLB and they are not falsely described as rendered or production-approved.
- The current Shop screenshot proves the GLB preview works but at least one export request returns `This model/export is not available on the worker yet.`. This repair exposes the exact per-format result in the world; it does not invent a missing Oracle export.
- No paid generation, checkout, supplier order or MAKE/manufacturing approval is part of this repair. Physical Android visual acceptance remains **UNKNOWN** until the deployed revision is tested on the owner's device.

---

# WORLDIFACT — Giant Tower direct-GLB Android hardening, 25 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** Issue #97 / PR #98 are complete. Reviewed head `8f500700b655e741c126299381a3d696de04b796` passed all five exact-head workflows and was squash-merged as `56ea8b8ecabe8ed67704e0d47cd6d80d6d5231b2`.

- Re-uploaded owner GLB is byte-identical to the previously audited building source: SHA-256 `9c2c61af94243788e1938d99b598f8bfd1281ac710bf41236467db263b5a4e5a`, 23,449,560 bytes.
- The previous runtime still reconstructed the 585,484-byte GAME derivative in the browser from ten base64/gzip parts. That path depended on browser `DecompressionStream` and multiple asset reads; Android still reported/behaved as if the exterior was unavailable.
- Build/test preparation now reconstructs the exact same reviewed derivative once into a single static `giant-tower.glb` (SHA-256 `5cdb61971ce42634acfb3759a73a8ff01f94cb71b18f8feb5df436d754e443d2`). Runtime validates direct HTTP status, exact byte length, GLB header and SHA-256 before parsing.
- Production release smoke now hashes the published `/world-assets/giant-building/giant-tower.glb`, so an HTML fallback, stale file or wrong MIME cannot pass release verification.
- The landmark is moved from (-30,-24) to (-18,-18), keeping it clear of the portal line while bringing the >50-unit tower into the center-left initial view. Entrance moves consistently to (-18,-6.8).
- The separate lobby remains explicitly **GAME / GENERATED INTERIOR**. No MAKE/manufacturing or engineering claim changes.
- No paid generation, checkout or supplier action is part of this repair.
- Post-merge main CI run `36156105314`: **SUCCESS**. Production workflow `36156105267`: **SUCCESS**. Cloudflare version `1b277d5c-27fd-4b77-8a34-586eb0faddb4` is live at `https://worldifact.xodobrox.workers.dev`.
- Public release smoke passed for 16 HTML routes, 39 matching hub assets and 105 original app entries/assets, including exact published-byte/MIME verification of `/world-assets/giant-building/giant-tower.glb`. No paid API call was made.
- Physical Android/WebGL artistic acceptance remains **UNKNOWN** until the owner tests the deployed revision.

---

# WORLDIFACT — Giant Tower load + landship drive + optional Shop size, 25 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** Issue #94 / PR #95 are complete. Reviewed head `bcb8b6bfc37b78bc543858b6ad8149d571bbb8c8` passed all five exact-head workflows and was squash-merged as `d1fa57b3487294ff7aad91c79d35bc62acd3f0cf`.

- **VERIFIED root cause in source:** the high-fidelity Giant Tower package/test contains ten parts, but the runtime manifest in `src/lib/giantBuilding.ts` still listed only `part-00` through `part-03`. The decoder therefore could not reconstruct the reviewed 585,484-byte GLB. The runtime manifest now references all ten reviewed parts and a regression asserts the exact first/last entries and unique count.
- Giant Tower loading now performs one bounded transient retry and reports the actual bounded failure reason before retaining the truthful **GAME / GENERATED INTERIOR** fallback. Queen and portal startup remain independent.
- The already-visible owner Mars solar landship is now registered after load as a GAME rideable vehicle. Interact/keyboard/mobile joystick can board, drive/steer and exit it. It uses landship-specific seat, exit, footprint/ground sampling and camera scaling; the backhoe controls remain exclusive to the photovoltaic rover/loader.
- Landship collision now follows its current driven pose instead of remaining at the original spawn. Whole-model GAME motion does not claim a verified source rig or source animation.
- AI Shop target dimensions are now **opt-in**. Default is no target size: the preview is not rescaled and no 100×100×100 mm target is shown. The user must explicitly check **Specify model dimensions (optional)** before quick-size/X/Y/Z controls appear. Manufacturing/cart pricing accepts `dimensions: null`; exact-size quote logic remains unchanged when enabled.
- No paid model generation, checkout, supplier order or MAKE/manufacturing approval is part of this repair.
- Post-merge main CI run `36143213651`: **SUCCESS**. Production workflow `36143213837`: **SUCCESS**. Cloudflare version `8166e862-ab60-453d-b8ea-b116ca687f55` is live at `https://worldifact.xodobrox.workers.dev`.
- Public release smoke passed for 16 HTML routes, 38 matching hub assets, 105 original app entries/assets, API 404 behavior, the explicit no-cost DEMO path and origin rejection. No paid API call was made.
- Physical Android rendering and artistic acceptance of the new tower/drive interaction remain **UNKNOWN** until the owner rechecks a fresh mobile session.

---

# WORLDIFACT — owner visual correction, 25 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** Reviewed head `c062fbc182fbe2268b99b63ab8414efa02baf9ba` passed all five exact-head workflows and was squash-merged as `a7721a9be1f3f66d7ea91d1ab8e09dd920a845f1`. Post-merge main CI run `36138773680` and production workflow `36138773777` both passed.

- Production screenshots rejected the first Giant Tower derivative as visually too simplified and confirmed that the newly supplied Mars solar landship was missing from the five-portal valley.
- Tower source remains SHA-256 `9c2c61af94243788e1938d99b598f8bfd1281ac710bf41236467db263b5a4e5a` / 23,449,560 bytes. The replacement GAME derivative is SHA-256 `5cdb61971ce42634acfb3759a73a8ff01f94cb71b18f8feb5df436d754e443d2` / 585,484 bytes / 16,321 vertices / 14,785 triangles. It retains substantially more geometry and all 15 source material regions; embedded image textures are replaced by bounded PBR colors. The separate lobby remains explicitly **GAME / GENERATED INTERIOR**.
- New owner vehicle source is SHA-256 `4dcd03f56c9ccaa8c11a286a4103c60101fe14a687481e22eb525c3bf62af6bd` / 2,822,664 bytes. Its GAME derivative is SHA-256 `7f27b281103325aa6f2aa58fcc396be7cf319bc683a91c4798ca374d592d70c3` / 1,291,820 bytes and retains source mesh shapes/instances with lightweight materials.
- The landship is lazy-loaded independently beside the existing photovoltaic explorer at a spawn/river/portal-safe position. It has bounded collision and is deliberately static until a reviewed rig/drive implementation exists.
- Both added packages have exact reconstruction/hash tests. Core Queen/portal startup remains independent of these lazy loads and teardown disposes scene resources.
- No paid generation, checkout, supplier action or MAKE/manufacturing validation is part of this correction. Physical Android rendering and artistic acceptance of the corrected release remain **UNKNOWN** until post-deploy device QA.
- GitHub task: issue #90 / PR #91 are complete. Production workflow `36138773777` deployed Cloudflare version `cd04ff10-a6cb-41db-8f64-3b23b064b109` to `https://worldifact.xodobrox.workers.dev`. Public release smoke passed for 16 HTML routes, 38 matching hub assets, 105 original app entries/assets, API 404 behavior, the explicit no-cost DEMO path and origin rejection. No paid API call was made. Physical Android rendering and artistic acceptance remain **UNKNOWN** until owner device QA.

---

# WORLDIFACT — Giant Tower integration, 25 September 2026

**Status: LIVE · MERGED · PRODUCTION VERIFIED.** Reviewed head `ae814f4948355dd24d8261639bd404975d75ee05` passed all five exact-head workflows and was squash-merged as `d848be44216c7b15657cd462e2ac14090b32ba2a`. Main push CI and the Cloudflare publication both passed.

- Owner-supplied source GLB: SHA-256 `9c2c61af94243788e1938d99b598f8bfd1281ac710bf41236467db263b5a4e5a`, 23,449,560 bytes; inspected as 15 meshes / 15 materials / 14 textures / 522,672 vertices / 242,120 triangles / no animations.
- Public runtime exterior: GAME-optimized derivative, SHA-256 `032d4cb75880d75d8b78493fe75babefea64676b041389fe23e17a362d982ccd`, 98,392 bytes, 2,086 vertices / 2,690 triangles. It preserves all 15 source material groups as lightweight material regions but **does not claim source topology, textures, UV or material parity**.
- The tower is placed as a >50-unit-high landmark at the far side of the valley, outside the five portal line, spawn, photovoltaic rover and excavation worksite. The derivative is loaded asynchronously after core world/avatar startup and has a safe missing-asset path.
- The supplied source did not establish a verified walkable interior or door animation. WORLDIFACT therefore provides a separate, clearly labelled **GAME / GENERATED INTERIOR** lobby with bounded walking, an entrance marker and an exit back to the exterior entrance. This is not described as original source geometry.
- Focused regressions cover placement, exterior collision, entrance/exit and interior bounds. A package-integrity regression rebuilds the gzip/base64 transport and verifies the exact derivative GLB SHA-256/container length.
- No paid generation, payment, supplier action or manufacturing claim is part of this change. MAKE remains unvalidated. Physical Android rendering and artistic acceptance remain UNKNOWN until device QA.
- GitHub task: issue #87 / PR #88 are complete. Production run `36134482737` deployed Cloudflare version `f50b7334-d32d-4c06-858a-1bf0193c2ab6` to `https://worldifact.xodobrox.workers.dev`; release smoke passed for the published HTML/assets and no-cost DEMO path. No paid API call was made during release verification. Physical Android rendering and artistic acceptance of the tower remain UNKNOWN.

---

## 24 September — original Queen loading repair

The owner reports absent/slow character loading on mobile. The repair preserves the exact model and fixes its delivery: lossless HTTP gzip, validated versioned edge caching, progress-aware bounded timeouts, one transient GET retry and a real download/preparation status. [Findings, test evidence and limits](AVATAR_LOADING_REPAIR_20260924.md). Twenty focused tests, TypeScript, lint, frontend bundle and Worker dry-run pass locally; full local verification is blocked by the ISS vendor DNS fetch. Full current-head CI must pass before merge; PR/release records carry actual deployment and read-only production measurements. Physical Android rendering remains unmeasured. No deferred comparison-image/button, generator, payment or contest-submission changes.

---

## VERIFIED — final fast-travel cadence correction

Full-speed movement uses a jogging support interval rather than six walking steps/second. 28 focused tests and a repeated numerical audit of the exact Queen GLB passed locally; the new CI head must pass before merge. No original-scene rendering or Android FPS is claimed.

# WORLDIFACT — screenshot-driven Queen and terrain repair, 23 September 2026

## 24 September — original-model and excavation correction (verification milestone)

The owner's new screenshots reject the visual quality of PR #82; its green tests did not establish realistic presentation. The actual current Queen GLB has now been inspected numerically, rather than relying only on a surrogate. [Task, findings, changes and limits](VISUAL_EXCAVATION_REPAIR_20260924.md) and [actual source-model audit](evidence/queen-rig-original-2026-09-24.json).

VERIFIED: torso-based centering, single-chain named legs, wholly hand-weighted fingers, complete 92-mesh original fan including nine rotor modules; source geometry signatures preserved. Faster traversal, separated vehicle camera orbit, front-quarter digging view, larger photovoltaic loader and a unified HUD are implemented. Targeted 27/27 tests, typecheck, lint (no errors), DEMO HTTP and frontend bundle pass locally. Full CI, merge and deployment are not inferred from this local milestone; their actual results belong in the PR/release record.

BLOCKED: exact rim GLB from the comparison was not recovered; screenshots are not a substitute. UNKNOWN: rendered artistic quality and physical Android performance. Existing provider, billing and release safeguards are unchanged. Previous records are retained below, with their visual claims limited by this newer evidence.


Owner authorization: implement on a branch, create a PR and merge after green CI. Baseline main is `76c8f8344cd33e1b0bdc5de32863d2ad26a723c0` / PR #81. The owner rejected PR #81's walking, straight-legged flip, fan embellishments and sparse grass. Earlier synthetic passes are not positive original-model visual acceptance.

Implemented in this revision: stride-dependent pelvis height, separate named leg/whole-foot weights, takeoff crouch, articulated tucked double-jump and landing absorption; original fan grouping/grip with added rotor decorations removed; dense bounded instanced green clumps and local ground texture; a real editable desert mesh with no covering flat ground, front-loader/rear-backhoe contact-based digging, conserved bucket payload and actual deposited mounds; collision-height sampling and mobile equipment controls. Original Queen geometry/source job and all five portals remain. No billing, generator-backend, logo or petition-copy changes.

The exact requested Astra rim was not recovered: available comparison evidence is screenshots, not source geometry. Automatic installation remains **BLOCKED**. A guarded local original-GLB mount preserves geometry/materials, hides only the stock discs, keeps hollow tyres and wheel rotation, and does not pass off a look-alike as the original.

Local typecheck and frontend bundle pass; lint has 0 errors and 17 existing warnings. Focused motion/terrain/rim regressions pass. Full local verification is not claimed: the inherited native browser fixture did not complete here, and missing prepared ISS vendor assets block that local fixture. The existing full CI, foundation assembly and Worker dry-run must pass before merge; exact final counts and deployment evidence belong in the implementation PR.

**Original-model and Android visual acceptance remain NOT VISUALLY VERIFIED.** Runtime binding is approximate; source preservation and mathematical tests do not certify satisfactory appearance. No browser/authentication block was bypassed. No paid generation, payment or order was performed. See `docs/GAMEPLAY_REPAIR_TASK_20260923.md` for the executed instruction, controls, geometry budgets, session-only persistence and outstanding acceptance.

---

# WORLDIFACT — Queen controls and mobile presentation, 23 September 2026

Current owner authorization explicitly includes branch publication, merge and deployment of this repair. The previous answer's local-only changes were not published. This patch is rebuilt from verified main `1421e02fc124a692c5f08c5f537a1beb17a72c62` (tree `72c4e5714e8d6261f244e81d8ece69146cd10d98`). No private credentials or model files were exported. No paid generation, checkout payment, credit grant, order or new contest submission is part of this change.

Implemented: visible Fly/Land and Jump controls outside the hidden mobile toolbar; frame-safe double tap, second upward impulse and a hip-centered flip; gravity/landing reset and no third jump; canonical forward orientation for the original Queen; lower-on-foot/raised-in-flight actual fan-side arm; five six-blade rotor units on each face of the original fan; articulated knees/ankles and a satin finish on the existing shoes without replacing geometry; closer damped camera, mobile camera slider and bounded instanced meadow grass; smaller uncropped official logos and a specifically scoped dark-on-light petition link fixing AccountPage's inherited link color. Original textures, geometry and brand attribution are retained.

Local TypeScript and focused motion/geometry tests passed. The recorded previous `ERR_UNKNOWN_FILE_EXTENSION` failure came from running Node 22 without its TypeScript stripping flag; the repository CI uses Node 24. Existing full verification and deployment dry-run remain mandatory before merge. No browser preview/security block is bypassed. The exact authenticated original Queen/device appearance and physical Android frame rate remain NOT VISUALLY VERIFIED; synthetic geometry tests do not replace that acceptance. The implementation PR records the final CI, merge and actual production result, not inferred success.

Previous production baseline: PR #80 and its published-asset checks succeeded in deployment run `35907747007`; PR #79 repaired stale receipt recovery and credits. Older ledger sections below are historical and do not describe the current deployment state.

---

# WORLDIFAKT — homepage brand banners

The owner requested professional homepage banners for OpenAI, Product Hunt, Shopify, eBay, Blender and FORGE MCP. A shared responsive section now follows the login experience on `/`, `/login` and `/account`, and follows the portals on `/world`. It uses locally served official logos, the approved FORGE poster, clear destination links, keyboard focus styling and reduced-motion support. Shopify/eBay are platform discovery links, not claims of connected stores or partnerships. Existing Product Hunt badges and conversation remain available on `/world`.

The change adds no dependencies, remote scripts, account changes or billing changes. The decorative login canvas is bounded to avoid expanding GPU render targets for the added cards. Asset provenance is recorded in `ASSET_LICENSES.md`. Local verification passes lint, TypeScript and 394 tests; the sole remaining test requires a Chromium binary missing in this runtime and remains BLOCKED locally. The existing CI browser regression must pass before merge. HTTP smoke passes with no paid call. Final build, Worker packaging, CI and production evidence belong in the implementation PR; production is not inferred from local checks.

PR #77 merged as `ead113c262ab940c55bfb559b13822e4719b28e3` after all five checks and 395/395 CI tests. Deployment `35820518434` succeeded with Worker `454f373b-8bfe-442b-9266-cec70293d7a8`; production browser inspection confirmed all six local images loaded. The first official Product Hunt PNG has a dark wordmark, so the follow-up switches to its official white horizontal version under a fresh filename to avoid cached dark artwork. The symbol, proportions and colors remain unmodified. Final contrast acceptance belongs in the follow-up PR.

---

# WORLDIFAKT — Stripe account-default Checkout compatibility repair

PR #75 merged as `62aa0b3393d12907bc76ca0839e627c652f53128` after all five checks and 392/392 CI tests. Deployment `35721930410` succeeded, version `f2b7b15c-e0b3-44b5-8b63-ffe1e2d452f9`. Stripe accepted and expired the isolated USD29.99 monthly checkout. The owner's previously attempted checkout still returned a typed `idempotency_error`: its stored Stripe key was bound to the pre-fix request. This distinguishes successful new-session creation from recovery of an existing failed attempt.

The targeted recovery replays the exact legacy request with its original key/API version to retrieve Stripe's authoritative result. An existing open/unpaid result still passes all normal price/account/attempt/expiry checks. Only the confirmed original HTTP400 unsupported-card-selection/Managed-Payments rejection permits one deterministic `standard-v2` key for the same attempt. Unknown results, timeouts, unrelated errors, completed payments and further replacement failures stay blocked; keys are never rotated repeatedly. This protects retries without inferring absence from a potentially incomplete session list. No paid transaction is made by this repair.

Date: 22 September 2026. PR #74 merged as `b71a1ce87a40d9ec6f5487c25369cf864045bdaf` after all five checks and 391/391 tests passed. Its deployment `35721114629` stopped before publication at the new no-charge preflight. Stripe returned HTTP400 `invalid_request_error`, identifying an unsupported parameter because Managed Payments is enabled by default on the merchant account. The official Managed Payments integration guide confirms that explicit `payment_method_types` is unsupported in that mode.

The existing integration is standard fixed-USD Stripe Checkout. Both the application and preflight now explicitly set `managed_payments[enabled]=false` per session, retaining card/eligible Google Pay, USD29.99, exact settlement checks and the existing cancellation portal. This does not change the merchant's global account settings or enroll the application in Managed Payments' tax/currency/payment-method behavior. Standard Stripe payments retain the merchant's usual tax and transaction responsibilities. No card, charge, subscription activation, refund or payout is performed by this repair.

Stripe documents this per-session setting in `https://docs.stripe.com/payments/managed-payments/set-up`; its guide targets newer API versions. Only Checkout creation is pinned to the documented minimum `2025-03-31.basil`; billing reads, portal calls, settlement and webhooks remain on `2024-06-20`. The live preflight must confirm provider acceptance before publication. The regression covers both monthly subscriptions and one-time credit purchases against an account-default Managed Payments rejection. Final live acceptance belongs in the repair PR; preparation alone is not reported as a completed repair.

---

# WORLDIFAKT — authenticated checkout failure investigation

Date: 22 September 2026. The owner reported that a signed-in buyer could not open the subscription checkout after payment activation.

PR #73 merged as `33e906fb7b20d6106cd53c6875fad12744850969` after all five checks and 386/386 CI tests passed; production deployment `35719758275` succeeded. A fresh authenticated browser attempt now identifies `checkout_create/provider_http/400`: Stripe accepted the preceding account/price/customer/subscription checks but rejected Checkout creation. This is not a successful purchase or a repaired payment flow.

The follow-up release gate creates a synthetic, unpaid monthly Checkout Session directly inside the existing production credential environment, verifies the exact approved offer and immediately expires its own session. It submits no personal or card data, never confirms a payment, and prints no checkout URL or credential. Rejection diagnostics use fixed vocabulary only. A failed probe stops publication; the previously deployed site remains available. Actual provider diagnosis and the final authenticated acceptance will be recorded in the PR.

- Reproduced the same generic error in the production browser after the owner completed secure Google sign-in. No checkout payment was approved and no subscription was purchased. The previous activation checks established configuration, not an authenticated Checkout session.
- The runtime now classifies Stripe failures by fixed request stage, category and provider HTTP status, with bounded allowlisted error codes/parameter names. Strict Checkout validation reports only fixed field labels. Provider messages, credentials, URLs, IDs and personal values are never returned in diagnostics.