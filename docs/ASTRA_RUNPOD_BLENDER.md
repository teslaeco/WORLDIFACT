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
