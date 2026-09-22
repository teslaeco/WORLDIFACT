# WORLDIFACT — Stripe and GitHub configuration

Approved offer: **USD 29.99 monthly / 1,500 credits**, with subscription-only SLOW downloads. The optional one-time top-up uses the same **USD 29.99 / 1,500 credits** and does not activate membership. Every generation costs 50 credits.

## 1. Merchant account and server key

Open [Stripe API keys](https://dashboard.stripe.com/apikeys) in the intended WORLDIFACT account and live mode. For the current server integration, use the account secret key (`sk_live_...`), named `WORLDIFACT production`; the displayed publishable `pk_live_...` key is not used by the server. Keep the full value in the secure destination below. Never put it in source files, chat, issue comments or screenshots. Restricted `rk_...` and organization keys are not currently accepted by the backend; do not substitute one silently.

The supplied Stripe dashboard screenshot shows **Multiple capabilities paused → View task**. Resolve the tasks listed by Stripe before promising real payments or payouts; the screenshot does not identify the missing requirements and does not prove charges are enabled.

## 2. GitHub destination

Open [WORLDIFACT environments](https://github.com/teslaeco/WORLDIFACT/settings/environments), select the existing **production** environment, then **Environment secrets → Add environment secret**. Enter the name exactly and paste the complete value into Secret/Value.

| GitHub secret Name | Secret/Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Full live account secret key starting `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret starting `whsec_` for the exact live endpoint below |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | `price_...` for USD 29.99 recurring every month |
| `STRIPE_TOPUP_PRICE_ID` | `price_...` for USD 29.99 one-time |

Price IDs are not private credentials but are stored alongside the deployment inputs for a simple consistent setup. Use Price IDs, not `prod_...` Product IDs. Keep all four resources in the same Stripe account and live environment. Test keys/prices belong to a separate sandbox deployment.

## 3. Products and prices

In [Stripe Product catalog](https://dashboard.stripe.com/products), create flat-rate/per-unit products with quantity one:

| Field | Membership | Credit top-up |
| --- | --- | --- |
| Name | `WORLDIFACT Membership — 1500 credits` | `WORLDIFACT Top-up — 1500 credits` |
| Amount | `29.99` | `29.99` |
| Currency | `USD` | `USD` |
| Pricing type | `Recurring` | `One time` |
| Billing period | `Monthly` / every 1 month | None |
| Included credits | 1,500 each paid month | 1,500 once per paid purchase |

Copy each saved `price_...` ID into the matching GitHub secret. No free trial, introductory discount, variable quantity, proration upgrade or metered usage is supported by this fixed offer. The current implementation expects the charged total to equal the displayed offer; additional tax/discount configurations need a separate reviewed change rather than silently changing the amount.

## 4. Webhook

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

Reveal the endpoint's **Signing secret**, then save its `whsec_...` value as `STRIPE_WEBHOOK_SECRET`. This secret is different from the API key. The route remains unavailable until the reviewed PR is deployed and billing is explicitly activated; creation of the destination alone is not a successful webhook test.

## 5. Release behavior

PR #63 adds `scripts/connect-billing.ts` to the existing production deployment workflow. At the next authorized deployment, complete payment credential groups are passed to Wrangler secret bulk through stdin, with child output suppressed and no values in command arguments. Missing groups preserve existing Worker secrets; partial groups fail before uploading anything. Production modes, monthly interval and public origin are supplied by the script. It does not set `ENABLE_BILLING` or `ENABLE_PAYPAL_BILLING`, create charges, create products, change payouts or retrieve stored GitHub secret values.

For PayPal, the optional full group is `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`, from the same live REST app and merchant. These are separate from the earlier public HostedButtons snippet. See `ACCOUNT_BILLING_SETUP.md` for endpoint/events and sandbox acceptance.

Configure the Revolut bank destination in the payment provider's payout dashboard. Do not put account numbers in GitHub secrets for this integration: the application does not use them. Enable Google Pay in Stripe's payment-method settings and verify availability on an eligible device during acceptance.

Saving secrets is preparation, not deployment or activation. Resolve Stripe's paused capabilities, complete isolated sandbox acceptance and obtain the owner's deployment approval before accepting real payments.

Sources: [Stripe keys](https://docs.stripe.com/keys), [Stripe products/prices](https://docs.stripe.com/products-prices/manage-prices), [Stripe webhooks](https://docs.stripe.com/webhooks), [GitHub environment secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-an-environment).
