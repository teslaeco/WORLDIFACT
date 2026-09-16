# WORLDIFACT status — 17 September 2026

## Current work: English UI and 3D quality

The owner has now requested a five-hour work period to finish the existing Froge integration, improve models/textures and translate all worlds, pages and tabs to English. This supersedes the earlier decision to defer quality work. It does not authorize an unlimited API/GPU budget or replacement of the existing hosted generator.

Work is in **draft PR #28**, branch `work/five-hour-quality-english-20260917`. It is **not merged or deployed**. Scheduled continuation coordination and the exact remaining tasks are in [QUALITY_EN_SHIFT.md](QUALITY_EN_SHIFT.md).

| Item | Status | Evidence / remaining work |
|---|---|---|
| Existing hosted Froge integration | DEPLOYED, unchanged by PR #28 | PR #27, application merge `e2446816708783532a26c2c949c733e19ca84e96`; production `/shop` embeds/links the original Studio |
| Initial new code checks | VERIFIED | PR #28 code head `daf94e66df65356fd5e19da0049b4d85535535a3`; run `35158775458` passed 107/107 tests, lint, TypeScript, HTTP smoke, build, foundation assembly and Worker dry-run |
| Initial ISS English translation | SOURCE IMPLEMENTED / PARTIAL | Static HTML, help/accessibility text, document language, all eight repair-task definitions, item names and state messages translated; dynamic `game.js` and canvas/geometry labels still need translation |
| Repair progress compatibility | TESTED | Task IDs, steps, parts consumption and version-2 save restoration preserved. The eight-task regression and English DOM hooks pass |
| WORLDIFACT model preview reliability | SOURCE IMPLEMENTED / TESTED IN PART | Person metadata no longer triggers a second GLB load. Model state is isolated per source; disposed sessions reject/release late models. Shared geometry/material/texture disposal tests pass |
| Preview rendering / model appearance | NOT VISUALLY VERIFIED | Object lifecycle tests are not Android/WebGL/likeness evidence. The actual hosted Froge viewer was not changed |
| Other worlds and subpages | ENGLISH AUDIT IN PROGRESS | Do not infer complete translation from the parent WORLDIFACT page. Include copied/pinned Chess and Terra, native Planets/Lab and external Studio |
| Newer Froge source | FOUND, NOT ASSUMED DEPLOYED | `codex/v27-mcp-startup-audit` at `735058af6e53a2e44f417b5dcf864f62bd334bb2` includes source-only history and v35 runtime work; this is newer than Froge main |
| Hosted Studio source/deployment parity | UNKNOWN / EDIT ACCESS BLOCKED | Prior source checkpoint records Site v47 and source `e3d60697db43744f6c09157328560c66a031f9a2`, Git source errors and protected archives. No canonical source editing tool is currently available. Do not downgrade the live Studio to a GitHub snapshot |
| Model/texture quality improvement | NOT YET PROVEN | Next: inspect newer source runtime and actual texture/UV/PBR validation, preserve originals and compare outputs only with authorized assets/runtime. No new geometry, texture detail or likeness improvement is claimed yet |
| New costs | NONE INITIATED | No new paid generation, quota change, Oracle installation, GPU provisioning or secret change. Current CI uses stubs and no-cost metadata checks |
| Five-hour continuation | SCHEDULED | Five hourly resumptions, not uninterrupted execution. Stop after the fifth and report actual code, tests and blockers |
| Final contest release | NO-GO pending evidence | Device and hosted generation checks, full language coverage, quality review and final form/media review are incomplete. No submission made |

Initial verification logs contain nine lint warnings and no errors. The GLB viewer's WebGL-unavailable effect-state warning and imported-source warnings remain; do not describe the tree as warning-free.

## The correct generator remains the existing hosted application

**https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/**

The active path is `WORLDIFACT -> /shop -> existing hosted Froge MPC 2 Studio`. WORLDIFACT provides a frame and permanent new-tab/same-tab direct links above it. The original Studio owns prompts/photos, Codex/Blender execution, model previews, exports, accounts and stored work. A change to the wrapper does not translate or improve the external app.

The old `forge-studio-public` page is a named legacy reference, not a model generator. The other four worlds and separate GAME/MAKE tools remain in place. No user's prompt, model title, stored job or source asset is translated or overwritten.

## Completed production integration — retained evidence

- PR #27: https://github.com/teslaeco/WORLDIFACT/pull/27
- Reviewed integration head: `be9b00adc465c67fe5a02d2aa04b27fd392af2de`
- Deployed application merge: `e2446816708783532a26c2c949c733e19ca84e96`
- Production Shop: https://worldifact.xodobrox.workers.dev/shop
- Previous documentation main: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`
- Integration PR CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35153954093 (102 tests)
- Integration main CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269149
- Verified deployment and public HTML/assets/DEMO smoke: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269208
- No-op Shop pilot gate: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154374131
- No-op P0 pilot gate: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154374091
- Integration implementation brief: [CODEX_TASK_FROGE_HOSTED_GENERATOR.md](CODEX_TASK_FROGE_HOSTED_GENERATOR.md)

The original Studio returned HTTP 200 in the previous credential-free diagnostic and again in initial PR #28 CI. HTTP success does not prove authenticated iframe use, Android uploads or generation. The direct-open links remain available when embedding is blocked or sign-in is needed.

The previous integration removed the viewport-covering `.webgl-fallback` from the active Shop. It made no paid generation request, copied no private asset, migrated no account and raised no quota. Its implementation was performed directly through connected GitHub tools, not an unobserved separate Codex/Copilot cloud run.

## Current verification and publication boundaries

Current draft: https://github.com/teslaeco/WORLDIFACT/pull/28
Initial code verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35158775458

Continue from the checkpoint rather than restarting the completed integration. Verify each final changed head, preserve original author/license attribution and record specific checks. New quality/localization changes remain in review until production publication is authorized for them. Do not change any paid-pilot marker, reset a job or silently run a new paid request to obtain a passing screenshot.

Official Product Hunt/model pages were reopened during the initial audit, but no final submission form or eligibility decision was completed. Reopen the official contest page, guide and form immediately before any actual competition scheduling/submission decision. No guarantee of competition success is made.

## Historical generated artifacts

Earlier records reported successful real Astra text/image blueprint output and a controlled Oracle job with a structurally checked GLB. They are historical, not new tests of the hosted integration or quality work. PR #26 passed build/HTTP checks but failed subsequent owner Android UI QA. The previous cumulative native WORLDIFACT ceiling was 6; this session does not extend or re-arm it. The normal native production configuration remains cost-disabled; hosted Froge settings are independent.

Owner screenshots demonstrate a real working-result interface, but also quality/validation failures. Reported 2048 skin and 512 other packed textures must not be described as native 4K/8K. Existing illustration/reference sheets do not establish an official OpenAI mascot or guarantee geometric likeness.

## Truth boundary

Distinguish DEPLOYED, SOURCE IMPLEMENTED, TESTED, OWNER-REPORTED and UNKNOWN/BLOCKED. Never call a linked Studio a migrated backend, a model-viewer cleanup a proven improvement to generated facial likeness, a test fixture a real generated model, HTTP success a device pass, upscaling new detail, or an unreviewed MAKE candidate manufacturing-ready.
