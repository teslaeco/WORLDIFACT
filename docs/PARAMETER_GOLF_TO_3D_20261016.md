# From Parameter Golf to reproducible 3D generation: WORLDIFACT quality discipline

**2026-10-16 — VERIFIED prior experiment history, applied engineering methodology; no claim that Parameter Golf generated any 3D mesh.**

## An engineering experience worth carrying forward

WORLDIFACT's creator previously participated in OpenAI's **Parameter Golf**, where model efficiency, tight artifact budgets, repeatable measurements and honest validation mattered as much as a visually impressive result.

- [OpenAI Parameter Golf PR #1750](https://github.com/openai/parameter-golf/pull/1750) was explicitly submitted as a **non-record** reproducibility experiment, with a reported three-seed mean validation BPB of **1.08089556**. The author did **not** claim a winning submission.
- [OpenAI Parameter Golf PR #2076](https://github.com/openai/parameter-golf/pull/2076), authored by `teslaeco`, reported a three-seed mean of **0.92967555 BPB**, using seeds 42/314/999, a ~15.92 MB artifact within a 16 MB limit, and a controlled 8192-token train-only V6 micro-injection. This is a **PR-reported experiment**, not independent verification of a leaderboard win or proof of official final acceptance.

That practical background informs WORLDIFACT's engineering discipline: maximize measurable result quality inside limited compute resources, keep inputs immutable, keep experiments reproducible, and separate real evidence from attractive presentations. **BPB measures a language-model compression objective, not 3D photorealism**; the prior Parameter Golf weights or benchmark numbers do not directly reconstruct meshes.

## How the lessons become product behavior

| Parameter Golf practice | WORLDIFACT implementation or acceptance criterion |
| --- | --- |
| Hard artifact and compute budgets | RunPod Serverless Flex: 0 active / max 1 GPU / 5-second idle timeout; admit only a paid, authorized generation request, never a gallery view. |
| Multi-seed evaluation and traceable measurements | Persist model ID, seed, input hashes, generation ID, one-attempt budget permit and provider receipt. The two owner-authorized trials are **one attempt each**, not secretly three GPU attempts. |
| Dataset/validation separation | Original owner photo and edited mask are private immutable inputs; generated side/back geometry is explicitly **INFERRED**, and QA images are evidence, not ground truth. |
| Small reliable verified artifacts | Check GLB scene geometry, true 3D thickness, texture presence, independent scene components, 8 distinct camera renders and BLEND signature. |
| Measured success rather than score claims | Record geometry QA separately from manually judged likeness, prompt faithfulness, valid licenses, download authorization and reconciled invoices. |

## Two high-fidelity targets

### Trial A — ECOMECH V4

Create **real 3D geometry** preserving the reference's strong left/right asymmetry: green-blue armored plates, exposed black/steel engineering on the opposite half, glowing cyan eyes/reactor, distinct mechanical joints, accurate large boots and a **separate 3D green chili prop**. Preserve metallicity, roughness, emissive lights, hard edges and cable routing. Source photo is 2D; back surfaces are inferred and cannot be promised as exact.

### Trial B — Halloween Music Room

Construct an **editable multi-asset 3D scene**, rather than running the entire source image through a single-object worker: human-faced performer with orange pumpkin-skin-style makeup, realistic hands on an actual keyboard, black lace clothing, a separate small squirrel in a pumpkin hoodie, floating mini instruments/music notes and room props/candles/jack-o'-lanterns. Keep independent geometry with scene hierarchy and purple/orange lighting. Faces, hands and squirrel anatomy require separate close-up QA; unseen geometry remains inferred.

## Exact deliverables and anti-fraud gates

A successful *technical* candidate must include source decoder checkpoint, real raw geometry, a textured PBR `game.glb`, editable `source.blend`, four **PBR** plus four **neutral-clay** camera PNGs, exact checksums and source-bound receipts. The new `scripts/verify-3d-trial-result.py` checks structure using **synthetic-only CI fixtures**. It rejects flat billboards, missing squirrel/chili scene nodes, identical fake camera files, untextured materials and false `visualAccepted=true` / `printReady=true` claims.

**IMPORTANT LIMIT:** The validator only proves file/mesh/scene structure. It cannot prove visually that an image-conditioned model reproduces the reference. Required human side-by-side review covers proportions, fingers, faces, cables, colors, floaters, occlusion, unseen-side uncertainty and texture quality. A passing unit test is never called a completed ECOMECH model.

## Current live status and constraints

**VERIFIED:** A real GitHub Actions preflight authenticated RunPod management API v2 and tested Cloudflare R2 private S3 conditional writes. At that point there were **zero Serverless endpoints, Pods or network volumes**. Source ZIPs were validated privately, without publishing customer images.

**BLOCKED:** The existing TRELLIS.2 `o_voxel.postprocess.to_glb` imports NVIDIA `nvdiffrast`, whose license restricts commercial use. Need a commercially permitted and verified PBR export implementation, full DINOv3 model-license review, audited container and private worker provisioning before these two owner-authorized paid generation tests. The current single-object worker cannot, by itself, truthfully reconstruct the full Halloween scene. Neither a live Astra+RunPod inference nor a final downloadable model has been produced by this PR.

Proof: [RunPod + R2 live credential check](https://github.com/teslaeco/WORLDIFACT/actions/runs/38818010309); [GPU preparation PR #305](https://github.com/teslaeco/WORLDIFACT/pull/305); [TRELLIS.2 dependency clarification](https://github.com/microsoft/TRELLIS.2/issues/22).

**Release rule:** DO NOT merge, deploy, advertise photorealism, or create paid GPUs just to satisfy a deadline. The deliverable must be a real mesh, not an AI-rendered picture of one.
