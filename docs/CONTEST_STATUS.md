# 15 October 2026 — Chess navigation guard: review candidate, not published

## Requested change and scope
The owner supplied an actual Android screenshot of two adjacent header controls: Exit to menu and Menu. Cube Chess [PR #146](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/146) hides the second Menu button during an active game and removes the footer duplicate. It retains the existing in-document confirmation: Cancel keeps the game; Confirm ends the match without a page reload and preserves existing saves.

Native browser `beforeunload` now asks for browser-provided confirmation when a real local/computer/online game or finished/paused match is open, including refresh, tab close and address-bar navigation. It does not warn for the attract-mode demo or once the user has deliberately returned to the in-page menu. Browser vendors choose the message and may decline to show it in some mobile circumstances (app kill, no user activation). This is not automatic saving or a guarantee of a displayed warning.

This WORLDIFACT candidate pins Chess exact source `bd5b5684270c6bb5f097aa534fde46f7b5809f61` without changing backend, account, payments, secrets, game geometry or existing premium theme.

## Verification and release gates
- PENDING: Chess original build/tests and actual production-build Chromium desktop/mobile verification of one visible exit, native unload prompt on refresh, Cancel preserving the game, Confirm disarming the warning.
- PENDING: full WORLDIFACT verify, pinned Chess foundation, Wrangler dry-run, hosted Studio read-only inspection.
- NO-GO publication until green tests, review and authorized preserving deployment. No paid generation or backend changes.
- Signed-in physical Android and Safari behavior remain UNKNOWN. User screenshot establishes the previously duplicated controls, not the success of this patch.

## Previous production milestone (unchanged)
Previous exact PUBLIC_RELEASE_VERIFIED premium HUD: [run #38714113516](https://github.com/teslaeco/WORLDIFACT/actions/runs/38714113516), Cloudflare version `dbd875c7-26d5-42c5-b6d9-bbe3f48708e8`. Its entire historical status follows below.

---

# 15 October 2026 — Premium compact Cube Chess HUD: VERIFIED LIVE

## VERIFIED implementation and tests

- [Cube Chess PR #145](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/145) merged as `7e01a4f1e870ef56b772e2ff99544f4b3f4192a8`. Its exact tested source `ebed7d71cff931c50b9d88734279098fbe82baca` passes the original Cube Chess build/test workflow and [desktop/mobile Playwright menu + premium HUD layout tests](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38712501745). No browser screen capture is misrepresented as a physical Android test.
- [WORLDIFACT PR #300](https://github.com/teslaeco/WORLDIFACT/pull/300) merged as `8b14fdc9ae708fb5a03bfb2a51a1ad3ce6bd760d`, pinning the exact reviewed Chess source. [Verify WORLDIFACT #38712650090](https://github.com/teslaeco/WORLDIFACT/actions/runs/38712650090) and four other independent review jobs passed: full verify, pinned Chess/Terra foundation assembly, Wrangler dry-run and hosted Studio read-only inspection.
- The actual in-game HUD now places the real profile inside the shared header grid, keeps a visible confirmed Exit to menu, shrinks the status and 8-level controls, and raises the scrollable camera bar above standalone WORLDIFACT/Shop shortcuts. Blue/green LED accents, focus indicators and high-contrast/reduced-motion styles are included. No chess rules, 3D geometry, authentication, game saves, billing or provider costs were modified.

## Safe preserving publication retry

[First release attempt #38713540253](https://github.com/teslaeco/WORLDIFACT/actions/runs/38713540253) **FAILED BEFORE DEPLOYMENT** at the unchanged full verify: **2313/2314 tests passed**, one native Chromium Studio lifecycle fixture timed out in a busy runner. Credential handling and Cloudflare publication steps were never reached. An independent [Verify #38713540422](https://github.com/teslaeco/WORLDIFACT/actions/runs/38713540422) on the **same exact release commit** succeeded, including the full verify and foundations. This is evidence of an intermittent test-run/environment timeout, not proof that Studio is broken or that the premium HUD is invalid.

The retry preserves every test unchanged and tightens the one-use exact file/parent scope for the new attempt. It does not disable or bypass the native Chromium check.

## VERIFIED LIVE — public Cloudflare release

The exact-parent, source-only [premium HUD preserving release #38714113516](https://github.com/teslaeco/WORLDIFACT/actions/runs/38714113516) completed **SUCCESS** at **2026-10-15T09:38:48Z**, release commit `7f0558ed6266d8535ef2bac918f3823531e2d0d2`. Cloudflare version `dbd875c7-26d5-42c5-b6d9-bbe3f48708e8`; production https://worldifact.xodobrox.workers.dev/chess.

Post-deployment `PUBLIC_RELEASE_VERIFIED` checked **12 HTML routes, all 437 built public assets against original release bytes and MIME**, `GET /account/worlds = 200`, six WORLDIFACT portal/brand resources, and actual pinned Chess premium stylesheet markers `--premium-blue`, `--premium-green`, `exit-match-button` and `user-profile-menu`. The public Studio health remained READY with Astra, Sol, Luna. The release reran the unchanged full verify, pinned foundations and Worker dry-run before publication. No paid generation, secrets sync, billing updates or Oracle restart.

**Not verified:** Physical Android/iOS screenshots, signed-in account visual walkthrough, live multiplayer, or a fresh paid AI generation. Desktop/mobile Chromium tests support layout and menu behavior but are not physical device certification.

## Publication method and protections (completed)

The user authorized implementation and publication in this conversation. The updated exact-parent, exact-file one-use release workflow `.github/workflows/premium-chess-hud-release-once.yml` is paired with `ops/PREMIUM_CHESS_HUD_RELEASE_20261015.json`. It must compare the release commit's single parent with `8b14fdc9ae708fb5a03bfb2a51a1ad3ce6bd760d`, confirm the precise three-file publication-only diff and immutable Chess pin, then run unchanged verify and foundation checks, prepare the already-reviewed preserving config with no declared vars, deploy via Wrangler `--keep-vars` and strictly verify the public HTML, every asset (hash and MIME), premium CSS markers and Studio readiness. No secret synchronization, paid generation, billing mutation or Oracle action.

**COMPLETED:** Production receipt, full public asset and premium HUD markers are verified above. The previous LIVE version `9abf16c1-7fa6-48cd-b83a-efa32869dce5` is superseded. Real signed-in Android/iOS visual checks remain UNKNOWN.

## Preserved history

The preceding status is preserved byte-for-byte in [CONTEST_STATUS.before-premium-hud-release-20261015.md](CONTEST_STATUS.before-premium-hud-release-20261015.md), original blob `fc4a342d43edaf1c6fafb99edded951d4309bab4`. Historical earlier releases are not evidence that the premium HUD is already public.
