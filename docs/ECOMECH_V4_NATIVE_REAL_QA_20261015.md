# ECOMECH V4 — Native Blender reality check, 15 October 2026

**Branch:** \`feat/ecomech-v4-real-sculpt-20261015\`  
**Draft PR:** [#295](https://github.com/teslaeco/WORLDIFACT/pull/295)  
**Build:** [GitHub Actions #38686151848](https://github.com/teslaeco/WORLDIFACT/actions/runs/38686151848) — **SUCCESS**  
**Repo verification at tested head:** [#38686157205](https://github.com/teslaeco/WORLDIFACT/actions/runs/38686157205) — **SUCCESS**  
**Release decision: NO-GO** (visual fidelity remains insufficient).

## What has actually been built

The V4 Blender branch builds original editable mesh elements guided by a human-drafted contour for the **exact approved V4 user image**. It replaces the failed V2 round helmet/smooth torso and incorrect chili geometry, adds physically thick and curved armor panels, individually created MCC/copper/mechanical assemblies, segmented fingers wrapped around the pepper, UVs and synthetic packed base-color/metallic/roughness material maps. It preserves the **different, already-paid historical text-only** Astra GLB unchanged in the editable BLEND source collection.

This is a **Blender-authored, manually reference-guided reconstruction**, *not a successful image-conditioned GPT-6 Astra V4 model*, and not Meshy/Tripo geometry. The exact photographed source was available locally from the archived failed image-guided Astra job and was SHA-pinned before the Blender build. The original image-guided V4 Astra attempt remains FAILED with no original V4 GLB.

## Immutable original and output evidence

| Evidence | Actual result |
|---|---|
| Original exact approved V4 PNG SHA-256 | \`9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053\` |
| Existing historical Astra text-only source GLB SHA-256 | \`7e7f3aea755dfdd0ad957124d7e1dc33004905e0052fdab3d60b587f34cdc7b4\` |
| **New V4 GAME GLB** | **8,964,884 bytes** — SHA-256 \`629cca8ce22e7463a4af981d7004f7703124efc6090460b3da42f6660767ea27\` |
| **New V4 editable BLEND** | **4,916,202 bytes** — SHA-256 \`1e4845b679c9546a0716acff2b8a3e519acf2d0b313fba0d18d56fdf9307b24a\` |
| Actual GLB scene | 597 separate meshes; **391,248** real triangle faces |
| Embedded PBR material slots | 10 glTF materials, 8 embedded PNG images, base-color + metallic/roughness support on selected materials |
| Synthetic authored PBR texture inputs | 12 packed maps in Blender (GLB exporter packed channels into 8 PNG images) |
| Mesh UV | 597 meshes reported with UV layers; independent artistic UV quality is unreviewed |
| Rig / skeletal animation | 0 skins, 0 animations |
| FBX, OBJ/MTL | NOT exported / NOT verified for V4 |
| Android LOD / live public 3D viewer | NOT built or deployed for V4 |
| Manufacturing validation | NO-GO |
| New provider spend by this run | **USD 0.00 OpenAI**, no Meshy/Tripo submission |

### Four actual native CPU renders of the new GLB

- Front: \`db560987dbde9e779dacde428c188671b6964545c949ecc78b5c5ba1b4353e6f\`
- Three-quarter: \`e78f88f9badbeeecab74a424b3bbd0b1d7126305bc4e3035256d27061bce1391\`
- Side: \`e9f6108939d92b8d6bf9d27049ce8eb6628a21672443fbbfe5c65da96e5c2e29\`
- Back: \`17347855f12d80e70ecc3871854dd05288d1f56be72f454d3980ace9bb9e2a6c\`

The full exact source and generated files are in immutable GitHub Actions artifact:
\`ecomech-v4-native-reference-rebuild-c4b85f1557df058b6bac37c6f04f9fa5e9d64966\`.

## Visual QA: not a win

A rough hand-drafted V4 photo silhouette annotation was used without camera calibration (five yaw hypotheses). Old recovered V2 GLB baseline best annotated IoU: **0.50226**. New geometry best annotated IoU: **0.48396**, at 25°. **Silhouette alignment became worse on this preliminary metric**, despite a better-directed chili, less smooth hero helmet and more varied mechanical details. These are projected coarse masks, **not photorealism confidence values**.

Human inspection of the four native renders confirms a substantial gap: the torso remains sparse/open with oversized repeated cylindrical modules, armor is too flat/rectangular, realistic shoulder/hip anatomy and foot articulation are incomplete, and material lighting still looks synthetic. No visual-quality gate has been earned. Do not promise a high-end character on the basis of 391k triangles, green CI, or these shader maps.

## Risk and next engineering target

1. Retrieve exact Turn3–Turn5 originals (734 meshes / 393,088 triangles were user-reported, not independently recovered). Current authorized Desktop Commander device is OFFLINE.
2. Do not stack more procedural primitive detail on this current silhouette. Either pursue genuine image-conditioned high-quality reconstruction with a suitable image-to-3D geometry provider (Tripo/Meshy, priced and explicitly approved separately), or do a deliberate artistic sculpt/retopology pass with mesh shape review.
3. Preserve vendor lineage honestly: Astra model planning/instructions and Blender rendering are not equivalent to a native third-party image-to-3D output.
4. Only after visual approval validate GLB and any real FBX/OBJ, rig/animations, collision/mobile LOD, HTTPS staging viewer, and separate GAME vs MAKE validation.

## Controls

No original Oracle job retry, no provider invoice claim, no buyer/points/Stripe changes, no PR merge, no production deployment. PR remains draft. **NO-GO** for V4 visual release and storefront.
