# WORLDIFACT — affordable model choice, MCC quality and comparison

Updated 29 September 2026. Review PR: https://github.com/teslaeco/WORLDIFACT/pull/141 . Owner authorized implementation, green-check merge and publication. The work was executed using connected GitHub actions and repository CI; no unobserved Codex CLI run is claimed.

## Implemented and verified on the review branch

- Shared server/client catalogue: GPT-6 Luna **15 points**, GPT-6 Sol **50**, GPT-6 Astra **250**. Selected Luna/Sol is honored server-side; unsupported identifiers, including an unverified Terra API model, are rejected. Game Lab's Astra option opens the separate detailed Studio rather than pretending its blueprint endpoint creates an Astra mesh.
- Free Sol/Luna share the existing two-attempt personal allowance and funded global pool. Model switching never creates additional free quotas. An eligible funded free attempt costs zero points. Paid plans keep their current USD prices and grants; existing credits and provider funds are not reset.
- Original procedural MCC kit has 26 drawers, separate control meshes, beveled panels, painted-metal and screen textures. All users share the same procedural material quality. This improves the cheap draft path without paid image generation or promising equivalence to image reconstruction.
- DOM-free GLB/PNG exporter embeds the actual generated blueprint geometry and RGBA textures. It does not require browser document/canvas/FileReader, resolving the deterministic headless export error class without a new provider request.
- Photo comparison at `/compare/mcc/`, linked from Shop and the main footer; GitHub report [MCC_COMPARISON.md](MCC_COMPARISON.md). Uses actual owner-provided cropped screenshots, with hash/crop provenance, no AI retouching and rights exclusions. The assessment favors WORLDIFACT front-control readability in this example while acknowledging Meshy surface variation. No invented polygon-density advantage, measured 4K map, equal-input benchmark or universal superiority claim.

## Observed test evidence

Preparation run https://github.com/teslaeco/WORLDIFACT/actions/runs/36504388163, job `109202489207`, passed all **506 application tests**, type/lint/build/HTTP and Worker dry-run; production dependency audit reported zero vulnerabilities. The full dependency audit reported three moderate development-tool findings; no force upgrade was performed.

Its non-AI MCC fixture exported **26,248 triangles**, **505 meshes**, **10 materials**, **2,840,128 bytes** and embedded PNG maps. These numbers describe the new reusable kit, not the owner's historical 39.6 MB Astra model or a live model benchmark.

All three PR workflows passed at `83084483fea31592999950f3a679036604f9c2db`: application verification (36505065851), legacy FAST worker review (36505065879), and Astra guard/source-ancestry tests (36505065880). The latter runs **28 tests**, including full pinned source reconstruction, low-reasoning gateway/CLI patching, staged budget progression, completed-response reconciliation, concurrency and legacy-reservation preservation. A final publication-proof script and its tests are included in this checkpoint; the exact final head must pass before merge.

## Astra correction: code tested, VM update still pending

`tools/profit_guard/astra_spend_v2.py` and the exact-source tuner address the observed high-reasoning/output-allocation conflict. The new policy uses low reasoning and up to 16,000 output tokens only when affordable under the unchanged **USD1.75/job** ceiling. Completed responses from the same authenticated provider stream may release only unused conservative reservations; incomplete, disconnected, malformed or old reservations remain held. It never refunds actual modeled cost, resets the job budget or automatically submits another paid job.

The reviewed source tuner is opt-in, checks the existing runtime, refuses active jobs, preserves older FAST code, backs up touched files and rolls them back on a failed offline check. Launcher: `python3 -B tools/profit_guard/oracle_tuning_launch.py --approve-service-restart` from the original OCI Cloud Shell and the final reviewed commit. This launcher has NOT been executed on the owner's actual VM in this turn. Do not equate green code/fixture tests with successful live Astra generation.

The previous single USD2.10 test authorization is exhausted and permanently claimed. No new paid model call, Stripe write, customer charge, subscription repricing, advertising spend or Oracle restart occurred here. `ENABLE_ASTRA_PLANS=false` remains unchanged; [issue #140](https://github.com/teslaeco/WORLDIFACT/issues/140) stays open until actual updated-runtime generation/export is verified. The historical good MCC screenshots do not establish that this new budget policy succeeds live.

## Release decision

GO for the tested web/model-selection/quality/comparison changes after final exact-head checks. NO-GO for claiming updated Oracle installation, new Astra paid sales or a measured live benchmark. A GET-only post-deployment workflow checks the published comparison HTML, CSS, both photo hashes, provenance manifest and the public 15/50/250 point catalogue. Production publication will be recorded only after that release completes.

The previous full ledger is preserved unchanged in [pre-affordable-model history](history/CONTEST_STATUS_before_AFFORDABLE_MODELS_20260929.md). The executable work specification is [CODEX_TASK_MODEL_QUALITY_20260929.md](CODEX_TASK_MODEL_QUALITY_20260929.md).
