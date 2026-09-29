# 30 September 2026 — invoice-return and seller-data follow-up (NOT DEPLOYED)

## VERIFIED — existing Pro payment succeeded

The owner confirmed successful Pro payment and activated membership on Android. Connected Stripe reads independently confirmed that the original invoice was paid. No new payment was made by the assistant. This supersedes the earlier lack of customer-settlement evidence for the already deployed PR #148; it does not validate the new Payment Element flow below.

## VERIFIED — gated invoice-return code and synthetic tests

A read-only probe in [run 36640589041](https://github.com/teslaeco/WORLDIFACT/actions/runs/36640589041) confirmed that appending return_url to the hosted invoice link did not produce an HTTP redirect or an embedded return setting. This is not a browser-level proof, and no automatic hosted-invoice redirect is claimed. Normal Checkout and portal returns already have a WORLDIFACT return path; hosted-invoice recovery is a separate flow.

Prepared a same-invoice Stripe Payment Element page: the server authenticates the account, validates the exact original invoice and original PaymentIntent, and provides only that customer's scoped client secret. Only an explicit user submission invokes Stripe.js confirmation. The app returns home after independently verified settlement for the matching invoice, preserving additive/idempotent credit grants. No new subscription or PaymentIntent is created by this feature. Card data stays in Stripe Elements. Bounded read-only settlement polling handles delayed confirmation and stops on unmount. Sign-in preserves only the chosen plan and invoice reference; Stripe return secrets and arbitrary redirect targets are stripped by the return UI.

Initial preparation [run 36641084589](https://github.com/teslaeco/WORLDIFACT/actions/runs/36641084589) and hardening [run 36641557465](https://github.com/teslaeco/WORLDIFACT/actions/runs/36641557465) passed application verification and Worker packaging. The latter committed the tested runtime source as `2d99d6e472aa0602a80d4e512686e6826f7887f9`. Thirteen added regression tests cover original-intent ownership, subscription-parent changes, exact amount/mode, no duplicate provider writes, key-gated hosted fallback, additive grants, safe return destinations, sign-in continuation and bounded polling. Tests use synthetic Stripe/account responses. Real Stripe Elements rendering, browser/physical Android interaction and bank authorization for this NEW flow remain unverified. A green test run is not production activation.

## BLOCKED — activation and seller details

The public `STRIPE_PUBLISHABLE_KEY` has not been supplied/configured for the new form, and the new UI is NOT deployed. Without that key the currently working hosted-invoice recovery remains unchanged. Obtain the account's existing live publishable key (`pk_live_...`, not a secret API key), verify the integration and obtain owner approval before merge and production deployment. No pricing, model, generation budget or production setting was changed by this review branch.

Seller-data request: Tesla Eco Sebastian Laskowski; Polish NIP 5811866931; keep the existing address unchanged. Live reads found the existing public seller name Worldifact and no merchant tax IDs/default tax IDs. An attempted tool write preparing an automatic merchant-settings update was blocked by platform safeguards. It was not retried through another path; seller settings and finalized invoices remain UNCHANGED. This is not a completed seller-data correction.

The seller name and Polish NIP must be set in Stripe Dashboard: use the merchant/account tax ID, type `pl_nip`, and mark it as default. This is not the customer's tax ID and does not establish EU VAT registration. Keep the current address unchanged. Verify a subsequent invoice after saving. Account tax IDs cannot be added to an already finalized invoice simply by changing defaults. No corrected tax document, second invoice or refund was issued.

Official sources: https://docs.stripe.com/invoicing/hosted-invoice-page ; https://docs.stripe.com/js/payment_intents/confirm_payment ; https://docs.stripe.com/tax/invoicing/tax-ids ; https://docs.stripe.com/keys ; https://docs.stripe.com/api/accounts/update?api-version=2024-06-20 .

Decision: **GO for draft code review only. NO-GO for activation until publishable-key, provider/browser verification and owner approval gates are resolved. Seller settings still need direct Dashboard correction.**

---

# WORLDIFACT — PR #148 deployed release evidence

Updated 30 September 2026 (Europe/Warsaw). Deployment timestamps below are UTC. This section describes the earlier deployed revision, not the invoice-return draft above.

## VERIFIED — PR #148 is merged and deployed

The owner explicitly approved merging and deploying the direct plan-card payment correction. [PR #148](https://github.com/teslaeco/WORLDIFACT/pull/148) merged as `55dc790b87b1838c2e62d29c4e2f155064b43e67`; the reviewed head was `ad67160c240f0331c6e0c2ba4b1576d1dc87c180`. All five exact-head PR workflows passed before merge.

The [production run 36637922934](https://github.com/teslaeco/WORLDIFACT/actions/runs/36637922934) completed successfully at 2026-09-29T22:11:40Z. Its deploy job `109643019010` published Cloudflare version `0aa29e6c-4e69-4623-a81b-4f5400f71f14` from the merged code revision.

Public application: https://worldifact.xodobrox.workers.dev

Subscription page: https://worldifact.xodobrox.workers.dev/account/credits

The deployed application revision remains `55dc790b87b1838c2e62d29c4e2f155064b43e67`. The invoice-return draft and this documentation update do not publish another runtime version.

## VERIFIED — scoped PR #148 payment behavior

- Existing Creator/Pro/Studio cards, keyboard activation and purchase buttons share the authenticated `/api/billing/plan-payment` resolver. The matching failed purchase resumes its verified Stripe-hosted invoice rather than creating a duplicate subscription.
- A different fully unpaid pending upgrade can open explicit Stripe confirmation for the selected target on the same subscription only after server checks of ownership, item, amount and the already-paid base period. The application does not itself pay, void or cancel an invoice or subscription. Partial, ambiguous or different first-purchase/renewal invoices are not silently replaced or sent to the wrong plan.
- New Checkout is opened only when no outstanding subscription was found, using the existing reservation and idempotency rules. The currently paid plan opens billing management, not another subscription.
- The pricing grid, prices and credit rates are preserved. Payment methods and billing, including Change card and Retry payment, are below the offers. A cached browser Back return releases the stale UI opening lock and refreshes state without replaying payment.
- Confirmed invoice grants are additive and idempotent. Synthetic regressions explicitly passed for an existing balance of 605: Pro adds 4,500 for 5,105; Studio adds 7,500 for 8,105. Repeated refreshes do not repeat the grant. These are test balances, not a statement of a customer's current balance.

## VERIFIED — PR #148 release checks

The production job passed `npm run verify`: 571 tests passed, zero failed or skipped; TypeScript, build and local HTTP smoke passed. The 14 payment/UI regressions in PR #148 are included. Existing lint warnings remained (27 warnings, zero errors). npm reported three dependency advisories (two moderate, one high); the narrow release did not resolve them and made no forced dependency update.

Before deployment, isolated LIVE Stripe Checkout sessions for Creator (USD 29.99), Pro (USD 99.99) and Studio (USD 149.99) were successfully created and immediately expired without payment. No customer card was charged and no subscription purchase was completed by those probes.

The post-deployment smoke passed at 2026-09-29T22:11:36Z: 16 HTML routes, 52 matching hub assets, 105 original application entries/assets, API 404, explicit no-cost DEMO generation and origin rejection. Deployed billing status confirmed LIVE mode, the expected Pro/Studio prices and checkout readiness. Login, origin and webhook-signature guards also passed.

## Unchanged generation limitations

The release did not run paid AI generation or change generation budgets. The previously enabled bounded direct blueprint path remains separate from the detailed Oracle/Blender path. Deployment preserved `ENABLE_ASTRA_PLANS=true`, `ENABLE_PAID_GENERATION=true`, `PUBLIC_PILOT=true`, `ENABLE_ORACLE_JOBS=false` and `ENABLE_STUDIO_JOBS=false`. The read-only service probe reported the detailed Studio path disabled; no new live model/export capability is claimed by this billing release.

## Historical ledger — preserved in full

The full pre-PR #148 release ledger remains byte-for-byte in [CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md](CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md), original Git blob `d81f0f4e33567f9ecacb5da72d9d2f9f13bac8e0`. It contains earlier milestones, attribution notes, contest evidence and prior generation/deployment limitations. Its old pre-merge statements about PR #148 are superseded by this release record. Other historical findings are not silently reverified by this update.
