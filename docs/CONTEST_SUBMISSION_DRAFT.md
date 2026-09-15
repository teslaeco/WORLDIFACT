# WORLDIFACT contest submission draft

Prepared 15 September 2026 for owner review. Do not submit this draft until the release gates in `CONTEST_STATUS.md` pass.

## Product Hunt fields

Product name: `WORLDIFACT`

Tagline (54/60 characters):

> Build playable AI worlds, then prepare them to be made

Description (205/260 characters):

> Turn prompts into playable 3D scenes with GPT-6 Astra. Explore a river valley, drive a rover, edit and combine saved worlds, then export GAME geometry and review separate MAKE candidates for manufacturing.

Suggested topics, subject to the live form: `AI`, `Developer Tools`, `3D Design`

Maker comment draft:

> I started WORLDIFACT from a practical question: how can one person move from an idea to a world they can explore, improve and eventually manufacture responsibly? The current prototype connects a playable river valley, five project portals, a prompt-to-scene workflow and a production workbench.
>
> GPT-6 Astra is used server-side to turn a prompt and optional reference image into a strict WorldBlueprint. The browser validates that blueprint and builds a procedural scene with objects that can be moved, scaled, recolored, rotated, archived, combined and exported. A no-key DEMO remains available, but it is clearly labelled and does not pretend to be AI.
>
> WORLDIFACT also separates GAME from MAKE. A mesh that looks good in a game is not automatically printable. The workbench records process-specific walls, detail, clearance, color and supplier-review requirements, with unknown prices shown as unknown rather than invented.
>
> This is an early foundation for connected worlds including Cube Chess 512 AI, Terra observation and a future ISS restoration simulation. Those portals are labelled as planned where gameplay is not yet integrated. I would love feedback on the scene-building flow and on the clearest next step from a procedural world to a responsibly manufactured object.

## Shoutouts

ChatGPT / OpenAI (Astra and coding assistance), Three.js (renderer), React and Vite (application), Cloudflare (only after the deployment actually uses it). Match the live form’s tool records; do not imply a supplier partnership.

## 90-second demo recording script

Record only after the exact public release, browser/device QA and one owner-approved real Astra request pass. Do not record a mocked response as LIVE.

1. **0–10 seconds — Enter the valley.** Show the river, bridge and all five portals. Say: “WORLDIFACT is one shared 3D world where ideas become playable scenes and carefully reviewed physical candidates.”
2. **10–22 seconds — Prove interaction.** Walk with controls, open a workshop door, enter and exit the solar rover, then stop near a portal. Do not imply that every portal already contains a finished game.
3. **22–42 seconds — Prove Astra.** Open AI Game Lab. Select LIVE only when the configuration is ready and approved preview access is available. Enter a short prompt, attach an optional cleared reference image, generate, and keep the LIVE/result label visible. Say: “GPT-6 Astra returns a strict WorldBlueprint through a server-only Responses API integration; it does not return unchecked code.”
4. **42–61 seconds — Shape the world.** Move, rotate, scale and recolor one object. Walk through the updated scene. Save it, find it in the device archive, and add a saved world to the current composition.
5. **61–72 seconds — Restore and export.** Export JSON, import that same validated blueprint, then export the procedural GAME GLB. Say clearly that the exported file contains scene geometry, not the controller or a certified production model.
6. **72–85 seconds — GAME versus MAKE.** Open Enchanted AI Shop. Show the observed 100 mm legacy-Queen prices and the production profiles. Point out one UNKNOWN/BLOCKED Sculpteo price and one known JLC3DP result.
7. **85–90 seconds — Close honestly.** Say: “WORLDIFACT connects imagination, playable structure and manufacturing evidence—without confusing a beautiful render with a finished product.”

Capture checklist:

- Desktop landscape recording plus a short Android portrait proof.
- Public HTTPS URL and refreshed routes; no localhost or editor chrome.
- LIVE Astra request ID/status evidence without showing keys, headers or private reference images.
- Clear DEMO/MOCK labels if the fallback is shown.
- Portal, rover, door, touch, edit, archive, JSON import and GLB export behavior.
- No supplier logos used as partnership claims; no “production ready” wording for unapproved models.
- Licensed thumbnail/gallery assets, readable at Product Hunt crop sizes.

## Thumbnail and gallery plan

Do not create final screenshots until browser verification passes.

1. Thumbnail: WORLDIFACT wordmark over the verified valley, no supplier branding.
2. Gallery 1: playable valley with the five portal labels readable.
3. Gallery 2: prompt/reference input beside the generated scene and explicit LIVE evidence.
4. Gallery 3: scene editor, archive and GAME export.
5. Gallery 4: GAME/MAKE comparison and manufacturing profile table.

## Morning PR description draft

Title: `Build the WORLDIFACT playable valley, Astra scene studio and MAKE audit`

Summary:

- build the Three.js river valley with five typed portals, rover driving, workshop doors and touch/keyboard controls;
- add deterministic DEMO scenes and a gated server-side GPT-6 Astra Responses API path with strict WorldBlueprint output;
- add scene editing, validated JSON import/export, device archive/composition and procedural GAME GLB export;
- add private local GLB review, supplier evidence, observed JLC3DP prices and process-specific MAKE profiles;
- add Cloudflare Worker/assets configuration, CI, data/licensing notes and truthful DEMO/LIVE and GAME/MAKE labels.

Verification to paste only for checks run on the reconciled PR commit:

- `[ ] npm run verify`
- `[ ] npm run deploy:check`
- `[ ] GitHub CI green on exact head`
- `[ ] Desktop browser QA`
- `[ ] Android browser QA`
- `[ ] One real budget-approved Astra request`
- `[ ] Public HTTPS routes and refresh`

Known release blocks: browser/device QA, paid LIVE proof and secrets, authenticated Cloudflare account, current Queen/Julie originals, exact ISS production validation, public media and the bot-blocked live form. Review reconciliation/CI evidence in CONTEST_STATUS.md.

## Source and rule notes

- [Official contest page](https://www.producthunt.com/contests/gpt-6-astra-challenge): displays 18 September 2026 but also a zeroed countdown; confirm the authenticated live form before scheduling.
- [Official linked launch guide](https://app.notion.com/p/teamhome1431/GPT-6-Astra-Challenge-Product-Hunt-Launch-Guide-3d62e1256c9e80f39bccdd2ab93bb306): current audit records a personal maker account, tagline up to 60 characters, description up to 260, thumbnail/gallery, video, Shoutouts, up to three topics and Maker Comment; do not request upvotes.
- [GPT-6 Astra Model Guide](https://developers.openai.com/api/docs/guides/latest-model): use `gpt-6-astra` in Responses API; current Worker uses `reasoning.effort: low` and no unsupported sampling parameters.
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): current Worker requests a strict JSON schema and validates the returned blueprint again before use.
