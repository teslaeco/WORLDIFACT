# WORLDIFACT — prompt model controls and the authorized live-test result

Updated 28 September 2026. This is a review-branch checkpoint; deployment is not yet claimed.

## Owner authorization

The user requested an unmistakable AI-model selector next to the prompt, authorized the previously quoted one SOL attempt (USD 0.35 maximum provider reservation) and one ASTRA job (USD 1.75), and requested paid-plan activation and deployment. The total test authorization was USD 2.10 with no automatic retries. Existing customer subscriptions, credit balances and card charges were not changed by the owner test.

## VERIFIED — the authorized test actually ran, without retry

[Run 36471162273](https://github.com/teslaeco/WORLDIFACT/actions/runs/36471162273), job `109093469571`, ran the reviewed script at `f61ef0503d88e29bc822b5ba0420f8dbe6ddb4cd` at 19:17–19:18 UTC and finished with failure. The permanent Git ref `worldifact-model-check-20260928-2100-v1` claimed this approval before provider work. It must not be deleted or renamed to rerun the paid test.

- SOL: the test did not confirm a usable export and reported `TEST_FAILED_NO_RETRY`. The initial script did not persist the provider result before exporting, so its report is insufficient to claim a successful live SOL deliverable or precise token cost. A subsequent deterministic, no-API export test independently found `document is not defined` in Node's browser-dependent glTF image export path. This is a test-environment limitation, not proof that the browser SOL service failed. No second SOL call was made.
- ASTRA: exactly one Oracle job was submitted, `ac718eb5-2c54-47b1-ae67-722ad296ff10`. It transitioned from queued to failed. A subsequent authenticated GET of that same job in [run 36471870199](https://github.com/teslaeco/WORLDIFACT/actions/runs/36471870199), job `109095860631`, confirmed: `Codex: stream disconnected before completion: Incomplete response returned, reason: max_output_tokens`. The response was truncated before the complete model workflow finished. No replacement job or increased cost ceiling was attempted.
- Evidence artifact: `worldifact-approved-model-test-evidence`, artifact ID `10991846065`. It contains the failed-test report, not completed models. Actual billed USD is UNKNOWN; the USD 2.10 figure is the approved combined maximum reservation, not a measured invoice.

These were real backend/provider attempts, not a customer checkout or physical Android browser test. The SOL test used the production handler with an isolated owner-test quota; ASTRA used the authenticated existing Oracle pipeline. Neither debited the user's displayed 900 customer points.

## Implemented UI corrections

- A visible native AI-model dropdown immediately before the cost notice and prompt: GPT-6 SOL at 50 points per paid attempt, GPT-6 ASTRA at 250. Existing FAST/SLOW cards remain, but no hidden control is required to select the model.
- The price notice now uses high-contrast light text on a dark panel with explicit descendant styles. The form is placed before the preview through 1024px-wide layouts, including Android desktop-site viewports.
- The active Creator card can open existing subscription management instead of being an inert button. This does not enable a chargeable upgrade; the current Stripe portal only manages cancellation/payment details.
- Credit refresh timeouts show a plain message rather than raw AbortSignal errors. The balance explanation distinguishes SOL/Astra attempts and the separate remaining provider budget.
- SOL preview/download now builds the actual returned blueprint and exports the same displayed GLB. It no longer shows an unrelated prompt-keyword demo under a live-generated label. Geometry remains explicitly procedural GAME output, not a detailed Oracle mesh or approved MAKE asset.

The isolated preparation workflow [36471870199](https://github.com/teslaeco/WORLDIFACT/actions/runs/36471870199), job `109095860894`, passed application verification and Worker dry-run before committing the exact four UI edits as `61a02a137a455d74221a6c6ba45f6d96b89b9c3f`. Final exact-head PR verification and production publication remain pending.

## Release decision

GO for the tested model-selector, contrast, truthful preview/export and timeout-message corrections after exact-head CI. NO-GO for new Pro/Studio sales: the requested live test exposed an actual Astra generation failure. `ENABLE_ASTRA_PLANS=false` is preserved; existing Creator/top-up payment settings and all customer balances are unchanged. Activating sales now would charge customers for a workflow that this test did not complete.

Next engineering work is to tune Astra output/reasoning allocation inside the existing USD 1.75 ceiling, preserving the persistent budget and previous fixes; add an offline end-to-end export test with proper texture support; and persist successful provider evidence before export in any future approved test. A new paid attempt needs its own explicit approval. No background work or repeat test is scheduled here.

## Preserved prior evidence

The already installed Oracle guard and live Stripe product/price IDs remain documented in [the preceding verified release](history/CONTEST_STATUS_before_APPROVED_TEST_20260928.md). The guard's installation is not the current blocker; completion of a real model within the selected output budget is. Earlier contribution-margin projections remain assumptions, not guaranteed company net profit.
