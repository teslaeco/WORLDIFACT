# License and asset inventory

| Item | Evidence | Release treatment |
|---|---|---|
| WORLDIFACT source and new procedural geometry | Project-owned code in this repository | MIT source license; preserve notices |
| React, React DOM, React Router DOM, Three.js and production dependency tree | Installed manifests / lockfile reviewed 14 September 2026; MIT | Retain dependency license files/notices when distributing |
| TypeScript, Vite, Wrangler and other build tooling | Separate development dependencies | Keep their original licenses; do not relabel all tooling as project-owned |
| Existing favicon/social SVG | In-repository placeholders; no external embedded images found | Visual/provenance review remains open before contest media use |
| Queen legacy GLB and derivatives | Recovered from user-saved HTML, stored outside repository | Private working material; no public distribution license asserted |
| Current Queen, Julie, astronaut | Exact current originals/provenance not available in this checkout | Do not add placeholder assets under their names or claim release permission |
| Original FORGE open-frame polyhedron and LED display revision | Public [FORGE source GLB](https://forge-world-builder.terraformingplanet.chatgpt.site/world-assets/polyhedron.glb), recovered and matched to the reviewed SHA-256 `c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a` (9,807,116 bytes). `public/world-assets/polyhedron-led.provenance.json` records the source and retained geometry hashes. | The owner explicitly requested its display on the login screen and above the five portals. The bundled revision retains all 48 meshes, 2,976 triangles, 192 accessors and node transforms, removing only unused wood textures/material dependencies. Its static poster projects the same geometry. This establishes the requested WORLDIFACT display use, not a general third-party redistribution or MIT asset license. The original file remains unchanged outside this repository. |
| Recovered ISS 370 mm GLB/Blender/STL | Saved project files recovered 15 September; exact origin/licence not established by filenames | Private audit copies only; no public asset redistribution or production approval |
| Supplier/OpenAI/Product Hunt names and linked projects | References to third parties | No partnership, endorsement or ownership claim |

The MIT license applies to the project's source, documentation and procedural code. It does not grant rights to private imported models, reference photographs, third-party brands or linked project assets. License choice follows the owner's previously recorded MIT preference; publishing a source review branch does not grant rights to private assets.

Standard license reference: [SPDX MIT](https://spdx.org/licenses/MIT.html).
