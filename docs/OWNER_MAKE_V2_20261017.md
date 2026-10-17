# Owner MAKE V2 — execution brief

The owner rejected the two working GAME models as unsuitable for B2B printing and asked for materially better modeling, up to about one million triangles, with the modeling instruction actually executed. Existing originals and published GAME copies must be preserved.

## Execute

1. Recover the actual saved decoder arrays and verify their recorded SHA-256 hashes. ECOMECH has 7,204,376 raw triangles; Halloween has 6,896,654. Use these sources to preserve detail. Do not subdivide the 200k exports merely to inflate counts.
2. Audit the raw geometry, connected components, winding, boundary edges, self-intersections and dimensions. Separate reconstruction defects from export reduction. Retain an unchanged high-detail source checkpoint.
3. Prepare approximately one-million-triangle detailed working revisions using bounded geometric deviation and feature preservation. Report actual triangle counts and measured deviation; fewer triangles are acceptable only when justified by the real surface.
4. Prepare separate MAKE parts with real volumes, supported delicate details, stable bases and nominal millimeter dimensions. Initial design assumptions: a 200 mm ECOMECH figurine and a 230 x 160 x 200 mm open-front Halloween diorama, subject to final material and supplier review.
5. Preserve the robot's asymmetric armor, green/blue scheme, held pepper, face, chest core and mechanical silhouette. Rebuild missing geometry only where the reference and measured source justify it. Mark inferred unseen surfaces as inferred.
6. Rebuild the Halloween scene as actual objects: performer, keyboard, room structure, pumpkins, candles, shelves, warning ribbons and musical instruments. Replace broken background sheets with volumetric scene parts. Floating elements need designed physical connections or separate keyed assembly parts.
7. Use Blender for modeled details, scene assembly and authentic renders; use measured mesh tools for remeshing, decimation, intersections and topology repair. Preserve a textured visual variant and a separate manufacturing variant. Texture detail is not physical relief.
8. Screen process-specific wall/rod thickness, trapped cavities, small islands, assembly clearance and build-envelope fit. Use manufacturer guidance with an explicit material profile; never infer universal printability from polygon count or watertightness alone.
9. Export editable BLEND, detailed GLB, millimeter STL and 3MF where valid. Include separate-part exports, assembly information, measured QA JSON, source provenance, hashes, and front/side/back/three-quarter clay and textured renders.
10. Compare before/after geometry and appearance. Correct concrete defects before delivery. Label any remaining uncertainty or failure, and retain NOT SUPPLIER APPROVED until the manufacturer actually reviews the chosen material, scale and geometry. Do not place an order or contact a supplier as part of this task.

## Recovery boundary

The one-use workflow only reads and HEAD-checks the same two previously generated job results through the existing pinned collector. It encrypts one-hour download links to a task-scoped public recipient. The private decryption key remains local. No new inference, GPU provisioning, provider generation credentials, storage writes, website deployment or customer data are included. Private raw arrays and editable originals remain outside this public repository.

## Observed supplier guidance (17 October 2026)

- JLC3DP SLA guidance lists a baseline wall thickness of at least 0.8 mm and thicker protrusions/fastening features. WJP guidance varies with span: 1 mm at 5–10 mm, 1.5 mm at 50 mm, 2 mm at 100 mm and 3 mm at 200 mm. Full-color WJP maximum envelope is 390 x 340 x 240 mm.
- Sculpteo Prototyping Resin lists 0.8 mm minimum wall thickness with a 1:6 ratio, 0.5 mm engraved/embossed features and a 200 x 125 x 210 mm envelope. Its material page does not recommend enclosed or interlocking parts.

Sources: https://jlc3dp.com/help/article/3d-printing-design-guideline ; https://jlc3dp.com/help/article/wjp-products-design-guidelines ; https://www.sculpteo.com/en/materials/stereolithography/prototyping-resin/

These values are screening references, not a manufacturing approval. The exact selected process, final dimensions and supplier review govern the final acceptance. Executed geometry results and remaining limits are recorded below.


## Executed results

Read-only recovery run 39000492464 succeeded. Both decoder SHA-256 values matched the original receipts. Local tools: Blender 4.3, MeshLib, NumPy, SciPy, scikit-image and Trimesh. Original sparse surface cells were reconstructed into closed geometry; modeled internal support and room objects were united, collisions repaired and actual surface colors transferred barycentrically. No new inference was called.

### ECOMECH_V4

- Final triangles: 1,102,000; size: 143.996 x 143.998 x 200.049 mm.
- Closed components: 1; boundary loops: 0; detected self-intersecting triangle pairs: 0.
- Added local support bridges: 2.
- 16,000-sample geometric comparison against the closed pre-reduction assembly: P99 0.00361 mm; sampled maximum 0.01447 mm. This is not an exhaustive Hausdorff bound or an error bound against the photograph.
- Inward-normal chord samples below 0.8 mm: 10/16,000. Decorative tips and edges are included. The CSV requires material-specific review.
- `ECOMECH_V4-MAKE-V2-mm.stl` SHA-256: `4e3935355dedc23dcbbe29dfeb6c8340d0c14e923621da219780e25652027c86`.
- `ECOMECH_V4-MAKE-V2.3mf` SHA-256: `07521e444d79627cd3fc2110f7bf4e7e7cdec7aed0d78fcd4865e38e1efdc2bd`.
- `ECOMECH_V4-MAKE-V2.glb` SHA-256: `078b4e7d3fc3f6ba42a3ff5e60da2d96a315a83e6141716558cc0a50b506456d`.

### HALLOWEEN_MUSIC_ROOM

- Final triangles: 1,099,802; size: 235.040 x 162.240 x 200.003 mm.
- Closed components: 1; boundary loops: 0; detected self-intersecting triangle pairs: 0.
- Added local support bridges: 30.
- 16,000-sample geometric comparison against the closed pre-reduction assembly: P99 0.09227 mm; sampled maximum 0.28770 mm. This is not an exhaustive Hausdorff bound or an error bound against the photograph.
- Inward-normal chord samples below 0.8 mm: 249/16,000. Decorative tips and edges are included. The CSV requires material-specific review.
- `HALLOWEEN_MUSIC_ROOM-MAKE-V2-mm.stl` SHA-256: `a14f8db15980029023dc607c4ca0127bfd0a473ce244b0054ac7c525c9ad3e6a`.
- `HALLOWEEN_MUSIC_ROOM-MAKE-V2.3mf` SHA-256: `8b07872d9e3707a5262db557439cdbf2e4cba668be0325043555255e413f76e8`.
- `HALLOWEEN_MUSIC_ROOM-MAKE-V2.glb` SHA-256: `0e8b942510eebff25a7067a552dfd355d0668e458f7b1f494ed80bf1e2ddbde9`.

The original GAME assets and private source decoders are preserved. MAKE files are private deliverables and are not published by this change. The whole-room design includes inferred unseen surfaces and does not claim verified photorealistic likeness. Both whole-mesh topology gates pass. Supplier approval, physical durability, all-process feature compliance and physical pin fit remain pending. No supplier messages or orders were sent.
