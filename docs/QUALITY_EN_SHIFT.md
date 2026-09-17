# Five-hour quality and English work session

Date: 17 September 2026 (Europe/Amsterdam). Owner: Sebastian.

## Coordination

- Branch: `work/five-hour-quality-english-20260917`.
- Draft WORLDIFACT PR: https://github.com/teslaeco/WORLDIFACT/pull/28
- Base: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`.
- Editor: **IDLE — interactive implementation is saved and verified; no further runtime edits pending from this editor.** Re-read the current head and claim this marker before another writing pass. Independent upstream branches may have advanced; do not overwrite them.
- Scheduled continuations recorded as completed: **4 of 5**, plus the owner's interactive “Ok to kontynuj” pass. That interactive pass does not increment the scheduled count or extend/restart the schedule. If a scheduled run completed independently, verify and record its actual handoff rather than inferring it from clock time.
- Latest verified WORLDIFACT runtime head: **`acb877dd45e239d85c3f81edd85cd91698865944`**, run **`35175826470`**, **126/126 tests PASS**. Lint 9 warnings/0 errors, full TypeScript, HTTP, build, reviewed foundations and Worker dry-run passed. Subsequent changes in this pass are documentation only; final PR-head CI is checked separately.
- Fresh reviewed Froge head: **`d3f61b842dcfeda2ed794210caafc391919a75be`**, full no-paid run **`35175731409` PASS**, including full frontend regression. This separately advancing work was inspected, not overwritten.
- No merge, production deployment, new paid generation, quota/secret change or Oracle installation in this interactive pass.

## Exact working generator boundary

Keep **https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/** as the active original generator reached from WORLDIFACT `/shop`. PR #27 is deployed. Do not recreate it, use `forge-studio-public` as a substitute, or deploy an older GitHub snapshot over it.

Canonical hosted Froge source editing/parity remains **BLOCKED/UNKNOWN**. Reviewable source supports code improvements, not a claim that live Studio changed. No authentication/archive/browser workaround is authorized. Review branches remain unmerged/unpublished unless a later instruction explicitly authorizes their release.

## Interactive pass — completed

1. Removed the automatic `/chess` redirect that bypassed reviewed copied source. The route now uses `/apps/chess/guest.html`; the original public site is still an explicit link. This makes the pinned English patch relevant to actual WORLDIFACT entry.
2. Removed the obsolete native prompt-only Shop fallback from PortalPage. Even a direct render of that page uses the existing hosted-Studio ShopPage; `/chess/shop` redirects to `/shop`.
3. Added pure `modelFraming.ts`: fit all eight bounds corners to vertical/horizontal camera FOV, handle different scales/aspects, reject bad bounds and derive clipping/orbit limits from the actual required distance. No fixed distance cap can undo an extreme portrait fit. Removed the whole-body minimum that prevented useful face zoom.
4. Added front/left/right/back presets for all GLBs and approximate face/clothes/shoes views for upright character metadata. Selected presets refit on resize; manual camera interaction is preserved. Authored +Y/+Z assumptions are explicitly labelled. Geometry, textures and PBR materials are not rescaled or regenerated.
5. Added **12 regressions**: 6 pure framing tests, 2 real Three camera-matrix tests and 4 actual-component server-render route tests. Six pure tests also passed locally; full CI passes 126 tests. These are CPU/source proofs, not a browser/WebGL/Android/likeness pass.
6. Corrected LANGUAGE_AUDIT: `/planets` really renders native PlanetsWorld/PlanetsDemo, while FORGE World Builder is a separate prototype link. The native English route is source-tested; external editable-source access is still blocked. Full campaign remains PLANNED.
7. Inspected fresh Froge full-suite failure and subsequent fix. Run `35175335899` exposed a real old-status/GLB race during a new POST; head `d3f61b...` now passes full run `35175731409`. Previous focused-only green evidence is superseded, not represented as equivalent.

Code commits include `f68295f...` helper, `d37b07f...` viewer, `b0cd832...` pure tests, `2c0f1f2...` routing, `75209be...` actual Three tests and `acb877d...` portal regressions.

## Earlier continuation evidence retained

Full original checkpoint before this interactive pass:
https://github.com/teslaeco/WORLDIFACT/blob/dc01c6f47fe74005b2b9d8bb1029ac70f3fe3850/docs/QUALITY_EN_SHIFT.md

### Continuation 1

ISS static/help/accessibility, eight repairs/tools/state messages, runtime HUD/actions/errors, signs and Model Context copy translated to English; task IDs/mechanics/version-2 saves retained. Source/session-bound model lifetime and single resource cleanup added. WORLDIFACT `f2d7f9000e9194ae93c973967a3f597a8a1ba02a`, run `35163081507`: 108 tests + TS/HTTP/build/foundations/Worker dry-run PASS.

### Continuation 2

Added English guards respecting legitimate opt-in catalogs, plus single-source foundation pins. Chess draft PR #143 at `705d7b0fe5fff03a5d7975fe094804af1eef44ea` changes direct opponent fallback to `Online player`; run `35167870190` PASS. Froge review source adds actual texture-pixel and structural Blender FBX reimport evidence. WORLDIFACT `8b53331195d22de1d2b1dd770fa92b698592ea76`, run `35168300680`: 114 tests + full build checks PASS.

### Continuation 3

Terra draft PR #271 at `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`: real eclipse gallery/404/multi-angle source English with NOAA/STAC provenance preserved. Runs `35169328621`, `35169328579`, `35169328498`, `35169328503` PASS. WORLDIFACT remains on older pin `ae90f7367587e0973782c470cde3f5103c0540fc`, because newer Terra main includes unrelated changes. Many static pages still need translation.

### Continuation 4 and subsequent upstream repair

Froge review PR #16 added measured root-ring to evaluated scalp distance for `hair_lock()`. Official-Blender positive control passes, same mesh translated 0.6 scene units away fails. The metric stores `likeness_assessed=false`; `portrait_hair.py` is outside that metric. Touched diagnostics, `en-US` dictation/errors and research fallback translated only in review source.

Earlier run `35171423726` passed a focused frontend gate plus Python/Blender fixtures. Restoring the complete frontend gate exposed four failures in run `35175335899`: a stale commerce expectation and three real old-job race regressions. Newer head `d3f61b842dcfeda2ed794210caafc391919a75be` fixes them and full run `35175731409` passes frontend + both Python paths + actual Blender render/FBX/hair/anatomy/material/board/package checks. No paid provider response or deployed live-Studio result is implied by fixture evidence.

## Remaining work / next continuation

- Consolidate fresh exact heads/CI into final Polish handoff without extending the five-run schedule.
- Continue bounded Terra/static or review-source English where editable source exists. Do not claim a cross-origin app was translated via its wrapper.
- Source access/parity for live Froge and external FORGE builder remains blocked. The native Planets expedition has editable English source and must not be incorrectly grouped into that blocker.
- Visual face/neck/jaw/shoulder/hand likeness, natural hairline, all hair builders, full cross-format PBR equivalence and manufacturing readiness are still not proven. Camera fitting improves inspection, not the generated mesh/texture itself.
- Keep WORLDIFACT #28, Chess #143, Froge #16 and Terra #271 draft/review-only until applicable explicit release approval.
- No fresh paid API/GPU/generation, secret/limit change, archive bypass, Oracle install or contest submission. Before any competition decision re-open official sources; before any model change recheck official Model Guide.

Read fresh AGENTS.md, CONTEST_STATUS.md, LANGUAGE_AUDIT.md and this checkpoint. One writer per branch; use fresh blob SHAs and return the marker to IDLE after saving work. Do not claim separate Codex/Copilot cloud-agent work without an observed launched job.
