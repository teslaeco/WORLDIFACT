# Production generation blocker report

Updated: 4 October 2026

## Status

**BLOCKED — no production request was submitted and no new GLB was generated.**

The repository-side compatibility repair is present: the reviewed deployment
configuration selects `STUDIO_NEW_JOB_POLICY=legacy-usd175-v1`, the Studio API
uses the USD 1.75 Oracle contract for a new unpriced request, and the release
gate now refuses to activate Studio under another new-job policy.

This executor cannot establish that the policy is active in the currently
deployed Cloudflare Worker. A credential-free request to
`https://worldifact.xodobrox.workers.dev/api/studio/status` was rejected by the
executor's outbound CONNECT proxy with HTTP 403 before reaching WORLDIFACT.
Changing browser, CDP or an indirect route is prohibited by the recorded
security block and was not attempted.

## Exact blockers

| Blocker | Affected service | Required configuration | Where it belongs | Exact next action |
| --- | --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` is absent | Cloudflare deployment and Worker secret synchronization | Existing restricted Cloudflare API token | GitHub repository environment `production`, secret `CLOUDFLARE_API_TOKEN` | Run the existing `cloudflare.yml` workflow from an authenticated GitHub context; do not copy the value into source or local frontend variables. |
| `CLOUDFLARE_ACCOUNT_ID` is absent | Cloudflare deployment | Existing 32-character account ID | GitHub repository environment `production`, secret `CLOUDFLARE_ACCOUNT_ID` | Supply it through the existing environment secret and let `scripts/release-check.ts` validate it. |
| `ORACLE_ENDPOINT` is absent | Studio API → Oracle health, job, status and artifact calls | Existing public HTTPS Oracle origin | GitHub repository environment `production`, secret `ORACLE_ENDPOINT`; synchronized to the Worker by `scripts/connect-platform.ts` | Re-run the existing release workflow so its authenticated read-only runtime gate verifies the installed worker before Studio activation. |
| `ORACLE_API_TOKEN` is absent | Oracle authentication | Existing Oracle bearer token | GitHub repository environment `production`, secret `ORACLE_API_TOKEN`; synchronized to the Worker by `scripts/connect-platform.ts` | Re-run the existing release workflow together with `ORACLE_ENDPOINT`; do not print, rotate or replace the token for this recovery. |
| `OWNER_ACCESS_TOKEN` is absent | Signed Studio receipts and owner-only checks | Existing owner access token | GitHub repository environment `production`, secret `OWNER_ACCESS_TOKEN`; synchronized to the Worker by `scripts/connect-platform.ts` | Re-run the existing release workflow; do not expose the value to the frontend or reports. |
| No authenticated production account session is available | Account admission, point hold, recovery and preview | Existing production account with at least 250 available points and at least USD 1.75 verified unreserved provider funding | WORLDIFACT production login/session and the existing account Durable Object | After a green deployment, sign in as the authorized test account and confirm `/api/account` reports legacy Studio admission allowed. Do not reset points or provider funding. |
| No Git remote or GitHub authentication is configured in this checkout | Hosted CI and PR publication | Existing repository remote and authorized GitHub session | Git configuration / approved GitHub integration, not application source | Publish the committed branch through the approved integration, run exact-head CI, and do not merge until every required check is green. |
| Outbound CONNECT proxy returns HTTP 403 for the public Worker | Read-only production status verification from this executor | Network access to the existing public Worker | Executor/network policy | Perform the existing workflow's post-deployment `/api/studio/status` check in GitHub Actions. Do not bypass the proxy through another browser or indirect route. |

## Cloudflare Worker contract

The checked-in Worker configuration declares the `GENERATION_BUDGET` and
`ACCOUNT_ENTITLEMENTS` Durable Objects plus generation and account rate-limit
bindings. The disabled base intentionally does not enable paid Studio. During a
LIVE release, `build-live-generation-config.ts` prepares the reviewed live
configuration and `restore-detailed-studio-config.mjs` changes only
`ENABLE_STUDIO_JOBS` after verifying all of the following:

- `STUDIO_NEW_JOB_POLICY=legacy-usd175-v1`;
- account entitlements and Astra runtime activation;
- Oracle model `gpt-6-astra`;
- Oracle budget revision `astra-usd175-v1` and maximum USD 1.75;
- current cost guard, output policy, photo support and prompt limit;
- anonymous Oracle jobs remain disabled.

The deployment workflow then verifies the published `/api/studio/status`
response reports the legacy policy and does not advertise tiered new jobs.

## Existing Oracle pipeline inspection

No installation or remote mutation was attempted. Repository inspection confirms
the existing integration contract:

1. Studio submits one authenticated `POST /v1/jobs` after account reservation,
   global allowance reservation and an atomic dispatch claim.
2. Recovery polls `GET /v1/jobs/{uuid}` using the same signed job UUID.
3. The installed service is expected to run on the existing `froge-blender` VM;
   the reviewed launcher resolves that running instance rather than creating or
   reinstalling one.
4. Blender/MCP completion stores `model.glb` in the job directory. The Studio
   proxy reads `GET /v1/jobs/{uuid}/model`, validates content length, MIME type,
   GLB magic/version/declared length and the structural quality gate before
   exposing preview/download.
5. Optional BLEND, FBX and PBR exports use the existing
   `/v1/jobs/{uuid}/exports/{format}` routes. Rendering or export alone is not a
   manufacturing approval.

Without `ORACLE_ENDPOINT` and `ORACLE_API_TOKEN`, this executor cannot read the
actual service health, launcher state, Blender process, job directory or artifact.
The source and fixture checks are compatibility evidence only.

## Controlled test procedure after unblock

Do not create a job until the exact-head deployment is green and the read-only
status plus account admission checks pass. Then submit exactly once through the
normal authenticated Studio UI using:

> Create a simple sci-fi drone with metallic frame, green glass panels, realistic PBR materials, optimized for GLB export.

Record all of the following before declaring recovery:

- the Studio request UUID and matching Oracle job UUID;
- the fixed admission diagnostic showing `ADMITTED`;
- the dispatch diagnostic showing `CLAIMED` and the Oracle response status;
- Oracle terminal state `succeeded` and completed Blender/agent evidence;
- a successfully downloaded, structurally valid `model.glb` with byte length and
  SHA-256;
- successful loading of those exact bytes in the production 3D preview.

Use the same receipt for recovery. Do not automatically retry, create a second
paid job, reset credits, replenish provider funding, or treat a fixture as live
evidence.
