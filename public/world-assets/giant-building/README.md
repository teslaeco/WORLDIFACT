# Giant Tower GAME asset

This directory contains the browser delivery package for the giant enterable building added to the WORLDIFACT five-portal valley.

## Provenance

- Source supplied directly by the WORLDIFACT project owner on 25 September 2026: `WORLDIFACT-40bd3040-c0c9-4e40-8ac1-5ee983fc618b.glb`.
- Source SHA-256: `9c2c61af94243788e1938d99b598f8bfd1281ac710bf41236467db263b5a4e5a`.
- Source size: 23,449,560 bytes.
- Source inspection: 15 meshes, 15 materials, 14 textures, 522,672 vertices, 242,120 triangles, no animations.
- Raw source bounds are approximately 3.6 × 10.028 × 3.4 units.

The exact 23.4 MB source binary is not published in this repository by this change. The runtime exterior is a **GAME-optimized derivative** made from that owner-supplied source so mobile loading stays bounded.

## Runtime derivative

- Decompressed GLB size: 98,392 bytes.
- SHA-256: `032d4cb75880d75d8b78493fe75babefea64676b041389fe23e17a362d982ccd`.
- 2,086 vertices / 2,690 triangles.
- All 15 source material groups remain represented, but geometry is simplified and textures are removed/replaced by lightweight PBR color materials.
- This derivative does **not** claim source topology, texture, UV or material parity and is not a MAKE/manufacturing file.
- The GLB is gzip-compressed and base64-split into four small static parts only as a repository/browser transport package. The client reconstructs and validates the bounded GLB before rendering.

## Interior truth boundary

The supplied source did not contain a verified walkable interior or door animation. WORLDIFACT therefore uses a separate procedural lobby labelled **GAME / GENERATED INTERIOR**. Walking inside that lobby does not prove the original source model contains that interior.

The exterior instance is scaled at runtime only. The project does not claim a real-world building scale, engineering approval, structural validation, manufacturing readiness or a supplier-approved construction model.
