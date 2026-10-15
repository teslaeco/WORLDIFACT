# 15 October 2026 — Cube Chess menu cleanup: merged, preserving publication pending

## VERIFIED: reviewed source and merges
- [Cube Chess PR #144](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/144) merged as `9cc93241e9e2ef1c3bd0de3afdc165bd996c890b` from tested source `63cec61eaf930f337bbf5e77b3c787f9b7711554`. The exact source passed [original Chess test/build #38701520956](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38701520956) and [desktop/mobile menu regression #38701520889](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38701520889): SUCCESS. The former desktop repeat issue was addressed by returning to a static menu rather than restarting the expensive attract/demo animation.
- [WORLDIFACT PR #296](https://github.com/teslaeco/WORLDIFACT/pull/296) merged as `4560ff82050a79cedda91975a5b1e0c030541286`; pinned Chess source is the exact tested `63cec61eaf930f337bbf5e77b3c787f9b7711554`. The final pinned [WORLDIFACT Verify #38701793675](https://github.com/teslaeco/WORLDIFACT/actions/runs/38701793675) completed SUCCESS, including full `npm run verify`, foundations, Worker dry-run and GET-only Studio inspection. Four independent safety workflows also succeeded.
- The user authorized production publication on this date after green tests.

## Reviewed UI scope
- One six-destination neon portal navigation remains; duplicate old six-card grid and large Product Hunt panel/embeds are removed. The compact resource strip, ISS petition and small independent Product Hunt resource link remain.
- /chess opens the actual same-origin Cube Chess entry directly, without preview/launcher/iframe or a generation form. The real login/guest flow stays.
- Within the game, Exit to menu confirms destructive exit and preserves saved games, identity and preferences; Cancel keeps the current match; return to menu does not reload. Polish/English About now describes 8×8×8 / 512 squares and upcoming tested updates.
- No provider generation, billing modification, Oracle operation or secret sync was performed as part of these source merges.

## Production deployment gate
**PENDING / not yet LIVE in this milestone:** a new one-use workflow `.github/workflows/chess-cleanup-release-once.yml` is armed by `ops/CHESS_MENU_CLEANUP_RELEASE_20261015.json`. The exact-parent guard requires base 4560ff82050a79cedda91975a5b1e0c030541286, owner-reviewed PR source SHA, exact release-only file changes and the Chess foundation pin. The workflow reruns original verify/foundations and Wrangler dry-run, deploys only with the existing reviewed preserving configuration and `--keep-vars`, suppresses potentially private Wrangler CLI output and performs exact deployed-asset SHA/MIME checks plus public Studio health checks. A successful GitHub Cloudflare receipt and byte-level verification must be recorded before marking this release LIVE.

The historical one-time Cloudflare workflow may separately fail closed on its legacy scope gate. Do not conflate that with this preserving release. Physical Android/iOS hardware, actual login and multiplayer remain unverified by desktop/mobile Chromium emulation.

## History
Earlier detailed status is preserved byte-for-byte in `docs/CONTEST_STATUS.before-chess-release-20261015.md` (blob `286c20d9c76d363d34e1985b7a97446b0f85814d`). The preceding public six-portal release was Cloudflare version `630e387c-15d8-42b6-848d-bacf32e2b697`; it is not evidence that the current cleanup is LIVE.
