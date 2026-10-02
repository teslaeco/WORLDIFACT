# WORLDIFACT — TerraformingPlanet Astra heroine released

Updated 2 October 2026.

## VERIFIED — one bounded live Astra character generation

The owner explicitly approved one paid GPT-6 Astra / Oracle / Blender character test with an unchanged maximum provider reservation of USD 1.75 and no automatic retry.

Workflow [36815867329](https://github.com/teslaeco/WORLDIFACT/actions/runs/36815867329), exact source `a5c8266f7c4b5c3348d6913bd48e90d759917f0d`, completed successfully.

- model: `gpt-6-astra`
- Oracle job: `a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- submitted jobs: 1
- automatic retries: 0
- customer charges/checkouts: 0
- maximum provider reservation: USD 1.75; actual provider invoice cost remains UNKNOWN
- GLB: 15,281,768 bytes
- GLB SHA-256: `92d777562e0292f2175f2bf4c6580fb4df03614e38f738afec2efcd25ed3028a`
- structural inspection: 368,760 triangles, 21 meshes, 8 materials
- BLEND: 26,457,988 bytes
- BLEND SHA-256: `946c0ec1427cc710bc52877508c4c891f2d3361ce1322d1d12fc81fed4705bed`
- FBX: FAILED
- separate PBR ZIP: FAILED
- visual fidelity: REQUIRES_HUMAN_REVIEW

The three chat reference images were deliberately not published to the public GitHub repository and therefore were not passed as image bytes through this Actions test. Their visible character design was translated into the fixed generation brief: adult silver-haired sci-fi heroine, pearl-white/black/cyan outfit, empty hands and no glowing orb. This verifies the written-design generation path, not pixel-level multi-view similarity to those private chat images.

## VERIFIED — production integration

PR #157 passed all five exact-head checks at `31e0a023b61570cefc898f2a00a6e4e328691ae4` and merged as `2f8a94cca1f7d32a0a1706bd031024c926db0a3c`.

The integration:

- exposes only the exact generated job through `/api/avatar/terraforming-heroine`
- keeps bounded GLB validation and cache controls
- never starts generation while loading an avatar
- adds `TerraformingPlanet Heroine · Astra / Blender` to the shared-world character picker
- makes the heroine the default shared-world avatar
- preserves Neptune Queen and Rapper as selectable characters
- allows the existing GAME-only approximate locomotion binding when the generated model has no usable native rig
- leaves Stripe, PayPal, subscriptions, prices, credit rates and customer balances unchanged.

Production run [36816617943](https://github.com/teslaeco/WORLDIFACT/actions/runs/36816617943), job `110222959900`, passed all release checks. It ran **615 tests: 615 passed, 0 failed**, typecheck/build/foundations/deployment dry-run, detailed-worker verification, payment no-charge readiness probes, Cloudflare deployment and public smoke. Cloudflare published version `052b2311-130a-428d-abf1-807a31b7361f` to https://worldifact.xodobrox.workers.dev.

## VERIFIED — exact production GLB readback

A separate no-cost post-deployment workflow [36816788673](https://github.com/teslaeco/WORLDIFACT/actions/runs/36816788673), job `110223489733`, fetched the public production route and required:

- HTTP success
- `Content-Type: model/gltf-binary`
- `X-WORLDIFACT-Avatar: TerraformingPlanet-Heroine-Astra`
- `X-WORLDIFACT-Source-Job: a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- valid GLB v2 header and exact embedded length
- payload larger than 10 MB.

Production returned exactly 15,281,768 bytes with SHA-256 `92d777562e0292f2175f2bf4c6580fb4df03614e38f738afec2efcd25ed3028a`, identical to the generated test GLB.

## PAYMENT / GENERATION SAFETY PRESERVED

PR #156 had already restored authenticated completed-cache accounting and the owner installed the Oracle helper successfully with `CACHE_ACCOUNTING_VERIFIED`, `max_provider_usd: 1.75`, `payment_settings_changed: false` and `WORLDIFACT_CACHE_FIX_INSTALLED`.

This heroine release does not revert the current payment plans and does not change the USD 1.75 Astra job cap.

## LIMITATIONS — do not overclaim

The model has not received a human visual-fidelity approval in this release. Structural success and production delivery do not prove that the face, hands, hair or outfit exactly match the supplied artwork.

FBX and separate PBR ZIP are not available for this character yet. GLB and BLEND are the verified outputs.

MAKE remains validation-required. No manufacturing approval, supplier acceptance or production-ready claim was created.

Release decision: **GO — the generated Astra heroine is live as the default TerraformingPlanet/WORLDIFACT shared-world GAME avatar. NO-GO for reference-perfect-likeness, FBX/PBR-complete or manufacturing-ready claims until separately verified.**


## VERIFIED — stuck Studio receipt recovery deployed (1 October 2026)

Owner evidence showed a selected Astra/Blender Studio job still displaying `Preparing your model…` after more than 92 minutes while recovery returned `This model belongs to a different account or has no account receipt.`

Root cause in the public client: that exact HTTP403 was treated as a transient polling failure. Polling eventually stopped, but the signed receipt remained selected as non-terminal, so the elapsed timer continued indefinitely and the generation UI stayed locked.

PR #164 merged as `f7c9eeb5f4add49dbb14eb2ad433dfd923eb3fab` after exact-head green checks. Production workflow [36904740422](https://github.com/teslaeco/WORLDIFACT/actions/runs/36904740422) completed successfully, including deploy and post-deploy detailed-route verification. Main CI [36904740551](https://github.com/teslaeco/WORLDIFACT/actions/runs/36904740551) also passed.

The repair:
- keeps HMAC receipts bound to the verified account UUID;
- never turns a receipt from another account into ownership;
- when the valid current-account receipt exists but its entitlement job row is missing, reads only the exact matching Oracle UUID;
- never starts another generation, reserves another job, debits points, grants credits or mutates Stripe/PayPal during recovery;
- returns `reconciliationRequired` instead of an endless elapsed timer;
- treats an Oracle 404 after the existing reconciliation window as terminal without financial mutation when no entitlement reservation exists;
- allows GET recovery of an already-succeeded exact Oracle artifact only when the current account still has an active subscription and no billing review;
- preserves the normal owned-job settlement/download path unchanged;
- contains a client compatibility path so the old exact ownership-403 enters same-job review instead of spinning indefinitely.

The Codex implementation contract is recorded in `docs/CODEX_TASK_STUCK_STUDIO_RECOVERY_20261001.md`.

No paid Astra generation was run for this repair. The specific owner's 92-minute receipt still requires one post-deploy browser recovery action to reveal whether its exact Oracle UUID succeeded, failed/cancelled, or is absent; do not claim that model itself recovered until that result is observed.


## MERGED — Game Lab live generated-model library sync (1 October 2026)

Owner Android evidence shows a newly completed AI Shop GLB present in the device archive while Game Lab/World Builder still displays an older library snapshot.

Root cause verified in source: Game Lab read the local IndexedDB Studio archive and then filtered the entire list through `/api/worlds/library`. That server endpoint intentionally returns only current account-ledger/downloadable IDs. A valid local GLB therefore disappeared from Game Lab whenever ledger ownership was delayed or missing, even though the bytes already existed on the device and could be imported through the ordinary file picker.

PR #166 changes the device-library contract without changing server ownership:
- every locally stored generated GLB remains visible in Game Lab, newest-first;
- server verification becomes an additive `ACCOUNT VERIFIED` badge instead of a visibility filter;
- unverified local models are explicitly labelled `DEVICE ARCHIVE` and are imported only as local device bytes, equivalent to the existing file picker; no cloud ownership is claimed;
- verified entries still re-check server download permission before import;
- `saveStudioModel` emits a same-tab archive event plus a best-effort cross-tab storage signal;
- the Game Lab Library refreshes on archive change, cross-tab storage, focus, pageshow and return to a visible tab, with no continuous polling;
- GLB bytes are not duplicated into the world-asset store until the user explicitly chooses a model.

Regression coverage includes preservation of local models when zero server IDs are verified, verification-badge merging without reorder/byte mutation, and live notification wiring. The implementation contract is `docs/CODEX_TASK_GAME_LAB_MODEL_LIBRARY_SYNC_20261001.md`.

Exact-head checks for commit `ae1ecb0e5ba2ec27ea16cb8446fa388b0ac135ca` passed:
- Verify WORLDIFACT: success, including lint/typecheck/tests/HTTP/build/foundations/deploy-check;
- Review FAST draft worker: success; no paid API call.

PR #166 merged on 1 October 2026 as `f9d3c677d04745e48678931a5efec439bd796c69`. Its library-visibility changes are present in the subsequently deployed main baseline `8a38d1f349a2f454d913b6b7042881460991575c`. No Astra/Oracle request, point debit/refund, Stripe/PayPal/subscription mutation or server ownership transfer was introduced.

Release decision: **MERGED**. The 2 October placement/runtime follow-up below addresses separate defects remaining after the library-visibility repair.


## DEPLOYED — durable cloud Studio recovery and deferred point settlement (2 October 2026)

Incident evidence: a paid detailed Astra/Blender request on Android visibly returned to the example preview after starting, while the account UI showed 250 fewer credits. A production customer must not depend on one React/browser state object to recover a paid cloud model.

Branch `fix/cloud-studio-durable-recovery-20261002` implements:
- account-ledger current Studio pointer with exact UUID, fingerprint, prompt, timestamps, quality profile and financial state;
- account-bound `/api/studio/current` recovery that issues a fresh signed receipt for only the exact same verified account/job;
- explicit generation idempotency header bound to the receipt UUID, with mismatch fail-closed;
- detailed Studio credit **hold**: `credits` remains the actual balance while `reservedCredits` is unavailable for another generation; a valid completed model commits the hold and failure/invalid-output/timeout releases it;
- no change to the separate provider/API spend budget, which remains conservative and is not replenished by customer release;
- no change to blueprint/Sol/Luna accounting in this narrow repair;
- Shop recovery from cloud before sample preview, persistent terminal failure UI, bounded exponential status retry, and no silent duplicate POST;
- a 35-minute WORLDIFACT whole-job reconciliation watchdog, separate from the verified 15-minute Astra provider-request timeout;
- account/quote UI shows held vs available points.

The implementation contract is `docs/CODEX_TASK_CLOUD_STUDIO_DURABLE_RECOVERY_20261002.md`.

PR #169 merged as `8a38d1f349a2f454d913b6b7042881460991575c` after owner approval and green checks. Main CI [36971937848](https://github.com/teslaeco/WORLDIFACT/actions/runs/36971937848) and production release [36971937864](https://github.com/teslaeco/WORLDIFACT/actions/runs/36971937864) completed successfully. No paid generation was run as release validation.

### Recovery/verification follow-up (2 October 2026)

The failing Shop test searched source text for a literal front-image URL even though the existing view selector builds that URL dynamically. Replaced that brittle assertion with actual initial-render and lifecycle checks: no example before recovery is confirmed, labelled front/left/back/face examples after an empty recovery result, and image-failure/view-switch behavior.

The review also reproduced and repaired recovery defects:
- a pending or failed current-job lookup could unlock a new paid submit or reveal the sample before the old cloud job was known; discovery now remains gated and retries GET with bounded backoff;
- in-flight or late unmounted discovery could overwrite the selected receipt; client mutual exclusion and abort-aware recovery preserve the newer selection;
- a newly signed receipt for the same cloud job conflicted with immutable local receipt history; valid same-job/fingerprint revisions are retained separately, and history is saved before cloud dismissal;
- Oracle status/transport/schema failures, or an unavailable successful model stream, bypassed the 35-minute recovery watchdog; authenticated overdue holds now settle once, while a valid late success is still recovered first. Settled failures cannot reopen or charge after a later Oracle success.

Local follow-up verification: lint (existing warnings only), TypeScript, 654 non-browser tests, real local DEMO HTTP/origin checks, production build, pinned Chess/Terra/ISS assembly, and Worker deployment dry-run pass. The aggregate `npm run verify` reached the existing native Chromium regression but this executor blocked browser startup with `socket() failed: Operation not permitted`; that test was left intact, and the remaining tests were rerun separately. Exact-head GitHub CI remains the release gate.

All provider calls in the regression suite are fixtures. Public health/Studio GET probes returned HTTP 200 without generation. These checks are not visual, Android, or paid-generation proof. No production customer balance or provider-budget mutation, merge, or deployment was performed during this follow-up.


## IN VERIFICATION — generated GLB placement and preview recovery (2 October 2026)

The owner reported that generated 3D models still did not add to AI Game Lab and authorized repair, then merge/deployment after green checks. The work is based on released main `8a38d1f349a2f454d913b6b7042881460991575c`; the independent Dots/MCP PR #170 is outside this repair.

Reproduced defects and repairs:
- Multiline generation prompts became scene-object names, which strict world validation rejected. New and legacy device labels now normalize to bounded single-line names without rewriting prompts or GLB originals.
- Library actions only selected a model; placement required another action hidden in Build. Add to world now places one copy at the marker immediately, selects it and exposes transform controls. A failed validation never announces success.
- Model selection/read/import is locked before the first asynchronous operation, rejects duplicate in-flight clicks, and discards stale owner/world/unmounted results. A late world-load response cannot erase a newer placement. Verified entries still recheck account download rights.
- Local bytes display before the optional server verification badge returns; late refreshes cannot overwrite newer library results or clear an import error.
- A missing device GLB can be explicitly relinked to a selected saved object without changing its ID or transforms. Reimporting the same hash also repairs an absent blob under the prior asset ID.
- Failed preview loads no longer remain permanently pending. An explicit visible retry or a successful device-library import can recover them without an automatic retry loop.
- The preview cache releases unused resources, resets between worlds/accounts, counts in-flight bytes, limits concurrent loads to two, and disposes late decoded models safely.

Eighteen new deterministic lifecycle/storage/resource tests cover these paths, including the actual editor event handlers and actual world save/read validation. No provider call is used. The supported editor input remains a self-contained GLB up to 50 MB; FBX/BLEND exports must be converted to an embedded GAME GLB before import. File contents remain device-local; a world save stores placement references, not a cloud backup of private originals.

Local verification: lint and TypeScript passed; 671 non-browser tests passed. The single pre-existing native Chromium regression is blocked by this executor's `socket() failed: Operation not permitted`; it remains enabled and required in GitHub CI. Real local DEMO HTTP/origin checks, production build, pinned Chess/Terra/ISS assembly and Worker deployment dry-run also passed. No local browser/device, physical Android or paid-generation pass is claimed. Exact-head CI and production release evidence must be checked before reporting deployment.
