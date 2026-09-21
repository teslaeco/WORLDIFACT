# Account allowances and billing

Status: implementation and local tests verified; live payments are BLOCKED until the owner supplies prices, billing period and payment configuration. No paid provider calls or payment-provider mutations were made while implementing this change.

## Identity and quotas

The existing Cube Chess Supabase UUID is the identity key. `AccountEntitlements` stores only allowances, model ownership and payment ledger entries; it is not another user/password database. Each account has a separate Durable Object. Transactional reservations and terminal settlements prevent concurrent requests or retries from exceeding quotas or charging twice.

| Account operation | Implemented rule |
| --- | --- |
| Free FAST | Two reservations in a rolling 24-hour window; successful models may be downloaded |
| Free SLOW | One reservation per UTC calendar day; model downloads require a currently active paid subscription |
| Subscription payment | 1,500 credits for each verified initial or renewal invoice for the configured subscription price |
| Credit generation | 50 credits per reservation, for FAST or SLOW; 1,500 / 50 = 30 models |
| Active subscription with no credits | Generation is blocked until more credits are purchased |
| Credit top-up | Configured fixed price and credit amount; checkout requires an active subscription |
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
| `GET /api/billing/status` | Public configuration status; never claims a price, payment or subscription is verified |
| `POST /api/billing/checkout` | Same-origin, verified account, rate-limited; body `{ "kind": "subscription" }` or `{ "kind": "topup" }` |
| `POST /api/billing/portal` | Same-origin, verified account; creates a hosted customer billing-portal session |
| `POST /api/billing/webhook` | Raw signed Stripe event; no browser session is used as payment evidence |

Checkout responses contain only a validated hosted Stripe URL and test/live mode. Returning to `/account?billing=processing` never grants credits. Only a signed webhook and a freshly retrieved paid Stripe object can update the ledger.

## Configuration

| Worker configuration | Required value |
| --- | --- |
| `ACCOUNT_ENTITLEMENTS` | Durable Object binding to exported `AccountEntitlements`; add a migration for this new class |
| `ENFORCE_ACCOUNT_ENTITLEMENTS` | `true` to enforce account quotas and model ownership |
| `ENABLE_BILLING` | `true` only after the configured offer and payment flow are accepted; keep `false` otherwise |
| `STRIPE_MODE` | `test` first; `live` only for an approved production offer |
| `STRIPE_SECRET_KEY` | Server secret matching the selected mode; never a frontend/VITE variable |
| `STRIPE_WEBHOOK_SECRET` | Server `whsec_...` secret from the exact endpoint |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | Owner-selected recurring per-unit price; quantity one; monthly or annual period |
| `STRIPE_TOPUP_PRICE_ID` | Owner-selected one-time per-unit price; quantity one |
| `STRIPE_TOPUP_CREDITS` | Explicit credit amount, a multiple of 50 between 50 and 1,000,000 |
| `BILLING_PUBLIC_ORIGIN` | Exact public HTTPS origin, without a trailing slash or path |
| `ACCOUNT_LIMITER` | Account/billing request limiter; existing `GENERATION_LIMITER` is an allowed fallback |

No subscription price, currency, recurring interval or top-up price was invented. The Stripe price is fetched and validated before opening Checkout. The offered 1,500-credit grant applies once per configured paid billing period; the owner still needs to choose the period. Current implementation supports one fixed subscription product, not prorated upgrades, quantity changes or free trials. Configure the Stripe customer portal accordingly.

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
