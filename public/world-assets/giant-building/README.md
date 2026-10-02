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

- `public/world-assets/giant-building/terrace-tower-e7e96cc3.glb`
- `public/world-assets/giant-building/current.json`

## Runtime representation

The five-portal valley now loads the **exact owner-selected GLB**, not the earlier procedural floor-profile derivative. Runtime validates HTTP success, exact decoded length, GLB container and SHA-256 before parsing it with Three.js. Build preparation creates a lossless `.glb.gz` transport (about 8.45 MB rather than 21.05 MB), preserving every source byte. Browsers without gzip-stream decoding use the original GLB. A failed compressed delivery falls back once to that original path; no model generation is involved.

The building remains lazy-loaded independently of the core world/avatar. The UI reports download and preparation progress; bounded network/decoding failures expose a building-only retry. Verified bytes are reused across world visits, unused reads are cancelled, and character changes retain the existing world, vehicles and landmark. The exterior is scaled and positioned as a GAME world instance only; that transform does not claim real-world architectural scale or engineering validation.

## Interior truth boundary

The supplied exterior does not establish a verified walkable interior or door animation. WORLDIFACT therefore keeps the separate procedural lobby labelled **GAME / GENERATED INTERIOR**. Entering that lobby does not claim that the owner GLB contains that interior.
