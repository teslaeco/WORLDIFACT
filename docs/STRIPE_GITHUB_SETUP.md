# WORLDIFACT — Stripe and GitHub configuration

Approved offer: **USD 29.99 monthly / 1,500 credits**, with subscription-only SLOW downloads. The optional one-time top-up uses the same **USD 29.99 / 1,500 credits** and does not activate membership. Every generation costs 50 credits.

## 1. Merchant account and server key

Open [Stripe API keys](https://dashboard.stripe.com/apikeys) in the intended WORLDIFACT account and live mode. For the current server integration, use the account secret key (`sk_live_...`), named `WORLDIFACT production`; the displayed publishable `pk_live_...` key is not used by the server. Keep the full value in the secure destination below. Never put it in source files, chat, issue comments or screenshots. Restricted `rk_...` and organization keys are not currently accepted by the backend; do not substitute one silently.

The owner later reported completed identity verification and supplied a screenshot showing payments and payouts active. The setup script independently checks the live account through the API before creating resources; a saved key alone does not prove its permissions or account readiness.

## 2. Automated setup from the existing key

The owner has already saved `STRIPE_SECRET_KEY` in the [production environment](https://github.com/teslaeco/WORLDIFACT/settings/environments/21955502130/edit). Its value is neither retrieved nor printed. No publishable key is required for hosted Checkout.

1. Set the **environment variable** `STRIPE_CONFIG_SOURCE` to `cloudflare` in that same environment. This is a public configuration selector, not a secret. Keep the existing Stripe and Cloudflare credentials unchanged.
2. From main, run **Prepare Stripe prices and webhook** with confirmation `SETUP`. It uses the existing key inside GitHub Actions to validate the live account, prepare both USD 29.99 offers and the exact account webhook below, then write all four Stripe values directly to Cloudflare using captured stdin.
3. Normal deployments preserve those Cloudflare Stripe values. The GitHub primary key is reserved for setup; no companion Stripe secrets should be added in this mode. PayPal remains an independent optional complete group.

The setup does not enable checkout, charge a customer, change a payout destination or alter existing Stripe resources. It never prints API responses or signing secrets. Stable product IDs, price lookup keys, account metadata and idempotency keys protect against duplicate setup. Existing resources must exactly match the reviewed offer. An existing webhook without a supplied signing secret is recoverable automatically only when this setup created it less than 23 hours earlier; older or foreign endpoints require operator review. Do not schedule this preparation workflow or rerun it after successful configuration merely to check readiness.

A failed Cloudflare write can be retried with the identical setup within 23 hours. After that, copy the existing endpoint signing secret from Stripe directly to the production environment secret `STRIPE_SETUP_WEBHOOK_SECRET`, then rerun setup. This setup-only recovery value does not conflict with the Cloudflare-managed deployment mode; remove it after successful recovery. Never create another endpoint to recover its secret. Routine primary-key rotation also needs an explicit coordinated update; normal deployment will not silently replace the Cloudflare primary key.

## 3. Alternative: manually managed GitHub configuration

If using the manual route, set `STRIPE_CONFIG_SOURCE` to `github` (the default). Open [WORLDIFACT environments](https://github.com/teslaeco/WORLDIFACT/settings/environments), select the existing **production** environment, then **Environment secrets → Add environment secret**. Enter the name exactly and paste the complete value into Secret/Value.

| GitHub secret Name | Secret/Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Full live account secret key starting `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret starting `whsec_` for the exact live endpoint below |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | `price_...` for USD 29.99 recurring every month |
| `STRIPE_TOPUP_PRICE_ID` | `price_...` for USD 29.99 one-time |

Price IDs are not private credentials but are stored alongside the deployment inputs for a simple consistent setup. Use Price IDs, not `prod_...` Product IDs. Keep all four resources in the same Stripe account and live environment. Test keys/prices belong to a separate sandbox deployment.

## 4. Products and prices

In [Stripe Product catalog](https://dashboard.stripe.com/products), create flat-rate/per-unit products with quantity one:

| Field | Membership | Credit top-up |
| --- | --- | --- |
| Name | `WORLDIFACT Membership — 1500 credits` | `WORLDIFACT Top-up — 1500 credits` |
| Amount | `29.99` | `29.99` |
| Currency | `USD` | `USD` |
| Pricing type | `Recurring` | `One time` |
| Billing period | `Monthly` / every 1 month | None |
| Included credits | 1,500 each paid month | 1,500 once per paid purchase |

For the manual route, copy each saved `price_...` ID into the matching GitHub secret. Automated setup saves those IDs directly in Cloudflare. No free trial, introductory discount, variable quantity, proration upgrade or metered usage is supported by this fixed offer. The current implementation expects the charged total to equal the displayed offer; additional tax/discount configurations need a separate reviewed change rather than silently changing the amount.

## 5. Webhook

Open [Stripe Webhooks](https://dashboard.stripe.com/webhooks) and create an HTTPS webhook destination for **Your account**, snapshot events. Name it `WORLDIFACT billing` and use:

```text
https://worldifact.xodobrox.workers.dev/api/billing/webhook
```

The server API version is pinned to `2024-06-20`; configure matching snapshot endpoint version where available. Subscribe to the implemented events:

```text
invoice.paid
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
charge.refunded
charge.dispute.created
charge.dispute.updated
```

For the manual route, reveal the endpoint's **Signing secret**, then save its `whsec_...` value as `STRIPE_WEBHOOK_SECRET`. Automated setup receives it once in the create response and sends it directly to Cloudflare. This secret is different from the API key. The route remains unavailable until the reviewed PR is deployed and billing is explicitly activated; creation of the destination alone is not a successful webhook test.

## 6. Release behavior

PR #63 adds `scripts/connect-billing.ts` to the existing production deployment workflow. At the next authorized deployment, complete payment credential groups are passed to Wrangler secret bulk through stdin, with child output suppressed and no values in command arguments. In default `github` mode, missing groups preserve existing Worker secrets and partial groups fail before uploading anything. Explicit `cloudflare` mode preserves Stripe settings even when the setup key is present; conflicting companion GitHub secrets fail before writes. Production modes, monthly interval and public origin are supplied by the script. It does not set `ENABLE_BILLING` or `ENABLE_PAYPAL_BILLING`, create charges, create products, change payouts or retrieve stored GitHub secret values.

For PayPal, the optional full group is `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`, from the same live REST app and merchant. These are separate from the earlier public HostedButtons snippet. See `ACCOUNT_BILLING_SETUP.md` for endpoint/events and sandbox acceptance.

Configure the Revolut bank destination in the payment provider's payout dashboard. Do not put account numbers in GitHub secrets for this integration: the application does not use them. Enable Google Pay in Stripe's payment-method settings and verify availability on an eligible device during acceptance.

Saving secrets is preparation, not checkout activation or proof of payment settlement. Complete isolated sandbox acceptance before accepting real payments. The owner already authorized this configuration, merge and deployment; this preparation does not itself authorize a charge or enable billing.

Sources: [Create prices](https://docs.stripe.com/api/prices/create), [Create webhook endpoints](https://docs.stripe.com/api/webhook_endpoints/create), [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Stripe keys](https://docs.stripe.com/keys), [Stripe products/prices](https://docs.stripe.com/products-prices/manage-prices), [Stripe webhooks](https://docs.stripe.com/webhooks), [GitHub environment secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-an-environment).
