# Codex execution task — finish WORLDIFACT Shop PR #31

## Outcome, not another proposal

Act as the implementing engineer and release reviewer. Finish the existing branch `work/native-shop-models-20260917` and PR https://github.com/teslaeco/WORLDIFACT/pull/31. Do not start another replacement repository, restart the completed five-hour schedule, or return terminal instructions to the owner. Inspect, edit, test, and publish only the reviewed scope already authorized in the conversation. Record exactly what was executed.

The user needs one reliable in-page workflow:

**WORLDIFACT /shop -> description + up to four reference images -> existing Oracle/Astra/Blender job -> recover the same job -> actual GLB and embedded materials in the page -> explicit exports and private device archive.**

Keep the visible `Back to WORLDIFACT` navigation and all five worlds. Use the familiar two-column character-studio presentation: existing half-living/half-skull character example on the left, form on the right; on narrow screens show controls before preview. Never claim the old example is a newly generated result. No full-page fallback overlay, authenticated iframe or automatic external redirect in the active Shop.

The actual existing Studio is https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/. It stays an optional safe new-tab link and must not be overwritten with an older source snapshot. The page https://forge-studio-public.terraformingplanet.chatgpt.site/ supplies the owner's existing character reference display, not its obsolete brief-export button. Its `FORGE-projekt.json` flow must not return as generation.

## Audit first and preserve concurrent work

Read current main and PR head, AGENTS.md, docs/NIGHT_SHIFT.md, docs/CONTEST_STATUS.md and the current CI logs. Check actual file content before writing with current blob SHAs. Do not overwrite another editor or silently resurrect old redirect/iframe instructions. Readiness and deployed-source status must come from current GitHub/production evidence, not an earlier assistant message.

At task start, PR head was `e3723263498f6c4a8d6af64530d2defeb258c924`, main `3680fba140148530b4e5a16ff1a7a1cdaa332d6d`. Run `35186713564` had 141 passing and two failing tests. These are starting coordinates, not immutable facts.

Fix BOTH failures without weakening checks:

1. The real PortalPage server-render test fails with an object used as a React component. Review ESM/CommonJS interop in its actual-source harness. Keep production component imports correct; make the harness model an ESM default export faithfully rather than replacing the component under test with a static stub.
2. An invalid GLB throws past the API's intended safe JSON error boundary. Await the artifact operation within the boundary so validation and download failures produce bounded errors. Keep corrupted-container rejection. Add a regression proving the actual Worker handler returns the expected response, not just a helper assertion.

## Reuse the existing generator contract

Audit the reviewed Froge `/v1/health`, `/v1/jobs`, status, model and export contracts. Connect through the WORLDIFACT Worker using its existing server secrets. Do not introduce a new model provider or guess a replacement model ID. Current model guidance must be checked before any model configuration change. Inherited expected identifier is `gpt-6-astra`; official source: https://developers.openai.com/api/docs/guides/latest-model.

Use one stable input schema and deterministic normalized serialization. Bound description length, purpose, JPEG reference bytes, dimensions and combined size. Preserve views and texture-size preferences all the way to the worker; reject unsupported photo input instead of silently submitting text only. Treat a texture limit as a ceiling, not a guarantee of native 4K/8K detail. No upscaling claim and no manufactured likeness result.

The same-origin API must distinguish connection readiness, owner access, disabled/expired generation, unreadable allowance and genuinely exhausted allowance. An OpenAI key or HTTP 200 alone is not live-generation evidence. The Lab's procedural world-blueprint controls must not be presented as the detailed 3D/texture generator or claim exhausted credits without checking the counter.

## Correct request lifecycle

- Prepare a signed job receipt without provider cost; persist it successfully before the only paid submission.
- Bind the receipt to the exact input digest and server-generated job ID. Keep the server HMAC/API credentials out of the browser, URLs and reports. Client receipt possession authorizes only its own job; never the owner's existing private archive.
- Atomically reserve at most one cumulative attempt for that job. Do not refund or reset after a timeout because the worker may already have incurred cost.
- Double clicks, focus changes, React rerenders, online events, page reload and failed fetch must never repeat a paid POST automatically.
- Recover exclusively through GET for the same receipt/job ID. Reject mismatched IDs, malformed states and stale responses. Serialize polling and stop automatically at terminal states; repeated failures produce a recover-this-job action, not a second generation.
- A late result must not replace a newer selection, relabel an archived model as the active job, or enable unrelated export buttons.
- Keep unsent prompts/photos intact after validation, capacity or network errors. Do not erase work on tab return or login.

## Artifact integrity, review and archive

Validate the GLB container, declared length and self-contained resources before rendering. Bound bytes, instances and decoded image resources. An unsupported or too-large preview may retain the original as an explicit download; it must not crash mobile or silently simplify/replace the original. Read/stream failures must resolve through safe error boundaries. Abort superseded reads where possible and release object URLs/GPU resources only for their owning selection.

Separate current generated result, archived model and existing character example in UI/state. Preserve GLB materials and texture references. Export controls may download only files the existing worker actually provides; do not claim a PBR archive exists merely because a button or route exists. Report unavailable exports explicitly. Never turn a JSON brief into a fake model download.

Completed originals may be stored in the device's IndexedDB archive with job ID, prompt, timestamp, size, SHA-256 and UNREVIEWED status. Do not automatically publish them for sale, call a local archive a public catalog, or delete older assets to make room. Archive writes must not overwrite different original bytes for the same identity without an explicit revision. Report quota/storage failures and keep an explicit backup path.

`MAKE` stays validation-required. No manufacturing approval, order, quote, product sale, automatic catalog approval or claim of photographic identity is part of this repair.

## Budget and release safety

The previously authorized ceiling is **six attempts cumulatively**, not six new attempts. Preserve the original Durable Object identity and counter. No new API/GPU request is authorized for this task's automated QA. Do not increase the ceiling, reset/refund the counter, expose legacy private Oracle artifacts, change secrets, install Oracle software or submit the competition entry.

The prepared one-time resume mechanism may only reuse the unspent part of that original ceiling after the public status can read the real counter and confirm photo-capable Oracle readiness. At or above six used attempts, leave new generation disabled and report that precise blocker. Missing counters must fail closed. Signed native Studio writes have their own gate; legacy Oracle public writes and procedural-blueprint spending remain disabled.

Review release-marker/concurrency behavior against the actual workflow. A stale post-deploy workflow must not roll production backwards or re-arm on unrelated merges. No marker replay should create additional capacity. Initial publication is the disabled-cost release; optional reuse of existing capacity is a separate measured outcome. Do not claim the generator is unlocked merely because deployment succeeded.

## Required tests

Run lint, full TypeScript, all tests, local HTTP smoke, production build, reviewed Chess/Terra foundation assembly and Worker deploy dry-run on the exact final head. Do not skip failing cases or treat test adapters as browser/device evidence.

Add or retain behavioral tests for: strict input/photo contract; missing secrets/limiter; same-origin rules; receipt tampering and changed input; no-cost preparation; persistence before submission; concurrent double clicks; one reservation/one upstream POST; lost response + reload recovery; expired/disabled write gate with existing-job reads; corrupted or oversized artifacts; safe API error responses; old-job vs current selection; explicit downloads only; archive collision handling; model fixture validation; correct mobile/source route and visible WORLDIFACT return.

Use controlled test fixtures and real parser/projection code. A tiny GLB header fixture is only transport evidence, not a successful rendered model. CPU/SSR tests are not Android/WebGL tests. Follow recorded browser restrictions; never bypass blocked browsing with alternate endpoints, CDP or hidden browser execution.

Use read-only public probes for current health. Log only allowlisted status fields. Never log credentials, private endpoint URLs, receipt tokens, prompts, photos, upstream private text or cookies. Preserve provenance of pre-existing character preview assets. Run a UI render/browser test only through permitted tools; otherwise state that limitation.

## Completion and handoff

Save implementation, tests and this task in PR #31. Update the status ledger to replace stale claims about PRs #28/#30 and the rejected iframe. Verify CI and reviewed diff on the actual current SHA. Before release state GO/NO-GO for the scoped change, not competition eligibility. Existing conversation authorizes repair publication; do not ask the owner to repeat terminal work already delegated.

If source, permissions, tests and release gates allow it, merge only the reviewed expected head and follow the existing production deployment to its actual conclusion. Verify public HTML/assets and the actual Studio route. Check the one-time capacity-resume result separately and report exact remaining attempts only from that read.

Return a Polish handoff with the live entry, PR/commit/check evidence, what changed, what was not verified, and any single concrete remaining blocker. Say neither 'working generation' nor 'finished product' without end-to-end evidence. Do not claim Codex/Copilot agents ran merely because this file was written; record actual tool execution honestly.
