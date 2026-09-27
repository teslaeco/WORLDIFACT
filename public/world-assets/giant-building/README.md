# Terrace Tower — exact owner GLB

This folder contains the portal-world landmark that replaced the previous Giant Tower on 27 September 2026.

## Owner-selected source

The WORLDIFACT project owner supplied the replacement as GLB, FBX and a texture package:

- GLB: `WORLDIFACT-e7e96cc3-8ad6-4ce8-996a-a4292407bc24.glb`
- SHA-256: `0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6`
- Size: 21,047,056 bytes
- Inspected geometry: 110 meshes / 110 nodes, 491,138 vertices, 264,680 triangles
- Materials/textures: 12 materials / 10 embedded texture images
- Animations: none
- Source bounds: approximately 4.415 × 9.622 × 4.268 source units

The existing generated Oracle artifact was retrieved without requesting another AI generation, verified against the exact byte length and SHA-256 above, and committed as:

- `public/world-assets/giant-building/giant-tower.glb`
- `public/world-assets/giant-building/current.json`

## Runtime representation

The five-portal valley now loads the **exact owner-selected GLB**, not the earlier procedural floor-profile derivative. Runtime validates HTTP success, GLB container length and SHA-256 before parsing it with Three.js.

The building remains lazy-loaded after the core world/avatar so a large landmark cannot block the five portals or the Queen startup. The exterior is scaled and positioned as a GAME world instance only; that transform does not claim real-world architectural scale or engineering validation.

## Interior truth boundary

The supplied exterior does not establish a verified walkable interior or door animation. WORLDIFACT therefore keeps the separate procedural lobby labelled **GAME / GENERATED INTERIOR**. Entering that lobby does not claim that the owner GLB contains that interior.
