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
