# WORLDIFACT status — 17 September 2026

## Current review scope: English UI and 3D quality

The owner requested five bounded continuations to preserve the existing hosted Froge integration, improve model/texture quality and move all five worlds toward English UI. Work remains in **draft PR #28**, branch `work/five-hour-quality-english-20260917`; it is **not merged or deployed**. Coordination is in [QUALITY_EN_SHIFT.md](QUALITY_EN_SHIFT.md), and source-by-source language evidence is in [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md).

| Item | Status | Evidence / remaining work |
|---|---|---|
| Existing hosted Froge integration | DEPLOYED / UNCHANGED | PR #27, application merge `e2446816708783532a26c2c949c733e19ca84e96`; production `/shop` still embeds/links the exact original Studio |
| Continuations completed | 3 OF 5 | Continuation 1 translated ISS/fixed preview lifetime; continuation 2 added source-aware English enforcement, Chess fix and Blender export evidence; continuation 3 translated a bounded real Terra static/runtime batch upstream |
| ISS English | SOURCE IMPLEMENTED / TESTED | Static UI, eight repairs/tools/state messages, dynamic HUD/actions/errors, canvas signs and Model Context tool copy are English; IDs/save schema/mechanics preserved |
| Native WORLDIFACT / AI Game Lab English | SOURCE GUARDED | `index.html`, Home, Portal, Shop, Workbench, Control, `P0GameLab` and portal definitions have English regression coverage |
| Chess English | SOURCE FIX PREPARED / TESTED | Draft Chess PR #143, revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea`, changes the remaining direct `Gracz online` fallback to `Online player`. Optional translated catalogs remain supported. Chess run `35167870190` passed typecheck/tests/build/smoke |
| Terra main English presentation | VERIFIED MECHANISM | WORLDIFACT pin `ae90f7367587e0973782c470cde3f5103c0540fc`; main document is English and `contest-runtime.js` maps reviewed legacy UI phrases to English |
| Terra standalone English | SOURCE BATCH PREPARED / TESTED | Draft Terra PR #271 head `4a34ce18fe552f19aaa2e604b50260ecba5b40c8` translates eclipse gallery, 404 and multi-angle form/runtime while preserving NOAA/Copernicus provenance and STAC semantics. Four review workflows pass. Many other static pages remain Polish |
| Terra integration into WORLDIFACT | REVIEW REQUIRED | PR #271 is based on current Terra main `4d422e97121fda7199ce9320e0bba10a487cca42`, not the older WORLDIFACT pin. Direct repinning could import unrelated upstream changes and is intentionally deferred |
| Foundation source pins | SINGLE SOURCE OF TRUTH | Composite foundation action reads validated Chess/Terra SHAs from `config/foundation-sources.json` |
| 8 Planets English | WRAPPER ENGLISH / SOURCE BLOCKED | Records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but no editable canonical source is exposed here. Cross-origin UI is not falsely labelled translated |
| Hosted Froge English | WRAPPER ENGLISH / CANONICAL SOURCE BLOCKED | Live Studio remains preserved. Reviewable GitHub source contains Polish product UI but is not proven identical to the hosted Site and is not deployed over it |
| WORLDIFACT model preview reliability | SOURCE IMPLEMENTED / TESTED | Stale/late GLBs cannot replace the current model and shared PBR resources dispose once |
| Froge texture/FBX evidence | DRAFT SOURCE PR / CI PASS | Froge PR #16 head `ab5b6523c45dfc45cddeffe35d979290a38d9d72`; run `35167461563` passed no-paid Python/Codex/MCP/Blender workflow. Requested 4K/8K is separated from actual pixels and FBX is rejected if Blender cannot reopen it with finite geometry/material names/UV presence |
| Visual likeness / anatomy | NOT PROVEN | Hair/root continuity, face/neck/jaw/shoulder proportions, hands and controlled visual comparison still need canonical-source/runtime evidence; structural tests are not a likeness pass |
| UV/PBR preservation | PARTIAL | GLB texture/UV checks plus real Blender FBX reimport exist. FBX shader equivalence remains explicitly unverified |
| Latest WORLDIFACT code verification | PASS | Code head `8b53331195d22de1d2b1dd770fa92b698592ea76`, run `35168300680`: 114/114 tests, lint 9 warnings/0 errors, TS, HTTP smoke, build, reviewed foundation assembly, Worker dry-run and read-only hosted-Studio check passed |
| New costs | NONE | No paid generation, GPU/API job, quota increase, secret change, Oracle install, order or private archive bypass |
| Final contest release | NO-GO | Canonical hosted-source/device generation, controlled visual quality, remaining Terra/static + 8 Planets + live Froge localization and final submission/media checks remain incomplete |

## Correct generator boundary

The active generator remains:

**https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/**

WORLDIFACT `/shop` provides English navigation and permanent direct-open fallbacks. The hosted Studio owns prompts/photos, Codex/Blender execution, previews, exports, accounts and stored work. The old `forge-studio-public` page is not the active generator. PR #28 does not copy private assets or migrate the Studio backend.

The reviewable GitHub source branch for Froge remains useful for source-only improvements but is not proven identical to the newer private Site. Source patches remain review-only until deliberately ported to the canonical runtime.

## Continuation-3 Terra evidence

Draft upstream PR:
https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Final review head: `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`.

Changes translate real authored surfaces rather than wrapper text:

- eclipse archive gallery document, controls, dynamic playback/facts/errors;
- public 404 redirect copy;
- multi-angle observation form, help, geocoder/search states, result labels and errors.

Preserved evidence and behavior include the NOAA archive manifest path, NOAA source links, SHA-256/timestamp/log evidence, `/Polar-Sun-Moon-Analysis/` redirect target, Copernicus STAC endpoint and search geometry/query semantics.

Final workflows all pass:

- CI `35169328621`;
- PR Validation `35169328579`;
- Validate web application `35169328498`;
- Validate Terra Observation Planet Site `35169328503`.

Two earlier failures were treated as real diagnostics and corrected rather than bypassed: a Node filesystem regression test was initially placed under browser TypeScript compilation, and the existing Python gallery test still asserted the old Polish evidence sentence. The test was moved to a Node-side MJS file and the semantic assertion was translated while retaining all archived-manifest/source/hash/log requirements.

### Pin boundary

WORLDIFACT still uses reviewed Terra pin `ae90f7367587e0973782c470cde3f5103c0540fc`. Terra PR #271 is based on current Terra main `4d422e97121fda7199ce9320e0bba10a487cca42`. It is **not merged, deployed or automatically adopted by WORLDIFACT**. A direct pin jump could bring unrelated upstream changes; a later integration needs an explicit review/cherry-pick or deliberate pin decision.

Many Terra standalone pages remain Polish, including eclipse observer/night-mode and casebook/forum/Copernicus/experiment/archive surfaces. This batch is not a full-Terra English claim.

## Existing 3D quality evidence

Froge PR #16 no-paid verification:
https://github.com/teslaeco/Froge-MPC-2-test/actions/runs/35167461563

This verifies source/runtime/export contracts using Python regressions and real Blender 4.3 paths. It separates requested texture size from real pixel evidence, checks GLB texture/UV properties and performs structural FBX reimport verification. It does not prove identity likeness, hair-root continuity, every PBR channel or manufacturing readiness.

## Remaining work

1. Add measurable Blender/source QA for hair-root/scalp continuity or another concrete anatomy/garment intersection property without claiming photographic likeness from a structural test.
2. Strengthen PBR/material evidence beyond structural FBX reimport where technically verifiable.
3. Continue Terra standalone/static English source in bounded upstream batches, then review how to integrate the source changes without an unsafe Terra pin jump.
4. Continue reviewable Froge English separately without claiming it changes the live hosted Site.
5. Translate 8 Planets only when real editable canonical source access is restored.
6. Keep WORLDIFACT PR #28, Chess PR #143, Froge PR #16 and Terra PR #271 unmerged/unpublished until explicit release approval. Continuation 5 will provide the consolidated Polish GO/NO-GO report.

## Historical production evidence retained

PR #27: https://github.com/teslaeco/WORLDIFACT/pull/27

Deployed integration merge: `e2446816708783532a26c2c949c733e19ca84e96`

Production Shop: https://worldifact.xodobrox.workers.dev/shop

Verified deployment run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269208

Earlier native Astra/Oracle generated-artifact evidence remains historical and is not a new quality test. The previous native WORLDIFACT paid ceiling is not extended or re-armed by this work.

## Truth boundary

Distinguish DEPLOYED, SOURCE IMPLEMENTED, TESTED, OWNER-REPORTED and UNKNOWN/BLOCKED. Never call a linked Studio a migrated backend, preview cleanup a proven likeness improvement, pixel-size metadata new texture detail, a Blender reimport check visual/PBR equivalence, test fixtures real generated models, HTTP success a device pass, or an unreviewed MAKE candidate manufacturing-ready.
