# Account allowances and billing

Status: the owner approved **USD 30.00 / 1,500 credits**. One-time credit packs, cards/eligible Google Pay via Stripe and PayPal Orders are implemented; live payments remain BLOCKED until merchant configuration and end-to-end sandbox acceptance. The owner subsequently approved the separate subscription at **USD 29.99 per month / 1,500 credits**. The existing one-time pack remains USD 30.00. No real payment, provider-account mutation or payout configuration was performed during implementation.

## Identity and quotas

The existing Cube Chess Supabase UUID is the identity key. `AccountEntitlements` stores only allowances, model ownership and payment ledger entries; it is not another user/password database. Each account has a separate Durable Object. Transactional reservations and terminal settlements prevent concurrent requests or retries from exceeding quotas or charging twice.

| Account operation | Implemented rule |
| --- | --- |
| Free FAST | Two reservations in a rolling 24-hour window; successful models may be downloaded |
| Free SLOW | One reservation per UTC calendar day; model downloads require a currently active paid subscription |
| Subscription payment | 1,500 credits for each verified initial or renewal invoice for the configured subscription price |
| Credit generation | 50 credits per reservation, for FAST or SLOW; 1,500 / 50 = 30 models |
| Active subscription with no credits | Generation is blocked until more credits are purchased |
| One-time credit pack / top-up | USD 30.00 for 1,500 credits; any signed-in account may buy; does not activate subscription-only SLOW downloads |
| Remaining credits after subscription expiry | Credits remain usable; SLOW downloads remain locked until the subscription is active again |
| Explicit failed generation | One idempotent refund of its credits or free quota |
| Uncertain provider acceptance | Preserve the reservation and job ID; never refund or automatically start a second job |
| Terminal successful job | Immutable settlement; cannot later be refunded by a replayed failed status |

Free SLOW must not receive GLB, FBX, BLEND, PBR ZIP, a direct Oracle artifact URL or a signed raw-model download URL. A WebGL model viewer necessarily sends the model to the browser, so hiding its Download button is insufficient. Until a server-rendered preview endpoint is available, the free SLOW result stays download-locked and the UI explains this limitation. Existing global generation enablement, budget, expiry, rate limits and owner gates remain independent and still apply.

Legacy generation receipts created before account ownership was introduced do not prove ownership by the newly signed-in account. They must not be silently attached to whichever account presents them. Recovery/migration of those historical jobs needs an explicit verified ownership flow; existing browser-held copies are not retroactively made private by these server checks.

## Server routes

| Route | Behavior |
| --- | --- |
| `GET /api/account/entitlements` | Verified account only; balance, active subscription and free quota/reset times |
| `GET /api/billing/status` | Public Stripe configuration state and owner-approved fixed pack; readiness is not proof of live payment or payout setup |
| `POST /api/billing/checkout` | Same-origin, verified account, rate-limited; body `{ "kind": "subscription" }` or `{ "kind": "topup" }` |
| `POST /api/billing/portal` | Same-origin, verified account; creates a hosted customer billing-portal session |
| `POST /api/billing/webhook` | Raw signed Stripe event; no browser session is used as payment evidence |

Checkout responses contain only a validated hosted Stripe URL and test/live mode. Returning to `/account/credits?billing=processing` never grants credits. Only a signed webhook and a freshly retrieved paid Stripe object can update the ledger.

## Configuration

| Worker configuration | Required value |
| --- | --- |
| `ACCOUNT_ENTITLEMENTS` | Durable Object binding to exported `AccountEntitlements`; add a migration for this new class |
| `ENFORCE_ACCOUNT_ENTITLEMENTS` | `true` to enforce account quotas and model ownership |
| `ENABLE_BILLING` | `true` only after the configured offer and payment flow are accepted; keep `false` otherwise |
| `STRIPE_MODE` | `test` first; `live` only for an approved production offer |
| `STRIPE_SECRET_KEY` | Server secret matching the selected mode; never a frontend/VITE variable |
| `STRIPE_WEBHOOK_SECRET` | Server `whsec_...` secret from the exact endpoint |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | Recurring USD 29.99 monthly per-unit Price; quantity one |
| `STRIPE_SUBSCRIPTION_INTERVAL` | `month`, matched to Price interval count one; other values block recurring checkout |
| `STRIPE_TOPUP_PRICE_ID` | One-time per-unit Price, exactly USD 30.00, quantity one |
| `STRIPE_PREVIOUS_TOPUP_PRICE_IDS` | Optional comma-separated allowlist of at most 10 previous Price IDs for historical settlement/refunds; never used for new checkout |
| `STRIPE_TOPUP_CREDITS` | Legacy ignored setting; server always grants exactly `1500` |
| `BILLING_PUBLIC_ORIGIN` | Exact public HTTPS origin, without a trailing slash or path |
| `ACCOUNT_LIMITER` | Account/billing request limiter; existing `GENERATION_LIMITER` is an allowed fallback |

The Stripe Price is fetched and validated before Checkout. The approved pack is USD 30.00 / 1,500 credits. The owner approved a USD 29.99 monthly membership with 1,500 credits each paid period; subscription checkout still requires complete provider configuration. Current implementation supports one fixed subscription product, not prorated upgrades, quantity changes or free trials. Configure the Stripe customer portal accordingly.

When rotating the one-time Price, retain its old ID in `STRIPE_PREVIOUS_TOPUP_PRICE_IDS` for as long as historical events/refunds may arrive. Settlement re-fetches that exact allowlisted Price and verifies the same fixed pack; archived Prices remain valid for already-issued payments but cannot create new checkout. Do not rotate the recurring Price or subscription interval without a separately reviewed migration; historical recurring subscriptions currently depend on that configuration.

Stripe requests pin API version `2024-06-20`. Configure snapshot webhook events on the same version:

- `invoice.paid`
- `customer.subscription.created`, `.updated`, `.deleted`
- `checkout.session.completed`, `.async_payment_succeeded`, `.expired`
- `charge.refunded`
- `charge.dispute.created`, `.updated`

The signature is verified over the original body with Web Crypto HMAC, accepting valid rotating `v1` signatures and a five-minute timestamp tolerance. Retrieved Stripe objects must match the configured test/live mode and the server-linked customer UUID. Recurring grants use invoice IDs and top-ups use PaymentIntent IDs, so different events for the same payment cannot credit twice. A subscription event can reconcile its latest verified paid invoice if `invoice.paid` has not arrived yet.

Before a new subscription Checkout is created, Stripe's customer subscriptions are checked for any nonterminal status, including `incomplete` and `past_due`. Concurrent clicks share a persisted idempotency key. Open Checkout URLs retain Stripe's actual expiry; a verified top-up completion clears only its own attempt so another purchase is possible.

## Reversals and operation

The conservative implemented reversal policy removes the entire associated credit grant when its charge is refunded, partially refunded or disputed. Repeated reversal deliveries do nothing. A reversal arriving before its purchase event leaves a permanent tombstone so the delayed event cannot re-grant. If the credits were already spent, the balance may become negative and generation/download access requires billing review. Refunding the current subscription invoice disables SLOW downloads; refunding an older invoice does not disable a newer paid subscription period. Won disputes and partial-refund adjustments require operator reconciliation; automatic credit restoration is not implemented. This policy must be reviewed with the offer before live billing is enabled.

Terminal cancellations cannot be reactivated by delayed nonterminal events for the same subscription. A currently revoked payment cannot be reactivated by a duplicate paid-invoice event. Global generation attempts are not refunded: this customer-credit refund ledger is separate from the existing operator cost ceiling.

Local tests cover concurrent free and paid reservations, exact 30-model balance, UTC/24-hour resets, persistence, ownership, download checks, one-time refunds, reversed-before-paid events, signature tampering and expiry, billing fail-closed configuration, customer/price checks, invoice delivery order, checkout races and duplicate-subscription prevention. They use controlled provider responses and are not live payment evidence.

References: [Stripe webhook signatures and delivery](https://docs.stripe.com/webhooks), [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create), [invoice object](https://docs.stripe.com/api/invoices/object), [pinned API version](https://docs.stripe.com/changelog/2024-06-20).

## Cards, Google Pay and Revolut payouts

The app redirects to Stripe-hosted Checkout. Card data and Google Pay wallet credentials never pass through WORLDIFACT. Enable Google Pay in the merchant's Stripe payment-method settings. Checkout presents it only when the device, wallet, country and account are eligible; a WORLDIFACT Google Pay entry opens that checkout rather than claiming a guaranteed wallet authorization.

Stripe documents Revolut as a supported bank-account type, subject to merchant country, currency and account eligibility. Configure the chosen payout account in **Stripe Dashboard → Payout settings**. Match its settlement currency to the selected account details. This task has not chosen, added, verified or switched a payout destination, and a code deployment cannot do that. Likewise, PayPal receipts settle to the PayPal merchant account; configure its bank withdrawal separately.

The owner's banking screenshots and account numbers are not copied into this project. There is no custom IBAN database to encrypt or decrypt. Provider secrets belong in encrypted Worker secret storage and authorized provider dashboards, not source or browser storage. The public PayPal button ID and public SDK client ID are not bank credentials. No claim of absolute secrecy or encryption of previously sent chat attachments is made.

Direct Revolut Merchant payments would require an approved Merchant account and Revolut Business API configuration; bank account details alone do not establish that capability. The existing Stripe integration avoids building a second card-processing implementation.

Sources checked: [Google Pay on Stripe Checkout](https://docs.stripe.com/google-pay?platform=web), [Stripe payout setup and account types](https://docs.stripe.com/payouts), [Revolut Merchant prerequisites](https://developer.revolut.com/docs/guides/merchant/get-started).

## PayPal automatic credit fulfillment

The supplied reusable HostedButtons offer is USD 30.00 (`N4DCJJHHW747S`). It is preserved as an operator reference in `CODEX_TASK_PAYMENTS_20260922.md`, but is not rendered as an active purchase option: no documented secure account binding for that static snippet was verified. Its public SDK client ID is not a REST API secret. The implementation instead creates a per-account PayPal Order on the server.

| Route | Behavior |
| --- | --- |
| `GET /api/billing/paypal/status` | Public readiness/mode; static hosted button explicitly unavailable |
| `POST /api/billing/paypal/order` | Verified account, same origin and rate limit; fixed USD 30.00 / 1,500-credit Order and approved PayPal redirect |
| `POST /api/billing/paypal/capture` | Body `{ "orderId": "..." }`; checks ownership before provider access and verifies provider settlement before credit |
| `POST /api/billing/paypal/webhook` | PayPal-verified webhook and reread order/capture; no browser assertion is payment evidence |

Required server settings: `ENABLE_PAYPAL_BILLING=true`, `PAYPAL_MODE=sandbox` initially (or reviewed `live`), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`, exact `BILLING_PUBLIC_ORIGIN`, enforced account ledger and limiter. Configure these for one matching environment and merchant. Keep live billing off until accepted sandbox results and production authorization.

Per-account order reservations persist through retries and restarts. Historical order ownership remains after completion. A foreign order cannot be captured by presenting its ID. Credits use the namespaced capture key `pp_<capture ID>` across capture and webhook processing; replays cannot grant twice. Exact merchant, amount, USD currency and account binding are checked on provider data. Digital credit Orders request no shipping address. One-time packs never activate a recurring subscription.

`ACCOUNT_LEDGER_MODE=sandbox` is required for Stripe test and PayPal sandbox; those records use a separate `account:sandbox:v1:<uid>` Durable Object namespace. Live mode requires `ACCOUNT_LEDGER_MODE=live` (or the historical live default) and retains `account:v1:<uid>`. Switching provider credentials cannot migrate test credits, customer IDs or orders into the live wallet. Use a separate test deployment with paid AI/Oracle generation disabled; the sandbox ledger is for acceptance testing only.

Refund/reversal handling is conservative: revoke the entire associated grant, including a partial refund, and preserve reversed-before-paid tombstones. A disputed payment can set a persistent billing-review hold even if the remaining balance is nonnegative; new generation/downloads are blocked pending operator review. Automatic restoration after a won dispute is not implemented. Interrupted or uncertain orders require provider reconciliation, not blind recreation after an idempotency window.

For deployment, register the implemented event set listed in `server/paypal.ts`, including order approval, completed/pending/denied/refunded/reversed captures and customer dispute events. Configure the webhook at `/api/billing/paypal/webhook`. The provider's webhook verification API, not a browser return parameter or screenshot, establishes event authenticity.

Remaining acceptance: merchant credentials and payout verification, complete sandbox create/approve/capture → balance flow, duplicate delivery/refund checks using provider test events, real browser/mobile wallet visibility, and resolution of the merchant capability tasks shown in Stripe. Local mocked tests are not live-payment evidence.

Sources checked: [PayPal integration choices](https://docs.paypal.ai/payments/choose-integration-option), [Payment Links schema](https://developer.paypal.com/api/payment-links-buttons/v1/payment-resources-post), [Orders v2](https://developer.paypal.com/docs/api/orders/v2/), [Webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/).
