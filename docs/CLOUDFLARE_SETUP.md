# Cloudflare: owner setup and controlled release

Implemented: Worker plus Static Assets, SPA routing, rate binding, SQLite Durable Object allowance, CI and a manual production workflow. Not connected: the local Wrangler session is unauthenticated and the deployment token/account ID are absent. There is no verified public WORLDIFACT origin yet.

No Android plugin is needed for this deployment path. Use the GitHub website in a mobile browser to configure the repository; do not paste secrets into a chat, issue, commit or frontend variable.

## One-time owner setup

1. Authorize the intended Cloudflare account and confirm its plan/quotas before deploying. Create a token restricted to that account and the Worker deployment capabilities; include the required account-read and Worker/DO permissions indicated by the Cloudflare token template. Do not use a global API key.
2. In GitHub repository Settings → Environments, create `production`. Configure a required reviewer if the repository/account supports it. Add **environment secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; secret values should be entered in GitHub's secure form.
3. Review the PR, green checks and the exact commit. Merge only after the owner approves. GitHub's `Publish approved Cloudflare release` workflow runs only from `main`, by manual dispatch with `DEPLOY`.
4. The first deployment remains DEMO. Its default vars disable paid generation, set the request ceiling to zero and leave the expiry empty. Do not create an unrestricted paid endpoint for the contest.
5. Record the real HTTPS URL, commit and Cloudflare deployment ID. Run `docs/DEVICE_QA.md` on that approved release. All pages should load without ChatGPT authentication.

## Owner-approved Astra pilot

The proposed first test is **two text-only requests**, each capped at 4,000 output tokens, with a short expiry and an owner-approved API budget. It has not been authorized or executed. Read current pricing before activation; an attempt ceiling is not a monetary billing meter.

- Put `OPENAI_API_KEY` in the Worker secret store.
- Generate a separate random `GENERATION_ACCESS_TOKEN` of 32–256 characters and put it in the Worker secret store. This preview code may be shared with authorized testers; never share the provider API key.
- Set `OPENAI_MODEL=gpt-6-astra`, `GENERATION_REQUEST_LIMIT=2`, `GENERATION_EXPIRES_AT` to the specifically approved UTC expiry, and `ENABLE_PAID_GENERATION=true` only after approval.
- The single named `GenerationBudget` object records each reserved attempt before provider access. Its counter persists across clients, locations, UTC dates, restarts and deployments. Failures are not refunded and there is no public reset route. Increasing the ceiling is a new owner-controlled cost decision.
- Turning the enable flag off or allowing the expiry to pass stops new paid requests. A later deployment of the checked-in defaults also disables them. Provider calls already accepted may still be billed.
- The health response's `READY` means configuration readiness, not proof of a real generation. Only successful validated provider results are labelled LIVE.

For local testing use `.dev.vars` (ignored by git) and `npm run dev:worker`; do not run `dev:api` on the same port. The Node adapter only serves DEMO. Preserve Wrangler's local state for a local allowance across restarts. Local and production quota stores are independent and need separate approval/limits.

After approval, `scripts/live-smoke.mjs` can send exactly one request to the approved origin and save non-secret evidence. It requires a `--confirm-paid` argument and `GENERATION_ACCESS_TOKEN` in the process environment. Never run it from CI or a deployment hook. Review the usage dashboard for actual billed cost before any second request.

## What still needs an owner decision

- The intended Cloudflare account and its cost/plan conditions.
- The specific merge/deployment version.
- API spending permission and a secret configured through an approved secure path.
- The operator's private support/privacy contact.
- Public screenshots, live proof and final Product Hunt submission after the release gates pass.

References: [Worker static assets](https://developers.cloudflare.com/workers/static-assets/), [Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Astra model and pricing](https://developers.openai.com/api/docs/models/gpt-6-astra), [Astra Model Guide](https://developers.openai.com/api/docs/guides/latest-model).
