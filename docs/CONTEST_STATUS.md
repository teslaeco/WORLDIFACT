# 30 September 2026 — invoice return and verified public key (NOT DEPLOYED)

## VERIFIED — supplied public key belongs to the WORLDIFACT account

The owner added `STRIPE_PUBLISHABLE_KEY` to repository Actions secrets and supplied a screenshot of the saved secret. The actual value was verified inside GitHub Actions, not copied into the conversation or source code.

[Read-only verification run 36670085397](https://github.com/teslaeco/WORLDIFACT/actions/runs/36670085397) completed successfully. After seven synthetic verifier tests passed, job `109743077142` read the owner account, its already-paid Pro invoice and the original PaymentIntent using the existing backend key and supplied public key. It returned `PUBLISHABLE_KEY_VERIFIED_READ_ONLY`, `accountMatched=true`, `existingPaidIntentMatched=true`, `invoiceApiCompatible=true`, `paymentRequested=false`. This used only GET operations and the application's pinned invoice API version. No invoice, subscription, card, seller information or account balance was modified. Key values, scoped client secrets and private invoice URLs were not printed or committed.

The review branch contains `scripts/connect-stripe-publishable.ts`, seven synthetic tests and the read-only verification workflow. The module's optional synchronization function is NOT invoked by the review workflow. All five ordinary PR checks passed on `d5809cbabbf296caa2f99dcb8a016b4a1a6326dd`, including [Verify WORLDIFACT 36670089102](https://github.com/teslaeco/WORLDIFACT/actions/runs/36670089102). These results do not mean the key has been installed in Cloudflare or the new form deployed.

## BLOCKED — release wiring has not been written or executed

A subsequent tool call to create the release-wiring patch was blocked by platform safeguards. That rejected patch was not saved and was not retried through another action, workflow, browser or execution route. In particular, its proposed Cloudflare workflow changes, additional fallback UI and release checks are NOT present in the repository. Do not claim those rejected changes were implemented.

The existing production workflow still does not synchronize `STRIPE_PUBLISHABLE_KEY`. No synchronization, main-branch merge or production deployment was performed in this continuation. The invoice-return PR remains a draft. Explicit owner approval for the production step is still required, and the tool restriction must be resolved through permitted controls rather than bypassed. Actual Stripe Elements rendering, physical Android interaction and bank authorization for the new form remain unverified. Existing recorded browser restrictions were respected.

## VERIFIED — existing Pro payment succeeded

The owner previously confirmed successful Pro payment and activated membership on Android. Connected Stripe reads independently confirmed that the original invoice was paid. The current read-only key check used this already-settled payment; it did not pay again. This is evidence for the deployed PR #148 path, not proof of new Payment Element payment confirmation.

## VERIFIED — gated invoice-return code and synthetic tests

A read-only probe in [run 36640589041](https://github.com/teslaeco/WORLDIFACT/actions/runs/36640589041) found no HTTP redirect or embedded return setting after appending return_url to the hosted invoice link. This is not a browser-level proof, and no automatic hosted-invoice redirect is claimed. Normal Checkout and portal returns already have a WORLDIFACT return path; hosted-invoice recovery is separate.

The prepared first-party Stripe Payment Element page authenticates the account and validates the original invoice and original PaymentIntent before providing that customer's scoped client secret. Only an explicit customer submission invokes Stripe.js confirmation. The code returns home after server-verified settlement for the matching invoice, preserving additive/idempotent credit grants. It creates no new subscription or PaymentIntent. Bounded settlement polling handles delayed confirmation and stops on unmount. Sign-in preserves the chosen plan and invoice reference, not arbitrary return targets or Stripe return secrets.

Preparation [run 36641084589](https://github.com/teslaeco/WORLDIFACT/actions/runs/36641084589) and hardening [run 36641557465](https://github.com/teslaeco/WORLDIFACT/actions/runs/36641557465) passed verification and Worker packaging. The latter committed tested runtime source `2d99d6e472aa0602a80d4e512686e6826f7887f9`. Thirteen invoice-return regressions cover original-intent ownership, subscription-parent changes, amount/mode, no duplicate provider writes, missing-key hosted fallback, additive grants, safe destinations, sign-in and polling. Tests use synthetic provider responses, not a new real payment. The actual supplied public-key check above separately resolved the previous missing-key/account-match uncertainty.

## BLOCKED / unchanged — seller details

The owner requested Tesla Eco, NIP 5811866931, with the existing address retained. The last seller-settings read in the preceding continuation showed public seller name Worldifact and no merchant tax IDs/default tax IDs. An attempted merchant-settings write in that continuation was blocked and not retried. No seller-settings changes were attempted during the present public-key continuation. Any later manual Dashboard changes have not been reverified here.

Use the full registered seller name and the merchant/account Polish NIP, not the customer's tax ID or an inferred EU VAT registration. The previous attempt issued no corrected tax document, replacement invoice or refund. Changing account tax-ID defaults does not update already-finalized invoices.

Official implementation sources checked in this continuation: https://docs.stripe.com/api/payment_intents/retrieve ; https://docs.stripe.com/api/invoices/object?api-version=2024-06-20 . Earlier references: https://docs.stripe.com/invoicing/hosted-invoice-page ; https://docs.stripe.com/js/payment_intents/confirm_payment ; https://docs.stripe.com/tax/invoicing/tax-ids ; https://docs.stripe.com/keys .

Decision: **GO for supplied-key verification and code tests. NO-GO for claiming production activation: release wiring was blocked, no production synchronization/deployment occurred, and owner publication approval remains outstanding.**

---

# WORLDIFACT — PR #148 deployed release evidence

Deployment timestamps below are UTC. This section describes the earlier deployed revision, not the invoice-return draft above.

## VERIFIED — PR #148 is merged and deployed

The owner explicitly approved merging and deploying the direct plan-card payment correction. [PR #148](https://github.com/teslaeco/WORLDIFACT/pull/148) merged as `55dc790b87b1838c2e62d29c4e2f155064b43e67`; reviewed head `ad67160c240f0331c6e0c2ba4b1576d1dc87c180` passed all five PR workflows.

[Production run 36637922934](https://github.com/teslaeco/WORLDIFACT/actions/runs/36637922934) completed at 2026-09-29T22:11:40Z. Job `109643019010` published Cloudflare version `0aa29e6c-4e69-4623-a81b-4f5400f71f14` from the merged revision.

Application: https://worldifact.xodobrox.workers.dev
Subscription page: https://worldifact.xodobrox.workers.dev/account/credits

The last verified deployed application revision remains `55dc790b87b1838c2e62d29c4e2f155064b43e67`. This review branch and documentation do not publish another version.

## VERIFIED — scoped PR #148 behavior and checks

Existing plan cards, keyboard activation and buttons share the authenticated plan-payment resolver. A matching failed purchase resumes its verified invoice rather than creating a duplicate subscription. A different fully unpaid pending upgrade can open explicit Stripe confirmation on the same subscription only after ownership, item, amount and already-paid-period validation. Partial, ambiguous or different first-purchase/renewal payments are not silently replaced or directed to the wrong plan. New Checkout requires no outstanding subscription and retains reservation/idempotency controls. Choosing the active plan opens management.

The pricing grid, prices and credit rates are preserved. Change card and recovery controls are below the offers. Cached browser Back clears the stale UI opening lock without replaying payment. Confirmed invoice grants are additive/idempotent; test balances 605 + 4500 = 5105 and 605 + 7500 = 8105 passed without repeated grants. Those are test balances, not the owner's current balance.

The deployed job passed 571 tests, zero failed/skipped, TypeScript, build and local HTTP checks. Its 14 new payment/UI regressions are included. Existing lint warnings (27) and dependency advisories (two moderate, one high) were not hidden or claimed resolved. Isolated live Checkout sessions for Creator, Pro and Studio opened and were immediately expired without payment. Post-deployment checks passed for 16 HTML routes, 52 matching hub assets, 105 original app entries/assets, API routing, no-cost DEMO and origin guards. Live billing readiness, prices and authentication/signature guards also passed.

## Unchanged generation limitations and history

No paid AI generation was run and no generation budgets were changed by the billing releases. The bounded direct blueprint path is separate from detailed Oracle/Blender generation. The last verified deployment preserved `ENABLE_ASTRA_PLANS=true`, `ENABLE_PAID_GENERATION=true`, `PUBLIC_PILOT=true`, `ENABLE_ORACLE_JOBS=false` and `ENABLE_STUDIO_JOBS=false`; detailed Studio was reported disabled. No new model/export capability is implied.

The full pre-PR #148 ledger remains byte-for-byte in [CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md](CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md), original Git blob `d81f0f4e33567f9ecacb5da72d9d2f9f13bac8e0`. Its obsolete pre-merge statements for PR #148 are superseded by the release evidence above. Other historical findings are not silently reverified.
