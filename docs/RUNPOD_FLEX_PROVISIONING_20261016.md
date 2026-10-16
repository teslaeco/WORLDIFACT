# WORLDIFACT RunPod on-demand GPU provisioning

**2026-10-16 — PREPARED / MOCK TESTS PASS / NOT PROVISIONED.**
No RunPod Pod, Serverless endpoint, GPU worker or network volume has been created by this PR.

## 2026-10-16 — owner's zero-idle GPU AND no-ongoing-RunPod-disk-cost policy

The owner explicitly requires **no permanently running GPU** and storage usable with jobs on demand. We will use a 100 GB **ephemeral container scratch disk** on the RunPod Serverless worker, and the existing tested private Cloudflare R2 bucket as **persistent object storage**. A dedicated RunPod Network Volume of 256 GB was investigated in a separate experimental branch but **was not provisioned** and must **not** be merged or activated: it would incur charges while all GPU workers are zero. Cloudflare R2 may itself incur storage and operation charges, but not a dedicated always-reserved RunPod disk cost.

The operator script and mocked-provider CI now reject any provider-created endpoint returning a persistent network/global mount or a 20 GB scratch disk, even when the worker min remains zero. Only future, explicitly approved and separately budgeted Unreal Engine compilation/authoring infrastructure may have a larger persistent filesystem; do **not** bundle Unreal Editor into the 3D inference worker. Real container image/model weights may still require model-layer size and startup analysis before calling this production-ready.

## Owner links
- RunPod Serverless: https://console.runpod.io/serverless
- RunPod Pods: https://console.runpod.io/pods
- WORLDIFACT GPU source draft: https://github.com/teslaeco/WORLDIFACT/pull/305
- RunPod API v2 create: https://docs.runpod.io/api-reference-v2/serverless/create-a-serverless-endpoint
- RunPod worker settings: https://docs.runpod.io/serverless/endpoints/endpoint-configurations

## Resource configuration — only when a genuine 3D generation job requires GPU

| Setting | Operator policy |
|---|---|
| Endpoint | WORLDIFACT-3D-FLEX |
| Type | RunPod Serverless Flex QUEUE; never persistent GPU Pod |
| GPU | NVIDIA A100 **80GB**; live catalog read before POST |
| Verified hourly cap | Reject price over USD 3.00/hour; current public price about USD 2.72/hour |
| Active workers | **0** |
| Max workers | **1** |
| GPUs per worker | **1** |
| Idle timeout | **5 seconds** |
| Scaling | QUEUE_DELAY=4 |
| Execution timeout | 120 seconds initially; benchmark before increasing |
| Scratch disk | **100 GB ephemeral**, only while a worker runs; wiped on worker restart |
| Endpoint at creation | ENABLE_RUNPOD_WORKER=false (no client GPU inference yet) |
| Persistent storage | Existing **private Cloudflare R2**; no new RunPod network volume, no idle-volume rental |
| CPU | Existing Oracle service untouched |
| Client billing | No changes |

RunPod charges for a worker's cold start, computation and idle window; separate artifact/storage charges may apply. A cost quote or 0 active workers is NOT a hard provider invoice cap. The RunPod console can reduce max workers after prolonged inactivity; reenable on the next valid generation authorization, never by periodic GPU keepalive.

## Real proof and honest blockers

**VERIFIED historical account read:** https://github.com/teslaeco/WORLDIFACT/actions/runs/38818010309 — RunPod authenticated management REST v2 with 0 endpoints/0 Pods/0 network volumes, private R2 conditional create/read/delete PASS. This is not a new GPU ID.

**VERIFIED mock provisioning contracts:** https://github.com/teslaeco/WORLDIFACT/actions/runs/38854025718 — guarded creation script tests, no provider mutations or paid GPU calls.

**MISSING before creation:**
1. A real commercially reviewed, published, immutable image: `ghcr.io/teslaeco/worldifact-runpod3d@sha256:<64 hex>`. Draft #305 is source-only: CUDA/DINOv3 weights, SBOM, digest-pinned GPU base, required license acknowledgements and Blender are not yet assembled as a deployable image.
2. Native MIT DRTK CUDA UV raster/PBR parity test on real GPU; offline fixture results are not enough.
3. Current RunPod account-specific A100 price/availability/balance confirmation; owner reported USD 33 but the balance was not independently read.
4. Authenticated private input delivery, backend account/budget dispatch, one-attempt receipt reconciliation; the single-object worker cannot create the full multi-asset Halloween room from one generation.

## Safe activation after review, not now

One-time operator script: `scripts/runpod-provision-on-demand.mjs`.
Workflow: `.github/workflows/runpod-flex-provision-once.yml`.

Before attempting provider creation:
- Obtain the tested image digest and independent license/model-weights/CUDA evidence.
- Submit a separate explicit merge approval for the narrow provisioning PR after green CI.
- In GitHub Settings → Environments → Production, record these **nonsecret attestations** from real evidence:
  - `RUNPOD_APPROVED_IMAGE_DIGEST` = exact GHCR SHA-256 image.
  - `RUNPOD_LICENSES_REVIEWED` = `true` after full license/SBOM inspection.
  - `RUNPOD_CUDA_PARITY_VERIFIED` = `true` after a real CUDA raster test.
  - `RUNPOD_WEIGHTS_VERIFIED` = `true` after real weight hashes/terms.
  - `RUNPOD_R2_ACCOUNT_VERIFIED` = `true` after reviewing successful private R2 test.
- In GitHub Actions on protected main, run "WORLDIFACT RunPod Flex — create ONE disabled endpoint" with confirmation `PROVISION-WORLDIFACT-FLEX` and matching full image digest.

The workflow checks a fixed Git blob SHA of the script **before injecting existing Production RUNPOD_API_KEY**. The script GETs endpoint inventory (no pagination), refuses an existing endpoint name, GETs official A100 GPU pool/VRAM/price, and issues **at most one POST /v2/serverless**. No automatic retries on a missing acknowledgement. It validates the created endpoint ID and exact 0-active/1-maximum/5-second-idle settings with worker disabled. No other Production secrets are used. It never calls /run, starts a Pod or creates a volume.

A provider-returned endpoint ID is required for a real detail URL and execution URL. **Never invent one.** After provisioning, real image and R2 tests are still needed before any customer generation is enabled.

**Current GO/NO-GO:** GO to review and test this provisioning mechanism. NO-GO to create an endpoint with a fake base image or enable any paid GPU inference today while the licensed image is missing.
