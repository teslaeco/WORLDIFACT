# WORLDIFACT release automation — 15 September 2026

The owner asked to resume the last conversation and automate deployment and OpenAI setup. This later instruction supersedes the earlier manual-only publication plan. It does not authorize unrestricted paid generation, orders, supplier messages or contest submission.

## Verified deployed baseline

- Public DEMO: https://worldifact.xodobrox.workers.dev
- Source: `2304d4717f77e220bf8145d39a5905b9698a0a60` (merged redirect fix, PR #3).
- Successful owner-started release: https://github.com/teslaeco/WORLDIFACT/actions/runs/34956564451
- Cloudflare version: `8fc7aa65-eb6e-482b-9de7-e62e49101f13`.
- Completed at 2026-09-15T10:12:00Z. The job passed 41 tests, lint, TypeScript, local HTTP, build and Worker packaging. Its real public smoke passed five HTML routes, eleven matching JavaScript/CSS assets, API 404, DEMO generation and cross-origin rejection.
- These are HTTP/code checks, not browser, physical Android or real Astra generation evidence.

## New release behavior

Every push or merge to `main` starts `.github/workflows/cloudflare.yml`. It reruns the complete verification and packaging before deploying. PR branches never receive production secrets or deploy. The existing production environment and any required reviewers remain in effect. Manual `workflow_dispatch` with `DEPLOY` remains available for republishing without changing code. Runs are serialized in the existing production concurrency group.

`scripts/connect-openai.mjs` checks the reviewed DEMO configuration. If `OPENAI_API_KEY` is absent, it reports **BLOCKED**, adds a warning and lets DEMO publication continue. If present, it makes one fixed GET request to the official Astra model metadata endpoint, rejects redirects, and synchronizes the key into the existing WORLDIFACT Worker using Wrangler secret bulk through stdin. An optional separate `GENERATION_ACCESS_TOKEN` is synchronized only when supplied. No secret is placed in command arguments, frontend variables, files or reports. Provider and Wrangler error payloads are suppressed.

A successful key/model-access check is **CONFIGURED**, not LIVE. The pipeline sends no Responses API generation request. Checked-in paid generation remains false, the global request ceiling remains zero and expiry remains empty. A key alone cannot activate billing. Changes to these defaults cause this automatic DEMO pipeline to fail closed; a paid pilot requires a separately reviewed release.

Seven additional local tests cover missing secrets/no network, cost gates, input redaction, a fixed read-only model endpoint, rejection of bad provider results, secure subprocess transfer and truthful result status. The full repository check and the actual deployment of this change are recorded by GitHub Actions; local isolated tests are not substituted for them.

## Remaining action and limitations

Store `OPENAI_API_KEY` using the secure GitHub `production` environment secret form, not a chat or repository file. The existing `Production` environment is the same case-insensitive environment. Adding a secret does not itself trigger GitHub Actions: a later main update or the existing manual DEPLOY control runs synchronization. Do not create another Cloudflare token or account ID merely to add OpenAI.

The proposed two-request text-only pilot (up to 4,000 output tokens per request) still needs an explicit spending authorization, short UTC expiry and preview access code. A request cap is not a monetary billing meter. No paid pilot was executed by this change.

Desktop and physical Android gameplay QA, approved current source models, production mesh qualification, rights/contact confirmation and final contest media/submission remain separate incomplete work. The recovered Queen and ISS are not certified print-ready. Earlier failure-only/public-URL-missing notes describe the first failed run and are superseded by the verified baseline above.
