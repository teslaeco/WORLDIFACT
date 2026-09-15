# Cloudflare: automated DEMO releases and secure OpenAI setup

## Verified public baseline

WORLDIFACT was successfully deployed at https://worldifact.xodobrox.workers.dev by [run 34956564451](https://github.com/teslaeco/WORLDIFACT/actions/runs/34956564451), completed on 15 September 2026 at 10:12 UTC. Source: `2304d4717f77e220bf8145d39a5905b9698a0a60`; Cloudflare version: `8fc7aa65-eb6e-482b-9de7-e62e49101f13`. The actual job passed 41 tests, build/packaging and public checks of five HTML routes, eleven JS/CSS assets, DEMO generation, API 404 and origin rejection. This supersedes the earlier first-run redirect failure; it does not establish browser/Android or LIVE generation quality.

The owner subsequently requested automated deployment and OpenAI setup. `.github/workflows/cloudflare.yml` now starts on `main` pushes/merges, verifies the source before deployment, and retains manual `workflow_dispatch` with `DEPLOY`. This later request supersedes the historical manual-only instructions. Production environment approval rules and serialized releases remain in effect. No new scheduled ChatGPT automation is created.

## Existing Cloudflare connection

The GitHub `production` environment already supplies `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The existing name `Production` is valid because environment names are case-insensitive. These inputs were used in the successful release; do not recreate them merely to connect OpenAI. Secret values have not been read or exported.

Restrict the token to the intended account with Workers Scripts Write/Edit and Account Settings Read. This configuration uses a Worker, Static Assets, a rate binding and a SQLite Durable Object; no zone routes, KV, R2, Pages or Containers are configured. A deployment success does not audit the complete token scope, expiry or account billing plan. Do not use a global API key.

No Android plugin, SSH deploy key or public variable is required for this deployment path. Never paste secrets into chat, issues, commits, URLs or `VITE_` variables.

## Secure optional OpenAI connection

Put `OPENAI_API_KEY` into the GitHub `production` environment using its secure secret form. The pipeline will:

1. Verify the checked-in DEMO gates: approved Astra model, paid generation false, zero request ceiling and empty expiry.
2. Report **BLOCKED** and continue DEMO publication if the API key is absent. It will not falsely mark the integration connected.
3. If a key is supplied, issue one fixed GET to `https://api.openai.com/v1/models/gpt-6-astra`, refusing redirects. This checks model access, not generation or billed usage.
4. Synchronize the key into the existing WORLDIFACT Worker using `wrangler secret bulk` through stdin. An optional separate `GENERATION_ACCESS_TOKEN` is copied only when supplied. Neither key is printed, placed in argv, persisted in a source file or sent to the browser.
5. Deploy the verified source and check the exact published HTML/assets and DEMO API. A successful provisioning result is **CONFIGURED**, not LIVE.

Secret creation alone does not trigger a GitHub workflow. Synchronization occurs on the next main change or through the existing manual DEPLOY control. The GitHub connector cannot read secret values or dispatch a new workflow directly. Main publication is automatic because the owner explicitly requested automation, not as a way to bypass a denied operation.

Missing OpenAI credentials do not block the public DEMO. Invalid supplied credentials or failed synchronization stop the release with sanitized errors; inspect secure settings rather than pasting logs containing secrets. A missing input does not inspect or delete secrets that may already exist in the Worker.

## Paid Astra pilot remains separate

No paid generation is executed by CI or deployment. The proposed first pilot remains two text-only requests, at most 4,000 output tokens per request, with explicit spending approval and a short UTC expiry. It has not been executed by this change. An attempt ceiling is not a monetary billing meter.

The pilot needs a valid Worker API key, a separate random 32-256-character preview access code, `OPENAI_MODEL=gpt-6-astra`, a reviewed `GENERATION_REQUEST_LIMIT`, a specific `GENERATION_EXPIRES_AT`, and an explicit enable flag. Altering the paid defaults makes this automatic DEMO pipeline fail closed; activation requires a separately reviewed release path rather than silently changing the automatic workflow.

The persistent `GenerationBudget` counter reserves attempts before provider access and is not reset by deployments, UTC dates or failures. There is no public reset route. Health READY is configuration readiness only; LIVE requires a successful validated provider result. Disabling generation or reaching expiry blocks new calls, not provider requests already accepted.

For an approved manual test, `scripts/live-smoke.mjs` accepts exactly one request with `--confirm-paid` and the preview code in the process environment. Do not run it from CI or a deployment hook. Review actual provider usage before a second attempt. Local and production budgets are independent.

## Remaining quality gates

Run `docs/DEVICE_QA.md` on desktop and physical Android. Do not bypass recorded browser or supplier security challenges. Final operator contact, asset rights, genuine screenshots/video, a verified live launch form and contest submission remain separate tasks. Manufacturing requires model and supplier engineering approval; no order is authorized by a code release.

References: [Workers commands and secret bulk](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [Worker static assets](https://developers.cloudflare.com/workers/static-assets/), [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [Astra model](https://developers.openai.com/api/docs/models/gpt-6-astra), [Astra model guide](https://developers.openai.com/api/docs/guides/latest-model).
