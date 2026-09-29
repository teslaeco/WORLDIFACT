# WORLDIFACT — editor polish verified candidate

29 September 2026. Production baseline: `ac2f9c49f92d842f9334b838869215a117f69932` after PR #142. This continuation recovered the interrupted implementation rather than restarting billing setup.

## VERIFIED — integrated application tests

Preparation run [36524320256](https://github.com/teslaeco/WORLDIFACT/actions/runs/36524320256) completed successfully for input commit `af31a9266299c90c946c2aea5968ab73e11cfd1c`. It ran the exact-base integration, `npm run verify` and `npm run deploy:check`, then committed the integrated source as `19061d4b8a69f609a431dc27aacebf94674cb023`. Earlier failed candidates were corrected before this successful run; no failed build was deployed.

Temporary integration scripts and their self-writing review-only workflow are removed from the final PR. Final exact-head PR checks and production publication are still required. This checkpoint does not claim deployment.

## Included changes

- Real selection/move/rotate/scale handles, grid snapping, focus, duplicate, move-to-marker and ground placement. A completed gesture creates one undo entry; stale or cancelled gestures do not overwrite world data.
- Remove the four-imported-model, two-MCC and 48-object placement caps. Keep original files and every validated placement, using lightweight previews when renderer budgets are reached. Account manifests remain bounded to 96 KiB / 4,096 object records; this is not unlimited hardware.
- Show a procedural character in Edit as well as Play, with supported clothing/hair/body presets and colors. Character panel supports library GLB adoption and an explicitly requested, account-metered detailed job through the existing Studio/Oracle/Codex/Blender MCP path. It never buys generation on New game.
- Character receipts are account/world scoped and survive interruption. Late models cannot silently replace a changed character; completed originals remain in the local library. Static imported GLB is not claimed to be rigged.
- Generate an actual scoped Codex instruction from the selected object, private world and command; show/copy/download. The Polish request to move trees clear of the river now has a reviewed zero-API action. This is not an autonomous remote Codex/MCP agent.
- Separate current membership management from an explicit plan-change confirmation. No duplicate membership, customer repricing or card charge is made by opening a plan card.

## Stripe state and remaining Astra blocker

Existing non-default configuration `bpc_1UKstUBrIVB6dkxN5vfrUDa4`, created before the interruption, was reread successfully. Its login URL is disabled. The old default portal remains cancellation/payment-method management; the new configuration is used only by the separately guarded change-plan endpoint. Source tests cover paused plans, unknown targets, cross-origin requests, unpaid invoices, expanded Stripe objects and exact existing subscription/item bindings.

`ENABLE_ASTRA_PLANS=false` is retained. The actual Oracle output-policy update and successful bounded live generation/export remain unverified. Do not call Pro/Studio sales or Creator Astra usage active. No additional paid model test or customer charge was made; the spent earlier USD2.10 one-off authorization was not reused. Existing subscription prices, balances and provider-spend ceilings remain intact.

## Verification boundaries

Account/schema/geometry and actual component SSR tests are not physical Android visual/FPS tests. Model files remain device-local; world layouts save to the authenticated account. The original hosted Forge Studio is linked without transferring cookies, world files or credentials. No unobserved Codex CLI session, new remote daemon or actual Oracle maintenance is claimed.

Guide: [PRIVATE_GAME_LAB.md](PRIVATE_GAME_LAB.md). Executed specification: [CODEX_TASK_EDITOR_POLISH_20260929.md](CODEX_TASK_EDITOR_POLISH_20260929.md). Previous deployed evidence is preserved in [history](history/CONTEST_STATUS_before_EDITOR_POLISH_20260929.md).
