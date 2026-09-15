# Cloudflare release preparation

This branch targets **Cloudflare Workers with Static Assets**. The Worker owns `/api/*`; missing application routes use the SPA fallback in `wrangler.jsonc`. The old blanket Pages `_redirects` rule was removed so asset files are not rewritten to HTML.

1. Review the replacement branch based on current `main`. Main’s product vision is preserved in `PROJECT_VISION.md`; old PR #1 remains a conflicted draft and must not be merged.
2. The morning go-ahead authorizes publishing the review branch and draft PR. Require the verification workflow to pass on the exact reviewed commit.
3. Configure a GitHub `production` environment with required reviewers if available. The workflow's text input alone is not an approval policy.
4. Set environment secrets `CLOUDFLARE_API_TOKEN` with only the needed Worker/account permissions and `CLOUDFLARE_ACCOUNT_ID`. Never put tokens in repository variables or frontend env files.
5. After release approval and merge, run the manual Cloudflare workflow from `main` with confirmation `DEPLOY`. No automatic push deployment is configured.
6. Record the actual public HTTPS URL and deployed commit. Verify home, direct portal refresh, assets, `/api/health`, DEMO scenes, archive, GLB export and mobile controls without authentication.

## Optional paid generation — separate activation

Keep `ENABLE_PAID_GENERATION=false` until the owner approves costs. Store the provider key as a Worker secret named `OPENAI_API_KEY`. The expected model is `gpt-6-astra`; the frontend never receives the key. `.dev.vars.example` documents local variable names; `.dev.vars` is ignored.

The configured limiter permits three requests per minute per client IP. The morning release adds a separate persistent global reserved-attempt ceiling, mandatory access code and expiry; see `CLOUDFLARE_SETUP.md`. Cloudflare rate limiting is approximate and local to its network locations; this is **not a global monetary budget**. The pilot is intentionally access-limited. The operator must still approve the request ceiling, expiry and budget before activation. Turning the enable flag off is the immediate app-level stop control.

Verify one owner-approved real generation, a timeout/error, invalid input and a limited request. Record response mode, model, timestamp, generated scene hash and measured usage/cost without logging secrets or user images. No such paid test has been performed in this shift.

## Evidence and limits

Wrangler 4.131.2 is pinned. The local deployment dry-run packages the Worker. This does not validate account permissions, domains, billing, production routing or a live deployment. Check `CONTEST_STATUS.md` for the exact PR/CI evidence. Local packaging does not prove remote CI or deployment.

Official references: [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [asset redirects](https://developers.cloudflare.com/workers/static-assets/redirects/), [rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
