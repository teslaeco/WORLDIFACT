# 15 October 2026 — Single Chess menu and native unload protection: merged, preserving release pending

## VERIFIED source and merge
- [Cube Chess PR #146](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/146) merged as `3658ed1c5c1f83fe417f7a59218b8a439090cf0e`. Exact tested source `8f519bc37dd850dc886cbbaab02e0bcc0320f07e` passed the original game tests/build and [desktop+mobile browser menu/navigation matrix #38719645010](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38719645010), both browser jobs SUCCESS. The tests confirmed exactly one in-game Exit control, a native beforeunload prompt during a real reload, cancel preserving the match, and no prompt after confirmed in-document exit. They also cover the existing game menu, About and premium HUD layout.
- [WORLDIFACT PR #301](https://github.com/teslaeco/WORLDIFACT/pull/301) merged as `d514699367675ad83e11d117688ae345567ab30d`, pinning the exact reviewed Chess source. [Verify WORLDIFACT #38719688102](https://github.com/teslaeco/WORLDIFACT/actions/runs/38719688102) and the four independent safety workflows all passed: full `npm run verify`, pinned Chess/Terra foundation assembly, Wrangler dry-run and read-only Studio inspection.

## User-requested behavior
- During a real Chess game the original small Menu control is hidden/disabled, so the top bar has only one visible **Exit to menu**. A literal escaped newline in the hide rule was diagnosed using failed [browser run #38718051008](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38718051008), and fixed before the successful desktop/mobile rerun. The start/demo menu remains available.
- The existing Exit action still confirms loss of the current unfinished match without reloading. Saved games, profile, AI constraints, credits and 3D models are unchanged.
- Browsers receive a standards-based `beforeunload` request for a real active/paused/finished match when the user refreshes, enters another address or closes the tab. No warning is requested for the demo or after a deliberate in-app Exit. Browsers choose the wording and can skip prompts on some mobile app terminations; this is not automatic saving.
- No paid generation, backend modifications, subscription, billing, secret synchronization or Oracle restart occurred.

## Production release gate
**PENDING / NOT YET LIVE in this status snapshot:** One-use `.github/workflows/single-chess-exit-release-once.yml` is armed by `ops/SINGLE_CHESS_EXIT_RELEASE_20261015.json`. Its strict parent and exact-four-file allowlist restrict the published change to this already merged, reviewed release. It reruns the original full verify/foundations and Wrangler dry-run, deploys the existing reviewed preserving config with `--keep-vars`, and requires an actual Cloudflare receipt, matching 12 HTML routes and all public asset bytes/MIME, Chess unload/single-menu JS+CSS markers and a read-only Studio READY check before declaring LIVE.

Prior confirmed LIVE Cloudflare version is `dbd875c7-26d5-42c5-b6d9-bbe3f48708e8` until the new release completes. Physical Android and signed-in account testing remain UNKNOWN.

## Preserved previous status
Prior status is stored byte-for-byte in [CONTEST_STATUS.before-single-chess-exit-20261015.md](CONTEST_STATUS.before-single-chess-exit-20261015.md), original blob `ab5f26d4c64863ec3b68296cbcc139070d14f11f`. Earlier published status claims are historical and not proof that this specific bug fix is already live.
