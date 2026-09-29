# Executable work specification — private Game Lab

Owner-authorized request: implement a better private world editor, remove the red-marked duplicate Shop generator, make lower-price membership eligible for controlled Astra trials, keep AI costs explicit, and preserve existing models, accounts and prices.

## Task for Codex or a repository implementation agent

Implement and test:
1. `/shop`: remove only its secondary world-blueprint drawer. Keep the main 3D model generator and other portal integrations.
2. `/lab` and `/builder`: private scene editor with an initially empty meadow and river, star-themed onboarding and a rotating exactly 18-faced jewel. Do not preload the portal world's queen, buildings or vehicle.
3. New game: world name and a saved character brief (appearance, clothing, label, hair/color/style). No automatic AI generation. A clearly labelled local preview is permitted.
4. Owner-derived server namespace: read/save/delete worlds only inside the authenticated account's Durable Object. Never accept owner IDs in query/body. Validate strict JSON, limits and optimistic revisions. Prevent cross-account access, stale overwrites and resurrection after deletion.
5. Library: import self-contained GLB; allow existing generated models only after verifying job ownership/download entitlement. Never publish or overwrite originals. Label device-local files separately from cloud-saved world manifests.
6. Point selection, placement, inspector transforms, hills, valleys, stars/day, undo/redo, keyboard/touch play controls, five-step paginated tutorial.
7. Local assistant commands for typed safe edits cost zero API points and require Apply. No eval, shell, remote MCP or arbitrary URLs. Optional explicit Luna/Sol world-object proposal uses the existing metered API once; no retry loop or model substitution.
8. Creator retains USD29.99 and 1,500 points. Astra is 250 points, at most six attempts per paid period, gated by existing verified commercial activation. Recommend 500 of the included points for two attempts, leaving 1,000 for twenty Sol attempts. Do not add unfunded bonus credits or guarantee two successful outputs.
9. Preserve the USD1.75 Astra job guard and all account provider budgets; failed-attempt point refunds must not reset spend/quota. Do not enable an unverified Oracle policy or reuse an exhausted paid-test approval.
10. Run full lint/type/test/build and Worker dry-run; publish only with explicit owner approval and exact-head green checks.

## Execution and boundaries

The current agent implements this through the connected GitHub tools and repository CI. There is no authenticated Codex CLI tool in this session; no actual Codex execution is invented. Optional Codex/MCP brief export is data only. A real external agent runtime needs separate sandboxing, authentication, ownership enforcement and a funded call limit before activation.

ForgeMCP reference reviewed: https://github.com/Terraforming-Planet/ForgeMCP-Multi-Agent-Research---Game-Studio . The MIT license was read; no source assets or remote MCP server were copied/started in this change. Local tools were implemented originally in WORLDIFACT. Do not turn a permissive code license into a claim of live integration or permission to spend on external providers.

Acceptance: no model request on enter/new/save/sculpt/place/control; authenticated Alice cannot read or overwrite Bob's world; own files are local and truthfully labelled; current model quote visible before optional AI; user can save/reopen a playable local prototype. Physical Android appearance and FPS require actual device testing, not inference from unit tests.
