# Codex task — AI Shop E2E repair

You are working in `teslaeco/WORLDIFACT`, the only competition repository. Do not create a parallel product or a second generator.

Goal: make Enchanted AI Shop use the already-proven MCP2/Froge flow and behave correctly on Android:

`prompt -> GPT-6 Astra -> existing Oracle connector -> Blender job -> poll the SAME job id -> validated GLB -> in-page mobile 3D viewer -> explicit download only`.

Use `teslaeco/Froge-MPC-2-test` only as an MIT-licensed implementation reference, especially `ModelStudio.tsx`, `RemoteGenerator.tsx`, `client.ts`, `AiModelViewer.tsx` and the Oracle connector. Preserve WORLDIFACT truth labels and safety gates.

Required fixes:

1. `/shop` must be a native WORLDIFACT page. Do not depend on the legacy `forge-studio-public...chatgpt.site` page for generation.
2. A click on `Generate REAL 3D model` must send at most one POST. If the submit response, polling request, mobile connection or model download fails, keep retrying the SAME job id. Never auto-submit a second paid job.
3. Persist the active job id locally before POST so a page refresh can resume it without a new generation charge.
4. Retry transient `fetch`, HTTP 429 and 5xx errors for status/model retrieval. Replace raw `Failed to fetch` with a truthful recovery message.
5. Only after `succeeded`, fetch the server-validated GLB and render it on-page with touch orbit/zoom. Download must remain a separate explicit button.
6. Keep output labelled `LIVE / GENERATED-UNREVIEWED`; MAKE remains `BLOCKED / VALIDATION REQUIRED` until physical/manufacturing validation.
7. Reference-image -> REAL Blender generation remains `BLOCKED_UNVERIFIED` until connector image input is proven end-to-end.
8. Fix meadow portal usability on Android so walking into or using Interact near Enchanted AI Shop reliably routes to `/shop`.
9. Do not advertise the old FORGE `Przygotuj zlecenie` JSON export as generation. Treat it as legacy/archive/export only and remove it from the primary Shop path.
10. Keep OpenAI and Oracle credentials server-side only. Never expose `OPENAI_API_KEY`, `ORACLE_API_TOKEN`, owner tokens, endpoints or secrets to the browser.
11. Owner approved exactly one additional controlled paid REAL 3D test. Keep the Durable Object counter cumulative and raise the absolute ceiling only from 5 to 6; do not reset usage and do not enable paid `/api/blueprint`.
12. Run lint, typecheck, unit/integration tests, build and deployment checks. Do not merge if exact-head CI is red.

Acceptance test on Android:
- enter AI Shop from the meadow portal;
- type a prompt;
- press Generate REAL 3D model once;
- temporary network/status failures must recover without another paid POST;
- model appears in the page as GLB;
- no automatic file download dialog appears;
- explicit Download GLB works only when pressed by the user.
