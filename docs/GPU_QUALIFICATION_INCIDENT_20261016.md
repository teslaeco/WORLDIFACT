# GPU qualification incident — 2026-10-16

## VERIFIED (GitHub Actions evidence)

- Baseline main commit: `b6f367cd62b1253a45ca5e8a34ae9326e28fd6a7`.
- Paid GPU run: https://github.com/teslaeco/WORLDIFACT/actions/runs/38868316200, job `116866195047`.
- The repository-root import failure from the earlier attempt is resolved: SDK installation, CPU fixture tests, SDK contract tests and provider resource preflight all passed in this run.
- RunPod SDK recognized L4, A100 and H100 task declarations. The first `NVIDIA L4` Pod provisioning operation failed: `There are no instances currently available`. No CUDA workload started and the dispatch stopped immediately without executing the A100 or H100 tasks.
- The independent `provider-postflight` job `116866436002` passed: at its check time the account exposed zero Pods, serverless endpoints and network volumes.
- The failed run produced no Actions artifacts and no attested GPU GLB. CPU fixture outputs are not GPU output.
- After the approval-marker commit, the latest fetched Actions list shows no later successful paid GPU qualification. The success of a CPU-only contract workflow is not evidence of GPU execution.
- Gallery PR #311 remains a draft. It deliberately rejects an incomplete or unverified 3-GLB manifest: https://github.com/teslaeco/WORLDIFACT/pull/311.

## UNKNOWN / BLOCKED

- **UNKNOWN**: Current RunPod wallet and actual billed amount. Historical wallet screenshot is not live billing evidence.
- **UNKNOWN**: Current L4/A100/H100 Pod capacity, including exact permitted regions or secure/community configurations. A catalog listing is not a guaranteed capacity reservation.
- **UNKNOWN**: Account state after the successful postflight time (no standing authenticated RunPod account connection in this review).
- **BLOCKED**: Actual CUDA-attested L4/A100/H100 GLBs, GPU cost receipts, R2 model uploads, model publication, Astra/TRELLIS.2 image-to-3D validation.
- **BLOCKED**: Public GPU gallery release; no owner approval for production merge/deploy in this incident.

## Engineering findings and next safe action

1. The `runpod_three_gpu.py` operator currently requires the exact target list `L4,A100,H100` and quotes all three targets before dispatch. Thus it **cannot** execute the requested single-card qualification by changing only `WORLDIFACT_GPU_TARGETS`. A revised implementation needs single-device mode, independent price/capacity validation and explicit approval gates. Do not edit the already-authorized exact-hash workflow or reuse the existing approval marker for changed code.
2. Inspect fresh RunPod billing, resources, and secure Pod stock before a new paid authorization. Record which GPU SKU, region and category are actually obtainable; absence of L4 stock is not a CUDA/code defect.
3. Introduce a separate one-shot **L4-only** workflow with a new owner approval marker, spending/time ceiling, a unique owned-Pod identifier, forced release, and postflight provider checks. Never auto-fallback to another GPU SKU and never auto-retry provisioning.
4. Validate exact CUDA device name/VRAM, nonzero CUDA compute, GLB header/JSON/embedded PBR, mesh and triangle counts, SHA-256 and an immutable provider job receipt; record billing independently. Only then authorize A100 and H100 one at a time.
5. Keep PR #311 staged, not released. Do not create fake manifest entries or assert image-to-3D/photo fidelity. Keep Oracle `froge-blender`, existing R2, subscriptions, billing, secrets and portals unchanged.

## Change scope

Read-only investigation and documentation only. **No paid GPU run, Pod, endpoint, volume, R2 write, merge or production deployment was executed as part of this incident report.**
