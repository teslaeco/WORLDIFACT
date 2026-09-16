# WORLDIFACT English-language inventory

Updated: 17 September 2026. This inventory records source ownership and what has actually been inspected. It is not a claim that text inside an inaccessible cross-origin app has been translated.

## Rule

Product UI and authored user-facing messages should be English. Stable IDs, source-data field names, model/job names, user prompts, saved data, provenance strings and third-party evidence are not translated merely to make a language scan pass.

## Five-world coverage

| World / route | Source used by WORLDIFACT | Current English status | Remaining work / boundary |
|---|---|---|---|
| Chess Cube 512 AI `/chess` | Pinned `teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer` commit `e134964e9c8b7edc43c26b508973f6fb658af90d`, assembled during CI | PARTIAL SOURCE EVIDENCE | The pinned revision is the commit that fixed remaining mixed-language judge UI and it builds successfully in PR CI. A complete user-facing string inventory of the pinned revision is still required before declaring full English coverage. WORLDIFACT's injected return links are English. |
| Terra — Fix ISS `/iss` | First-party copied ISS source in this repository plus pinned Terra Earth-observation build | ISS SOURCE IMPLEMENTED / TERRA AUDIT IN PROGRESS | `index.html`, repair/task state, runtime HUD/messages, in-world canvas signs and Model Context tool titles/descriptions are now English. IDs, save schema and mechanics are unchanged. Pinned Terra `web/src/main.tsx` was inspected and its visible timeline/observatory UI is English; its source-data keys such as `data_poczatkowa` are data contracts, not displayed labels. Other Terra components still need a bounded source scan. |
| 8 Planets in 8 Days `/planets` | Existing external FORGE World Builder `https://forge-world-builder.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / EXTERNAL UI UNVERIFIED | WORLDIFACT portal labels are English. A parent page cannot truthfully translate text inside the cross-origin application. Translate only in its real source when that source is available; do not inject an overlay or rewrite user data. |
| Enchanted AI Shop `/shop` | WORLDIFACT English wrapper around the exact hosted Froge MPC 2 Studio `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` | WRAPPER ENGLISH / EXTERNAL UI SOURCE BLOCKED | Shop heading, navigation, direct-open fallbacks and ownership notes are English. The hosted Studio is deliberately preserved. Its current canonical Site source is not available through this work session, so its internal Polish UI is not claimed translated. Do not deploy the older GitHub snapshot over the live Studio. |
| AI Game Lab `/lab` | Native WORLDIFACT `WorkbenchPage` + `P0GameLab`; original-Studio links use hosted Froge | INSPECTED ENGLISH / DEEP SCAN PENDING | Workbench navigation, prompt errors, DEMO/LIVE/Oracle status messages and download labels inspected so far are English. Continue a source-wide user-facing string scan in the next continuation. |

## Shared WORLDIFACT shell

`src/config/portals.ts` defines all five portal titles, taglines and descriptions in English. `WorkbenchPage.tsx` is English. Shop remains the external integration introduced by PR #27; this localization work does not replace its generator or start a model job.

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

## Next localization checks

1. Perform a bounded user-facing string scan over native WORLDIFACT pages/components and add regression coverage for remaining first-party UI.
2. Inspect the exact pinned Chess revision rather than relying on its commit title alone.
3. Scan the exact pinned Terra `web/src` user-facing components; do not rename scientific/data-contract fields.
4. Locate the real source of the external 8 Planets app before editing its UI.
5. Keep hosted Froge internal localization BLOCKED until canonical Site source access is restored; do not simulate translation from the wrapper.
