# Owner reference generation

## Current result — 17 October 2026

Both owner jobs completed once in [run 38978275895](https://github.com/teslaeco/WORLDIFACT/actions/runs/38978275895). Original GLB/BLEND/decoder files remain private and preserved. The downloaded files passed size/SHA checks. Visual inspection found inverted UV texture assignment; separate local Blender derivatives corrected V without changing geometry or texture pixels. ECOMECH has its complete silhouette and pepper, with reduced fine detail. Halloween remains an incomplete scene with garment/background holes and missing or flattened props; it does **not** meet full realistic-room fidelity. Neither model is production/print approved. See the current evidence and hashes in `CONTEST_STATUS.md`.

The permanent endpoint is `s461jvmhr256g3`, Active=0/Max=1/idle5. Independent console inspection showed 0 Running, one Idle, no waiting/in-progress jobs and $0.00000/s. An Idle worker is already scaled down and not billed under [current provider documentation](https://docs.runpod.io/serverless/workers/overview). The older all-worker-counters-zero test did not pass; do not confuse that overly strict condition with actual running-GPU billing. Final invoice reconciliation is not claimed.

The paid generation claims are now consumed. Use only `download_existing` to recover stored results; do not clear claims or submit another generation to fix these outputs. The deployed worker still needs a separately reviewed UV regression correction before broader use. No customer routing, Oracle or customer billing change occurred.

## Historical preparation and qualification

The owner requested real GPU reconstructions of ECOMECH V4 and Halloween Music Room. The original robot image and two Halloween views have been recovered privately. Their SHA-256 and byte lengths are fixed in `ops/RUNPOD_OWNER_REFERENCES_20261016.json`; no image bytes or private encryption key enter this public repository.

The manual-only trusted-main transfer workflow prepares three create-only R2 PUT URLs, each expiring after 15 minutes and binding the object, content length, JPEG content type and source SHA metadata. Its artifact contains only RSA-OAEP/AES-GCM ciphertext addressed to the operator's private key. Production R2 credentials stay on the protected runner. The original files are subsequently uploaded once, their actual bytes must be rehashed server-side before any paid generation, and a conflicting upload is never overwritten.

This step allocates no GPU and makes no OpenAI call. No new customer generation route, Oracle change or billing change is included. The current actual GPU qualification is run 38964818698; native CUDA/DRTK, sparse/shape/texture generation, original GLB (14,879,468 bytes), Blender source and eight renders all passed. Native runtime took 351.954 seconds on A100-SXM4-80GB. Endpoint deletion was confirmed. Scale-to-zero was not observed within the one-minute health window (idle/ready counts remained 1), so it is not claimed from this run. Models are not delivered until their genuine output files and reference fidelity have been inspected.

Byte inspection confirmed the uploaded files have JPEG encoding despite their historical PNG filenames. Original JPEG bytes remain unchanged in source storage; model input normalization will create separate PNG derivatives.

## Actual original upload and mask verification

All three original JPEG byte streams were uploaded through the encrypted, expiring delegation from run 38967104719, with HTTP 200 and unchanged source SHA-256. The original labels historically ended in PNG, but encoding was verified as JPEG. SAM2.1 tiny (Apache-2.0), pinned revision de431c4043854a71d8101e17995dfe596bf101a5, ran on local CPU using Torch 2.6.0 and Transformers 4.57.1. The robot mask was visually inspected: full silhouette, pepper, hands and feet retained; measured foreground coverage 0.3347858608. The source image is normalized losslessly to a separate RGB PNG; the original is retained.

## Reviewed owner generation batch

The subsequently executed manual-only, main-only, first-attempt workflow requests two actual Astra plans with exact-image input-token preflight, maximum 2400 output tokens and a conservative USD 0.60 envelope per plan. Standard API pricing was checked at https://developers.openai.com/api/docs/pricing on 16 October (USD 10/50 per MTok); the estimate deliberately uses the higher long-context USD 20/75 rates. It uses fixed app UUIDs and durable R2 claims before each paid POST, without automatic retries. Plans are review criteria, not claimed text conditioning for TRELLIS.2.

The one persistent endpoint WORLDIFACT-3D-FLEX is created with the qualified private image, A100 catalog price <= USD 3/hour, 100GB ephemeral scratch, min0/max1, idle5 and no permanent volume. Two sequential 1024-resolution native jobs target 200,000 faces and 2048 textures, each at most 900 seconds execution and 1080 seconds including startup. The whole GPU orchestration is bounded to 40 minutes, and failed batches independently delete the endpoint. After two successful exports the fixed endpoint remains with min0; actual scale-to-zero observation is recorded separately. Existing customer routes, Oracle and billing remain unchanged.

Original decoder/GLB and separate Blender exports/renders stay private. The output collector permits only the two fixed job prefixes and named outputs; it checks object sizes and SHA metadata before encrypting one-hour GET URLs to the same operator public key. Private sources, plans and raw URLs do not appear in public Actions artifacts. The preparation revision had not yet run generation; successful run 38978275895 and the visual limitations above now supersede that status.
