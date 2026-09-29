# WORLDIFACT — private Game Lab DEPLOYED

Updated 29 September 2026 after the authorized merge, completed Cloudflare deployment and independent read-only public verification. Work was implemented through connected GitHub tools and CI; no unobserved Codex CLI session is claimed.

## VERIFIED — release and public evidence

- PR [#142](https://github.com/teslaeco/WORLDIFACT/pull/142) merged as `4b6e5f4102236ff53dcbb19991614ce68dbbc1a6` after all five applicable checks passed for exact head `d66ec95d72e59e96d8c2dd01b3c48b9943deb323`: application verification, FAST runtime review, installation safety, Cloud Shell launcher and Oracle project-file review.
- Production [run 36514187604](https://github.com/teslaeco/WORLDIFACT/actions/runs/36514187604), job `109232715915`, completed successfully, including full application tests/build, foundation assets, Worker dry-run, existing secret synchronization, an unpaid Creator checkout open/expire check, actual deployment and published HTML/assets/DEMO and payment-request guards. No customer purchase was settled.
- Independent public [run 36514326219](https://github.com/teslaeco/WORLDIFACT/actions/runs/36514326219), job `109233135207`, completed successfully. At 2026-09-29T02:49:12Z it verified exact deployed editor JS/CSS hashes, `/lab`, `/builder` and `/shop` HTML, and private-world access rejection: unauthenticated 401, cross-origin 403, client-owner query 400, unsupported library GET 405. Responses disclosed no world documents and were no-store.
- That GET-only test also confirmed Creator is still USD29.99 / 1,500 points and public costs remain Luna 15 / Sol 50 / Astra 250. `astraSalesReady=false`. It performed zero model requests, account writes and customer charges. This does not constitute a signed-in live world-save or physical-device visual test.

Verified editor files:
- `/assets/PrivateGameLab-BI_uXV2Y.js`: 37,043 bytes; SHA-256 `87b3446e328c09fe61ecf0886be086e2b27aa2faaef77a127d5cae2f217b6b8d`.
- `/assets/PrivateGameLab-CxRnafDJ.css`: 9,795 bytes; SHA-256 `bca957d4637eda1ee34765f51c337a56b19144d25fd0d6d9e661cae187ed4a41`.
- `/assets/PrivateWorldCanvas-CL6tyedd.js`: 13,523 bytes; SHA-256 `53280049e13a6dd3e439fbf3b2db5c0c51a73a3c10ecec4968807b87d815fcf7`.

Public editor: https://worldifact.xodobrox.workers.dev/lab
AI Shop: https://worldifact.xodobrox.workers.dev/shop
Plans: https://worldifact.xodobrox.workers.dev/account/credits
The previous actual-photo comparison remains at https://worldifact.xodobrox.workers.dev/compare/mcc/ .

## Deployed private editor

`/lab` and `/builder` now mount an original empty meadow/grass/river editor, not the shared portal map. The cosmic welcome has a rotating exactly 18-face jewel (16 triangular sides plus two octagonal caps). New Game captures a world name and character brief: appearance, silhouette, outfit, hair, colors, style and clothing text. Creating this brief does not call AI; the simple play-test character is a local placeholder. A detailed character can be explicitly generated in AI Shop, with prices shown there. Handoff fills only an empty Shop draft and preserves a recovered model job.

Local tools include raycast point marking, adding primitive or owned-library models, position/scale/rotation/elevation editing, hill and valley stamps on real terrain geometry, a continuous river, day/stars, undo/redo, keyboard/touch play controls and a five-step tutorial. Jump and sprint are prototype controls; proximity interaction currently reports a nearby object. Full scripting, multiplayer, game publishing and arbitrary agent-generated code execution are not implemented.

The server stores world manifests only in the authenticated account's existing Durable Object. Client owner overrides are rejected; optimistic revisions prevent stale overwrites and deletion tombstones prevent resurrection. The tests exercise separate Alice/Bob accounts, copied world identifiers, CSRF, missing authentication, oversized input, concurrent saves and removal. Eight worlds, 48 objects, 64 terrain stamps and a 64 KiB manifest limit keep scope bounded.

World JSON can be saved, reopened, imported as a new world, exported or removed. Auto-save waits for editing to stop and stops after an error rather than looping. Save or export before leaving the editor to preserve pending edits. Existing account balances, source models, prices and the shared `/world` were not overwritten.

## Library and privacy boundary

The editor filters the legacy generation gallery against server-confirmed job ownership and download eligibility. An unassigned older local model is not silently claimed; its owner can explicitly import the original GLB. Imported self-contained GLB files are validated and stored atomically in owner-namespaced IndexedDB. Original files remain intact.

**World layouts save to the account; GLB model bytes remain on this device.** They are not cross-device cloud model storage. Limits: 12 files / 150 MB per device library, 50 MB per file, and four imported model placements per scene. Keep file backups. Browser-local storage does not claim protection against the administrator/developer tools of the same device.

Only the secondary world-blueprint drawer beneath AI Shop was removed. Its real model generator and other portal-generation tools are preserved. The old portal queen/buildings/vehicle are not preloaded into the private editor; avatar preloading is limited to `/world`.

## Local assistant and cost control

Entering, naming, saving a world, importing/placing existing models, sculpting, changing sky and local control commands perform no model request and consume zero AI points. Normal hosting/storage charges still exist; no zero-total-cost or net-profit guarantee is made.

The local rules-based assistant recognizes bounded English/Polish edits such as add jump/sprint/interaction, show stars/day, add mountain/tree or dig valley. It captures a proposal and marker, and requires Apply. It is explicitly not a live Codex agent. Optional single Luna/Sol object proposals use the existing metered backend and visible price panel; no automatic retry, upgrade, shell or remote MCP loop is started. Stale AI proposals cannot replace a changed world.

A data-only Codex/MCP brief export and the executed work specification are in the repository. ForgeMCP MIT was reviewed, but no source/assets were copied and no external agent runtime was activated. The current editor is a single-user prototype, not a complete commercial game engine.

## Creator Astra — prepared eligibility, activation still PENDING

Creator retains USD29.99/month and 1,500 points. The tested catalogue now allows Astra at 250 points, capped at six attempts per confirmed paid period and subject to the existing runtime activation flag. Recommended allocation: two Astra attempts use 500 existing points, leaving 1,000 for twenty Sol attempts. Alternatively, six Astra attempts consume all 1,500 points. These are not two extra unfunded bonuses or guaranteed successful outputs.

The unchanged provider reserve is USD10.50 per 1,500-point grant: 2×1.75 + 20×0.35 = 6×1.75. A top-up, failed attempt, point refund or repeated invoice does not reset the six-attempt period cap or already spent provider reserve. Tests cover the disabled gate, permitted mix, cap, duplicate requests and invoice/refund behavior.

**`ENABLE_ASTRA_PLANS=false` remains on production.** The previously prepared Oracle output-policy tuner still needs actual installation and a newly authorized bounded live generation/export test. Creator eligibility in code is not active Astra service. Pro/Studio sales are not enabled by this task. The exhausted USD2.10 one-off test permission was not reused.

No additional paid model test, Stripe charge, subscriber repricing or actual Oracle maintenance was performed in this task. Browser safety restrictions were respected. Type/build, SSR, geometry, account-isolation and HTTP publication tests do not establish visual quality or FPS on a physical Android phone; no such test was performed.

## Execution evidence and history

Preparation run [36513546778](https://github.com/teslaeco/WORLDIFACT/actions/runs/36513546778), job `109230751874`, passed full application verification and Worker dry-run and committed integration `9e2a33af73f3bbf0c9fd639827b8a24815a8f420`. Temporary self-writing integration scripts/workflow were removed before PR review. The final PR and deployment passed after the GET-only publication tests were added.

Details: [PRIVATE_GAME_LAB.md](PRIVATE_GAME_LAB.md). Executed specification: [CODEX_TASK_PRIVATE_GAME_LAB_20260929.md](CODEX_TASK_PRIVATE_GAME_LAB_20260929.md). Earlier release ledger preserved unchanged in [history](history/CONTEST_STATUS_before_PRIVATE_GAME_LAB_20260929.md).

This post-release checkpoint is documentation only. It does not change the verified production code, trigger a paid model job or activate Astra sales.
