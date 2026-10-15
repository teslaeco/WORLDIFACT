# 15 October 2026 — Screenshot cleanup: implemented; desktop repeat blocks publication

## Implemented changes

[WORLDIFACT PR #296](https://github.com/teslaeco/WORLDIFACT/pull/296) removes the duplicate plain six-card grid and the entire large Product Hunt section, badges and comment iframe. One LED navigation, the compact resource strip, its small Product Hunt link and the ISS petition remain.

`/chess` directly enters the actual same-origin `/apps/chess/index.html` game welcome. The disposable route is replaced without a launch click, board preview, blueprint generator or nested mobile WebGL frame. Existing account/guest choices and shared-identity guards remain. Entry navigation is separate from the game's in-document return to menu.

[Cube Chess PR #144](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/144), pinned at `8fe8bcd27f7e718a59d94e09db9e71f42c3347e1`, implements confirmed Exit to menu. Cancel retains the current match. Confirmation closes it and temporary panels, preserving saved games, identity and preferences without replacing the document/renderer. Session guards invalidate late AI/autosave work. The guest-readiness observer disconnects before writing observed attributes. About is new English/Polish chess-first copy: eight 8×8 boards, 512 squares, Terraforming Planet's work and upcoming updates; it does not claim an app-store launch.

## VERIFIED exact-source integration

All five WORLDIFACT workflows passed on application candidate `abe4e372856ffb836129a2e6760ac836c2495efe`. [Verify run 38697982288](https://github.com/teslaeco/WORLDIFACT/actions/runs/38697982288), job `116299007411`, completed SUCCESS: original full verify, final pinned chess foundation assembly, Worker deployment dry-run and GET-only hosted Studio inspection. Four safety workflows also passed. This documentation-only follow-up does not change that application source or pin; its own CI status must not be inferred from the parent.

Chess's original test/build [run 38697852036](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38697852036) succeeded on the pinned commit. PR build success is not publication.

The route fixture's prior Vite temporary-config EPERM was resolved by importing the real checked-in configuration with `configFile:false`. React, auth, private-world, other-portal and no-network assertions remain. The temporary diagnostic workflow was removed. Protected original CI and deployment guards were not changed.

## Final browser result: 5/6 PASS; release BLOCKED

[Browser run 38697852085](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38697852085), job `116298579090`, finished FAILED at `2026-10-15T07:23:39Z`, with 5 tests passed and 1 failed, on exact Chess head `8fe8bcd27f7e718a59d94e09db9e71f42c3347e1`.

VERIFIED in mobile Chromium emulation: cancel preserves the match; confirm returns to menu; previously saved games remain; no document navigation occurs; three start/exit cycles complete. Both desktop and mobile passed English/Polish About and direct guest entry.

BLOCKED: desktop's repeat sequence passed the initial cancel/confirm/save/no-reload assertions, but the subsequent `start-game` click exceeded its 30-second action deadline at `e2e/menu-return.spec.js:61`. Playwright was waiting for the button to be visible, enabled and stable. Extending the whole sequence to 180 seconds did not resolve that action failure. The cause is NOT established; do not attribute it solely to CI slowness or call the interaction stable. Next diagnosis must inspect the repeated menu's state, layout stability and rendering lifecycle, not simply increase timeouts again. The snapshot and failure are in the linked job log.

The suite used the real production game and software WebGL, zero retries, all original assertions/repetitions, and blocked non-local provider requests. Emulated Chromium is not physical Android/iOS acceptance, real account sign-in or live multiplayer verification.

## GO / NO-GO

NO-GO for publishing this combined update until the desktop repeat issue is resolved, the full browser suite succeeds, and the owner authorizes merge/publication. Both PRs remain drafts. No merge, production deployment, paid generation, billing mutation or secret synchronization occurred.

Production remains release `c82c6abe246996630b1d751a40dcf769181089f5`, Cloudflare version `630e387c-15d8-42b6-848d-bacf32e2b697`. Complete previous status remains byte-for-byte in [the pre-cleanup snapshot](CONTEST_STATUS.before-ui-cleanup-20261015.md), original blob `1a50b6a47d107fd9fef81625ae7a8d4b1704f7d9`. These cleanup changes are NOT LIVE.
