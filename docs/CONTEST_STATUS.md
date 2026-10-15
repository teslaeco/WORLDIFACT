# 15 October 2026 — Screenshot-driven cleanup: integrated review candidate

## Implemented, not yet published

[WORLDIFACT PR #296](https://github.com/teslaeco/WORLDIFACT/pull/296) removes the duplicate plain six-card navigation and the large Product Hunt block, badges and comment iframe. The single LED navigation, compact resource strip, small Product Hunt resource link and ISS petition remain.

`/chess` immediately replaces the disposable portal route with the real same-origin `/apps/chess/index.html` game. No intermediate preview, launch click, blueprint generator or nested mobile WebGL frame. The real account/guest welcome and shared-identity checks remain. This entry navigation is distinct from the game's no-reload Exit to menu.

The candidate pins [Cube Chess PR #144](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/144) at `5d088596ec4c36401e6fdc21f0e23de0afdb0821`: confirmation before returning to menu, saved-game/identity preservation, cancelled stale AI/autosave work, fixed guest-readiness observer and new chess-first English/Polish About copy. The pin is an integration candidate, not a claim of completed browser acceptance.

## Test evidence and repairs

At WORLDIFACT `5a8c4feef8b3ba11289681aaf2060ce4b99fab5f`, the read-only diagnostic workflow passed the unchanged full verification. The separate main Verify run [38695510306](https://github.com/teslaeco/WORLDIFACT/actions/runs/38695510306) failed one of 2314 tests on an EPERM creating Vite's shared `.vite-temp` configuration directory. The routing fixture now imports the actual checked-in Vite configuration directly and sets `configFile:false`, eliminating that temporary configuration bundle without bypassing the React plugin or route assertions. The temporary diagnostics workflow has been removed; protected original CI is unchanged.

Earlier six stale test expectations were repaired: five harness imports now load the real ChessPage; the removed Product Hunt embeds are required absent. Account, private-world, Shop, Planets, ISS, Terra, no-network and no-nested-chess-frame protections are retained. New tests execute the actual direct-entry effect and StrictMode replay.

At Chess `1cadf504cc4928903dd7186ec1ce033f50eb262e`, the original Pages test/build job passed with publication skipped. Browser run [38694910568](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38694910568) passed mobile About and direct guest entry, but four other cases timed out. The new browser fixture uses the built game with explicit software WebGL on GPU-less CI, unchanged geometry/assertions/timeouts, no video-capture contention and no external provider calls. Results for the new candidate remain pending.

## GO / NO-GO

NO-GO for publication until the integrated Verify/foundations/Worker dry-run and both desktop/mobile browser cases pass, followed by owner authorization. No merge, production deployment, paid generation, billing change or secret synchronization has occurred. Physical Android/iOS, real sign-in and live multiplayer remain unverified.

Production is still the prior six-portal release `c82c6abe246996630b1d751a40dcf769181089f5`, Cloudflare version `630e387c-15d8-42b6-848d-bacf32e2b697`. Complete previous evidence is preserved byte-for-byte in [the pre-cleanup snapshot](CONTEST_STATUS.before-ui-cleanup-20261015.md), original blob `1a50b6a47d107fd9fef81625ae7a8d4b1704f7d9`. Prior LIVE claims are not verification of this candidate.
