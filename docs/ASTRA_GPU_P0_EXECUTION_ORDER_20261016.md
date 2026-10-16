# ASTRA EXECUTION ORDER — WORLDIFACT GPU P0 Recovery
Date: 2026-10-16
Status: ENGINEERING ORDER / NOT AN ASTRA API EXECUTION
Target: https://github.com/teslaeco/WORLDIFACT/pull/316
Official model reference: https://developers.openai.com/api/docs/models/gpt-6-astra

## Mission

You are the lead GPU systems engineer, SRE, security reviewer, QA lead, and release gatekeeper for WORLDIFACT. Do not create a new project. Repair the existing RunPod Flash-based GPU qualification, prove one real GPU-generated, textured GLB at a time, and stage evidence for the public gallery. Execute and test the code, do not submit a purely theoretical plan. Report only VERIFIED, IMPLEMENTED, BLOCKED, UNKNOWN evidence.

The OpenAI model identifier to use for any explicitly authorized API planning step is `gpt-6-astra` (verify accessibility with the account before claiming any call). No Astra API call was made merely by authoring this document. A language-model design plan is not native image-to-3D, nor is procedural mesh generation a neural reconstruction.

## Fixed repository facts

- Main: `b6f367cd62b1253a45ca5e8a34ae9326e28fd6a7` at review time; recheck live refs and PRs before any write.
- Source branch: `ops/gpu-split-20261016`; PR #316. Related PRs: #315 (isolated Flash import + result-persistence repair), #311 (verified-only public gallery), #305 (Astra/TRELLIS.2 draft), #308 (private reference tests).
- Real paid trials: #38877860327 and #38879132929 provisioned transient Pods but failed on missing `procedural_models` imports. #38879916050 returned from its remote L4/4090 task but subsequently failed local result persistence. No retained CUDA attestation or GPU GLB artifact from these runs. Independent postflight succeeded and saw zero Pods/endpoints/volumes after each attempt. Exact billed costs remain UNKNOWN.
- The split branch has existing offline SDK/CUDA-boundary, GLB/PBR fixtures, operator, postflight and provenance tests. Do not reinterpret CPU fixtures as GPU outputs.

## Strict scope and costs

1. Run exactly ONE class per authorized dispatch: L4/RTX 4090 first, A100 second, H100 third. A100 and H100 require a verified success and independently checked cleanup from the previous class.
2. No permanently billed Pod, endpoint, worker, or network volume. For transient Pods ensure SDK termination and an independent read-only provider postflight; Serverless Flex when used has active/minWorkers=0, maxWorkers=1, idleTimeout=5 seconds.
3. Use existing server-side `RUNPOD_API_KEY` within the secured execution environment. Never export key values to logs, chat, commits, forks, local browser JS, or `VITE_*`.
4. Owner approved controlled paid tests and a historical projected combined budget of USD 8. This is NOT an unlimited billing authorization. Recheck live SKU availability and secure rates before each class. Do not equate projected charges with an enforceable provider spending cap or assume the historical USD 33.68 wallet remains valid. Reconcile actual RunPod billing/credits before additional paid dispatch.
5. Never automatically retry a failed or ambiguous provisioning request. Failure in preflight, quote, GPU identity, shader/CUDA, GLB, SHA or cleanup stops that class and prevents progression.
6. Do not touch production deploy, Stripe, subscriptions, customer credits, Oracle `froge-blender`, private user images, the six portal routes or existing R2 configuration. No customer order or public contest submission.

## Required work

### Phase A — code and preflight (no paid GPU)

- Fetch current main, PR heads, workflows, status checks, Actions artifacts, commit marker state and any concurrent agent changes. Use the existing reviewed source, never force-push/overwrite.
- Reproduce both previously observed import failures in an isolated `/tmp/runpod_live_*.py` process without repository-adjacent modules. Verify both function-side and response-persistence code using `tests/test_flash_worker_source.py`.
- Ensure `WORLDIFACT_GPU_TARGETS` rejects empty and multi-GPU values. Select exactly one GPU task per run and quote only that class.
- Cost check must conservatively price ALL eligible matching secure Pod SKUs that the SDK can provision. Do not choose `min(price)` if fallback selection could choose a more expensive SKU. Refuse any eligible unknown, invalid or over-cap secure price; use the highest eligible rate as worst-case exposure.
- Use an independently validated provider inventory preflight: zero unexpected Pods, serverless endpoints, and network volumes. Do not create anything on a read-only preflight.
- Run `python -m unittest discover -s tests -p 'test_three_gpu_procedural_models.py' -v`, `test_three_gpu_dispatch.py`, `test_flash_worker_source.py`, `test_single_gpu_batches.py`, `test_three_gpu_workflow_safety.py`; then `npm run verify` and `npm run deploy:check`. No skipped assertions or synthetic GPU receipts promoted as real.

### Phase B — GPU L4 or RTX 4090 only

- Use a separately permitted, explicit, single-use authorized job/marker; do NOT rerun consumed three-GPU workflows or circumvent a blocked tool action. Do not proceed unless the execution environment supports it.
- Check live RunPod account, SKU, region, secure price and available balance; insist on one Pod, ephemeral scratch only and an independent unconditional cleanup check.
- Run just the Chess Cube 512 LED rook task under a bounded timeout. Record actual `torch.cuda.is_available()`, physical CUDA GPU name and VRAM, non-null finite CUDA checksum, elapsed CUDA milliseconds.
- Export a genuine GLB with embedded PBR base-color texture(s). Verify glTF v2 header/length, mesh count, triangle count, non-flat bounds, byte size and SHA-256. Write the GLB and matched JSON provider receipt to an immutable GitHub Actions artifact. Include the remote run ID and provider Pod ID where legitimately available; redact sensitive infrastructure details from publicly distributed files.
- After completion or exception confirm zero owned temporary Pods, endpoints and network volumes. A worker-ready event or a returned function without a persisted verified GLB is NOT SUCCESS.
- Verify true billed cost from RunPod billing. If unavailable, report UNKNOWN without asserting 0 USD.

### Phase C — separately authorize A100 and H100

- After L4/4090 success, separately execute the A100 ECOMECH mechanical procedural study, then the H100 Halloween editable procedural room study. Different geometry, separate receipts, independent cleanup and separate charge reconciliation each time.
- No photo reconstruction claims. The advanced Astra → TRELLIS.2 image-to-3D path remains a separate gated milestone requiring licensed checkpoint, DRTK/CUDA validation and owner reference privacy controls.

### Phase D — publication GO/NO-GO

- PR #311 requires the exact three genuine GLBs and provider JSON receipts, verified sourceRunId, SHA256, CUDA/VRAM, geometry, PBR and independent teardown. If a single output is missing or invalid, DO NOT fabricate a public manifest.
- Keep the gallery on a review branch. Production merge/deploy requires separate explicit owner authorization, plus green CI and a clean-session smoke test of GLB loading and download.
- Update `docs/CONTEST_STATUS.md` after each verified milestone. Link immutable logs, artifacts and actual cost receipts. Do not commit originals from ECOMECH V4/Halloween reference photos.

## Mandatory report shape

| Stage | Status | Evidence / Run ID | GLB SHA-256 | GPU / VRAM / CUDA | Residual Pods | Actual billed USD |
|-------|--------|-------------------|------------|--------------------|---------------|-------------------|
| L4 or RTX 4090 | UNKNOWN | — | — | — | UNKNOWN | UNKNOWN |
| A100 | BLOCKED | — | — | — | UNKNOWN | UNKNOWN |
| H100 | BLOCKED | — | — | — | UNKNOWN | UNKNOWN |

Use DONE only for a real CUDA-attested, independently validated and retained output. Stop on authentication or execution-policy failures, report the precise blocker and keep resources safe. Do not bypass host permissions.
