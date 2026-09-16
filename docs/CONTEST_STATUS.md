# WORLDIFACT status — 17 September 2026

## Current review scope: English UI and 3D quality

The owner requested five bounded continuations to finish the existing Froge integration, improve model/texture quality and move all five worlds toward English UI. Work remains in **draft PR #28**, branch `work/five-hour-quality-english-20260917`; it is **not merged or deployed**. Coordination is in [QUALITY_EN_SHIFT.md](QUALITY_EN_SHIFT.md), and the source-by-source language ledger is [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md).

| Item | Status | Evidence / remaining work |
|---|---|---|
| Existing hosted Froge integration | DEPLOYED / UNCHANGED | PR #27, application merge `e2446816708783532a26c2c949c733e19ca84e96`; production `/shop` embeds/links the original Studio |
| Continuation 1 WORLDIFACT code | VERIFIED | Code head `f2d7f9000e9194ae93c973967a3f597a8a1ba02a`; PR CI run `35163081507` passed 108/108 tests, lint, TypeScript, HTTP smoke, build, foundation assembly and Worker dry-run |
| ISS English | SOURCE IMPLEMENTED / TESTED | Static UI, eight repair tasks/tools/state messages, dynamic HUD/actions/errors, canvas signs and Model Context tool copy are English; IDs/save schema/mechanics preserved |
| Five-world English coverage | AUDIT IN PROGRESS | Native shell/workbench inspected English. Pinned Chess and Terra build successfully; exact-source deep scans remain. 8 Planets and hosted Froge are external and are not considered translated merely because their wrappers are English |
| WORLDIFACT model preview reliability | SOURCE IMPLEMENTED / TESTED | Person metadata no longer causes a second GLB load; model lifetime is source-bound; late stale models are rejected/released; shared PBR resources dispose once |
| Froge texture truth/evidence patch | DRAFT SOURCE PR | Froge PR #16 against `codex/v27-mcp-startup-audit` reports actual source/export max edge, requested-edge reach, texture/downsample counts, preserves no-upscale policy and adds tests. It is not deployed to Oracle or the private Site |
| Hosted Studio source parity | UNKNOWN / EDIT ACCESS BLOCKED | Project checkpoint records a newer private Site source than the GitHub snapshot and previous Git source errors. Do not replace the live Studio with the older repository branch |
| Visual likeness / anatomy | NOT PROVEN | Hair, face/neck/jaw/shoulder proportions, hands, clothing intersections and controlled visual comparison still need canonical-source/runtime work; structural tests are not a likeness pass |
| Texture quality | BETTER EVIDENCE, NOT NEW DETAIL | PR #16 can distinguish an 8192 request from a 1122×1402 actual source. No upscaling is counted as recovered detail; real UV/PBR appearance still needs export/render review |
| New costs | NONE | No paid generation, GPU/API job, quota increase, secret change, Oracle install, order or private archive bypass |
| Final contest release | NO-GO | Full source language coverage, hosted/device generation, controlled visual quality and final submission/media checks remain incomplete |

Current code verification logs contain nine lint warnings and zero errors. Do not call the draft warning-free. CI assembled the exact pinned Chess commit `e134964e9c8b7edc43c26b508973f6fb658af90d` and Terra commit `ae90f7367587e0973782c470cde3f5103c0540fc` successfully. The credential-free hosted Studio probe again returned HTTP 200; this is reachability evidence only, not authenticated iframe, upload, Android or generation evidence.

## Correct generator boundary

The active generator remains:

**https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/**

WORLDIFACT `/shop` provides English navigation and permanent direct-open fallbacks. The hosted Studio owns prompts/photos, Codex/Blender execution, previews, exports, accounts and stored work. The old `forge-studio-public` page is not the active generator. PR #28 does not copy private assets or migrate the Studio backend.

The newer reviewable GitHub source branch is `teslaeco/Froge-MPC-2-test:codex/v27-mcp-startup-audit` at `735058af6e53a2e44f417b5dcf864f62bd334bb2` as checked during continuation 1. It contains the previously merged v35 acceptance/runtime work and saved-model-history corrections, but project records explicitly say that GitHub source is not proven identical to the newer private Site. Source-only patches must therefore stay review-only until ported to the canonical runtime.

## Continuation 1 evidence

WORLDIFACT PR: https://github.com/teslaeco/WORLDIFACT/pull/28

Verified code CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35163081507

Froge source-only texture PR: https://github.com/teslaeco/Froge-MPC-2-test/pull/16

The ISS regression now checks static/runtime English, canvas labels, DOM hooks, eight fixed repair IDs/order, six consumed replacement parts and version-2 save restoration. Model-slot regressions cover late previous-session results and one-time resource disposal. These checks do not substitute for physical Android/WebGL or visual-likeness QA.

Froge PR #16 changes only source evidence/reporting: requested 4K/8K is not treated as actual resolution unless exported pixels reach it. Its new tests explicitly include a requested 8192 px case whose source is only 1122×1402 and an 8192→4096 downsample. It does not generate a new character, improve facial geometry automatically, or alter the hosted Site.

## Remaining work

1. Complete exact-source English scans for native WORLDIFACT, pinned Chess/Terra and locate the real editable source for 8 Planets.
2. Keep hosted Froge internal UI localization BLOCKED rather than faking a translation in the parent iframe.
3. Continue model-quality work only against preserved originals: hair/root continuity, face/neck/jaw/shoulders, hands, garment intersections, UV/PBR evidence and GLB/FBX reimport/material preservation.
4. Check CI for every changed head and keep the draft unmerged/unpublished until the reviewed scope receives explicit release approval.
5. On the fifth continuation provide the consolidated Polish GO/NO-GO report; no contest submission is authorized here.

## Historical production evidence retained

PR #27: https://github.com/teslaeco/WORLDIFACT/pull/27

Deployed integration merge: `e2446816708783532a26c2c949c733e19ca84e96`

Production Shop: https://worldifact.xodobrox.workers.dev/shop

Verified deployment run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35154269208

Earlier native Astra/Oracle generated-artifact evidence remains historical and is not a new quality test. The previous native WORLDIFACT paid ceiling is not extended or re-armed by this work.

## Truth boundary

Distinguish DEPLOYED, SOURCE IMPLEMENTED, TESTED, OWNER-REPORTED and UNKNOWN/BLOCKED. Never call a linked Studio a migrated backend, preview cleanup a proven likeness improvement, pixel-size metadata new texture detail, test fixtures real generated models, HTTP success a device pass, or an unreviewed MAKE candidate manufacturing-ready.
