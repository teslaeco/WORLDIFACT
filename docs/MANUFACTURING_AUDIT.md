# Manufacturing audit — 14/15 September 2026

All models that fail the selected supplier's process requirements must receive a separate MAKE revision before production. Rendering success, a completed generator job and an automatic quote do not approve production.

## JLC3DP preliminary test

One legacy Queen STL, quantity 1, scaled to a largest dimension of 100 mm, was uploaded with user authorization for quote testing. No order, payment or cart submission occurred.

| Material/process | Color and finish | USD/part | vs white |
|---|---|---:|---:|
| SLA 9600 Resin | White, general sanding | 2.72 | 1.00× |
| SLA Black Resin | Grayish black, general sanding | 7.30 | 2.68× |
| WJP Full Color Resin | Multicolor, oil spraying | 27.27 | 10.03× |
| SLM 316L | Metal, default configuration | 53.13 | 19.53× |
| SLM Titanium TC4 | Silver gray, default configuration | 63.75 | 23.44× |

Source: [JLC3DP calculator](https://jlc3dp.com/3d-printing-quote?queryMaterialTechnicsId=1), observed 14 September UTC. Alternative materials were read from settled configuration prices. They were not saved to an order.

The STL has no color textures; WJP appearance is unverified. White and black use different resin products, so the difference is not a pure color surcharge. The mesh is not approved; prices may change after engineering review.

Original GLB SHA-256: `63d9924795454898e60f52fe8bce87c5906e60016f06211c19b0f2f88078b99b`.

Uploaded STL SHA-256: `171156a261c6449ecaca8d5664b4d9c7be492e1ee6b456b42e4fb1d9b8e3fb34`.

File bounds are 46.7955 × 100 × 35.4746 mm. The portal reports 10.088 × 4.884 × 3.336 cm and 29.9 cm³; investigate the dimensional discrepancy/orientation before ordering. Its $6.54 shipping estimate, 8–13 business-day service and 0.17 kg shipping weight had no verified destination. They are not a landed cost, delivery promise or model mass.

The morning review established settled white 9600 Resin totals of $5.44 for 2 parts and **$27.20 for 10 parts**, using the existing calculator's native quantity controls. The unit cost remains $2.72: no quantity discount was observed at 10. These were unsaved specification quotes, without shipping, tax, engineering review or an order. The original quantity of 1 was restored after testing. Earlier typed quantity edits did not persist; the prior UNKNOWN bulk status is superseded by these observed values. The previously rejected Discard action was not repeated; pending configuration was preserved using Save changes. The 200 mm price remains UNKNOWN.

## Recovered ISS quote and source

A saved JLC3DP screenshot dated 14 September records quantity 1 of `ISS_370mm_full_color.3mf`: WJP Full Color Resin, multicolor, oil spraying, **$213.53 for printing**. The portal reports 37.184 × 22.501 × 14.697 cm, 180.15 cm³ and a thin-wall warning. The risk-acceptance box was not selected. Shipping shown was $55.72 with a 2–4 business-day UPS DDP option, but destination and final tax treatment were not verified. The 3.73 kg figure is shipping weight, not a measured model mass. No order or production approval is established by this screenshot.

The 370 mm GLB, Blender source, paintable STL, 3MF, OBJ/color archive and reference renders were found among saved project files. The GLB, Blender and STL were recovered for this review; this supersedes the earlier blanket claim that the ISS source was missing. Source identity between the quoted 3MF and audited GLB remains to be reconciled: their reported bounds differ. This is not a quote for a 100 mm ISS and is not a valid size-only comparison against Queen.

Audited GLB SHA-256: `8bb2e346da2ad110a272e6bda976ced2114c5c620077eb2acaa0493bc9b40428`.

A conservative monochrome cleanup removed 2,039 duplicate or degenerate triangles, reducing 469,984 to 467,945, and welded/removed unused vertices from 1,290,303 to 279,332. **All 27 geometries remain open; the complete assembly is not watertight.** Separate experimental revisions use maximum spans of 100 mm and 370 mm:

| Revision | Bounds (mm) | Smallest-axis span flags below 1.5 mm | Production status |
|---|---|---:|---|
| ISS 100 mm | 100 × 52.456 × 61.422 | 8 | NOT PRINT READY |
| ISS 370 mm | 370 × 194.085 × 227.262 | 4 | NOT PRINT READY |

Axis spans are screening flags, not actual wall-thickness measurements. Both revisions need panel/truss design, connected solids, joints and support planning, slicer checks, color review and supplier engineering review. No blind filling, boolean union or fabricated mass estimate was used. Original files were preserved; cleaned STL copies and machine-readable reports remain in the owner's private review packet.

## Supplier correspondence

Both 14 September qualification replies were read. Exact correspondence links and business terms are in the owner's private Polish report, not a public email archive.

JLC3DP confirms SLA and WJP full-texture color. It states that pricing is per model and no manufacturing-inclusive kg tariff is offered. WJP file options include OBJ + MTL + PNG together in ZIP/RAR, 3MF, and PLY by manual email review. The stated upload maximum is 100 MB, with 4K textures recommended. No review-before-payment order or new email was submitted.

Sculpteo describes monochrome small series and material-specific design guides, with geometry-dependent pricing instead of a fixed kg tariff. Its calculator is blocked by human verification. No comparable model price was obtained.

Sculpteo's current MJF PA12 guide distinguishes a 0.8 mm flexible wall from a 2 mm rigid wall, with 0.7 mm supported / 0.9 mm unsupported stemmed elements and 0.5 mm minimum spacing. Raw gray is described as the economical finish; black dyeing, polishing and chemical smoothing are separate options. Its automatic solidity check does not detect every physical failure such as floating or overloaded thin parts. [Source](https://www.sculpteo.com/en/materials/jet-fusion-material/jet-fusion-solid-black-plastic/), rechecked 15 September 2026.

Sculpteo's SLA Prototyping Resin guide lists a 0.8 mm wall with a 1:6 ratio and 0.5 mm embossed/engraved detail, but explicitly describes the material as unsuitable for production and functional prototyping. It must not be treated as the default series-production resin for WORLDIFACT figures. [Source](https://www.sculpteo.com/en/materials/stereolithography/prototyping-resin/), rechecked 15 September 2026.

Registration, certifications, delivery coverage, packaging and claims procedures are supplier declarations, not independently verified qualification. Neither supplier is approved for repeat production.

## Geometry work

The recovered legacy GLB contains 91 glTF meshes, 19 materials, 587,564 source triangles and 592,136 instantiated triangles. Trimesh represents it as 99 geometries/126 instances. It is the older long-dress Queen, not the current character revision. Original size: 39.71 MB.

The reproducible conservative pass removes degenerate/duplicate faces and unused vertices, welds UV/normal seams in a monochrome copy, fixes normals and scales the largest dimension to 100 mm. Triangle count remains 592,136; instantiated vertices decrease 351,360 → 302,869. **83 geometries are closed; 16 remain open.** An earlier limited weld left 33 open; the final count supersedes it.

Open regions include gown/facets, shoulder inlays, head, eyeliner, fan surfaces, hands and a glove triangle. The complete assembly is not watertight. No blind hole filling, boolean union, self-intersection, actual wall-thickness, slicer or supplier approval was performed.

80 instances have a smallest axis-aligned span below 1.5 mm at 100 mm scale, including a pendant chain at 0.06663 mm. These are screening flags, not wall-thickness measurements. Joining components may change the conclusion.

A separate **unreviewed color package** contains OBJ + MTL + eight PNG color textures, 14 converted materials, unchanged 592,136 triangles and matching 100 mm bounds. Archive: 24.39 MB; expanded: 80.54 MB. PBR-to-MTL conversion can alter metallic/alpha/color appearance. It preserves the original uncorrected geometry; no visual color approval or supplier upload was performed.

Reproduction scripts: `scripts/audit-model.py`, `scripts/prepare-color-candidate.py`, pinned requirements alongside. Private model files remain outside the repository.

## Cost drivers and required revisions

For unchanged solid geometry, volume scales with size cubed. Relative volume at 50/100/150/200 mm is 0.125/1/3.375/8. This is not a price multiplier: fixed walls, hollowing, supports, chamber packing, minimum charges and finishing need fresh quotes.

More polygons do not themselves guarantee finer printed detail. Physical feature size, production time, support removal and finish matter. Native texture resolution cannot make a separate 0.07 mm chain printable.

[JLC3DP's general guide](https://jlc3dp.com/help/article/3d-printing-design-guideline), updated 24 August 2026, lists contextual 100 mm-scale wall targets: SLA 1.5 mm; nylon, FDM and metal 2 mm. At 200 mm it lists SLA 2 mm and FDM/SLM 2.5 mm. Text/detail guidance is 0.8 mm for resin/nylon and 1 mm for FDM/metal. Material pages such as [full-color resin](https://jlc3dp.com/help/article/full-color-resin) can list smaller minima. Use the stricter project target until exact feature/material/size review. Sculpteo requires its own selected-material guide.

JLC3DP's guide lists assembly clearances of 0.2 mm for SLA, 0.2–0.4 mm for MJF/SLS and 0.5 mm for SLM/FDM; moving-part clearances are 0.5/0.6/1.0/0.5 mm respectively. WJP is not separately specified in that table, so its clearance remains UNKNOWN rather than being copied from SLA.

| Model | Required next production work |
|---|---|
| Current Queen | Recover source; connected clothes, current short-dress specification and six fan blades; thickness/clearance review |
| Legacy Queen | Repair 16 open geometries; join/thicken suitable details; review overlaps, support removal and appearance |
| Julie | Recover GLB/Blender; face, teeth, neck, fingers, garment joins, balance and base |
| Astronaut, 100 mm height | Recover source; visor/tubes/hands, connections and base |
| ISS, 100 mm / 370 mm maximum span | Recovered source; repair 27 open geometries, reconcile quoted 3MF bounds, split/thicken truss and panels, assembly joints and support strategy; display model only |
| Wooden polyhedron | Recover exact topology/dimensions; design joints; separately verify CNC/laser supplier capability |
| New procedural game objects | Separate MAKE solids, overlaps, normals, walls, units, assembly and color package |

Each future revision must record source/revision hash, size/units, supplier/material/finish, mesh/thickness result, color approval, quote ID and engineering exceptions before production readiness changes.
