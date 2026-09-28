# WORLDIFACT — verified Oracle guard and deployed Stripe catalogue mapping

Updated 28 September 2026 after the owner installation, direct Stripe writes, independent runtime verification and completed application deployment.

## VERIFIED — Oracle installation and independent production read

The owner's 19:04 screenshot shows installation of the pinned `7dc6d5a04f8a0cfc392124a1e19ddb83aa40de5c` package, recognition of `FAST_V33_WITH_SPEND`, and successful offline Codex/MCP/Blender verification. The installation reports `INSTALLED_AND_LOCALLY_VERIFIED`, revision `astra-usd175-v1`, maximum provider reservation USD 1.75/job, `paid_generation_requested=false`, and `WORLDIFACT_ASTRA_GUARD_VERIFIED`.

Independently, production run [36457081235](https://github.com/teslaeco/WORLDIFACT/actions/runs/36457081235), job `109046038040`, completed successfully. At `2026-09-28T17:17:38.680Z`, the single authenticated GET through the existing Oracle production connection returned the exact expected current guard. The sanitized result is:

```json
{
  "runtime": "VERIFIED",
  "provider": "openai",
  "model": "gpt-6-astra",
  "connectorVersion": 33,
  "revision": "astra-usd175-v1",
  "maxProviderUsdPerJob": 1.75,
  "preflight": "input-tokens",
  "priceReviewExpiresAt": "2026-10-28T00:00:00.000Z",
  "paidGenerationRequested": false,
  "liveQualityTest": "NOT_RUN",
  "commercialActivation": "STILL_BLOCKED"
}
```

No additional Oracle installation or shell command is required from the owner. This authenticated runtime evidence is not a paid model-generation or live-quality benchmark.

## VERIFIED — real Stripe products and prices

Direct Stripe connector writes succeeded in the owner's live account `acct_1UIG9ABrIVB6dkxN`, followed by a fresh full active-price listing. The previous safety-validation block did not recur on the same direct operation. No alternate credential path was used.

| Plan | Product | Price | Amount | Monthly credits |
| --- | --- | --- | --- | --- |
| Pro ASTRA | `prod_WORLDIFACTProAstra4500V2` | `price_1UKi3GBrIVB6dkxNm66OnDAr` | USD 99.99 | 4,500 |
| Studio ASTRA | `prod_WORLDIFACTStudioAstra7500V2` | `price_1UKi3UBrIVB6dkxNfojjhJsv` | USD 149.99 | 7,500 |

Both are active recurring monthly licensed prices with the approved product/plan metadata. Creation of catalogue objects is not activation of customer sales. No customer charge, new subscription, existing subscription repricing, refund, tax registration or payment link was executed. Existing Creator USD 29.99/month and the USD 29.99 one-time 1,500-credit top-up remain unchanged.

## VERIFIED — code merge and application deployment

- All six PR workflows passed for exact head `661ae420e1e16655bce996ba3711462761ba1a65` before PR [#138](https://github.com/teslaeco/WORLDIFACT/pull/138) was merged as `886ed8217060e1feb2587fff4cc0198dec2be479`.
- The squash body inherited a historical CI-suppression marker. A behavior-neutral workflow provenance comment was committed as `1c3b38f7e8d0bc1177709aa635c5adeead430a5a` to run the authorized release and read-only check. All application, guard and test bytes were unchanged from the verified PR.
- Production [run 36457081006](https://github.com/teslaeco/WORLDIFACT/actions/runs/36457081006), job `109046037851`, completed successfully for `1c3b38f7e8d0bc1177709aa635c5adeead430a5a`.
- Deployment ran application verification/build, foundations, Worker dry-run, secret synchronization, the existing unpaid Creator checkout open/expire check, actual Cloudflare publication, published HTML/assets/no-cost DEMO checks and billing login/origin/signature checks. No payment was settled by these checks.
- Main application [verification 36457081032](https://github.com/teslaeco/WORLDIFACT/actions/runs/36457081032), job `109046036722`, also completed successfully.

The two exact Pro/Studio price IDs are now deployed in Worker configuration. They are public identifiers, not credentials. Public Shop: https://worldifact.xodobrox.workers.dev/shop . Plans: https://worldifact.xodobrox.workers.dev/account/credits . Existing model selection and pre-generation point display remain: SOL 50 points, ASTRA 250 points; a funded free Sol attempt can cost zero points.

## NOT YET ACTIVATED / remaining paid validation

`ENABLE_ASTRA_PLANS=false` remains deployed. Pro/Studio checkout is not yet enabled. The actual Oracle guard is no longer a missing installation; the remaining commercial gate is a separately authorized, bounded end-to-end generation and export check. Current account/credit controls and Oracle's per-job guard remain in force. Individual cash-priced single-generation passes are not implemented, and an existing top-up alone does not unlock Astra.

Proposed final live check: one SOL and one ASTRA attempt, no automatic retries, actual result/export checks and sanitized evidence. Maximum provider reservation is USD 0.35 + USD 1.75 = USD 2.10. This new paid test was not run or charged in this release. New subscription settlement and physical Android visual QA are not inferred from existing HTTP/fixture tests.

Paid promotion remains NO-GO until real generation, usable exports and payment-to-entitlement behavior are verified. Previously modelled margins are not guaranteed company net profit after hosting, taxes, refunds or unrelated API usage. The guards do not reimburse historical API spending.

## History

Earlier application and safety records remain in [the preserved release ledger](history/CONTEST_STATUS_before_SOURCE_INSPECTION_20260928.md). [Oracle compatibility notes](ORACLE_FAST_SPEND_COMPAT_20260928.md) describe source reconstruction and tests at their earlier checkpoint; this current status supersedes their pending-installation statements. This update is documentation only and does not change the already verified deployment or activate billing.
