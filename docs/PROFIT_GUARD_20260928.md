# WORLDIFACT profit guard — SOL / ASTRA pricing proposal

Status: **IMPLEMENTED AS NON-LIVE ECONOMICS GUARD ON REVIEW BRANCH.** No Stripe price, subscription, Oracle worker, OpenAI model, credit balance, merge or production deployment is changed by this branch yet.

## Goal

WORLDIFACT must not rely on average usage to break even. Every paid tier reserves enough money for a conservative maximum provider cost, payment/FX fees, infrastructure, free promotional generation, refunds/risk, and a minimum operating profit.

Official OpenAI pricing checked 2026-09-28:

- GPT-6 Sol Standard: USD 2 / 1M input tokens and USD 10 / 1M output tokens.
- GPT-6 Astra Standard: USD 10 / 1M input tokens and USD 50 / 1M output tokens.
- Astra is therefore 5x the Standard token price of Sol for the same token mix.
- Flex processing is priced at Batch rates (50% of Standard) but can be slower and occasionally unavailable.
- Fast mode is 2x the applicable token rates and is not the default choice for cost-controlled generation.

Sources:
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/compare?model=gpt-6-sol
- https://developers.openai.com/api/docs/guides/flex-processing
- https://developers.openai.com/api/docs/guides/prompt-caching

## Proposed live catalogue

| Tier | Monthly price | Credits | SOL equivalent | ASTRA equivalent | Access |
| --- | ---: | ---: | ---: | ---: | --- |
| Free | USD 0 | promotional pool | revenue-funded only | 0 | SOL preview only; DEMO when promo pool is empty |
| Creator SOL | USD 29.99 | 1,500 | 30 | 0 | SOL only |
| Pro ASTRA | USD 99.99 | 4,500 | 90 | 18 | SOL + ASTRA |
| Studio ASTRA | USD 149.99 | 7,500 | 150 | 30 | SOL + ASTRA |

Credit charge:
- SOL generation: 50 credits.
- ASTRA generation: 250 credits.

The 5x credit ratio follows the current 5x Standard token-price ratio. The maximum provider-spend ceiling also uses the same ratio:
- paid SOL: USD 0.35 maximum reserved provider cost per job;
- paid ASTRA: USD 1.75 maximum reserved provider cost per job;
- free promotional SOL: USD 0.15 maximum reserved provider cost per job.

A request that cannot fit inside its remaining job budget must fail closed before provider execution.

## Reserved economics

Every paid plan reserves:
- 5% payment + FX;
- 15% infrastructure;
- 5% free promotional generation;
- 5% refunds / disputes / operational risk;
- model-provider spend according to credits;
- at least 30% remaining operating margin.

Current proposed worst-case margins from the executable guard:
- Creator SOL: about 35%;
- Pro ASTRA: about 38.5%;
- Studio ASTRA: about 35%.

These are budget design margins, not accounting profit or tax advice.

## Free generation rule

Free LIVE generation may never create an unfunded OpenAI liability.

The 5% promotional reserve from successful paid purchases funds a global pool of bounded SOL preview jobs. With the proposed caps:
- one Creator payment funds up to 10 promotional SOL jobs;
- one Pro payment funds up to 33;
- one Studio payment funds up to 50.

When the global promotional pool is empty, the application must offer the explicit no-cost DEMO path rather than sending an unfunded OpenAI request.

## Required runtime work before live activation

1. Route Free and Creator to `gpt-6-sol`.
2. Lock `gpt-6-astra` behind Pro/Studio entitlement.
3. Replace the expired Astra-only FAST spend guard with permanent model-aware monetary reservations.
4. Track provider usage on every response: input, cached input, cache-write and output tokens plus estimated USD cost.
5. Reserve spend before each provider call and settle only after authoritative provider usage is available.
6. Add a global provider budget funded from confirmed paid receipts; never let aggregate reserved provider spend exceed its funded balance.
7. Do not automatically retry Flex failures at Standard price unless a fresh budget reservation succeeds.
8. Use Standard for interactive work; evaluate Flex for asynchronous SLOW work.
9. Keep stable tool definitions/instructions first so prompt caching can reduce repeated input costs.
10. Keep one active generation per account and preserve idempotent retries/refunds.

## Current infrastructure notes

Cloudflare Workers Paid has a USD 5/month minimum when used. Oracle Ampere A1 includes a substantial monthly free allowance (3,000 OCPU-hours and 18,000 GB-hours), but storage or usage outside the allowance may still cost money. The 15% infrastructure reserve intentionally does not assume Oracle is always free.

No live price or subscription migration should happen until the runtime monetary guard, Stripe price IDs and entitlement migration have passed CI and a production GO/NO-GO.
