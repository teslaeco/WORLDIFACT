# Five-hour quality and English work session

Date: 17 September 2026 (Europe/Amsterdam). Owner: Sebastian.

## Coordination

- Branch: `work/five-hour-quality-english-20260917`.
- Draft PR: https://github.com/teslaeco/WORLDIFACT/pull/28
- Base: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`.
- Editor: **ACTIVE — continuation 1 is translating the remaining ISS runtime/canvas UI and then recording an all-world language inventory. Do not edit this branch concurrently.**
- Scheduled continuations completed: **0 of 5**. Planned starts: 01:31, 02:31, 03:31, 04:31 and 05:31 CEST on 17 September. These are hourly resumptions, not continuous background execution.
- Next task: finish ISS dynamic/canvas English and begin the all-world language inventory; then advance genuine source-level model/texture work using the newer Froge branch below.

## Non-negotiable continuity

Keep `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` as the original active generator reached from WORLDIFACT /shop. PR #27 is deployed. Do not recreate it, use forge-studio-public as a replacement, or overwrite the hosted Studio with an older GitHub snapshot. Quality work is now requested; migration is not.

GitHub read/write/CI tools work. Local shell initially had no network DNS and no Blender/Codex executable. No canonical hosted-source editing connector or direct Codex/Copilot execution action was found in capability discovery. Respect prior browser/private-archive access blocks; do not claim unavailable render checks were run. No separate coding agent has been launched during the root stage.

## Important newer Froge source discovery

Do not stop at the old Froge `main` (`bac2827fc1ec31e71dc0f5c586df43c507338725`). The newer source branch **`teslaeco/Froge-MPC-2-test:codex/v27-mcp-startup-audit`** was verified at **`735058af6e53a2e44f417b5dcf864f62bd334bb2`**. Read its current head again before making an upstream branch.

- Froge PR #15 merged saved-model history improvements into this branch (69 tests reported): visible current/older models, pagination, R2 availability, saved reads independent of Oracle connection. This was explicitly source-only, not a hosted Site release.
- Froge PR #11 merged v35 release/quality-acceptance corrections into the same branch. Previous CI reports 150 tests per Python 3.9/3.12 and actual Blender/GLB/FBX/atlas checks. v34 had a version mismatch and is superseded by v35. Neither that merge nor the tests prove installation on the owner's Oracle server.
- Froge PR #12 is an unmerged E19 anatomy/product-review draft. Do not merge it or copy its private/source models blindly; the output remains quality-unapproved.
- Read `AGENTS.md` and the first section of `docs/WORK_CHECKPOINT.md` at the newer branch. Current metadata supersedes contradictory historical paragraphs.
- The source checkpoint records private hosted Studio v47/source `e3d60697db43744f6c09157328560c66a031f9a2`, Git source HTTP500/timeouts and archive/model access controls. Actual current hosted parity remains UNKNOWN. No canonical Site source is available from this session. Do not deploy the older snapshot over the live multi-photo/Codex UI.

This newer branch permits useful source/runtime investigation and isolated upstream patches/tests. It does NOT authorize pretending those patches are live. Keep a separate upstream draft PR only if a concrete regression is fixed; reference it from WORLDIFACT's ledger. Preserve licenses and original data.

## Execution scope

Implement source fixes, tests and reviewable commits/PR. Preserve originals and saved jobs. No paid AI/API/GPU generation, quota increases, new server provisioning, secret changes, orders, or contest submission. No automatic merge/deployment of new quality/localization changes without approval covering them. Existing hosted Studio stays available and unchanged while the changes are reviewed.

## Work packages and progress

1. **Integration continuity — initial checks complete.** Correct hosted URL and PR #27 remain untouched; root's read-only CI probe got HTTP200. This is not proof of iframe login or generation.
2. **ISS English — PARTIAL.** Root translated `public/apps/iss/index.html` and `game-state.js`: static controls, dialogs/help, aria labels, HTML lang=en, eight tasks/tool names/state errors. Next translate remaining runtime text in `public/apps/iss/game.js`, canvas labels in `geometry.js` and any authored text in `astronaut.js`/other source. Keep IDs, save version2, task order, part counts, collision positions and simulation disclaimers unchanged.
3. **Other worlds — TODO.** Inventory all first-party source strings and pinned/copied Chess/Terra build inputs, native Planets/Lab, all tabs/forms/errors/tooltips. Parent English does not translate a cross-origin frame. Preserve user prompts/model names/observed data and document external-source gaps rather than injecting misleading translations.
4. **Model/texture quality — first reliability fix complete, fidelity work TODO.** Root fixed WORLDIFACT `OracleModelPreview.tsx` repeated GLB loads caused by `person` effect dependency, source-specific state, late model cleanup and duplicate texture disposal. New `src/lib/modelSlot.ts` owns each preview's lifetime; existing `disposeObject` is reused. This is NOT a patch to the external Studio, not new geometry and not proof of improved likeness. Continue with actual image dimensions, UV/PBR/export checks and newer Froge runtime validation. Preserve the viewer's original adaptation attribution: `teslaeco/Froge-MPC-2-test/src/components/AiModelViewer.tsx` (MIT).
5. **Final evidence — TODO.** Current-head lint/typecheck/tests/HTTP/build/foundations/Worker dry-run; language coverage list and untested/blocked device/runtime parts. After the fifth continuation report actual changes and remaining gates; stop expanding scope.

Quality priorities from reference/report: hair silhouette and strands; face/neck/jaw/shoulder proportions; hands; clothing intersections; actual UV/PBR images; wrong-job preview prevention; export/reimport materials. Owner screenshots report 2048 skin and 512 other maps despite larger requested output. Do not invent 4K/8K detail or replace an original with a synthetic illustration. Structural tests and measured pixel counts do not prove visual fidelity or manufacturing readiness.

## Root first-stage verification — completed

- Code head: `daf94e66df65356fd5e19da0049b4d85535535a3`.
- CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35158775458
- Job `105004399880`: SUCCESS. **107/107 tests passed**, lint (9 warnings, 0 errors), TypeScript, HTTP smoke, build, pinned Chess/Terra foundation assembly and Worker dry-run passed.
- Added `tests/iss-english.test.mjs`: HTML language/DOM hooks, fixed task IDs/order, full eight-task completion with six consumed parts, version2 old-save compatibility.
- Added `tests/model-slot.test.ts`: old-session late results, released-object rejection and one-time shared geometry/material/texture disposal.
- Hosted Studio probe returned HTTP200, generation NOT_TESTED, browserEmbedding UNKNOWN. No paid request performed.
- Follow-up changes after this tested code head are checkpoint/status documentation only. Check final current-head CI rather than assuming later edits inherit a green result.
- No merge, production release, Oracle update, private model download or generated-model quality pass during this stage.

## Continuation protocol

Read this checkpoint, current main/PR, AGENTS.md and CONTEST_STATUS.md. Take the next incomplete package; do not repeat an audit without new risk. Execute actual code changes and tests, then persist the checkpoint and release the editor marker. Increment continuation count exactly once per scheduled run. Reuse PR #28 for WORLDIFACT. Use an upstream draft only for a concrete non-overlapping generator fix on the correct newer source branch.

On the fifth continuation produce a consolidated Polish report: implemented changes, actual tests/counts, source/PR/commit links, hosted source status, remaining English strings/quality gaps, cost usage and GO/NO-GO for the reviewed scope. Do not claim a continuously running multi-agent process, start new schedules or silently extend the work window.
