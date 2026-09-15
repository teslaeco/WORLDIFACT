# Existing WORLDIFACT foundations — 15 September 2026

The owner corrected the direction: preserve the green meadow and flowing river, water-surface portals, analogue phone joystick and existing applications. Do not replace working projects with invented previews. No paid generations are authorized in this continuation.

## Public addresses and reuse

Canonical origin: https://worldifact.xodobrox.workers.dev

| Address | Existing foundation | Integration in this change |
|---|---|---|
| `/chess` | [Chess Cube 512 AI](https://teslaeco.github.io/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/) | Pinned original engine, guest entry, models and assets built into `/apps/chess/`. Original Supabase login configuration is not transferred; use the original for account features |
| `/chess/shop` | Existing FORGE shop | Shop tab alongside the original chess game. Direct board/piece transfer, automatic catalog publishing and ordering remain unfinished |
| `/iss` | [Fix ISS](https://fix-iss-repair-game.terraformingplanet.chatgpt.site/) | Existing astronaut, interior, NASA exterior, eight repairs, equipment, save/load and controls copied into `/apps/iss/`; Terra computer added in first module |
| `/terra` | [Polar Sun Moon Analysis](https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/) | Pinned original frontend and public evidence copied into `/apps/terra/`. Original observation/evidence endpoints retain their own access/CORS rules; this does not migrate their backend |
| `/planets` | [FORGE World Builder](https://forge-world-builder.terraformingplanet.chatgpt.site/) | Public original connected in a frame with an explicit original-page fallback. Source is recovered, but owner identity, D1/R2 and Oracle connection have not been migrated. The source is a world builder, not proof of eight completed platform levels |
| `/shop` | [FORGE Studio Public](https://forge-studio-public.terraformingplanet.chatgpt.site/) | Public original connected; full source/archive recovery blocked |
| `/lab` | [Froge MPC 2 Studio](https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/) | Public original connected; full source/archive recovery blocked. Existing private GitHub source is older than published Site v47 and is not used to downgrade it |
| `/builder`, `/make` | Existing local WORLDIFACT scene editor and manufacturing workbench | Preserved as additional tools, not substitutes for the owner's existing studio/shop |

The old `/portal/<id>` addresses redirect to the corresponding new routes. Every wrapper has a return to WORLDIFACT and an original-app link. A frame load event is not proof that the source app successfully rendered or authenticated.

The owner explicitly requested public access. Fix ISS, FORGE World Builder and Froge MPC 2 audience settings were changed from restricted to public through the native Sites tool. FORGE shop was already public. These changes do not remove server-side per-owner authentication.

## Source and build preservation

- ISS original source: `293007c888dabef4274fcff3fa810b5ed71eb455`. The seven existing application files are preserved with targeted computer integration; 14 vendor/model files are hydrated byte-for-byte using `config/foundation-assets.json` (size + SHA-256 checks).
- Chess: `e134964e9c8b7edc43c26b508973f6fb658af90d`; Terra: `ae90f7367587e0973782c470cde3f5103c0540fc`. Workflow checkouts and the assembly script both enforce these revisions. Lockfiles, original build systems, asset trees and MIT licenses are retained. Terra's large research raw files are excluded from the static release; its published evidence and original frontend remain available.
- FORGE World Builder recovered source: `6f5f239239f05e72b029cc1014e982a587a2ece5`. Owner-scoped D1/R2 storage and encrypted Oracle credentials cannot be migrated by copying its frontend.
- Shop latest published source metadata: `fe05d7400b64fefd44736863d870174b5c00280e` (Site v3); Froge studio: `e3d60697db43744f6c09157328560c66a031f9a2` (Site v47). Their source Git services returned HTTP 500; the archive service separately refused access with “Library file ownership could not be verified.” No alternate archive bypass was attempted.
- Do not call the three connected Sites fully copied or self-hosted. Completing their migration requires an authorized source export plus an explicit identity/storage migration, preserving existing archives and Oracle pairing.

## Meadow and computer behavior

Green ground, foreground trees and the bridge are restored. Water is constrained to the river channel, tributary and the Game Lab pool behind the shop; animated UV movement provides visible current. Existing panorama, lighting and capped reflection targets are reused. No image or paid model generation ran. Distant panorama mountains remain imagery; foreground models retain their existing geometry.

From the ISS first module, select the Terra navigation goal, approach the physical console, and use E or the mobile action button. The computer opens the original Terra Earth-observation interface with a Nile mission brief, source/date/cloud-cover requirements, a station return button and a WORLDIFACT return link. The station stays mounted and pauses simulation/rendering, preserving eight-repair progress on close. Leaving the entire portal still uses the original manual Save/Load JSON workflow. This is not an automatically completed Nile analysis or a claim that suitable imagery exists for every requested date.

## Oracle decision

The project already has an Oracle-based Blender service and existing studio pairing logic. Keep that service and its per-owner encrypted connection. WORLDIFACT's public hub and static game copies do not require a new Oracle VM. A new WORLDIFACT backend connection requires reviewing the current endpoint, authenticated ownership, encrypted credential storage and storage migration. No existing connection was reset, no key was extracted and no Oracle/Blender job was started. Pairing and generation in the original Sites retain their original access rules.

## Verification boundaries

Local verification and CI are recorded in this change's pull request. The release checks compare the actual hub HTML/assets and the copied games' HTML, JavaScript, CSS, WASM and GLB bytes with the assembled build; a hub SPA fallback cannot pass as a copied game. Build/HTTP success does not verify gameplay in a browser.

Actual desktop/WebGL/Android appearance, iframe authentication, shader compilation, multi-touch and FPS remain unverified because the recorded browser approval block still applies. Do not use another browser, CDP, headless CI or an alternate preview to bypass it. The owner's screenshots document the earlier visual regression, not this change's visual acceptance.
