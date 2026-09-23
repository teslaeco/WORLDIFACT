# Portal presentation repair — 2026-09-23

## Scope

- Preserve the original Queen job 99397623-e45c-48dc-95ec-6f84446a54d5, with no procedural Queen substitution, mesh decimation or texture replacement.
- Preload the authorized original GET during sign-in, share in-flight/model bytes in memory, clear on account change, enforce GLB size/completeness, and expose load failure/retry. No AI generation is invoked.
- Add a runtime-only GAME skeleton for static original geometry: alternating foot contacts, knee flexion, ankle leveling, lowered arms, and full separately named fan assembly attached to the hand. Original fan materials become double-sided; original pixel maps, vertex positions, UVs and indices are retained. Optional shoulder-flight equipment remains separate and stowed initially.
- Use body-only framing, not an extended fan/pedestal, and invalidate late loads on scene disposal. Walking speed is 2.1 world units/s rather than the previous 7.
- Show an immediate native 512-square board preview at Chess entry, retaining mobile-safe full-screen launch and the shared-account/guest distinction. This is a board preview, not a live gameplay screenshot.
- Replace eight basic planet gradients with Solar System Scope 2K maps, preserving gradient failure backgrounds. These are externally hosted textures; their availability remains a third-party dependency. Visible attribution and reduced-motion handling are included. CSS projection/lighting is illustrative, not a physically exact scientific rendering.
- Compact the six existing original-logo banners and add the owner's existing ISS petition immediately below them. No sponsorship/partnership or technical-feasibility claim is introduced.

## Verification and remaining limits

Local targeted checks: 23 tests passed, TypeScript passed, lint returned no errors. Tests cover preserved geometry/material identity, skin weights, bind-pose transforms on a rotated/translated root, planted/lifted feet, finite joint angles, all named fan parts following the low hand, no procedural Queen, safe GET caching/retry/abort, 512 immediate preview squares and unchanged launch/account routing.

The source avatar could not be visually inspected in this session. The GAME rig is an anatomical/semantic approximation, not artist-authored skinning. Mixed-material meshes whose fan parts are not separately identified are deliberately left intact, not detached together with a body. The exact original's hand/fan fit, mobile frame rate and appearance still need device review; passing synthetic-fixture tests does not establish those results.

A full local run was limited by missing pinned ISS assets and a local native-Chromium timeout; the repository CI must hydrate assets and pass its full suite before merge. Do not infer deployment from a local build or this note. GitHub CI and the production release run are the deployment evidence.

## Texture attribution

Planet maps: Solar System Scope / INOVE, https://www.solarsystemscope.com/textures/ . Licensed under CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ . Maps are displayed with adapted CSS lighting, circular cropping and animated projection. Source maps include artistic color adjustments and reconstructed gaps; they are not wholly measured surfaces.
