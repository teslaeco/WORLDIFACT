# Executed Codex brief — WORLDIFACT payments

## Owner request

Add a USD 30 offer for 1,500 credits (50 credits per generation, 30 generations), repeatable top-ups, PayPal, cards and Google Pay. Protect the supplied Revolut banking information. Reuse the shared Chess account and credit ledger from PR #63.

## Implementation scope

1. Keep the owner-approved price exact: USD 30.00, 1,500 points, one-time pack. Do not invent a subscription period or auto-renewal agreement.
2. Extend Stripe-hosted Checkout for cards and eligible Google Pay wallets. Verify the fixed Price, total, currency, quantity, customer, test/live mode and payment status before fulfillment. Allow standalone packs; retain the existing active-subscription requirement for SLOW downloads and disclose it before purchase.
3. Add server-created PayPal Orders v2 with an authenticated account-to-order binding, exact amount/currency/merchant validation, idempotent capture, signed webhook verification, duplicate-delivery protection and conservative refund/dispute handling.
4. Keep keys in Worker secrets. Do not copy bank account numbers or bank screenshots into source, bundles, logs, documentation or git history. Configure payout destinations inside the operator's dashboard.
5. Preserve the supplied HostedButtons reference, but do not enable a reusable static payment button that cannot reliably attribute a purchase to the signed-in WORLDIFACT account.
6. Keep payment methods unavailable until their complete operator configuration exists. A return URL, screenshot or client-side callback is never evidence of payment.
7. Test ledger/provider boundaries with stubs and run repository verification gates. Document remaining live setup, sandbox and device checks honestly. Update PR #63 without merging or publishing production.

## Supplied public PayPal reference

- Hosted button: `N4DCJJHHW747S`.
- Screenshot offer: USD 30.00, fixed quantity one, one-time purchase.
- Public HostedButtons SDK client ID: `BAAheXKwF6PqRT4zyTLH8idQkj9y5let9nFuF8gHe7F27sZgGgl-pcvc4UMxZXgoZxKDPEmRTgSJfQchBY`.
- These identifiers are public button configuration, not a REST client secret, payout mandate or verified backend identity.
- The static button remains disabled. The implemented automatic-credit flow uses the merchant's REST app and verified server-side Orders instead. No unsupported `custom_id` override for HostedButtons is invented.
- The screenshot has shipping-address collection enabled. Digital credit Orders request no shipping; the old dashboard button has not been modified.

## Unresolved commercial choices

- The owner has not selected a recurring billing interval. Monthly or annual auto-renewal is not silently enabled.
- Buying a credit pack alone does not activate subscription-only SLOW downloads. The page states this before payment; this restriction remains from the owner's original account rules.
- No competitor-price parity claim is made: USD 30 is the owner's chosen price, not a market-research conclusion.

See `ACCOUNT_BILLING_SETUP.md` and the current first section of `CONTEST_STATUS.md` for configuration and measured results.
