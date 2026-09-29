# WORLDIFACT — private Game Lab release candidate

29 September 2026. Owner authorized implementation, testing and deployment of private Game Lab, cleanup of the red-marked Shop duplicate, and economically guarded Astra eligibility for the USD29.99 Creator plan. Baseline main: `311f2cef78dd0ed743cbdacd44346579fb08e27d`.

## Implemented and tested, NOT yet published

Preparation run https://github.com/teslaeco/WORLDIFACT/actions/runs/36513546778 (job `109230751874`) completed the full application verification and Worker dry-run successfully and committed the integrated result as `9e2a33af73f3bbf0c9fd639827b8a24815a8f420`. The previous run had 525 tests with two legacy expectations tied to the old requested behavior; those expectations were updated while keeping all new runtime gating and dollar-budget assertions. The exact release PR must still pass its own checks after removal of temporary integration scripts.

Implemented:
- `/lab` and `/builder` now mount a private editor instead of the shared portal meadow. The world starts with only original ground/grass and a continuous animated river. A star-themed New Game wizard captures the world name and character appearance/outfit/hair/style/text/colors, with a rotating exactly 18-face polyhedron. Character preview is local, not paid AI.
- Server-side world manifests are isolated in the authenticated account's existing Durable Object. Client owner overrides are rejected. Save revisions detect concurrent changes; deletions retain tombstones. Tests cover Alice/Bob isolation, CSRF, missing auth, size limits and stale writes.
- Point marking, placement, scale/rotation/elevation, local terrain hills/valleys, day/stars, undo/redo, keyboard/touch play controls and a five-step tutorial. Interaction currently reports a nearby object; complete game scripting/multiplayer/publishing are not claimed.
- Account-owned generation gallery filtering and explicit self-contained GLB import. Original models are not altered. World manifests save to the account, while imported model bytes remain in owner-namespaced IndexedDB on this device. Limits: eight worlds, 48 objects, 64 terrain stamps, four imported models per scene, 12 files/150 MB per device library.
- Local rules-based assistant previews typed edits and requires Apply, at zero model cost. Optional Luna/Sol object proposals use the existing metered API once, with no automatic retry/upgrade or autonomous external agent. A data-only Codex/MCP brief export is available; no authenticated Codex CLI or external Forge agent was started.
- Only the duplicate world-blueprint drawer beneath AI Shop is removed. Its real asset generator, previous receipts and main portal world remain. Character-brief handoff cannot overwrite a recovered job.
- Creator keeps USD29.99/month and 1,500 points. Prepared Astra eligibility at 250 points, maximum six attempts per confirmed paid period, with runtime activation still required. Recommended allocation: two Astra attempts plus twenty Sol attempts, not two unfunded bonuses or guaranteed successful outputs. Provider reserve remains USD10.50 (2×1.75 + 20×0.35 = 6×1.75). Refunds/top-ups/invoice replay do not reset the attempt cap or spent provider reserves.

## Cost and honesty boundaries

Entering, naming, saving, placing existing models, sculpting and local commands perform no model API requests. Hosting and storage are still real costs. The selected paid model is shown before an optional request. No paid generation, Stripe charge, subscription repricing or Oracle installation was performed in this task.

`ENABLE_ASTRA_PLANS=false` remains unchanged. Creator Astra is eligible in tested code but NOT live until the outstanding Oracle output-policy installation and newly authorized end-to-end test succeed. The exhausted prior USD2.10 test approval was not reused. Existing Pro/Studio sales are not enabled by this release.

ForgeMCP's MIT license was reviewed, but no source or model assets were copied and no remote MCP process was activated. Implementation used the connected GitHub tools and repository CI, not a fabricated Codex session. Browser security restrictions were not bypassed; renderer build/SSR and geometry tests do not prove real Android visual quality or FPS.

Read-only post-deployment workflow verifies exact editor bundle hashes, public route HTML, denial of unauthenticated/cross-origin private-world reads and the unchanged public model-point catalogue. It performs no account write or paid generation; results will be recorded only after actual publication.

Details: [PRIVATE_GAME_LAB.md](PRIVATE_GAME_LAB.md). Executed work specification: [CODEX_TASK_PRIVATE_GAME_LAB_20260929.md](CODEX_TASK_PRIVATE_GAME_LAB_20260929.md). Prior release ledger preserved unchanged in [history](history/CONTEST_STATUS_before_PRIVATE_GAME_LAB_20260929.md).
