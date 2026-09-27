# Asset and source attribution

WORLDIFACT contains original project code/assets plus reviewed copies or adaptations from the project repositories listed below. Generated or simulated content is not presented as real observation data.

## Terra Observation Earth visual used by Fix ISS EVA

- Source project: `Terraforming-Planet/Polar-Sun-Moon-Analysis`
- Reviewed source revision: `c91d59eafb87cf9657f8bf78a5e431fb35665849`
- Adapted source file: `web/src/CleanRealisticEarthGlobe.tsx`
- License: MIT License, copyright (c) 2026 Polar Sun Moon Analysis Contributors.
- Public source/demo: https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/
- WORLDIFACT adaptation: `public/apps/iss/terra-earth.js`

The EVA globe uses the same official NASA GIBS product identifiers as Terra Observation:

- `BlueMarble_ShadedRelief_Bathymetry` — complete visual base/fallback.
- `VIIRS_SNPP_CorrectedReflectance_TrueColor` — dated true-colour imagery that can include observed clouds.
- NASA GIBS endpoint: `https://gibs.earthdata.nasa.gov/`.

The globe inside Fix ISS is a visual backdrop for the simulator. It is not labelled as live scientific observation evidence. Users are directed to Terra Observation for source/date-aware Earth-observation work.

## ISS exterior source

The copied Fix ISS simulator credits the NASA / Visualization Technology Applications and Development historical ISS 3D model in its in-product help. The repair stations, astronaut, tools, interiors and game tasks are separate training/simulation content and must not be interpreted as a list of current ISS faults or as NASA operating procedures.

## WORLDIFACT account sculpture

- The login and portal sculpture reuses the owner's original public FORGE model at `https://forge-world-builder.terraformingplanet.chatgpt.site/world-assets/polyhedron.glb`.
- Audited source Site commit: `6f5f239239f05e72b029cc1014e982a587a2ece5`; original GLB SHA-256: `c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a`.
- Use in WORLDIFACT was expressly requested by the owner on 21 September 2026. Original source and wood textures remain unchanged at FORGE; WORLDIFACT loads the public GLB through a hash-checked same-origin proxy and applies emissive LED materials at runtime. No general third-party asset redistribution license is inferred.
- The audited model contains 48 open-frame meshes and 2,976 triangles. No replacement polyhedron or filled faces are generated.
- The account background Earth uses NASA GIBS Blue Marble imagery through the existing project's reviewed image source. This is an artistic background, not a current Earth-observation result. Stars, bloom and paint effects are local Three.js animations.

## 24 September gameplay materials

`src/lib/pvMaterial.ts` creates an original local GAME cell pattern for the rover and separate loader/bucket panels. No external texture, paid generation, brand asset or manufacturing approval is involved. The Queen audit records source hashes and aggregate geometric checks only; its original binary is not copied into the public repository. The screenshot-comparison rim is not replaced with a newly invented asset.


## 27 September Terrace Tower replacement

- Owner-supplied replacement sources: `WORLDIFACT-e7e96cc3-8ad6-4ce8-996a-a4292407bc24.glb`, matching FBX, and `WORLDIFACT-e7e96cc3-8ad6-4ce8-996a-a4292407bc24.textures.zip`.
- GLB SHA-256 `0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6`, 21,047,056 bytes; inspected as 110 meshes / 110 nodes, 491,138 vertices, 264,680 triangles, 12 materials, 10 embedded texture images and no animations.
- Texture package SHA-256 `b6826b0fa9d6cfd72bfbe7733ad66e3b6071833c52346a2367ee4f2fedae49cf`, 3,673,160 bytes. It contains owner-supplied foliage, graphite metal, leaf, equipment, rose limestone, three stone variants, terrace stone and timber textures.
- The previous Giant Tower runtime package, its ten base64/gzip transport parts, and the interim procedural floor-profile derivative are retired from the portal-world release.
- The playable valley now loads the exact owner-selected GLB, committed at `public/world-assets/giant-building/giant-tower.glb`. Runtime validates its 21,047,056-byte length and SHA-256 before parsing. No new AI generation was requested to ingest it.
- The exterior is scaled/positioned as a GAME world instance only; no CAD, engineering, structural or manufacturing validation is claimed.
- The walkable lobby remains original procedural GAME scenery and is explicitly labelled `GAME / GENERATED INTERIOR`; it is not claimed to exist in the supplied source model.
- These sources were supplied directly by the WORLDIFACT project owner for this integration. This record does not independently establish rights in any embedded third-party design or texture beyond the owner's supplied project rights.

## 25 September owner Mars solar landship

- Owner-supplied source: `WORLDIFACT-f695ef88-dc0b-4326-9ff2-35a589a3c2b5.glb`, SHA-256 `4dcd03f56c9ccaa8c11a286a4103c60101fe14a687481e22eb525c3bf62af6bd`, 2,822,664 bytes.
- Source inspection: 71 mesh definitions / 207 scene nodes or instances / 7 materials / 5 embedded textures / no animations; bounds approximately 13.736 × 14.590 × 29.989 source units.
- Public GAME derivative: SHA-256 `7f27b281103325aa6f2aa58fcc396be7cf319bc683a91c4798ca374d592d70c3`, 1,291,820 bytes after decompression. Source mesh shapes/instances are retained while embedded image textures are replaced by lightweight representative PBR colors for bounded mobile delivery.
- Runtime transport files: `public/world-assets/owner-landship/part-00.b64` through `part-05.b64`; see the directory README for limits and provenance.
- The landship is owner-provided GAME geometry beside the existing photovoltaic explorer. WORLDIFACT may move/steer the whole scene instance as a GAME vehicle and place the avatar at a runtime seat/exit point; this does **not** claim that the source contains a verified vehicle rig, wheel animation, physics model or original driving animation. No engineering approval, manufacturing readiness or supplier approval is claimed.
