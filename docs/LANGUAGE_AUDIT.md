# WORLDIFACT English-language inventory

Updated: 17 September 2026 after interactive continuation. Source evidence is not a claim that inaccessible cross-origin apps are translated or that draft changes are deployed.

## Rule

Product UI and authored messages use English by default. Preserve stable IDs, schema fields, user prompts, model/job names, saved data, provenance and legitimate opt-in locale catalogs. Inspect the actual routed component, not just an unused source or configuration entry.

## Five-world coverage

| World / route | Actual source and entry | English evidence | Remaining boundary |
|---|---|---|---|
| Chess Cube 512 AI `/chess` | Draft PR #28 now renders copied `/apps/chess/guest.html`, assembled from reviewed revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea` in draft Chess PR #143 | English document, English default/fallback catalog and direct `Online player` label; server-render entry regression proves the copied path is used | The former forced external redirect bypassed the pinned build. It is removed in this draft; the original public site stays an explicit optional link. No production/device pass is claimed. |
| Terra — Fix ISS `/iss` | First-party ISS source in WORLDIFACT, embedding the separate copied Terra app when requested | Static UI/help/accessibility, all eight repairs/tools/state messages, HUD/actions/errors, in-world signs and Model Context copy are English; IDs/mechanics/version-2 saves preserved | Terra is separate: its main English presentation uses the reviewed translation map; many standalone pages remain Polish. |
| 8 Planets in 8 Days `/planets` | **Native `PlanetsWorld.tsx`**, with `PlanetsDemo.tsx` mini-test and eight-stage `planetCampaign.ts`; FORGE World Builder is a separately labelled external prototype link | Actual default route server-rendered with English headings, all eight planet names, Mini test and FULL CAMPAIGN PLANNED. Existing native campaign tests are retained. | The old inventory incorrectly treated the whole route as an external iframe. The external builder's canonical editable revision `6f5f239239f05e72b029cc1014e982a587a2ece5` remains unavailable; that does not make native WORLDIFACT source unavailable. A full campaign is still PLANNED, not implemented by localization. |
| Enchanted AI Shop `/shop` | English WORLDIFACT integration page around exact `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` | Permanent full-generator links and English navigation; regressions now cover both normal ShopPage and direct PortalPage fallback so neither can revive the retired native form | Current hosted Studio's internal language/source parity remains BLOCKED/UNKNOWN. Partial English in Froge review PR #16 is not a live Site translation. |
| AI Game Lab `/lab` | Native `WorkbenchPage` + `P0GameLab` | Source-aware guards cover Home/Portal/Shop/Workbench/Control, P0GameLab and portal definitions; GLB review controls/axis notices are English | English source/test coverage is not visual Android or real external-generation evidence. |

## Shared route and source verification

`tests/portal-entry.test.mjs` renders the actual PortalPage, ShopPage and PlanetsWorld using React server rendering. It checks the copied Chess path, preservation of the exact hosted Studio, eight native English planet stages, and separate ISS/Terra frame routes and observation labels. No browser or external generation is used.

`/chess/shop` remains an internal redirect to `/shop`. `/portal/:portalId` resolves to the configured route. The active Shop must not import a substitute generator or auto-download a JSON brief.

Foundation checkout revisions are resolved from `config/foundation-sources.json`. Optional Cube locale catalogs are valid opt-in translations, not failed English defaults. Terra's reviewed runtime source-to-English map is distinguished from genuinely untranslated standalone authored pages.

## Terra source batch retained

Draft https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Reviewed head `4a34ce18fe552f19aaa2e604b50260ecba5b40c8` translates:

- `web/public/eclipse-live/gallery.html`: archive, controls, timestamps, dynamic frame/errors;
- `web/public/404.html`: English fallback, unchanged canonical redirect;
- `web/public/multi-angle/index.html` and `app.js`: navigation, coordinate/search/results/errors.

NOAA manifest/hashes/log evidence and Copernicus STAC endpoint/query semantics are preserved. Runs `35169328621`, `35169328579`, `35169328498` and `35169328503` pass. WORLDIFACT remains pinned to older reviewed Terra `ae90f7367587e0973782c470cde3f5103c0540fc`; importing the newer PR wholesale could include unrelated upstream changes. It is not repinned automatically.

Unfinished authored pages include `eclipse-live/index.html`, `eclipse-live/close.html` and casebook/forum/Copernicus/experiment/archive surfaces. This is not complete Terra localization.

## Froge review snapshot retained and current test correction

Draft https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Touched rooted-hair diagnostics, `src/studio/useDictation.ts` (`en-US`, microphone/errors), and `ResearchErrorBoundary.tsx` recovery actions are English in the review snapshot. The current hosted generator is untouched and not proven source-identical.

Fresh review head `d3f61b842dcfeda2ed794210caafc391919a75be` passes **full** no-paid workflow `35175731409`, including the complete frontend suite and Python/official-Blender tests. This supersedes the earlier focused-only gate noted in the old inventory. The restored broad suite exposed a real stale-job race, not only label debt; subsequent source changes prevent previous-job status/model reads from winning during a new POST. Historical failed diagnostics remain in the Actions history rather than being relabelled as passes.

The review snapshot still has substantial Polish ModelStudio/remote-generator UI. Source-only translation can be prepared deliberately, but publishing an older snapshot over the newer hosted Site is not allowed without parity/access proof.

## Current verification ledger

WORLDIFACT runtime head `acb877dd45e239d85c3f81edd85cd91698865944`, run https://github.com/teslaeco/WORLDIFACT/actions/runs/35175826470:

**126/126 tests PASS**, lint nine warnings/zero errors, TypeScript, local HTTP smoke, production build, reviewed Chess/Terra assembly, Worker dry-run and public hosted-Studio read-only probe all PASS. The probe returned HTTP 200, with generation NOT_TESTED and browserEmbedding UNKNOWN.

Twelve new tests comprise eight camera/projection cases and four real-component server-render routing cases. They do not prove Android usability, native versus hosted data migration, model likeness, texture detail or manufacturing readiness. Draft changes remain unmerged/unpublished.

## Remaining work

Continue real Terra/static or review-source Froge translations in bounded batches. Restore editable canonical source before claiming live Froge/external-builder translation. Preserve all users' saved prompts, chosen languages and work. Check fresh PR heads and CI before release. Record remaining blockers instead of asserting that all sites are already English.

Historical detailed inventory is preserved at https://github.com/teslaeco/WORLDIFACT/blob/acb877dd45e239d85c3f81edd85cd91698865944/docs/LANGUAGE_AUDIT.md.
