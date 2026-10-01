# CODEX TASK — repair stuck Studio recovery without duplicate generation

Date: 2026-10-01
Scope: WORLDIFACT production Studio/AI Shop recovery.

## Incident evidence

Android production UI shows a signed Astra/Blender Studio job stuck at 92+ minutes with the server error:

`This model belongs to a different account or has no account receipt.`

The current client treats this exact HTTP403 as a transient polling failure. It stops polling after four failures but leaves the receipt selected as non-terminal, so the elapsed timer continues indefinitely and the generation button remains locked. The user must never be told to buy a duplicate 250-point attempt to clear this state.

## Required repair

1. Preserve security. Account-scoped receipts remain HMAC-bound to the verified account UUID. Never accept a receipt signed for another account.
2. For a valid account-bound receipt whose entitlement Durable Object has lost only the job row, query Oracle for that exact UUID instead of returning an immediate ownership 403.
3. Never create a new Oracle job, new entitlement reservation, point debit, refund, subscription grant or payment transaction during recovery.
4. If Oracle has no matching UUID after the existing 3-minute reconciliation window, return a terminal failed recovery record with no financial mutation.
5. If Oracle has the UUID, return its real state with `reconciliationRequired=true`. Stop the browser elapsed timer.
6. If that exact Oracle job succeeded, allow the same signed account to retrieve the existing artifact only when the current account still has an active subscription and no billing review. Do not create ledger ownership silently.
7. Failed/cancelled orphan-ledger jobs remain billing-review cases; do not invent refunds.
8. Maintain existing normal-owned job settlement/download rules unchanged.
9. The client must convert the legacy exact ownership HTTP403 into a same-job reconciliation state during rollout. It must never POST another generation.
10. A succeeded reconciled job should load the exact existing GLB with GET only.

## Regression requirements

- stolen/cross-account receipt remains 401 and cannot inspect or download;
- exact signed orphan receipt can read exact Oracle status;
- succeeded orphan can GET the existing model under current subscription rules;
- missing Oracle + missing ledger terminates after reconciliation window without point changes;
- legacy 403 stops endless timer;
- no recovery test emits a generation POST;
- existing double-click/idempotency/refund tests stay green;
- full `npm run verify`, foundations and `npm run deploy:check` must pass.

## Release rule

Merge and production-deploy only from an exact green head. After deployment, run read-only/status smoke only. No paid Astra test is authorized by this repair itself.
