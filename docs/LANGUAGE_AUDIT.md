# WORLDIFACT English-language inventory — final five-pass review

Updated: 17 September 2026. This inventory records **actual authored/routed source** and explicit blockers. It does not call an inaccessible cross-origin application translated merely because its parent page is English.

## Rule

Product UI and authored user-facing messages use English by default where editable source is available. Stable IDs, source-data field names, model/job names, user prompts, saved work, provenance strings and legitimate user-selected locale catalogs are preserved. Runtime routes are checked in addition to source files so unused English code cannot hide a different visible entry.

## Five-world coverage

| World / route | Actual WORLDIFACT source/entry | English status after five passes | Remaining boundary |
|---|---|---|---|
| Chess Cube 512 AI `/chess` | Copied `/apps/chess/guest.html`, assembled from reviewed Chess revision `705d7b0fe5fff03a5d7975fe094804af1eef44ea` (draft PR #143) | **ENGLISH DEFAULT / ROUTE TESTED**. English document/default catalog; direct online-opponent fallback is `Online player`. WORLDIFACT no longer auto-redirects around the reviewed build. | Optional Polish/other catalogs remain valid user choices. Original public site is still an explicit link. No physical-device pass. |
| Terra — Fix ISS `/iss` | First-party ISS source plus separately copied reviewed Terra app | **ISS ENGLISH / TERRA MAIN ENGLISH PRESENTATION**. ISS static UI/help/accessibility, all eight repairs/tools/state, HUD/actions/errors, in-world signs and Model Context copy are English with IDs/mechanics/version-2 saves preserved. | Terra standalone source is not fully English. Draft Terra #271 translates a bounded real source batch only; broad repin is intentionally blocked pending review. |
| 8 Planets in 8 Days `/planets` | Native `PlanetsWorld.tsx` + `PlanetsDemo.tsx` + eight-stage `planetCampaign.ts`; external FORGE World Builder is a separate prototype link | **NATIVE ROUTE ENGLISH / TESTED**. Default route renders English headings, all eight stages, Mini test and explicit `FULL CAMPAIGN PLANNED`. | External FORGE builder canonical editable source is unavailable here; its internal UI is not claimed translated. Full campaign remains PLANNED. |
| Enchanted AI Shop `/shop` | English WORLDIFACT launcher to exact `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` | **LAUNCHER ENGLISH / NO AUTHENTICATED IFRAME**. The owner-reported failing iframe is removed. A top-level visit opens the exact original Studio; explicit `_top` and new-tab links remain. No old native replacement form. | Hosted Studio internal source parity/access is **BLOCKED/UNKNOWN**. Its own sign-in, saved Oracle connection and internal language are not modified or claimed fixed. Review-snapshot Froge English is not live-Site evidence. |
| AI Game Lab `/lab` | Native `WorkbenchPage` + `P0GameLab` | **FIRST-PARTY ENGLISH GUARDED**. Home/Portal/Shop/Workbench/Control, P0GameLab and portal definitions have English source regressions; GLB review controls/axis notices are English. | Source/test coverage is not Android/WebGL or real external-generation evidence. |

## Final route verification

WORLDIFACT code head `aa366400ee51875a9b1cf0ff3f85cccdfd7ce909` passed run `35178690232` with **129/129 tests**, lint 9 warnings/0 errors, TypeScript, local HTTP smoke, production build, reviewed Chess/Terra assembly, Worker dry-run and a credential-free hosted-Studio reachability probe.

New/retained route regressions prove:

- `/chess` uses the reviewed copied guest build rather than an unpinned automatic redirect;
- direct `PortalPage` Shop rendering uses only the exact original Froge destination and cannot revive an iframe or retired prompt-only form;
- `/planets` is the native English expedition route and labels the external prototype separately;
- ISS and Terra remain distinct copied applications with an explicit simulation/observation boundary;
- Shop opens only the exact canonical Studio destination once per top-level mount, forwards no query/hash/token, does not auto-navigate an ancestor, keeps manual links when navigation is denied, and cannot perform native paid/storage side effects.

These are source/CPU/server-render checks, not proof of a logged-in Android session or a fresh model generation.

## Terra source batch

Draft: https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/pull/271

Head `4a34ce18fe552f19aaa2e604b50260ecba5b40c8` translates real authored source:

- `web/public/eclipse-live/gallery.html`: English archive, controls, timestamps, playback/status/errors;
- `web/public/404.html`: English fallback with unchanged canonical redirect;
- `web/public/multi-angle/index.html` and `app.js`: English form/help/geocoder/search/results/errors.

NOAA manifest/source/hash/log evidence and Copernicus STAC endpoint/query/geometry semantics are preserved. CI `35169328621`, PR Validation `35169328579`, Validate web `35169328498`, and Terra Site `35169328503` pass.

WORLDIFACT still pins reviewed Terra `ae90f7367587e0973782c470cde3f5103c0540fc`; #271 is based on newer Terra main and is not imported wholesale because that could bring unrelated changes. Remaining standalone Polish pages include eclipse index/close and casebook/forum/Copernicus/experiment/archive surfaces.

## Froge review snapshot

Draft: https://github.com/teslaeco/Froge-MPC-2-test/pull/16

Head `d3f61b842dcfeda2ed794210caafc391919a75be` passes no-paid workflow `35175731409` and saved-model-history run `35175731405`.

Review-source English includes touched rooted-hair diagnostics, `en-US` dictation/microphone errors and research-report recovery UI. Quality/reliability evidence includes actual source/export pixel reporting instead of implied 4K/8K, no-upscale policy, real Blender FBX reopen with finite geometry/material names/UV structure, measured `hair_lock()` root-to-scalp positive/negative controls, and stale-job protection so previous status/model reads cannot win after a newer POST begins.

This snapshot remains **not proven source-identical to the live hosted Studio**. Do not publish it over the current Site merely to achieve an English claim.

## Explicit blockers after five passes

1. **Hosted Froge internal localization:** BLOCKED/UNKNOWN until canonical live-source access/parity is restored.
2. **External FORGE World Builder localization:** BLOCKED until editable canonical source is available; native WORLDIFACT Planets is separate and already English.
3. **Terra standalone localization:** PARTIAL; more authored pages remain Polish.
4. **Visual identity quality:** not proven for face/neck/jaw/shoulders/hands, natural hairline or every hair builder. Camera framing and structural geometry tests are not photographic likeness.
5. **PBR equivalence:** UV/material/FBX structural preservation is tested; full visual Blender↔glTF↔FBX shader equivalence is not proven.
6. **Device/authentication:** owner screenshots proved the embedded Shop path was bad for the observed Android session; removing the iframe is source-tested, not yet a logged-in production-device pass.

No user prompt, model name, saved model, account record or archive was rewritten to satisfy language checks.
