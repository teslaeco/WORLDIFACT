# WORLDIFACT status — hosted Froge generator integration, 16 September 2026

## Completed task

The owner identified **https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/** as the working generator and requested a complete Codex task plus execution of its integration into WORLDIFACT, before quality improvements.

**PR #27 is merged and the external-generator integration is deployed.** Its earlier native prompt-only port was replaced, not promoted. No replacement generator, backend migration or quality improvement is claimed.

- PR: https://github.com/teslaeco/WORLDIFACT/pull/27
- Reviewed head: `be9b00adc465c67fe5a02d2aa04b27fd392af2de`
- Deployed application merge: `e2446816708783532a26c2c949c733e19ca84e96`
- Production Shop: https://worldifact.xodobrox.workers.dev/shop
- Complete implementation brief: [CODEX_TASK_FROGE_HOSTED_GENERATOR.md](CODEX_TASK_FROGE_HOSTED_GENERATOR.md)

The implementation was executed directly through the connected GitHub tools. Writing the task file does not imply a separate Codex/Copilot cloud-agent run.

## Evidence matrix

| Item | Status | Evidence / boundary |
|---|---|---|
| Correct original generator | OWNER-IDENTIFIED / HTTP REACHABLE | Exact hosted Froge MPC 2 Studio URL above. Owner screenshots show prompt, multiple reference photos, Codex instructions, model viewer and export actions |
| Hosted generation quality | UNREVIEWED / UNCHANGED | Owner screenshots also show working-result validation/quality failures. This integration does not improve or approve the models |
| Source parity | UNKNOWN | `teslaeco/Froge-MPC-2-test` is a separate snapshot, not proof of parity with the current hosted Studio |
| Revised Shop | DEPLOYED / HTTP-ASSET VERIFIED | Embeds the existing application; permanent full-generator and same-tab links appear above the frame |
| Entry points | DEPLOYED / TESTED IN CODE | AI Shop remains `/shop`; `/chess/shop` redirects there; platform-centre originals and Game Lab original-Studio links use the canonical hosted URL |
| Absolute placeholder overlay | REMOVED FROM ACTIVE SHOP | No generic `.webgl-fallback`, native replacement form, fake job status or native generation API call in ShopPage |
| Public hosted HTTP access | VERIFIED HTTP 200 | Credential-free HEAD in PR CI at 21:44:34 UTC returned 200 with no frame-ancestors directive reported. No login redirect was followed and no generation was requested |
| Authenticated Studio / actual iframe / Android | UNKNOWN | HTTP success and server-render tests do not prove cross-origin sign-in, iframe usability, upload or a fresh generation. Permanent direct-open alternatives remain visible independently of the frame |
| PR verification | PASS | Run `35153954093`: 102/102 tests; lint, typecheck, HTTP smoke, production build, foundations and Worker dry-run passed. Nine existing lint warnings, zero errors |
| Post-merge verification | PASS | Main run `35154269149` completed successfully for merge `e244681...` |
| Cloudflare production deployment | PASS | Run `35154269208`, job `104989846163`; deploy completed and public HTML/assets/DEMO API smoke passed at 21:48:13 UTC |
| Paid-pilot re-arm | NOT EXECUTED | Shop pilot run `35154374131` skipped all arming/deployment steps after the marker gate. P0 pilot run `35154374091` also skipped its paid execution step |
| Cost and existing Studio data | NO GENERATION REQUESTED BY THIS TASK | No new paid job, quota increase, model download, job deletion or private archive migration. The original Studio's API account, stored work and limits are independent and unchanged by this integration |
| Contest publication | NOT ASSESSED / NOT SUBMITTED | Final-launch gates remain unresolved. Official pages were not rechecked in this scoped integration task; no eligibility or no-login claim is inferred from linking the Studio |

## What is deployed

The active path is `WORLDIFACT -> /shop -> existing hosted Froge MPC 2 Studio`. WORLDIFACT provides navigation and an embedded view with direct-open alternatives. The original application continues to own prompt/photo input, Codex/Blender execution, previews, exports, sessions and storage. No private code or asset was copied from the hosted app.

The former `forge-studio-public` page remains a named legacy reference, not the active generator. Other WORLDIFACT worlds and separate GAME/MAKE tools remain in place.

The frame has a scoped normal-flow container. The direct-open links precede it in rendered markup. No iframe onLoad health claim, timed redirect, automatic reload, secret in a URL, native paid POST or JSON brief download was introduced.

## Verification sources

- Final PR CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35153954093
- Main CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269149
- Production release: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269208
- No-op Shop pilot gate: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154374131
- No-op P0 pilot gate: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154374091

Tests render the actual Shop component on the server and check canonical destinations, fallback-link order, five-world navigation, absence of legacy UI and absence of native generation side effects. HTTP probe tests reject credentials, paid POSTs and authentication-redirect following. These are not browser/device or external-generation tests.

## Remaining checks

Confirm the deployed Shop on Android/desktop and follow its full-generator link to the original Studio. Existing sign-in requirements may apply. Verify embedded usability separately; use the full Studio when the frame is blank or requires authentication. No new paid generation is required merely to test navigation.

Model likeness, anatomy, textures and export-quality improvements remain deferred by the owner. Manufacturing validation and final contest scheduling are separate tasks.

## Historical evidence retained

Previous P0 records reported successful Astra text/image blueprint output and a controlled Oracle job producing a structurally checked GLB. They are historical results, not new tests of this integration. PR #26 passed build/public HTTP smoke but failed subsequent owner Android UI QA. The previous cumulative WORLDIFACT pilot ceiling was 6; it was not extended or re-armed here. This normal release uses the reviewed disabled-cost native configuration, without changing the hosted Froge generator's independent settings. Earlier ledger revisions retain the original job/hash records.

## Truth boundary

Use EXTERNAL TOOL / OWNER-REPORTED WORKING for the hosted generator until stronger evidence exists. Never call linking/framing a migration of accounts/backend, a new native generator, a verified fresh AI result, manufacturing approval, an official OpenAI character, or satisfaction of contest requirements. Deployment success is verified; complete external generation and device usability are not inferred.
