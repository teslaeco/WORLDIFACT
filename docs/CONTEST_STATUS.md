# Contest status — foundation integration, 16 September 2026

Decision: **Public DEMO exists; final contest readiness is NO-GO.** The owner has explicitly prohibited paid generation for this continuation. Restore the meadow and river and reuse existing projects. Current source, limitations and URLs are in [FOUNDATION_INTEGRATION.md](FOUNDATION_INTEGRATION.md). PR #10 is the current merged control/diagnostics baseline; Oracle cleanup is recorded below as an operations checkpoint only and is not LIVE Astra evidence.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE DISPLAY VERIFIED; FORM UNRESOLVED | [Official page](https://www.producthunt.com/contests/gpt-6-astra-challenge) still displays 18 September 2026 and a zero countdown. Confirm the actual launch/submission form and all applicable rules; do not infer eligibility or exact closing time from that inconsistency |
| Main baseline | PR #10 MERGED; PUBLIC RELEASE PASS | Main `54533a8b83b6a3e5e59df57d5d2800608e977bd0`. PR #10 exact-head CI `35022309814` succeeded before merge. Release `35022432826` attempt 3 succeeded and deployed Cloudflare version `8b5f63a4-288b-48ad-a90b-a46caa60fab4`; public integrity passed 13 HTML routes, 17 hub assets, 102 original application entries/assets and the platform status contract |
| Meadow / flowing river | CODE DEPLOYED; VISUAL QA OUTSTANDING | Green meadow and river, no houses/bridge, five portals aligned. PV vehicle, visible mannequin, camera overview and opt-in local audio. Owner accepts appearance; independent device QA unavailable |
| Portal controls | CODE VERIFIED | Analogue joystick, independent camera pointer, swept walk-in entry, action priority and collision-resolved routes along the river. Physical Android and FPS are not measured |
| Original Chess / ISS / Terra | BUILT AND DEPLOYED; PUBLIC INTEGRITY PASS | Pinned source builds and existing ISS asset hashes. ISS retains eight repairs and adds a Terra computer with a Nile mission. CI 35006048011 and 35007445969 built both upstream apps and assembled 102 original app entry/assets |
| World Builder / Shop / Studio | PUBLIC ORIGINALS CONNECTED; NOT FULLY MIGRATED | Source/storage recovery limits described in FOUNDATION_INTEGRATION.md. Do not present the iframe URLs as complete copies. Existing Game Lab / MAKE tools remain at `/builder` and `/make` |
| Eight Planets campaign | INCOMPLETE | Existing FORGE World Builder is the supplied foundation; eight finished platform levels have not been demonstrated |
| Chess shop | PARTIAL | Existing shop connected as a tab. Direct board/piece-to-catalog transfer and automated ordering still need implementation |
| Oracle | VM FOUND; STORAGE CLEANUP VERIFIED; WORLDIFACT PAIRING INCOMPLETE | Existing Oracle Compute instance `froge-blender` is RUNNING and SSH access as `opc` is confirmed. Cleanup V1/V2 preserved the active Froge worker/tunnel, current renderer image `localhost/froge-blender:local` (2.08 GB), final successful GLBs and selected Queen/Julie/figure jobs while removing old intermediate OBJ/BLEND/candidate artifacts. `state/jobs` fell to about 2.6 GB and free root-disk space increased to about 8.2 GB on the 30 GB VM. No reinstall, new VM, render job or paid API call was started. Current WORLDIFACT owner pairing/credential migration and authenticated Oracle health verification remain incomplete |
| OpenAI | CONFIGURED; PAID OFF | Earlier release verified model metadata and synchronized the server secret. Current gates remain `ENABLE_PAID_GENERATION=false`, allowance 0. No paid request or image generation in this continuation |
| LIVE Astra evidence | ABSENT FOR WORLDIFACT | Responses API and proof envelope exist; provider tests use stubs. A key or green CI is not LIVE evidence. Any later pilot requires explicit budget and expiry authorization |
| Local verification | 69 TESTS PASS ON PR #10 BASELINE | PR #10 reports 69 local tests plus lint, TypeScript, local DEMO HTTP, production build and Worker dry-run passing. Imported ISS source retains seven lint warnings; shared Three.js retains a bundle-size warning |
| Browser/device | BLOCKED | Earlier public-browser inspection was rejected by automatic approval review for the usage limit. No local/alternate/headless workaround. Frame behavior, shader rendering, visual acceptance and physical Android remain outstanding |
| Source models / MAKE | NOT APPROVED | Original private manufacturing models remain outside public git. The copied game models are GAME assets, not print-ready revisions. See MANUFACTURING_AUDIT.md |
| Supplier costs | HISTORICAL / PARTIAL | JLC3DP observations remain dated, preliminary and model-specific. Sculpteo and missing size/quantity quotes remain UNKNOWN. No order or supplier message sent |
| Launch materials | DRAFT | Submission text now describes the reused foundations. Gallery plan, 90-second scenario and GPT_PROJECT_INSTRUCTIONS.md exist. Genuine working media, actual form and eligibility checks remain outstanding |

## Next concrete gates

1. Audit the active Oracle connector against old update/hotfix directories before deleting code/history. Preserve any unique quality improvements in anatomy, geometry, textures, scene validation and Blender export; treat old job artifacts separately from runtime code.
2. Pair the existing Oracle service to WORLDIFACT through owner-authenticated credentials and verify `/v1/health` without exposing the tunnel URL or token publicly. A ready health response is still not a successful Blender render.
3. Establish the owner authentication and data migration path for Shop/Studio/World Builder before claiming unified five-application editing. Preserve D1/R2 owner data and encrypted connection credentials.
4. When browser access is available, inspect desktop and actual Android: green ground and river, all portals, original app rendering, ISS computer/return, save/export and independent joystick/camera fingers. Do not turn structural code evidence into an FPS claim.
5. Respect the current no-paid instruction. Only after a new explicit spending authorization may one controlled Astra request produce WORLDIFACT LIVE evidence.
6. Check the real Product Hunt form, applicable contest rules and required fields; resolve the contradictory countdown. Use genuine screenshots/video and clearly distinguish pre-existing work, this integration, MOCK scenery and real Earth-observation sources. Do not fabricate eligibility, claims, votes or a guaranteed win.
7. Final submission and supplier ordering remain separate actions. A public game demo does not establish manufacturing approval.

Historical PR #2–#9 details remain in NIGHT_SHIFT.md and their PRs. The earlier statements that the three games were only nonexistent previews are superseded: the owner supplied functioning original projects and this change reuses them. The former whole-lake replacement was a design regression, now corrected in code.

## Current public/control evidence

PR #10 merged as `54533a8b83b6a3e5e59df57d5d2800608e977bd0`. Release `35022432826` attempt 3 succeeded and published Cloudflare version `8b5f63a4-288b-48ad-a90b-a46caa60fab4`. Public control centre: `https://worldifact.xodobrox.workers.dev/control`. OpenAI model metadata access was verified and its Worker secret synchronized; no paid generation ran. Optional owner/Oracle secrets were not supplied in that release, so Oracle connectivity was not verified by WORLDIFACT itself.

## Latest owner correction

See [VISUAL_UPDATE.md](VISUAL_UPDATE.md). The owner confirms other portals work and permits retaining original Chess/Terra hosting; full migration is deferred. The default meadow now removes houses and bridge, aligns all five portals, adds a PV vehicle, third-person/overview controls, local ambient audio and water shading. The actual shop character remains unavailable; the visible animation mannequin is not that model. Owner accepted the updated appearance; independent device testing remains unverified. Final publication evidence belongs in the presentation PR.

## Platform integration continuation

See [PLATFORM_CONNECTIONS.md](PLATFORM_CONNECTIONS.md). Froge public source is v18 at `bac2827fc1ec31e71dc0f5c586df43c507338725`; this does not establish parity with Sites v47 or with the currently installed Oracle filesystem. `/control` provides navigation/source-editor links and read-only configuration status. Protected metadata/health checks require a separate owner secret and current Oracle credentials. Unified owner editing, authenticated data migration and Oracle live verification remain incomplete. No paid generation. Final tests and publication evidence are recorded in the integration PR.
