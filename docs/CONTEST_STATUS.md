# Contest status — foundation integration, 16 September 2026

Decision: **Public DEMO exists; final contest readiness is NO-GO.** Paid generation remains disabled. The preserved Oracle Blender service is connected to WORLDIFACT in production as one shared read-only backend for the five primary worlds. A reviewed owner-only Oracle job path is being prepared behind a separate disabled production gate.

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
| Five-world Oracle bridge | DEPLOYED READ-ONLY | One server-side authenticated `/v1/health` check is shared across Chess, ISS, Planets, Shop and Game Lab. Secrets stay server-side; `/control` shows sanitized per-world status. No generation/render/job request is made by the deployed bridge |
| Oracle job write path | IMPLEMENTED ON REVIEW BRANCH; BLOCKED | `feat/oracle-job-gate-20260916` adds owner-only prompt job submit/poll routes against the verified `/v1/jobs` connector contract. `ENABLE_ORACLE_JOBS=false` is required by automatic releases, so no job or provider cost can occur from this branch configuration. Image-to-Oracle is explicitly BLOCKED_UNVERIFIED until a current connector contract is proven |
| OpenAI | CONFIGURED; PAID OFF | Deployment synchronized the OpenAI secret and verified model access. `ENABLE_PAID_GENERATION=false`; allowance remains 0; no paid generation was performed |
| LIVE Astra evidence | ABSENT FOR WORLDIFACT GENERATION | The deployed bridge proves model/service configuration only. A controlled LIVE Astra generation still requires explicit spending authorization and separate evidence |
| Verification | 71/71 PASS + DEPLOY SMOKE PASS | Current production baseline passed exact-head tests, lint, typecheck, build, foundation assembly, Worker dry-run and release smoke. The new Oracle write-gate branch requires its own CI before any merge |
| Browser/device | PARTIAL | Owner screenshot confirms `/control` on Android shows all five Oracle cards `Connector ready` with v33 / character standard 20 / OpenAI / gpt-6-astra. Full WebGL interaction/FPS/accessibility QA remains outstanding |
| Source models / MAKE | NOT APPROVED | Preserved models are GAME/design assets unless separately validated for manufacturing |
| Launch materials | DRAFT | Final screenshots/video, final Product Hunt form/rules review and LIVE Astra proof remain outstanding |

## Current Oracle bridge milestone

The deployed topology is: **one Oracle backend, five WORLDIFACT worlds, one Cloudflare Worker gateway**. The browser never receives the Oracle bearer credential or Quick Tunnel URL. `ORACLE_ENDPOINT`, `ORACLE_API_TOKEN` and `OWNER_ACCESS_TOKEN` are stored in the GitHub `production` environment and were synchronized into the Worker during deployment run `35036960083`.

Deployment evidence: main `bfc187a1cf795487c0f6c5614b1623f4a0c35380`, Cloudflare version `99ded65a-89b6-4372-98cc-931c3aa0cb5c`, release smoke PASS. The deployed bridge is intentionally read-only.

The next branch fixes the top Oracle status card to use the same verified shared health result as the five world cards and adds a separate `/api/oracle/jobs` write path. That path is owner-only, same-origin, rate-limited, requires connector v33 + OpenAI + `gpt-6-astra`, supports prompt-only input under the verified public connector contract, and remains blocked unless `ENABLE_ORACLE_JOBS=true`. Automatic releases require that flag to remain `false`.

## Next concrete gates

1. Require green exact-head CI for `feat/oracle-job-gate-20260916`; do not merge/deploy the write-path branch without explicit owner approval.
2. Keep `ENABLE_ORACLE_JOBS=false` and `ENABLE_PAID_GENERATION=false` in production until a controlled cost-approved pilot. The prepared job path must not be treated as LIVE generation evidence while blocked.
3. Before any paid pilot, verify the running v33 job contract from Oracle itself, choose one world (AI Game Lab first), define a request ceiling/expiry, then enable only the reviewed path.
4. Produce one end-to-end LIVE proof after budget approval: prompt + optional image → Astra → structured blueprint/spec → visible scene change; Oracle/Blender prompt job is a separate model-generation step and image-to-Oracle remains blocked until verified.
5. Complete physical Android/WebGL interaction, accessibility and fallback QA.
6. Re-open the official Product Hunt contest page and submission form, then finalize media, Maker Comment, Shoutouts, topics and the scheduled 18 September launch.

## Platform integration continuation

Froge public source remains v18 at `bac2827fc1ec31e71dc0f5c586df43c507338725`; this does not establish parity with the running Oracle connector v33. `/control` is the canonical WORLDIFACT owner starting point. Unified owner editing, current Shop/Studio source migration, shared D1/R2 ownership and production job routing remain incomplete until their separate authenticated migrations are implemented and tested.
