# WORLDIFACT — stable generation unblock hotfix, 27 September 2026

**Status: IMPLEMENTED ON TOP OF RESTORED 25 SEPTEMBER RELEASE · CI PENDING.**

- The production site was rolled back to commit `56ea8b8ecabe8ed67704e0d47cd6d80d6d5231b2`, whose historical deployment was LIVE with `generationReady=true`, Studio `ready=true`, Oracle `CONNECTOR_READY` and green CI.
- Current Android evidence still showed a saved SLOW receipt stuck for >39 minutes and then `Model needs a status review`, which disables new SLOW generation.
- Verified server behavior on the restored release: a NEW Oracle job rejected with HTTP 409 (worker busy) was converted into a fake pending account job; the customer's free slot/50 credits remained reserved even though Oracle had not inserted that UUID.
- Hotfix changes only this lifecycle edge: explicit Oracle 400/409/422/429 rejections restore the account reservation and surface a terminal error; transport uncertainty/5xx still preserves the same receipt and never auto-resubmits.
- If Oracle itself returns 404 for the exact account-bound UUID after 3 minutes, WORLDIFACT now settles that stale reservation as failed and returns a terminal job so the existing Shop automatically archives/releases the receipt and re-enables generation.
- This does not alter generated model files, payments, supplier orders or manufacturing status.
- Separate infrastructure evidence from the owner-approved recovery smoke showed Oracle rejecting every new test job as busy for 20 minutes. That indicates an Oracle-side stale/non-terminal job may also require a worker restart; website code alone cannot clear an unknown active VM job.

---

# WORLDIFACT — Giant Tower direct-GLB Android hardening, 25 September 2026

**Status: IMPLEMENTED ON REVIEW BRANCH · MERGE / PRODUCTION DEPLOYMENT PENDING OWNER APPROVAL AFTER GREEN CI.** Issue #97 tracks the second Android visibility repair.

- Re-uploaded owner GLB is byte-identical to the previously audited building source: SHA-256 `9c2c61af94243788e1938d99b598f8bfd1281ac710bf41236467db263b5a4e5a`, 23,449,560 bytes.
- The previous runtime still reconstructed the 585,484-byte GAME derivative in the browser from ten base64/gzip parts. That path depended on browser `DecompressionStream` and multiple asset reads; Android still reported/behaved as if the exterior was unavailable.
- Build/test preparation now reconstructs the exact same reviewed derivative once into a single static `giant-tower.glb` (SHA-256 `5cdb61971ce42634acfb3759a73a8ff01f94cb71b18f8feb5df436d754e443d2`). Runtime validates direct HTTP status, exact byte length, GLB header and SHA-256 before parsing.
- Production release smoke now hashes the published `/world-assets/giant-building/giant-tower.glb`, so an HTML fallback, stale file or wrong MIME cannot pass release verification.
- The landmark is moved from (-30,-24) to (-18,-18), keeping it clear of the portal line while bringing the >50-unit tower into the center-left initial view. Entrance moves consistently to (-18,-6.8).
- The separate lobby remains explicitly **GAME / GENERATED INTERIOR**. No MAKE/manufacturing or engineering claim changes.
- No paid generation, checkout or supplier action is part of this repair. Physical Android artistic acceptance remains **UNKNOWN** until the owner tests the deployed revision.

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

## 2026-09-27 — reference-fidelity regression repair

- Android owner evidence showed the same building brief/reference producing a substantially more generic tower despite reference images being attached.
- The browser→Studio proxy already transports photo bytes and rejects workers that do not advertise photo input; the Sep 27 generation-unblock changes did not alter that payload path.
- STANDARD photo jobs now send a bounded worker-side `agentInstructions` fidelity policy: classify the subject first, ignore portrait-only heuristics for non-human assets, preserve architecture massing/asymmetry/setbacks/terraces, compare silhouette before texture work, and reject generic substitutions.
- Tests assert the instruction is present only for photo-guided STANDARD jobs and reaches the Oracle `/v1/jobs` payload together with unchanged reference bytes. No model generation or paid provider call is made by these tests.

## 27 September 2026 — portal-world Terrace Tower replacement

- Owner supplied a new replacement building as GLB/FBX plus textures. Canonical inspected GLB: SHA-256 `0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6`, 21,047,056 bytes, 110 meshes/nodes, 491,138 vertices, 264,680 triangles, 12 materials, 10 texture images, no animations.
- This change **supersedes** the 25 September Giant Tower runtime described above. Its ten static base64/gzip transport parts and build-time `giant-tower.glb` reconstruction are retired.
- The valley runtime now builds a compact GAME exterior from ten irregular floor silhouettes extracted from the new GLB, plus source-inspired pink stone, dark glass, terrace rails, planting and roof equipment. It preserves the replacement building's stacked/offset massing without claiming exact source topology or texture/UV parity.
- Exterior placement remains in the center-left valley landmark area; the interaction gate moves forward to stay outside the larger new footprint. The separate lobby remains explicitly **GAME / GENERATED INTERIOR**.
- Release verification no longer expects the retired static Giant Tower GLB. No paid generation, checkout, supplier action or manufacturing claim is part of this replacement.

