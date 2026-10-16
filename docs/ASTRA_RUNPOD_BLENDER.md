## 2026-10-16 — concrete MIT UV bake implementation (code staged; GPU NOT activated)

The previous source path imported NVIDIA `nvdiffrast` into `o_voxel.postprocess.to_glb()` and was unsuitable for paid commercial subscriptions under its source license. This draft now adds a **reviewable import-only patch** plus our own `worldifact_drtk_uv.py` adapter. The adapter maps NVIDIA's four-channel raster contract to Meta's **MIT-licensed DRTK** index/barycentric API: UV NDC → pixel centers, face ID + 1, chunk offsets, Barycentric 3D vertex interpolation, and zero-filled background. The rest of Microsoft's MIT conversion pipeline still performs CuMesh (MIT) topology cleanup/UV unwrap and FlexGEMM (MIT) voxel material sampling. This keeps raw geometry and PBR color/metallic/roughness attributes intact instead of pasting a reference image onto a 2D plane.

**Pinned references:**
- Microsoft TRELLIS.2 source `75fbf0183001ed9876c8dbb35de6b68552ee08bd`, exact single edit `o-voxel/o_voxel/postprocess.py`: `import nvdiffrast.torch as dr` → `import worldifact_drtk_uv as dr`.
- DRTK MIT source `43c3095d01d0ff435c798518e97e387c784b567f`, compiled in-place from the audited source at `/opt/DRTK`; the GPU-base source and binary SBOM remain to be established.
- Runtime rejects mismatched Microsoft git revision, any nonmatching source patch, other tracked source edits, absent DRTK or installed NVIDIA nvdiffrast/nvdiffrec rendering libraries.
- Real pinned upstream patch check is in GitHub Actions (no GPU, no paid provider). Python tests exercise exact patch/rejection and UV pixel/face-ID math. **They do not prove CUDA UV raster parity or photorealistic resemblance**.

**Image build/activation order (fail closed):**
1. Audit *all* base-image CUDA/PyTorch, MIT dependencies, DINOv3 terms and accepted license, model bundle SHA-256, source revisions and binary provenance. Do not use a public shared image or download model checkpoints during user jobs.
2. Build a digest-pinned Linux CUDA image with vetted TRELLIS2 source, DRTK compiled in place, preloaded local TRELLIS2/DINOv3 checkpoints and Blender. The Dockerfile runs `trellis_mit_patch.py --apply` then `--check`, rejects noncommercial NVIDIA packages, validates its source revision and refuses to build on an unknown base. **No such reviewed base/image digest exists yet**.
3. Benchmark one synthetic GLB/PBR checkpoint, camera renders, file hashes and actual DRTK CUDA index/barycentric mapping against expected UV charts; reject seams, flipped v, missing PBR or black materials. Do not advertise parity before this measured test.
4. Only when all license/security/performance gates pass, quote a specific RunPod GPU price, max execution, cold start + storage exposure, get owner approval for a controlled paid pilot and provision **Serverless Flex QUEUE, Active=0, Max=1, GPU=1, idle=5s**. Always verify the live endpoint settings; no 24/7 Pod or keepalive.
5. Privately upload SHA-bound original images and reviewed masks through owner-authenticated R2 storage, not public GitHub or a public URL. Require a server-issued budget permit before one real Astra request and then at most one paid GPU reconstruction attempt per approved job.
6. Check original geometry, all PBR views/clay views, editable BLEND, private signed download, account library saving, matched invoiced usage, and actual likeness. Halloween is an independent **multi-object scene** and requires real composition of performer, squirrel, piano, instruments and room; the single-object worker does **not** deliver it alone.
7. Keep **GAME (real GLB/BLEND if inspected)** distinct from **MAKE (REVIEW_REQUIRED)**, preserve the existing Oracle path and all user credits, then request explicit GO before merging/deploying anything customer-facing.

**Status:** MIT raster-adapter source **IMPLEMENTED / OFFLINE TEST PENDING REAL GPU**; operational RunPod GPU image **NOT BUILT**; real two-photo reconstruction **NOT EXECUTED**; commercial legal audit of full image **INCOMPLETE**. This work eliminates a known dependency only from the reviewed UV path; it does not yet certify every dependency or a deployable production service.

See https://github.com/facebookresearch/DRTK/blob/43c3095d01d0ff435c798518e97e387c784b567f/LICENSE and https://github.com/microsoft/TRELLIS.2/blob/75fbf0183001ed9876c8dbb35de6b68552ee08bd/o-voxel/o_voxel/postprocess.py .

---

## Mandatory on-demand-only GPU policy (owner confirmation, 2026-10-16)

RunPod is **NOT** a permanently running Pod or 24/7 Active worker. When a licensed, image-digest-pinned endpoint is later provisioned, configure queue-based **Serverless Flex**, **Active workers = 0**, **Max workers = 1**, **GPUs per worker = 1**, **handler concurrency = 1**, **Idle timeout = 5 seconds**, **Automatic upgrade = false**. Match the exact checklist at `deploy/runpod/profile.example.json`; enforce it in CI with `tests/runpod-on-demand-profile.test.mjs`.

Only a newly admitted, authenticated, funded 3D generation job may cause backend POST `/run`. Viewing WORLDIFACT, reopening a model, browsing a gallery, polling GET `/status`, previewing existing 3D assets, deploying code or running a health check must not start a GPU. No periodic warmup jobs or keepalive ping. If RunPod management GET reports Active workers > 0 **for the WORLDIFACT endpoint**, STOP before approval and correct the provider settings. Do not create a paid endpoint, launch Pods, buy persistent network volumes or flip `ENABLE_RUNPOD_PIPELINE` as part of this offline test.

Flex worker is billed while starting, computing, and waiting during idle timeout; external persistent storage may be charged independently even when worker count is zero. Existing Oracle CPU services remain separate and unchanged. Actual provider settings and billed invoice are **UNVERIFIED** until a scoped live account check. Official documentation: https://docs.runpod.io/serverless/workers/overview and https://docs.runpod.io/serverless/endpoints/endpoint-configurations .


---

# Astra -> RunPod Flex -> Blender: integration preparation

**2026-10-15. IMPLEMENTED adapters / offline tests. NOT DEPLOYED.**
This PR prepares the native pipeline; it does not provision a RunPod endpoint,
activate customer generation, change pricing/credits or declare a new ECOMECH
model completed. No paid OpenAI, GPU, Tripo/Meshy request or production release
is part of the PR. Existing Oracle generation and all six experiences stay intact.

## Pipeline implemented

1. `server/runpodPipeline.ts::planWithAstra` sends the immutable PNG reference
   and prompt to the official Responses API with `gpt-6-astra`, strict structured
   output, a token limit and no model-generated executable code. The existing
   authenticated app must grant an atomically persisted OpenAI budget permit,
   including image/token cost preflight, BEFORE calling it. Provider ID and usage
   are retained; a failed/uncertain request never automatically repeats.
2. Store the original PNG and reviewed whole-object mask in private object
   storage under `jobs/<opaque-tenant-scope>/<app-uuid>/`. Derive scope server-side
   from authenticated identity. Never accept ownership scope, price/rate, storage
   paths or budget permits directly from a browser. Preserve the original files.
3. `submitGpu` validates the plan, planner receipt, original hashes, settings and
   time/cost envelope. `DurableDispatchJournal` uses transactional storage for
   atomic submission claims and a daily exposure ceiling. Wire it to one tenant's
   **existing** authenticated Durable Object; process-local Maps/KV are not safe.
   Reserve before POST `/run`. Persist returned provider ID and endpoint. Unknown
   HTTP results retain the claim and require reconciliation, not re-submission.
4. RunPod Serverless invokes `tools/runpod_worker/handler.py`. The worker validates
   all original bytes and bounds. It creates a durable S3 conditional claim before
   expensive work. Duplicate queue delivery after scale-to-zero returns the
   persisted result; an incomplete claim blocks automatic re-inference. RunPod
   can redeliver jobs, so a local Python lock is not sufficient.
5. `engine.py` loads a licensed/hash-checked local TRELLIS.2 bundle and keeps it
   warm **only while a worker is alive**. Whole-object image conditioning replaces
   rejected six-cutout assembly or projecting RGB onto an old mesh. Astra's plan
   supplies preservation/review criteria; TRELLIS2 is image-conditioned and does
   not secretly consume that description as a text-guidance feature. Geometry
   attribution is Microsoft TRELLIS.2, directed/reviewed within WORLDIFACT.
6. Save decoder vertices/faces AND spatial material attributes, coordinates,
   origin, voxel size, shape and layout to durable storage **before** GLB baking.
   Save the original GLB before Blender. A baking/export failure can be inspected
   without discarding the expensive decoder output. Automated export-only replay
   is not exposed by this PR; reconcile and authorize any additional GPU work.
7. The fixed Blender script imports that real GLB with automatic script execution
   disabled. It preserves source geometry, exports separate GAME GLB and editable
   BLEND, and renders PBR plus neutral clay from four cameras. It does not join,
   thicken or smooth bad geometry to disguise errors, and does not invent a print
   scale. STL/FBX/OBJ and physical MAKE approval are not claimed by this first PR.
8. Persist outputs and SHA-256 inventory in private S3-compatible storage before
   returning only a small receipt. Source geometry survives worker shutdown.
   `readGpuStatus` is GET-only; `validateWorkerReceipt` rejects foreign owner keys,
   arbitrary URLs, wrong identity, missing views and fake manufacturing approval.
   The backend must verify bytes against hashes during asset ingestion before
   adding a signed, account-authorized file to the existing preview/library.

## Scale-to-zero profile

`deploy/runpod/profile.example.json` is an **operator checklist, not provisioning
code**: queue endpoint, Active workers 0, Max workers 1, one GPU, handler concurrency
1, idle timeout 5 seconds. Initial execution/TTL examples are 120/600 seconds;
benchmark and approve changes before activation. No constant VM, Windows desktop,
public Hugging Face demo, paid Meshy/Tripo API or running 24/7 is required.

A GPU type, current tariff and image digest are intentionally unset. A100/H100
compatibility, startup time, output fidelity, throughput and actual cost must be
measured, not inferred from the hourly rate. `rateMicroUsdPerSecond` is a reviewed
operator quote, not an LLM output. The backend reserves estimated exposure for
execution + configured cold-start allowance + idle time. This is **not** a hard
provider invoice cap: cold starts, storage, failed startup and vendor billing must
be reconciled separately. Queue delay is not automatically billed GPU time.

RunPod job executionTimeout is the independent external time limit. The Python
handler uses a thread-safe soft deadline; Python cannot reliably interrupt an
arbitrary CUDA operation. The Blender child has a subprocess timeout. If a worker
is killed, its durable claim remains and a redelivery will not re-run inference.
Do not attach a keepalive/health-ping scheme that defeats scale-to-zero.

Results available through RunPod `/status` expire. The private durable result
manifest is authoritative for downloads and must not be replaced by temporary
RunPod URLs. Retention/storage deletion policies need operator review. Storage can
cost money while GPU workers are off. Browser orbiting a saved model never calls
`submitGpu` and does not need reconstruction GPU.

## Runtime image and secrets (activation prerequisites)

The Dockerfile is a **preparation recipe** requiring an audited, digest-pinned
Linux CUDA base image containing the pinned upstream tree and Blender. It is not
an already-built or tested GPU image. GPU/CUDA dependencies and model weights
are not downloaded during user jobs. Build outside paid inference where possible.

- TRELLIS2 source: `75fbf0183001ed9876c8dbb35de6b68552ee08bd`.
- Primary checkpoint: `af44b45f2e35a493886929c6d786e563ec68364d`.
- Local bundle: `worldifact-bundle.json`, with those `sourceRevision` and
  `modelRevision`, explicit `dependencyLicensesReviewed: true`, `pipelineConfig`,
  `files` mapping every file to its real SHA-256, `modelPrefixes` for all names in
  `engine.PARTS`, and a fully hashed `dinov3Directory`.
- Code/model MIT attribution does not remove dependency obligations. Review DINOv3,
  CUDA, Blender distribution and all bundled weights individually. No BRIA service
  is called. See the earlier draft #304 for the reference-reconstruction research;
  this PR does not merge/activate that draft or reuse its unapproved image outputs.
- `deploy/runpod/environment.example` contains empty secret names only. OpenAI
  and RunPod API keys stay on the backend. The GPU gets only restricted artifact
  credentials, not an OpenAI key or a user's account/session token.
- S3 provider must support strongly consistent `IfNoneMatch='*'` writes. Prove
  this on the selected bucket before activation. Do not emulate CAS with GET+PUT.
- Mount checkpoints read-only, run as non-root, keep outbound access limited to
  approved artifact storage, and preserve no user files on an ephemeral disk.

## What is intentionally not connected yet

There is **no production POST route or new UI button** in this preparation PR.
The new exports are a backend integration seam, not an alternative authentication
system. Before exposing it, bind existing account authorization, request-rate
limits, existing OpenAI budget permits, the transactional journal and artifact
storage. Validate response IDs/hashes and persist provider reconciliation records.
Never silently switch a paid job from Oracle to RunPod or alter its credit price.
If the feature is not enabled/configured, it fails closed instead of generating
mock models. No automatic deployment workflow is added.

## Test meanings and final acceptance

- Node tests use mock provider responses, a serialized transaction test double
  and shared JSON/PNG fixtures. They test immutable job/owner identity, budget
  refusal, concurrency, uncertain POSTs, refusal/error handling and safe output
  references. They are NOT a live OpenAI or RunPod result.
- Python worker tests use explicitly labeled box geometry and fake inference.
  They test reference tampering, actual GLB bytes, durable receipts, partial
  decoder preservation, idempotence after a simulated cold start, source paths,
  SDK-thread compatibility, and boto3 conditional-write call shape.
- The dedicated CI additionally runs the real Blender script on a box fixture,
  producing actual GLB/BLEND and eight render files. That proves the Blender
  stage's code path, not ECOMECH likeness or CUDA reconstruction.
- GPU base build, native TRELLIS2 inference, real S3 CAS, actual end-to-end API,
  Android preview, model likeness, invoice cost and supplier MAKE review remain
  **UNVERIFIED** until a separately approved paid test and rollout.

Final output is `REVIEW_REQUIRED`, never `printReady=true`. Compare clay and PBR
views with the reference; unseen rear geometry remains inferred. Physical scale,
closed/manifold geometry, intersections, walls, support/slicer checks and the
supplier's actual material/process requirements are separate MAKE gates.

## Official sources checked 2026-10-15

- OpenAI model guide: https://developers.openai.com/api/docs/guides/latest-model
- Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- RunPod handler: https://docs.runpod.io/serverless/workers/handler-functions
- RunPod /run and /status: https://docs.runpod.io/serverless/endpoints/send-requests
- Scale-to-zero/settings: https://docs.runpod.io/serverless/endpoints/endpoint-configurations
- Conditional object writes: https://docs.aws.amazon.com/boto3/latest/reference/services/s3/client/put_object.html
- TRELLIS2 implementation/license: https://github.com/microsoft/TRELLIS.2
- Pinned worker SDK: https://pypi.org/project/runpod/1.12.0/

## Staging RunPod credential handshake — 2026-10-15

RunPod Official ChatGPT plugin installation was confirmed, but direct RunPod
account-management tool methods were unavailable in this conversation.
The owner showed a RunPod API secret in the GitHub **Production** environment;
do not use that environment from a draft PR: it contains unrelated OpenAI,
Cloudflare, Stripe and Oracle secrets.

Create a separate GitHub environment named **runpod-staging**, enable required
reviewer approval, then privately add a read-only RunPod key with secret name
RUNPOD_API_KEY. Do not paste the value into any chat, commit, issue or log.

Added a protected and disabled-by-default authentication test:
- scripts/runpod-readonly-preflight.mjs — official REST v1 GET for endpoints,
  network volumes and Pods; aggregate results only, no provider env/IDs logged.
- tests/runpod-readonly-preflight.test.mjs — GET-only, leak prevention,
  malformed-response, timeout and permission-denial regression tests.
- .github/workflows/runpod-staging-connection-once.yml — dedicated
  runpod-staging environment, pinned verifier, strictly one marker-only push.
  The activation marker is intentionally absent until secret/reviewer setup.
- Existing manual staging workflow was corrected from the wrong API host to
  the documented official https://rest.runpod.io/v1/endpoints URL. GitHub
  manual dispatch requires workflow availability on the default branch;
  do not report it as an executed account check yet.

Official API:
https://docs.runpod.io/api-reference/endpoints/GET/endpoints
https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes

Read-only success is NOT paid GPU setup or LIVE model generation. A GPU
container image, license review, private storage, measured availability
and price, actual end-to-end ECOMECH reconstruction, cost reconciliation
and final Android/MAKE gates remain NOT VERIFIED. No GPU or disk was purchased.

## Account access proof: GET-only auth denied — 2026-10-15

**VERIFIED:** Independent read-only PR #306 had green workflow security and full
project CI before limited merge. The one-time GitHub Actions job on trusted
main used the existing masked RUNPOD_API_KEY secret from Production and called
the official RunPod management GET v1 /endpoints exactly once. RunPod returned
HTTP 403. Evidence:
https://github.com/teslaeco/WORLDIFACT/actions/runs/38801996493

This is an authorization denial, not a successful connection or GPU probe.
The key was never sent to the model, posted in chat or written to a log or
artifact. No GPU, disk, inference, customer billing or production deployment
was created. Security cleanup: the one-use workflow was removed from main
at commit 2e41b15a11f6f023f1189892033f3923929af511. Another existing
publish workflow saw the main push but explicitly aborted with
PIPELINE_RELEASE_SCOPE_NOT_VERIFIED before using credentials or deploying:
https://github.com/teslaeco/WORLDIFACT/actions/runs/38801996415

**VERIFIED:** RunPod REST management v1 is deprecated and retires 2026-11-15.
The documented successor is https://api.runpod.io/v2. Consequently, the
optional feature-branch read-only staging script now uses GET
/v2/serverless, /v2/network-volumes and /v2/pods, with strict wrapped
response and pagination checks. The separate RunPod *execution*
host remains https://api.runpod.ai/v2. Do not conflate the two.
Sources:
https://docs.runpod.io/api-reference-v2/migrate-from-v1
https://docs.runpod.io/api-reference-v2/serverless/list-serverless-endpoints

**BLOCKED:** Exact reason for the RunPod key's HTTP 403 cannot be inferred
without account-side checks. Owner needs to verify the key is enabled,
belongs to the intended account, and has sufficient read scopes. Prefer a
separate restricted/read-only staging key over broad write access. The
GitHub connector cannot administer repository environments/secrets and the
installed RunPod Official plugin exposes no account-management actions in
this chat. Do not attempt to extract Production secrets or rotate keys.

**NO-GO:** Do not automatically buy GPU/storage or merge the new generator.
The licensed TRELLIS.2 image, real on-demand serverless GPU, durable private
storage, actual cost, original GLB quality and MAKE approvals are unverified.
