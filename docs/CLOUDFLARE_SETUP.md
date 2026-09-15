# Cloudflare: owner setup and controlled release

Implemented: Worker plus Static Assets, SPA routing, rate binding, SQLite Durable Object allowance, CI and a manual production workflow. The owner configured `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `Production` and manually started [release run 34954004953](https://github.com/teslaeco/WORLDIFACT/actions/runs/34954004953). Input checks passed and Cloudflare accepted 14 static assets. Worker publication then failed on the blanket `_redirects` rule with error 100324; public checks were skipped. This establishes access for the observed upload, not a complete deployment or an audit of all token permissions. The local Wrangler session remains unauthenticated. There is no verified public WORLDIFACT origin yet.

No Android plugin is needed for this deployment path. Use the GitHub website in a mobile browser to configure the repository; do not paste secrets into a chat, issue, commit or frontend variable.

## One-time owner setup

1. Use the intended Cloudflare account and confirm its plan/quotas before deploying. For this Worker and Static Assets configuration, restrict the token to the intended account with **Workers Scripts Write/Edit** and **Account Settings Read**. The current configuration has no zone routes, KV, R2, Pages or Containers. Do not use a global API key.
2. In GitHub repository Settings → Environments, use `production`. The existing `Production` name is valid because GitHub environment names are case-insensitive. Configure a required reviewer if desired. Store **environment secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; secret values belong in GitHub's secure form. The screenshot confirms both names are now present. No public variable or SSH deploy key is needed for this workflow.
3. Review the PR, green checks and the exact commit. Merge only after the owner approves. GitHub's `Publish approved Cloudflare release` workflow runs only from `main`, by manual dispatch with `DEPLOY`.
4. The first deployment remains DEMO. Its default vars disable paid generation, set the request ceiling to zero and leave the expiry empty. Do not create an unrestricted paid endpoint for the contest.
5. Record the real HTTPS URL, commit and Cloudflare deployment ID. Run `docs/DEVICE_QA.md` on that approved release. All pages should load without ChatGPT authentication.

## First deployment from GitHub

After the reviewed source is on `main`, open [Publish approved Cloudflare release](https://github.com/teslaeco/WORLDIFACT/actions/workflows/cloudflare.yml), select **Run workflow**, choose **main**, enter **DEPLOY** in `confirmation`, and select **Run workflow** again. The workflow must exist on the default branch for this control to be available.

For the first-run redirect failure, use a **new Run workflow on main after the fix is merged**. Re-running the old failed job uses its original commit and therefore repeats the invalid rule. The fix removes `public/_redirects` and relies on the native `assets.not_found_handling: single-page-application` setting already in `wrangler.jsonc`. No new token is required to address this configuration error. This connector exposes reads and failed-job retries, but no new-workflow dispatch; the owner uses the existing manual control. Do not replace this control with an automatic trigger or a browser fallback for the unavailable connector operation.

The workflow checks input presence and format without printing values. That check is not authentication evidence: Cloudflare checks the account and token during `wrangler deploy`. After a successful deployment, the workflow reads Wrangler's structured deployment result and automatically checks:

- the exact built HTML on the home page, privacy, terms and the Game Lab and MAKE deep links;
- every built JavaScript/CSS asset, including lazy chunks, for the correct content type and SHA-256 content;
- JSON health in DEMO mode, an unknown API route returning 404, valid DEMO generation and cross-origin rejection.

The release check never supplies an API key or access code and only submits `mode: demo`. A passing run adds the verified URL and Cloudflare version to the Actions summary. These HTTP checks do not run the browser or establish rendering, WebGL, input or physical Android quality. A failed post-deployment check does not undo the deployment; inspect the failed check before further changes. No real public HTTP pass is claimed until this workflow succeeds.

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

Setup references: [GitHub environment names and secrets](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [manual workflow execution](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [Wrangler deployment output](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/), [Worker upload permissions](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/).
