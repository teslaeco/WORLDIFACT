# WORLDIFACT status — 17 September 2026

## Current review scope: English UI and 3D quality

The owner requested five bounded continuations to preserve the existing hosted Froge integration, improve model/texture quality and move all five worlds toward English UI. Work remains in **draft PR #28**, branch `work/five-hour-quality-english-20260917`; it is **not merged or deployed**. Coordination is in [QUALITY_EN_SHIFT.md](QUALITY_EN_SHIFT.md), and source-by-source language evidence is in [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md).

| Item | Status | Evidence / remaining work |
|---|---|---|
| Existing hosted Froge integration | DEPLOYED / UNCHANGED | PR #27, application merge `e2446816708783532a26c2c949c733e19ca84e96`; production `/shop` embeds/links the original Studio |
| Continuations completed | 2 OF 5 | Continuation 1 translated/guarded ISS and fixed model-preview lifetime. Continuation 2 added exact-source English enforcement for native WORLDIFACT plus compiled pinned Chess/Terra outputs |
| ISS English | SOURCE IMPLEMENTED / TESTED | Static UI, eight repairs/tools/state messages, dynamic HUD/actions/errors, canvas signs and Model Context tool copy are English; IDs/save schema/mechanics preserved |
| Native WORLDIFACT / AI Game Lab English | SOURCE GUARDED | `index.html`, Home, Portal, Shop, Workbench, Control, `P0GameLab` and portal definitions are checked against explicit English document language and curated high-signal Polish UI phrases |
| Pinned Chess English | EXACT SOURCE + BUILD GUARD | Exact commit `e134964e9c8b7edc43c26b508973f6fb658af90d` is the signed mixed-language cleanup; exact guest/auth source is English. Foundation assembly now checks the actual compiled HTML/JS before copying it |
| Pinned Terra English | EXACT SOURCE + BUILD GUARD | Exact commit `ae90f7367587e0973782c470cde3f5103c0540fc` has English document metadata/UI evidence. Compiled HTML/JS is now guarded; scientific/data-contract keys are deliberately preserved |
| 8 Planets English | WRAPPER ENGLISH / SOURCE BLOCKED | Records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but no editable GitHub source for that revision is exposed through the connected search. Cross-origin UI is not falsely labeled translated |
| Hosted Froge English | WRAPPER ENGLISH / CANONICAL SOURCE BLOCKED | Live Studio remains preserved. Reviewable GitHub `ModelStudio.tsx` still contains Polish product UI, but that snapshot is not proven identical to the newer hosted Site and is not deployed over it |
| WORLDIFACT model preview reliability | SOURCE IMPLEMENTED / TESTED IN CONTINUATION 1 | Person metadata no longer causes a second GLB load; model lifetime is source-bound; stale models are rejected/released and shared PBR resources dispose once |
| Froge texture truth/evidence patch | DRAFT SOURCE PR / CI PASS | Froge PR #16 head `9cfc57f7f57b67a6ceb468e4025c32b53d8fa881`; run `35163335466` passed the no-paid Oracle/Codex/Blender workflow. Requested 4K/8K is not treated as actual detail unless exported pixels reach it |
| Existing Froge structural quality checks | SOURCE INSPECTED | Current reviewable source checks garment containment, free-hand garment crossings, grip contacts, fan apertures, packed GLB textures, UV retention, anatomy metadata and GLB reimport; it explicitly leaves likeness and print readiness unassessed |
| Visual likeness / anatomy | NOT PROVEN | Hair/root continuity, face/neck/jaw/shoulder proportions, hands and controlled visual comparison still need canonical-source/runtime evidence; structural tests are not a likeness pass |
| UV/PBR/FBX preservation | PARTIAL | GLB packed textures/UV and some material contracts are checked. Stronger material-survival evidence across GLB/FBX reimport remains a priority |
| New costs | NONE | No paid generation, GPU/API job, quota increase, secret change, Oracle install, order or private archive bypass |
| Final contest release | NO-GO | Canonical hosted source/device generation, controlled visual quality, remaining external localization and final submission/media checks are incomplete |

## Continuation 2 implementation

WORLDIFACT now contains a bounded localization guard in `scripts/lib/english-ui.mjs` with unit coverage in `tests/english-ui.test.mjs`. It does **not** attempt language detection over arbitrary data. It only protects authored UI against known high-signal Polish phrases and verifies English document language where applicable.

`scripts/build-foundations.mjs` applies that guard to the actual compiled output of the pinned Chess and Terra revisions before those assets are copied into the release. Native WORLDIFACT and AI Game Lab source receive equivalent regression coverage. This makes localization a release-time property rather than a one-off manual observation.

Material commits for this package are recorded in `QUALITY_EN_SHIFT.md`; the latest material code head is `9761b8293accb3343834cea8d078b1268fcb54be`.

A new PR CI run was started for these changes. At the continuation checkpoint, run `35167247789` had begun successfully but had not yet completed all foundation/deploy-check steps. **Do not call continuation 2 verified until that run or a later current-head run completes green.**

## Correct generator boundary

The active generator remains:

**https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/**

WORLDIFACT `/shop` provides English navigation and permanent direct-open fallbacks. The hosted Studio owns prompts/photos, Codex/Blender execution, previews, exports, accounts and stored work. The old `forge-studio-public` page is not the active generator. PR #28 does not copy private assets or migrate the Studio backend.

The reviewable GitHub source branch `teslaeco/Froge-MPC-2-test:codex/v27-mcp-startup-audit` is useful for source-only improvements but is not proven identical to the newer private Site. Source-only patches therefore remain review-only until deliberately ported to the canonical runtime.

## Verification boundaries

Froge PR #16 passed workflow run `35163335466` (`Oracle Codex MCP (no paid API)`). That workflow uses Python 3.9/3.12 regression suites, fixture model responses, a real Codex/Code Mode MCP round trip, official Blender 4.3 build/render/FBX checks and packaging. It did not call a paid model API. This verifies source/runtime contracts, not photographic likeness.

Earlier WORLDIFACT run `35163081507` remains valid for continuation-1 code only: 108/108 tests, lint with nine warnings/zero errors, TypeScript, HTTP smoke, production build, foundation assembly and Worker dry-run. It must not be used as verification of continuation-2 material code.

## Remaining work

1. Confirm the current continuation-2 WORLDIFACT CI result and repair any localization/build regression without weakening the guard.
2. Strengthen preserved-original UV/PBR and GLB/FBX reimport/material evidence in the reviewable Froge source, then keep that PR source-only until canonical runtime access exists.
3. Continue anatomy/garment quality only where real Blender validation is available: hair/root continuity, face/neck/jaw/shoulders, hands and intersections.
4. Translate reviewable Froge source separately where useful, but do not claim it changes the live Studio. Translate 8 Planets only when its real editable source is accessible.
5. Keep PR #28 and Froge PR #16 unmerged/unpublished until explicit release approval. On continuation 5 provide the consolidated Polish GO/NO-GO report.

## Historical production evidence retained

PR #27: https://github.com/teslaeco/WORLDIFACT/pull/27

Deployed integration merge: `e2446816708783532a26c2c949c733e19ca84e96`

Production Shop: https://worldifact.xodobrox.workers.dev/shop

Verified deployment run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269208

Earlier native Astra/Oracle generated-artifact evidence remains historical and is not a new quality test. The previous native WORLDIFACT paid ceiling is not extended or re-armed by this work.

## Truth boundary

Distinguish DEPLOYED, SOURCE IMPLEMENTED, TESTED, OWNER-REPORTED and UNKNOWN/BLOCKED. Never call a linked Studio a migrated backend, preview cleanup a proven likeness improvement, pixel-size metadata new texture detail, test fixtures real generated models, HTTP success a device pass, or an unreviewed MAKE candidate manufacturing-ready.
