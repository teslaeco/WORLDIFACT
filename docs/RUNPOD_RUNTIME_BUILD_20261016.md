# Runpod native 3D runtime build — 16 October 2026

Owner request: replace the unavailable stopped Pod with a permanent request
endpoint that scales GPU workers to zero. Keep private outputs in existing R2;
do not rent a permanent Runpod network volume or an always-on GPU.

## Actual evidence

- The owner saved `HF_TOKEN` in GitHub's `Production` environment and obtained
  access to `facebook/dinov3-vitl16-pretrain-lvd1689m`.
- [Read-only access check 38937552850](https://github.com/teslaeco/WORLDIFACT/actions/runs/38937552850)
  succeeded on `961f1d6e6ef7abe497b1620622517f1187bf3da0`. Three HEAD requests
  verified the exact repository revision and gated file identities. This did
  not download weights or allocate GPU time. No secret value was retrieved.
- [Private runtime build 38938779926](https://github.com/teslaeco/WORLDIFACT/actions/runs/38938779926)
  failed on `677153297bf6f7b8183b164b94c9b0dae9455577` after successfully building
  FlashAttention, CuMesh and FlexGEMM. DRTK's two concurrent extension builds
  wrote the same `build.ninja`; the rasterizer link then lacked its object files.
  The recipe now serializes extension builds (`-j 1`) while retaining two Ninja
  workers within each extension. The corrected build passed native compilation.
- [Build 38942262589](https://github.com/teslaeco/WORLDIFACT/actions/runs/38942262589)
  on `f188824e61192c73c01f11ca183923a17506afd1` compiled all native dependencies,
  imported the DINO class, downloaded and SHA-verified the full weight bundle,
  and pushed the image. The final visibility check failed because the package
  was public, contrary to the assumed new-package default. It was changed to
  private in GitHub settings on 16 October before GPU use. The build now refuses
  a missing package instead of relying on an assumed visibility default.
  GitHub's version page shows immutable manifest digest
  `sha256:f6cd2c5facce5008e6d40b5d08ce34bfb9050347d585ab8b4d91c79cfb76b993`.
  Private pull and receipt extraction passed in run 38951170070 on e8ba1863.
  Its safe receipt artifact is 12068262959; the immutable image is unchanged.
  Real CUDA execution and model generation remain unverified.
- Runpod now lists the owner-created Docker credential `worldifact-ghcr`, ID
  `cmvbbpdxq000pi81ul0ltivxv`. Its presence is verified; no token value was read.
- 26 imported worker tests and four new bundle corruption/encoder tests pass
  locally. They use test doubles and tiny fixture weights, never real inference.
- Full local `npm run verify` reached 2,343 passing tests and two failures because
  Chromium is absent. Lint/typecheck passed. Do not replace those browser tests
  with mocks or claim a complete local verify pass. Local `npm run build` and
  `npm run deploy:check` subsequently passed.
- [Existing full PR CI 38939382342](https://github.com/teslaeco/WORLDIFACT/actions/runs/38939382342)
  passed on `54c948e5dd338b248ef4b7468ba33be3fd1c5bfa`, including the repository's
  normal verify, foundation assembly and deployment dry-run. This is not GPU or
  customer-generation evidence.

## Runtime implementation

The branch imports only the worker and its fixture from PR #305, plus a complete
build recipe under `tools/runpod_runtime`. It does not import the draft customer
routes, change Oracle, or merge PR #305 into production.

| Input | Pinned identity |
| --- | --- |
| Official PyTorch base | `pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel@sha256:0cf3402e946b7c384ba943ee05c90b4c5a4a05227923921f2b0918c011cfaf56` |
| Microsoft TRELLIS.2 code | `75fbf0183001ed9876c8dbb35de6b68552ee08bd` |
| TRELLIS.2 weights | `af44b45f2e35a493886929c6d786e563ec68364d` |
| Sparse structure decoder | `microsoft/TRELLIS-image-large@25e0d31ffbebe4b5a97464dd851910efc3002d96` |
| DINOv3 ViT-L/16 | `ea8dc2863c51be0a264bab82070e3e8836b02d51` |
| DRTK | `43c3095d01d0ff435c798518e97e387c784b567f` |
| CuMesh | `12289e1062f0603f2f0d0771b02e1395d247f26f` |
| FlexGEMM | `6dd94a859c26ee8246888502eada3dd8ad85532e` |

CUDA extensions compile during the CPU image build for SM80, SM86 and SM89.
They still need actual GPU execution checks. The existing narrow DRTK import
patch replaces the O-Voxel UV renderer; neither nvdiffrast nor nvdiffrec is
installed. Explicit input masks replace background-removal model calls.

Each model file is downloaded at image-build time using a BuildKit secret mount,
checked against its pinned upstream identity, and included in an all-file SHA-256
manifest. The downloader checks the actual ViT-L hidden size (1024). The image
retains DINO's own license and documentation. HF credentials are never baked into
the image. Runtime HF networking is disabled.

The named native dependency licenses were inspected in their official source
trees. `license-review.json` records the exact scope and limitations. It is not
a legal opinion, a binary CUDA acceptance, or permission for arbitrary customer
content. The weight-bearing GHCR package must stay private. The build checks
visibility before and after publishing and produces a source/package/native
binary receipt; the final immutable image digest is required for any deployment.

## Remaining gates

1. Successful private image build and retained immutable digest/weight receipts.
2. A successful private pull using the owner-created Runpod registry credential
   `worldifact-ghcr`. Credential presence alone does not prove pull access.
3. Bounded real CUDA/DRTK and native model inference qualification, preserved
   originals and GLB/Blender exports in private R2, plus teardown/scale-to-zero.
4. The existing provisioning attestations may be set only from real evidence.
   Do not alter their script hash guard or assert CUDA parity from CPU checks.
5. Provision min=0/max=1/GPU=1, idle=5s, ephemeral disk=100GB, no network volume,
   within the existing $3/hour rate cap. Cold start, execution and the idle tail
   are billable; a persistent API URL does not reserve a GPU or guarantee capacity.

No endpoint, live model output, customer traffic switch or production acceptance
is claimed by this build-only change.

## Bounded operator qualification

`runpod-gpu-qualify-once.yml` is manual, trusted-main-only and first-attempt-only.
It checks exact script hashes before exposing Production credentials. It creates
one disposable min=0/max=1 A100 endpoint using the private immutable image and
owner-created registry credential. Actual catalog price must be <= $3/hour.
The single job has a 900-second provider timeout plus an independent worker
watchdog; orchestration reserves 18 minutes for startup/job and two for cleanup.
It deletes only the endpoint it created, with readback and a separate always-run
cleanup step. Ambiguous creation/submission is never retried automatically.

The operator probe checks actual CUDA rasterization/interpolation against CPU
math, then performs native 512-resolution inference on Microsoft's pinned T.png
example, exports original GLB and Blender outputs, and preserves all artifacts
in private R2 under `ops/runpod-qualification/`. No Astra response is fabricated;
this is explicitly an engine qualification, not a customer/planner integration
test. The final production provisioning gate and its attestations are unchanged.

Paid qualification has not run yet. Source review/CPU tests are not GPU proof.
