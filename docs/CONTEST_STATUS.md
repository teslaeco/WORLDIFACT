# WORLDIFACT status — five-pass English and 3D quality review complete

Date: 17 September 2026.

## Final review state

The requested five bounded continuations are complete on draft WORLDIFACT PR #28, branch `work/five-hour-quality-english-20260917`. Nothing in this five-pass quality/localization work is merged or production-deployed.

Production `main` remains `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`. The deployed generator baseline remains PR #27 / merge `e2446816708783532a26c2c949c733e19ca84e96`, pointing to the exact owner-selected original Studio:

**https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/**

Do not substitute `forge-studio-public` or the review repository for that live app.

## Five-pass deliverables

| Area | Final status | Evidence / limitation |
|---|---|---|
| WORLDIFACT PR #28 | DRAFT / CI PASS / NOT DEPLOYED | Runtime head `aa366400ee51875a9b1cf0ff3f85cccdfd7ce909`; run `35178690232` passes 129/129 tests, lint 9 warnings/0 errors, TypeScript, HTTP smoke, production build, reviewed foundations, Worker dry-run and read-only Studio probe |
| Shop integration | SOURCE FIX / TESTED | PR #28 now incorporates the same safe product decision as review-ready PR #29: no authenticated Froge iframe. A top-level Shop opens the exact original Studio with `location.replace`; `_top` and new-tab manual links remain; no query/hash/token forwarding, auto-login, cookie copying, Oracle reconnect or paid request |
| Owner Android failure | OBSERVED / ROOT CAUSE PARTIAL | Screenshots proved the embedded session asked for sign-in and did not see its saved Oracle connection. They do not prove an old generator deployment or broken Oracle server. The failing iframe path is removed in source; logged-in production Android retest remains pending |
| ISS English | SOURCE IMPLEMENTED / TESTED | Static UI/help/accessibility, all eight repairs/tools/state, runtime HUD/actions/errors, in-world signs and Model Context copy are English. Task IDs, mechanics and version-2 saves preserved |
| Chess English | DRAFT UPSTREAM / TESTED | Chess PR #143 head `705d7b0fe5fff03a5d7975fe094804af1eef44ea`, run `35167870190` PASS. WORLDIFACT `/chess` uses the reviewed copied build; direct `Gracz online` fallback becomes `Online player`; optional locale catalogs preserved |
| Native 8 Planets English | SOURCE VERIFIED / TESTED | Default `/planets` is native WORLDIFACT source with English headings, all eight stages and Mini test. Full campaign remains PLANNED |
| External FORGE World Builder English | BLOCKED | Canonical editable source unavailable. It remains a separate prototype link; no wrapper-based fake translation claim |
| Terra English | PARTIAL UPSTREAM / TESTED | Terra PR #271 head `4a34ce18fe552f19aaa2e604b50260ecba5b40c8` translates gallery/404/multi-angle source. Runs `35169328621`, `35169328579`, `35169328498`, `35169328503` PASS. Many standalone pages still Polish; WORLDIFACT does not broad-repin newer Terra main |
| AI Game Lab English | SOURCE GUARDED | Native Home/Portal/Shop/Workbench/Control/P0GameLab/portal definitions are English-regression guarded |
| Correct model for jobId | REVIEW-SOURCE FIX / FULL CI PASS | Froge PR #16 head `d3f61b842dcfeda2ed794210caafc391919a75be` prevents old status/model reads from winning after a newer generation starts; reconnect events cannot restart the old job while the new POST is pending; POST is not automatically repeated |
| Archive/original preservation | PRESERVED | Five-pass work does not delete/overwrite saved user models, prompts, account data or private archives; no auth bypass was attempted |
| Texture truth | MEASURED PARTIAL EVIDENCE | Requested 4K/8K is separated from actual source/export pixels; no-upscale policy preserved; source/export maxima, counts and downsampling recorded in Froge review source |
| GLB/FBX/UV/materials | STRUCTURAL TESTED | Real Blender FBX reopen checks finite geometry, authored material names and UV presence when expected; GLB texture/UV/material and atlas/nested-material regressions pass. Full visual shader equivalence remains unproven |
| Hair/scalp | STRUCTURAL MEASURED | `hair_lock()` first root ring is measured against evaluated scalp; positive control passes and same mesh translated 0.6 scene units fails with larger gap. `likeness_assessed=false`; separate hair builders not all covered |
| WORLDIFACT GLB review camera | SOURCE TESTED | Scale/aspect-aware eight-corner fitting, front/left/right/back plus approximate face/clothes/shoes views, resize handling and manual orbit preservation. This improves inspection, not the generated mesh itself |
| Face/neck/hands/identity | NOT PROVEN | No controlled photographic likeness pass for face, neck, jaw, shoulders, hands, natural hairline or full reference fidelity |
| Paid operations | NONE | No paid API/GPU generation, budget/quota increase, secret change, Oracle install, private archive bypass, order or supplier message |
| Contest submission | NOT SUBMITTED | No form, launch, media post or contest entry sent in this work |

## Fresh upstream review state

### Froge MPC 2 review source

PR: https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Head `d3f61b842dcfeda2ed794210caafc391919a75be` remains open/draft/mergeable. Exact no-paid workflow `35175731409` and saved model history `35175731405` pass. Frontend full regression, Python 3.12, Python 3.9 + official Blender 4.3 build/render/FBX/hair/anatomy/material/board/package checks are green.

Canonical live-Studio source parity remains **BLOCKED/UNKNOWN**. Do not represent this as a live deployment or publish the snapshot over the current Site.

### Chess

PR #143 remains open/draft/mergeable at `705d7b0fe5fff03a5d7975fe094804af1eef44ea`; run `35167870190` passes.

### Terra

PR #271 remains open/draft/mergeable at `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`; four review workflows pass. It is based on newer Terra main than WORLDIFACT's reviewed pin, so a wholesale repin remains a deliberate-review task, not an automatic continuation action.

### Shop entry repair

PR #29 remains open, review-ready and unmerged at `5080dd450eca746e93610b3ef133c927e06be38b`; run `35177396129` passes. PR #28 now carries the same no-iframe Shop behavior so the larger quality/localization branch cannot reintroduce the bad embedded path. If one branch is merged later, the other must be rebased/reconciled before any subsequent merge; do not merge both blindly.

## GO / NO-GO

**GO — review/source quality:** the five-pass source work is coherent and CI-green at runtime head `aa366400...`. The no-iframe Shop decision is reconciled, English defaults are improved where editable source exists, and structural 3D reliability evidence is materially stronger.

**GO — scoped Shop repair candidate:** PR #29 is the smallest isolated production repair candidate if separately approved for merge/deploy. This five-pass run does **not** perform that release.

**NO-GO — claim “all five worlds and every subpage are fully English”:** canonical hosted Froge internals and external FORGE builder source remain inaccessible; Terra standalone pages remain partly Polish.

**NO-GO — claim “model quality is finished / sale-ready”:** identity likeness, natural hairline, face/neck/jaw/shoulders/hands, full cross-format PBR appearance and manufacturing readiness remain unproven.

**NO-GO — final contest submission/release based solely on this work:** authenticated production-device validation, remaining localization gaps, visual quality proof and final contest/media gates still require separate checks and approvals.

## Release order recommendation

1. If the immediate Android Shop problem is the priority, review and release only PR #29 first.
2. Rebase/reconcile PR #28 after any #29 merge, re-run full CI, then review the broader English/quality changes separately.
3. Keep Chess #143, Froge #16 and Terra #271 review-only until each source/release decision is explicit.
4. Do not enable paid generation merely to validate navigation or localization.

## Truth boundary

Keep `SOURCE IMPLEMENTED`, `TESTED`, `DEPLOYED`, `OWNER-OBSERVED`, `BLOCKED` and `UNKNOWN` separate. HTTP 200 is not sign-in or generation proof; CPU projection tests are not physical Android QA; a structural FBX reopen is not full PBR visual equivalence; an 8K request is not 8K detail without real source pixels; root/scalp distance is not photographic likeness.
