# 15 October 2026 — Screenshot cleanup: implemented and integrated; final browser gate pending

## Implemented changes

[WORLDIFACT PR #296](https://github.com/teslaeco/WORLDIFACT/pull/296) removes the duplicate plain six-card grid and the complete large Product Hunt section, badges and comment iframe. One LED navigation, the resource strip, its small Product Hunt link and the ISS petition remain.

`/chess` directly enters `/apps/chess/index.html` on the same origin. The disposable portal route is replaced, with no launch click, board preview, generator or nested WebGL iframe. The actual game account/guest welcome and shared-identity checks remain. Entry navigation is separate from the no-reload return to the game's own menu.

[Cube Chess PR #144](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/144), pinned at `8fe8bcd27f7e718a59d94e09db9e71f42c3347e1`, adds explicit Exit to menu controls and confirmation. Cancel retains the current match. Confirmation closes that match and temporary panels without replacing the document/renderer or deleting identity, preferences or saved games. Match-scoped AI/autosave callbacks are invalidated. The guest-readiness observer is disconnected before changing observed attributes. About is new chess-first English/Polish content: eight 8×8 boards, 512 squares, Terraforming Planet's work and upcoming updates, not a claimed app-store launch.

## VERIFIED integration

[Verify WORLDIFACT 38696763359](https://github.com/teslaeco/WORLDIFACT/actions/runs/38696763359), job `116295036838`, completed **SUCCESS** on `cbb7d11baf402b40206906045e6156b73cf58811`: original full verify, foundation assembly with the new game, Worker dry-run and GET-only hosted Studio inspection. The four safety workflows also passed. That pin was Chess `5d088596ec4c36401e6fdc21f0e23de0afdb0821`; subsequent Chess changes only correct browser-test configuration, not game runtime. Final-pin CI is rerun, not assumed.

The earlier Vite `.vite-temp` EPERM was fixed in the route fixture by directly importing the real checked-in Vite config with `configFile:false`. The React plugin and all auth, private-world, other-portal and no-network assertions remain. The temporary diagnostic workflow is removed. Protected original CI and release guards are unchanged.

## VERIFIED browser progress, not a complete PASS

[Production-build browser run 38696939320](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38696939320), job `116295621429`, completed **5/6 passed** on Chess `fa84487cb5a627f6e17fe8a4ec23e7442ee254e4`:

- Mobile Chromium: cancel/confirm, saved-game retention, unchanged document and three consecutive start/exit cycles passed.
- Both desktop and mobile: English/Polish About and direct guest entry passed.
- Desktop's long repeat test passed its initial cancel, confirm, save and no-reload assertions, then exhausted the total 90-second test budget at the additional repeat's start button. The overall browser workflow remained FAILED, not green.

The final test-only follow-up budgets 180 seconds for that complete three-match software-rendered stress sequence while imposing a stricter **30-second maximum for each action/navigation**. Other tests keep their 90-second budget; no assertions, repetitions, actual game geometry or native confirmations were removed. Zero retries and blocked external provider requests remain. This is not a physical-device performance certification. The final result is pending until the new run completes.

## GO / NO-GO

Publication remains NO-GO pending final-pin CI, the complete desktop/mobile browser result and owner merge/publication authorization. No merge, deployment, paid generation, billing change or secret synchronization occurred. Real Android/iOS hardware, account sign-in and live multiplayer are not certified by these guest checks.

Production remains `c82c6abe246996630b1d751a40dcf769181089f5`, Cloudflare version `630e387c-15d8-42b6-848d-bacf32e2b697`. Complete prior status is preserved byte-for-byte in [the pre-cleanup snapshot](CONTEST_STATUS.before-ui-cleanup-20261015.md), original blob `1a50b6a47d107fd9fef81625ae7a8d4b1704f7d9`. This cleanup is not yet LIVE.
