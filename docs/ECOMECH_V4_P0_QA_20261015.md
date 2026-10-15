# ECOMECH V4 — P0 Recovery and Character Fidelity QA

**Date:** 2026-10-15  
**Scope:** recovery/audit only; draft PR #293; **NOT DEPLOYED**  
**Decision:** **NO-GO** for quality release, marketplace, printing, and new paid generation.

## Exact reference provenance

- Recovered original PNG from the already-existing V4 one-shot Actions artifact: **2,712,270 bytes**.
- PNG dimensions: **1122 × 1402**; SHA-256: `9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053`.
- Actual transported JPEG: **267,328 bytes**, SHA-256 `562e97c533661bbe60e557a9cc1b0d42732fd8341cba43973bd7ffbadf809d31`.
- Source: [existing failed reference-image run #38653687131](https://github.com/teslaeco/WORLDIFACT/actions/runs/38653687131). These are ORIGINAL input images, not mesh renders or an AI image generation claim.
- Different older reference target in PR #290 is pinned to SHA `be79f5e1...`. Its geometric silhouette scores are **not valid evidence for this exact V4 PNG**. Re-annotate and visually review before using that contour as a release gate.
- Input integrity now rejects swapped full-resolution PNG bytes before the original task's irreversible claim. Byte-reading is bounded. This change does **not** generate a model.

## Original Astra job: authenticated Oracle read-only recheck

- Exact original UUID: `d3fc6e0f-6258-4a2d-9935-ae31b0048e61`.
- Verified workflow: [GET-only original job and budget audit #38682133615](https://github.com/teslaeco/WORLDIFACT/actions/runs/38682133615). Report artifact `ecomech-v4-original-readonly-recovery-643e3712a40dc653d4808200b3ef978cdc826482`.
- Terminal state `failed`; worker's recorded actual model `gpt-6-astra`; matching model-bound sealed terminal budget evidence VERIFIED.
- Provider **maximum liability** USD **1.411108**. Actual OpenAI billed expense: **UNKNOWN**. Do not substitute this conservative exposure for a provider invoice or settled cost.
- Original V4 GLB: still missing (GET `/model` returns HTTP **409**). No mesh/render exists to evaluate for this V4 job.
- Read-only audit did exactly four original-UUID GETs, zero provider-generation POSTs, zero customer ledger mutations, zero automatic retries, zero additional OpenAI API cost.

## Recovered earlier Blender reference-shaped geometry (NOT V4 photorealism)

Existing artifact: [Blender reference sculpt #38651850201](https://github.com/teslaeco/WORLDIFACT/actions/runs/38651850201).

| Property | Independently checked from original artifact |
|---|---|
| GAME GLB original bytes | 7,579,688 |
| GAME GLB SHA-256 | `87f5bd78cc39a04f47ee85f16418003575c3dbd363591dd3446fb9a4bb616e4c` |
| Editable BLEND original bytes | 3,305,127 |
| Editable BLEND SHA-256 | `d33a6a8e8558b4212e9d15f9fce907b8db12dab49a3e6d09d10d113829d804fd` |
| Mesh geometries and instantiated triangles | 574 / 384,700 |
| UV-containing geometries | 496 / 574 |
| glTF materials | 9 |
| Embedded image textures | 2 base-color PNG images; emerald and cobalt |
| Normal, metallic-roughness or occlusion texture maps | **0** in GLB |
| Skin/rig or animations | **0** |
| Actual rendered inspection views | Front, side, back, 3/4 (archived) |
| Prior orthographic silhouette metric | best IoU 0.49894 on OLD `be79f5e1...` annotation |
| Artistic / PBR / MAKE acceptance | **NO-GO** |

The visual result differs significantly from the approved user artwork in helmet, torso mechanics, mass distribution, feet, hands, layered armor and chili curvature/scale. These are actual geometric/artistic issues, not a polygon-count shortage. **No photorealism or real-world manufacturability is claimed.**

## Overnight Turn3–Turn5 — recovery search

Reported checkpoints: 734 meshes, 393,088 triangles, Turn3 electrical detail pass; Turn4 24 armor PBR/UV parts; Turn5 leg silhouette work (reported local score 65.78%). These are **UNVERIFIED user-described results** until original files and their SHA-256 are located. Desktop Commander authorized device is OFFLINE; no matching committed archives have been verified on main or the known PRs. Do not relabel the older 574-mesh Blender artifact as a missing checkpoint.

## Character quality priority

1. Preserve and identify original V4 reference *exact* bytes; explicit human-reviewed outline, 3/4 camera, landmarks, dimensions, color/part segmentation.
2. Recover the Turn3–Turn5 GLB/BLEND or original Blender scripts **before** building a replacement. Re-render original from front, 3/4, side, back, with consistent camera and lighting.
3. Fix helmet, asymmetric chest shell, raised arm pose, actual gripper fingers, waist/leg proportions and detailed exposed side **before** any repeated fasteners or millions of generated triangles.
4. Verify actual UV charts, texture slots and PBR base-color, roughness, metallic and normal maps. Nine shader slots and two base-color images are not a completed detailed PBR texture set.
5. Separate geometry authorship and cost: Astra for image-conditioned reasoning/planning/Blender direction; Blender for exported geometry; Tripo/Meshy for any separately approved native Image-to-3D geometry. Do not assign third-party meshes to Astra.
6. Verify original GLB / source BLEND plus real format exports, hashes, independent geometry QA, LOD under mobile memory ceilings, HTTPS staged viewer and owner visual review. MAKE requires independent print/CAD validation.

### Evaluated official provider interfaces, zero provider submissions

- [OpenAI GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra): image input and tool orchestration supported; not independently a guaranteed photogrammetric 3D exporter.
- [Meshy Image-to-3D](https://docs.meshy.ai/en/api/image-to-3d): `meshy-7.1`, `geometry_resolution:4k`, PBR output and target formats; PR #292 is a non-submitting adapter only. Vendor billing, upload rights, actual fidelity and persistence are **unverified**.
- [Tripo H-series Image-to-Model](https://developers.tripo3d.ai/en/docs/generation-image-to-model): native image-to-3D async API, separate geometry provider, UV/PBR options. No paid submission or pricing commitment made.

## Security/release gates

No automatic retries; no merging or production release without owner GO; no changes to secrets, points, Stripe or account history. The USD 20 additional OpenAI cap is cumulative, not per attempt. A separate approval is needed for a new external API subscription, GPU resource or paid Tripo/Meshy test. A consumer download should default to independently verified mobile GLB LOD, not a 265 MB high-detail original.

**Evidence tags:** source artifact and original Oracle read-only receipt VERIFIED; local checkpoint Turn3–Turn5 BLOCKED; exact-head CI pending until observed; V4 visual fidelity BLOCKED; actual OpenAI invoice UNKNOWN; production viewer NOT DEPLOYED; MAKE NOT APPROVED.
