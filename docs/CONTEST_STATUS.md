# 15 October 2026 — ECOMECH image-conditioned route + reference-shaped Blender v2 (DRAFT PR #290)

**IMPLEMENTED ON REVIEW BRANCH — NOT MERGED OR PRODUCTION-DEPLOYED:** [PR #290](https://github.com/teslaeco/WORLDIFACT/pull/290). Fixed the subject-routing error: explicit photo-attached humanoid robot/motorized exosuit now selects `reference-robot-fidelity-v1` *before* industrial-MCC cabinet handling. The real JPEG reference bytes are required in the canonical model request; text-only work cannot claim image-conditioned reconstruction. All existing Astra/Sol/Luna execution modes, customer point holds and provider per-job caps remain unchanged. Legacy completed models are not relabeled.

**TRUE ROOT CAUSE:** Previous paid ECOMECH Astra run `6fa9be43-f371-4bcd-8fe7-7a3ea9967855` selected `gpt-6-astra` but submitted **`photos: []`**; the subsequent 2.7m-triangle Blender pass added mechanical detail to a low-fidelity base silhouette. The user's artwork was not transmitted to that original paid job. A higher triangle count does not establish real likeness, materials or print fitness.

**TESTED ON INERT / EXISTING SOURCES ONLY:** `Verify WORLDIFACT` and read-only reference baseline QA green at commit `8cb3bc74ec28a80e5cc132e3e99c2a231447686f`: https://github.com/teslaeco/WORLDIFACT/actions/runs/38650361365 and https://github.com/teslaeco/WORLDIFACT/actions/runs/38650361385. The already-existing ULTRA mobile GLB `868fd2018e357f0039f93d70e57748cf2282d39e2e87dab0dab877a688d2be23` achieved only **0.41729** approximate silhouette IoU against a manually annotated user-image contour (orthographic yaw sweep). This is not a photorealistic or learned perceptual image metric.

**NEW REAL BLENDER V2 EXPERIMENT, NOT ACCEPTED ART:** [Native sculpt and four CPU PBR renders](https://github.com/teslaeco/WORLDIFACT/actions/runs/38651120162) completed successfully and preserved an unmodified original Astra source as a separately labeled collection in a 3.3 MB editable BLEND. Real exported V2 GLB: **7,579,688 bytes, 384,700 triangles, SHA-256 `87f5bd78cc39a04f47ee85f16418003575c3dbd363591dd3446fb9a4bb616e4c`**. The same approximate silhouette QA rose to **0.49894**, below the proposed **0.72** acceptance gate. Still NO-GO: headdress/torso/armor panels are too geometric; organic curvature and highly detailed cast industrial motors do not yet match the reference. The sculpt was built from manually annotated image geometry, **not** from actual image pixels passed to an AI 3D reconstruction model. No similarity percentage or rig/texture-ready claim.

**BUDGET AND SAFETY:** User approved an additional total OpenAI API research ceiling of USD 20 on 2026-10-15. No additional paid model call has been submitted in this PR/this milestone; actual OpenAI remaining budget therefore unchanged by this work. Third-party Tripo/Meshy or GPU rental cost is **NOT** authorized and no external image-to-3D specialist is live. Avoid non-sequenced retries or model substitutions. The older 265 MB staging remains separate; storefront/MAKE remain NO-GO.

**NEXT ENGINEERING GATE:** establish safe server-to-Astra transmission of the user's actual JPEG image and receipt-bound image hashes; do NOT claim this until a fresh image-bearing request is attested by Oracle. Integrate a true image-conditioned mesh service or GPU-capable backend only after licensing, privacy and separate cost review. Keep character silhouette, multi-angle true renders and surface-quality acceptance separate from artificial polygon inflation.

---

# 14 October 2026 — ECOMECH CHILI V3 REAL GAME GLB / SLA 180MM MAKE PILOT (DRAFT PR #286)

**IMPLEMENTED on isolated source branch; NOT deployed to production.** [PR #286](https://github.com/teslaeco/WORLDIFACT/pull/286). A real original green/blue half-armoured humanoid robot holding a green chili was procedurally constructed offline. **GAME** GLB contains 959 named geometric mesh definitions, 64,376 actual triangles, and 14 material definitions, SHA-256 `6b5edf630855668afb6e7cb93093d5770b0252c36b2ab2c0d08d47ba2018b471`, 1,343,672 bytes. Original real binary is now COMMITTED under `public/pilots/ecomech-chili-v3/WORLDIFACT_EcoMech_Chili_V3_GAME.glb`. There are NO rig/animations/texture maps, and the geometry does not yet meet the visual detail of the 2D concept. No GPT-6 Astra/Sol/Luna, Tripo, Meshy or paid provider created this 3D mesh; `aiDirector=NONE`.

**MAKE** separate 180 mm monochrome SLA candidate: 196,542 triangles, one independently checked watertight solid component, dimensions 118.48 × 78.23 × 180 mm, original STL SHA-256 `5750b7055279fd35aec6d75bc113bdfcadf7759c7093fb71c813ebd13dce8ce1`. The original STL + QA report are committed in the 1,523,836-byte `public/pilots/ecomech-chili-v3/WORLDIFACT_EcoMech_Chili_V3_MAKE_180mm_QA.zip` with archive SHA-256 `6db9611f63b15aa526726ee4994d6d424e9a943546f57ad9d7ee7bb6e977b59f`. A lightweight same-origin actual GLB WebGL viewer is also COMMITTED at `public/pilots/ecomech-chili-v3/index.html`, with no OpenAI or other provider call. The separate complete portable offline original files and reference-vs-reality render were delivered to the owner.

**B2B FACTS:** Actual September Sculpteo/JLC3DP responses were recovered and constraints are in [ECOMECH_CHILI_V3_PREPRODUCTION.md](ECOMECH_CHILI_V3_PREPRODUCTION.md). JLC3DP confirmed 100 MB maximum upload and STEP/STL/OBJ for monochrome, 3MF or OBJ+MTL+PNG for full color; material wall guidance differs for SLA vs WJP. Sculpteo and JLC3DP have NOT reviewed this robot. Do not claim print-ready from watertightness alone: local walls, supports, finish, sample and production quotes are unverified.

**TEST GATE CURRENT HEAD:** `tests/ecomech-chili-b2b-pilot.test.mjs` verifies actual stored binary hashes/GLB triangle count/ZIP bytes, prohibits fake production/provider/storefront claims. The branch must pass exact HEAD `npm run verify`, CI and Wrangler dry-run before any release discussion. Existing production and `main` were not modified; no points, holds, OpenAI costs, supplier orders or payment changes were executed.

**NO-GO:** PR #286 must remain draft; `/pilots/ecomech-chili-v3/` must NOT be advertised as LIVE on production until independently published and tested by explicit approved release. Before store launch require successful material/print engineering qualification, sample, quote/authenticated B2B integration and review of PRs #284/#285. The green-blue concept image is a distinct image asset, not the resulting real GLB.

---

# 14 October 2026 — ACTUAL MODEL PROVENANCE LABELS LIVE

VERIFIED LIVE: PR #283 merged as `a7a3ea61160604921181b8dd59b3d341dc721437`. One-use preserving release commit `3bbad1ec7a7086c7af6ad7ce8ff74df730578e09` published through GitHub Actions https://github.com/teslaeco/WORLDIFACT/actions/runs/38596101280, status SUCCESS after full `npm run verify`, foundations, Wrangler dry-run and real `--keep-vars` deploy. Production Cloudflare version `99598f30-edd2-46ba-bb3c-5c787cdf0116`, public Studio smoke `ready=true`, models `astra,sol,luna`, durable admission revision correct, no global generation quota.

Account library now distinguishes `Selected MODEL · MODE · Oracle receipt not verified` from `Oracle-confirmed MODEL · MODE`. The confirmed label is derived only from existing owned and completed job metadata after a matching, sealed, positive-usage provider liability receipt has been authenticated, persisted and validated against the immutable selected model/mode. It never derives verification from user interface selection, preview quality or a customer-supplied response. Other accounts cannot forge provider identity by changing returned metadata; client rejects mismatched evidence. Older legacy rows without immutable evidence stay unknown. No new paid generation, manual credit balance adjustment, refunds, cap changes or model rerouting occurred in the audit and publication.

Production Oracle actual provider evidence: https://github.com/teslaeco/WORLDIFACT/actions/runs/38594392649 documents:
- Sol succeeded `5f017611-1d33-4e9a-8b3d-02f4c6d47001`, `agentUsage.model=gpt-6.1-sol`, sealed receipt model `gpt-6.1-sol`;
- Luna succeeded `5f017611-1d33-4e9a-8b3d-02f4c6d47002` and fourth sequential `5f017611-1d33-4e9a-8b3d-02f4c6d47104`, `agentUsage.model=gpt-6-luna` with matching sealed receipts;
- Astra historical `38c71530-2bc8-42ca-823c-e91be4f01b7a`, `ac718eb5-2c54-47b1-ae67-722ad296ff10` had `agentUsage.model=gpt-6-astra` and sealed Astra receipts but both FAILED. This verifies that the Astra provider was actually called for these jobs, not that those particular GLBs succeeded.

Limits: Oracle receipts are worker-bound execution attestations, not independently signed OpenAI visual quality certifications. Visual similarity is expected from the shared Blender geometry tools. User-specific session verification of selected older GLBs still needs authenticated account evidence.

# 14 October 2026 — ASTRA/SOL/LUNA ACTUAL PROVIDER AUDIT AND ACCOUNT GLB LABELS

VERIFIED (production, read-only):
- Existing Oracle Sol job `5f017611-1d33-4e9a-8b3d-02f4c6d47001` reports `state=succeeded`, sealed terminal budget model `gpt-6.1-sol`, `agentUsage.model=gpt-6.1-sol`, bounded usage 274670 micro-USD.
- Existing Oracle Luna jobs `5f017611-1d33-4e9a-8b3d-02f4c6d47002` and `5f017611-1d33-4e9a-8b3d-02f4c6d47104` report `state=succeeded`, sealed model and agent-usage model `gpt-6-luna`, bounded usage 13748 and 16857 micro-USD respectively.
- Two earlier explicit Astra smoke jobs (`38c71530-2bc8-42ca-823c-e91be4f01b7a`, `ac718eb5-2c54-47b1-ae67-722ad296ff10`) both report `agentUsage.model=gpt-6-astra` and sealed Astra budget receipts, but ended `failed`. They verify actual Astra provider execution, NOT successful 3D output.
- Exact source audit: `tools/model_execution/model_routes.py` makes immutable `studioExecution` select the Codex CLI model, changes model-checking to `outer.model`, and calls `studio_execution.protect`/ `settle_completed`. The selected-model cost ledger accepts an OpenAI completed response only if `response.model` exactly matches the bound `gpt-6-astra`, `gpt-6.1-sol`, or `gpt-6-luna` and matching tier/usage. The three outputs still use shared Blender scene tools; visual similarity alone is not a model substitution.
- Audited production read-only runs: https://github.com/teslaeco/WORLDIFACT/actions/runs/38593691413 and https://github.com/teslaeco/WORLDIFACT/actions/runs/38594392649. No new generation or paid API calls.
- PR #283 merged as `a7a3ea61160604921181b8dd59b3d341dc721437`. Account library no longer calls the selected `studioExecution` itself "Generated with". It now displays `Oracle-confirmed: MODEL · MODE` only when a previously persisted authenticated owned job has a matching sealed terminal provider receipt and positive provider liability. Otherwise it displays `Selected: MODEL · MODE · Oracle receipt not verified`. Legacy rows without immutable selection remain unknown. No fabricating provider identity, no billing write, no extra generation. Four exact-head PR workflows passed.

UNKNOWN / PENDING:
- PR #283 production publishing and a signed-in browser review are pending; do not call the new labels live before the preserving release job succeeds.
- A sealed Oracle receipt is a server-side attestation of model-bound provider usage, not an OpenAI-signed certificate of visual quality, manufacturing readiness, GLB semantic correctness or a separate measured bill.
- Older completed jobs may lack model-selection or receipt metadata and must not be assigned a convenient provider label without original evidence.
- Current owner held points and recent complex Sol/Luna failures are separate billing/quality matters; this audit is intentionally read-only.

# 14 October 2026 — LIVE: DURABLE LATEST STUDIO LIBRARY RELEASE VERIFIED

VERIFIED:
- PR #281 merged as `3ab71d14aea922e0c19ad8afe4cb2588015486f3` after full exact-head CI passed. Its first revision failed an intentional historical-ledger byte-compatibility regression; the final version writes the optional recent index **only** for newly completed jobs with a validated explicit `studioExecution` model/mode. Original legacy settlement rows are untouched.
- The index stores a bounded set of opaque job IDs and completion times in the authenticated per-user Durable Object. Every list lookup re-reads the real account-owned terminal job; an index entry alone never creates a model, proves ownership, refunds points, starts generation or grants a download.
- Regression tests cover 400 historical UUID rows, unrelated-account indexing, malformed duplicate/unsorted hints, original signed cursor pagination and preserving historical settlement bytes. This is a metadata discovery index, not a replacement for original GLB storage or independent certification of visual quality.
- Release commit `a57519f964185b40d17568d52631d565fdf62524` deployed via one-use preserving workflow https://github.com/teslaeco/WORLDIFACT/actions/runs/38577101255 with `npm run verify`, foundations, Wrangler dry-run, actual `--keep-vars` production deployment and public Studio smoke **PASS**. Cloudflare version: `06c9fdac-9c2d-4f6c-bb1a-b5c84bb6c993`.
- Public Studio status reports `ready=true`, `studioAdmissionRevision=oracle-durable-admission-v1`, Astra/Sol/Luna execution routing, Standard/Fast advertised by Oracle, and `allowance.unlimited=true`. No paid provider generation, subscription edits, Stripe writes or blind customer-point releases occurred during this release.

UNKNOWN / NOT CLAIMED:
- A fresh browser-signed-in acceptance for the owner's specific model library and the exact Sol budget-exceeded job has not been performed. App-account ownership and financial evidence must be verified with authenticated original job IDs and terminal budget receipts.
- The historical held-point total is not automatically refunded. Unknown/positive API liabilities are preserved and require approved cost settlement.
- A complex model can still exceed immutable per-job Sol/Luna provider spending ceilings. New budget-first instructions reduce unnecessary discretionary iterations but cannot guarantee every requested high-detail result.
- Older historical completed models remain available through signed library pagination; the index accelerates discovery of newly completed explicit-model jobs rather than migrating every older account record.
- One historical legacy Cloudflare release selector still reports a separate guarded failure. Its security condition has not been bypassed: the purpose-built exact-commit preserving release completed successfully as above.

# 14 October 2026 — STUDIO ACCOUNT LIBRARY FOLLOW-UP (MERGED; RELEASE PENDING)

VERIFIED:
- PR #278 merged: completed owned Studio models now preserve validated `studioExecution` (Astra, Sol or Luna; Standard/Fast). Account gallery shows this provenance, and labels older rows as unknown instead of inventing their model.
- PR #279 merged: Sol and Luna Standard use budget-first completion guidance to prioritize a valid first GLB, required review and `finish_model` before discretionary detail revisions. The original prompts, execution model, strict per-job spend ceilings and no-retry policy remain unchanged. This is not evidence that every complex prompt can finish within USD 0.35 / USD 0.10.
- PR #280 merged: an authenticated library first-page GET can surface completed owned assets beyond the first UUID-range page with bounded additional lookups. This improves discovery but does not constitute a full history migration.
- Cloudflare release `5c22ca73a206af8ba1f856dafbf563ee55bf5015` passed `npm run verify`, dry-run, actual preserving `wrangler deploy --keep-vars`, and read-only live Studio API inspection. Proof: https://github.com/teslaeco/WORLDIFACT/actions/runs/38571282122; deployed version `6efec27e-b66f-4475-bccd-b60220fea682`.
- PR #281 merged as `3ab71d14aea922e0c19ad8afe4cb2588015486f3`: bounded account-owned latest-model index for **newly completed explicit-model jobs only**. A library hint never proves success or ownership: the owned canonical completed row must be re-read and validated. Historical settlement write bytes remain unchanged; test first caught and corrected a forbidden legacy write. Exact PR CI passed after correction.

UNKNOWN / PENDING:
- Deployment of #281 is still pending at the time this milestone is recorded; do not claim it is on Cloudflare until the exact release job and public smoke test pass.
- No new signed-in customer-session E2E was performed for the owner's account: actual held-point balance and successful library visibility after reload remain to be checked. Do not release unknown provider liabilities.
- The specific Sol job shown with `MODEL_BUDGET_EXCEEDED` needs its exact signed job ID and terminal budget receipt to determine charge liability. Source semantics establish a failed next guarded request reservation, not guaranteed zero spend, model complexity or automatic refund.
- No additional paid generation was started in this library follow-up; earlier four sequential Luna Standard jobs already passed in production (link below).

# 14 October 2026 — CONTINUOUS STUDIO GENERATION P0 VERIFIED

VERIFIED:
- PR #277 merged as `9dbb81836537fff45b1c2c1584bbbea9275a0705` and deployed through the one-use preserving release `45dca2987c2dd2aecad0a85b1bb5c3d959eaeebc`; the deployment used `--keep-vars`, preserving remote variables, secrets and billing configuration.
- Paid-account Studio preparation now performs a bounded, receipt-only reconciliation of existing terminal provider liabilities before checking the next generation. Only immutable Oracle terminal evidence can release a hold; unknown/uncertain spend remains held. No generation is retried by reconciliation.
- Exact-head CI for the fix passed: full `npm run verify`, Oracle durable admission checks, FAST safety checks, foundations, deploy dry-run and hosted read-only Studio inspection.
- Production continuity acceptance run https://github.com/teslaeco/WORLDIFACT/actions/runs/38554127828 executed four sequential GPT-6 Luna Standard Oracle jobs with fixed IDs and zero automatic retries. All four reached `succeeded`, and all four GLBs were downloaded and validated as GLB v2 containers.
- GLB bytes/SHA-256: #1 663,340 / `e0d36b1b95bf586ca0abb2daadeebe04f3d90921bfc9f5c4c8ad97981c7f3645`; #2 672,824 / `0e5769369a5dcfabaf63b61ee0cd9fc78acc1a036d067cd59d1c239fe1b5a910`; #3 305,932 / `41066f12bd589374b1792c885f1fdcd939e66705202a2ee31977498b44a99607`; #4 709,972 / `79801914b1842b42ea1fa78e0f5baa5625a819cbe75535f389b81bea019ed544`.
- The four-job acceptance used a maximum combined provider guard of USD 0.40. This is a ceiling, not a claimed invoice.
- Public Studio readiness after deployment reports durable admission, Astra/Sol/Luna execution support and an unlimited generation allowance; generation remains point- and provider-budget-gated per request rather than capped to three attempts.

REMAINING PRODUCT QA: account-library presentation still needs explicit model/mode labels (Astra/Sol/Luna + Standard/Fast) and a fresh signed-in browser acceptance for automatic library appearance after successful generation. Do not infer these UI items from the Oracle continuity acceptance alone.

# 13 October 2026 — LIVE SOL + LUNA ACCEPTANCE PASSED

VERIFIED on production Oracle through the repository's one-use protected acceptance workflow:
- GPT-6.1 Sol Standard job `5f017611-1d33-4e9a-8b3d-02f4c6d47001` reached `succeeded`; downloaded GLB is 741,528 bytes, SHA-256 `52131c1ce7e28a667dd61725ffe62f126b9541d8035fd7cfe595a8b0ba09632f`.
- GPT-6 Luna Standard job `5f017611-1d33-4e9a-8b3d-02f4c6d47002` reached `succeeded`; downloaded GLB is 1,057,172 bytes, SHA-256 `7e76ff62316b53108672ecab3199d9c8963f8f98874ab6a3826d96f38c2ed8f8`.
- The live test used durable STAGE + exactly-once START, no automatic retries, and a permanent Git approval tag. Maximum combined provider ceiling was USD 0.45 (Sol <= 0.35, Luna <= 0.10); this is a guard ceiling, not a claimed invoice.
- GitHub Actions run: https://github.com/teslaeco/WORLDIFACT/actions/runs/38398271159 — SUCCESS. Artifact `sol-luna-live-evidence-3bf3e0406bae5addccfa5f8a97d7367bb2c542c4` contains both GLBs and the report.

RELEASE GATE: Oracle durable runtime already verified installed and running. Proceed to final exact-head CI, then merge PR #274 and publish through the existing preserving release workflow only if all required checks remain green. Do not rerun these paid jobs; their fixed IDs and approval tag are consumed.

# WORLDIFACT P0 — 13 October 2026

## Latest verdict: Oracle activation VERIFIED; full Worker release NO-GO

At 05:14:49 UTC, authenticated read-only SSH independently verified that the owner-started production Oracle installation finished. `INSTALL_STATUS.json` reports `WORLDIFACT_DURABLE_ADMISSION_VERIFIED`, `activation_committed=true`, no job-row change, no provider-limit change and no paid generation request. `froge-worker.service` is ACTIVE/RUNNING. No second installation or manual restart was performed.

The installed runtime is the fixed package from `7f357323fafb362bd72cf05799a4bba8f5100d52`. Its 17 installed source hashes and complete receipt chain passed `activation_receipts.validate_installed`. Authenticated Oracle health reports `ready=true`, `studioAdmissionRevision=oracle-durable-admission-v1`, `studioExecutionRevision=studio-execution-v1`, `codexReady=true`, and both maintenance flags false. The installed server SHA-256 is `c3e6b1e2894515ceabb4ec6570b8e68a5398664743212a36ba16a77be8200150`.

## Incident: existing model previews unavailable during maintenance

The installation started at 05:00:22 UTC. Its native verification lease intentionally stopped the single `froge-worker.service`, which also serves existing model downloads. `froge-tunnel.service` remained active, but generation and account-model downloads were unavailable during that window. The static public gallery does not depend on this worker. This downtime should have been communicated before maintenance.

Real native generic CLI/MCP/Podman-Blender, cabinet, legacy STANDARD, phased STANDARD, six model/mode gates and staged ingress verification completed before activation. These are genuine local pipeline executions with scripted provider responses, not paid API model-generation evidence.

Live artifact inventory preserved 92 succeeded / 75 failed / 1 cancelled records. All 92 succeeded jobs have their original GLB with valid v2 header and declared byte length; 0 missing or invalid headers. After restoration, two existing original models were downloaded through the authenticated Oracle HTTP endpoint: HTTP 200, `model/gltf-binary`, 1,672,056 and 1,735,360 bytes, both SHA-256-identical to the original disk artifacts. This verifies worker downloads, not the customer's authenticated browser/library end-to-end flow or full geometry quality.

The public Worker `/api/studio/status` returned HTTP 200, `ready=true`, `reason=READY`, and `studioExecutionRevision=studio-execution-v1`. It does NOT expose the new admission revision because the production Worker still uses the old main code. PR #274 has not been merged; main remains `d70adf1c627c9bd5721b6a32e6c020fb3ae59869` at this checkpoint.

## Corrected launcher reporting defect

The installed launcher's line-by-line JSON reader cannot parse the real activation program's indented multiline JSON. Consequently, its separate `result.json` reports `launcher_unconfirmed` despite the verified native installation result. This defect was reproduced locally by executing the original runner body against an inert child emitting the actual pretty-JSON format.

`cloud_shell_activate.py` now accepts one bounded, complete terminal JSON document, rejects contradictory/truncated/nonterminal output and refuses success after a nonzero child exit. Eight new tests execute the actual runner body with an inert child as well as malformed result cases; all eight and the nine existing launcher tests pass locally. Fresh exact-head hosted checks are required. This parser-only change does not alter the reviewed runtime package, release lock, services, installation latch, native gates or spending policy. Existing production logs/results are preserved; do NOT rerun an installation to replace the old reporting record.

## Remaining acceptance and release conditions

The two owner-approved paid Astra Standard reference chessboards remain unsubmitted by this continuation: at most 250 points each, 500 points and USD 4 combined; no automatic retries or replacement jobs. Test 2 follows successful accounted-for completion of Test 1. Paid Copilot/Codex coding-agent tasks remain outside scope.

Before full GO, verify the candidate Worker/account/library/download path and exactly-once point settlement with both approved reference models, obtain green CI for the exact final head, then merge/publish through an exact preserving release envelope. Existing native success and authenticated Oracle downloads do not substitute for this account-bound acceptance. Keep normal generation access enabled, preserve account authorization, point/pricing/provider limits, all customer artifacts and historical held points. No Stripe, subscription, role or balance modification is included.

Earlier evidence is preserved in `docs/history/CONTEST_STATUS_before_20261013_live_activation.md` and its referenced history. See also `docs/ORACLE_ACTIVATION_RUNBOOK_20261013.md`. Its pre-installation status is historical; do not use it to trigger another attempt.
