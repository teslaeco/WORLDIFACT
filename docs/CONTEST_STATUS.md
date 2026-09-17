# WORLDIFACT status — 17 September 2026

## Current review scope: English UI and 3D quality

The owner requested five bounded continuations to preserve the existing hosted Froge integration, improve model/texture quality and move all five worlds toward English UI. Work remains in **draft PR #28**, branch `work/five-hour-quality-english-20260917`; it is **not merged or deployed**. Coordination is in [QUALITY_EN_SHIFT.md](QUALITY_EN_SHIFT.md), and source-by-source language evidence is in [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md).

| Item | Status | Evidence / remaining work |
|---|---|---|
| Existing hosted Froge integration | DEPLOYED / UNCHANGED | PR #27, application merge `e2446816708783532a26c2c949c733e19ca84e96`; production `/shop` still embeds/links the exact original Studio |
| Continuations completed | 2 OF 5 | Continuation 1 translated ISS and fixed preview lifetime. Continuation 2 added source-aware English enforcement, fixed one real Chess runtime literal and strengthened Blender export evidence |
| ISS English | SOURCE IMPLEMENTED / TESTED | Static UI, eight repairs/tools/state messages, dynamic HUD/actions/errors, canvas signs and Model Context tool copy are English; IDs/save schema/mechanics preserved |
| Native WORLDIFACT / AI Game Lab English | SOURCE GUARDED | `index.html`, Home, Portal, Shop, Workbench, Control, `P0GameLab` and portal definitions have English regression coverage |
| Chess English | SOURCE FIX PREPARED / TESTED | Draft Chess PR #143, revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea`, changes the remaining direct `Gracz online` fallback to `Online player`. Optional translated catalogs remain supported. Chess run `35167870190` passed typecheck/tests/build/smoke |
| Terra main English presentation | VERIFIED MECHANISM / STATIC BACKLOG | Pin `ae90f7367587e0973782c470cde3f5103c0540fc`; main document is English and `contest-runtime.js` maps reviewed legacy UI phrases to English. Standalone pages such as `eclipse-live/gallery.html` remain genuinely Polish and must be translated upstream in later batches |
| Foundation source pins | SINGLE SOURCE OF TRUTH | Composite foundation action now reads validated Chess/Terra SHAs from `config/foundation-sources.json`, fixing the duplicate hardcoded-pin failure exposed during this continuation |
| 8 Planets English | WRAPPER ENGLISH / SOURCE BLOCKED | Records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but no editable GitHub source for it is exposed here. Cross-origin UI is not falsely labelled translated |
| Hosted Froge English | WRAPPER ENGLISH / CANONICAL SOURCE BLOCKED | Live Studio remains preserved. Reviewable GitHub source contains Polish product UI but is not proven identical to the hosted Site and is not deployed over it |
| WORLDIFACT model preview reliability | SOURCE IMPLEMENTED / TESTED | Stale/late GLBs cannot replace the current model and shared PBR resources dispose once |
| Froge texture/FBX evidence | DRAFT SOURCE PR / CI PASS | Froge PR #16 head `ab5b6523c45dfc45cddeffe35d979290a38d9d72`; run `35167461563` passed the no-paid Python/Codex/MCP/Blender workflow. Requested 4K/8K is separated from actual pixels and FBX is rejected if Blender cannot reopen it with finite geometry/material names/UV presence |
| Visual likeness / anatomy | NOT PROVEN | Hair/root continuity, face/neck/jaw/shoulder proportions, hands and controlled visual comparison still need canonical-source/runtime evidence; structural tests are not a likeness pass |
| UV/PBR preservation | PARTIAL | GLB texture/UV checks plus real Blender FBX reimport now exist. FBX shader equivalence remains explicitly unverified |
| Continuation-2 WORLDIFACT CI | PASS | Code head `8b53331195d22de1d2b1dd770fa92b698592ea76`, run `35168300680`: 114/114 tests, lint 9 warnings/0 errors, TS, HTTP smoke, build, reviewed foundation assembly, Worker dry-run and read-only hosted-Studio check all passed |
| New costs | NONE | No paid generation, GPU/API job, quota increase, secret change, Oracle install, order or private archive bypass |
| Final contest release | NO-GO | Canonical hosted source/device generation, controlled visual quality, Terra/static + 8 Planets + live Froge localization and final submission/media checks remain incomplete |

## Correct generator boundary

The active generator remains:

**https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/**

WORLDIFACT `/shop` provides English navigation and permanent direct-open fallbacks. The hosted Studio owns prompts/photos, Codex/Blender execution, previews, exports, accounts and stored work. The old `forge-studio-public` page is not the active generator. PR #28 does not copy private assets or migrate the Studio backend.

The reviewable GitHub source branch for Froge remains useful for source-only improvements but is not proven identical to the newer private Site. Source patches remain review-only until deliberately ported to the canonical runtime.

## Continuation-2 verification notes

The final green WORLDIFACT run is:
https://github.com/teslaeco/WORLDIFACT/actions/runs/35168300680

It verified the reviewed Chess revision `705d7b0...` and Terra revision `ae90f73...` through the foundation checkout/build path. Earlier red runs were not ignored: one exposed an over-broad localization scan that confused optional locale data with default UI, another exposed duplicate hardcoded foundation pins, and another exposed genuinely Polish standalone Terra HTML. The final implementation distinguishes these cases instead of weakening them into a false all-English claim.

Froge PR #16 no-paid verification:
https://github.com/teslaeco/Froge-MPC-2-test/actions/runs/35167461563

This verifies source/runtime/export contracts using Python regression suites and real Blender 4.3 paths; it does not prove identity likeness or manufacturing readiness.

## Remaining work

1. Translate Terra standalone/static pages upstream in bounded batches; `web/public/eclipse-live/gallery.html` is a confirmed Polish example.
2. Continue reviewable Froge English separately without claiming it changes the live hosted Site.
3. Continue anatomy/garment quality only where real Blender validation exists: hair/root continuity, face/neck/jaw/shoulders, hands and intersections.
4. Strengthen PBR/material evidence beyond structural FBX reimport without inventing shader equivalence.
5. Translate 8 Planets only when real editable source access is restored.
6. Keep WORLDIFACT PR #28, Chess PR #143 and Froge PR #16 unmerged/unpublished until explicit release approval. Continuation 5 will provide the consolidated Polish GO/NO-GO report.

## Historical production evidence retained

PR #27: https://github.com/teslaeco/WORLDIFACT/pull/27

Deployed integration merge: `e2446816708783532a26c2c949c733e19ca84e96`

Production Shop: https://worldifact.xodobrox.workers.dev/shop

Verified deployment run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269208

Earlier native Astra/Oracle generated-artifact evidence remains historical and is not a new quality test. The previous native WORLDIFACT paid ceiling is not extended or re-armed by this work.

## Truth boundary

Distinguish DEPLOYED, SOURCE IMPLEMENTED, TESTED, OWNER-REPORTED and UNKNOWN/BLOCKED. Never call a linked Studio a migrated backend, preview cleanup a proven likeness improvement, pixel-size metadata new texture detail, a Blender reimport check visual/PBR equivalence, test fixtures real generated models, HTTP success a device pass, or an unreviewed MAKE candidate manufacturing-ready.
