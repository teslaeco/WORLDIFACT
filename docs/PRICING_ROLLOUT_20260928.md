# Pricing rollout checkpoint — 28 September 2026

The owner approved deployment of Creator SOL (USD 29.99), Pro ASTRA (USD 99.99), and Studio ASTRA (USD 149.99). Do not change an existing subscriber's price automatically.

## Release conditions

- Creator and free FAST use the direct GPT-6 Sol blueprint path. It produces a procedural draft, not the detailed Oracle mesh pipeline.
- The Sol path must pass exact-input-token cost preflight before its paid Responses request.
- Paid-account provider budgets are now durable and separate from customer credits: 1,500 credits reserve at most USD 10.50 of future provider work. The initial migration uses only remaining legacy credits once. Subsequent funding is atomic with verified credit grants.
- Failed jobs return customer credits but DO NOT refill the provider envelope. Repeated failures stop further paid attempts even when customer credits remain. This conservative reserve may also count attempts rejected before a paid call; support review is needed rather than automatic recharging.
- Payment reversals remove remaining provider funding. Replay, restart, and calendar rollover cannot refill it.
- The free pool remains globally funded and cannot fall back to Astra.
- Pro/Studio checkout MUST stay blocked while `ENABLE_ASTRA_PLANS=false`: the Oracle Astra worker still needs a verified USD 1.75 hard per-job guard. Preparing price objects is not proof of a working premium service.

## Financial scope

The earlier 30–38% numbers are modelled contribution margins under assumed payment, infrastructure and refund reserves, not guaranteed net profit. Actual hosting invoices, taxes, provider use outside WORLDIFACT, refunds and chargebacks can still create a loss. No code change can guarantee positive business profit without enough collected revenue to cover fixed costs.

No real customer charge, refund, subscription migration or paid AI test is part of the offline test suite. Record production verification and Stripe product IDs before marking the rollout LIVE.
