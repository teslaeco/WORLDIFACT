# WORLDIFACT generation recovery audit

Updated: 4 October 2026

## Status

**The compatibility repair is merged and deployed. Production generation with the requested drone prompt remains BLOCKED / NOT RUN.**

Audited main is `8a25c1bec57e93a4cdbcf6b1f9cfb09f9ca083dc`. Cloudflare run
[37212633617](https://github.com/teslaeco/WORLDIFACT/actions/runs/37212633617)
deployed version `9996de56-6626-4e9e-b1e1-0ae0e813cbae`. Its read-only
post-deployment checks confirmed Studio readiness and the legacy policy; they did
not submit a paid generation or verify a particular account's remaining funding.

This audit follows the detailed account-bound Astra Studio path. The separate
`/api/blueprint` route is a direct OpenAI request that creates a procedural
blueprint and local GAME GLB; it is not an Oracle/Blender mesh job. A successful
Blueprint response therefore cannot prove the detailed Oracle pipeline.

## Timeline and diagnosis

| Date / change | Evidence | Finding |
| --- | --- | --- |
| 28 September, original funded model allocation | `server/generationEconomics.ts`; `server/entitlements.ts` | The existing provider allocation funds Astra at 175 cents per 250 customer points (70% reserve). Customer points and provider funding are separate ledgers. |
| 30 September–1 October, last recorded real generation | Approved one-shot run [36815867329](https://github.com/teslaeco/WORLDIFACT/actions/runs/36815867329), source `a5c8266f7c4b5c3348d6913bd48e90d759917f0d`; recorded in `docs/CONTEST_STATUS.md` | An Astra/Oracle/Blender job produced a 15,281,768-byte GLB and a 26,457,988-byte BLEND. This is historical evidence, not proof of the current requested prompt or current production readiness. |
| 3 October, PR #195 | [PR #195](https://github.com/teslaeco/WORLDIFACT/pull/195), merge `12149bd6c55d8de95044a4c41e55ccf87fed47c6` | New detailed Studio tiers required 200 cents for 250 points or 400 cents for 500 points. No provider-pool top-up accompanied that higher minimum. |
| 3 October, PRs #199–#200 | Evidence recorded in `docs/CONTEST_STATUS.md` | Reconciliation and fenced dispatch repairs addressed recoverable pre-dispatch reservations. The reported account still showed `PROVIDER_BUDGET_EXHAUSTED`; customer points or a paid subscription do not establish unreserved provider funding. |
| 4 October, PR #205 | [PR #205](https://github.com/teslaeco/WORLDIFACT/pull/205), merge `a97c196bdb553cb57d5fc3dde20d9b47f90f59b5` | Restored the legacy 250-point / 175-cent policy for new detailed jobs, kept saved prices immutable, and refused incompatible tiered jobs without resetting account ledgers. This is the audited main baseline. |
| 4 October, PR #205 deployment | [Workflow run 37170989080](https://github.com/teslaeco/WORLDIFACT/actions/runs/37170989080), source `a97c196bdb553cb57d5fc3dde20d9b47f90f59b5` | The restored legacy policy was deployed. Account-specific funding remained unverified. |
| 4 October, PR #207 | [PR #207](https://github.com/teslaeco/WORLDIFACT/pull/207), draft at `6098ca13457eb6108adc87052937cff3c185c02c` | Its policy gate, redacted lifecycle diagnostics, and post-deploy assertions were incorporated into PR #208; PR #207 itself is not the deployed change. |
| 4 October, PR #208 and latest main deployment | [PR #208](https://github.com/teslaeco/WORLDIFACT/pull/208), merge `8a25c1bec57e93a4cdbcf6b1f9cfb09f9ca083dc`; [Cloudflare run 37212633617](https://github.com/teslaeco/WORLDIFACT/actions/runs/37212633617) | Version `9996de56-6626-4e9e-b1e1-0ae0e813cbae` deployed successfully. The workflow verified `/api/studio/status` as ready with `newJobPolicy=legacy-usd175-v1`, detailed readiness, cost/output guards, and four-view support; its checks made no paid generation request. This is not evidence of a successful new user job. |

### Root cause

The confirmed regression point is PR #195's new-job provider ceiling, not an
Oracle token or Blender dispatch failure. Standard detailed jobs required 200
cents while the established 250-point funding allocation contributed 175 cents;
extended jobs required 400 cents against a 350-cent allocation. An account with
less than the selected tier's ceiling was correctly refused during the account
provider-reservation transaction, before a global reservation, dispatch claim
or Oracle POST. Thus `PROVIDER_BUDGET_EXHAUSTED` identifies an admission refusal,
not evidence that Oracle or Blender ran and failed.

PR #205 restores the default legacy ceiling for new detailed work; PR #208 gates
the production release on that policy and adds redacted lifecycle evidence. These
changes do not replenish historical liabilities, top up any account, or make a
currently underfunded account admissible. The specific account balance and
whether it has eligible unused reservations remain unavailable to this audit. A
real refusal may still be correct if less than 175 cents remain.

### Affected components

- `src/lib/studioPricing.ts`, `src/lib/studioNewJobPolicy.ts`: versioned new-job terms and policy.
- `server/entitlements.ts`: atomic customer/provider reservations, dispatch fences, and exact-evidence reconciliation.
- `server/studio.ts`: signed preparation, account admission, shared budget, Oracle dispatch, same-job recovery, GLB validation and downloads.
- `server/platform.ts`, `server/worker.ts`: Worker routing, environment contract and the separate procedural Blueprint API.
- `scripts/build-live-generation-config.ts`, `scripts/restore-detailed-studio-config.mjs`, `.github/workflows/cloudflare.yml`: selected deployment configuration, secret synchronization and production checks.
- `src/lib/studioClient.ts`, `src/components/OracleModelPreview.tsx`: Studio browser transport and model preview.

## Request path and diagnostic boundaries

1. Shop/Character Studio selects **detailed Astra**, refreshes `/api/studio/status`,
   prepares a signed, account-bound receipt, then explicitly submits the input.
   `src/lib/studioClient.ts` carries the receipt and idempotency UUID; it does not
   send Oracle credentials to the browser.
2. `server/worker.ts` routes `/api/studio/*` to `server/studio.ts`. The API
   validates origin, account, receipt, canonical input and Oracle health/output
   policy before charging or dispatching.
3. `reserveUserGeneration` checks available points and provider budget atomically.
   If it returns `PROVIDER_BUDGET_EXHAUSTED`, no Oracle job is submitted. After
   admission, the shared generation budget is reserved and the account dispatch
   fence is claimed before `POST /v1/jobs`.
4. The Worker authenticates to the existing Oracle service using its endpoint
   and bearer token. The remote service/connector invokes the existing Astra,
   MCP and Blender job pipeline; its implementation and live VM state are not
   present in this repository checkout.
5. Studio polls the same Oracle UUID and retrieves its model/export only through
   the authenticated proxy. The server checks response bounds, GLB signature,
   structure and configured quality gate before exposing a saved preview.
   `OracleModelPreview` displays those returned bytes; preview is not production
   or manufacturing approval.

Studio diagnostics now record only a UUID, one of three fixed stages, an
allowlisted admission/result code, dispatch state, and numeric HTTP status.
Prompts, account identifiers, receipt tickets, response bodies and credentials
are excluded. A missing upstream response is logged as `NO_RESPONSE`, not
misreported as an Oracle HTTP failure. The production wrangler config has
observability disabled, so durable production log availability must be
confirmed through the existing Cloudflare operator console; tests only verify
the emitted structured events.

## Cloudflare and Oracle configuration audit

The workflow uses the GitHub Actions `production` environment. The current
successful deployment run establishes that the deployment workflow completed;
it does not make secret values available to this audit. Never print or copy
secret values from GitHub or Cloudflare.

| Name | Required location / use | Safe verification |
| --- | --- | --- |
| `ORACLE_ENDPOINT` | GitHub `production` secret; synchronized to the `worldifact` Worker by `scripts/connect-platform.ts`. Required for Oracle health, job, status and artifact proxy calls. | The LIVE release's authenticated read-only `GET /v1/health`, detailed runtime checks and `/api/studio/status`; verify only booleans/version and HTTP outcome. |
| `ORACLE_API_TOKEN` | GitHub `production` secret; synchronized to the Worker and sent only as a server-side bearer token. | Same authenticated health/status gate; never place in frontend variables, URLs or logs. |
| `OWNER_ACCESS_TOKEN` | GitHub `production` secret; synchronized to the Worker for owner access and signed Studio receipts. | Confirm `ownerChecks`/receipt readiness and authenticated status, without reading or echoing the value. |
| `OPENAI_API_KEY` | GitHub `production` secret; `scripts/connect-openai.ts` verifies model access and synchronizes it to the Worker. Used by the direct Blueprint provider path; the detailed Studio path calls Oracle. | Workflow step reports `CONFIGURED` only after fixed model GET and secret sync. This is not evidence of a generation or the Oracle VM's own provider configuration. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub `production` secret, used by deployment and Worker-secret synchronization; not a Worker runtime binding. | Existing `scripts/release-check.ts credentials` format check and successful targeted deployment. |
| `CLOUDFLARE_API_TOKEN` | Additional GitHub `production` secret required to deploy and synchronize Worker secrets; not one of the requested five names and not a Worker runtime binding. | Check the existing workflow's credential-format/deploy results; never reveal the value. |
| `GENERATION_ACCESS_TOKEN` | Optional GitHub `production` secret synchronized for the separate direct Blueprint API access gate. | Verify configuration state only; it is not needed by the signed detailed Studio receipt path. |

`wrangler.jsonc` declares the Worker entry point, `ASSETS`, `GENERATION_BUDGET`,
`ACCOUNT_ENTITLEMENTS`, and rate limits. Its checked-in base intentionally sets
paid generation and detailed Oracle jobs off. The LIVE workflow derives its
configuration from this base and enables only reviewed gates. The release
restoration now also requires `STUDIO_NEW_JOB_POLICY=legacy-usd175-v1`; the
post-deploy check asserts that exact policy and rejects `tiersReady=true`.

Secret presence/rotation, Cloudflare account binding values, Oracle VM token
configuration, MCP/Blender process health and durable log retention cannot be
independently queried from this local checkout. Use the existing authenticated
workflow and operator consoles; do not bypass an access-control or network
block.

## Repair status and validation

The demonstrated pricing mismatch was repaired in PR #205. PR #208 adds a
fail-closed production policy gate and fixed-schema, redacted Studio lifecycle
diagnostics. No additional production-code defect was reproduced in this audit,
so no further pricing, billing, authentication, or dispatch change is proposed.
Existing focused tests cover successful fixture dispatch, explicit DEMO without
a key, LIVE refusal when unavailable, provider errors, admission refusal before
Oracle POST, unchanged balances, and idempotent recovery.

Checks on the tree matching audited main `8a25c1bec57e93a4cdbcf6b1f9cfb09f9ca083dc`:

- `node --test tests/blueprint-provider-reservation.test.ts tests/studio-rollback-policy.test.ts tests/studio-api.test.ts tests/detailed-studio.test.ts`: 39 passed, 0 failed (inert fixtures; not live AI evidence).
- `npm test`: 1,079 passed, 1 failed. The retained `tests/iss-foundation.test.mjs` cannot import generated `public/apps/iss/vendor/examples/jsm/math/Octree.js`.
- `npm run lint`: passed with existing repository warnings. `npm run typecheck`: passed.
- `npm run test:http`: passed local health, DEMO Blueprint, and origin-rejection checks; no paid provider call.
- `npm run build` and `npm run verify` stop in `prebuild`/`preverify`: `prepare-iss-assets.mjs` cannot resolve `fix-iss-repair-game.terraformingplanet.chatgpt.site` (`ENOTFOUND`). No alternate asset or browser route was used.
- `npm run deploy:check` could not run because the blocked build left `dist` absent. No local deployment was attempted.
- GitHub CI run [37212633609](https://github.com/teslaeco/WORLDIFACT/actions/runs/37212633609) and Cloudflare publication run [37212633617](https://github.com/teslaeco/WORLDIFACT/actions/runs/37212633617) succeeded on main `8a25c1bec57e93a4cdbcf6b1f9cfb09f9ca083dc`. The published workflow checked the legacy policy and detailed readiness without making a paid generation request.

Focused tests use inert fixtures only. The real prompt
“Create a realistic sci-fi exploration drone with a metallic frame, transparent
green glass panels, detailed mechanical parts, realistic PBR materials and
optimized GLB export.” has **not** been submitted in this task. No new request
UUID, Oracle job ID, completion status or GLB checksum exists for it. The last
recorded generated artifact is historical evidence listed above, not proof of
this current prompt or a successful current preview.

## Unresolved blockers and next safe verification

1. The audit PR is draft #209. Its current CI check is `action_required` with no
   jobs, not a source-test result; exact-head CI must run after review.
2. From the authorized production account, verify that legacy detailed
   admission is allowed and that the current provider balance has at least 175
   unreserved cents. Do not replenish or reset any balance.
3. After release approval and explicit controlled-spend approval, submit the
   requested drone once through detailed Studio. Capture its request UUID,
   matching Oracle job ID, terminal status, GLB SHA-256, and a successful
   production preview of those exact bytes.
4. If the request stops, use the structured lifecycle event and existing same-
   receipt recovery. Never retry a paid request by creating another UUID.

Until these production checks are completed, the full requested real-generation
path is **NOT VERIFIED**.
