# Five-hour quality and English work session

Date: 17 September 2026 (Europe/Amsterdam). Owner: Sebastian.

## Coordination

- Branch: `work/five-hour-quality-english-20260917`.
- Draft WORLDIFACT PR: https://github.com/teslaeco/WORLDIFACT/pull/28
- Base: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`.
- Editor: **IDLE — continuation 2 complete. A later continuation may claim this marker before editing.**
- Scheduled continuations completed: **2 of 5**.
- Latest verified WORLDIFACT code head before this documentation-only checkpoint: `8b53331195d22de1d2b1dd770fa92b698592ea76`.
- Verification: run `35168300680` completed successfully.
- Next task: continue source-level quality/localization work without touching the live Froge Site: prioritize remaining Terra static subpages, reviewable Froge English, and anatomy/PBR evidence where real Blender validation exists.

## Non-negotiable continuity

Keep `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` as the active generator reached from WORLDIFACT `/shop`. PR #27 is deployed. Do not recreate it, use `forge-studio-public` as a replacement, or overwrite the hosted Studio with an older GitHub snapshot.

Canonical hosted Froge source editing remains **BLOCKED/UNKNOWN** in this work stream. The reviewable GitHub runtime is useful for source-only improvements, but its parity with the newer private Site is not proven. No archive/authentication bypass is allowed.

## Continuation 1 — retained evidence

- ISS static UI/help/accessibility copy, all eight repairs/tools/state messages, runtime HUD/actions/errors, in-world signs and Model Context copy were translated to English while preserving task IDs, mechanics and version-2 saves.
- WORLDIFACT model preview lifetime became source/session-bound so stale/late GLBs cannot replace the current preview; released shared geometry/material/texture resources dispose once.
- Draft Froge PR #16 introduced truthful texture-resolution evidence: requested 4K/8K is separated from actual source/export pixels and no upscaling is counted as recovered detail.
- WORLDIFACT code head `f2d7f9000e9194ae93c973967a3f597a8a1ba02a` passed run `35163081507` with 108/108 tests, TypeScript, HTTP smoke, build, foundation assembly and Worker dry-run; lint had nine warnings and zero errors.

## Continuation 2 — completed changes

### 1. English localization now distinguishes defaults from legitimate translated catalogs

Added/expanded:

- `scripts/lib/english-ui.mjs`;
- `tests/english-ui.test.mjs`;
- `scripts/build-foundations.mjs`;
- `.github/actions/foundations/action.yml`;
- reviewed foundation pins in `config/foundation-sources.json`.

The guard is deliberately bounded to authored interface behavior. It verifies explicit English document language, a curated set of high-signal Polish UI phrases, a clean English locale catalog/fallback where multiple languages are intentionally bundled, and reviewed runtime source→English translation pairs. It does **not** rewrite user prompts/data, scientific identifiers, provenance fields, model/job names, proper nouns or optional user-selected locale catalogs.

Native WORLDIFACT/AI Game Lab coverage includes `index.html`, Home, Portal, Shop, Workbench, Control, `P0GameLab` and portal configuration.

### 2. Chess: one real Polish runtime defect fixed upstream

The exact earlier pin `e134964e9c8b7edc43c26b508973f6fb658af90d` already had an English document, English auth UI and an English default catalog, while legitimately keeping optional locale catalogs including Polish.

A deeper source audit found one direct non-catalog runtime fallback in `web/main.js`: remote online players were named `Gracz online` even under the English UI.

Focused draft Chess PR #143:

https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/143

- source revision: `705d7b0fe5fff03a5d7975fe094804af1eef44ea`;
- only changes the fallback to `Online player`;
- does not change rules, networking, IDs, saves or rendering;
- workflow run `35167870190` passed typecheck, tests, production build and smoke; deploy/E2E were not run for this review branch.

WORLDIFACT review config now pins this source revision for CI. Nothing is merged or published.

### 3. Terra: real English runtime exists, but static Polish subpages remain

Pinned Terra revision remains `ae90f7367587e0973782c470cde3f5103c0540fc`.

The main document is English, but the source still contains legacy Polish literals. `web/public/contest-runtime.js` explicitly maps reviewed product phrases to English at runtime. CI now verifies required pairs such as Save/Load/Open/Close/Error/Next/Previous/Loading/Advanced/Simple instead of incorrectly treating the translation table itself as untranslated output.

An intentionally broad first attempt also exposed a genuine separate backlog: standalone static pages such as `web/public/eclipse-live/gallery.html` are authored in Polish (`lang=pl`, Polish headings/buttons/errors) and are not automatically converted into English by the main app contract. The foundation guard therefore checks the reviewed main entry/runtime mechanism and records the static-page backlog instead of falsely calling every nested page English.

Continuation 3 should translate those real static pages upstream in bounded batches rather than hiding them behind a wrapper.

### 4. Foundation checkout pins now have one source of truth

Changing the Chess review pin exposed a duplicated hardcoded SHA in `.github/actions/foundations/action.yml`. CI correctly failed because the action checked out the old source while `config/foundation-sources.json` expected the new one.

The composite action now resolves and validates the reviewed Chess/Terra SHAs directly from `config/foundation-sources.json` before checkout. This removes that synchronization bug.

### 5. 8 Planets and hosted Froge localization boundaries

- **8 Planets:** records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but the connected GitHub search exposes no editable source for that revision. Internal localization remains **BLOCKED**, not faked through the parent iframe.
- **Hosted Froge:** reviewable GitHub `ModelStudio.tsx` still contains Polish product copy, confirming that English WORLDIFACT wrapper text is not equivalent to live Studio localization. Canonical hosted Site source/parity remains inaccessible here, so no stale snapshot is deployed over it.

See [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md) for the source-by-source ledger.

## 3D / texture quality evidence in continuation 2

Draft Froge source PR #16:

https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Current review head: `ab5b6523c45dfc45cddeffe35d979290a38d9d72`.

Besides truthful source/export texture-resolution reporting, continuation 2 added a real Blender FBX round-trip gate in `oracle_connector/runtime/scene_exports.py`:

- Blender reopens the exported `model.fbx`;
- the export is rejected if reimport has no mesh, non-finite geometry, loses authored material names, or loses all UVs when the source had UVs;
- a failed artifact is deleted and removed from advertised formats instead of being labelled ready;
- success records reimport mesh/material counts and UV presence;
- `pbr_shader_equivalence_verified=false` and `likeness_assessed=false` remain explicit because structural reimport does not prove visual equivalence or identity likeness.

No-paid workflow run `35167461563` passed for this head. It includes Python 3.9/3.12 regressions, fixture Codex→MCP work, official Blender 4.3, actual Blender geometry/render/FBX paths, anatomy/atlas helpers and package build. It does **not** prove photographic likeness or print readiness.

Reviewable `runtime/couture_qa.py` also already checks garment/body containment, free-hand garment crossings, fan apertures, grip contacts, packed GLB textures, UV retention, anatomy metadata and GLB reimport while explicitly leaving likeness/print readiness unassessed.

## Final continuation-2 verification

Latest verified WORLDIFACT code head: `8b53331195d22de1d2b1dd770fa92b698592ea76`.

Run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35168300680

Result: **PASS**.

- `npm run verify`: PASS;
- 114/114 tests: PASS;
- lint: nine warnings, zero errors;
- TypeScript: PASS;
- local HTTP DEMO smoke: PASS;
- production build: PASS;
- reviewed Chess `705d7b0...` and Terra `ae90f73...` foundation checkout/build/assembly: PASS;
- Worker `deploy:check`: PASS;
- hosted Froge read-only diagnostic: PASS without generation.

Earlier red runs in this continuation were diagnostic and fixed rather than bypassed: first an over-broad language scan treated legitimate localization data as displayed UI; later duplicate foundation pin sources caused the old Chess SHA to be checked out. Both causes were corrected before the final green run.

## Remaining priorities

1. Translate real Terra standalone/static subpages upstream in bounded batches; `eclipse-live/gallery.html` is a confirmed Polish example.
2. Continue reviewable Froge English only as source-only work until canonical Site parity exists.
3. Continue anatomy/garment quality where real Blender validation can measure something concrete: hair/root continuity, face/neck/jaw/shoulders, hands and clothing intersections.
4. Strengthen material evidence beyond structural FBX reimport where possible, while never claiming every glTF/Blender PBR channel survives FBX equivalently without proof.
5. Translate real 8 Planets source only when editable source access is restored.
6. Keep WORLDIFACT PR #28, Chess PR #143 and Froge PR #16 unmerged/unpublished until explicit release approval.

No new paid API/GPU generation, quota increase, secret change, Oracle installation, private archive access, model download, merge, production deployment or contest submission occurred in continuation 2. No separate Codex/Copilot cloud agent was launched; work was executed through connected GitHub tools.

## Continuation protocol

Read current main/PR, `AGENTS.md`, `CONTEST_STATUS.md`, `LANGUAGE_AUDIT.md` and this checkpoint. Claim the editor marker, take the next incomplete package, make actual source/test changes, check current-head CI, update the ledger, increment the count exactly once, and return the marker to IDLE. Reuse WORLDIFACT PR #28. Keep upstream quality/localization PRs review-only unless later explicitly authorized for merge/deployment.

After continuation 5 provide the consolidated Polish GO/NO-GO report with actual changes/tests/SHA/PRs, remaining source-access and visual-quality blockers and costs. Do not extend the work window or start another schedule.
