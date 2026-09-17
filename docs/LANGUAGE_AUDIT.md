# WORLDIFACT English-language inventory

Updated: 17 September 2026. This inventory records source ownership and what has actually been inspected. It is not a claim that text inside an inaccessible cross-origin app has been translated.

## Rule

Product UI and authored user-facing messages should be English. Stable IDs, source-data field names, model/job names, user prompts, saved data, provenance strings and third-party evidence are not translated merely to make a language scan pass.

## Five-world coverage

| World / route | Source used by WORLDIFACT | Current English status | Remaining work / boundary |
|---|---|---|---|
| Chess Cube 512 AI `/chess` | Pinned `teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer` commit `e134964e9c8b7edc43c26b508973f6fb658af90d`, assembled during CI | PINNED OUTPUT GUARDED / EXACT SOURCE EVIDENCE | The exact pinned commit is the signed `Fix remaining mixed-language Cube judge UI (#141)` change. `guest.html` declares `lang=en`, its reviewer loading copy is English, and exact `web/auth/AuthGate.js` uses English auth/account/guest labels. The release assembler now rejects a copied Chess HTML/JS build if high-signal Polish UI phrases return. This is bounded UI evidence, not a proof that every data string or user-generated value is English. |
| Terra — Fix ISS `/iss` | First-party copied ISS source in this repository plus pinned Terra Earth-observation build | ISS SOURCE IMPLEMENTED / PINNED TERRA OUTPUT GUARDED | ISS `index.html`, repair/task state, runtime HUD/messages, in-world canvas signs and Model Context tool titles/descriptions are English. IDs, save schema and mechanics are unchanged. Exact pinned Terra `web/index.html` declares `lang=en`; its visible project link/title/metadata are English, and the compiled copied HTML/JS now passes the same bounded English UI guard. Scientific keys such as `data_poczatkowa` remain data contracts and are intentionally not renamed. |
| 8 Planets in 8 Days `/planets` | Existing external FORGE World Builder `https://forge-world-builder.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / EDITABLE SOURCE BLOCKED HERE | WORLDIFACT portal labels are English. Project records identify recovered source revision `6f5f239239f05e72b029cc1014e982a587a2ece5`, but that revision is not exposed as an editable GitHub source through the connected repository search; searches for the exact public Site URL and revision only resolve WORLDIFACT integration records. A parent page cannot truthfully translate text inside the cross-origin app, so no overlay or guessed replacement source is used. |
| Enchanted AI Shop `/shop` | WORLDIFACT English wrapper around the exact hosted Froge MPC 2 Studio `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / EXTERNAL UI SOURCE BLOCKED | Shop heading, navigation, direct-open fallbacks and ownership notes are English. The hosted Studio is deliberately preserved. Its current canonical Site source is not available through this work session, so its internal Polish UI is not claimed translated. Do not deploy the older GitHub snapshot over the live Studio. |
| AI Game Lab `/lab` | Native WORLDIFACT `WorkbenchPage` + `P0GameLab`; original-Studio links use hosted Froge | FIRST-PARTY SOURCE GUARDED | `index.html`, Home/Portal/Shop/Workbench/Control pages, `P0GameLab` and portal definitions are now covered by a regression guard for explicit English document language and curated high-signal Polish UI copy. This protects authored first-party UI while deliberately ignoring prompts, provenance, scientific field names and stored user data. |

## Shared WORLDIFACT shell

`src/config/portals.ts` defines all five portal titles, taglines and descriptions in English. `WorkbenchPage.tsx` is English. Shop remains the external integration introduced by PR #27; this localization work does not replace its generator or start a model job.

Continuation 2 adds `scripts/lib/english-ui.mjs` plus regression coverage. The foundation build checks the *actual compiled* pinned Chess/Terra HTML and JavaScript before those files are copied into WORLDIFACT. The guard is intentionally narrow: it catches UI phrases that occurred in earlier Polish builds (`Zaloguj`, `Załóż konto`, `Zagraj jako gość`, `Wczytaj`, `Ustawienia`, `Błąd`, etc.) instead of treating every Polish-looking token as an error. This prevents scientific identifiers, proper names or user content from being rewritten just to satisfy localization.

## ISS translation completed in continuation 1

The source-owned ISS surface now uses English for:

- document language, static controls, dialogs, help and accessibility copy;
- all eight repair task names, steps, tool names, requirement labels and state/error messages;
- runtime goal names, inventory/mission status, EVA/interior state, interaction prompts and safety notices;
- hatch/bag/suit/airlock actions, torque instructions, map/view/reset/save/load messages and NASA map loading/errors;
- in-world canvas labels: `LABORATORY`, `EVA AIRLOCK`, `TOOL BAG`, `EVA SUIT`, `EXTERIOR EXIT`, `RETURN TO AIRLOCK`;
- Model Context tool titles/descriptions/errors and the WebGL fallback message.

Regression tests keep DOM hooks, task IDs/order, state version 2 and part consumption unchanged while checking English source strings. This is code evidence, not physical Android/WebGL QA.

## External-source boundary

The active model generator remains `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/`. The newer GitHub branch `teslaeco/Froge-MPC-2-test:codex/v27-mcp-startup-audit` is useful for source/runtime audits but is not proven identical to the current hosted Site. Its checkpoint records the current hosted source as inaccessible through Git clone/API in prior work. Any English or quality patch prepared against the GitHub branch must remain source-only until deliberately ported to the canonical hosted source and verified there.

The reviewable GitHub Studio snapshot still contains Polish product copy in `ModelStudio.tsx`, which confirms why English wrapper text cannot be described as translation of the live Studio. Translating that snapshot may be useful as a future source patch, but publishing it over the newer canonical Site without source-parity evidence would risk a downgrade.

## Next localization checks

1. Keep the new compiled Chess/Terra and native-source English guards green as other code changes land.
2. If editable FORGE World Builder source access is restored, translate its real authored UI and add its own source tests; until then keep `/planets` internal localization BLOCKED.
3. Keep hosted Froge internal localization BLOCKED until canonical Site source access is restored; do not simulate translation from the wrapper.
4. In later continuations, translate reviewable Froge source only when the patch can be kept separate from claims about the live Site and without changing user prompts/model names.
