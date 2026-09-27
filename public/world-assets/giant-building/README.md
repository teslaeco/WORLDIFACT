# Terrace Tower GAME asset

This folder documents the portal-world landmark that replaced the previous Giant Tower on 27 September 2026.

## Owner source

The WORLDIFACT project owner supplied a new FBX, GLB and texture package for this replacement:

- GLB: `WORLDIFACT-e7e96cc3-8ad6-4ce8-996a-a4292407bc24.glb`
- GLB SHA-256: `0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6`
- GLB size: 21,047,056 bytes
- Source geometry: 110 meshes / 110 nodes, 491,138 vertices, 264,680 triangles, 12 materials, 10 embedded texture images, no animations
- Source bounds: approximately 4.415 × 9.622 × 4.268 source units
- Texture package SHA-256: `b6826b0fa9d6cfd72bfbe7733ad66e3b6071833c52346a2367ee4f2fedae49cf`

Visible source material groups include Rose limestone, terrace stone, roof membrane, light/mid/warm stone, reflective glass, graphite metal, timber, foliage and pale rooftop equipment.

## Runtime representation

The previous static Giant Tower GLB and its ten base64/gzip transport parts were retired.

The valley now builds a compact **GAME derivative** directly in Three.js from ten floor silhouettes extracted from the owner's new GLB. The runtime keeps the new source's defining stacked/offset massing, irregular floor footprints, narrower roof cap, pink stone character, dark glass, terrace rails, planting and rooftop equipment while avoiding a 21 MB model download in the starting world.

The source hash and source geometry counts are stored on the runtime object as provenance. The GAME derivative is not represented as byte-identical source geometry, texture/UV parity, CAD, engineering validation or a manufacturing model.

## Interior truth boundary

The owner source does not establish a verified walkable interior or door animation. WORLDIFACT therefore keeps the separate procedural lobby labelled **GAME / GENERATED INTERIOR**. Entering that lobby does not claim that the supplied model contains that interior.
