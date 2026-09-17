# WORLDIFACT English-language inventory

Updated: 17 September 2026. This inventory records source ownership and what has actually been inspected. It is not a claim that text inside an inaccessible cross-origin app has been translated.

## Rule

Product UI and authored user-facing messages should be English by default. Stable IDs, source-data field names, model/job names, user prompts, saved data, provenance strings and optional user-selected locale catalogs are not rewritten merely to make a language scan pass.

## Five-world coverage

| World / route | Source used by WORLDIFACT | Current English status | Remaining work / boundary |
|---|---|---|---|
| Chess Cube 512 AI `/chess` | Review branch pins focused source revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea` from draft Chess PR #143 | ENGLISH DEFAULT / SOURCE FIX PREPARED | `guest.html` declares `lang=en`; auth copy is English; `ENGLISH_CATALOG` is fallback while Polish and other locales remain legitimate opt-in translations. Audited direct fallback `Gracz online` is changed to `Online player`. Run `35167870190` passed. Nothing is merged/deployed. |
| Terra — Fix ISS `/iss` | First-party ISS source plus reviewed WORLDIFACT Terra pin `ae90f7367587e0973782c470cde3f5103c0540fc`; newer upstream localization is in draft Terra PR #271 | ISS ENGLISH / TERRA MAIN ENGLISH PRESENTATION / STATIC BATCH PREPARED | ISS static/runtime UI is English with IDs/mechanics/save schema preserved. Terra main uses an English document plus reviewed runtime translations. Draft Terra PR #271 translates real standalone gallery/404/multi-angle source. Many other standalone pages remain Polish; draft is not automatically pinned into WORLDIFACT. |
| 8 Planets in 8 Days `/planets` | External FORGE World Builder `https://forge-world-builder.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / EDITABLE SOURCE BLOCKED | Records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but connected tools expose no editable canonical source. A parent iframe wrapper is not treated as translation of the external app. |
| Enchanted AI Shop `/shop` | English WORLDIFACT wrapper around exact hosted Froge MPC 2 Studio `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / REVIEW SNAPSHOT PARTIAL / LIVE SOURCE BLOCKED | The live generator is deliberately preserved. Reviewable Froge PR #16 translates touched rooted-hair diagnostics, dictation locale/errors and research fallback, but the GitHub snapshot is not proven identical to the live Site and is not deployed over it. |
| AI Game Lab `/lab` | Native WORLDIFACT `WorkbenchPage` + `P0GameLab` | FIRST-PARTY SOURCE GUARDED | `index.html`, Home/Portal/Shop/Workbench/Control, `P0GameLab` and portal definitions are regression-checked for explicit English document language and curated high-signal Polish UI copy. |

## Shared WORLDIFACT shell

`src/config/portals.ts` defines all five portal titles, taglines and descriptions in English. The Shop remains the external integration introduced by PR #27; localization work does not replace its generator or start a model job.

The source-aware English guard handles deliberate localization mechanisms separately:

- **Cube Chess** intentionally bundles optional translated catalogs. CI checks that the English catalog is clean, `en` selects it and English remains fallback; it does not reject legitimate opt-in locale strings.
- **Terra main app** intentionally ships a reviewed runtime translation map over legacy Polish source labels. CI checks the English main document plus required source→English pairs; the translation table itself is not counted as untranslated UI.
- **Terra standalone pages** are separate authored surfaces. They are translated in upstream source when available rather than hidden behind WORLDIFACT wrapper text.
- **Hosted Froge** remains cross-origin. English strings in the reviewable snapshot are recorded as snapshot evidence only; the live Site is not labelled translated until source parity/access is restored.

Foundation checkout revisions are resolved from `config/foundation-sources.json`, avoiding duplicate hardcoded pin sources.

## ISS translation completed in continuation 1

The source-owned ISS surface uses English for static controls/help/accessibility, all eight repair tasks/tools/state messages, dynamic HUD/actions/errors, in-world canvas signs and Model Context tools. Regression tests preserve DOM hooks, task IDs/order, version-2 saves and part consumption. This is source/test evidence, not physical Android/WebGL QA.

## Terra continuation-3 source batch

Draft upstream PR #271: https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Review head: `4a34ce18fe552f19aaa2e604b50260ecba5b40c8`.

Translated real source surfaces:

- `web/public/eclipse-live/gallery.html`: English document language, archive explanation, animation controls, timestamps/source labels, dynamic frame text and errors; manifest path, NOAA links, SHA-256 values and log evidence preserved.
- `web/public/404.html`: English fallback copy with unchanged canonical/JavaScript redirect target.
- `web/public/multi-angle/index.html` and `app.js`: English navigation, place/address/manual coordinate controls, geocoder/search/result/error copy; Copernicus STAC endpoint and query semantics unchanged.

Final review head is green across CI `35169328621`, PR Validation `35169328579`, Validate web `35169328498` and Terra Site `35169328503`.

WORLDIFACT still pins Terra `ae90f7367587e0973782c470cde3f5103c0540fc`; direct repinning to newer upstream PR #271 could import unrelated changes. Remaining Polish Terra surfaces include `eclipse-live/index.html`, `eclipse-live/close.html` and casebook/forum/Copernicus/experiment/archive pages. Terra is not globally all-English.

## Froge continuation-4 review-source batch

Draft source PR #16: https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Review head: `656b12164bc9e08921067c2959ee326e9e7d64fe`.

English source changes in this **review snapshot only**:

- `src/studio/useDictation.ts`: dictation locale `en-US`; unsupported-browser, microphone-permission, stopped-dictation and microphone-start errors are English;
- `src/components/ResearchErrorBoundary.tsx`: report failure explanation and `Try again` / `Open research archive` recovery actions are English;
- touched rooted-hair runtime diagnostics are English;
- `src/tests/english-review-source.test.ts` guards the above source contracts.

Exact-head no-paid run `35171423726` passes the frontend locked install, lint, full TypeScript, focused English regression and production build, alongside the Python/Codex/MCP/official-Blender quality suite.

A broader diagnostic run `35171308192` intentionally exposed existing Polish-label/baseline frontend debt instead of hiding it: one stale docs test import, one commerce assertion expecting two legacy `Niepołączony` labels, and one photo-generation assertion expecting an older retry label. Those failures were not weakened to create a false all-English/all-green claim.

The snapshot still contains substantial Polish product UI, notably the current `ModelStudio`/remote generator flow. Because the current private hosted Studio's canonical source parity is unavailable, translating the entire old snapshot and publishing it over the live Site would risk a downgrade. Live internal Studio localization therefore remains BLOCKED/UNKNOWN.

## Verification ledger

Latest verified WORLDIFACT runtime-code head remains `8b53331195d22de1d2b1dd770fa92b698592ea76`; run `35168300680` passed 114/114 tests, lint with nine warnings/zero errors, TypeScript, HTTP smoke, production build, reviewed Chess/Terra foundation assembly, Worker dry-run and the read-only hosted-Studio probe.

Terra and Froge upstream review-source verification are recorded separately because neither source patch is yet merged/deployed into the active production composition.

## Remaining localization work

1. Continue Terra standalone/static pages upstream only in bounded, reviewable batches; do not describe the current batch as complete Terra localization.
2. Keep Chess PR #143 review-only until a deliberate upstream/WORLDIFACT pin/release decision is made.
3. Translate real 8 Planets authored UI only when editable canonical source access is restored.
4. Translate live Froge internal UI only when canonical Site source access/parity is restored; review-snapshot English is not live-Site evidence.
5. Final continuation must report blockers honestly rather than replacing inaccessible applications with older copies merely to achieve an English-language claim.
