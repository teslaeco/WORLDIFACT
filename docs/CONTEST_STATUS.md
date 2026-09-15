# Contest status — foundation integration, 16 September 2026

Decision: **Public DEMO exists; final contest readiness is NO-GO.** Paid generation remains disabled. The current focus is connecting the preserved Oracle Blender service to WORLDIFACT as one shared backend for the five primary worlds without changing the existing public applications or starting paid generation.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE DISPLAY VERIFIED; FORM UNRESOLVED | [Official page](https://www.producthunt.com/contests/gpt-6-astra-challenge) still displays 18 September 2026 and a zero countdown. Confirm the actual launch/submission form and all applicable rules; do not infer eligibility or exact closing time from that inconsistency |
| Main baseline | PUBLIC INTEGRITY PASS | Main `54533a8b83b6a3e5e59df57d5d2800608e977bd0`; release 35022432826 succeeded after the platform-control merge. Production remains at https://worldifact.xodobrox.workers.dev |
| Meadow / flowing river | CODE DEPLOYED; VISUAL QA OUTSTANDING | Green meadow and river, no houses/bridge, five portals aligned. PV vehicle, visible mannequin, camera overview and opt-in local audio. Owner accepts appearance; independent device QA unavailable |
| Portal controls | CODE VERIFIED | Analogue joystick, independent camera pointer, swept walk-in entry, action priority and collision-resolved routes along the river. Physical Android and FPS are not measured |
| Original Chess / ISS / Terra | BUILT AND DEPLOYED; PUBLIC INTEGRITY PASS | Pinned source builds and existing ISS asset hashes remain published. Chess keeps its original public host; ISS/Terra sources remain inside WORLDIFACT |
| World Builder / Shop / Studio | PUBLIC ORIGINALS CONNECTED; NOT FULLY MIGRATED | Existing Sites applications remain the active sources of owner data and UI. WORLDIFACT wraps/navigates them; authenticated storage/source migration is still incomplete |
| Eight Planets campaign | INCOMPLETE | Existing FORGE World Builder is the supplied foundation; eight finished platform levels have not been demonstrated |
| Chess shop | PARTIAL | Existing shop connected as a tab. Direct board/piece-to-catalog transfer and automated ordering still need implementation |
| Oracle VM | SERVICE PRESERVED; STORAGE CLEANED | Existing `froge-blender` Oracle VM remains active. Owner cleanup reduced the VM from 89% disk use to about 73%, while preserving the active `froge-blender:local` image, current runtime, final GLBs and protected Queen/Julie/figure jobs |
| Five-world Oracle bridge | IMPLEMENTED ON REVIEW BRANCH; NOT DEPLOYED | Branch `feat/oracle-five-world-bridge` adds one authenticated read-only `/v1/health` check shared across Chess, ISS, Planets, Shop and Game Lab, with rate limiting and per-world status in `/control`. It makes no generation/render/job request. Current Oracle endpoint/credential still need to be synchronized into the production environment and verified before merge/deploy |
| OpenAI | CONFIGURED; PAID OFF | Existing release verified model metadata and synchronized the server secret. `ENABLE_PAID_GENERATION=false`; no paid request or image generation in this continuation |
| LIVE Astra evidence | ABSENT FOR WORLDIFACT | Responses API and proof envelope exist; provider tests use stubs. Any later controlled LIVE request still requires explicit spending authorization |
| Local verification | PENDING FOR ORACLE BRIDGE BRANCH | Existing main baseline had passing tests/build. The new five-world Oracle bridge has new unit coverage but still needs exact-head CI/typecheck/build before merge |
| Browser/device | BLOCKED | Physical Android/WebGL acceptance remains outstanding |
| Source models / MAKE | NOT APPROVED | Preserved models are GAME/design assets unless separately validated for manufacturing |
| Launch materials | DRAFT | Submission text and recording plan exist; genuine final screenshots/video and final Product Hunt form review remain outstanding |

## Current Oracle bridge milestone

The intended topology is now explicit: **one Oracle backend, five WORLDIFACT worlds, one Cloudflare Worker gateway**. The browser never receives the Oracle bearer credential or Quick Tunnel URL. WORLDIFACT calls the Oracle connector server-to-server and exposes only sanitized readiness status. The new bridge endpoint performs one GET-only health request and mirrors that result across the five primary world IDs; it cannot create a model, render a scene or submit a Blender job.

The remaining pairing inputs are `ORACLE_ENDPOINT`, `ORACLE_API_TOKEN` and `OWNER_ACCESS_TOKEN` in the GitHub `production` environment. The existing deployment workflow already synchronizes those values through `scripts/connect-platform.ts` without printing them. A production deployment is still a separate approval gate.

## Next concrete gates

1. Read the current Oracle Quick Tunnel URL and bearer token from the preserved VM without exposing them in chat, verify `/v1/health`, and store `ORACLE_ENDPOINT`, `ORACLE_API_TOKEN` and a new `OWNER_ACCESS_TOKEN` in the GitHub `production` environment.
2. Run exact-head CI for `feat/oracle-five-world-bridge`; require tests, lint, typecheck, build and Worker dry-run to pass.
3. Review the diff and show GO/NO-GO. Do not merge or deploy without explicit owner approval.
4. After an approved deployment, verify `https://worldifact.xodobrox.workers.dev/api/platform/oracle-worlds` and `/control` from a clean session. This proves the shared Oracle bridge only; Blender job execution is a separate gate.
5. Add reviewed write paths world-by-world only after the read-only bridge is stable. Preserve the no-paid gate and never treat a health response as a successful render.
6. Continue Product Hunt readiness: physical Android/browser QA, LIVE Astra evidence only after explicit budget authorization, final media and final form/rules check.

## Platform integration continuation

Froge public source remains v18 at `bac2827fc1ec31e71dc0f5c586df43c507338725`; this does not establish parity with the current Sites Studio release. `/control` is the canonical WORLDIFACT owner starting point. Unified owner editing, current Shop/Studio source migration, shared D1/R2 ownership and production job routing remain incomplete until their separate authenticated migrations are implemented and tested.
