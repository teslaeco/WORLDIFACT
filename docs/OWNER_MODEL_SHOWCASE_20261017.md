# Two owner models on WORLDIFACT

The owner asked to see the delivered models on the website and challenged the reduced detail and incomplete room. This change adds a standalone `/models/` page, linked from AI Shop's existing public gallery. Both models can be rotated and downloaded. Halloween is explicitly labelled an incomplete reconstruction.

## Provenance and honest limitations

Successful generation: [38978275895](https://github.com/teslaeco/WORLDIFACT/actions/runs/38978275895), one image-conditioned TRELLIS.2 inference per model. Astra supplied review criteria, not direct text conditioning or a multi-object room assembly. There is no additional inference in this publication.

The raw meshes contained 7,204,376 (ECOMECH) and 6,896,654 (Halloween) triangles. The pipeline's 200,000-face export target produced 186,328 and 193,638 triangles. This reduced surface detail. Halloween's holes, flattened background and missing scene elements also arise from incomplete reconstruction; decimation alone does not explain or repair them. The result does not meet the requested whole-room reconstruction.

The delivered UV correction is reproduced exactly from the two saved `outputs/game.glb` objects by changing only float32 V coordinates to `1 - V`. Local comparison confirms byte-for-byte equality with the corrected Blender exports. Mesh geometry, materials, embedded image bytes and all other GLB bytes remain unchanged.

| Public working copy | Bytes | SHA-256 |
| --- | ---: | --- |
| ECOMECH V4 | 18,063,228 | `b8532d8ca7c90e5f4eac0798811b54d4d9447508f4398d325933dd3cca472d54` |
| Halloween Music Room | 18,085,924 | `d9f01fa8ce21ca1759ee6a76ccbb08a27b65749dd25e04810e532e75c69ec197` |

Only these owner-approved public GAME working copies are added to `public/owner-models`. The original references, raw decoder arrays, original GLBs and Blender sources remain outside the public repository. Neither copy is manufacturing-approved.

## Publication envelope

The one-use workflow reads exactly two fixed private R2 objects, verifies both input hashes, reproduces the correction, verifies both output hashes, and commits only the two corrected public files. It never lists or modifies R2, provisions a GPU, calls OpenAI or Runpod, starts generation, or exports credentials. The import fails if saved bytes differ. Its main-branch parent and changed-file allowlist are checked before storage credentials are provided.

The site release starts from the last verified live application, `50825a0632979e6e14bd74ff1ba0204eb977226b`, and overlays only the new standalone viewer, assets, gallery link and multi-page Vite input. Unreleased My World changes are not included. The existing Worker, billing code, configuration, dependencies and original foundation pins remain exact. Remote variables are omitted from the temporary deployment config and preserved using `--keep-vars`; secrets are not synchronized.

Required gates: original full `npm run verify`, original foundation assembly, `npm run deploy:check`, preserving-config dry-run, exact local GLB hashes/embedded-texture/triangle checks, and GET-only checks of every public static asset plus `/models/` and both complete model downloads. Actual release IDs and browser acceptance must be recorded after completion; no LIVE claim follows from a dry-run.

The models remain ordinary tracked static working copies for future builds. Future source releases must account for the difference between the live application base and current main. This page does not enable the native generator for customers.
