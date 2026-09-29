# WORLDIFACT — editor polish DEPLOYED

29 September 2026. This continuation recovered the interrupted work, completed tests, merged the authorized scope and verified actual publication. Implementation used connected GitHub tools and CI, not an unobserved Codex CLI session.

## VERIFIED — release evidence

PR [#143](https://github.com/teslaeco/WORLDIFACT/pull/143) merged as `8ef7936ffc47b072e3c2e5e550622d0188a036ca` after all five applicable workflows passed for exact head `aca53936043f20466c7d495bff03550fbe7a7dde`: application verification `36524700064`, FAST runtime `36524700109`, installation safety `36524700133`, Cloud Shell launcher `36524700129` and project-file review `36524700112`.

Production [run 36525015304](https://github.com/teslaeco/WORLDIFACT/actions/runs/36525015304), job `109266020534`, completed successfully. Steps included full verification/build, Worker dry-run, existing foundation assets, secret synchronization, opening and expiring an unpaid Creator checkout, deployment and public HTML/assets/DEMO/payment-request checks. No customer purchase was settled.

Independent publication [run 36525158517](https://github.com/teslaeco/WORLDIFACT/actions/runs/36525158517), job `109266471440`, returned `PUBLICATION_VERIFIED` at 2026-09-29T05:14:00Z. It checked `/lab`, `/builder`, `/shop` and these exact deployed editor files:

- `/assets/PrivateGameLab-d5Rc111G.js`: 54,172 bytes; SHA-256 `148160c03d4d6a5b64055fb9de3140ca8debf1848b383ff1ba6540f8ba082e3d`.
- `/assets/PrivateGameLab-CHj01eBO.css`: 11,798 bytes; SHA-256 `56daf309b9c7ad816c0a689eb34c24ecf9b28bfb2d0b7b4e5e657b926dee800b`.
- `/assets/PrivateWorldCanvas-CoMwa0Fs.js`: 42,363 bytes; SHA-256 `bb3f2f79a032a5ba9a4b66902f67e35a424f8f615b15006d4ceced3239c68f17`.

Private-world denial checks returned unauthenticated 401, cross-origin 403, owner-query 400 and unsupported library GET 405, without exposing world documents. Public costs remain Luna 15 / Sol 50 / Astra 250 and Creator remains USD29.99 / 1,500 points. The read-only check made zero model requests, account writes and customer charges and reported `astraSalesReady=false`.

Editor: https://worldifact.xodobrox.workers.dev/lab
Plans: https://worldifact.xodobrox.workers.dev/account/credits

## Deployed editing and character changes

Select an object by tapping or using the scene list. Move, Rotate and Scale operate on the actual scene; grid snapping, focus, duplicate, ground placement and move-to-marker are available. A completed gesture creates one undo entry. Cancelled/stale operations do not overwrite world data.

The four-imported-model, two-MCC and 48-object placement caps are removed. Manifest data stays bounded to 96 KiB / 4,096 object records and 128 terrain edits; eight worlds per account remains. The renderer uses triangle/draw/file-cache budgets and placeholders instead of removing saved placements when a detailed preview cannot fit. Device library has no 12-file count cap but remains bounded to 350 MB total and 50 MB per self-contained GLB. This is not unlimited hardware or cloud asset synchronization. Original files remain intact.

A procedural character now appears in Edit and Play with supported clothing, hair, body and color presets. New game does not buy an AI generation. The Character panel supports a library GLB or an explicitly requested detailed job through the existing Studio → Oracle/Codex → Blender MCP path, subject to its actual runtime gate and account funding. Receipts are account/world scoped; recovery checks the same job rather than buying another. Late results cannot silently replace a changed character. Static GLB is not automatically rigged; existing animation clips are used only when present.

The assistant generates a scoped Codex instruction from the current private world, selection and command, with Show/Copy/Download controls. The Polish request to move trees off the river offers a zero-API proposal followed by explicit Apply. This is a local guarded editing/task workflow, not an autonomous remote multi-agent session. The original Forge Studio link does not transfer credentials or private files.

## Stripe — management fixed, Astra commercial activation still PENDING

The existing non-default portal configuration `bpc_1UKstUBrIVB6dkxN5vfrUDa4`, created before the interruption, was reread rather than duplicated. The default portal remains cancellation and payment-method management. A separate guarded change-plan endpoint opens explicit customer confirmation for an existing subscription and checks target price, customer/item identity and a settled invoice. It rejects duplicate/pending/unpaid states and paused products. It does not itself change a subscription or charge a card. Full-price paid upgrade invoices use the existing idempotent grant path.

Creator and top-up checkout configuration are retained; no current subscriber was repriced. The deployment's unpaid Creator checkout open/expire check passed. Real customer upgrades were not executed during this task.

**`ENABLE_ASTRA_PLANS=false` remains on production.** Pro/Studio selling and Creator Astra generation are NOT enabled. The actual Oracle output-policy update and a new bounded live generation/export test remain outstanding. This continuation did not reuse the spent earlier USD2.10 test authorization, run paid generation, or perform actual Oracle maintenance.

## Actual Oracle next step — not executed here

The prepared updater is `tools/profit_guard/oracle_tuning_launch.py`, not the older guard installer. From an exact checkout of `8ef7936ffc47b072e3c2e5e550622d0188a036ca` in the original OCI Cloud Shell:

```bash
python3 -B tools/profit_guard/oracle_tuning_launch.py --approve-service-restart
```

It verifies the supported installed source and uses backups, a controlled worker restart and offline verification. Successful completion must report `WORLDIFACT_ASTRA_OUTPUT_POLICY_VERIFIED`. It does not buy a model or activate sales. A new paid quality test needs its own bounded approval after runtime correction.

## Test and privacy boundaries

Preparation run [36524320256](https://github.com/teslaeco/WORLDIFACT/actions/runs/36524320256) passed complete application verification and dry-run and committed integration `19061d4b8a69f609a431dc27aacebf94674cb023`. Temporary integration scripts/workflow were removed before final PR review. Earlier failing candidates were fixed before any merge/deployment.

Transform/schema/ownership/budget/geometry/real-component SSR and simulated billing tests passed. They do not establish visual quality/FPS on a physical Android phone, live authenticated world editing, actual customer upgrades or generated-character quality. Existing CI reported three moderate dependency audit findings; this release is not a zero-vulnerability claim. Browser restrictions were not bypassed.

Guide: [PRIVATE_GAME_LAB.md](PRIVATE_GAME_LAB.md). Executed specification: [CODEX_TASK_EDITOR_POLISH_20260929.md](CODEX_TASK_EDITOR_POLISH_20260929.md). Earlier deployed ledger preserved in [history](history/CONTEST_STATUS_before_EDITOR_POLISH_20260929.md).

This post-release checkpoint is documentation only and does not change the verified application code, run a model or activate Astra sales.
