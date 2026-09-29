# 30 September 2026 — invoice-return and seller-data follow-up (NOT DEPLOYED)

The owner confirmed successful Pro payment and activated membership on Android. Connected Stripe reads independently confirmed that the original invoice was paid. No new payment was made by the assistant.

A read-only probe in run 36640589041 confirmed that appending return_url to the hosted invoice link did not produce an HTTP redirect or an embedded return setting. This is not a browser-level proof, and no automatic hosted-invoice redirect is claimed. Normal Checkout and portal returns already land back in WORLDIFACT; hosted-invoice recovery is a separate flow.

Prepared a same-invoice Stripe Payment Element page: the server authenticates the account, validates the exact original invoice and original PaymentIntent, and provides only that customer's scoped client secret. Only an explicit user submission invokes Stripe.js confirmation. The app returns home after independently verified settlement for the matching invoice, preserving additive/idempotent credit grants. No new subscription or PaymentIntent is created by this feature. Card data remains in Stripe Elements. Tests are synthetic; real bank authorization is NOT tested here.

BLOCKED for activation: the public STRIPE_PUBLISHABLE_KEY has not been provided/configured, and the new UI is not deployed. Without that key the currently working hosted-invoice recovery remains unchanged. Merge and production deployment need owner approval. No model or generation configuration is changed.

Seller-data request: Tesla Eco Sebastian Laskowski; Polish NIP 5811866931; keep the existing address unchanged. Live reads found the existing public seller name Worldifact and no merchant tax IDs/default tax IDs. An attempted tool write preparing an automatic merchant-settings update was blocked by platform safeguards. It was not retried through another path; seller settings and finalized invoices remain UNCHANGED. This is not a completed seller-data correction. Configure the seller name and Polish NIP (pl_nip, not the customer's tax ID and not inferred EU VAT registration) in Stripe Dashboard, make the merchant ID default, then verify a subsequent invoice. Existing finalized invoice tax IDs cannot be silently changed. No corrected tax document or second invoice was issued.

Sources: https://docs.stripe.com/invoicing/hosted-invoice-page ; https://docs.stripe.com/js/payment_intents/confirm_payment ; https://docs.stripe.com/tax/invoicing/tax-ids ; https://docs.stripe.com/api/accounts/update?api-version=2024-06-20 .

---

# WORLDIFACT — current release evidence

Updated 30 September 2026 (Europe/Warsaw). Deployment timestamps below are UTC.

## VERIFIED — PR #148 is merged and deployed

The owner explicitly approved merging and deploying the direct plan-card payment correction. [PR #148](https://github.com/teslaeco/WORLDIFACT/pull/148) merged as `55dc790b87b1838c2e62d29c4e2f155064b43e67`; the reviewed head was `ad67160c240f0331c6e0c2ba4b1576d1dc87c180`. All five exact-head PR workflows passed before merge.

The [production run 36637922934](https://github.com/teslaeco/WORLDIFACT/actions/runs/36637922934) completed successfully at 2026-09-29T22:11:40Z. Its deploy job `109643019010` published Cloudflare version `0aa29e6c-4e69-4623-a81b-4f5400f71f14` from the merged code revision.

Public application: https://worldifact.xodobrox.workers.dev

Subscription page: https://worldifact.xodobrox.workers.dev/account/credits

This documentation-only update does not publish a second runtime version. The deployed application revision remains `55dc790b87b1838c2e62d29c4e2f155064b43e67`.

## VERIFIED — scoped payment behavior

- Existing Creator/Pro/Studio cards, keyboard activation and purchase buttons share the authenticated `/api/billing/plan-payment` resolver. The matching failed purchase resumes its verified Stripe-hosted invoice rather than creating a duplicate subscription.
- A different fully unpaid pending upgrade can open explicit Stripe confirmation for the selected target on the same subscription only after server checks of ownership, item, amount and the already-paid base period. The application does not itself pay, void or cancel an invoice or subscription. Partial, ambiguous or different first-purchase/renewal invoices are not silently replaced or sent to the wrong plan.
- New Checkout is opened only when no outstanding subscription was found, using the existing reservation and idempotency rules. The currently paid plan opens billing management, not another subscription.
- The pricing grid, prices and credit rates are preserved. Payment methods and billing, including Change card and Retry payment, are below the offers. A cached browser Back return releases the stale UI opening lock and refreshes state without replaying payment.
- Confirmed invoice grants are additive and idempotent. Synthetic regressions explicitly passed for an existing balance of 605: Pro adds 4,500 for 5,105; Studio adds 7,500 for 8,105. Repeated refreshes do not repeat the grant. These are test balances, not a statement of a customer's current balance or successful purchase.

## VERIFIED — release checks, not a paid customer checkout

The production job passed `npm run verify`: 571 tests passed, zero failed or skipped; TypeScript, build and local HTTP smoke passed. The 14 new payment/UI regressions are included. Existing lint warnings remain (27 warnings, zero errors). npm reported three dependency advisories (two moderate, one high); this narrow release does not claim to resolve them and made no forced dependency update.

Before deployment, isolated LIVE Stripe Checkout sessions for Creator (USD 29.99), Pro (USD 99.99) and Studio (USD 149.99) were successfully created and immediately expired without payment. No customer card was charged and no subscription purchase was completed by these probes.

The post-deployment smoke passed at 2026-09-29T22:11:36Z: 16 HTML routes, 52 matching hub assets, 105 original application entries/assets, API 404, explicit no-cost DEMO generation and origin rejection. Deployed billing status confirmed LIVE mode, the expected Pro/Studio prices and checkout readiness. Login, origin and webhook-signature guards also passed.

## UNKNOWN / unchanged limitations

A complete paid customer purchase, customer bank authentication and physical Android interaction were not executed by the assistant. A prior connected Stripe check accepted creation of a Studio confirmation session while a Pro update was pending, but that was session-creation evidence only. Final payment remains a customer action in Stripe; successful settlement is not inferred from opening a page or returning to WORLDIFACT.

This release did not run paid AI generation or change generation budgets. The previously enabled bounded direct blueprint path remains separate from the detailed Oracle/Blender path. Deployment preserved `ENABLE_ASTRA_PLANS=true`, `ENABLE_PAID_GENERATION=true`, `PUBLIC_PILOT=true`, `ENABLE_ORACLE_JOBS=false` and `ENABLE_STUDIO_JOBS=false`. The read-only service probe reported the detailed Studio path disabled; no new live model/export capability is claimed by this billing release.

## Historical ledger — preserved in full

The entire previous status ledger is preserved byte-for-byte in [CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md](CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md), using original Git blob `d81f0f4e33567f9ecacb5da72d9d2f9f13bac8e0`. It contains earlier milestones, licenses/attribution notes, contest evidence and prior generation/deployment limitations. Its pre-merge statements that PR #148 awaits owner approval or is not deployed are superseded by this verified release record. Other historical findings are not silently reverified by this update.

Release decision: **GO — owner-approved PR #148 published; CI and deployment smoke passed. Customer payment confirmation remains unverified and under customer control.**
