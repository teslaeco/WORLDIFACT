# ECOMECH V7 — Real 3D source-projected PBR lookdev QA

**Date:** 2026-10-15  
**Branch/PR:** `feat/ecomech-v7-source-guided-pbr-20261015` / [draft PR #299](https://github.com/teslaeco/WORLDIFACT/pull/299)  
**Release:** **NO-GO**. No merge, deployment, paid API, new customer generation or store publication.

## Original asset and method

The **exact owner's approved 1122×1402 image** was re-used from the historical V4 failed Astra job (SHA-256 `9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053`). The **original six-part V6 neural GLB**, generated from an open-source MIT TripoSR CPU model and WORLDIFACT's part assembly, was verified at SHA-256 `193ad27bd19ec94941b24222662024460d62758c7e2b0e53e7e55e51196f5970`.

V7 uses the original photograph to guide a coarse foreground segmentation and projects source RGB onto actual mesh UVs; it infers metallic-roughness, normal and emissive maps from the image and increases source mesh depth without discarding original triangle topology. These effects make the *reference-facing view* look closer to the source, but do **NOT** reconstruct unknown geometry accurately. Photograph lighting remains partially baked into albedo. Normal maps come from image gradients, NOT measured surface detail. This is **not** an Astra-generated 3D mesh or a native Tripo/Meshy API output. Upstream MIT attribution: Tripo AI & Stability AI, `VAST-AI-Research/TripoSR`. The owner's source image retains its own rights.

## Real reproduced outputs

- [True GLB and Blender four-view test #38711528467](https://github.com/teslaeco/WORLDIFACT/actions/runs/38711528467): **SUCCESS**, pinned official Blender 4.3 checksum. Initial VTK renderer crashed on hosted Linux; replacement with actual native Blender import/render completed.
- [Full exact-code repository CI #38711533593](https://github.com/teslaeco/WORLDIFACT/actions/runs/38711533593): **SUCCESS**.
- GH Actions artifact `ecomech-v7-PBR-TRUE-GLB-research-c2b15bfb0fed3954882819fe8d30a27626ae2431`: genuine GLB, editable BLEND, four actual PNG renders, original provenance reports.
- **GitHub-reproduced original GAME GLB**: 7,732,920 bytes, SHA-256 `a9cf5b06e450577ef420a3c95b80017f401caf6c1674e10cc09e254be057dd48`.
- **GitHub-reproduced editable BLEND lookdev source**: 35,094,362 bytes, SHA-256 `bb5137c784d00b62786bdbdb6ab42a8214212c32ecc7c5ff720976149181e67e`.
- GLB: **218,450 real triangles**, 6 semantic parts, **6 PBR materials**, **24 embedded images**, six materials with normal and metallic-roughness texture maps.
- Model bounding dimensions: X 1.609 m, Y 2.571 m, Z 0.601 m. These are visual model bounds, **not verified manufacturing dimensions**.
- Actual Blender 4-angle renders (SHA-256):
  - Front: `d30d9b80cce06ff0a611f42ef7e348f00cb274221291eb46f716d16418fe6b38`
  - Three-quarter: `002e2fb5638dfb2cb4f1ba91180f43a54f3a97344fe3536a4e9a8024dc34974d`
  - Side: `b983f50d1e42e36faa0cbb6e414d69f8419d9fd93721aceeb30b2c9b6a891f2a`
  - Back: `0773855a507036744df483ef781643c9d845a0d277b4a4c5200c0ac75d8aaf95`

This is evidence of original GLB bytes and true geometry. **It is not an aesthetics acceptance or comparative benchmark.**

## Visual QA and release blockers

**NO-GO**: the front result benefits from source-projected texture detail, but this is an *image-guided lookdev*, not a full reconstructive model. The three-quarter and side renders exhibit stretched texture projection, layered/wobbly shell geometry, missing proper side mechanisms and visibly incorrect backside. The robot is not yet photorealistically faithful to the image in 360°, not professionally rigged, and not a validated manufacturing candidate. Camera-angle-conditioned views from a single original image cannot prove the unseen original rear. More pixels or triangles cannot substitute for properly constructed anatomical/mechanical volumes.

The next meaningful quality improvement requires either (1) genuine multi-view image-conditioned geometry inference on a verified available GPU with model and weights licenses reviewed, plus a professional hard-surface refinement pass in Blender; or (2) an actual manual 3D artist-grade reconstruction from consistent orthographic references, joints, shell layers, rig and texture baking. There is no confirmed spare authorized CUDA GPU in this session; free CPU TripoSR tests were insufficient. Paid external GPU/vendor charges need a separate quote and owner authorization.

The V7 pipeline **does not change production** or turn on a new premium provider. It is a reproducible optional R&D stage, stored on a draft branch. Any eventual release must verify reference likeness, four actual consistent views, texture quality, seams/UV charts, rig/skin, LOD, Android renderer memory, GLB/FBX/OBJ/BLEND original SHA, provider cost/receipt and independent MAKE validation.

**Finance / secrets:** USD 0.00 new OpenAI or external vendor generation spend in this test; no Oracle writes, no changes to customer credits, subscriptions, invoices, API keys, Cloudflare production or customer catalog.
