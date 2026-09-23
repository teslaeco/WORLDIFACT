# Original-model rig and excavation repair — 24 September 2026

## Owner execution task

Correct the detailed Queen's disconnected fan, joined-looking legs and slow travel. Inspect the actual saved model instead of substituting a mannequin. Give the loader a useful front-quarter working camera, a larger photovoltaic attachment, visible contact-based digging and readable non-overlapping controls. Locate the exact Astra rim from the comparison; do not mislabel a screenshot reconstruction as the original. Preserve billing, generation, all five portals and production safeguards. Create a PR and merge only after green checks under the owner's existing authorization.

## Verified source and findings

Base: `a453194506ad84a9ad5cbbac639a468820a7a9a5`. The existing anonymous avatar route returned saved job `99397623-e45c-48dc-95ec-6f84446a54d5` (27,676,800 bytes). SHA-256: `1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba`. The original stays outside the public source repository; no generation or authenticated archive access was used.

The original has 237 mesh instances, no skeleton or animation clips. Head-based centering displaced the body's midline by about 7.8 cm horizontally and 12.7 cm longitudinally. One named leg straddled the old weight-assignment threshold. A central hand was partly or wholly left on the hips. Seventy-two meshes in nine original `HEX_ROTOR_MODULE` groups were omitted from the 20-piece fan assembly.

## Changes

- Center on the torso, derive lateral leg pivots from the original limbs, assign each named leg to one chain and hand/glove vertices wholly to the hand. Preserve all source geometry/UV/normal/index attributes. Keep the original 92-piece fan, including nine original six-blade modules, attached at its real handle; no replacement propellers or mannequin.
- Increase travel from 1.55 to 3.0 world units/second, retaining the distance-driven stride, crouch/tuck/landing, original footwear and independent feet.
- Separate camera-orbit input from chassis steering. Selecting either tool uses a front-quarter view beyond its cutting edge. A drag while parked no longer rotates the vehicle or moves the excavation contact.
- Enlarge the front bucket to 3.1 units wide; carry up to 1,600 L in the front and 800 L in the rear GAME bucket. Keep contact, finite-input, depth and volume guards. A full scoop lifts automatically. Excavation depth darkens the actual edited sand surface; dumping conserves material.
- Add local photovoltaic cell materials and separate exterior panels on the loader beams and bucket back, away from cutting teeth and articulated joints. No paid or third-party texture generation.
- Put view/camera controls in the equipment drawer, make it mutually exclusive with the vehicle drawer, remove disabled flight/jump buttons while driving and move/shrink the worksite sign away from the bucket view.

## Evidence

`tools/audit-queen-rig.mjs ORIGINAL.glb [REPORT.json]` numerically checks the actual model without rendering or decoding images. [Recorded result](evidence/queen-rig-original-2026-09-24.json): all 237 geometry signatures preserved; 92 fan meshes together; 36 walking samples; minimum leg gap 0.0358 m; handle-to-hand surface distance at most 0.0081 m; lowest shoe point 0.0108 m; tucked knee angle -2.25 rad.

27 targeted tests passed. New regression tests exercise the real rover geometry, three chassis orientations, an automatically filled/lifted bucket, a rendered-mesh ray hit more than 45 cm below the original surface, volume conservation and the hole's projection inside the working camera viewport. Typecheck, lint (warnings, no errors), local DEMO HTTP smoke and the frontend bundle passed. Local broad tests passed 438 tests but the ISS foundation suite lacked downloaded vendor bytes; the browser-specific fixture was not run locally. The unchanged full CI must hydrate its pinned assets and run all tests before merge.

## Honest limits / remaining work

- No browser rendering or physical Android FPS/visual approval is claimed. Numerical source-model evidence is stronger than the former mannequin-only tests but is not an artistic-quality verdict. Honor the recorded browser security limits.
- The exact rim comparison commit `9877b63af81669fc894313d355972c41d60e5da1` contains screenshot evidence and explicitly reports raw meshes unavailable. Two Library rim candidates could not be materialized because their Project records have no authorized raw-byte path. They are not proven to be the comparison model. **Exact original rim installation remains BLOCKED**; existing guarded local GLB import remains available, and no lookalike is installed as an original.
- The desert remains bounded GAME terrain and session-local; not a geotechnical, photovoltaic-yield or manufacturing simulation.
- Temporary branch-only workspace/source-inspection transport workflows are removed before the final PR. No production workflow, provider configuration, account or billing changes belong in this repair.
