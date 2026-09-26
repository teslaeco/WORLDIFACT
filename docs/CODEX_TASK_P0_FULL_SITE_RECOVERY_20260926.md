# Codex Task — WORLDIFACT full production recovery audit

Date: 2026-09-26
Repository: `teslaeco/WORLDIFACT`

## Command

Audit the current production site and every routed page from the current `main`. Do not stop at a report: repair the generation lifecycle, add regressions, deploy after green exact-head CI, and run one bounded real Oracle generation/export proof.

1. Treat the customer's current failure as P0. Preserve existing models, receipts, account balances, payments and Oracle state. Never clear databases, reset balances, rotate secrets, cancel unrelated jobs, or automatically submit a replacement paid job after uncertain transport.
2. Audit all React deep links and copied app routes. Production release smoke must cover `/`, `/world`, login/account/reset/credits, control/privacy/terms, all five direct portal routes, all five `/portal/:id` routes, `/terra`, `/chess/shop`, `/builder`, `/make`, and `/lab`.
3. Audit read-only production contracts: `/api/health`, `/api/platform`, `/api/platform/oracle-worlds`, `/api/studio/status`, account entitlement auth guard, and Studio prepare auth guard. In LIVE mode require Oracle connector v33+, post-hoc exports revision >=2, legacy GLB recovery revision >=1, and account-enabled Studio READY.
4. Fix the generation deadlock: Oracle HTTP 409 on a NEW job means explicit upstream rejection/busy, not uncertain acceptance. Refund/release the customer reservation immediately, return a clear 409, and keep the draft editable. Same-ID idempotency remains unchanged.
5. Repair legacy stuck receipts. Add a same-origin, signed-account `POST /api/studio/jobs/:id/reconcile-missing` route. It may settle failed only after the receipt is older than the recovery window and Oracle itself returns 404 for that exact job. It must never create, cancel or replace a model. The Shop should self-heal such a receipt and re-enable generation.
6. Preserve uncertain acceptance behavior for transport errors/5xx: never refund or resubmit automatically unless Oracle later confirms the exact job is absent via the reconciliation route.
7. Preserve completed-model downloads. GLB remains read-only; missing PBR/FBX/BLEND may use the reviewed no-AI post-hoc prepare path only. Do not change the base GLB.
8. Add focused tests for account credit/free-quota refund on explicit 409, same-job idempotency, missing-job reconciliation, Shop self-heal, every production route, LIVE Oracle/export capability and no unauthenticated generation.
9. Add one one-time production smoke marker/workflow. After a successful WORLDIFACT deployment, use server-side production Oracle secrets to create or resume ONE deterministic minimal test job. Retry POST only after an explicit Oracle busy 409 that proves no job was accepted. Poll only that same job ID. Verify actual GLB + PBR ZIP + FBX + BLEND bytes and hashes. Never log credentials and never create a second test job ID.
10. Run all repository verification. Merge only with exact-head green checks. Production deploy must remain LIVE and the release smoke must pass. Record the evidence in `docs/CONTEST_STATUS.md`.

Acceptance: generation no longer gets trapped by an Oracle-busy 409; legacy missing receipts recover without duplicate generation; all routed pages pass production smoke; one real bounded Oracle test job succeeds and all four output formats validate; no unrelated job/payment/order/manufacturing action is performed.
