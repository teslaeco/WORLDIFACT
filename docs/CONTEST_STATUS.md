# WORLDIFACT status — native Shop repair, 17 September 2026

## Current task

The owner requested a complete Codex instruction and execution of the failing Shop repair, continuing earlier explicit integration/merge/deployment authorization. The active implementation is **PR #31**, `work/native-shop-models-20260917`.

- Task: [CODEX_TASK_SHOP31_FINISH.md](CODEX_TASK_SHOP31_FINISH.md)
- PR: https://github.com/teslaeco/WORLDIFACT/pull/31
- Public entry: https://worldifact.xodobrox.workers.dev/shop
- Original hosted Studio, preserved unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

The instruction was written and the implementation executed directly through the connected GitHub tools. No separate Codex/Copilot cloud-agent job is claimed.

## Correct production baseline

PR #30 and reconciled PR #28 were merged previously. Main application commit `3680fba140148530b4e5a16ff1a7a1cdaa332d6d` passed main verification `35184355581` and Cloudflare release `35184355592`. The former ledger's claim that PR #30 was still unmerged was stale.

That deployed version still embedded the original Studio. The owner's Android screenshots show repeated authentication failures. An iframe restoring navigation is not a successful generation repair. PR #31 removes that dependency from the active Shop rather than cycling back to another iframe or redirect.

## Implemented in PR #31

The in-page flow is `WORLDIFACT form -> same-origin Worker -> existing Oracle /v1/jobs -> same-job status recovery -> actual GLB -> preview and explicit downloads`.

- Familiar existing half-skull character display beside the creation form, clearly labelled EXAMPLE ONLY. It is not substituted for a failed new result. These existing render images are referenced from the owner's legacy public Studio; no private original model was copied or changed.
- English description, reference-view/photo controls and requested texture-size ceiling. Photo normalization never upscales originals. Texture ceilings are not guaranteed detail or native-resolution evidence.
- Native same-origin API using existing Oracle secrets. No ChatGPT login iframe, HTML proxy, credential copying, automatic external redirect or brief-export generation button.
- Signed input-bound job receipt persisted before the only submission; a shared cumulative Durable Object reservation permits at most one Oracle POST per receipt. Lost responses recover via GET, not another paid request.
- Original GLB/materials and available worker exports remain explicit downloads. The local IndexedDB archive records hashes and UNREVIEWED status; it does not publish a product or claim manufacturing approval.
- Current job, archived model and example identities are distinct. Downloads use the visible model ID; archived models cannot inherit another job's PBR/FBX/Blender buttons. Different bytes cannot silently overwrite a previously saved original.
- Polling waits for submission to settle, serializes status requests and stops at terminal results. Repeated reads, double clicks and stale selection results do not create new paid jobs.
- Lab now explains the difference between procedural world blueprints and detailed model/texture generation. Disabled AI is no longer automatically described as exhausted credits.

## Verification evidence

Starting run `35186713564` had 141 passes and two failures. Both were fixed without removing their assertions:

1. The actual-source portal renderer needed correct ES-module default-export semantics in its test adapter; the real Shop component remains under test.
2. The asynchronous artifact operation needed to be awaited inside the safe API catch. Invalid GLBs now yield bounded JSON errors rather than unhandled Worker exceptions.

Code head `e35b18ab862d22d19f70a5dd39a4049bd4d331ee` passed **143/143 tests**, lint (10 warnings, zero errors), TypeScript, local HTTP smoke, production build, reviewed foundations and Worker dry-run in run https://github.com/teslaeco/WORLDIFACT/actions/runs/35187415145.

Subsequent hardening adds exact preview identities, archive preservation, strict enum types, stale-deployment guards and tests through the actual Worker route using a deterministic complete triangle GLB. The final head must pass the full gate again before publication; preceding green checks do not stand in for it.

The read-only public probe in that run confirmed `/api/platform/oracle-worlds` HTTP 200 / CONNECTOR_READY / connector 33 / character standard 20, and `/api/health` DEMO. `/api/studio/status` was 404 because this new API was not deployed yet. This is connection evidence only, not a new generated model or remaining-allowance reading.

## Budget / release boundary

The existing approval is **six attempts cumulatively**, not six new attempts. No provider generation has been requested by this task. No quota reset/refund, increased ceiling, key change, Oracle installation or private archive migration.

Initial publication uses the reviewed disabled-cost production configuration. A one-time post-release workflow may resume ONLY the genuinely unspent part of the original six-attempt ceiling, for no more than the original 180-minute window, after a real counter read and photo-capable Oracle readiness. It never starts a model itself. At six or more used attempts it must skip activation and report that blocker.

The signed Studio gate is independent of legacy Oracle writes. Legacy public Oracle jobs and procedural blueprint spending remain disabled. Workflow marker checks use the first-parent change and compare the exact release with current main before deployment; an obsolete workflow cannot roll production back.

No unlimited or extra paid allowance is authorized. Production deployment success, capacity resumption and successful model generation are separate results and must be recorded separately.

## Remaining truth boundaries

- CPU, actual-source server rendering, API fixtures and HTTP probes are not Android/WebGL or authenticated-device tests. Browser security restrictions are respected.
- A fixture GLB proves transport/parser behavior, not new Astra output, likeness or texture quality.
- PBR/FBX/Blender exports depend on actual worker availability; failure must remain explicit.
- Device archive is not a public store catalog and may be lost if browser storage is cleared.
- Model quality/likeness, native 4K/8K detail, full texture equivalence and manufacturing suitability remain unreviewed.
- Wider hosted-source localization and upstream Froge quality changes are not deployed merely by this interface repair.
- Contest eligibility/submission is not assessed or performed in this scoped repair. Earlier final-launch blockers still require separate verification.

## Release handoff

GO only after full final-head verification and reviewed diff. Existing owner authorization covers publishing this repair without another terminal handoff. Record actual merge SHA, production workflow, public smoke and capacity-resume outcome here after completion. Do not claim that generation is unlocked or proven successful based solely on green CI.
