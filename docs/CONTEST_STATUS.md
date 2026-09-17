# WORLDIFACT status — 17 September 2026

## Current review scope: English UI and 3D quality

The owner requested five bounded continuations to preserve the existing hosted Froge integration, improve model/texture quality and move all five worlds toward English UI. Work remains in **draft PR #28**, branch `work/five-hour-quality-english-20260917`; it is **not merged or deployed**. Coordination is in [QUALITY_EN_SHIFT.md](QUALITY_EN_SHIFT.md), and source-by-source language evidence is in [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md).

| Item | Status | Evidence / remaining work |
|---|---|---|
| Existing hosted Froge integration | DEPLOYED / UNCHANGED | PR #27, application merge `e2446816708783532a26c2c949c733e19ca84e96`; production `/shop` still embeds/links the exact original Studio |
| Continuations completed | 4 OF 5 | ISS + preview reliability; English source guards/Chess/export evidence; bounded Terra source translation; measured rooted-hair/scalp evidence + review-source Froge English |
| ISS English | SOURCE IMPLEMENTED / TESTED | Static UI, eight repairs/tools/state messages, dynamic HUD/actions/errors, canvas signs and Model Context tool copy are English; IDs/save schema/mechanics preserved |
| Native WORLDIFACT / AI Game Lab English | SOURCE GUARDED | `index.html`, Home, Portal, Shop, Workbench, Control, `P0GameLab` and portal definitions have English regression coverage |
| Chess English | SOURCE FIX PREPARED / TESTED | Draft Chess PR #143, revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea`, changes the remaining direct `Gracz online` fallback to `Online player`. Optional translated catalogs remain supported. Chess run `35167870190` passed typecheck/tests/build/smoke |
| Terra main English presentation | VERIFIED MECHANISM | WORLDIFACT pin `ae90f7367587e0973782c470cde3f5103c0540fc`; main document is English and `contest-runtime.js` maps reviewed legacy UI phrases to English |
| Terra standalone English | SOURCE BATCH PREPARED / TESTED | Draft Terra PR #271 head `4a34ce18fe552f19aaa2e604b50260ecba5b40c8` translates eclipse gallery, 404 and multi-angle form/runtime while preserving NOAA/Copernicus provenance and STAC semantics. Four review workflows pass. Many other static pages remain Polish |
| Terra integration into WORLDIFACT | REVIEW REQUIRED | PR #271 is based on current Terra main `4d422e97121fda7199ce9320e0bba10a487cca42`, not the older WORLDIFACT pin. Direct repinning could import unrelated upstream changes and is intentionally deferred |
| Foundation source pins | SINGLE SOURCE OF TRUTH | Composite foundation action reads validated Chess/Terra SHAs from `config/foundation-sources.json` |
| 8 Planets English | WRAPPER ENGLISH / SOURCE BLOCKED | Records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but no editable canonical source is exposed here. Cross-origin UI is not falsely labelled translated |
| Hosted Froge English | REVIEW SOURCE PARTIAL / CANONICAL SOURCE BLOCKED | Live Studio remains preserved. Reviewable GitHub snapshot now has English touched rooted-hair diagnostics, `en-US` dictation/errors and English research fallback, but source parity with the hosted Site is unproven and nothing was deployed over it |
| WORLDIFACT model preview reliability | SOURCE IMPLEMENTED / TESTED | Stale/late GLBs cannot replace the current model and shared PBR resources dispose once |
| Froge texture/FBX evidence | DRAFT SOURCE PR / EXACT-HEAD CI PASS | Froge PR #16 head `656b12164bc9e08921067c2959ee326e9e7d64fe`; no-paid run `35171423726` passes frontend focused verification, Python 3.12, and full Python 3.9 + official Blender 4.3 path. Requested 4K/8K is separated from actual pixels and FBX is structurally re-opened in Blender |
| Hair root/scalp continuity | STRUCTURAL CLASS TESTED / NOT LIKENESS | `hair_lock()` first-root-ring distance is measured against evaluated scalp geometry. Official Blender positive control passes; the same mesh translated 0.6 scene units away fails. `likeness_assessed=false`; separate hair builders are not covered |
| Visual likeness / anatomy | NOT PROVEN | Face/neck/jaw/shoulder proportions, hands, natural hairline and controlled visual comparison still need canonical-source/runtime evidence; structural checks are not a likeness pass |
| UV/PBR preservation | PARTIAL | GLB texture/UV checks, atlas/material checks and real Blender FBX reimport exist. Full cross-format shader equivalence remains explicitly unverified |
| Froge broader frontend baseline | KNOWN RED DEBT, NOT HIDDEN | Diagnostic run `35171308192` found a stale docs test import plus two legacy-label expectations. Touched localization source is gated separately by lint, full TypeScript, focused regressions and production build; unrelated failures were not weakened to force green |
| Latest WORLDIFACT code verification | PASS | Runtime-code head remains `8b53331195d22de1d2b1dd770fa92b698592ea76`, run `35168300680`: 114/114 tests, lint 9 warnings/0 errors, TS, HTTP smoke, build, reviewed foundation assembly, Worker dry-run and read-only hosted-Studio check passed. A new docs-only PR-head verification is expected after continuation-4 ledger updates |
| New costs | NONE | No paid generation, GPU/API job, quota increase, secret change, Oracle install, order or private archive bypass |
| Final contest release | NO-GO | Canonical hosted-source/device generation, controlled visual identity quality, remaining Terra/static + 8 Planets + live Froge localization and final submission/media checks remain incomplete |

## Correct generator boundary

The active generator remains:

**https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/**

WORLDIFACT `/shop` provides English navigation and permanent direct-open fallbacks. The hosted Studio owns prompts/photos, Codex/Blender execution, previews, exports, accounts and stored work. The old `forge-studio-public` page is not the active generator. PR #28 does not copy private assets or migrate the Studio backend.

The reviewable GitHub source branch for Froge remains useful for source-only improvements but is not proven identical to the newer private Site. Source patches remain review-only until deliberately ported to the canonical runtime.

## Continuation 3 — Terra evidence retained

Draft upstream PR: https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Review head: `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`.

Translated authored surfaces include the eclipse archive gallery, public 404 copy and multi-angle observation form/runtime. NOAA archive manifest/source/hash/log evidence, canonical redirect target and Copernicus STAC geometry/query semantics are preserved. Final Terra workflows `35169328621`, `35169328579`, `35169328498` and `35169328503` all pass.

WORLDIFACT still uses reviewed Terra pin `ae90f7367587e0973782c470cde3f5103c0540fc`. PR #271 is based on newer Terra main and is **not merged, deployed or automatically adopted by WORLDIFACT**. A direct pin jump could bring unrelated upstream changes; later integration needs explicit review/cherry-pick or a deliberate pin decision. Many Terra standalone pages remain Polish.

## Continuation 4 — rooted-hair and review-source English evidence

Draft Froge PR: https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Review head: `656b12164bc9e08921067c2959ee326e9e7d64fe`.

Exact-head no-paid workflow `35171423726` passes:

- frontend locked install, lint, full TypeScript, focused English regression and production build;
- Python 3.12 unit/Codex-MCP fixture path;
- Python 3.9 unit/Codex-MCP fixture, official Blender 4.3 build/render/FBX, edit helpers, rooted-hair attachment regression, anatomy diagnostics, atlas/material checks, board checks, v35 package and artifact.

The new rooted-hair evidence measures the first generated `hair_lock()` ring against the evaluated scalp BVH in world space. A fitted lock must pass; moving the same mesh 0.6 scene units away must fail and increase the root-centre gap. This proves one floating-root failure class can be detected; it does not prove hairstyle reconstruction, a visually natural hairline or identity likeness. The evidence explicitly stores `likeness_assessed=false`, and `portrait_hair.py` is outside this specific metric.

The same review source now uses `en-US` for dictation, English touched microphone/dictation errors, English research-report recovery UI and English touched rooted-hair diagnostics. This is source evidence only, not a claim that the current private hosted Studio received those strings.

A broader diagnostic frontend run `35171308192` found three existing issues: a stale import in `docs/reviews/v32/remote-poll-race.test.tsx`, a commerce assertion expecting two legacy `Niepołączony` labels and a photo-generation assertion expecting an older retry-button label. They remain visible debt and were not bypassed by weakening assertions. Focused localization tests, lint, full TypeScript and production build are green on the actual touched source.

## Remaining work

1. Final continuation: re-read exact current heads and CI, then consolidate actual English coverage and blockers across all five worlds without repeating already-green work.
2. Do not call rooted-hair structural evidence photographic likeness; face/neck/jaw/shoulders, hands, natural hairline and real identity comparison remain unproven.
3. Strengthen PBR/material equivalence only if a real format/runtime check can support it; current FBX/material evidence remains structural.
4. Continue Terra/static or reviewable Froge English only where real editable source exists; do not fake 8 Planets or live-hosted-Froge translation.
5. Keep WORLDIFACT PR #28, Chess PR #143, Froge PR #16 and Terra PR #271 unmerged/unpublished until explicit release approval.
6. Continuation 5 must provide the consolidated Polish GO/NO-GO report and must not extend the schedule.

## Historical production evidence retained

PR #27: https://github.com/teslaeco/WORLDIFACT/pull/27

Deployed integration merge: `e2446816708783532a26c2c949c733e19ca84e96`

Production Shop: https://worldifact.xodobrox.workers.dev/shop

Verified deployment run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269208

Earlier native Astra/Oracle generated-artifact evidence remains historical and is not a new quality test. The previous native WORLDIFACT paid ceiling is not extended or re-armed by this work.

## Truth boundary

Distinguish DEPLOYED, SOURCE IMPLEMENTED, TESTED, OWNER-REPORTED and UNKNOWN/BLOCKED. Never call a linked Studio a migrated backend, preview cleanup a proven likeness improvement, pixel-size metadata new texture detail, a Blender reimport check visual/PBR equivalence, rooted-hair gap checks photographic identity evidence, test fixtures real generated models, HTTP success a device pass, or an unreviewed MAKE candidate manufacturing-ready.
