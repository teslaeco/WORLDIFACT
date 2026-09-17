# Five-hour quality and English work session

Date: 17 September 2026 (Europe/Amsterdam). Owner: Sebastian.

## Coordination

- Branch: `work/five-hour-quality-english-20260917`.
- Draft WORLDIFACT PR: https://github.com/teslaeco/WORLDIFACT/pull/28
- Base: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`.
- Editor: **IDLE — continuation 3 complete. A later continuation may claim this marker before editing.**
- Scheduled continuations completed: **3 of 5**.
- Latest verified WORLDIFACT code head remains `8b53331195d22de1d2b1dd770fa92b698592ea76` because continuation 3 changed only upstream Terra source plus review documentation.
- WORLDIFACT verification retained: run `35168300680` completed successfully.
- Next task: prioritize measurable Froge/Blender structural quality (hair-root continuity, anatomy/garment intersections, material evidence) and another bounded English-source batch. Keep the live Froge Site untouched.

## Non-negotiable continuity

Keep `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` as the active generator reached from WORLDIFACT `/shop`. PR #27 is deployed. Do not recreate it, use `forge-studio-public` as a replacement, or overwrite the hosted Studio with an older GitHub snapshot.

Canonical hosted Froge source editing remains **BLOCKED/UNKNOWN** in this work stream. The reviewable GitHub runtime is useful for source-only improvements, but its parity with the newer private Site is not proven. No archive/authentication bypass is allowed.

## Continuation 1 — retained evidence

- ISS static UI/help/accessibility copy, all eight repair tasks/tools/state messages, runtime HUD/actions/errors, in-world signs and Model Context copy were translated to English while preserving task IDs, mechanics and version-2 saves.
- WORLDIFACT model preview lifetime became source/session-bound so stale/late GLBs cannot replace the current preview; released shared geometry/material/texture resources dispose once.
- Draft Froge PR #16 introduced truthful texture-resolution evidence: requested 4K/8K is separated from actual source/export pixels and no upscaling is counted as recovered detail.
- WORLDIFACT code head `f2d7f9000e9194ae93c973967a3f597a8a1ba02a` passed run `35163081507` with 108/108 tests, TypeScript, HTTP smoke, build, foundation assembly and Worker dry-run; lint had nine warnings and zero errors.

## Continuation 2 — retained evidence

- Added source-aware English UI guards for native WORLDIFACT / AI Game Lab and separated default English UI from legitimate optional locale catalogs.
- Draft Chess PR #143, revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea`, changes the remaining audited direct `Gracz online` fallback to `Online player`; run `35167870190` passed typecheck/tests/build/smoke.
- Foundation checkout SHAs now come from `config/foundation-sources.json`, eliminating the duplicate hardcoded-pin mismatch.
- Draft Froge PR #16 added real Blender FBX reimport checks while explicitly leaving `pbr_shader_equivalence_verified=false` and `likeness_assessed=false`.
- WORLDIFACT code head `8b53331195d22de1d2b1dd770fa92b698592ea76` passed run `35168300680`: 114/114 tests, lint 9 warnings/0 errors, TypeScript, HTTP smoke, production build, reviewed foundation assembly, Worker dry-run and hosted-Froge read-only probe.

## Continuation 3 — Terra standalone English source work

A focused upstream Terra draft PR was created instead of pretending that WORLDIFACT's parent wrapper translates nested static pages:

https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Final review head: `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`.

### Source changes

- `web/public/eclipse-live/gallery.html` now declares `lang=en` and uses English headings, notices, playback controls, facts, dynamic labels and errors.
- Scientific provenance is preserved: the archived manifest path, NOAA source URLs, SHA-256 values, observation/capture UTC semantics and `session.log` / `capture.log` / `provenance.log` evidence remain unchanged.
- `web/public/404.html` now uses English copy while preserving the exact canonical and JavaScript redirect target `/Polar-Sun-Moon-Analysis/`.
- `web/public/multi-angle/index.html` and `app.js` now use English for the place/address form, manual coordinates, search hints, geocoder states, empty/error/result states and satellite metadata labels.
- The official Copernicus STAC endpoint remains exactly `https://stac.dataspace.copernicus.eu/v1/search`; bbox, collection, date, cloud-cover and sorting semantics were not changed.
- `web/staticEnglishPages.test.mjs` guards the translated standalone surfaces plus the NOAA/Copernicus provenance/endpoint invariants.
- Existing Python gallery evidence tests were updated only from the old Polish truth statement to its English equivalent; archived-frame/source/hash/log assertions remain.

### CI failures found and fixed, not hidden

1. The first test file was placed inside `web/src` and referenced `node:fs/promises`, which is intentionally unavailable to the browser TypeScript build. It was moved outside the browser compilation tree rather than weakening tsconfig.
2. The next main CI run passed the web checks but the Python suite still asserted the old Polish sentence `Animacja nie tworzy nowych danych`. The assertion was updated to `The animation does not create new data`; the data-truth requirements were preserved.

Final head `4a34ce18fe552f19aaa2e604b50260ecba5b40c8` is **green across all four Terra review workflows**:

- CI run `35169328621`: PASS;
- PR Validation run `35169328579`: PASS;
- Validate web application run `35169328498`: PASS;
- Validate Terra Observation Planet Site run `35169328503`: PASS.

### Important Terra pin boundary

WORLDIFACT still uses the separately reviewed Terra pin `ae90f7367587e0973782c470cde3f5103c0540fc`. Terra PR #271 is based on current Terra main `4d422e97121fda7199ce9320e0bba10a487cca42`.

Therefore PR #271 is **reviewable source evidence, not an automatic WORLDIFACT repin**. Directly moving WORLDIFACT from `ae90f73...` to `4a34ce...` could import unrelated upstream work. A later release must deliberately review/cherry-pick or approve the larger pin jump.

### Remaining Terra backlog

Many real standalone Terra pages remain Polish, including `eclipse-live/index.html`, `eclipse-live/close.html`, casebook/forum/Copernicus and experiment/archive pages. Continuation 3 is a bounded source batch, not an all-Terra completion claim.

## 3D / texture quality status after continuation 3

No new paid generation or live Studio code was used in this continuation. Existing review-only Froge PR #16 remains the current quality branch:

https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Review head remains `ab5b6523c45dfc45cddeffe35d979290a38d9d72`; no-paid run `35167461563` passed.

Existing evidence includes truthful source/export pixel reporting, GLB texture/UV checks, garment/body intersection checks, anatomy metadata and real Blender FBX reimport with material-name and UV-presence validation. This still does **not** prove photographic likeness, hair-root continuity, face/neck/jaw/shoulder proportions, hand quality, shader equivalence or print readiness.

Continuation 4 should improve one of those properties only where it can be measured by actual Blender/source checks. A source-only older Froge snapshot must not be described as a live generator improvement.

## External localization boundaries

- **8 Planets:** recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5` is known from records, but no editable canonical source is exposed through the connected tools. Internal translation remains **BLOCKED**, not faked through the iframe wrapper.
- **Hosted Froge:** the live Site remains preserved. Reviewable `teslaeco/Froge-MPC-2-test` contains Polish UI but is not proven source-identical to the current Site. Internal live localization remains **BLOCKED/UNKNOWN**.

## Remaining priorities

1. Add measurable source/Blender evidence for hair-root/scalp continuity or another concrete anatomy/intersection defect without claiming likeness from structural tests.
2. Strengthen material/PBR evidence beyond structural FBX reimport where the format actually permits verification.
3. Continue Terra standalone English pages in bounded upstream batches after keeping PR #271 review-only.
4. Continue reviewable Froge English only as source evidence until canonical Site parity/access is restored.
5. Translate 8 Planets only when real editable source access is restored.
6. Keep WORLDIFACT PR #28, Chess PR #143, Froge PR #16 and Terra PR #271 unmerged/unpublished until a deliberate release decision.

No new paid API/GPU generation, quota increase, secret change, Oracle installation, private archive access, model download, merge, production deployment or contest submission occurred in continuation 3. No separate Codex/Copilot cloud agent was launched; work was executed through connected GitHub tools.

## Continuation protocol

Read current main/PR, `AGENTS.md`, `CONTEST_STATUS.md`, `LANGUAGE_AUDIT.md` and this checkpoint. Claim the editor marker, take the next incomplete package, make actual source/test changes, check current-head CI, update the ledger, increment the count exactly once, and return the marker to IDLE. Reuse WORLDIFACT PR #28. Keep upstream quality/localization PRs review-only unless later explicitly authorized for merge/deployment.

After continuation 5 provide the consolidated Polish GO/NO-GO report with actual changes/tests/SHA/PRs, remaining source-access and visual-quality blockers and costs. Do not extend the work window or start another schedule.
