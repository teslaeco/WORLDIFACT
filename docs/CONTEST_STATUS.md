# 15 October 2026 — Screenshot cleanup: integration verified, browser release gate pending

## Implemented changes

[WORLDIFACT PR #296](https://github.com/teslaeco/WORLDIFACT/pull/296) removes the duplicate plain six-card grid and the large Product Hunt block, badges and comment iframe. One LED navigation, the compact resource strip, its small Product Hunt resource link and the ISS petition remain.

`/chess` replaces the disposable portal route with the real same-origin `/apps/chess/index.html` game. There is no intermediate board preview, extra launch click, blueprint generator or nested mobile WebGL frame. The actual account/guest welcome and shared-identity checks remain. Entry navigation is distinct from the game's in-document Exit to menu.

[Cube Chess PR #144](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/144), now pinned at `fa84487cb5a627f6e17fe8a4ec23e7442ee254e4`, adds the confirmed return to menu, preservation of saved games/identity, cancellation of stale AI/autosave callbacks, a fixed guest-readiness MutationObserver and chess-first English/Polish About copy. The About text describes 8×8×8 / 512 squares, Terraforming Planet's work and upcoming updates without claiming an app-store launch.

## VERIFIED integration milestone

[Verify WORLDIFACT run 38696763359](https://github.com/teslaeco/WORLDIFACT/actions/runs/38696763359), job `116295036838`, completed **SUCCESS** on `cbb7d11baf402b40206906045e6156b73cf58811`:

- Original full `npm run verify` passed.
- Foundation assembly passed with the new game runtime.
- Worker deployment dry-run passed.
- Hosted Studio inspection passed without login or generation.
- The four separate safety workflows also passed.

That verified revision pinned Chess `5d088596ec4c36401e6fdc21f0e23de0afdb0821`. The pin in this follow-up advances only to the browser-fixture build-command correction; Chess application/runtime source is identical. Full CI is rerun on this final pin rather than assuming identical source proves identical release readiness.

## Test diagnosis and browser gate

The earlier WORLDIFACT main run failed one of 2314 tests on EPERM creating Vite's shared `.vite-temp` configuration bundle. The route fixture now imports the real checked-in Vite configuration directly with `configFile:false`; the subsequent full Verify succeeded. No route/auth/private-world assertion or React plugin was removed. The temporary diagnostic workflow is removed and the protected CI/deployment scope guards are unchanged.

The first Chess browser run after the guest-observer repair passed mobile About and direct guest entry, but four cases timed out. The fixture now tests the built game using explicit software WebGL on GPU-less CI, unchanged actual geometry/assertions/timeouts and zero retries. It blocks external provider requests and verifies cancellation, confirmation, saved-game preservation and no document reload. [Production browser run 38696939320](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38696939320) is pending at this checkpoint; no browser PASS is claimed here. The preceding setup-only run failed because the fixture used a nonexistent `build:web` script; it now invokes the repository's actual `npm run build` command.

## GO / NO-GO

NO-GO for publication until final-pin CI and desktop/mobile browser checks complete successfully and the owner authorizes merge/publication. No merge, production deployment, paid generation, billing change or secret synchronization occurred. Physical Android/iOS, real sign-in and live multiplayer remain unverified.

Production remains the prior release `c82c6abe246996630b1d751a40dcf769181089f5`, Cloudflare version `630e387c-15d8-42b6-848d-bacf32e2b697`. The complete prior status is preserved byte-for-byte in [the pre-cleanup snapshot](CONTEST_STATUS.before-ui-cleanup-20261015.md), original blob `1a50b6a47d107fd9fef81625ae7a8d4b1704f7d9`. Historical LIVE evidence is not a claim that this cleanup is published.
