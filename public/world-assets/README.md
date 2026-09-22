# Original FORGE portal sculpture

The LED model preserves the original public FORGE sculpture's 48 meshes, 2,976 triangles, all 192 accessors and node transforms. Its source GLB SHA-256 is `c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a`.

Only the three unused wood textures and their material dependencies were removed. The static SVG poster projects the same original triangles. The provenance JSON records source and output hashes.

Regenerate from an unchanged local copy of the reviewed original:

```sh
node scripts/prepare-portal-sculpture.mjs /path/to/original/polyhedron.glb
```

These assets serve the owner's requested WORLDIFACT display. No blanket model redistribution license is asserted; see `docs/ASSET_LICENSES.md`.
