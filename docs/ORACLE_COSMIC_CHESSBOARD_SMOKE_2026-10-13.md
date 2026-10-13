# One-shot Oracle/Blender 3D smoke test — 2026-10-13

Status: NOT EXECUTED. Run only through existing authenticated AI Shop dispatch with approved accounting and per-job cost cap. Do not invoke unverified Oracle endpoints or bypass reservations.

## Prompt
Create a photorealistic 3D chessboard based on a reference photo. Exactly 8x8=64 square cells, alternating natural oak end-grain and dark charred wood, realistic growth rings, cracks, polished wooden frame. Thin emerald and cyan LED borders, emissive materials, 4K PBR textures, cinematic illumination. Separate geometries for board, frame and LED; real GLB with embedded textures and valid normals, no chess pieces. Tree stump base optional only if it fits provider cap. A-H and 1-8 coordinates must not be counted as squares.

## Gates
- Existing user session, entitlement, quota, idempotency key, budget reservation and cost ceiling verified before dispatch.
- Record redacted request/job ID, selected model, actual OpenAI response model, Oracle dispatch and Blender completion, without logging secrets.
- Validate exactly 64 cells, 8 rows and columns, GLB magic and structural validity, preview renders, download works, and model appears in account library.
- On failure preserve job status and financial reconciliation; never retry automatically with a new paid idempotency key.
- Test Sol/Luna separately after Astra baseline, not as part of this one-shot.
