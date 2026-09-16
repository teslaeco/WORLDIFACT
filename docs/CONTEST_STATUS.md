# WORLDIFACT status — hosted Froge generator integration, 16 September 2026

## Current task and authorization

The owner identified **https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/** as the working generator and asked to add that existing application to WORLDIFACT before any quality improvements. The latest instruction requests a complete Codex task and its execution. This supersedes the earlier proposal to recreate a limited native generator from the Froge GitHub snapshot.

PR #27 is being revised in place on `fix/port-mpc2-generator-20260916`. Its old native-generator implementation is replaced, not promoted. Integration publication is authorized in the conversation; new paid generations, increased quotas and contest submission are not part of this task.

Implementation brief: [CODEX_TASK_FROGE_HOSTED_GENERATOR.md](CODEX_TASK_FROGE_HOSTED_GENERATOR.md).

## Evidence matrix

| Item | Status | Evidence / boundary |
|---|---|---|
| Correct original generator | OWNER-IDENTIFIED | Exact hosted Froge MPC 2 Studio URL above. The supplied screenshots show prompt, multiple reference photos, Codex instructions, a model viewer and export actions |
| Hosted generation quality | UNREVIEWED | Owner screenshots also show a working-result validation/quality failure. This task does not improve or approve the model |
| Source parity | UNKNOWN | `teslaeco/Froge-MPC-2-test` is a separate snapshot, not proof of parity with the current hosted Studio |
| Previous production | DEPLOYED / SHOP UI FAIL OBSERVED | App commit `d26e13b842b05bf57179378d71dd2def0f8ec5d6`, documentation main `f225cb8acf1f2ee02c964bf0ce517971f9aac4ea`; Android screenshots show a full-page placeholder covering Shop controls |
| Revised Shop | IMPLEMENTED / CI AND DEPLOY PENDING | Embeds the exact hosted application; primary full-generator and same-tab links appear before the frame and remain available independently of it |
| Entry points | IMPLEMENTED | AI Shop remains `/shop`; `/chess/shop` redirects there; platform-centre originals and Game Lab original-Studio links use the same canonical URL |
| Absolute overlay | REMOVED FROM ACTIVE SHOP | No generic `.webgl-fallback`, custom native form, fake job status or native generation API in ShopPage |
| Public hosted HTTP access | PROBE PENDING | Local direct read failed due to tool/network restrictions. The CI read-only probe records public status without credentials or following login redirects |
| Authenticated Studio / real iframe | UNKNOWN | The wrapper cannot verify cross-origin sign-in or frame contents. Permanent direct-open links are provided; no onLoad-based success claim or timed redirect |
| Tests | PENDING FINAL HEAD | Server-render regression tests exercise the actual Shop component; HTTP probe tests forbid paid POSTs and authentication redirects. These are not browser/device tests |
| Cost / data | NO GENERATION REQUESTED | No native paid POST, job reset, model download, archive migration, API-key change or paid-pilot re-arm in this integration. Original Studio usage is governed by its own account and configuration |
| Contest publication | NOT ASSESSED / NOT SUBMITTED | Prior final-launch gates remain unresolved. Official pages have not been rechecked in this integration task; do not infer eligibility or no-login readiness from linking a site |

## Scope that is actually implemented

The active path is `WORLDIFACT -> /shop -> existing hosted Froge MPC 2 Studio`. WORLDIFACT provides navigation and an embedded view with direct-open alternatives. The original application continues to own prompt/photo input, Codex/Blender execution, model previews, exports, sessions and storage. No code or private assets are copied from the hosted app.

The former `forge-studio-public` page remains a named legacy reference; it is not the active model generator. The four other WORLDIFACT worlds and separate GAME/MAKE tools remain in place.

The original working Studio must not be downgraded to the prompt-only native Oracle contract. Conversely, owner screenshots do not prove that every generation succeeds or that the displayed model is approved. Keep these distinctions visible.

## Verification and release procedure

1. Run full `npm run verify`, foundation assembly and `npm run deploy:check` on the final PR head.
2. Read the `Inspect hosted Studio access without login or generation` diagnostic separately. HTTP 200 is not live-generation or successful-embedding evidence; access restrictions are not bypassed.
3. Publish only the reviewed final head through the existing Cloudflare workflow and verify public HTML/assets smoke.
4. Do not alter any `ops/*PILOT*` / re-arm marker or generation configuration. Normal automatic releases retain the reviewed disabled-cost configuration. The hosted Froge app's independent settings are untouched.
5. Record actual merge/deploy results here after completion. Browser/Android sign-in, uploads and generation in the original application remain separate device checks; do not spend a new generation to validate navigation.

## Historical evidence retained

Previous P0 records reported successful Astra text/image blueprint output and a controlled Oracle job producing a structurally checked GLB. Those are historical results, not a new test of this integration. PR #26 passed build and public HTTP smoke but subsequently failed owner Android UI QA. Previous cumulative WORLDIFACT pilot ceiling was 6; it is not extended or re-armed by this task. See earlier revisions of this ledger for the corresponding job/hash records.

The green checks on PR #27's old native version do not verify this revised external integration. Only checks for the final changed head apply.

## Truth boundary

Use EXTERNAL TOOL / OWNER-REPORTED WORKING for this integration until stronger evidence exists. Never describe linking or framing the Studio as migration of its accounts/backend, a new native model generator, a verified fresh AI result, manufacturing approval, an official OpenAI character, or satisfaction of competition requirements. Quality improvements and final contest scheduling remain separate work.
