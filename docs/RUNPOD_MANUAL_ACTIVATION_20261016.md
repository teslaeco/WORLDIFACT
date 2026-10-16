# WORLDIFACT — Manual RunPod Activation Checklist

**Date:** 2026-10-16  
**Scope:** Existing WORLDIFACT only. No Cloudflare deployment, Stripe changes, Oracle restarts, customer billing, or production merge.  
**Statuses:** VERIFIED = demonstrated by real provider/CI evidence; IMPLEMENTED = code exists but not live; BLOCKED = prerequisite missing; UNKNOWN = requires owner account inspection.

## 1. Open the real control panels

| Purpose | URL |
| --- | --- |
| RunPod Pods | https://console.runpod.io/pods |
| RunPod Serverless | https://console.runpod.io/serverless |
| RunPod credentials / user settings | https://console.runpod.io/user/settings |
| GitHub Production environment | https://github.com/teslaeco/WORLDIFACT/settings/environments/Production |
| GitHub Actions secrets | https://github.com/teslaeco/WORLDIFACT/settings/secrets/actions |
| GitHub Actions variables | https://github.com/teslaeco/WORLDIFACT/settings/variables/actions |
| Existing guarded provisioning workflow (DO NOT RUN YET) | https://github.com/teslaeco/WORLDIFACT/actions/workflows/runpod-flex-provision-once.yml |
| Gated DINOv3 access | https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m |
| Model weight source / license | https://huggingface.co/microsoft/TRELLIS.2-4B |
| PR #305 native image-to-3D worker (DRAFT) | https://github.com/teslaeco/WORLDIFACT/pull/305 |
| PR #316 temporary Pod qualification code (DRAFT) | https://github.com/teslaeco/WORLDIFACT/pull/316 |

## 2. Existing secrets — DO NOT create duplicates or share values in chat

The Production environment jobs `runpod-auth` and `r2-storage` completed successfully in [the provider proof](https://github.com/teslaeco/WORLDIFACT/actions/runs/38818010309) (attempt 3). The tool cannot reveal the original secret values or confirm whether each is repository-, organization-, or environment-scoped. If the setting exists and the tests pass, **leave it unchanged**.

| Name | Use in existing workflows | Evidence |
| --- | --- | --- |
| `RUNPOD_API_KEY` | RunPod management API | VERIFIED authentication in trusted Actions |
| `ARTIFACT_ACCESS_KEY_ID` | Cloudflare R2 temporary object test | VERIFIED read/write/delete in trusted Actions |
| `ARTIFACT_SECRET_ACCESS_KEY` | Cloudflare R2 temporary object test | VERIFIED read/write/delete in trusted Actions |
| `ARTIFACT_S3_ENDPOINT` (variable) | R2 S3 API URL | VERIFIED in the earlier storage test, value not disclosed |
| `ARTIFACT_BUCKET` (variable) | Private R2 bucket | VERIFIED in storage test |
| `ARTIFACT_REGION` (variable) | S3 compatibility | VERIFIED in storage test |

Do not email, paste, photograph or commit any token. GitHub Actions masks secrets; use **Production environment secrets**, not client-side `VITE_*`.

## 3. Gated model access — owner action required

1. Open [DINOv3 ViT-L/16](https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m) while signed in to the intended Hugging Face account.
2. Review Meta's actual DINOv3 license and contact-sharing conditions; accept only if appropriate. This action cannot be performed on behalf of the account holder without authorization and access to that authenticated session.
3. Check whether the model page says **access granted**. Meta's official FAQ warns that review can take several days.
4. Only after approval, if a build process really needs it, create a read-only Hugging Face access token and store it as `HUGGING_FACE_HUB_TOKEN` in the private builder's secret store. Do not send it to customer browsers, Git or arbitrary GPU inference jobs.
5. Record license acceptance and attribution evidence. Do not treat this access grant as a blanket right to redistribute weights in a public container.

Current: **UNKNOWN/BLOCKED**. No user authorization proof or downloaded/checksummed DINOv3 weights is present.

## 4. Manual one-time hardware smoke test (optional, separately chargeable)

Use this ONLY when the owner sees an acceptable current provider cost and has approved the single test. It verifies CUDA hardware, **not** image-to-3D quality.

1. In [RunPod Pods](https://console.runpod.io/pods), choose a Secure Cloud GPU with at least 24 GB VRAM; select exactly **one** device. The latest Secure POD catalog [#38905314628](https://github.com/teslaeco/WORLDIFACT/actions/runs/38905314628) is advisory, not a reservation or wallet statement.
2. Use an official PyTorch/CUDA-compatible template and **ephemeral container storage only**; do not attach or create a Network Volume or global volume. Note that attached storage and stopped Pods may still have costs. Never turn on auto-restart or persistent GPU workloads.
3. Provision one Pod; write down its ID in the private test report, not public logs. Open the Pod terminal and execute the following *hardware-only* verification:
   
   ```bash
   set -e
   nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
   python - <<'PY'
   import torch
   assert torch.cuda.is_available(), "CUDA_GPU_REQUIRED"
   props = torch.cuda.get_device_properties(0)
   print("CUDA device:", props.name, "VRAM GiB:", round(props.total_memory / 2**30, 2))
   a = torch.ones((512, 512), device="cuda")
   b = a @ a
   torch.cuda.synchronize()
   assert float(b[0, 0].item()) == 512.0
   print("CUDA_MATMUL_PASS")
   PY
   ```

4. Collect the exact GPU identity and test log, then **Terminate/Delete** the Pod (not merely Stop). Confirm `Pods = 0` and `Network Volumes = 0` in RunPod and by a fresh API GET.
5. Read the actual charge in RunPod Billing/Credits. Never assert zero cost from GitHub job duration or from a catalog estimate.
6. This test does **not** prove TRELLIS.2, image conditioning, PBR, GLB, Make-ready assets, or the desired ECOMECH/Halloween quality. Do not upload CPU studies into verified GPU gallery PR #311.

## 5. Serverless auto-on/off after the real CUDA/TRELLIS image is ready

The existing guarded [manual provision workflow](https://github.com/teslaeco/WORLDIFACT/actions/workflows/runpod-flex-provision-once.yml) in `main` has a `workflow_dispatch` form. It is **already IMPLEMENTED, not run**. It requires an immutable image string of the form:

`ghcr.io/teslaeco/worldifact-runpod3d@sha256:<64 lower-case hexadecimal characters>`

It also requires GitHub Production environment configuration variables, **which must never be faked or set to true without recorded evidence**:

| Variable | Required value | Current verification |
| --- | --- | --- |
| `RUNPOD_APPROVED_IMAGE_DIGEST` | Exact reviewed image reference | UNKNOWN / no approved digest evidence |
| `RUNPOD_LICENSES_REVIEWED` | `true` only after actual SBOM/license audit | BLOCKED |
| `RUNPOD_CUDA_PARITY_VERIFIED` | `true` only after actual DRTK/CUDA benchmark | BLOCKED |
| `RUNPOD_WEIGHTS_VERIFIED` | `true` only after legitimate DINOv3/TRELLIS checkpoints and SHA checks | BLOCKED |
| `RUNPOD_R2_ACCOUNT_VERIFIED` | `true` only for reviewed account-bound write/read scope | R2 preflight VERIFIED; account scope still needs review |

The provision script at [scripts/runpod-provision-on-demand.mjs](https://github.com/teslaeco/WORLDIFACT/blob/main/scripts/runpod-provision-on-demand.mjs) enforces `workers.min=0`, `workers.max=1`, `workers.idleTimeout=5`, `gpu.count=1`, no network mounts, and `ENABLE_RUNPOD_WORKER=false`. A provisioned but disabled endpoint would **not** perform model inference until a separately reviewed enablement and `/run` request is authorized. RunPod usage, storage, image pulls and request processing may have separate costs even when minimum worker count is zero.

**Never put a placeholder digest in the manual form and never mark license or CUDA flags true merely to unblock provision.** Build and audit the CUDA base + DRTK + native weights first. The default NVIDIA nvdiffrast/nvdiffrec path has commercial license issues, and the DRTK alternative has only offline code tests in PR #305.

## 6. Evidence gates and next steps

- **VERIFIED:** Existing RUNPOD_API_KEY authentication, R2 private S3 test, zero Pods/endpoints/volumes at last inspected time, live Secure POD catalogue, green CPU/SDK contracts and full WORLDIFACT CI.
- **IMPLEMENTED:** GitHub manual provision workflow, read-only script, prototype RunPod worker, zero-idle resource profile, single-device procedural qualification in PR #316.
- **BLOCKED:** Accepted/licensed DINOv3 access, complete pinned native GPU image, tested CUDA/DRTK PBR pipeline, real ECOMECH & Halloween conditioned GLBs, and any verified production endpoint URL.
- **UNKNOWN:** Current RunPod wallet and invoice total, actual availability during checkout, owner Hugging Face account grant, any private reviewed image digest.

Do not merge PR #305 or #316, change production, start a permanently billed GPU, or call the project DONE until true provider/model evidence is retained. Update `docs/CONTEST_STATUS.md` and review GO/NO-GO before any deployment.
