# WORLDIFACT 3D Quality Audit — 2026-10-14

Status: **MEASURED (Luna-only archival baseline) / CONTROLLED ASTRA–SOL–LUNA COMPARISON BLOCKED pending approval and comparable files**.

## Source and method

The existing, previously paid-for 2026-10-14 Luna Standard continuity acceptance workflow:
https://github.com/teslaeco/WORLDIFACT/actions/runs/38554127828

GitHub Actions archive `luna-four-continuity-evidence-0a616426ff1e7074dbbd1cfe4ee33809058140ed` (artifact ID 11889760747) includes four actual GLBs plus a provider-job report. The four recovered bytes were independently checked against the recorded SHA-256 digest and parsed as GLB 2.0. The geometric triangle count was cross-checked with the glTF mesh primitive index accessor counts and Python trimesh mesh loading. No additional provider job, paid generation, credit debit, hold release, or fabricated comparison image was performed.

| Sequence | Real GLB bytes | SHA-256 prefix | Triangles | Meshes | PBR materials | Embedded images | UVs | Skins | Animations |
|---|---:|---|---:|---:|---:|---:|---|---:|---:|
| Luna Standard #1 | 663,340 | `e0d36b1b95bf` | 36 | 3 | 2 | 2 | yes | 0 | 0 |
| Luna Standard #2 | 672,824 | `0e5769369a5d` | 36 | 3 | 2 | 2 | yes | 0 | 0 |
| Luna Standard #3 | 305,932 | `41066f12bd58` | 36 | 3 | 3 | 1 | yes | 0 | 0 |
| Luna Standard #4 | 709,972 | `79801914b184` | 128 | 3 | 2 | 2 | yes | 0 | 0 |

**VERIFIED**: valid GLBs can be extremely low-poly even when texture/image bytes make them hundreds of kilobytes. The first three outputs consist of only 36 geometric triangles, and the fourth 128. All are backed by actual GLB bytes with expected SHA-256. They have PBR definitions and UV coordinates, but no skins or animations. This is a weak geometry-detail baseline for demanding characters and robots, **not** independent evidence of prompt fidelity or artistic quality.

**UNKNOWN**: whether these four jobs share comparable prompts, their exact per-job wall time (the archive provides whole acceptance window only), final invoices, anatomical fidelity, manifoldness after UV seam welding, or current customer-level downloads. The archive's USD 0.10 per-job field is a maximum API liability cap, **not** an observed bill. `trimesh.is_watertight` on unmerged imported UV-split meshes is not sufficient to declare physical non-manifoldness, so no watertight pass/fail claim is made.

## Reproducible offline measurements

```bash
node scripts/benchmark-studio-geometry.mjs path/to/original-1.glb path/to/original-2.glb
```

The CLI reports immutable content SHA-256, file size, mesh/node/primitive counts, declared/rendered triangles, PBR materials, UV primitives, texture/image counts, skins and animations. It does **not** infer AI identity from a filename, award a visual-quality score, validate engineering fitness, generate geometry, or contact a provider. For incomplete GLB recovery the separate stricter validator `src/lib/studioGlbIntegrity.ts` verifies embedded vertex/index data and the server checks the original SHA-256 before each download.

## Observed engineering bottleneck

The same Blender/MCP construction path is used with Astra, Sol and Luna. A valid GLB plus textured, named objects does not imply a detailed sculpt. The real Luna evidence demonstrates that the output gate currently admits 36-triangle assemblies as completed even where greater fidelity is desired. It does **not** demonstrate Astra or Sol quality for the same prompts.

The existing Studio contract in `src/lib/studioProtocol.ts` requires a complete first build, multi-view render inspections and a final `finish_model` decision. However, provider ceilings of USD 1.75 Astra, USD 0.35 Sol and USD 0.10 Luna constrain the available AI construction/inspection calls. A longer prompt or a model switch alone is not a trustworthy fix. Prompt complexity, first-pass planned parts, actual Blender topology, budget and final visual review must be measured separately.

## P1 implementation gates (not represented as completed)

1. **Geometry-first, category-aware specification:** store a requested subject class, scale, reference views, essential named/independent parts and a minimum honest first-pass silhouette before any cosmetic texture pass. Preserve original signed selection, model, mode and provider cap. A low-cost request that cannot reach demanded fidelity should report a limitation, not silently certify a box.
2. **Real detail accounting:** measure triangles, transformed mesh instances, physical components, UV presence, material maps, and render images at front/side/back/three-quarter angles after construction. Distinguish high-resolution textures from actual sculpted surface geometry. Never invent counts or silently auto-increase an admitted budget.
3. **Adaptive decomposition without hidden charges:** for robots, separate torso, head, arms, joints and armor plates as independent scene parts; for characters, anatomy, face, hair, costume and equipment. A single accepted call must remain within existing time/token tool limits. Any separately paid continuation requires a new explicit user authorization.
4. **Review before quality claims:** validate the original GLB, no external dependencies, usable mesh, intact dimensions and attachments. Mark inadequate results UNREVIEWED or INCOMPLETE for budget stops. Do not label rigs, PBR texture maps, manufacturing readiness or animations unless these exact artifacts exist.
5. **Benchmark presentation:** show counts and saved multi-angle renderings with original immutable job ID, receipt-bound model name, mode, SHA-256, points and separate measured API cost. A successful upload is not itself a passing artistic score.

## Controlled comparison awaiting budget and identical prompts

Use the following *same* requests and reference assets separately for each bound API model (Astra Standard / Sol Standard / Luna Standard):

- Steampunk alchemy workshop with distinct pumps, brass apparatus and glassware.
- Articulated battle robot with independent armor plates, shoulder/elbow/knee joints, cabling and recognizable silhouette.
- Sci-fi/fantasy character with believable anatomical proportions, face, hair, layered textiles and equipment.

Record exact prompts, reference hashes, current model receipts, GLB SHA-256, geometry/render quality from multiple views, user-point holds, wall time and actual provider usage. Consider Tripo/Meshy only when legally obtained equivalent output/reference settings are available. Never treat advertising screenshots as benchmark scores.

At the existing Standard guard, nine separately authorized same-prompt tasks would carry a **maximum combined provider API ceiling of USD 6.60** (three prompts x USD 2.20 across Astra/Sol/Luna), excluding any third-party competitor costs. This is a maximum liability bound, **not an actual bill or permission to incur it**. No controlled paid comparison was launched.

**Release gate**: no GREEN/GO on visual competitive-quality claims until high-detail benchmark outputs have been independently inspected. This document and the Luna archived measurement do not certify the P0 incomplete-recovery PR or production readiness.

## Verified source-level reason a tiny mesh can pass as technically complete

The general `standard` structural gate in `src/lib/studioQuality.ts` requires only positive mesh/triangle/rendered-triangle/material counts. The stricter reference-character minimum (25,000 rendered triangles and multiple independent meshes/materials) is selected in `src/lib/studioProtocol.ts:studioQualityProfile` only when reference photos are supplied **and** character wording matches. Prompt-only characters and robots therefore typically reach `standard`, where even a 36-triangle assembly can meet the generic structural condition. This is a **source-code audit**, not independent visual proof of the specific Luna jobs' text prompts.

**P1 repair acceptance**: introduce a separate non-financial, non-manufacturing `LOW_GEOMETRY_DETAIL` diagnostic for requested complex subjects using actual saved GLB metrics, preserving the original completed/failed accounting. Do not silently turn a paid successful model into a charged failure or invent a high-poly result. Improve Blender scene assembly and multi-angle inspection before considering strict high-detail gates for prompt-only robots/characters. Add real same-prompt comparative acceptance only after user-approved provider budgets.
