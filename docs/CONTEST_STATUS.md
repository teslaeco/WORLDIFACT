# Contest status — foundation integration, 15 September 2026

Decision: **Public DEMO exists; final contest readiness is NO-GO.** The owner has explicitly prohibited paid generation for this continuation. Restore the meadow and river and reuse existing projects. Current source, limitations and URLs are in [FOUNDATION_INTEGRATION.md](FOUNDATION_INTEGRATION.md). PR #6 and its release-propagation follow-up are the final CI/deployment evidence ledgers.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Official contest | DATE DISPLAY VERIFIED; FORM UNRESOLVED | [Official page](https://www.producthunt.com/contests/gpt-6-astra-challenge) still displays 18 September 2026 and a zero countdown. Confirm the actual launch/submission form and all applicable rules; do not infer eligibility or exact closing time from that inconsistency |
| Main baseline | DEPLOYED; FULL INTEGRITY CHECK PENDING | PR #7, main `3c3332d69e351f920e4c23f178b98f293c244c9c`. [Release 35007611067](https://github.com/teslaeco/WORLDIFACT/actions/runs/35007611067) deployed version `c2a7198d-ff7f-4825-a241-97de2c830193`; hub checks passed, but the static checker stopped at a canonical Terra HTML redirect. The next follow-up addresses this checker failure |
| Meadow / flowing river | CODE DEPLOYED; VISUAL QA OUTSTANDING | Green meadow, trees, bridge, river current and water portals; existing panorama reused. Game Lab is behind the shop |
| Portal controls | CODE VERIFIED | Analogue joystick, independent camera pointer, swept walk-in entry, action priority and collision-resolved routes across the bridge. Physical Android and FPS are not measured |
| Original Chess / ISS / Terra | BUILT AND DEPLOYED; PUBLIC INTEGRITY CHECK PENDING | Pinned source builds and existing ISS asset hashes. ISS retains eight repairs and adds a Terra computer with a Nile mission. CI 35006048011 and 35007445969 built both upstream apps and assembled 102 original app entry/assets. PR #7 progressed beyond hub checks; canonical copied HTML redirects must be handled before a full public integrity PASS |
| World Builder / Shop / Studio | PUBLIC ORIGINALS CONNECTED; NOT FULLY MIGRATED | Source/storage recovery limits described in FOUNDATION_INTEGRATION.md. Do not present the iframe URLs as complete copies. Existing Game Lab / MAKE tools remain at `/builder` and `/make` |
| Eight Planets campaign | INCOMPLETE | Existing FORGE World Builder is the supplied foundation; eight finished platform levels have not been demonstrated |
| Chess shop | PARTIAL | Existing shop connected as a tab. Direct board/piece-to-catalog transfer and automated ordering still need implementation |
| Oracle | EXISTING SERVICE PRESERVED | Existing Sites integration code recovered; no new VM or job started. New WORLDIFACT backend pairing and owner/storage migration are not complete |
| OpenAI | CONFIGURED; PAID OFF | Earlier release verified model metadata and synchronized the server secret. Current gates remain `ENABLE_PAID_GENERATION=false`, allowance 0. No paid request or image generation in this continuation |
| LIVE Astra evidence | ABSENT FOR WORLDIFACT | Responses API and proof envelope exist; provider tests use stubs. A key or green CI is not LIVE evidence. Any later pilot requires explicit budget and expiry authorization |
| Local verification | 60/60 PASS | Meaningful movement, API, original ISS repairs/collision and deployment integrity tests; TypeScript/build/HTTP and Worker dry-run. Canonical-redirect tests retain hash validation and reject unrelated destinations. Imported ISS source retains seven lint warnings; shared Three.js retains a bundle-size warning |
| Browser/device | BLOCKED | Earlier public-browser inspection was rejected by automatic approval review for the usage limit. No local/alternate/headless workaround. Frame behavior, shader rendering, visual acceptance and physical Android remain outstanding |
| Source models / MAKE | NOT APPROVED | Original private manufacturing models remain outside public git. The copied game models are GAME assets, not print-ready revisions. See MANUFACTURING_AUDIT.md |
| Supplier costs | HISTORICAL / PARTIAL | JLC3DP observations remain dated, preliminary and model-specific. Sculpteo and missing size/quantity quotes remain UNKNOWN. No order or supplier message sent |
| Launch materials | DRAFT | Submission text now describes the reused foundations. Gallery plan, 90-second scenario and GPT_PROJECT_INSTRUCTIONS.md exist. Genuine working media, actual form and eligibility checks remain outstanding |

## Next concrete gates

1. Finish this PR's source/build checks and automatic Cloudflare release. Record exact CI, source SHA, deployment version and HTTP result in its PR.
2. Obtain authorized exports of the blocked original Sites and design owner identity / D1/R2 / Oracle migration before claiming full self-hosting. Preserve existing archives and encrypted credentials.
3. When browser access is available, inspect desktop and actual Android: green ground and river, all portals, original app rendering, ISS computer/return, save/export and independent joystick/camera fingers. Do not turn structural code evidence into an FPS claim.
4. Respect the current no-paid instruction. Only after a new explicit spending authorization may one controlled Astra request produce WORLDIFACT LIVE evidence.
5. Check the real Product Hunt form, applicable contest rules and required fields; resolve the contradictory countdown. Use genuine screenshots/video and clearly distinguish pre-existing work, this integration, MOCK scenery and real Earth-observation sources. Do not fabricate eligibility, claims, votes or a guaranteed win.
6. Final submission and supplier ordering remain separate actions. A public game demo does not establish manufacturing approval.

Historical PR #2–#5 details remain in NIGHT_SHIFT.md and their PRs. The earlier statements that the three games were only nonexistent previews are superseded: the owner supplied functioning original projects and this change reuses them. The former whole-lake replacement was a design regression, now corrected in code.

Release propagation evidence: PR #6 merged as `0ea90397c00dfdbf0e98e3d645d77b95da1124b4`. [Run 35006854698](https://github.com/teslaeco/WORLDIFACT/actions/runs/35006854698) deployed version `5c670d3b-95fd-4086-9910-788381fed3a3` at 18:21 UTC and confirmed OpenAI CONFIGURED without generation. The immediate HTML integrity check failed. The follow-up retries only idempotent asset reads for at most 30 seconds of delay, preserving exact hashes and failing persistent mismatch; no generation request is retried.

The canonical HTML follow-up keeps Cloudflare's standard directory routing and permits only its expected same-origin HTML destinations, up to two hops. It does not turn a redirect, SPA fallback or stale app into a passing copied-file check. Final CI/source/version/HTTP evidence will be recorded in that PR. Browser/device and migration gates remain independent.
