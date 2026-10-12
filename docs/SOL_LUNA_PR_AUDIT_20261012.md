# WORLDIFACT PR inventory and Sol/Luna audit — 2026-10-12

Scope: all 256 PR records returned across three pages (100 + 100 + 56), open and closed. This is a complete inventory and routing-focused review, not a claim that every historical diff received a new line-by-line security review.

Baseline main: `3db45add7f5e38043b19677d22ca90e614d2a333`.

## Confirmed routing

- PR #136 introduced live Sol Responses API calls followed by local procedural geometry.
- PR #141 added Luna and explicit model-bound reservations; it did not add detailed Sol/Luna Blender execution.
- PR #219 upgraded the actual Sol API ID to `gpt-6.1-sol`, preserving historical receipt recovery.
- PR #255 exposed the combined model/mode selector. PR #266 wired files only to the detailed Astra route.
- Current `server/worker.ts` sends the selected exact model to OpenAI Responses; `server/studio.ts`, `studioProtocol.ts`, the Oracle gateway and spend/terminal receipts remain Astra-bound.
- Official model pages opened: https://developers.openai.com/api/docs/models/gpt-6.1-sol and https://developers.openai.com/api/docs/models/gpt-6-luna. Both support image input; current product restrictions are not evidence of missing provider capability.

## Actual production tests

Two explicitly authorized single-click tests used the existing authenticated Shop and its original provider caps: Sol USD0.35, Luna USD0.10. Each returned LIVE provenance, the exact selected API model, a provider response ID, a rendered procedural preview and a GLB download control. The Luna GLB was downloaded and its glTF 2 header/declared length validated: 87,592 bytes, two meshes. These are live procedural API tests, not detailed Blender success or quality acceptance. Private request IDs remain outside the public repository.

Normal point charges were observed. Existing holds were unchanged. No manual ledger mutation, credit grant, refund, pricing or secret change was performed. Actual invoice cost is unknown.

## Reproduced UI defects

Starting a new request could show the previous Studio 100% badge. After a Sol/Luna preview replaced that model, the old Studio export buttons still referred to the earlier Astra file. New lifecycle regressions reproduce both model cases before the fix. The patch suppresses unrelated result controls while preserving historical receipts/artifacts, guards export handlers during submission, and removes an incorrect Astra-only statement from Sol/Luna provenance.

## Remaining blocker

Detailed Sol/Luna generation is NOT implemented by this UI repair. It needs one immutable per-job model contract propagated through prepare/digest/admission, Oracle execution, model-specific budget reservations and authenticated terminal evidence. Updating a dropdown or changing a global Oracle model would mislabel or break historical Astra jobs. Current Desktop Commander is offline; no new Oracle installation is claimed. Existing MPC2/Astra generation is preserved. No full-model availability or sub-minute generation claim is made.

## All pull requests

| PR | Status | Title |
| --- | --- | --- |
| [#1](https://github.com/teslaeco/WORLDIFACT/pull/1) | open draft | feat: build WORLDIFACT public competition demo |
| [#2](https://github.com/teslaeco/WORLDIFACT/pull/2) | merged | Build WORLDIFACT playable scene studio and controlled release candidate |
| [#3](https://github.com/teslaeco/WORLDIFACT/pull/3) | merged | Fix redirect loop blocking Cloudflare publication |
| [#4](https://github.com/teslaeco/WORLDIFACT/pull/4) | merged | Automate verified Cloudflare releases and secure OpenAI setup |
| [#5](https://github.com/teslaeco/WORLDIFACT/pull/5) | merged | Restore walk-in portals on Mirror Lake and phone joystick controls |
| [#6](https://github.com/teslaeco/WORLDIFACT/pull/6) | merged | Restore the meadow and river; reuse existing game foundations |
| [#7](https://github.com/teslaeco/WORLDIFACT/pull/7) | merged | Wait briefly for edge propagation without weakening release checks |
| [#8](https://github.com/teslaeco/WORLDIFACT/pull/8) | merged | Verify canonical HTML routes for copied WORLDIFACT apps |
| [#9](https://github.com/teslaeco/WORLDIFACT/pull/9) | merged | Open meadow, PV vehicle, third-person camera and portal atmosphere |
| [#10](https://github.com/teslaeco/WORLDIFACT/pull/10) | merged | Connect platform navigation and add protected service diagnostics |
| [#11](https://github.com/teslaeco/WORLDIFACT/pull/11) | merged | Connect one Oracle backend to all five WORLDIFACT worlds |
| [#12](https://github.com/teslaeco/WORLDIFACT/pull/12) | merged | Prepare owner-only Oracle job path behind disabled gate |
| [#13](https://github.com/teslaeco/WORLDIFACT/pull/13) | merged | P0: make AI Game Lab the visible Astra reference flow |
| [#14](https://github.com/teslaeco/WORLDIFACT/pull/14) | merged | Automate approved one-time P0 paid pilot evidence |
| [#15](https://github.com/teslaeco/WORLDIFACT/pull/15) | merged | Recover remaining two approved P0 pilot attempts |
| [#16](https://github.com/teslaeco/WORLDIFACT/pull/16) | merged | Record verified LIVE P0 Astra and Oracle evidence |
| [#17](https://github.com/teslaeco/WORLDIFACT/pull/17) | merged | Add owner-only Oracle GLB artifact review path |
| [#18](https://github.com/teslaeco/WORLDIFACT/pull/18) | merged | Record verified Oracle GLB and public HTTP P0 evidence |
| [#19](https://github.com/teslaeco/WORLDIFACT/pull/19) | merged | Fix Android portal navigation from AI Game Lab |
| [#20](https://github.com/teslaeco/WORLDIFACT/pull/20) | merged | Fix broken Android Planets and Game Lab demo flows |
| [#21](https://github.com/teslaeco/WORLDIFACT/pull/21) | merged | Restore 8 Planets world view and add World #5 Game Lab tabs |
| [#22](https://github.com/teslaeco/WORLDIFACT/pull/22) | merged | Fix AI Shop generation: preview on-page instead of downloading brief |
| [#23](https://github.com/teslaeco/WORLDIFACT/pull/23) | merged | Port proven MCP2 generator into Enchanted AI Shop |
| [#24](https://github.com/teslaeco/WORLDIFACT/pull/24) | merged | Port proven MCP2 generator into Enchanted AI Shop |
| [#25](https://github.com/teslaeco/WORLDIFACT/pull/25) | merged | Re-arm one-slot MCP2 Shop pilot without concurrency collision |
| [#26](https://github.com/teslaeco/WORLDIFACT/pull/26) | merged | Fix AI Shop end-to-end generation and portal entry |
| [#27](https://github.com/teslaeco/WORLDIFACT/pull/27) | merged | Connect existing Froge MPC 2 Studio as the AI Shop generator |
| [#28](https://github.com/teslaeco/WORLDIFACT/pull/28) | merged | WIP: five-pass English localization and truthful 3D quality evidence |
| [#29](https://github.com/teslaeco/WORLDIFACT/pull/29) | merged | Fix AI Shop entry: remove failed iframe and open the original Froge Studio |
| [#30](https://github.com/teslaeco/WORLDIFACT/pull/30) | merged | Keep Froge Studio inside WORLDIFACT with a persistent return toolbar |
| [#31](https://github.com/teslaeco/WORLDIFACT/pull/31) | merged | Restore in-page Shop generation through the existing Oracle/Blender worker |
| [#32](https://github.com/teslaeco/WORLDIFACT/pull/32) | merged | Fix cancelled Studio allowance continuation without adding generation capacity |
| [#33](https://github.com/teslaeco/WORLDIFACT/pull/33) | merged | Repair Studio release gate with a tested shallow-Git history check |
| [#34](https://github.com/teslaeco/WORLDIFACT/pull/34) | merged | Fix browser Illegal invocation in StudioCoordinator fetch calls |
| [#35](https://github.com/teslaeco/WORLDIFACT/pull/35) | merged | Add native Chromium regression for the deployed Shop fetch receiver fix |
| [#36](https://github.com/teslaeco/WORLDIFACT/pull/36) | merged | Add capability-gated FAST drafts with measured Blender-only speed evidence |
| [#37](https://github.com/teslaeco/WORLDIFACT/pull/37) | merged | Unlock Shop draft fields after a completed model without losing its result |
| [#38](https://github.com/teslaeco/WORLDIFACT/pull/38) | merged | Activate the already approved one FAST test with a monetary guard |
| [#39](https://github.com/teslaeco/WORLDIFACT/pull/39) | open draft | Add ISS MAKE workflow, 3-photo input and customer-safe manufacturing offers |
| [#40](https://github.com/teslaeco/WORLDIFACT/pull/40) | merged | Shop: add client MAKE offers and ISS print-prep draft |
| [#41](https://github.com/teslaeco/WORLDIFACT/pull/41) | merged | Shop: customer storefront, cart and verified-quote pricing |
| [#42](https://github.com/teslaeco/WORLDIFACT/pull/42) | merged | Contest finish: five Astra portals and Terra Earth EVA |
| [#43](https://github.com/teslaeco/WORLDIFACT/pull/43) | merged | Contest hotfix: mobile EVA, Neptune Queen avatar and 6 MB scans |
| [#44](https://github.com/teslaeco/WORLDIFACT/pull/44) | open draft | Contest final hotfix: uploaded avatar, compact ISS mobile UI and Chess recovery |
| [#45](https://github.com/teslaeco/WORLDIFACT/pull/45) | merged | Contest hotfix: keep all Astra generator surfaces usable |
| [#46](https://github.com/teslaeco/WORLDIFACT/pull/46) | open | Final contest hotfix: uploaded avatar, mobile HUD, Chess and public Astra |
| [#47](https://github.com/teslaeco/WORLDIFACT/pull/47) | merged | Release: bounded contest LIVE Astra + Studio generation |
| [#48](https://github.com/teslaeco/WORLDIFACT/pull/48) | merged | Fix LIVE release smoke without paid generation |
| [#49](https://github.com/teslaeco/WORLDIFACT/pull/49) | merged | Verify succeeded contest Studio GLB without new generation |
| [#50](https://github.com/teslaeco/WORLDIFACT/pull/50) | merged | Product Hunt live hotfix: generation fallback, Chess launch and world audio |
| [#51](https://github.com/teslaeco/WORLDIFACT/pull/51) | merged | Restore LIVE generation after launch allowance exhaustion |
| [#52](https://github.com/teslaeco/WORLDIFACT/pull/52) | merged | Stop routing customers into broken FAST generation |
| [#53](https://github.com/teslaeco/WORLDIFACT/pull/53) | merged | Embed Product Hunt comments card on WORLDIFACT |
| [#54](https://github.com/teslaeco/WORLDIFACT/pull/54) | merged | Restore AI Shop LIVE generation with FAST / SLOW modes |
| [#55](https://github.com/teslaeco/WORLDIFACT/pull/55) | merged | Fix AI Shop FAST with live Astra procedural draft |
| [#56](https://github.com/teslaeco/WORLDIFACT/pull/56) | merged | Upgrade main avatar with Fan Queen, swimming and fan flight |
| [#57](https://github.com/teslaeco/WORLDIFACT/pull/57) | merged | Add 100 MB project attachments to Shop and Game Lab |
| [#58](https://github.com/teslaeco/WORLDIFACT/pull/58) | open draft | Add PDF, Word, 3D and video reference files to AI Shop |
| [#59](https://github.com/teslaeco/WORLDIFACT/pull/59) | merged | Add Oracle-backed project file vault for Shop and Game Lab |
| [#60](https://github.com/teslaeco/WORLDIFACT/pull/60) | open draft | docs: Astra-assisted WORLDIFACT vs Meshy — honest rim case study |
| [#61](https://github.com/teslaeco/WORLDIFACT/pull/61) | merged | Publish honest Astra vs Meshy rim comparison with screenshot evidence |
| [#62](https://github.com/teslaeco/WORLDIFACT/pull/62) | open draft | fix(shop): explain blocked long prompts and expose safe job recovery |
| [#63](https://github.com/teslaeco/WORLDIFACT/pull/63) | merged | Shared accounts, verified payments and USD 29.99 monthly membership |
| [#64](https://github.com/teslaeco/WORLDIFACT/pull/64) | merged | Fix WORLDIFAKT login, Google sign-in and USD 29.99 pricing |
| [#65](https://github.com/teslaeco/WORLDIFACT/pull/65) | merged | Fix Supabase auth timeout and Google callback error handling |
| [#66](https://github.com/teslaeco/WORLDIFACT/pull/66) | merged | Fix Google sign-in failure caused by unsupported Cloudflare fetch mode |
| [#67](https://github.com/teslaeco/WORLDIFACT/pull/67) | merged | Finish Stripe setup from the existing production secret |
| [#68](https://github.com/teslaeco/WORLDIFACT/pull/68) | merged | Accept restricted Stripe keys and diagnose setup input safely |
| [#69](https://github.com/teslaeco/WORLDIFACT/pull/69) | merged | Enable Stripe payments and subscription cancellation |
| [#70](https://github.com/teslaeco/WORLDIFACT/pull/70) | merged | Fix Stripe portal preparation for payment activation |
| [#71](https://github.com/teslaeco/WORLDIFACT/pull/71) | merged | Complete owned Stripe portal policy before activating payments |
| [#72](https://github.com/teslaeco/WORLDIFACT/pull/72) | merged | Accept the verified Stripe-created default portal |
| [#73](https://github.com/teslaeco/WORLDIFACT/pull/73) | merged | Diagnose authenticated Stripe checkout failures without exposing secrets |
| [#74](https://github.com/teslaeco/WORLDIFACT/pull/74) | merged | Diagnose Stripe Checkout rejection with an unpaid provider check |
| [#75](https://github.com/teslaeco/WORLDIFACT/pull/75) | merged | Fix checkout rejected by Stripe account Managed Payments default |
| [#76](https://github.com/teslaeco/WORLDIFACT/pull/76) | merged | Recover earlier Stripe checkout failures using authoritative request replay |
| [#77](https://github.com/teslaeco/WORLDIFACT/pull/77) | merged | Add polished homepage banners for tools, platforms and community |
| [#78](https://github.com/teslaeco/WORLDIFACT/pull/78) | merged | Fix Product Hunt wordmark contrast in homepage banners |
| [#79](https://github.com/teslaeco/WORLDIFACT/pull/79) | merged | Show credits at the top, welcome checkout returns home and unblock stale receipt recovery |
| [#80](https://github.com/teslaeco/WORLDIFACT/pull/80) | merged | Preserve detailed Queen, restore fan and improve the five-portal presentation |
| [#81](https://github.com/teslaeco/WORLDIFACT/pull/81) | merged | Add Queen flight and double jump; repair fan, camera and mobile presentation |
| [#82](https://github.com/teslaeco/WORLDIFACT/pull/82) | merged | Repair Queen motion/fan regressions and add editable desert backhoe-loader gameplay |
| [#83](https://github.com/teslaeco/WORLDIFACT/pull/83) | merged | Fix actual Queen anatomy/fan and make PV loader excavation visible |
| [#84](https://github.com/teslaeco/WORLDIFACT/pull/84) | merged | Fix missing/slow original Queen loading on mobile |
| [#85](https://github.com/teslaeco/WORLDIFACT/pull/85) | merged | Eliminate Queen load error1102 with hash-pinned, precompressed static delivery |
| [#86](https://github.com/teslaeco/WORLDIFACT/pull/86) | merged | Accept valid Cloudflare Queen streams without Content-Length |
| [#88](https://github.com/teslaeco/WORLDIFACT/pull/88) | merged | feat(world): add giant enterable owner tower |
| [#89](https://github.com/teslaeco/WORLDIFACT/pull/89) | merged | docs: record Giant Tower live release evidence |
| [#91](https://github.com/teslaeco/WORLDIFACT/pull/91) | merged | fix(world): restore Giant Tower fidelity and add owner landship |
| [#92](https://github.com/teslaeco/WORLDIFACT/pull/92) | merged | docs: record tower and landship live release evidence |
| [#95](https://github.com/teslaeco/WORLDIFACT/pull/95) | merged | fix(world/shop): restore Giant Tower, drive owner landship, make size opt-in |
| [#96](https://github.com/teslaeco/WORLDIFACT/pull/96) | merged | docs: record Giant Tower, landship drive and optional-size live release |
| [#98](https://github.com/teslaeco/WORLDIFACT/pull/98) | merged | fix(world): publish Giant Tower as direct verified GLB on mobile |
| [#99](https://github.com/teslaeco/WORLDIFACT/pull/99) | merged | docs: record Giant Tower direct-GLB live release |
| [#100](https://github.com/teslaeco/WORLDIFACT/pull/100) | open | fix(shop): restore PBR, FBX and Blender downloads |
| [#102](https://github.com/teslaeco/WORLDIFACT/pull/102) | merged | fix(world): restore mobile Queen and audit Shop artifacts in the portal world |
| [#103](https://github.com/teslaeco/WORLDIFACT/pull/103) | open | docs: record mobile Queen and Shop artifact live release |
| [#105](https://github.com/teslaeco/WORLDIFACT/pull/105) | merged | fix(shop): universal owned downloads and no-AI export preparation |
| [#107](https://github.com/teslaeco/WORLDIFACT/pull/107) | closed unmerged | feat(world): add Grand Desert, Mountain Coast and living Forge workers |
| [#108](https://github.com/teslaeco/WORLDIFACT/pull/108) | merged | ops(oracle): add export-prepare launcher and audit all PRs |
| [#109](https://github.com/teslaeco/WORLDIFACT/pull/109) | merged | fix(oracle): correct export launcher OCI VNIC query |
| [#110](https://github.com/teslaeco/WORLDIFACT/pull/110) | merged | ops(oracle): add read-only export maintenance diagnosis |
| [#111](https://github.com/teslaeco/WORLDIFACT/pull/111) | merged | fix(oracle): wait for worker health during P0 maintenance |
| [#112](https://github.com/teslaeco/WORLDIFACT/pull/112) | merged | feat(world): finish Grand Desert, Mountain Coast and living workers |
| [#113](https://github.com/teslaeco/WORLDIFACT/pull/113) | merged | docs(world): record live Grand Desert and Mountain Coast release |
| [#114](https://github.com/teslaeco/WORLDIFACT/pull/114) | merged | feat(world): add interactive Forge worker field missions |
| [#115](https://github.com/teslaeco/WORLDIFACT/pull/115) | merged | fix(P0): restore existing texture, FBX and Blender downloads; show NPCs near hub |
| [#116](https://github.com/teslaeco/WORLDIFACT/pull/116) | merged | ops(P0): make Oracle export installer survive Cloud Shell disconnects |
| [#117](https://github.com/teslaeco/WORLDIFACT/pull/117) | merged | fix(P0): stop export self-throttling and bundle Forge workers |
| [#118](https://github.com/teslaeco/WORLDIFACT/pull/118) | merged | ops: verify live Oracle export capability and record P0 release |
| [#119](https://github.com/teslaeco/WORLDIFACT/pull/119) | merged | ops(P0): finish Oracle exports and verify GLB/PBR/FBX/BLEND end to end |
| [#120](https://github.com/teslaeco/WORLDIFACT/pull/120) | merged | fix(P0): recover stale Oracle export failure and verify four formats |
| [#121](https://github.com/teslaeco/WORLDIFACT/pull/121) | merged | fix(P0): replace failed Oracle systemd launcher with resumable v4 |
| [#122](https://github.com/teslaeco/WORLDIFACT/pull/122) | closed unmerged | docs: record live v4 release and remaining Oracle E2E |
| [#123](https://github.com/teslaeco/WORLDIFACT/pull/123) | merged | fix(P0): wait for active Oracle job before export maintenance |
| [#124](https://github.com/teslaeco/WORLDIFACT/pull/124) | closed unmerged | docs: record live active-job wait release |
| [#125](https://github.com/teslaeco/WORLDIFACT/pull/125) | merged | fix(P0): show Oracle queue heartbeat instead of silent wait |
| [#126](https://github.com/teslaeco/WORLDIFACT/pull/126) | merged | fix(P0): recover generation lifecycle and audit full production site |
| [#127](https://github.com/teslaeco/WORLDIFACT/pull/127) | merged | fix(P0): unblock SLOW generation on restored stable release |
| [#128](https://github.com/teslaeco/WORLDIFACT/pull/128) | closed unmerged | test: prove one Oracle 3D generation without production deploy |
| [#129](https://github.com/teslaeco/WORLDIFACT/pull/129) | merged | Fix image-guided reference fidelity for SLOW generation |
| [#130](https://github.com/teslaeco/WORLDIFACT/pull/130) | merged | Replace portal-world Giant Tower with attached Terrace Tower |
| [#131](https://github.com/teslaeco/WORLDIFACT/pull/131) | merged | Fix exact portal building ingestion retry |
| [#132](https://github.com/teslaeco/WORLDIFACT/pull/132) | merged | Use exact owner Terrace Tower GLB in portal world |
| [#133](https://github.com/teslaeco/WORLDIFACT/pull/133) | merged | Fix stale Terrace Tower asset and publish exact owner exports |
| [#134](https://github.com/teslaeco/WORLDIFACT/pull/134) | merged | Verify complete Terrace Tower bundle in production |
| [#135](https://github.com/teslaeco/WORLDIFACT/pull/135) | merged | Add user model gallery to account, AI Shop and Game Lab |
| [#136](https://github.com/teslaeco/WORLDIFACT/pull/136) | merged | Ship SOL pricing, funded free tier and persistent provider-spend guards |
| [#137](https://github.com/teslaeco/WORLDIFACT/pull/137) | merged | Show model selection costs and add opt-in Oracle Astra budget guard |
| [#138](https://github.com/teslaeco/WORLDIFACT/pull/138) | merged | Connect created Astra prices and verify the installed Oracle cost guard |
| [#139](https://github.com/teslaeco/WORLDIFACT/pull/139) | merged | Show AI model dropdown beside prompt, fix price contrast and preserve failed live-test evidence |
| [#141](https://github.com/teslaeco/WORLDIFACT/pull/141) | merged | Add Luna/Sol/Astra point selection, better free MCC assets and screenshot comparison |
| [#142](https://github.com/teslaeco/WORLDIFACT/pull/142) | merged | Build private Game Lab with terrain tools, model library and guarded Creator Astra eligibility |
| [#143](https://github.com/teslaeco/WORLDIFACT/pull/143) | merged | Fix editor object movement, character visibility and subscription change confirmation |
| [#144](https://github.com/teslaeco/WORLDIFACT/pull/144) | merged | fix(billing): highlight plan cards and verify Pro/Studio Stripe mapping |
| [#145](https://github.com/teslaeco/WORLDIFACT/pull/145) | merged | docs: record live Pro/Studio activation |
| [#146](https://github.com/teslaeco/WORLDIFACT/pull/146) | merged | Fix failed subscription payment recovery and self-service card changes |
| [#147](https://github.com/teslaeco/WORLDIFACT/pull/147) | merged | Complete payment recovery after expired upgrades and delayed webhooks |
| [#148](https://github.com/teslaeco/WORLDIFACT/pull/148) | merged | Fix Pro/Studio card payment retry and move card management below offers |
| [#149](https://github.com/teslaeco/WORLDIFACT/pull/149) | open draft | Prepare same-invoice payment return; preserve hosted recovery until activation |
| [#150](https://github.com/teslaeco/WORLDIFACT/pull/150) | merged | Fix paid blueprint incident: six references, honest delivery and idempotent recovery |
| [#151](https://github.com/teslaeco/WORLDIFACT/pull/151) | merged | Record verified PR150 deployment and remaining character/refund limitations |
| [#152](https://github.com/teslaeco/WORLDIFACT/pull/152) | open draft | research: Gemma Forge Agent starter — no-spend tooling, not a trained agent |
| [#153](https://github.com/teslaeco/WORLDIFACT/pull/153) | merged | Restore real Astra/Blender character routing with guarded four-view generation |
| [#154](https://github.com/teslaeco/WORLDIFACT/pull/154) | merged | Record verified PR153 detailed Studio deployment and remaining quality limits |
| [#155](https://github.com/teslaeco/WORLDIFACT/pull/155) | open draft | Diagnose failed Astra generation without another paid attempt |
| [#156](https://github.com/teslaeco/WORLDIFACT/pull/156) | merged | Repair Astra completed-cache accounting while preserving all payment settings |
| [#157](https://github.com/teslaeco/WORLDIFACT/pull/157) | merged | Add the generated TerraformingPlanet Astra heroine to the shared world |
| [#158](https://github.com/teslaeco/WORLDIFACT/pull/158) | merged | Record deployed TerraformingPlanet Astra heroine release |
| [#159](https://github.com/teslaeco/WORLDIFACT/pull/159) | merged | Add rollback-safe Oracle installer for 15-minute Astra request timeout |
| [#160](https://github.com/teslaeco/WORLDIFACT/pull/160) | merged | Fix timeout900 installer for current cache-accounting policy |
| [#161](https://github.com/teslaeco/WORLDIFACT/pull/161) | merged | Fix timeout900 guard receipt update and rollback |
| [#162](https://github.com/teslaeco/WORLDIFACT/pull/162) | closed unmerged | Record verified Oracle Astra 900s timeout installation |
| [#163](https://github.com/teslaeco/WORLDIFACT/pull/163) | open | Stop Studio jobs from hanging forever after recovery failures |
| [#164](https://github.com/teslaeco/WORLDIFACT/pull/164) | merged | Repair stuck Studio recovery without duplicate Astra charges |
| [#165](https://github.com/teslaeco/WORLDIFACT/pull/165) | merged | Record deployed stuck Studio receipt recovery |
| [#166](https://github.com/teslaeco/WORLDIFACT/pull/166) | merged | Keep Game Lab model library synced with newly generated GLBs |
| [#167](https://github.com/teslaeco/WORLDIFACT/pull/167) | merged | Reject flat-photo cabinet outputs and strengthen reference characters |
| [#168](https://github.com/teslaeco/WORLDIFACT/pull/168) | open | Record deployed Game Lab library and reference-detail release |
| [#169](https://github.com/teslaeco/WORLDIFACT/pull/169) | merged | Make paid Astra Studio jobs durable across resets and hold points until success |
| [#170](https://github.com/teslaeco/WORLDIFACT/pull/170) | open draft | feat: connect optional Dots with scoped WORLDIFACT OAuth |
| [#171](https://github.com/teslaeco/WORLDIFACT/pull/171) | merged | Fix generated models not adding to AI Game Lab |
| [#172](https://github.com/teslaeco/WORLDIFACT/pull/172) | merged | Complete procedural model archives and preserve worlds before Shop navigation |
| [#173](https://github.com/teslaeco/WORLDIFACT/pull/173) | merged | Preserve Studio failure reasons and recover temporary model download errors |
| [#174](https://github.com/teslaeco/WORLDIFACT/pull/174) | merged | Upload Studio references once and fence interrupted submissions safely |
| [#175](https://github.com/teslaeco/WORLDIFACT/pull/175) | merged | Repair incomplete reference-model execution and bounded completion |
| [#176](https://github.com/teslaeco/WORLDIFACT/pull/176) | open draft | Inspect unconfirmed model-runtime installation without changes |
| [#177](https://github.com/teslaeco/WORLDIFACT/pull/177) | merged | Preserve reviewed direct-export compatibility during completion repair |
| [#178](https://github.com/teslaeco/WORLDIFACT/pull/178) | merged | Prepare generic single-attempt model verification |
| [#179](https://github.com/teslaeco/WORLDIFACT/pull/179) | open draft | Prepare read-only download of verified test models |
| [#180](https://github.com/teslaeco/WORLDIFACT/pull/180) | open draft | Provide readable read-only failed-test diagnostics |
| [#181](https://github.com/teslaeco/WORLDIFACT/pull/181) | merged | Reduce cabinet prebuild context within unchanged budgets |
| [#182](https://github.com/teslaeco/WORLDIFACT/pull/182) | merged | Explain account admission refusals without changing allowances |
| [#183](https://github.com/teslaeco/WORLDIFACT/pull/183) | merged | Add inert account-bound single-job Astra support allowance |
| [#184](https://github.com/teslaeco/WORLDIFACT/pull/184) | merged | Fix account-gated generation, interrupted recovery and model downloads |
| [#185](https://github.com/teslaeco/WORLDIFACT/pull/185) | merged | Preserve exact Terrace Tower and prevent shared-world startup resets |
| [#186](https://github.com/teslaeco/WORLDIFACT/pull/186) | merged | Fence late generation dispatch and recover the same paid blueprint request |
| [#187](https://github.com/teslaeco/WORLDIFACT/pull/187) | merged | Expose read-only evidence of the reviewed export helper |
| [#188](https://github.com/teslaeco/WORLDIFACT/pull/188) | open draft | Draft lifecycle-safe optional export recovery |
| [#189](https://github.com/teslaeco/WORLDIFACT/pull/189) | merged | Compact STANDARD context with fenced runtime maintenance |
| [#190](https://github.com/teslaeco/WORLDIFACT/pull/190) | merged | Add an isolated one-attempt Studio support grant |
| [#191](https://github.com/teslaeco/WORLDIFACT/pull/191) | merged | Bound explicit maintenance consent to one cancelled job |
| [#192](https://github.com/teslaeco/WORLDIFACT/pull/192) | merged | Verify typed systemd hooks and implicit user slice |
| [#193](https://github.com/teslaeco/WORLDIFACT/pull/193) | merged | Fix unused Studio funding reservations and mobile generation recovery |
| [#194](https://github.com/teslaeco/WORLDIFACT/pull/194) | merged | Restore proven unused Studio funding without increasing generation costs |
| [#195](https://github.com/teslaeco/WORLDIFACT/pull/195) | merged | Fix Studio pricing: 250 points / $2 and explicit 500 points / $4 |
| [#196](https://github.com/teslaeco/WORLDIFACT/pull/196) | merged | Fix Oracle maintenance rejection of proven journal output |
| [#197](https://github.com/teslaeco/WORLDIFACT/pull/197) | merged | Restore the isolated jobs schema before cabinet verification |
| [#198](https://github.com/teslaeco/WORLDIFACT/pull/198) | merged | Record the owner's confirmed Oracle pricing activation |
| [#199](https://github.com/teslaeco/WORLDIFACT/pull/199) | merged | Restore shared generation availability and safe account funding recovery |
| [#200](https://github.com/teslaeco/WORLDIFACT/pull/200) | merged | Make generation funding checks actionable and recover verified Blueprint reservations |
| [#201](https://github.com/teslaeco/WORLDIFACT/pull/201) | merged | Synchronize paid Pro upgrades and remove Creator generation quota |
| [#203](https://github.com/teslaeco/WORLDIFACT/pull/203) | merged | Allow Astra generation across plans and isolate dots review connector |
| [#204](https://github.com/teslaeco/WORLDIFACT/pull/204) | open draft | Draft: restore October 2 production snapshot after runtime compatibility checks |
| [#205](https://github.com/teslaeco/WORLDIFACT/pull/205) | merged | Restore the original Astra budget without downgrading saved jobs |
| [#206](https://github.com/teslaeco/WORLDIFACT/pull/206) | open draft | Add fixed-schema Studio diagnostics and require legacy `STUDIO_NEW_JOB_POLICY` for detailed restore |
| [#207](https://github.com/teslaeco/WORLDIFACT/pull/207) | open draft | Restore legacy USD1.75 Studio policy, add fixed lifecycle diagnostics and post-deploy checks |
| [#208](https://github.com/teslaeco/WORLDIFACT/pull/208) | merged | Restore safe Astra Studio admission and trace Oracle dispatch |
| [#209](https://github.com/teslaeco/WORLDIFACT/pull/209) | open draft | Update generation recovery audit with verified deployment evidence |
| [#210](https://github.com/teslaeco/WORLDIFACT/pull/210) | merged | Preserve Studio recovery and complete generation diagnostics |
| [#211](https://github.com/teslaeco/WORLDIFACT/pull/211) | merged | Restore compact model controls and add read-only funding inspection |
| [#212](https://github.com/teslaeco/WORLDIFACT/pull/212) | open draft | Preserve Shop drafts across reloads without changing generation budgets |
| [#213](https://github.com/teslaeco/WORLDIFACT/pull/213) | merged | Keep generation availability checks read-only |
| [#214](https://github.com/teslaeco/WORLDIFACT/pull/214) | open draft | Restore STANDARD context compaction on the installed pricing runtime |
| [#215](https://github.com/teslaeco/WORLDIFACT/pull/215) | merged | Add one fixed MCC support attempt after the runtime repair |
| [#216](https://github.com/teslaeco/WORLDIFACT/pull/216) | merged | Show completed Studio models in the private account library |
| [#217](https://github.com/teslaeco/WORLDIFACT/pull/217) | merged | Add one immutable project-funded Studio attempt |
| [#218](https://github.com/teslaeco/WORLDIFACT/pull/218) | merged | Clarify industrial cabinet instructions and saved Studio attempts |
| [#219](https://github.com/teslaeco/WORLDIFACT/pull/219) | merged | Repair generator progress, Sol compatibility and failed usage settlement |
| [#220](https://github.com/teslaeco/WORLDIFACT/pull/220) | merged | Add an owner-only test panel with a fixed USD4 aggregate ceiling |
| [#221](https://github.com/teslaeco/WORLDIFACT/pull/221) | merged | Bind browser test requests and expose safe status diagnostics |
| [#222](https://github.com/teslaeco/WORLDIFACT/pull/222) | merged | Use the existing bounded test pool in ordinary Shop |
| [#223](https://github.com/teslaeco/WORLDIFACT/pull/223) | merged | Keep original model previews visible without WebGL |
| [#224](https://github.com/teslaeco/WORLDIFACT/pull/224) | closed unmerged | DRAFT: Restore MCC publication snapshot of 29 September 2026 |
| [#225](https://github.com/teslaeco/WORLDIFACT/pull/225) | merged | Restore MCC-era interface with current account and model compatibility |
| [#226](https://github.com/teslaeco/WORLDIFACT/pull/226) | open draft | Restore full September 29 MCC source with reversible state isolation |
| [#227](https://github.com/teslaeco/WORLDIFACT/pull/227) | merged | Fix paid subscription upgrade settlement without changing generation limits |
| [#228](https://github.com/teslaeco/WORLDIFACT/pull/228) | merged | Add owned-account read-only purchase evidence and preserve safe deployment |
| [#229](https://github.com/teslaeco/WORLDIFACT/pull/229) | merged | Add single-use owner-approved reserve adjustment |
| [#230](https://github.com/teslaeco/WORLDIFACT/pull/230) | merged | Preview dense GLBs within bounded software render budgets |
| [#231](https://github.com/teslaeco/WORLDIFACT/pull/231) | merged | Admit paid members by held points with safe versioned settlement |
| [#232](https://github.com/teslaeco/WORLDIFACT/pull/232) | merged | Reduce repeated STANDARD model context with guarded helper-only maintenance |
| [#233](https://github.com/teslaeco/WORLDIFACT/pull/233) | merged | Integrate AI Shop redesign and public 3D gallery with preserving release guards |
| [#234](https://github.com/teslaeco/WORLDIFACT/pull/234) | merged | Build and assess STANDARD models within the existing budget |
| [#235](https://github.com/teslaeco/WORLDIFACT/pull/235) | merged | Preserve Ollama native-library aliases during construction maintenance |
| [#236](https://github.com/teslaeco/WORLDIFACT/pull/236) | merged | Recognize official ggml ARM native libraries during maintenance |
| [#237](https://github.com/teslaeco/WORLDIFACT/pull/237) | merged | Initialize clean database state for cabinet verification |
| [#238](https://github.com/teslaeco/WORLDIFACT/pull/238) | merged | Accept documented reasoning metadata before model construction |
| [#239](https://github.com/teslaeco/WORLDIFACT/pull/239) | merged | Add restricted Oracle status and pinned maintenance access |
| [#240](https://github.com/teslaeco/WORLDIFACT/pull/240) | merged | Restore decryptable Oracle diagnostic evidence |
| [#241](https://github.com/teslaeco/WORLDIFACT/pull/241) | merged | Accept ASCII padding around Oracle maintenance keys |
| [#242](https://github.com/teslaeco/WORLDIFACT/pull/242) | merged | Complete typed STANDARD plans with a bounded initial sandbox edit |
| [#243](https://github.com/teslaeco/WORLDIFACT/pull/243) | merged | Reuse verified host trust during the restricted maintenance refresh |
| [#244](https://github.com/teslaeco/WORLDIFACT/pull/244) | merged | Release the approved failed-generation holds without erasing provider liability |
| [#245](https://github.com/teslaeco/WORLDIFACT/pull/245) | merged | Merged Shop recovery — preserving production release verified |
| [#246](https://github.com/teslaeco/WORLDIFACT/pull/246) | merged | Prepare account-bound ADMIN generation budgets and private tester invitations (inactive) |
| [#247](https://github.com/teslaeco/WORLDIFACT/pull/247) | merged | Fix unsafe publication fallback and preserve configuration for approved ADMIN source release |
| [#248](https://github.com/teslaeco/WORLDIFACT/pull/248) | open draft | Audit promotion readiness and activate the explicitly approved private batch |
| [#249](https://github.com/teslaeco/WORLDIFACT/pull/249) | merged | Compact subscriptions, available-points counter and private promo tab |
| [#250](https://github.com/teslaeco/WORLDIFACT/pull/250) | merged | Close approved owner holds without refund; keep 190 available |
| [#251](https://github.com/teslaeco/WORLDIFACT/pull/251) | open | Repair Blender MCP framing and stop provider retries after transport loss |
| [#252](https://github.com/teslaeco/WORLDIFACT/pull/252) | merged | Enable GPT Image 2.5 generation and private image library · 25 points |
| [#253](https://github.com/teslaeco/WORLDIFACT/pull/253) | merged | Price GPT Image 2.5 at five points with safe legacy recovery |
| [#254](https://github.com/teslaeco/WORLDIFACT/pull/254) | merged | Fix Cloudflare image dispatch and recover pre-dispatch point holds |
| [#255](https://github.com/teslaeco/WORLDIFACT/pull/255) | merged | Simplify AI Shop: preview-first studio, model selection and themes |
| [#256](https://github.com/teslaeco/WORLDIFACT/pull/256) | merged | Add four references, Cosmos/Egypt themes and OBJ downloads to AI Shop |
| [#257](https://github.com/teslaeco/WORLDIFACT/pull/257) | merged | Fix readable model-preview notes in Egypt theme |
| [#258](https://github.com/teslaeco/WORLDIFACT/pull/258) | merged | Show real model thumbnails and expand the Shop library |
| [#259](https://github.com/teslaeco/WORLDIFACT/pull/259) | merged | Keep expanded model library in the active Shop theme |
| [#260](https://github.com/teslaeco/WORLDIFACT/pull/260) | merged | Correct model readback contract and expose budget failure causes |
| [#261](https://github.com/teslaeco/WORLDIFACT/pull/261) | merged | Fix oversized reference instructions before point reservations |
| [#262](https://github.com/teslaeco/WORLDIFACT/pull/262) | merged | Validate generated downloads and correct eighteen-face preview geometry |
| [#263](https://github.com/teslaeco/WORLDIFACT/pull/263) | merged | Protect Studio submission lifetime and correct false character reference profiles |
| [#264](https://github.com/teslaeco/WORLDIFACT/pull/264) | merged | Protect point reservation through Oracle submission and expose actual progress |
| [#265](https://github.com/teslaeco/WORLDIFACT/pull/265) | merged | Require tool execution for unfinished supervised Oracle models |
| [#266](https://github.com/teslaeco/WORLDIFACT/pull/266) | merged | Use uploaded files as references in the existing Astra generator |
