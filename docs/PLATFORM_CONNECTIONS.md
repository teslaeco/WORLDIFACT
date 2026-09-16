# Platform connections — 16 September 2026

The control centre is `/control`. It is the shared navigation and diagnostics foundation for the five primary worlds. Original applications and owner data remain intact. Paid WORLDIFACT generation and Oracle job writes remain disabled in automatic production releases.

## What is connected

| Component | Evidence | Remaining gate |
|---|---|---|
| Cloudflare | WORLDIFACT Worker deployment pipeline and runtime status endpoint are live | Physical browser/WebGL QA and later reviewed releases |
| OpenAI | Production release verified GPT-6 Astra model metadata and synchronized the Worker key | Paid WORLDIFACT generation remains disabled; no LIVE blueprint request in this continuation |
| Oracle | Existing VM was checked through its authenticated Quick Tunnel. `/v1/health` returned `ready=true`, provider `openai`, model `gpt-6-astra`, connector version 33 and character standard 20 | A cost-approved owner-only job pilot is separate from health verification |
| Chess | Original public host retained; GitHub source editor linked | Source edit/publish remains through its own repository |
| ISS / Terra | Copied, pinned application sources and assets | Source changes through WORLDIFACT; station saves remain local/manual |
| Planets | Original public FORGE World Builder connected | Owner identity, D1 worlds/assets, R2 and write-path migration remain on the original host |
| Shop | Original public shop connected | Current authorized source export and owner catalog/storage migration still unavailable |
| Studio | Original public Froge Studio connected; public repository confirmed | Public repo v18 is older than the live Oracle connector v33 and must not be treated as a safe replacement for the VM |

## One Oracle backend for five worlds

Production `/api/platform/oracle-worlds` performs one server-side authenticated `GET /v1/health` request and maps the sanitized result to the five primary WORLDIFACT world IDs:

- Chess Cube 512 AI
- Terra — Fix ISS
- 8 Planets in 8 Days
- Enchanted AI Shop
- AI Game Lab

The browser does not receive the Quick Tunnel URL or Oracle bearer credential. The health endpoint is rate-limited and cannot create a job, render a model or change the selected AI provider. `/control` shows the shared Oracle state and sanitized runtime metadata such as connector version, character standard, provider and model.

The owner-run VM check on 16 September 2026 returned `ready=true`, `provider=openai`, `model=gpt-6-astra`, `connectorVersion=33`, `characterStandard=20`. Owner Android evidence also shows all five `/control` world cards reporting the shared ready connector. This proves authenticated service readiness, **not** a successful Blender job and **not** a paid WORLDIFACT Astra generation.

## Production secrets

The GitHub **production** environment contains the existing server-side pairing inputs and the release workflow synchronizes them through stdin without printing values:

- `OWNER_ACCESS_TOKEN`: separate random owner code; not an OpenAI key or Cloudflare token.
- `ORACLE_ENDPOINT`: current HTTPS Quick Tunnel origin from the preserved VM.
- `ORACLE_API_TOKEN`: authenticated connector bearer credential from the preserved VM, not the pairing code.

Quick Tunnel addresses can change after restart, so a future managed tunnel remains a production-hardening task.

## Prepared Oracle write path — disabled by default

Review branch `feat/oracle-job-gate-20260916` adds `/api/oracle/jobs` without enabling it. Automatic release configuration requires `ENABLE_ORACLE_JOBS=false`.

The prepared path:

- accepts only the five exact WORLDIFACT world IDs;
- accepts a UUID and a 3–2000 character prompt;
- requires same-origin browser requests, `OWNER_ACCESS_TOKEN` and the deployed rate limiter;
- checks `/v1/health` before submission and requires `ready=true`, provider `openai`, model `gpt-6-astra`, connector version at least 33;
- submits only `{id, prompt}` to the verified `/v1/jobs` connector contract;
- permits owner-only polling of `/v1/jobs/<id>` with sanitized output;
- does not expose the Oracle endpoint or bearer credential;
- does not support image-to-Oracle yet. That capability is explicitly `BLOCKED_UNVERIFIED` because the public v18 connector contract only proves prompt jobs and the running v33 source is not in git.

A prepared API path is not LIVE evidence. With `ENABLE_ORACLE_JOBS=false`, it cannot start a Blender/OpenAI job.

## Next integration work

1. Require exact-head CI for PR #12 and keep it unmerged until explicit owner approval.
2. Keep `ENABLE_ORACLE_JOBS=false` and `ENABLE_PAID_GENERATION=false` in automatic releases.
3. Before a paid pilot, re-check the running v33 job contract directly on Oracle and choose one world, starting with AI Game Lab.
4. Only after explicit cost authorization, define a strict request ceiling and expiry, enable the owner-only job gate for one controlled request, and capture its result/evidence.
5. Keep WORLDIFACT blueprint generation and Oracle/Blender model generation as separate proven stages: prompt/image → Astra structured blueprint/spec → visible scene change; then, if requested, prompt-based Oracle/Blender model generation. Do not claim image-to-3D on Oracle until that input contract is verified.
6. Preserve the live VM runtime. Do not reinstall it from the older public Froge v18 snapshot.

No additional Oracle VM, database or storage bucket was provisioned by this write-gate branch. No paid generation, render, provider switch, order or supplier action is executed while the gate remains false.
