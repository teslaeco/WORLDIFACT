# WORLDIFACT P0 — AI Game Lab Astra path

## Goal

The contest-critical reference flow is:

`PROMPT / IMAGE → GPT-6 ASTRA → WorldBlueprint + AssetSpec → visible 3D scene change → GAME / MAKE`

AI Game Lab is the reference implementation. The other four worlds remain accessible but are not the P0 completion gate.

## Truth labels

- `LIVE`: a server-side GPT-6 Astra response was received and validated.
- `DEMO`: local deterministic fallback; no provider call.
- `GENERATED`: output created from a verified provider response.
- `MOCK`: local example output.
- `MAKE / validation-required`: candidate manufacturing information only. Never a production-ready file, quote, order or approval.

## Current implementation on this branch

- `/lab` opens the native WORLDIFACT Astra workbench instead of hiding the reference flow behind the older embedded Studio.
- The existing server-side `/api/blueprint` path remains the paid Astra path and keeps the OpenAI key server-only.
- The Astra Structured Output root now requires both `WorldBlueprint` and `AssetSpec`.
- Both objects are validated server-side before a LIVE result is accepted.
- Applying a validated result changes the Three.js scene.
- The workbench exposes a visible trace panel with generated blueprint JSON plus separate GAME and MAKE plans.
- GAME remains procedural preview geometry unless a separate Oracle Blender job actually produces a GLB.
- MAKE is always `validation-required` on this P0 path.

## Safety / cost gates

The code still requires all of the existing paid-generation controls: explicit production enable flag, preview access code, rate limiter, durable request budget, expiry, fixed `gpt-6-astra` model, bounded prompt/image input and timeout.

Oracle Blender jobs remain a separate gate. `ENABLE_ORACLE_JOBS=false` on the parent review branch until a controlled prompt-only v33 pilot is explicitly enabled.

## P0 completion evidence still required

1. Approve a small paid Astra request ceiling and expiry.
2. Deploy the reviewed P0 branch.
3. From a clean public session run at least one text prompt and one optional-image prompt.
4. Capture provider evidence, validated `WorldBlueprint`, validated `AssetSpec`, visible scene change and the GAME/MAKE panels.
5. Keep the exact generated result and screenshots/video for Product Hunt evidence.
6. Separately run one controlled Oracle v33 Blender job if a real generated GLB is needed for the demo; do not describe procedural scene geometry as an Oracle-generated model.
