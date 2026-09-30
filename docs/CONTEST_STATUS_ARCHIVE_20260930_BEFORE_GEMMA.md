# WORLDIFACT — current release evidence

Updated 30 September 2026. Deployment timestamps below are UTC.

## VERIFIED — PR #150 safety repair merged and deployed

The owner authorized repair, merge and deployment only after green exact-head checks. [PR #150](https://github.com/teslaeco/WORLDIFACT/pull/150) was reviewed at `829a295fdec6b3bb1834e1c7ab66d6b25ddae914` and merged as `d3a7dd53783035eb1d8ea839a9460987b0202d4e`. All five standard PR workflows passed. The executable acceptance task is recorded in [CODEX_P0_GENERATION_REPAIR_20260930.md](CODEX_P0_GENERATION_REPAIR_20260930.md); implementation was performed directly through the repository tools, not an unverified Codex execution integration.

[PR verification 36677852954](https://github.com/teslaeco/WORLDIFACT/actions/runs/36677852954) and [production publication 36678242672](https://github.com/teslaeco/WORLDIFACT/actions/runs/36678242672) passed. Production deploy job `109767833539` published Cloudflare version `59681992-d680-4934-8581-7e4955acf153` at 2026-09-30T06:28:20Z from the merged revision.

Public application: https://worldifact.xodobrox.workers.dev

Shop: https://worldifact.xodobrox.workers.dev/shop

The runtime revision is `d3a7dd53783035eb1d8ea839a9460987b0202d4e`. This documentation-only follow-up does not publish another runtime version.

## VERIFIED — incident diagnosis and implemented scope

The customer Shop previously used the bounded specification endpoint, a 2,000-character field and only the first image. Its WorldBlueprint schema produces supported procedural scene objects, not a faithful realistic character. The detailed Oracle/Blender service remains disabled. Screenshots alone do not prove duplicate processing of a single job or a bank-card debit.

- Up to six ordered reference images, with front/left/right/back view labels. Four images are supported, not compulsory. Every accepted image is transmitted; count, MIME/magic, encoded/combined decoded size and labels are checked before spending.
- A 4,000-character input with a visible counter and no silent truncation; the complete 3,500-character brief is covered by regression tests.
- Explicit procedural-versus-detailed deliverables. Recognized character briefs, explicit detailed mesh requests and legacy photo requests without procedural consent are rejected before point reservation or provider calls. This is a conservative contract guard, not a perceptual similarity score or proof of general visual quality.
- Payload-bound account idempotency, atomic completed-result storage, read-only recovery and a browser in-flight guard. A lost response or retry of the same saved request does not create a fresh paid job. A new paid attempt requires an explicit action. Recovery metadata contains no private images, prompt or token.
- Strict schema, AssetSpec, selected-model and provider-evidence checks. Failed new requests settle customer points/free allowance once; overdue synchronous reservations can reconcile after ten minutes. Provider-spend safeguards are not replenished by customer refunds.
- Historical Studio receipts, original assets, pricing, payment configuration and disabled Oracle gates are preserved. A valid Astra specification remains labelled as a specification with locally constructed procedural GAME geometry, never as a detailed reconstructed character.

## VERIFIED — testing and no-spend release evidence

Both exact-head CI and production verification passed **604 tests, zero failed, zero skipped**. TypeScript, build, real local HTTP smoke and Worker deployment dry-run passed. Existing lint warnings remain: 27 warnings, zero errors. npm reported three dependency advisories (two moderate, one high); this scoped release does not resolve them or apply a forced dependency update.

New automated coverage includes 1/4/6 images and ordered forwarding, seven-image rejection, malformed/oversized references, intact long prompts, no-charge unsupported character requests, duplicate/concurrent submissions, payload collisions, lost-response recovery, native-fetch receiver handling, definitive pre-reservation failures, invalid/refused/wrong-model responses, one-time credit settlement and preserved provider-spend counters. Deterministic provider fixtures are not live character-quality evidence.

At 2026-09-30T06:28:35Z, post-deployment HTTP smoke passed for 16 HTML routes, 52 matching hub assets and 105 original application entries/assets, API 404, explicit no-cost DEMO generation and origin rejection. The billing configuration/login/origin/webhook-signature checks also passed without a checkout, charge or credit grant. Public HTTP evidence comes from the production runner; a separate read-only request from the assistant container was unavailable because DNS resolution failed.

## BLOCKED / UNKNOWN — not completed by this release

**Photorealistic character generation is not restored.** `ENABLE_ORACLE_JOBS=false` and `ENABLE_STUDIO_JOBS=false` remain unchanged. Upload capacity is not a promise of faithful reconstruction. The repair stops unsupported paid substitutions; it does not reactivate or validate the detailed mesh pipeline.

Historical reimbursement is **not performed**. The affected account and request ledger must be identified before any correction; no guessed credit balance, bulk refund or Stripe refund was issued. Newly implemented failure settlement does not prove that the owner's earlier deductions have been reversed.

No paid AI generation, real new character export or physical Android/WebGL test was executed. Existing fixture/browser lifecycle tests and HTTP smoke do not establish those outcomes. Pricing and generation budgets remain unchanged.

Release decision: **GO — owner-authorized PR #150 safety hotfix published after green checks. NO-GO — advertising restored realistic character generation or a historical refund.**

---

## HISTORICAL VERIFIED — PR #148 payment release

The owner explicitly approved merging and deploying the direct plan-card payment correction. [PR #148](https://github.com/teslaeco/WORLDIFACT/pull/148) merged as `55dc790b87b1838c2e62d29c4e2f155064b43e67`; the reviewed head was `ad67160c240f0331c6e0c2ba4b1576d1dc87c180`. All five exact-head PR workflows passed before merge.

The [production run 36637922934](https://github.com/teslaeco/WORLDIFACT/actions/runs/36637922934) completed successfully at 2026-09-29T22:11:40Z. Its deploy job `109643019010` published Cloudflare version `0aa29e6c-4e69-4623-a81b-4f5400f71f14`. That runtime was superseded by PR #150 above; these paragraphs preserve the earlier payment evidence.

Subscription page: https://worldifact.xodobrox.workers.dev/account/credits

### Scoped payment behavior

- Existing Creator/Pro/Studio cards, keyboard activation and purchase buttons share the authenticated `/api/billing/plan-payment` resolver. The matching failed purchase resumes its verified Stripe-hosted invoice rather than creating a duplicate subscription.
- A different fully unpaid pending upgrade can open explicit Stripe confirmation for the selected target on the same subscription only after server checks of ownership, item, amount and the already-paid base period. The application does not itself pay, void or cancel an invoice or subscription. Partial, ambiguous or different first-purchase/renewal invoices are not silently replaced or sent to the wrong plan.
- New Checkout is opened only when no outstanding subscription was found, using the existing reservation and idempotency rules. The currently paid plan opens billing management, not another subscription.
- The pricing grid, prices and credit rates are preserved. Payment methods and billing, including Change card and Retry payment, are below the offers. A cached browser Back return releases the stale UI opening lock and refreshes state without replaying payment.
- Confirmed invoice grants are additive and idempotent. Synthetic regressions passed for an existing balance of 605: Pro adds 4,500 for 5,105; Studio adds 7,500 for 8,105. Repeated refreshes do not repeat the grant. These are test balances, not a statement of a customer's current balance or successful purchase.

### Historical checks and limitations

PR #148 production verification passed 571 tests, zero failed or skipped; TypeScript, build and local HTTP smoke passed, including 14 new payment/UI regressions. It retained 27 lint warnings and three dependency advisories. Those historical counts are not the current PR #150 test count.

Before that deployment, isolated LIVE Stripe Checkout sessions for Creator (USD 29.99), Pro (USD 99.99) and Studio (USD 149.99) were created and immediately expired without payment. No customer card was charged and no subscription purchase was completed by those probes.

The historical smoke passed at 2026-09-29T22:11:36Z: 16 HTML routes, 52 matching hub assets, 105 original application entries/assets, API 404, explicit no-cost DEMO generation and origin rejection. Billing status confirmed LIVE mode, expected Pro/Studio prices and checkout readiness; login, origin and webhook-signature guards passed.

A complete paid customer purchase, bank authentication and physical Android interaction were not executed by the assistant. A connected Stripe check accepted creation of a Studio confirmation session while a Pro update was pending, but that was session-creation evidence only. Final payment remains a customer action in Stripe; successful settlement is not inferred from opening a page or returning to WORLDIFACT.

PR #148 did not run paid AI generation or change generation budgets. It preserved `ENABLE_ASTRA_PLANS=true`, `ENABLE_PAID_GENERATION=true`, `PUBLIC_PILOT=true`, `ENABLE_ORACLE_JOBS=false` and `ENABLE_STUDIO_JOBS=false`. No new detailed model/export capability was claimed by that billing release.

## Earlier historical ledger — preserved in full

The previous ledger remains byte-for-byte in [CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md](CONTEST_STATUS_ARCHIVE_20260929_BEFORE_PR148_RELEASE.md), original Git blob `d81f0f4e33567f9ecacb5da72d9d2f9f13bac8e0`. It contains earlier milestones, licenses/attribution notes, contest evidence and prior generation/deployment limitations. Its pre-merge statements about PR #148 are superseded by the payment release evidence above. Other historical findings are not silently reverified by this documentation update.
