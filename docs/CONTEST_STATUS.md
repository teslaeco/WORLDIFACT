# WORLDIFACT — prompt model controls DEPLOYED; Astra sales still blocked

Updated 28 September 2026 after the explicitly approved live test and completed UI deployment. This checkpoint supersedes the pending-deployment notes in the earlier release candidate.

## VERIFIED — published model selector and cost notice

PR [#139](https://github.com/teslaeco/WORLDIFACT/pull/139) was merged as `3a9128b09dca7deb4971cce296b12ffbe89418f6` after all five exact-head PR workflows passed for `b3760bd48b3c307a3b0ed98a6d893b184855bd6e`.

Production [run 36473395121](https://github.com/teslaeco/WORLDIFACT/actions/runs/36473395121), job `109100977649`, completed successfully for that merge. It ran application verification/build, Worker dry-run, existing secret synchronization, an unpaid Creator checkout open/expire check, actual Cloudflare publication, published HTML/assets/no-cost DEMO checks and payment login/origin/signature checks. No payment was settled by these deployment checks.

Public Shop: https://worldifact.xodobrox.workers.dev/shop
Plans: https://worldifact.xodobrox.workers.dev/account/credits

The visible form now has a native `AI model · Model AI` dropdown, a compact readable cost notice, then the prompt input. Options identify GPT-6 SOL at 50 points per paid generation and GPT-6 ASTRA at 250. Essential cost/remaining-balance/blocking messages stay visible; long explanations are collapsed. Advanced internal selectors no longer separate the model dropdown from the prompt. Light-on-dark text contrast is checked numerically, and the form is placed before the preview through 1024px layouts. Physical Android visual QA was not performed.

The release also replaces raw credit-refresh AbortSignal errors with a readable message, gives the active Creator card a working route to existing subscription management, distinguishes per-model point capacity, and constructs the SOL preview/download from the actual returned blueprint rather than an unrelated prompt-keyword demo. That output remains explicitly procedural GAME geometry, not a detailed Oracle mesh or manufacturing-approved asset.

## VERIFIED — the authorized live test ran ONCE and did not pass

The owner authorized one SOL attempt with a USD 0.35 maximum provider reservation and one ASTRA job with USD 1.75, total USD 2.10, without automatic retries. [Run 36471162273](https://github.com/teslaeco/WORLDIFACT/actions/runs/36471162273), job `109093469571`, executed the reviewed script at `f61ef0503d88e29bc822b5ba0420f8dbe6ddb4cd` at 19:17–19:18 UTC and ended in failure.

The permanent Git ref `worldifact-model-check-20260928-2100-v1` claimed this approval before provider work. It must not be deleted, reset or renamed to repeat the test.

### SOL

The test reported `TEST_FAILED_NO_RETRY` without a confirmed export. Its initial script persisted the provider result only after export; the report therefore cannot establish a successful live SOL deliverable or exact token cost. A subsequent deterministic no-API export diagnostic reproduced `document is not defined` in Node's browser-dependent glTF image export. This is a test-environment limitation, not proof that the browser SOL service failed. No second SOL provider request was started.

### ASTRA

Exactly one existing Oracle job was submitted: `ac718eb5-2c54-47b1-ae67-722ad296ff10`. It transitioned from queued to failed. A later GET-only read of that same job in [run 36471870199](https://github.com/teslaeco/WORLDIFACT/actions/runs/36471870199), job `109095860631`, confirmed:

`Codex: stream disconnected before completion: Incomplete response returned, reason: max_output_tokens`

No replacement job, increased price ceiling or automatic retry was performed. The guard was already installed and verified; the failure concerns completing the real model workflow within the current output allocation, not missing Stripe products.

The evidence artifact is `worldifact-approved-model-test-evidence`, artifact ID `10991846065`; it contains the failed-test report, not finished models. Actual billed USD is UNKNOWN. USD 2.10 is the approved combined maximum reservation, not an invoice measurement.

These were backend/provider tests, not a paid customer checkout or physical Android session. SOL used the production handler with an isolated owner quota; ASTRA used the authenticated existing Oracle pipeline. They did not debit the user's displayed 900 customer points or charge a customer card.

## Payment state and release decision

Existing Creator USD 29.99/month and the USD 29.99 one-time 1,500-credit top-up remain configured; no existing subscriber was repriced. Real Pro USD 99.99 and Studio USD 149.99 price IDs remain connected in Worker configuration, but `ENABLE_ASTRA_PLANS=false` is unchanged. Pro/Studio purchasing is NOT enabled after the failed generation test. The UI now explains that live generation/export validation is pending instead of incorrectly saying the Oracle guard has not been installed.

The existing Stripe portal is for cancellation/payment details. This release does not implement a chargeable prorated upgrade or an individual cash-priced Astra pass. A top-up alone still does not unlock Astra. No new customer subscription or settlement was made here.

GO: tested and deployed UI corrections. NO-GO: new Astra sales and paid promotion until a usable model/export is verified. Full failure and correction requirements are tracked in [issue #140](https://github.com/teslaeco/WORLDIFACT/issues/140).

## Remaining work

Review the actual Astra reasoning/output allocation and per-job reservation behavior without removing the USD 1.75 cap or resetting uncertain spent funds. Reproduce the full contract/build/review/finish progression offline; correct headless texture export and persist provider evidence before export in future test tooling. A further paid attempt requires separate explicit approval. No repeat test or background job has been scheduled.

The preceding installed-Oracle/Stripe evidence remains unchanged in [the prior verified ledger](history/CONTEST_STATUS_before_APPROVED_TEST_20260928.md). Earlier contribution margins are assumptions, not guaranteed net profit after hosting, taxes, refunds and unrelated API use. This final update is documentation only and does not change the completed deployment or billing flags.
