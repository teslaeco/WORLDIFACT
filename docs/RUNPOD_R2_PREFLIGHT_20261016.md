# RunPod v2 + Cloudflare R2 access preflight — 2026-10-16

**PREPARED / NOT LIVE / no paid GPU.** User screenshots confirm names of Production secrets RUNPOD_API_KEY, ARTIFACT_ACCESS_KEY_ID, ARTIFACT_SECRET_ACCESS_KEY and variables ARTIFACT_BUCKET, ARTIFACT_REGION, ARTIFACT_S3_ENDPOINT. Secret values cannot be inspected from GitHub. Owner reports RunPod balance of USD 33; not independently confirmed.

## Important nonsecret configuration correction

The displayed ARTIFACT_S3_ENDPOINT value resembles descriptive text beginning with 'S3 API URL z Cloudflare R2 Ov...' rather than an actual HTTPS host. Owner should use GitHub Settings > Environments > Production > Environment variables and paste the exact S3 API endpoint from R2 Overview. Required shape: https://<32 hexadecimal account ID>.r2.cloudflarestorage.com. Bucket worldifact-artifacts, region auto; no public access or GitHub comment containing secrets. The scripted preflight refuses to send credentials to arbitrary hosts.

## Safe workflow, pending owner approval for merge

One narrow, unmerged PR adds a read-only RunPod REST v2 management check, a one-object R2 conditional-put/read/delete probe, and offline fake-provider tests. Workflow runpod-r2-production-check-once.yml is restricted to a marker-only trusted main push; it does NOT run on pull_request, cannot initiate paid inference or create endpoints, and exposes only the named secrets to specific steps. This uses GitHub Production secrets already stored, without creating a new RunPod API key.

The follow-up marker file must be added in a separate exact file-only main commit AFTER the narrow PR is reviewed and explicitly approved for merge. The exact file body is documented below. The workflow has not yet been executed using account secrets. If RunPod responds 401/403 or R2 returns an error, do not infer successful connection.

Marker path: ops/runpod-r2-production-preflight-once.json
Marker body:

```json
{"revision":"worldifact-runpod-r2-production-preflight-v1","runpodOperations":["GET /v2/serverless","GET /v2/network-volumes","GET /v2/pods"],"r2OnlyObjectPrefix":"ops/preflight/","paidGpuAuthorized":false,"productionDeploymentAuthorized":false}
```

## Native RunPod / Oracle

Draft PR #305 has green CI for mocked provider calls, strict TS and real Blender fixture export, but no GPU image with audited TRELLIS2 weights or provisioned RunPod endpoint. Do not merge that GPU integration, change customer routing, toggle ENABLE_RUNPOD_PIPELINE, or spend from the USD 33 budget on an image/job until dependencies, performance, source authorization and costs are verified. Existing Oracle CPU workflows remain unchanged; this narrow PR neither accesses Oracle nor changes its jobs.

Sources: https://developers.cloudflare.com/r2/get-started/s3/ ; https://developers.cloudflare.com/r2/api/s3/extensions/ ; https://docs.runpod.io/api-reference-v2/migrate-from-v1 ; https://github.com/teslaeco/WORLDIFACT/pull/305 .
