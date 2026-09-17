# WORLDIFACT English-language inventory

Updated: 17 September 2026. This inventory records source ownership and what has actually been inspected. It is not a claim that text inside an inaccessible cross-origin app has been translated.

## Rule

Product UI and authored user-facing messages should be English by default. Stable IDs, source-data field names, model/job names, user prompts, saved data, provenance strings and optional user-selected locale catalogs are not rewritten merely to make a language scan pass.

## Five-world coverage

| World / route | Source used by WORLDIFACT | Current English status | Remaining work / boundary |
|---|---|---|---|
| Chess Cube 512 AI `/chess` | Review branch pins focused source revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea` from draft Chess PR #143 | ENGLISH DEFAULT / SOURCE FIX PREPARED | `guest.html` declares `lang=en`; auth copy is English; `ENGLISH_CATALOG` is the fallback while Polish and other locales remain legitimate opt-in translations. The one audited direct runtime fallback `Gracz online` is changed to `Online player` in draft PR #143. Run `35167870190` passed. Nothing is merged/deployed. |
| Terra — Fix ISS `/iss` | First-party ISS source plus reviewed WORLDIFACT Terra pin `ae90f7367587e0973782c470cde3f5103c0540fc`; newer upstream localization is in draft Terra PR #271 | ISS ENGLISH / TERRA MAIN ENGLISH PRESENTATION / STATIC BATCH PREPARED | ISS static/runtime UI is English with IDs/mechanics/save schema preserved. Terra main uses an English document plus reviewed runtime translations. Draft Terra PR #271 translates real standalone gallery/404/multi-angle source. Many other standalone pages remain Polish. The draft is based on newer Terra main and is not automatically pinned into WORLDIFACT. |
| 8 Planets in 8 Days `/planets` | External FORGE World Builder `https://forge-world-builder.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / EDITABLE SOURCE BLOCKED | Records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but connected GitHub search exposes no editable canonical source. A parent iframe wrapper is not treated as translation of the external app. |
| Enchanted AI Shop `/shop` | English WORLDIFACT wrapper around exact hosted Froge MPC 2 Studio `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / CANONICAL STUDIO SOURCE BLOCKED | The live generator is deliberately preserved. Its canonical Site source is unavailable here, so internal Studio Polish copy is not claimed translated and the older GitHub snapshot is not deployed over it. |
| AI Game Lab `/lab` | Native WORLDIFACT `WorkbenchPage` + `P0GameLab` | FIRST-PARTY SOURCE GUARDED | `index.html`, Home/Portal/Shop/Workbench/Control, `P0GameLab` and portal definitions are regression-checked for explicit English document language and curated high-signal Polish UI copy. |

## Shared WORLDIFACT shell

`src/config/portals.ts` defines all five portal titles, taglines and descriptions in English. The Shop remains the external integration introduced by PR #27; localization work does not replace its generator or start a model job.

The source-aware English guard handles deliberate localization mechanisms separately:

- **Cube Chess** intentionally bundles optional translated catalogs. CI checks that the English catalog is clean, `en` selects it and English remains the fallback; it does not reject legitimate opt-in Polish/German/etc. strings in the same bundle.
- **Terra main app** intentionally ships a reviewed runtime translation map over legacy Polish source labels. CI checks the English main document plus required source→English pairs in `web/public/contest-runtime.js`; it does not call the translation table itself an untranslated user surface.
- **Terra standalone pages** are separate authored surfaces. They are translated in upstream source when available rather than being hidden behind WORLDIFACT wrapper text.

The foundation composite action resolves reviewed Chess/Terra SHAs directly from `config/foundation-sources.json`, avoiding duplicate hardcoded pin sources.

## ISS translation completed in continuation 1

The source-owned ISS surface uses English for static controls/help/accessibility, all eight repair tasks/tools/state messages, dynamic HUD/actions/errors, in-world canvas signs and Model Context tools. Regression tests preserve DOM hooks, task IDs/order, version-2 saves and part consumption. This is source/test evidence, not physical Android/WebGL QA.

## Terra continuation-3 source batch

Draft upstream PR #271:

https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Final review head: `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`.

Translated real source surfaces:

- `web/public/eclipse-live/gallery.html`: document language, archive explanation, animation controls, timestamps/source labels, dynamic frame text and errors are English. Manifest path, NOAA source links, SHA-256 values and saved-log evidence remain unchanged.
- `web/public/404.html`: English fallback copy with the same canonical/JavaScript redirect target.
- `web/public/multi-angle/index.html`: English navigation, place/address form, manual coordinate controls, cloud/date/collection labels and help/status text.
- `web/public/multi-angle/app.js`: English geocoding, no-data, product/result metadata, empty states and errors. The official Copernicus STAC endpoint and search/query semantics are unchanged.

Regression coverage is in `web/staticEnglishPages.test.mjs` plus the existing Python eclipse gallery test. Final head is green across:

- CI `35169328621`;
- PR Validation `35169328579`;
- Validate web application `35169328498`;
- Validate Terra Observation Planet Site `35169328503`.

Earlier red attempts were fixed rather than suppressed: the Node filesystem test was moved outside browser TypeScript compilation, then the existing archived-data Python assertion was translated from its old Polish sentence to the equivalent English sentence without removing manifest/source/hash/log checks.

### Terra pin boundary

WORLDIFACT still pins Terra `ae90f7367587e0973782c470cde3f5103c0540fc`. PR #271 is based on current Terra main `4d422e97121fda7199ce9320e0bba10a487cca42`. The PR is therefore reviewable source evidence, not a safe automatic pin update. Repinning WORLDIFACT directly to `4a34ce...` could import unrelated upstream changes and requires a separate review/release decision.

Remaining Terra Polish surfaces include `eclipse-live/index.html`, `eclipse-live/close.html` and multiple casebook/forum/Copernicus/experiment/archive pages. Terra is not yet globally all-English.

## External-source boundary

The active model generator remains `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/`. The reviewable `teslaeco/Froge-MPC-2-test` runtime is useful for source-only patches but is not proven identical to the current hosted Site. Draft Froge PR #16 therefore remains review-only.

The reviewable Studio snapshot still contains Polish product copy in `ModelStudio.tsx`; wrapper English must not be described as translation of the live cross-origin Studio. Publishing that older snapshot over a newer canonical Site without parity evidence would risk a downgrade.

## Verification ledger

Latest verified WORLDIFACT code head before documentation-only continuation-3 commits: `8b53331195d22de1d2b1dd770fa92b698592ea76`.

Run `35168300680` passed 114/114 tests, lint with nine warnings/zero errors, TypeScript, HTTP smoke, production build, reviewed Chess/Terra foundation assembly, Worker dry-run and the read-only hosted-Studio probe.

Terra source batch verification is recorded separately above because it is upstream and not yet integrated into the reviewed WORLDIFACT Terra pin.

## Remaining localization work

1. Continue Terra standalone/static pages upstream in bounded batches; do not describe the current batch as complete Terra localization.
2. Keep Chess PR #143 review-only until a deliberate upstream/WORLDIFACT pin/release decision is made.
3. Translate real 8 Planets authored UI only when editable canonical source access is restored.
4. Translate live Froge internal UI only when canonical Site source access/parity is restored; do not simulate it from the wrapper or publish the stale snapshot over the live Site.
