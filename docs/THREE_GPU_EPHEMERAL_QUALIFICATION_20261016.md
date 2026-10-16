# WORLDIFACT: three isolated on-demand GPU GLB smoke tests

**2026-10-16.** This is hardware qualification, NOT an Astra / TRELLIS.2 photo-to-3D benchmark. No customer's reference photos, Hugging Face gated weights or real likeness are involved.

## Three separate workloads

| GPU | Actual model payload | Shape and material evidence |
| --- | --- | --- |
| Economical L4 24 GB | `chess-cube-512-led-rook.glb` | Real 3D LED rook with eight illuminated levels, tower/crown, PBR colors |
| A100 80 GB | `ecomech-asymmetric-mechanical-study.glb` | Real independently modeled asymmetric chassis, exposed machinery, reactor, green/blue armor, separate chili prop |
| H100 80 GB | `halloween-multi-asset-room-study.glb` | Editable GLB node hierarchy with stylized performer/squirrel/keyboard/magic instruments/room |

The images previously supplied by the creator are **not** the source of geometry in these three procedural tests. The L4/A100/H100 models are engineered synthetic GPU smoke tests only: source-traceable and textured, but not photorealistic likeness claims. They do not create a `BLEND` file or claim GAME/MAKE approval. The real image-to-3D engine remains draft PR #305, blocked by gated DINOv3 weights and unverified CUDA export/packaging.

Each GPU task must run a real CUDA matrix multiplication and move actual mesh vertices on the GPU before exporting its GLB, returning GPU name/VRAM, triangle and mesh counts, SHA-256. The trusted GitHub runner crosschecks binary GLB header, scene load and SHA before publishing an artifact; GPU results without CUDA evidence are rejected. The three outputs must be different.

## Billing / no idle machine

We use the official RunPod **Python SDK 2.0** `@app.task` (ephemeral Pod per call), not a persistent Pod or always-on endpoint. Each task is independently executed in the order L4 → A100 → H100; there are no attached network volumes. GPU task runtime uses ephemeral container scratch (40 GB), with results downloaded to the protected Github Actions workspace and stored as run artifacts. RunPod SDK documentation: https://docs.runpod.io/sdk/overview ; https://docs.runpod.io/sdk/configuration/parameters .

Budget applies to **the three GPU smoke tests only**, not a blanket authorization to add infrastructure or bill customer accounts. Prior owner wallet screenshot $33.68. Before submitting any paid task, read RunPod management GPU catalog `GET /v2/catalog/gpus?include=AVAILABILITY&product=POD&count=1&cloud=SECURE`, require all three classes' real secure rates and availability, enforce respective L4≤$1.50/h, A100≤$3.50/h, H100≤$6/h, and total projection for 15 minutes each strictly below $8. These are estimates, **not hard invoice caps**; monitor actual per-task billing. Abort if inventory/quote is unavailable. Never retry an ambiguous billable task automatically.

The GitHub workflow has a 42-minute job timeout; paid execution is sent SIGINT at 35 minutes so the SDK can terminate temporary resources. Abnormal network/runner outages might leave Pods running: the workflow's mandatory final account inventory probe reports any resources; if nonzero, it requires immediate targeted operator cleanup. Do not assume the CI job timeout alone stops GPU charges. **An inference attempt should only be reported as done when actual GLB, provider GPU evidence and cleanup are verified.**

## Execution gates

- On a controlled branch: run CPU-only contract tests with synthetic source data, verify RunPod 2.0rc1 `@app.task` function metadata, produce three genuine offline GLB fixtures via Github artifact. Verified offline run: https://github.com/teslaeco/WORLDIFACT/actions/runs/38861159981 .
- Create a **separate, reviewed, exact-commit-scoped PR** adding the trusted main-only one-time marker workflow. Do not expose Production RunPod secrets to PR code.
- Main push of exactly `ops/THREE_GPU_EPHEMERAL_PAID_ONCE_20261016.json` (separate marker-only commit) triggers a manual-style single use of the verified workflow. This is authorized by owner for three distinct paid tasks; only `RUNPOD_API_KEY` Production secret goes into the runner.
- The operator and CI must verify there was no existing Pod before dispatch, that each task returned real CUDA+GLB, that no volumes/always-on endpoints were created, and that all tasks ended. Fail securely on missing/ambiguous evidence. Never expose provider tokens, R2 private data or original human photos.
- If any class is unavailable, present its state and do not claim it generated an asset. Future real TRELLIS.2 tests require separate DINOv3 access, dependency/weights audit, image build and reviewed photo upload.

## Current state

**REAL CPU GLB fixtures created and downloadable from GitHub Actions**; **LIVE L4/A100/H100 GPU runs pending**. No actual GPU pods, paid inference or 3D outputs from photos have been verified at writing time.
