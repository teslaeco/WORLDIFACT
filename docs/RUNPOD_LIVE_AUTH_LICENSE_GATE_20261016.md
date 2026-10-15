# WORLDIFACT RunPod v2 + R2 live connectivity and commercial-license gate — 2026-10-16

## Actual provider evidence (VERIFIED)

- A trusted `main` one-time GitHub Actions run completed successfully: https://github.com/teslaeco/WORLDIFACT/actions/runs/38818010309 .
- RunPod **management REST v2** GET `/v2/serverless`, `/v2/network-volumes`, `/v2/pods` returned authorized responses. First page was complete in each category: **0 endpoints, 0 network volumes, 0 Pods**. Therefore no WORLDIFACT RunPod endpoint exists yet, and this is **not** evidence of functional inference. The script reported `paidRequests=0`, `gpuWorkersStarted=0`, `createdResources=0`, `currentlyAlwaysOn=0`.
- Production GitHub `ARTIFACT_S3_ENDPOINT` was corrected by the owner. Cloudflare R2 in private bucket `worldifact-artifacts` passed one real S3 `PutObject IfNoneMatch='*'`, duplicate denial (412), exact GET, and cleanup DELETE. The workflow recorded `{"verified":true,"cas":"PASS","read":"PASS","cleanup":"PASS","userObjectsChanged":0}`. No customer object was accessed. Account values/secret strings are not included in this report.
- Existing Oracle CPU services were not changed; no product route/worker or customer account pricing was updated.
- Owner reports US$33 RunPod balance, **not independently attested by the account GET inventory**.

## Owner's strictly on-demand policy (IMPLEMENTED OFFLINE / NOT PROVISIONED)

- Queue-based RunPod **Serverless Flex** only; active workers 0; maximum 1; 1 GPU per worker; handler concurrency 1; idle timeout 5 seconds; no Pod, no constant GPU, no health pings/keepalive or background warmup.
- Only a fresh authorized, sufficiently funded WORLDIFACT 3D generation may POST `/run`. Read/poll/status/gallery/browser sessions never submit work. Check exact live provider settings after endpoint provisioning; fail closed on active workers > 0. The unmerged PR's profile is a **checklist, not a provisioned endpoint**; offline tests enforce its values.
- Compute billed from cold start to shutdown (including the idle window). R2 data / network volumes / container disks can incur separate costs. Do not treat 0 active GPU as 0 total cost.
- Official RunPod: https://docs.runpod.io/serverless/workers/overview and https://docs.runpod.io/serverless/endpoints/endpoint-configurations .

## GPU native image legal gate (BLOCKED for commercial deployment)

- **VERIFIED** Microsoft's TRELLIS.2 code and checkpoint are MIT-licensed; official install involves other components, including `nvdiffrast` and `nvdiffrec`. Source: https://github.com/microsoft/TRELLIS.2 and https://huggingface.co/microsoft/TRELLIS.2-4B .
- **VERIFIED** the NVIDIA `nvdiffrast` license section 3.3 and `nvdiffrec` license section 3.3 restrict software/derivatives to non-commercial use (aside from NVIDIA/affiliates). The default export uses `o_voxel.postprocess.to_glb` and may depend on those CUDA rasterizers. Until the exact call graph/alternatives are audited, **do not build/distribute or activate the standard dependency image for WORLDIFACT's paid subscriptions**.
  - https://github.com/NVlabs/nvdiffrast/blob/main/LICENSE.txt
  - https://github.com/NVlabs/nvdiffrec/blob/main/LICENSE.txt
- **VERIFIED** Meta DINOv3 encoder is covered by its own license and gated model access. Obtain its accepted license terms/authorization for deployment and comply with redistribution/attribution. This is not an MIT dependency simply because TRELLIS.2 is MIT.
  - https://ai.meta.com/resources/models-and-libraries/dinov3-license/
  - https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m
- **VERIFIED** this worker intentionally uses an explicit whole-object mask and **does not call BRIA background removal**, avoiding bringing BRIA RMBG-2.0's potentially incompatible non-commercial license into the path.
- **UNKNOWN / BLOCKED** a commercial-license-safe replacement for NVIDIA UV baking and render path, actual license provenance for the pinned CUDA/container bundle, signed digest-pinned image, measured GPU VRAM/cold start/inference cost, a funded customer request, end-to-end ECOMECH quality, and validated GAME/MAKE files. There is no paid RunPod endpoint yet.
- **NEXT** implement a verified commercial-safe geometry/PBR export (or obtain separate written permission from relevant rightsholders), record dependency SBOM/license artifacts, then build image off GPU and provision the 0-active-worker endpoint with an explicit spending ceiling. Do not invent a throughput/quality claim before an original-image paid test.

**NO-GO for PR #305 merge, GPU provisioning or commercial generator activation until these gates are satisfied.** The narrow PR #307 account proof was already safely merged and tested; do not rerun it unnecessarily.
