# WORLDIFACT English-language inventory

Updated: 17 September 2026. This inventory records source ownership and what has actually been inspected. It is not a claim that text inside an inaccessible cross-origin app has been translated.

## Rule

Product UI and authored user-facing messages should be English by default. Stable IDs, source-data field names, model/job names, user prompts, saved data, provenance strings and optional user-selected locale catalogs are not rewritten merely to make a language scan pass.

## Five-world coverage

| World / route | Source used by WORLDIFACT | Current English status | Remaining work / boundary |
|---|---|---|---|
| Chess Cube 512 AI `/chess` | Review branch pins focused source revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea` from draft Chess PR #143 | ENGLISH DEFAULT / SOURCE FIX PREPARED | `guest.html` declares `lang=en`; auth copy is English; `ENGLISH_CATALOG` is the fallback while Polish and other locales remain legitimate opt-in translations. Audit found one direct runtime literal `Gracz online`; draft PR #143 changes only that fallback to `Online player`. Chess workflow `35167870190` passed. Nothing is merged/deployed. |
| Terra — Fix ISS `/iss` | First-party ISS source plus pinned Terra commit `ae90f7367587e0973782c470cde3f5103c0540fc` | ISS ENGLISH / TERRA MAIN ENGLISH PRESENTATION / STATIC SUBPAGE BACKLOG | ISS static/runtime UI is English with IDs/mechanics/save schema preserved. Terra's main app still contains legacy Polish source literals, but authored `contest-runtime.js` maps reviewed UI phrases to English and the main document declares `lang=en`. A broad scan also confirmed genuinely Polish standalone pages, including `web/public/eclipse-live/gallery.html` (`lang=pl`, Polish controls/errors). Those pages are not claimed translated and need upstream source work in later continuations. |
| 8 Planets in 8 Days `/planets` | External FORGE World Builder `https://forge-world-builder.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / EDITABLE SOURCE BLOCKED | Records identify recovered revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but connected GitHub search exposes no editable source for that revision. A parent iframe wrapper is not treated as translation of the external app. |
| Enchanted AI Shop `/shop` | English WORLDIFACT wrapper around exact hosted Froge MPC 2 Studio `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / CANONICAL STUDIO SOURCE BLOCKED | The live generator is deliberately preserved. Its canonical Site source is unavailable here, so internal Studio Polish copy is not claimed translated and the older GitHub snapshot is not deployed over it. |
| AI Game Lab `/lab` | Native WORLDIFACT `WorkbenchPage` + `P0GameLab` | FIRST-PARTY SOURCE GUARDED | `index.html`, Home/Portal/Shop/Workbench/Control, `P0GameLab` and portal definitions are regression-checked for explicit English document language and curated high-signal Polish UI copy. |

## Shared WORLDIFACT shell

`src/config/portals.ts` defines all five portal titles, taglines and descriptions in English. The Shop remains the external integration introduced by PR #27; localization work does not replace its generator or start a model job.

Continuation 2 adds `scripts/lib/english-ui.mjs` and regression coverage. Two deliberate localization mechanisms are handled separately:

- **Cube Chess** intentionally bundles optional translated catalogs. CI checks that the English catalog is clean, `en` selects it and English remains the fallback; it does not reject legitimate opt-in Polish/German/etc. strings in the same JavaScript bundle.
- **Terra main app** intentionally ships a reviewed runtime translation map over legacy Polish source labels. CI checks the English main document plus required source→English pairs in `web/public/contest-runtime.js`; it does not call the translation table itself an untranslated user surface.

The guard deliberately does **not** label Terra's unrelated standalone static HTML archive/gallery pages as English. Those are separate authored user surfaces and now appear explicitly in the backlog rather than being hidden by the runtime mechanism used by the main app.

The foundation composite action also now resolves its reviewed Chess/Terra SHAs directly from `config/foundation-sources.json`, removing a duplicate hardcoded-pin source that caused a CI mismatch during continuation 2.

## ISS translation completed in continuation 1

The source-owned ISS surface now uses English for static controls/help/accessibility, all eight repair tasks/tools/state messages, dynamic HUD/actions/errors, in-world canvas signs and Model Context tools. Regression tests preserve DOM hooks, task IDs/order, version-2 saves and part consumption. This is source/test evidence, not physical Android/WebGL QA.

## External-source boundary

The active model generator remains `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/`. The reviewable `teslaeco/Froge-MPC-2-test` runtime is useful for source-only patches but is not proven identical to the current hosted Site. Draft Froge PR #16 therefore remains review-only.

The reviewable Studio snapshot still contains Polish product copy in `ModelStudio.tsx`; wrapper English must not be described as translation of the live cross-origin Studio. Publishing that older snapshot over a newer canonical Site without parity evidence would risk a downgrade.

## Continuation-2 verification

Latest verified WORLDIFACT code head before documentation-only checkpoint commits: `8b53331195d22de1d2b1dd770fa92b698592ea76`.

Run `35168300680` passed 114/114 tests, lint with nine warnings/zero errors, TypeScript, HTTP smoke, production build, reviewed Chess/Terra foundation assembly, Worker dry-run and the read-only hosted-Studio probe.

## Remaining localization work

1. Translate Terra standalone/static pages upstream in bounded batches; `web/public/eclipse-live/gallery.html` is a confirmed Polish example and other `lang=pl` archive/casebook pages exist.
2. Keep Chess PR #143 review-only until a deliberate upstream/WORLDIFACT pin/release decision is made.
3. Translate real 8 Planets authored UI only when editable source access is restored.
4. Translate live Froge internal UI only when canonical Site source access/parity is restored; do not simulate it from the wrapper.
