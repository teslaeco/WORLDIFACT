# ISS print-preparation checkpoint — 17 September 2026

Status: **VALIDATION REQUIRED**. This checkpoint records source files and a conservative no-cost geometry pass. It is not manufacturing approval, a supplier order, a slicer result or an Astra generation receipt.

## Uploaded source package

| File | Bytes | SHA-256 | Observed role |
|---|---:|---|---|
| `ISS_370mm_OBJ_color.zip` | 40,568,741 | `a3a172b4eff7d7982d4175bcabeadf82833b277284e024438c55487ae5f1bc06` | OBJ + MTL + texture atlas, millimetres |
| `ISS_370mm_full_color.3mf` | 39,136,189 | `1818eb735f7bf823b7948c43ee5c05c797e262c088d9fb00b8ff7973816a70fa` | Full-color 3MF candidate |
| `ISS_370mm_paintable.stl` | 23,499,284 | `829232992ab9d04ee63f16e9729c753f797d8a807e858b21d110a34f4b058863` | Paintable geometry source |

The 3MF metadata states:

- Title: `ISS 370 mm - historical NASA configuration - FORGE print preparation`.
- Designer/source: `FORGE Studio; source NASA Visualization Technology Applications and Development`.
- Description: `Opaque reinforced collectible. Supplier engineering review and physical prototype pending.`

The OBJ package `UNITS.txt` states millimetres and recommends full-color resin/WJP for supplier engineering review; it does not record an accepted order.

## Geometry audit

The uploaded STL contains 469,984 triangles. Its source extents are approximately **370.000 × 227.262 × 194.085 mm**. The complete assembly is not watertight. Existing project evidence records a full-color 370 mm calculator result of **$213.53** and a supplier thin-wall warning; it is not production approval and is not a quote for smaller variants.

The recorded manufacturing audit already requires the ISS production revision to split/thicken panel and truss features, design assembly joints and support strategy, then run slicer and supplier engineering review.

## Conservative solar-array reinforcement candidates

A no-cost local geometry pass preserved every source STL triangle, scaled the model to four requested maximum spans and appended four separate watertight backing solids at the solar-array planes. Each backing solid is **1.5 mm thick in the final-size file**. No blind hole filling or boolean union was used.

| Variant | SHA-256 | Triangles | Solar backing | Status |
|---|---|---:|---:|---|
| 50 mm | `c6e0a705b5e02aa421294d0fe1b1fdc785f0e96163d6f63a406979714b56bd04` | 470,032 | 1.5 mm | VALIDATION REQUIRED |
| 100 mm | `cca8897738f6b401cc13fd0fd111dce77860341812188135451e5a2cd0c78aab` | 470,032 | 1.5 mm | VALIDATION REQUIRED |
| 150 mm | `0cfcd56c255095bfd2536b1d1969858b299f99bf533ac4b7a54d3753507fda70` | 470,032 | 1.5 mm | VALIDATION REQUIRED |
| 200 mm | `86f7b6f4d616e529cbe110b9311467ec79c4e1be071b8ef09e2918de859d1da6` | 470,032 | 1.5 mm | VALIDATION REQUIRED |

The 100 mm candidate reopens at approximately **100.000 × 61.422 × 52.456 mm**, with five bodies (the original dominant source assembly plus four reinforcement solids). The overall file remains non-watertight because the original ISS geometry remains open. The backing pass therefore mitigates one known failure mode but does not establish printable or sale-ready status.

Required next checks before any READY label: process-specific actual wall analysis, connected-solid/assembly review, slicer/manifold/self-intersection checks, support and orientation plan, color remapping for full-color geometry, supplier engineering acceptance and a physical prototype.

## Astra provenance boundary

No verifiable Astra job receipt or Astra-authored revision identifier is embedded in the uploaded files. The Shop now contains a source-based ISS print-prep prompt and the standard worker prompt explicitly asks for millimetres, wall/clearance targets, reinforcement of fragile unsupported sheets/struts and remaining non-manifold/support reporting.

Until a real paid Astra job is explicitly executed and its receipt is recorded, the current uploaded/candidate files must **not** be labelled `Astra corrected`. When such a job succeeds, label its resulting revision separately as `GENERATED · Astra-assisted print-prep · VALIDATION REQUIRED`; do not retroactively relabel the source package.

## Customer pricing boundary

The customer-facing Shop reuses existing observed calculator data without exposing contractor names. Exact recorded 100 mm comparisons are $2.72 for white SLA resin and $27.27 for WJP full-color resin on a different legacy model. The 5/15/20 cm values shown in the Shop are explicitly marked estimates based on cubic solid-volume scaling, not live or binding quotes. Wood, stone, laser and CNC combinations remain selectable but show `Quote required` until verified pricing exists.
