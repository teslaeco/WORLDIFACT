# Cloudflare release preparation

This project targets **Cloudflare Workers with Static Assets**. The Worker owns `/api/*`; missing application routes use the SPA fallback in `wrangler.jsonc`. Do not add the blanket `/* /index.html 200` rule: Cloudflare rejected it as an infinite redirect loop (error 100324) in the first deployment, [run 34954004953](https://github.com/teslaeco/WORLDIFACT/actions/runs/34954004953). The earlier statement that this file had already been removed was incorrect. This follow-up deletes `public/_redirects`; the existing native SPA configuration handles application routes while preserving actual asset files.

1. Review the replacement branch based on current `main`. Main’s product vision is preserved in `PROJECT_VISION.md`; old PR #1 remains a conflicted draft and must not be merged.
2. The owner requested continuation of planned release tasks after entering both deployment secrets. Require the verification workflow to pass on the exact reviewed commit.
3. Use the configured GitHub `Production` environment; names are case-insensitive. Add required reviewers if desired. The screenshot shows none configured; the main-only manual workflow and its confirmation are still present.
4. Set environment secrets `CLOUDFLARE_API_TOKEN` with only the needed Worker/account permissions and `CLOUDFLARE_ACCOUNT_ID`. Never put tokens in repository variables or frontend env files.
5. After release approval and merge, run the manual Cloudflare workflow from `main` with confirmation `DEPLOY`. No automatic push deployment is configured.
6. The workflow's release check records the actual HTTPS URL/version and verifies exact HTML, all JS/CSS assets, `/api/health`, DEMO JSON and origin rejection. Archive, GLB export, rendering and mobile controls still require device QA. Read CLOUDFLARE_SETUP.md for the launch controls and error interpretation.

## Optional paid generation — separate activation

Keep `ENABLE_PAID_GENERATION=false` until the owner approves costs. Store the provider key as a Worker secret named `OPENAI_API_KEY`. The expected model is `gpt-6-astra`; the frontend never receives the key. `.dev.vars.example` documents local variable names; `.dev.vars` is ignored.

The configured limiter permits three requests per minute per client IP. The morning release adds a separate persistent global reserved-attempt ceiling, mandatory access code and expiry; see `CLOUDFLARE_SETUP.md`. Cloudflare rate limiting is approximate and local to its network locations; this is **not a global monetary budget**. The pilot is intentionally access-limited. The operator must still approve the request ceiling, expiry and budget before activation. Turning the enable flag off is the immediate app-level stop control.

Verify one owner-approved real generation, a timeout/error, invalid input and a limited request. Record response mode, model, timestamp, generated scene hash and measured usage/cost without logging secrets or user images. No such paid test has been performed in this shift.

## Evidence and limits

Wrangler 4.131.2 is pinned. The local deployment dry-run packages the Worker. This does not validate account permissions, domains, billing, production routing or a live deployment. Check `CONTEST_STATUS.md` for the exact PR/CI evidence. Local packaging does not prove remote CI or deployment.

Official references: [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [asset redirects](https://developers.cloudflare.com/workers/static-assets/redirects/), [rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
