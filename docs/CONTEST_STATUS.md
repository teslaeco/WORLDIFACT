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


## DEPLOYED — generated GLB placement and preview recovery (2 October 2026)

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

Local verification: lint and TypeScript passed; 671 non-browser tests passed. The single pre-existing native Chromium regression is blocked by this executor's `socket() failed: Operation not permitted`; it remains enabled and required in GitHub CI. Real local DEMO HTTP/origin checks, production build, pinned Chess/Terra/ISS assembly and Worker deployment dry-run also passed. No local browser/device, physical Android or paid-generation pass is claimed. PR #171 passed all five exact-head workflows, including 672/672 tests and the native Chromium regression. It merged as `b5622655b24c662c38babc9b6ae3b7b30d5f1f82`. Production release [36974732658](https://github.com/teslaeco/WORLDIFACT/actions/runs/36974732658) succeeded with Cloudflare version `6f237447-7176-4b7a-89af-82b5e0984931`. Independent read-only GETs for `/lab`, `/builder` and the Game Lab/Canvas JS/CSS matched the exact tested build hashes.


## IN VERIFICATION — complete procedural model and world handoff (2 October 2026)

The owner requested a fuller no-cost Shop → archive → Game Lab → save/reopen check after PR #171. A joined deterministic test exercised the actual detailed Shop handler/StudioCoordinator, archive and account-scoped asset storage, Game Lab placement, world save/remount/reopen and real GLTFLoader geometry parsing. The original file/hash, prompt, asset reference and transforms survived; duplicate clicks and repeated failed/recovered artifact reads did not submit another generation. No external request or provider call was made.

That check also reproduced two adjacent gaps:
- The separate procedural Sol/Luna/Astra blueprint view offered its emitted GLB for download but did not put it in the device model archive. This was a missing automatic handoff, not evidence that the detailed-model repair regressed.
- Leaving a new dirty Game Lab world through a Shop link before the eight-second autosave could unmount the editor and lose the unsaved world.

The follow-up archives successful procedural GAME GLBs with explicit blueprint provenance and their real generation evidence, without inventing a Studio receipt or account-verified ownership. It also saves a dirty world before Shop navigation and keeps the editor open if saving fails or the account/world/revision changes. Namespaced procedural entries never enter the server's detailed Studio ownership lookup.

The live public UI was inspected in the cloud browser: both updated editor controls and detailed Astra/Blender availability appeared. The browser was signed out and WebGL was disabled, so neither authenticated private-model handling nor physical-device visual quality was verified there. The live detailed model action displayed 250 points and was not used. No new paid generation, cloud model upload or user-account mutation is authorized merely to test this change.

Local lint and TypeScript passed. The aggregate suite passed 698 tests; its only blocked test was the pre-existing native Chromium fixture because this executor cannot start the browser process (`socket() failed: Operation not permitted`). That test remains enabled for full exact-head GitHub CI. Local DEMO HTTP/origin checks, production build, pinned Chess/Terra/ISS assembly and Worker deployment dry-run passed. Independent review found and then verified the fix for an overlapping open-world/save race. Full exact-head GitHub CI and production release verification remain required.

## DEPLOYED — preserve Studio failure diagnostics and recover uncertain artifact reads (2 October 2026)

The owner reported that a detailed prompt/reference job displayed “Previous model did not finish” after returning to Shop. Its exact UUID and authenticated worker logs were not available during this repair. The screenshot proves the terminal UI state, not whether that particular job hit a provider budget, failed generation, invalid geometry, a missing job or a timeout. No historic refund or exact incident cause is inferred.

Code review and deterministic regressions reproduced distinct defects:
- A temporary HTTP 404/502 while fetching a worker-labelled successful GLB was classified as invalid geometry and permanently failed the account receipt. HTTP availability errors and interrupted streams now retain the same recoverable hold; only explicit invalid-container/structural evidence fails the quality gate.
- A failure reason vanished after account settlement and later recovery skipped Oracle. An allowlisted failure code now persists atomically with settlement, survives account/browser recovery, and produces fixed safe wording without storing or returning raw provider messages.
- Completed jobs could be reported failed when Oracle later failed or disappeared, and concurrent status polls could report a result different from the winning ledger settlement. Both terminal account states now remain authoritative.
- A process-local verification lock could turn another valid overdue success into a terminal timeout before its artifact was read. Local contention now remains recoverable and does not release that job's hold.
- Shop now displays the non-secret job UUID and safe reason code. Historic failures without stored diagnostics explicitly remain unknown; signed receipt tickets are never rendered.

The repair preserves the original UUID, point-hold policy, same-job GET recovery, provider-spend budget and no-automatic-paid-retry policy. It does not reopen already-settled failed jobs or perform a production balance adjustment. Structural checks remain distinct from visual/render/device quality verification.

Local verification: lint and TypeScript pass; all 709 non-browser tests pass, including 108 focused account/client/Shop lifecycle tests. The aggregate `npm run verify` runs 710 tests and its only blocked test is the retained native Chromium fixture (`socket() failed: Operation not permitted` in this executor). Local DEMO HTTP/origin checks and production build pass. Full exact-head GitHub CI, including the native Chromium fixture and pinned foundation build, remains the release gate. Worker dry-run passes with its writable configuration/log directory. No paid generation or customer-account mutation was performed as a test.

The owner explicitly authorized publication, merge and deployment. PR #173 passed 710 tests and merged as `6a1c6750e153e02839d256ed4fda16d0018284bf`; production release [36980848475](https://github.com/teslaeco/WORLDIFACT/actions/runs/36980848475) succeeded. This fixed the reproduced recovery defects, not an identified cause for the original unspecified job.

## DEPLOYED — single-upload Studio submission and truthful admission recovery (2 October 2026)

A subsequent report showed an interrupted browser response while “Preparing your model” remained visible, then a generic failed receipt after reload. Authenticated read-only inspection found no row for that reported UUID on the connected Oracle worker. Two previously published model records remained available by their exact identifiers. This is evidence of the current missing record, not proof of whether the original upload reached admission, encountered a capacity rejection, or was affected by another historical event. The reported account's authenticated current-job result and runtime capacity remain unverified.

The follow-up fixes reproduced submission paths, without making a paid test request:
- Preparation now sends a bounded versioned manifest with the SHA-256 commitment to the complete canonical request. Reference image bytes travel only in the subsequent explicit submission. Legacy full-input preparation remains compatible.
- The server never treats the claimed digest or metadata as proof of valid content: full submission repeats image validation, exact account-bound digest comparison, readiness checks and reservation rules before any Oracle POST.
- Client upload and status deadlines reflect the bounded operations they contain. An interrupted response remains same-receipt recovery, with no automatic replacement or paid retry.
- A signed prepared receipt with no account reservation and no Oracle record receives a distinct missing-submission explanation, not a claim that a generated model crashed or that points were refunded.
- Missing-submission closure is atomic with account reservation. A zero-cost, exact-fingerprint terminal marker fences a late original POST; an already admitted job wins the transaction and is recovered instead. The marker neither changes funding/points nor replaces a current-job pointer.
- Definite admission failures now retain safe allowlisted reasons, including busy, rate limit, storage, stored-job capacity, allowance unavailability and cancellation. Raw worker errors are never persisted or exposed. The client preserves these codes across immediate rejection and reload.
- Shop distinguishes uploading, acceptance discovery and accepted generation, and restores the detailed route when reopening a detailed receipt rather than silently selecting the blueprint form.

Regression coverage includes three large reference payloads, request mutation, forged metadata/digests, wrong-account use, lost response/reload, both admission/closure race orderings, terminal error persistence, and no duplicate provider submission. Native Worker-runtime checks use inert upstream fixtures; the native Chromium receiver test remains an inert transport fixture and uses a precomputed digest adapter only when its network-free data origin lacks SubtleCrypto. Neither is paid-generation or visual model-quality evidence.

The provider funding policy remains conservative. Historical before-acceptance reservation leakage requires a separate evidence-backed review; this change does not replenish provider spending authority. Final local/CI/production results belong to this follow-up's release record. No complete paid mobile generation success is claimed.

Local final checks for this follow-up: 735 non-browser tests pass, including the real workerd manifest flow and SQLite Durable Object race tests. Lint, TypeScript, local DEMO HTTP/origin checks and the production build pass; Worker packaging passes. The native Chromium regression remains enabled for CI and is blocked locally by the executor's process/socket restriction. No paid generation, point debit, model creation or historical funding replenishment was performed as validation.

PR #174 subsequently passed all 736 tests and merged as `8c7e854fe4465efb64c8bd768fd1b87fa5e0cf8f`. Production release [36986292007](https://github.com/teslaeco/WORLDIFACT/actions/runs/36986292007) succeeded; the deployed Shop and JS/CSS hashes matched the tested build. This was not proof of a successful paid reference-model generation.

## IN VERIFICATION — finish the actual reference model within its original budget (2 October 2026)

A newer reported job now has concrete backend evidence. Read-only authenticated inspection found an existing Oracle `succeeded` row and a 21,708-byte GLB containing 13 box meshes, 156 rendered triangles, no images and no substantial meshes. The cabinet gate correctly rejected this sparse draft. It was not an instance-count false rejection or a missing upload.

The exact quality report says `modelStatus=draft`, `automaticQualityAccepted=false`, no completed visual assessment and no finished agent outcome. Its three completed MCP calls were contract inspection, an invalid initial build call, and a successful sparse build; no render inspection, edit or finish call followed. The stored CLI diagnostic matches `stream disconnected before completion` and `max_output_tokens`. Gateway usage was known, but the old gateway did not classify this incomplete terminal response as an error. Source review confirmed that the runner retained its unfinished candidate and the Oracle server labelled retained drafts `succeeded`. The original per-call affordable token allocation still requires the bounded VM ledger diagnostic; it is not inferred from the output size alone.

The local repair adds a complete-first-build contract, actual candidate-GLB feedback, explicit current-render/finish requirements and a WORLDIFACT-scoped runtime completion policy. It preserves the USD1.75 per-job cap and incomplete-response reservations. A tiny affordable output allocation cannot launch an unfinished structural build; a structurally passing candidate keeps the compact finish path. Only a clean, fully accounted CLI exit can receive one continuation inside the same gateway, job, original deadline, request/output/build limits and durable cost ledger. An incomplete provider response is terminal and is never automatically retried. Generic Froge/FAST behavior remains outside the scoped contract.

The web adapter separately refuses to charge an execution that has no finished outcome, while preserving deliberately finished, unreviewed standard drafts subject to the unchanged structural gate. Previously settled account outcomes remain authoritative. This does not reopen or refund a historical job.

The installer uses exact reviewed source ancestry, strict existing SSH access, atomic idle-queue maintenance, private backups, genuine offline Codex/MCP/Blender verification, receipt-bound health evidence and rollback. It makes no paid request. A separate, default-inert one-shot test helper is being prepared to reuse the original prompt and three photos on the VM; paid execution requires the owner's clarified budget approval. No new API key, credential grant, budget reset or customer-point debit is part of that test route.

At this checkpoint the runtime package is under final offline review and has not been confirmed installed on the Oracle VM. Local fixtures and source tests are not generated-quality or visible-preview evidence. The user's completion criterion remains an actual generated model inspected in the real preview.

## DRAFT — repair and verify the Dots/MCP integration (3 October 2026)

The owner asked to recover the previous Dots work and repair its problems. PR #170 had not been merged or connected to ChatGPT. The repair branch incorporates main `7462a64c994d5fdee928e37124bbb85c4279b6eb`, preserving the newer Studio, account and runtime work.

Reproduced and repaired defects include generic-audience/unpinned-client bearer acceptance, insufficient consent revalidation, stale consent-page responses, missing Worker-first MCP routing, HTTP-200-only authentication challenges, unrestricted browser origins and silently discarded generation inputs. A real-ledger/inert-upstream regression also reproduced two jobs from repeating the old start call. MCP now separates free preparation from an explicit start using the same account-bound receipt, unchanged input and an approved point ceiling. Concurrent retries reuse the existing job and hold. No real generation, customer debit or production configuration change was made.

The new `/integrations/openai` page and read-only readiness script distinguish public transport, configuration and a genuinely verified OAuth connection. They never claim that a configured endpoint proves a successful account link.

Local verification: lint and TypeScript pass; the aggregate suite runs 952 tests, with 951 passing and the existing native Chromium test blocked because no Chrome/Chromium executable is installed in this executor. That test remains enabled for exact-head GitHub CI. Local DEMO HTTP/origin checks, the production build with verified pinned assets, and Worker packaging dry-run pass. MCP's 15 tests include concurrent duplicate submission, point-ceiling rejection, changed input, wrong-account receipts, retained recovery receipts and malformed arguments, using inert upstream fixtures.

Release remains **NO-GO**: the shared Supabase project's public OAuth discovery returns `feature_disabled` / `OAuth server is disabled`. Its documented stock token contract does not yet satisfy the resource-bound audience, signed scopes and original granular-permission requirements. A supported provider/broker contract, exact client/callback pins, isolated review deployment and real no-spend OAuth/account-isolation check remain mandatory before production merge. Complete evidence, operator configuration and rollback boundaries are in `docs/DOTS_MCP_STATUS_20261003.md`; this draft does not enable OAuth or bypass token validation to simulate success.
