# WORLDIFACT — current release status

Updated 28 September 2026 after the successful production deployment at 14:37 UTC (16:37 Europe/Amsterdam).

## VERIFIED — production rollout

- PR [#136](https://github.com/teslaeco/WORLDIFACT/pull/136) was squash-merged as `73ff4e79a1f906558e28ef7c01862860ee9d96d7` after all six PR workflows passed for head `82191c0e2452ee5bff58505ba2ee564939b2ab3b`.
- Production [run 36437132520](https://github.com/teslaeco/WORLDIFACT/actions/runs/36437132520), job `108977833477`, completed successfully.
- Cloudflare version: `b1055942-c68a-4b65-887a-190ef75c3024`.
- Public application: https://worldifact.xodobrox.workers.dev
- Pricing and account credits: https://worldifact.xodobrox.workers.dev/account/credits
- Production verification ran lint, typecheck, 485 passing tests (zero failed/skipped), local HTTP smoke, the application/foundation builds and Worker dry-run.
- Public HTTP checks verified 16 HTML routes, 43 matching hub assets, 105 original application entries/assets, explicit no-cost DEMO generation and origin rejection.
- Stripe's existing USD 29.99 subscription checkout was created unpaid, verified and expired without a charge. Public billing readiness, anonymous checkout rejection, origin validation and webhook-signature rejection passed. This is not a new payment settlement test.

## Deployed catalogue and availability

| Offer | Price | Credits | Status |
| --- | --- | --- | --- |
| Free SOL | USD 0 | Up to two FAST drafts per rolling 24 hours, subject to funded global capacity | Sol routing and controls deployed; paid generation not exercised in this rollout |
| Creator SOL | USD 29.99/month | 1,500; 50 per SOL attempt | Existing checkout remains enabled |
| Pro ASTRA | USD 99.99/month | 4,500; 50 per SOL or 250 per ASTRA attempt | Displayed, but checkout BLOCKED |
| Studio ASTRA | USD 149.99/month | 7,500; 50 per SOL or 250 per ASTRA attempt | Displayed, but checkout BLOCKED |
| One-time top-up | USD 29.99 | 1,500 | Existing Stripe checkout remains enabled; does not unlock Astra by itself |

Existing subscribers were not automatically charged a higher price. Creator/Sol FAST generates a validated scene/asset specification and a procedural draft, not the detailed Oracle mesh workflow. Neither export path is automatic approval for physical manufacturing.

## Deployed cost controls

- FAST uses `gpt-6-sol`, with exact-input-token preflight and conservative maximum provider cost of USD 0.15 for free requests and USD 0.35 for paid requests. There is no automatic fallback to Astra.
- Free work must consume the global funded promo pool. The configured ten-job initial pool is applied once, not per account or deployment. Verified new Stripe purchases can fund future free capacity; associated reversals reduce it.
- Customer credits and provider-spend reserves are separate. A 1,500-credit grant allocates at most USD 10.50 of future provider reservations. Paid failed attempts may restore customer credits but never replenish provider reserves. Replays, restarts and calendar rollover do not reset spent funds.
- The migration initializes each account's future provider reserve once from its remaining legacy credits. It does not recover or reimburse historical API spending.
- The reserve is deliberately conservative: it can also count attempts rejected before a paid provider call. Once exhausted, further requests are blocked pending review even if customer credits remain. It is not an actual OpenAI invoice or a guarantee of 30 successful results.
- The historical global `GENERATION_REQUEST_LIMIT=unlimited` counter remains telemetry/idempotency state. SOL spending is bounded separately by funded free capacity, per-account provider reserves and per-request preflight.

## BLOCKED — full Astra commercial activation

1. `ENABLE_ASTRA_PLANS=false` is deployed. The Oracle v33 connector is reachable, but its full Astra pipeline does not yet have a verified USD 1.75 hard per-job provider guard. A ready health response is not proof of safe spending or successful generation. Do not enable Pro/Studio sales until that runtime guard is installed and tested.
2. The connected Stripe account denied `PostProducts` for missing `product_write`. No new Pro/Studio products or prices were created. The owner was given Stripe's permission-renewal flow. Catalog creation remains explicit; the automatic post-merge creation trigger was removed.
3. No paid SOL/ASTRA generation, production authenticated end-to-end model creation, new subscription settlement, or physical Android test was performed in this rollout. Configuration, HTTP checks and mocked regression tests must not be described as those proofs.

## Financial qualification

The earlier 30–38% values are modelled contribution margins using assumed fees and reserves, not guaranteed net profit. Actual fixed hosting bills, taxes, refunds/chargebacks and OpenAI activity outside these guarded routes can still create losses. No assertion that the whole business cannot lose money is verified.

Further implementation notes: [pricing rollout](PRICING_ROLLOUT_20260928.md). This status checkpoint changes documentation only; it does not change the already verified production code or billing configuration.

## Preserved history

All preceding contest and rollout entries are preserved unchanged in [the pre-release status archive](history/CONTEST_STATUS_before_SOL_release_20260928.md). Historical statements marked pending or unmerged describe their original checkpoint, not the current production state.
