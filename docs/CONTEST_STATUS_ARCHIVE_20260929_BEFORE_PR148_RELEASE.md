# 29 September 2026 — direct plan-card payments (review branch)

The owner requested that the existing Creator/Pro/Studio cards open the appropriate payment directly and that card management move BELOW the unchanged pricing grid. The cards, keyboard activation and CTA now use one authenticated plan-payment resolver. It resumes a verified unpaid invoice for the selected plan, opens a new Checkout only when no subscription is outstanding, and opens Stripe confirmation on the existing subscription for a different upgrade. A different fully unpaid pending upgrade may be reviewed in Stripe only after revalidating ownership, item, price, full invoice and the paid base period. This code never pays, voids or cancels an invoice/subscription itself. Stripe retains final customer confirmation. Partial/ambiguous/renewal payments are not silently replaced or redirected to the wrong plan.

The ledger already adds verified invoice grants. Added regression cases explicitly cover 605 + 4,500 = 5,105 and 605 + 7,500 = 8,105, repeated refreshes, incomplete purchases, expired upgrades, reuse, holds, foreign ownership and invalid destinations. Credit/price/budget/generation configuration is unchanged. Existing paid base access is preserved. Payment methods and billing, including Change card, are below the offers.

Browser Back from a cached Stripe navigation clears only the stale UI action lock and refreshes account state; it does not repeat a payment request. A listener test covers this lifecycle and cleanup. Two existing fixture assertions were aligned with explicit Stripe livemode and the added destination field; their payment safety assertions remain unchanged. Validation results belong to the exact-head preparation/PR checks. This source entry is NOT proof of publication. Production merge/deployment awaits owner confirmation; no real customer payment was executed. Separately, the connected Stripe API accepted creation of a Studio subscription_update_confirm session while Pro was pending; that proves session creation only, NOT a completed customer payment. No customer identifiers or session URLs are committed.

---

# 29 September 2026 — payment recovery review

The owner requested recovery after a card-funds failure and self-service card changes. This patch adds an authenticated, same-origin recovery panel and endpoint. Retry opens the existing verified Stripe-hosted invoice; card changes use the existing configured Stripe portal. No new subscription or direct card charge is created by recovery. Pending upgrades preserve only a verified, already-paid current-plan period. Grant IDs remain idempotent and reversal checks remain effective.

Validation and publication status are recorded in the payment-recovery pull request and its exact-head Actions runs. This source edit alone is NOT deployment evidence. Tests use synthetic accounts and provider fixtures; customer invoice URLs, emails, IDs and payment details are not published. Existing prices, credit rates, provider budgets and generator activation are unchanged.

---

# WORLDIFACT — Pro/Studio LIVE; bounded Astra blueprint path verified

Updated 29 September 2026 after successful direct Astra acceptance, PR #144 merge and production deployment.

## VERIFIED — Pro/Studio commercial activation is LIVE

PR [#144](https://github.com/teslaeco/WORLDIFACT/pull/144) merged as `e5115cfba63ade7933c10bf5964e3bbefd64bb78` after the exact head `590b834d32a8dc7584a5b4f53a1320b7c4a67bce` passed all five pull-request workflows.

The owner-approved direct Astra acceptance [run 36531481407](https://github.com/teslaeco/WORLDIFACT/actions/runs/36531481407) completed successfully with exactly one GPT-6 Astra generation call and one input-token preflight, no retry and no customer charge. The verified response used 643 input tokens and 578 output tokens; the conservative reviewed upper-cost calculation was USD 0.040792, below the unchanged USD 1.75 per-attempt ceiling. The returned blueprint exported locally to a valid procedural GAME GLB with 188 triangles, 2 meshes, 2 materials and 87,592 bytes. This validates the bounded direct Astra blueprint/spec path; it does not validate the separate multi-call Oracle/Blender mesh workflow.

Production [run 36531758464](https://github.com/teslaeco/WORLDIFACT/actions/runs/36531758464) completed successfully and deployed Cloudflare version `6d499ab2-dfbf-45e1-8e10-74d8bdfc3441` at https://worldifact.xodobrox.workers.dev . The deployed LIVE configuration has:

- `ENABLE_ASTRA_PLANS=true`
- `ENABLE_PAID_GENERATION=true`
- `PUBLIC_PILOT=true`
- `ENABLE_ORACLE_JOBS=false`
- `ENABLE_STUDIO_JOBS=false`
- `GENERATION_REQUEST_LIMIT=unlimited`
- `STRIPE_PRO_PRICE_ID=price_1UKi3GBrIVB6dkxNm66OnDAr`
- `STRIPE_STUDIO_PRICE_ID=price_1UKi3UBrIVB6dkxNfojjhJsv`

The deployment verified LIVE Stripe checkout creation and immediate expiration without payment for both paid Astra plans:

- Pro ASTRA — USD 99.99/month — 4,500 credits — checkout verified without charge.
- Studio ASTRA — USD 149.99/month — 7,500 credits — checkout verified without charge.

Post-deploy billing verification confirmed `plans.pro.checkoutReady=true`, `plans.studio.checkoutReady=true`, live mode, card readiness and eligible-device Google Pay readiness. No customer card was charged by these probes.

The pricing UI no longer uses radio-dot selectors. Hover highlights the whole plan card; clicking the card selects/highlights it, and the separate subscription button remains the purchase action.

The old multi-call Oracle/Blender customer submission path remains deliberately disabled because its acceptance run hit the Astra per-job budget guard before a second provider call. Historical receipts/artifacts remain recoverable. New premium customer Astra generation uses the verified bounded direct blueprint/spec path with 250-point entitlement checks; MAKE remains validation-required.

---

## 29 September 2026 — Astra activation acceptance and direct fallback

The owner explicitly authorized one bounded live Astra acceptance job with a maximum provider reservation of USD 1.75 and zero automatic retries. Run [36529056866](https://github.com/teslaeco/WORLDIFACT/actions/runs/36529056866) passed application verification and submitted exactly one Oracle job, then stopped without retry when the job failed. Read-only follow-up run [36529452731](https://github.com/teslaeco/WORLDIFACT/actions/runs/36529452731) fetched that same job only. The authenticated runtime still reported GPT-6 Astra, connector v33 and the USD1.75 guard. The sanitized failure detail was: `ASTRA budget guard stopped before another API call. Keep this job; do not auto-retry.` No second provider generation was requested and Pro/Studio sales were not activated from that failed acceptance.

To avoid selling a subscription whose premium route depends on that failed multi-call workflow, this branch now prepares a separate bounded Astra blueprint path inside the WORLDIFACT Worker. It uses the verified `gpt-6-astra` model with low reasoning, strict structured output, server-side input-token preflight, a USD1.75 maximum provider ceiling, account entitlements, 250-point reservation, rate limiting and idempotency. It returns a validated WorldBlueprint/AssetSpec and a procedural GAME GLB derived locally from the Astra result. It does **not** claim to be the detailed Oracle/Blender mesh workflow; MAKE remains validation-required. The multi-call Oracle path stays beta until its per-turn budget behavior is corrected.

**SUPERSEDED by the VERIFIED LIVE section above.** The direct bounded Astra acceptance passed, the exact-head CI passed, PR #144 merged and Pro/Studio commercial activation is live. No duplicate Stripe product or price was created.

## HISTORICAL CHECKPOINT — billing UI fix before activation

Direct read-only verification of the owner's live Stripe account confirms the intended recurring prices already exist and are active: Pro ASTRA `price_1UKi3GBrIVB6dkxNm66OnDAr` at USD 99.99/month for 4,500 credits and Studio ASTRA `price_1UKi3UBrIVB6dkxNfojjhJsv` at USD 149.99/month for 7,500 credits. No duplicate Stripe products or prices were created.

**SUPERSEDED.** At this historical checkpoint production still had `ENABLE_ASTRA_PLANS=false`. The later verified deployment now has `ENABLE_ASTRA_PLANS=true` and the direct bounded Astra path is live.

That branch introduced the plan-card interaction now deployed in production: no radio circles, hover highlights the card, clicking selects/highlights it, and the separate subscription button remains the purchase action. Keyboard card selection is retained.

Updated 29 September 2026 after the owner's 07:28 Oracle Cloud Shell screenshot. The application release remains `8ef7936ffc47b072e3c2e5e550622d0188a036ca`. This checkpoint changes documentation only.

## NEW VERIFIED EVIDENCE — owner's Oracle terminal

The owner ran `tools/profit_guard/oracle_tuning_launch.py --approve-service-restart` from exact release `8ef7936ffc47b072e3c2e5e550622d0188a036ca`. The supplied screenshot shows the installed variant `FAST_V33_WITH_SPEND`, offline Codex/Blender verification, and the final report:

```json
{
  "phase": "ASTRA_OUTPUT_POLICY_VERIFIED",
  "paid_generation_requested": false,
  "policy": "astra-low-reconciled-v2",
  "max_provider_usd": 1.75,
  "sales_enabled": false
}
```

The terminal also reports `WORLDIFACT_ASTRA_OUTPUT_POLICY_VERIFIED` and returns to the Cloud Shell prompt. This supersedes the earlier statement that the owner had not installed the output-policy correction. It is evidence of the installer/local verification result supplied by the owner, NOT an independently observed paid provider response, completed model, successful export or enabled commercial sale. The screenshot itself is not published; private shell/account details are omitted.

No further installation is requested on the basis of this successful result. The next gate is one separately authorized, bounded real Astra generation followed by validation of its downloaded output. The earlier USD2.10 Sol/Astra test authorization was already used and must not be reset or replayed. No new paid generation was authorized or executed by the screenshot alone.

The assistant attempted credential-free GET checks of `/api/studio/status` and `/api/billing/status` in this continuation. The runtime returned connection errors and the web tool could not access the endpoints; no independent current API response was obtained. These tool-access failures are NOT evidence of a WORLDIFACT production outage. Repository/status reads succeeded. No endpoint POST, customer charge, credit debit, new deployment or sales activation was performed here. Issue #140 remains open pending live generation/export evidence.

## VERIFIED — previous release evidence

PR [#143](https://github.com/teslaeco/WORLDIFACT/pull/143) merged as `8ef7936ffc47b072e3c2e5e550622d0188a036ca` after all five applicable workflows passed for exact head `aca53936043f20466c7d495bff03550fbe7a7dde`: application verification `36524700064`, FAST runtime `36524700109`, installation safety `36524700133`, Cloud Shell launcher `36524700129` and project-file review `36524700112`.

Production [run 36525015304](https://github.com/teslaeco/WORLDIFACT/actions/runs/36525015304), job `109266020534`, completed successfully. Steps included full verification/build, Worker dry-run, existing foundation assets, secret synchronization, opening and expiring an unpaid Creator checkout, deployment and public HTML/assets/DEMO/payment-request checks. No customer purchase was settled.

Independent publication [run 36525158517](https://github.com/teslaeco/WORLDIFACT/actions/runs/36525158517), job `109266471440`, returned `PUBLICATION_VERIFIED` at 2026-09-29T05:14:00Z. It checked `/lab`, `/builder`, `/shop` and these exact deployed editor files:

- `/assets/PrivateGameLab-d5Rc111G.js`: 54,172 bytes; SHA-256 `148160c03d4d6a5b64055fb9de3140ca8debf1848b383ff1ba6540f8ba082e3d`.
- `/assets/PrivateGameLab-CHj01eBO.css`: 11,798 bytes; SHA-256 `56daf309b9c7ad816c0a689eb34c24ecf9b28bfb2d0b7b4e5e657b926dee800b`.
- `/assets/PrivateWorldCanvas-CoMwa0Fs.js`: 42,363 bytes; SHA-256 `bb3f2f79a032a5ba9a4b66902f67e35a424f8f615b15006d4ceced3239c68f17`.

The 05:14Z private-world denial checks returned unauthenticated 401, cross-origin 403, owner-query 400 and unsupported library GET 405, without exposing world documents. That check reported Luna 15 / Sol 50 / Astra 250, Creator USD29.99 / 1,500 points and `astraSalesReady=false`. It made zero model requests, account writes and customer charges. These are timestamped earlier publication results, not freshly obtained API responses after the owner's tuning installation.

Editor: https://worldifact.xodobrox.workers.dev/lab
Plans: https://worldifact.xodobrox.workers.dev/account/credits

## Deployed editing and character changes

Select an object by tapping or using the scene list. Move, Rotate and Scale operate on the actual scene; grid snapping, focus, duplicate, ground placement and move-to-marker are available. A completed gesture creates one undo entry. Cancelled/stale operations do not overwrite world data.

The four-imported-model, two-MCC and 48-object placement caps are removed. Manifest data stays bounded to 96 KiB / 4,096 object records and 128 terrain edits; eight worlds per account remains. The renderer uses triangle/draw/file-cache budgets and placeholders instead of removing saved placements when a detailed preview cannot fit. Device library has no 12-file count cap but remains bounded to 350 MB total and 50 MB per self-contained GLB. This is not unlimited hardware or cloud asset synchronization. Original files remain intact.

A procedural character now appears in Edit and Play with supported clothing, hair, body and color presets. New game does not buy an AI generation. The Character panel supports a library GLB or an explicitly requested detailed job through the existing Studio → Oracle/Codex → Blender MCP path, subject to its actual runtime gate and account funding. Receipts are account/world scoped; recovery checks the same job rather than buying another. Late results cannot silently replace a changed character. Static GLB is not automatically rigged; existing animation clips are used only when present.

The assistant generates a scoped Codex instruction from the current private world, selection and command, with Show/Copy/Download controls. The Polish request to move trees off the river offers a zero-API proposal followed by explicit Apply. This is a local guarded editing/task workflow, not an autonomous remote multi-agent session. The original Forge Studio link does not transfer credentials or private files.

## HISTORICAL CHECKPOINT — Stripe management before commercial activation

The existing non-default portal configuration `bpc_1UKstUBrIVB6dkxN5vfrUDa4`, created before the earlier interruption, was reread rather than duplicated in the editor release. The default portal remains cancellation and payment-method management. A separate guarded change-plan endpoint opens explicit customer confirmation for an existing subscription and checks target price, customer/item identity and a settled invoice. It rejects duplicate/pending/unpaid states and paused products. It does not itself change a subscription or charge a card. Full-price paid upgrade invoices use the existing idempotent grant path.

Creator and top-up checkout configuration are retained; no current subscriber was repriced. The previous deployment's unpaid Creator checkout open/expire check passed. Real customer upgrades were not executed during the editor release or this screenshot follow-up.

**SUPERSEDED by the VERIFIED LIVE section above.** The current verified deployment has `ENABLE_ASTRA_PLANS=true`; Pro/Studio checkout readiness passed in production.

## Historical acceptance plan — completed/superseded

The original multi-call Oracle acceptance failed safely and was not retried. A separate direct bounded Astra acceptance then passed with one provider generation call and a valid procedural GLB, as recorded in the VERIFIED LIVE section above. The USD1.75 amount remains a provider-safety ceiling, not an invoice guarantee or profit claim.

## Test and privacy boundaries

Preparation run [36524320256](https://github.com/teslaeco/WORLDIFACT/actions/runs/36524320256) passed complete application verification and dry-run and committed integration `19061d4b8a69f609a431dc27aacebf94674cb023`. Temporary integration scripts/workflow were removed before final PR review. Earlier failing candidates were fixed before any merge/deployment.

Transform/schema/ownership/budget/geometry/real-component SSR and simulated billing tests passed. They do not establish visual quality/FPS on a physical Android phone, live authenticated world editing, actual customer upgrades or generated-character quality. Existing CI reported three moderate dependency audit findings; this release is not a zero-vulnerability claim. Browser restrictions were not bypassed.

Guide: [PRIVATE_GAME_LAB.md](PRIVATE_GAME_LAB.md). Executed specification: [CODEX_TASK_EDITOR_POLISH_20260929.md](CODEX_TASK_EDITOR_POLISH_20260929.md). Earlier deployed ledger preserved in [history](history/CONTEST_STATUS_before_EDITOR_POLISH_20260929.md). Live-generation blocker: [#140](https://github.com/teslaeco/WORLDIFACT/issues/140).

This checkpoint records the new owner-supplied installation evidence. It does not change application code, run a model, consume a new test allowance or activate Astra sales.
