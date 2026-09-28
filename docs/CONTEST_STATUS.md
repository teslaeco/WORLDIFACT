# WORLDIFACT — Oracle installed and Stripe catalogue created

Updated 28 September 2026 after the owner's 19:04 screenshot.

## VERIFIED — owner's Oracle installation evidence

The screenshot shows installation of the pinned `7dc6d5a04f8a0cfc392124a1e19ddb83aa40de5c` package, recognition of `FAST_V33_WITH_SPEND`, and completion of the offline Codex/Blender verification. Result: `INSTALLED_AND_LOCALLY_VERIFIED`, revision `astra-usd175-v1`, maximum provider reservation USD 1.75/job, `paid_generation_requested=false`, `astra_sales_enabled=false`, and `WORLDIFACT_ASTRA_GUARD_VERIFIED`.

This is evidence supplied by the owner, not a paid live-quality benchmark. The new GET-only workflow checks that same installed guard through the existing authenticated Oracle production connection without exposing its URL/token or starting a model.

## VERIFIED — real Stripe catalogue writes

Direct Stripe connector writes now succeeded in live account `acct_1UIG9ABrIVB6dkxN` under the owner's prior approval. The previous safety-validation block did not recur on the same direct operation; no alternate credential path was used.

| Plan | Product | Price | Amount | Monthly credits |
| --- | --- | --- | --- | --- |
| Pro ASTRA | `prod_WORLDIFACTProAstra4500V2` | `price_1UKi3GBrIVB6dkxNm66OnDAr` | USD 99.99 | 4,500 |
| Studio ASTRA | `prod_WORLDIFACTStudioAstra7500V2` | `price_1UKi3UBrIVB6dkxNfojjhJsv` | USD 149.99 | 7,500 |

Both prices are recurring monthly, quantity-based licensed prices with the approved product/plan metadata. No customer charge, subscription creation, existing subscription repricing, refund, tax setting or payment link was executed. Existing Creator USD 29.99 and one-time 1,500-credit top-up were left unchanged.

## Implemented for this release

The exact live Pro/Studio price IDs are wired into Worker configuration. Price IDs are public identifiers, not credentials. `ENABLE_ASTRA_PLANS=false` is retained until a separately authorized bounded end-to-end generation test establishes actual output quality within the budget. Current code still enforces plan/credit eligibility and the Oracle runtime enforces its per-job limit. No new single-cash-use pass is claimed.

The installed compatibility fix, source-proof tests and read-only inspection from PR #138 are included. No further Oracle installation is requested. Application deployment and independent runtime check remain PENDING until their exact runs finish; passing unit tests are not those production proofs.

## Remaining release gate

One authorized SOL and one ASTRA live generation, each with a durable pre-reserved cap, no retry, genuine output checks and evidence. Maximum provider reservation: USD 0.35 SOL + USD 1.75 ASTRA = USD 2.10. This cost has not been incurred here. Paid promotion remains NO-GO until creation, export and payment-to-entitlement behavior have been verified. Previously modelled margins are not guaranteed company net profit.

## History

Earlier deployment and safety records remain in [the preserved release ledger](history/CONTEST_STATUS_before_SOURCE_INSPECTION_20260928.md). [Oracle compatibility notes](ORACLE_FAST_SPEND_COMPAT_20260928.md) document how the installed source was reconstructed and tested. No historical API spending is reimbursed by these guards.
