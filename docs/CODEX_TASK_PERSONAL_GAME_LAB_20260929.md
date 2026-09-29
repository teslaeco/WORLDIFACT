# Executed engineering task — personal Game Lab

Owner request: remove the crossed-out additional world generator from AI Shop; replace the shared portal world inside Game Lab with an account-owned studio, a cosmic start using the original FORGE sculpture, an empty meadow/river, character brief, model-library placement, terrain tools, working game buttons, five-step onboarding and controlled AI costs. Permit Creator subscribers to sample Astra without buying Pro.

## Execution specification

1. Read the current main and preserve existing customer balances, Stripe prices, original GLBs and the global Astra runtime gate.
2. Use a versioned, strict data schema for worlds. No user-authored JavaScript, arbitrary URLs or owner IDs. Save metadata to the account-scoped Durable Object derived from the verified session. Use optimistic revisions; never overwrite another user's world or silently resolve concurrent edits.
3. Use the existing original FORGE sculpture on the launch screen. Do not approximate its geometry. Create a separate scene with bounded instanced grass, curved river, stars, selectable terrain points, reversible height edits and library placements. Never mount the global portal world or preload its Queen in Game Lab.
4. Keep the original model archive intact. Filter old library entries by the current account's server-verified job ownership before displaying them. Store imported files in a new per-account device library. No automatic binary cloud upload. Bound bytes, triangles and active scene geometry.
5. Character wizard collects name, appearance, outfit, lettering, hair, silhouette and style. Explain that the initial play proxy is not an AI character. Hand the brief to AI Shop only after the user explicitly chooses it.
6. Implement local command proposals for hill/valley, sky/grass and working jump/fly/sprint/reset buttons. Require a visible Apply action. Register two native WebMCP tools where supported, following the coordinator/proposal/human-approval pattern in ForgeMCP. Never claim a Codex session ran merely because a local command parser or WebMCP tool executed.
7. Keep paid scene generation on the existing bounded Luna/Sol route, with visible point cost, one request ID, no automatic retry and explicit apply-to-world. Astra remains the distinct detailed Shop route. No paid request on navigation, editing, opening a world, autosave, terrain changes or tutorial steps.
8. Creator keeps 1500 credits at its existing price. Two Astra attempts consume 500 of these credits, leaving 1000. Permit at most six funded Astra attempts per paid billing period; topups, retries, dates, failed-job refunds and service recreation cannot reset the attempt cap or provider fund balance. Do not imply two free extra Astra models.
9. Test strict parsing, account isolation, concurrency, caps, invalid requests, library ownership, renderer limits, controller behavior and UI routing. Run the full existing test/build/dry-run pipeline before a green-check merge.
10. Record actual deployment and runtime boundaries in CONTEST_STATUS. The Oracle output-policy installation and a new paid generation remain separate from this web release. Do not reuse the exhausted prior USD2.10 test authorization.

## Codex / MCP boundary

This task is implemented through the connected GitHub tools and repository CI, not an unobserved Codex CLI run. The new browser assistant is local and deterministic. Native WebMCP registration reports availability rather than simulating it. A hosted Codex agent with a server-side budgeted session is not activated by this task.

Reviewed references: the repository README at https://github.com/Terraforming-Planet/ForgeMCP-Multi-Agent-Research---Game-Studio/blob/main/README.md identifies its coordinator as deterministic and documents registered WebMCP handlers. The adapter here is original code, not copied source. Current API contract: https://webmachinelearning.github.io/webmcp/ . Codex MCP transport documentation: https://learn.chatgpt.com/docs/extend/mcp?surface=cli .
