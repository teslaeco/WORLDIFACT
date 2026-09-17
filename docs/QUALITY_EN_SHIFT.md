# Five-hour quality and English work session

Date: 17 September 2026 (Europe/Amsterdam). Owner: Sebastian.

## Coordination

- Branch: `work/five-hour-quality-english-20260917`.
- Draft PR: https://github.com/teslaeco/WORLDIFACT/pull/28
- Base: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`.
- Editor: **IDLE — continuation 2 complete. A later continuation may claim this marker before editing.**
- Scheduled continuations completed: **2 of 5**.
- Next task: continue preserved-original 3D quality work, especially UV/PBR material survival through GLB/FBX export and reimport, then tackle reviewable-source Froge English without claiming the older GitHub snapshot is the live Site.

## Non-negotiable continuity

Keep `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` as the active generator reached from WORLDIFACT `/shop`. PR #27 is deployed. Do not recreate it, use `forge-studio-public` as a replacement, or overwrite the hosted Studio with an older GitHub snapshot.

Canonical hosted Froge source editing remains **BLOCKED/UNKNOWN** in this work stream. The reviewable GitHub runtime is useful for source-only improvements, but its parity with the newer private Site is not proven. No archive/authentication bypass is allowed.

## Continuation 1 — retained evidence

- ISS static UI/help/accessibility copy, all eight repairs/tools/state messages, runtime HUD/actions/errors, in-world signs and Model Context copy were translated to English while preserving task IDs, mechanics and version-2 saves.
- WORLDIFACT model preview lifetime was made source/session-bound so stale/late GLBs cannot replace the current preview; released shared geometry/material/texture resources dispose once.
- Draft Froge PR #16 introduced truthful texture-resolution evidence: requested 4K/8K is separated from actual source/export pixels and no upscaling is counted as recovered detail.
- WORLDIFACT code head `f2d7f9000e9194ae93c973967a3f597a8a1ba02a` passed run `35163081507` with 108/108 tests, TypeScript, HTTP smoke, build, foundation assembly and Worker dry-run; lint had nine warnings and zero errors.

## Continuation 2 — completed changes

### English enforcement on real shipped sources

Added `scripts/lib/english-ui.mjs` and `tests/english-ui.test.mjs`.

The guard is deliberately bounded to authored interface text. It checks explicit English document language and a curated set of high-signal Polish UI phrases that occurred in earlier builds. It intentionally ignores user prompts/data, scientific identifiers, provenance fields, model/job names and proper nouns.

`tests/english-ui.test.mjs` now covers the native WORLDIFACT shell and AI Game Lab source: `index.html`, Home, Portal, Shop, Workbench, Control, `P0GameLab` and portal configuration.

`scripts/build-foundations.mjs` now checks the *compiled output* of the exact pinned Chess and Terra builds before copying them into WORLDIFACT. A future pinned build that reintroduces the guarded Polish interface phrases or loses `lang=en` fails foundation assembly instead of silently shipping mixed-language UI.

Material code commits for this package include:

- `cad51fad82bd0921b3f8e79bb63fe45180bac161` — bounded English guard;
- `bfe9298c208faf31576a3c45440a162743509009` — guard unit tests;
- `fae365ba2618dd697bc56284d99820b65d0da02e` — enforce guard on compiled Chess/Terra output;
- `9761b8293accb3343834cea8d078b1268fcb54be` — native WORLDIFACT/Game Lab regression coverage.

### Exact-source language evidence

- **Chess:** exact pinned commit `e134964e9c8b7edc43c26b508973f6fb658af90d` is the signed `Fix remaining mixed-language Cube judge UI (#141)` change. `guest.html` declares English and exact `web/auth/AuthGate.js` contains English account/auth/guest labels. A high-signal Polish UI search returned no matches.
- **Terra:** exact pinned commit `ae90f7367587e0973782c470cde3f5103c0540fc` has `web/index.html` with `lang=en`, English metadata/title/project link, and no matches for the same high-signal Polish UI search. Scientific/data-contract identifiers are not renamed.
- **8 Planets:** integration records identify recovered source revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but the connected GitHub search does not expose an editable repository/source for that revision. Exact URL/revision searches only resolve WORLDIFACT integration records. Internal localization therefore remains **BLOCKED**, not faked through the parent iframe.
- **AI Game Lab / native shell:** first-party authored UI is now covered by the source regression guard.
- **Hosted Froge:** reviewable GitHub `ModelStudio.tsx` still contains Polish product copy, which further confirms that wrapper English cannot be described as a translation of the live cross-origin Studio. The live canonical source remains inaccessible here.

See [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md) for the source-by-source ledger.

### 3D / texture quality evidence

Froge PR #16 remains draft/source-only. Its head `9cfc57f7f57b67a6ceb468e4025c32b53d8fa881` passed workflow run `35163335466` (`Oracle Codex MCP (no paid API)`). The workflow covers Python 3.9/3.12 regressions, real Codex/Code Mode MCP fixtures, official Blender 4.3 build/render/FBX checks and packaging without a paid API call.

Inspection of the newer source also confirmed that `runtime/couture_qa.py` already checks garment/body containment, free-hand garment crossings, fan apertures, grip contacts, packed GLB textures, UV retention, portrait anatomy metadata and GLB reimport. It explicitly leaves `likeness_assessed=false` and `print_readiness_assessed=false`. Real UV/PBR appearance and FBX material preservation still need stronger review; no new likeness claim is made.

## Verification state for continuation 2

A new WORLDIFACT CI run was started for the English guard package. The last observed run for the material head was `35167247789`; `npm run verify` had started successfully and foundation assembly was pending/in progress at the checkpoint update. A later continuation must read the completed result before treating this package as verified. Do not substitute earlier run `35163081507` for the new material changes.

## Remaining quality priorities

1. Add/strengthen preserved-original export evidence for UV/PBR materials through GLB/FBX reimport without inventing visual quality.
2. Continue anatomy/garment quality only where real source and Blender validation exist: hair/root continuity, face/neck/jaw/shoulders, hands and clothing intersections.
3. Translate reviewable Froge source in a source-only PR where safe, but never present it as live until canonical Site parity and deployment are verified.
4. Translate the real 8 Planets source only when editable source access is restored.
5. Keep PR #28 and Froge PR #16 unmerged/unpublished until explicit release approval.

No new paid API/GPU generation, quota increase, secret change, Oracle installation, private archive access, model download, merge, production deployment or contest submission occurred in continuation 2. No separate Codex/Copilot cloud agent was launched; work was executed through connected GitHub tools.

## Continuation protocol

Read current main/PR, `AGENTS.md`, `CONTEST_STATUS.md`, `LANGUAGE_AUDIT.md` and this checkpoint. Claim the editor marker, take the next incomplete package, make actual source/test changes, check current-head CI, update the ledger, increment the count exactly once, and return the marker to IDLE. Reuse WORLDIFACT PR #28. Keep Froge PR #16 draft/review-only unless later explicitly authorized for merge/deployment.

After continuation 5 provide the consolidated Polish GO/NO-GO report with actual changes/tests/SHA/PRs, remaining source-access and visual-quality blockers and costs. Do not extend the work window or start another schedule.
