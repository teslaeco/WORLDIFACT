# 15 October 2026 — Premium compact Cube Chess HUD: MERGED, RELEASE PENDING

## VERIFIED implementation and tests

- [Cube Chess PR #145](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/145) merged as `7e01a4f1e870ef56b772e2ff99544f4b3f4192a8`. Its exact tested source `ebed7d71cff931c50b9d88734279098fbe82baca` passes the original Cube Chess build/test workflow and [desktop/mobile Playwright menu + premium HUD layout tests](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38712501745). No browser screen capture is misrepresented as a physical Android test.
- [WORLDIFACT PR #300](https://github.com/teslaeco/WORLDIFACT/pull/300) merged as `8b14fdc9ae708fb5a03bfb2a51a1ad3ce6bd760d`, pinning the exact reviewed Chess source. [Verify WORLDIFACT #38712650090](https://github.com/teslaeco/WORLDIFACT/actions/runs/38712650090) and four other independent review jobs passed: full verify, pinned Chess/Terra foundation assembly, Wrangler dry-run and hosted Studio read-only inspection.
- The actual in-game HUD now places the real profile inside the shared header grid, keeps a visible confirmed Exit to menu, shrinks the status and 8-level controls, and raises the scrollable camera bar above standalone WORLDIFACT/Shop shortcuts. Blue/green LED accents, focus indicators and high-contrast/reduced-motion styles are included. No chess rules, 3D geometry, authentication, game saves, billing or provider costs were modified.

## Safe preserving publication retry

[First release attempt #38713540253](https://github.com/teslaeco/WORLDIFACT/actions/runs/38713540253) **FAILED BEFORE DEPLOYMENT** at the unchanged full verify: **2313/2314 tests passed**, one native Chromium Studio lifecycle fixture timed out in a busy runner. Credential handling and Cloudflare publication steps were never reached. An independent [Verify #38713540422](https://github.com/teslaeco/WORLDIFACT/actions/runs/38713540422) on the **same exact release commit** succeeded, including the full verify and foundations. This is evidence of an intermittent test-run/environment timeout, not proof that Studio is broken or that the premium HUD is invalid.

The retry preserves every test unchanged and tightens the one-use exact file/parent scope for the new attempt. It does not disable or bypass the native Chromium check.

## Publication gate — not yet LIVE in this record

The user authorized implementation and publication in this conversation. The updated exact-parent, exact-file one-use release workflow `.github/workflows/premium-chess-hud-release-once.yml` is paired with `ops/PREMIUM_CHESS_HUD_RELEASE_20261015.json`. It must compare the release commit's single parent with `8b14fdc9ae708fb5a03bfb2a51a1ad3ce6bd760d`, confirm the precise three-file publication-only diff and immutable Chess pin, then run unchanged verify and foundation checks, prepare the already-reviewed preserving config with no declared vars, deploy via Wrangler `--keep-vars` and strictly verify the public HTML, every asset (hash and MIME), premium CSS markers and Studio readiness. No secret synchronization, paid generation, billing mutation or Oracle action.

**PENDING:** Actual Cloudflare version/receipt and post-release public-asset check. The previous LIVE version remains `9abf16c1-7fa6-48cd-b83a-efa32869dce5` until new evidence succeeds. Real signed-in Android and iOS visual tests remain UNKNOWN.

## Preserved history

The preceding status is preserved byte-for-byte in [CONTEST_STATUS.before-premium-hud-release-20261015.md](CONTEST_STATUS.before-premium-hud-release-20261015.md), original blob `fc4a342d43edaf1c6fafb99edded951d4309bab4`. Historical earlier releases are not evidence that the premium HUD is already public.
