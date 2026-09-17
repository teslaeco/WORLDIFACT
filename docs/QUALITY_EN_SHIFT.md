# Five-hour quality and English work session

Date: 17 September 2026 (Europe/Amsterdam). Owner: Sebastian.

## Coordination

- Branch: `work/five-hour-quality-english-20260917`.
- Draft WORLDIFACT PR: https://github.com/teslaeco/WORLDIFACT/pull/28
- Base: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`.
- Editor: **IDLE — continuation 4 completed; the next continuation may claim this branch.**
- Scheduled continuations completed: **4 of 5**.
- Latest verified WORLDIFACT code head remains `8b53331195d22de1d2b1dd770fa92b698592ea76`; continuation 4 changed upstream review source plus documentation, not WORLDIFACT runtime code.
- WORLDIFACT branch verification after the continuation-4 coordination/doc changes must be read from the exact new PR head before the final handoff.

## Non-negotiable continuity

Keep `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` as the active generator reached from WORLDIFACT `/shop`. PR #27 is deployed. Do not recreate it, use `forge-studio-public` as a replacement, or overwrite the hosted Studio with an older GitHub snapshot.

Canonical hosted Froge source editing remains **BLOCKED/UNKNOWN** in this work stream. The reviewable GitHub runtime is useful for source-only improvements, but its parity with the newer private Site is not proven. No archive/authentication bypass is allowed.

## Continuation 1 — retained evidence

- ISS static UI/help/accessibility copy, all eight repair tasks/tools/state messages, runtime HUD/actions/errors, in-world signs and Model Context copy were translated to English while preserving task IDs, mechanics and version-2 saves.
- WORLDIFACT model preview lifetime became source/session-bound so stale/late GLBs cannot replace the current preview; released shared geometry/material/texture resources dispose once.
- Draft Froge PR #16 introduced truthful texture-resolution evidence: requested 4K/8K is separated from actual source/export pixels and no upscaling is counted as recovered detail.
- WORLDIFACT code head `f2d7f9000e9194ae93c973967a3f597a8a1ba02a` passed run `35163081507` with 108/108 tests, TypeScript, HTTP smoke, build, foundation assembly and Worker dry-run; lint had nine warnings and zero errors.

## Continuation 2 — retained evidence

- Added source-aware English UI guards for native WORLDIFACT / AI Game Lab and separated default English UI from legitimate optional locale catalogs.
- Draft Chess PR #143, revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea`, changes the remaining audited direct `Gracz online` fallback to `Online player`; run `35167870190` passed typecheck/tests/build/smoke.
- Foundation checkout SHAs now come from `config/foundation-sources.json`, eliminating the duplicate hardcoded-pin mismatch.
- Draft Froge PR #16 added real Blender FBX reimport checks while explicitly leaving `pbr_shader_equivalence_verified=false` and `likeness_assessed=false`.
- WORLDIFACT code head `8b53331195d22de1d2b1dd770fa92b698592ea76` passed run `35168300680`: 114/114 tests, lint 9 warnings/0 errors, TypeScript, HTTP smoke, production build, reviewed foundation assembly, Worker dry-run and hosted-Froge read-only probe.

## Continuation 3 — Terra standalone English source work

Draft upstream Terra PR: https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Review head: `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`.

Translated real authored source includes `web/public/eclipse-live/gallery.html`, `web/public/404.html`, and `web/public/multi-angle/index.html` + `app.js`. NOAA manifest/source/hash/log evidence, observation/capture UTC meaning, the `/Polar-Sun-Moon-Analysis/` redirect target, and Copernicus STAC search semantics were preserved. Final Terra runs `35169328621`, `35169328579`, `35169328498` and `35169328503` all pass.

WORLDIFACT still uses reviewed Terra pin `ae90f7367587e0973782c470cde3f5103c0540fc`. PR #271 is based on newer Terra main `4d422e97121fda7199ce9320e0bba10a487cca42`, so a direct pin jump is intentionally not performed because it could import unrelated upstream work. Many other Terra standalone pages remain Polish.

## Continuation 4 — measurable rooted-hair evidence and review-source English

Draft Froge source PR: https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Final continuation-4 review head: `656b12164bc9e08921067c2959ee326e9e7d64fe`.

### Measured geometry evidence

- `hair_root_attachment_evidence()` now measures the first generated `hair_lock()` root ring against the evaluated scalp BVH in world coordinates.
- Evidence records ring size, authored root radius, centre-to-scalp gap, minimum/maximum first-ring gap, explicit tolerances and a structural pass/fail result.
- It always records `likeness_assessed=false`.
- The official-Blender regression creates a fitted closed UV hair lock that must pass, then translates the exact same mesh 0.6 scene units away and requires it to fail with a larger root-centre gap. This is a positive/negative geometry control, not a visual likeness score.
- The separate `portrait_hair.py` builder remains outside this specific metric and must not be described as covered.

### English source evidence

In the reviewable GitHub snapshot only:

- dictation locale is `en-US` and touched microphone/dictation errors are English;
- the research-report error fallback and recovery actions are English;
- touched rooted-hair diagnostics are English;
- focused source regressions guard these translations.

This does **not** establish that the newer private hosted Studio UI is translated; canonical Site source parity remains BLOCKED/UNKNOWN.

### Exact-head verification

No-paid workflow `35171423726` on exact head `656b12164bc9e08921067c2959ee326e9e7d64fe` completed successfully:

- frontend locked install, lint, TypeScript, focused English regression and production build: PASS;
- Python 3.12 unit + Codex/MCP fixture path: PASS;
- Python 3.9 unit + Codex/MCP fixture + official Blender 4.3 build/render/FBX + edit helpers + rooted-hair attachment regression + anatomy diagnostics + atlas/material checks + board checks + v35 package/artifact: PASS.

A broader diagnostic run `35171308192` exposed three unrelated/pre-existing frontend-suite issues instead of hiding them: a stale import in `docs/reviews/v32/remote-poll-race.test.tsx`, a commerce assertion expecting two legacy `Niepołączony` labels, and a photo-generation assertion expecting an older retry-button label. Those failures were not weakened or relabelled as passing tests. The continuation gate therefore uses focused localization regression plus lint, full TypeScript and production build for the touched UI source while the no-paid Python/Blender quality suite remains fully green.

## Current 3D / texture truth boundary

Review-only Froge PR #16 now has evidence for truthful source/export pixel reporting, no-upscale handling, GLB texture/UV checks, structural FBX reimport, garment/body intersection checks, anatomy metadata, and one measured rooted-hair/scalp attachment failure class.

It still does **not** prove photographic identity likeness, a natural hairline, face/neck/jaw/shoulder proportions, hand quality, every hair construction path, full PBR shader equivalence, or manufacturing/print readiness. No paid reference generation was executed to make those claims.

## External localization boundaries

- **8 Planets:** recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5` is known from records, but no editable canonical source is exposed through connected tools. Internal translation remains **BLOCKED**, not faked through the iframe wrapper.
- **Hosted Froge:** the live Site remains preserved. Reviewable `teslaeco/Froge-MPC-2-test` is not proven source-identical to the current Site. Internal live localization remains **BLOCKED/UNKNOWN**.
- **Terra:** PR #271 proves a real bounded English source batch, not full Terra localization; integration requires a deliberate review instead of an unsafe pin jump.

## Final continuation priorities

1. Re-read exact current PR/CI state and do not repeat already-green work.
2. Consolidate English coverage and remaining source-access blockers for all five worlds; translate another real source only if it can be safely reviewed without unsafe repinning or live-Site overwrite.
3. Reconcile PR #16 diagnostic baseline failures as known debt, not as quality evidence; do not weaken tests merely for green CI.
4. Recheck current-head WORLDIFACT verification after this documentation update.
5. Produce the consolidated Polish GO/NO-GO report with actual changes, SHAs/PRs/tests, remaining canonical-source/device/visual blockers and costs. Do not extend the schedule.
6. Keep WORLDIFACT PR #28, Chess PR #143, Froge PR #16 and Terra PR #271 unmerged/unpublished unless a later explicit release decision authorizes them.

No new paid API/GPU generation, quota increase, secret change, Oracle installation, private archive access, model download, merge, production deployment or contest submission occurred in continuation 4. No separate Codex/Copilot cloud agent was launched; work was executed through connected GitHub tools.

## Continuation protocol

Read current main/PR, `AGENTS.md`, `CONTEST_STATUS.md`, `LANGUAGE_AUDIT.md` and this checkpoint. Claim the editor marker, take the next incomplete package, make actual source/test changes where evidence supports them, check exact-head CI, update the ledger, increment the count exactly once, and return the marker to IDLE.

After continuation 5 provide the consolidated Polish GO/NO-GO report. Do not extend the work window or start another schedule.
