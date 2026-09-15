# Platform connections — 16 September 2026

The control centre is `/control`. It is a navigation and connection-diagnostics foundation, **not yet a unified five-application editor**. Original applications and owner data remain intact. Paid WORLDIFACT generation remains disabled.

## What is connected

| Component | Evidence | Remaining gate |
|---|---|---|
| Cloudflare | WORLDIFACT Worker deployment pipeline and runtime status endpoint | Merge/deploy the reviewed Oracle bridge after owner approval |
| OpenAI | Existing WORLDIFACT release verified model metadata and synchronized the Worker key | Paid WORLDIFACT generation remains disabled; no LIVE blueprint request in this continuation |
| Oracle | Existing VM was checked through its authenticated Quick Tunnel. `/v1/health` returned `ready=true`, provider `openai`, model `gpt-6-astra`, connector version 33 and character standard 20 | Store current endpoint/token in GitHub production secrets, deploy reviewed bridge, then verify from WORLDIFACT production |
| Chess | Original public host retained; GitHub source editor linked | Source edit/publish remains through its own repository |
| ISS / Terra | Copied, pinned application sources and assets | Source changes through WORLDIFACT; station saves remain local/manual |
| Planets | Original public FORGE World Builder connected | Owner identity, D1 worlds/assets, R2 and write-path migration remain on the original host |
| Shop | Original public shop connected | Current authorized source export and owner catalog/storage migration still unavailable |
| Studio | Original public Froge Studio connected; public repository confirmed | Public repo v18 is older than the live Oracle connector v33 and must not be treated as a safe replacement for the VM |

## One Oracle backend for five worlds

Review branch `feat/oracle-five-world-bridge` adds `/api/platform/oracle-worlds`. It performs one server-side authenticated `GET /v1/health` request and maps the sanitized result to the five primary WORLDIFACT world IDs:

- Chess Cube 512 AI
- Terra — Fix ISS
- 8 Planets in 8 Days
- Enchanted AI Shop
- AI Game Lab

The browser does not receive the Quick Tunnel URL or Oracle bearer credential. The endpoint is rate-limited and cannot create a job, render a model or change the selected AI provider. `/control` shows the shared Oracle state and sanitized runtime metadata such as connector version, character standard, provider and model.

The live read-only VM check on 16 September 2026 returned `ready=true`, `provider=openai`, `model=gpt-6-astra`, `connectorVersion=33`, `characterStandard=20`. This proves authenticated service readiness, **not** a successful Blender job and **not** a paid WORLDIFACT Astra generation.

## Configure production secrets

Use the existing GitHub **production** environment. The release workflow synchronizes these optional secrets through stdin and never prints their values:

- `OWNER_ACCESS_TOKEN`: a separate random owner code, 32–256 letters, digits, `_` or `-`. Do not reuse an OpenAI key, Cloudflare token or the paid-generation access code.
- `ORACLE_ENDPOINT`: the current HTTPS Quick Tunnel origin from the preserved VM.
- `ORACLE_API_TOKEN`: the current authenticated connector bearer credential from the preserved VM. It is not the pairing code.

The live values have been verified on the VM but are not committed to git. Quick Tunnel addresses can change after restart, so a future managed tunnel remains a production-hardening task.

## Next integration work

1. Store `OWNER_ACCESS_TOKEN`, `ORACLE_ENDPOINT` and `ORACLE_API_TOKEN` in the GitHub `production` environment without exposing them in chat or source.
2. Require exact-head CI for PR #11 to pass after the latest sanitized runtime-metadata changes.
3. Show GO/NO-GO and obtain explicit owner approval before merge/deploy.
4. After deployment, verify `/api/platform/oracle-worlds` and `/control` from production. This is still read-only evidence.
5. Add reviewed Oracle write paths world-by-world only after the health bridge is stable. Job creation, render polling, artifact retrieval and shared publishing require separate authorization, schemas, limits and rollback behavior.
6. Preserve the live VM runtime. Do not reinstall it from the older public Froge v18 snapshot; the active connector is now verified as v33 / character standard 20.

No additional Oracle VM, database or storage bucket was provisioned in this change. No paid generation, render, provider switch, order or supplier action was executed.
