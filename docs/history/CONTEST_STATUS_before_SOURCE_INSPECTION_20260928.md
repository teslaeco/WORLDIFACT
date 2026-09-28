# WORLDIFACT — current release status

Updated 28 September 2026 following the model-selection release.

## VERIFIED — model selection published

- PR [#137](https://github.com/teslaeco/WORLDIFACT/pull/137) was squash-merged as `8543665818bc4e3ae03168e11b8306282007f363`.
- All three PR workflows passed for exact head `e3955970042e120d401a82441e9965153cf34f22`: application verification, the existing FAST worker review and the new ASTRA guard/rollback tests.
- Production [run 36450294889](https://github.com/teslaeco/WORLDIFACT/actions/runs/36450294889), job `109023021446`, completed successfully, including application tests/build, Worker dry-run, deployment, published HTML/assets/DEMO checks and existing Stripe readiness guards.
- Public AI Shop: https://worldifact.xodobrox.workers.dev/shop
- Plans and points: https://worldifact.xodobrox.workers.dev/account/credits
- The Shop model chooser explicitly labels GPT-6 SOL at 50 points per paid attempt and GPT-6 ASTRA at 250 points. The authenticated notice shows a conditional funded free Sol allowance, point cost and calculated post-reservation balance before the generation button.
- The notice is a display, not a binding reservation: the server rechecks account allowance and available provider funds. It does not initiate a card payment, subscription, automatic batch or model upgrade.
- Existing receipt recovery, models, downloads and backend entitlements were preserved. This release changes no live subscription prices or grants.

## Oracle installer — PREPARED, NOT RUN ON THE OWNER VM

The reviewed installer and OCI Cloud Shell launcher are under `tools/profit_guard/`. The launcher uses the owner's existing VM/key and strict SSH verification. The installer supports one exact reviewed v33 runner/helper variant, refuses active jobs or unreviewed source before restarting, backs up touched files, runs the existing offline verification, checks authenticated local health, and rolls back touched files if verification fails.

The ASTRA guard reserves at most USD 1.75 per job before model calls. Funds are persisted outside generated job output directories; failures, restarts and output cleanup cannot reset them. It counts input tokens, restricts model/service tier/tools, lowers maximum output when necessary and requires price review before 28 October 2026. These are conservative reservations, not measured OpenAI invoice amounts or a guarantee of model quality.

The installer deliberately does NOT enable `ENABLE_ASTRA_PLANS`, alter billing, delete models or launch a paid model test. A successful `WORLDIFACT_ASTRA_GUARD_VERIFIED` result from the owner's actual VM and a separately authorized bounded live quality test are still required before commercial Astra activation.

## Existing catalogue and funded limits

| Offer | USD price | Credits / eligibility | Current status |
| --- | --- | --- | --- |
| Free SOL | 0 | Up to two attempts per rolling 24 hours AND funded shared capacity | Sol routing deployed; no paid live test in this release |
| Creator SOL | 29.99/month | 1,500 credits; 50 per Sol attempt | Existing checkout retained |
| Pro ASTRA | 99.99/month | 4,500 credits; 50 per Sol or 250 per Astra | Displayed; commercial activation blocked |
| Studio ASTRA | 149.99/month | 7,500 credits; 50 per Sol or 250 per Astra | Displayed; commercial activation blocked |
| One-time top-up | 29.99 | 1,500 credits; not standalone Astra access | Existing checkout retained |

The previously deployed funded free pool, Sol token-cost preflight and separate non-refundable provider reservation ledger remain unchanged. Returning customer points after a failure does not replenish provider funds. The historical unlimited request counter is telemetry, not unlimited funded usage. See the preserved preceding status for the exact prior rollout evidence.

## BLOCKED / NOT VERIFIED

- Stripe: the owner reported renewed write permissions and the account list was refreshed. A direct Pro product creation attempt was blocked by OpenAI tool safety validation because the request safety state could not be established. No new product or price was created. This is distinct from the earlier missing product_write permission. No alternate credential or workflow bypass was attempted.
- `ENABLE_ASTRA_PLANS=false` remains in production. New Pro/Studio sales are not enabled.
- Individual cash-priced single-generation passes are not implemented. One explicit generation from points is supported; a top-up alone still does not unlock Astra.
- No paid SOL/ASTRA generation, new payment settlement, actual Oracle installation, or physical Android visual QA was performed by this change.
- The model chooser described here is in AI Shop; no unsupported claim is made that the Game Lab world-blueprint endpoint now accepts Astra selection.

## Promotion and economics

A beta feedback draft and the remaining launch checks are in [the model selection/Oracle runbook](MODEL_SELECTION_ORACLE_20260928.md). No campaign was launched and no advertising money was spent. Verify real generation, exported artifacts, payment settlement and limit behavior before paid promotion. Sol procedural previews must not be advertised as detailed Oracle meshes. Earlier margin figures remain assumption-based contribution margins, not guaranteed company profit after taxes, hosting, refunds and unrelated API activity.

## Preserved history

The preceding complete release ledger is archived unchanged at [pre-model-selection status](history/CONTEST_STATUS_before_MODEL_SELECTION_20260928.md), including the earlier Sol deployment and links to older contest history. This checkpoint is documentation only and does not alter the verified production code.
