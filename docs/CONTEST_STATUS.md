# WORLDIFACT status — 17 September 2026

## Review scope and production boundary

English UI and model/texture quality work is in **draft PR #28**, branch `work/five-hour-quality-english-20260917`; it is **not merged or deployed**. The owner requested five bounded continuations and then an interactive continuation. That interactive pass does not restart or extend the schedule.

The existing hosted-generator integration from PR #27 remains the production baseline: merge `e2446816708783532a26c2c949c733e19ca84e96`, production https://worldifact.xodobrox.workers.dev/shop, exact original https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/. No older repository snapshot was deployed over it.

Coordination: [QUALITY_EN_SHIFT.md](QUALITY_EN_SHIFT.md). Detailed language ownership: [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md). Prior detailed evidence is preserved at https://github.com/teslaeco/WORLDIFACT/blob/acb877dd45e239d85c3f81edd85cd91698865944/docs/CONTEST_STATUS.md.

## Current evidence

| Item | Status | Evidence / limitation |
|---|---|---|
| ISS English | SOURCE IMPLEMENTED / TESTED | Static UI/help/accessibility, all eight repair tasks, tools/state, runtime HUD/actions/errors, canvas signs and Model Context copy; task IDs, mechanics and version-2 saves preserved |
| Native WORLDIFACT / Lab English | SOURCE GUARDED | Home, Portal, Shop, Workbench, Control, P0GameLab, document and portal configuration; user data and optional language catalogs untouched |
| Chess source and actual route | DRAFT FIX / TESTED | Reviewed pin `705d7b0fe5fff03a5d7975fe094804af1eef44ea` from Chess PR #143. Removed the automatic external redirect that bypassed it; `/chess` now renders the copied guest app. Original website remains an explicit link |
| Native 8 Planets | ENGLISH ENTRY VERIFIED IN SOURCE | Actual default route renders native PlanetsWorld, eight English stages and a mini-test tab. Full campaign remains PLANNED. Older inventory's external-only description was corrected |
| External FORGE World Builder | EDITABLE SOURCE BLOCKED | It is a separate prototype link, not the native default Planets view. Internal translation is not claimed |
| Active Shop integration | PRESERVED / ROUTING REGRESSION ADDED | Exact hosted Studio and permanent open links, including direct PortalPage fallback; removed the retired native prompt-only fallback |
| Hosted Studio internal English | BLOCKED/UNKNOWN | Canonical source parity/access unavailable. Review-snapshot English is not a live-Site translation |
| Terra English | PARTIAL SOURCE BATCH | Draft upstream PR #271 head `4a34ce18fe552f19aaa2e604b50260ecba5b40c8` translates gallery/404/multi-angle with NOAA/Copernicus provenance preserved. Four workflows pass; many standalone pages remain Polish. WORLDIFACT still uses reviewed older Terra pin `ae90f7367587e0973782c470cde3f5103c0540fc`; no unsafe broad repin |
| Model lifetime / resources | SOURCE IMPLEMENTED / TESTED | Source-bound model slot rejects late old-session GLBs; shared geometry/material/PBR textures dispose once |
| GLB framing | SOURCE FIX / CPU PROJECTION TESTED | Eight bounds corners fit vertical/horizontal FOV with margin. Orbit distance limits cannot undo a narrow-screen fit. Face detail is no longer limited by whole-body minimum distance. Front/left/right/back presets, selected-view resize handling and manual-orbit preservation added |
| GLB framing truth boundary | NO MESH / TEXTURE QUALITY CLAIM | Tests use math plus real Three camera projection matrices on CPU, not WebGL/device rendering or generated-identity comparison. Authored +Y up / +Z front assumed; detail regions approximate |
| Froge quality source | DRAFT PR #16 / FULL CI PASS | Fresh head `d3f61b842dcfeda2ed794210caafc391919a75be`; run `35175731409` passes complete frontend suite/build plus Python and official-Blender fixture paths |
| Froge stale-job protection | SOURCE FIX / REGRESSION PASS | New generation epoch/pending-job protection prevents previous status/GLB reads from winning during a new POST, including online-event retries. POSTs are not automatically repeated. Snapshot only; live Studio unchanged |
| Texture / FBX / rooted hair | MEASURED PARTIAL EVIDENCE | Actual source/export pixels distinguished from requested 4K/8K; no-upscale policy; real FBX reopen, UV/material structural checks; hair_lock root-ring/scalp positive and negative controls. Not photographic likeness, natural hairline or full cross-format PBR equivalence |
| WORLDIFACT current runtime tests | PASS | Code head `acb877dd45e239d85c3f81edd85cd91698865944`, run `35175826470`: 126/126 tests, lint 9 warnings/0 errors, TypeScript, local HTTP, build, pinned foundations, Worker dry-run and read-only hosted HEAD (200) |
| New paid operations | NONE | No new paid AI/GPU model generation, quota change, secret change, private archive bypass, Oracle installation, merge or deployment in the interactive pass |
| Final contest release | PREVIOUS NO-GO GATES STILL OPEN | Canonical-source/device generation, incomplete hosted/static English, controlled visual quality and final form/media checks unresolved; this is not a newly verified competition decision |

## Interactive changes and proof

`src/lib/modelFraming.ts` is pure, scale-aware camera math. It rejects invalid/nonfinite bounds and camera inputs, fits all eight corners of the selected region, and derives clipping/orbit limits from that actual fit. `OracleModelPreview.tsx` uses it without modifying model geometry, texture resolution or material data.

New tests: six local/pure framing cases, two actual Three projection-matrix cases, and four server-rendered portal entry cases. The six dependency-free math tests also passed locally under Node 22 strip-types. Full repository verification ran in GitHub; local GitHub DNS was unavailable. These checks are explicitly not Android/browser evidence.

Portal regressions prove copied Chess entry, correct hosted-Shop fallback, native English Planets entry, and preserved ISS/Terra separation. They check the routed components rather than assuming that a foundation metadata record determines visible behavior.

## Fresh upstream verification

Froge PR #16: https://github.com/teslaeco/Froge-MPC-2-test/pull/16

The previously failed full run `35175335899` showed 239 passing / 4 failing frontend tests, including a real old-job race. Newer source at `d3f61b...` fixes it; exact-head run https://github.com/teslaeco/Froge-MPC-2-test/actions/runs/35175731409 passes frontend, Python 3.12 and Python 3.9 plus official Blender 4.3 checks. Old failed runs remain historical evidence, not green results. This interactive pass inspected that separately advancing upstream work without overwriting it.

WORLDIFACT runtime verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35175826470. Later documentation commits require their own final-head CI read before handoff; they do not change the verified runtime sources.

## Remaining work and release boundary

Continue bounded authored-source translations, review all actual default entry paths, and obtain canonical hosted-source parity before deploying internal Studio changes. Do not replace the live generator, claim a complete English UI through a translated wrapper, or label 4K/8K requests as recovered detail.

Keep WORLDIFACT PR #28, Chess PR #143, Froge PR #16 and Terra PR #271 review-only until the applicable release decision. No competition submission is performed. Quality means measured output improvements, not passing metadata alone; visual identity/anatomy, natural hair, complete PBR equivalence and manufacturing approval remain separate unproven gates.
