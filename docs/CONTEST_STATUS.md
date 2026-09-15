# Contest status — foundation integration, 16 September 2026

Decision: **Public DEMO exists; final contest readiness is NO-GO.** Paid generation remains disabled. The preserved Oracle Blender service is now connected to WORLDIFACT in production as one shared read-only backend for the five primary worlds.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE DISPLAY VERIFIED; FORM UNRESOLVED | [Official page](https://www.producthunt.com/contests/gpt-6-astra-challenge) still displays 18 September 2026 and a zero countdown. Confirm the actual launch/submission form and all applicable rules before final submission |
| Main baseline | DEPLOYED | Main `bfc187a1cf795487c0f6c5614b1623f4a0c35380`; deployment run `35036960083`; Cloudflare version `99ded65a-89b6-4372-98cc-931c3aa0cb5c`; production: https://worldifact.xodobrox.workers.dev |
| Meadow / flowing river | CODE DEPLOYED; VISUAL QA OUTSTANDING | Green meadow and river, no houses/bridge, five portals aligned. PV vehicle, visible mannequin, camera overview and opt-in local audio. Physical Android/WebGL acceptance remains outstanding |
| Portal controls | CODE VERIFIED | Analogue joystick, independent camera pointer, swept walk-in entry, action priority and collision-resolved routes along the river |
| Original Chess / ISS / Terra | BUILT AND DEPLOYED; PUBLIC INTEGRITY PASS | Pinned source builds and existing ISS asset hashes remain published. Chess keeps its original public host; ISS/Terra sources remain inside WORLDIFACT |
| World Builder / Shop / Studio | PUBLIC ORIGINALS CONNECTED; NOT FULLY MIGRATED | Existing Sites applications remain the active sources of owner data and UI. WORLDIFACT wraps/navigates them; authenticated storage/source migration is still incomplete |
| Eight Planets campaign | INCOMPLETE | Existing FORGE World Builder is the supplied foundation; eight finished platform levels have not been demonstrated |
| Chess shop | PARTIAL | Existing shop connected as a tab. Direct board/piece-to-catalog transfer and automated ordering still need implementation |
| Oracle VM | LIVE HEALTH VERIFIED; STORAGE CLEANED | Existing `froge-blender` VM is active. Owner-run authenticated health returned `ready=true`, provider `openai`, model `gpt-6-astra`, connector `33`, character standard `20`. This is service-health evidence, not a render/generation proof |
| Five-world Oracle bridge | DEPLOYED READ-ONLY | One server-side authenticated `/v1/health` check is shared across Chess, ISS, Planets, Shop and Game Lab. Secrets stay server-side; `/control` shows sanitized per-world status. No generation/render/job request is made by the bridge |
| OpenAI | CONFIGURED; PAID OFF | Deployment synchronized the OpenAI secret and verified model access. `ENABLE_PAID_GENERATION=false`; allowance remains 0; no paid generation was performed |
| LIVE Astra evidence | ABSENT FOR WORLDIFACT GENERATION | The deployed bridge proves model/service configuration only. A controlled LIVE Astra generation still requires explicit spending authorization and separate evidence |
| Verification | 71/71 PASS + DEPLOY SMOKE PASS | Exact-head tests, lint, typecheck, build, foundation assembly, Worker dry-run and production release smoke passed. Release smoke verified 13 HTML routes, 17 hub assets and 102 original app entries/assets without a paid API call |
| Browser/device | BLOCKED / NEXT GATE | Clean-session verification of `/api/platform/oracle-worlds`, `/control` and physical Android/WebGL remains outstanding |
| Source models / MAKE | NOT APPROVED | Preserved models are GAME/design assets unless separately validated for manufacturing |
| Launch materials | DRAFT | Final screenshots/video, final Product Hunt form/rules review and LIVE Astra proof remain outstanding |

## Current Oracle bridge milestone

The deployed topology is now: **one Oracle backend, five WORLDIFACT worlds, one Cloudflare Worker gateway**. The browser never receives the Oracle bearer credential or Quick Tunnel URL. `ORACLE_ENDPOINT`, `ORACLE_API_TOKEN` and `OWNER_ACCESS_TOKEN` are stored in the GitHub `production` environment and were synchronized into the Worker during deployment run `35036960083`.

Deployment evidence: main `bfc187a1cf795487c0f6c5614b1623f4a0c35380`, Cloudflare version `99ded65a-89b6-4372-98cc-931c3aa0cb5c`, release smoke PASS. The bridge is intentionally read-only and cannot create a model, render a scene or submit a Blender job.

## Next concrete gates

1. From a clean browser session, verify `https://worldifact.xodobrox.workers.dev/api/platform/oracle-worlds` and `/control`, confirming all five world IDs report the shared Oracle status without exposing secrets.
2. Add reviewed authenticated write paths world-by-world only after the read-only bridge is stable. Do not route job creation from all five worlds at once without tests and rollback.
3. Preserve `ENABLE_PAID_GENERATION=false` until an explicit controlled Astra budget is approved; then produce one end-to-end LIVE proof: prompt/image → Astra → structured blueprint/spec → visible scene change → separate GAME/MAKE plans.
4. Complete physical Android/browser QA and accessibility checks.
5. Re-open the official Product Hunt contest page and submission form, then finalize media, Maker Comment, Shoutouts, topics and the scheduled 18 September launch.

## Platform integration continuation

Froge public source remains v18 at `bac2827fc1ec31e71dc0f5c586df43c507338725`; this does not establish parity with the running Oracle connector v33. `/control` is the canonical WORLDIFACT owner starting point. Unified owner editing, current Shop/Studio source migration, shared D1/R2 ownership and production job routing remain incomplete until their separate authenticated migrations are implemented and tested.
