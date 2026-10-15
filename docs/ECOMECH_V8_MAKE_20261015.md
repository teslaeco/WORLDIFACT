# ECOMECH V8 — Separate MAKE repair, 15 October 2026

**Scope:** continue from V7 without changing its original GLB/textures or production.
**Decision:** STRUCTURAL REPAIR PASSED; REFERENCE FIDELITY AND PRINT APPROVAL NOT PASSED.
This is not a new photorealistic reconstruction and not a finished supplier-ready robot.

## Original and method

Original GitHub-generated V7 GLB: `a9cf5b06e450577ef420a3c95b80017f401caf6c1674e10cc09e254be057dd48`, 7,732,920 bytes, six meshes and 218,450 triangles. It is retrieved from the existing [V7 source artifact](https://github.com/teslaeco/WORLDIFACT/actions/runs/38711528467), not generated again. Its input-image provenance is recorded by V7. Upstream geometry remains local open-source TripoSR plus WORLDIFACT assembly, not a newly generated Astra mesh.

The new offline tool under `tools/ecomech/printprep_v8/` processes real triangle volumes, not an image placed in a viewer. It preserves scene transforms, makes a separate solid MAKE copy, reorients connected surfaces, unions their voxel interiors, fills internal voids under a solid-prototype assumption, thickens by a recorded voxel radius, adds an oval plinth, extracts the outer surface and reduces it only after manifold/volume checks. This is a **lossy geometry repair**, not a method for recovering missing original mechanical detail. Do not use it to call the inherited V7 silhouette faithful.

Working profile: **200 mm overall height including the added plinth**, resin research. This is an engineering assumption, not an approved customer dimension, resin selection or supplier contract. STL coordinates use mm and Z-up; GLB uses m and Y-up. Original color texture stays in the untouched V7 source; STL has no color.

## Locally measured actual output

| Check | Result |
|---|---:|
| Source connected fragments across six meshes | 86 |
| Source components reoriented under solid-copy assumption | 11 |
| Reopened MAKE STL connected bodies | 1 |
| Boundary edges | 0 |
| Non-manifold edges | 0 |
| Degenerate triangles | 0 |
| Consistent winding / positive volume / watertight | Yes / yes / yes |
| Output bounds X/Y/Z | 131.0761 × 55.3785 × 200.0000 mm |
| Output triangles | 200,776 |
| Geometric solid volume | 345,684.44 mm³ (not mass or a price) |
| STL size | 10,038,884 bytes |
| STL SHA-256 | `e43e7d93156f879d4bced3a1baca3700c1ff7e537623477b15b94f56bfcdb17d` |
| Uniform thickening | Requested 0.6 mm; effective grid radius 0.8 mm |
| Voxel pitch | 0.4 mm |
| Full extraction / reduced triangles | 1,003,884 / 200,776 |
| Relative volume change during reduction | 0.006591% |
| Normal-ray chord screening | 1,000 hits, 2 below the 2 mm research threshold |
| Smallest sampled chord | 1.0802 mm |
| Actual code tests | 8 passed locally, including real STL/GLB round trip |

The eight tests cover open/inward/disconnected geometry, tampered source, invalid print profile, physical units and the original source hash. They do NOT certify minimum walls or original-reference likeness. Four real STL views were rendered locally with neutral clay and no photo overlay.

The first [GitHub repair/reopen/test run](https://github.com/teslaeco/WORLDIFACT/actions/runs/38725026445) independently produced matching geometry measurements and passed all eight tests. Its **render step failed** because the Ubuntu runner lacked EGL/OSMesa, not because the repair or tests failed. The workflow now explicitly installs Mesa/EGL and Xvfb on the ephemeral runner and keeps the same geometry tests. Check the subsequent exact-head run before claiming the complete workflow green.

## Remaining blockers

- The two thin-feature flags need local geometric review; ray chords are NOT a certified minimum-wall measurement.
- Full self-intersection testing, slicer validation, resin/material/finish choice, support orientation and supplier engineering acceptance have not been performed.
- A solid 200 mm statue is relatively bulky. Hollowing/drainage would be a separate reviewed design, not an automatic volume reduction.
- The source V7 geometry still lacks correctly reconstructed armor, motors, hands and side/back anatomy. Repairing its topology does not recover details that were only visible in its projected texture. The untextured model is **not visually approved**.
- This is NOT a production quote, order, manufacturing clearance or completed original ECOMECH asset. `printReady`, `supplierAccepted`, `slicerAccepted` and `physicalTestPrinted` remain false.

## Design sources and execution controls

Public references checked for the research profile: [JLC3DP general design guide](https://jlc3dp.com/help/article/3d-printing-design-guideline) lists context-dependent SLA wall guidance including 2 mm at a 200 mm scale. [JLC3DP full-color WJP guide](https://jlc3dp.com/help/article/wjp-products-design-guidelines) has different requirements (3 mm at that scale), so WJP readiness is not inferred from SLA. [Blender print analysis documentation](https://docs.blender.org/manual/en/4.1/addons/mesh/3d_print_toolbox.html) separates manifold, intersections and thickness checks. These references do not constitute acceptance by the user's B2B supplier.

No new OpenAI call, external paid geometry API, GPU rental, production merge/deployment, customer credit change, secret update, invoice or supplier submission occurred. The new code is an isolated MAKE research tool, not yet wired into the production generator. Existing V7 original remains unmodified.
