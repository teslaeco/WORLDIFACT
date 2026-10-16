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
  workers within each extension. The corrected build still needs verification;
  no image digest or real inference exists yet.
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
2. A Runpod registry credential able to pull that private GHCR image. The Runpod
   Container Registry Auth page currently has no entries. This is a separate
   credential from `HF_TOKEN`; no secret should be pasted into chat.
3. Bounded real CUDA/DRTK and native model inference qualification, preserved
   originals and GLB/Blender exports in private R2, plus teardown/scale-to-zero.
4. The existing provisioning attestations may be set only from real evidence.
   Do not alter their script hash guard or assert CUDA parity from CPU checks.
5. Provision min=0/max=1/GPU=1, idle=5s, ephemeral disk=100GB, no network volume,
   within the existing $3/hour rate cap. Cold start, execution and the idle tail
   are billable; a persistent API URL does not reserve a GPU or guarantee capacity.

No endpoint, live model output, customer traffic switch or production acceptance
is claimed by this build-only change.
