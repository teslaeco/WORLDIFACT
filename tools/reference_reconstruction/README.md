# WORLDIFACT: whole-object reference reconstruction

**Candidate integration, not a production feature and not an accepted ECOMECH mesh.**

The owner rejected V6/V7/V8 geometry. This implementation does **not** read those GLBs, stretch their depth, repeat a single photograph around them, smooth their silhouette, or print them. Its only visual input is the approved original image, with a documented draft foreground mask. The previous GAME/MAKE originals remain unchanged.

## Why this candidate

Microsoft TRELLIS.2 generates whole-object shape and spatial material attributes from image conditioning. Its official implementation exposes separate shape and texture stages and PBR-aware export. That is a materially different approach from projecting a photograph onto an inadequate mesh. It is a **candidate to evaluate**, not evidence that WORLDIFACT beats competing products.

Primary sources, re-opened 2026-10-15:
- [Microsoft implementation, requirements and license](https://github.com/microsoft/TRELLIS.2): Linux, NVIDIA GPU with at least 24 GB, CUDA build dependencies; model/code MIT, dependencies have separate terms.
- [Microsoft model card](https://huggingface.co/microsoft/TRELLIS.2-4B): 4B parameters, spatial resolutions 512/1024/1536. These are not triangle counts or likeness scores.
- [Official Microsoft research demo](https://huggingface.co/spaces/microsoft/TRELLIS.2): useful for a bounded research attempt, NOT an SLA-backed production backend.

Pinned audited code: `75fbf0183001ed9876c8dbb35de6b68552ee08bd`.
Pinned primary weights: `af44b45f2e35a493886929c6d786e563ec68364d`.
Official demo source revision observed: `ebf60b20fc5a4607f90a1c11c0aab0ceeda5429d`.
A model-card revision does not prove which checkpoint is currently cached inside a hosted demo; the research receipt preserves that uncertainty.

## Two distinct execution paths

### Native WORLDIFACT worker

`native_trellis2.py` loads reviewed local checkpoints on an **already authorized GPU**. It does not rent hardware, install CUDA, download weights implicitly, charge users, create subscriptions or call competitor APIs. Offline mode is set before loading models. Every bundled model/configuration file must have a SHA-256 entry. The operator must separately review dependencies including DINOv3, CUDA libraries and renderer licenses. BRIA background-removal weights are not loaded: a source-bound local mask is mandatory.

```sh
python tools/reference_reconstruction/native_trellis2.py --preflight

# Only on an already-provisioned, licensed and approved GPU environment:
python tools/reference_reconstruction/native_trellis2.py \
  --source /input/original.png --mask /input/mask.png \
  --job /input/job.json --upstream /opt/TRELLIS.2 \
  --bundle /models/trellis2-locked --out /outputs/unique-job-id \
  --compute-authorized
```

The native runtime was **not** installed/executed on a GPU in this task. Contract tests cover preflight, input validation and explicit refusal, not neural output quality. The 900-second execution cap is not a billing quote; native compute cost remains unknown until measured on the selected provider.

Bundle format (`worldifact-bundle.json`):
- `sourceRevision` and `modelRevision` equal the pins above;
- `dependencyLicensesReviewed: true`, set only by the actual operator after review;
- `files`: relative file paths mapped to their actual SHA-256;
- `pipelineConfig`: the hashed local pipeline JSON;
- `modelPrefixes`: all eight shape/texture decoder/flow names from `native_trellis2.MODELS`, mapped to local prefixes with both `.json` and `.safetensors` hashed;
- `dinov3Directory`: a local feature-extractor folder with every file hashed.

The bundle builder/dependency installation and deployment service are not implemented by this PR. It is not truthful to say that the engine is enabled in Shop merely because this adapter exists.

### Official free research demo

`official_demo_once.py` uses the public Microsoft Hugging Face Space with no token or paid upgrade. The original image is processed there temporarily; this path must not be used for private customer imagery without specific disclosure and consent. Preprocessing happens locally, preserving the original RGB, with one whole-object square crop. It never calls remote background removal.

The one-use GitHub workflow accepts only the exact marker commit on this branch, attempt 1. It permits one generation request, then export within the same session, and stops on authentication, quota, networking or uncertain completion. No automatic re-submission, no fallback to old geometry and no paid upgrade. If a request times out, reconcile its existing session/result before considering any subsequent attempt. Do not run research demos as the production generator or evade their quotas.

## Outputs and acceptance

Native execution preserves `RAW_NEURAL_GEOMETRY.npz` and a neutral `RAW_GEOMETRY_CLAY.glb` **before** post-processing, then the actual PBR GLB and receipt. The official demo returns only the actual downloadable GLB plus separately labeled provider previews; its raw pre-decimation geometry is not available through that public interface.

`core.inspect_glb` verifies actual geometry and self-contained export, not photorealism. Color, metallic/roughness, UV seams and the neutral shape require separate inspection. All outputs stay `visualAccepted=false` and `printReady=false` until evaluated independently.

Required next checks: import original GLB in an independent renderer, inspect clay and PBR front/three-quarter/side/back, compare visible helmet/shoulder/hand/chili/leg silhouettes and feature geometry, and review conservative inferred rear surfaces. A single source view cannot certify the unknown original rear. No production-ready claim follows from any polygon count, image resolution, model name or green workflow.

Only after likeness approval create a separate MAKE design for a confirmed physical scale/material/process. That requires connected solids, intersections/thickness/support checks, slicer inspection and supplier review. A textured image is not physical detail and a watertight mesh alone is not a printing approval.

## Tests and costs

Run `python tools/reference_reconstruction/test_reconstruction.py` with NumPy, Trimesh and Pillow. The offline tests use clearly identified fixture geometry only; they do not generate a new robot. The separate resource-probe workflow performs GETs only and never uploads the image.

No new OpenAI call, paid Tripo/Meshy request, GPU rental, points change, invoice mutation, merge, production deployment or supplier order is authorized by these files. Geometry attribution remains **Microsoft TRELLIS.2 + WORLDIFACT integration**, not a claim that Astra directly authored a mesh when Astra was not invoked.
