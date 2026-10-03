# CODEX TASK — WORLDIFACT × OpenAI dots via official MCP/plugin integration

Prepared: 2026-10-02

Status reviewed 2026-10-03: implementation remains an unconnected draft in PR #170. See `DOTS_MCP_STATUS_20261003.md` for reproduced defects, repairs and unresolved provider/granular-authorization gates. Do not infer completion of the phases below from the presence of `/mcp` source code.
Repository: `teslaeco/WORLDIFACT`
Base commit: `e6521fab1542528142bc6e102d2dd6f98e486dd9`
Target branch: `codex/dots-worldifact-mcp`

## Goal

Make WORLDIFACT usable from ChatGPT, Codex, and OpenAI dots through the supported Plugin/MCP path so an authorized agent can inspect a user's WORLDIFACT worlds/models and, after explicit authorization, start the existing guarded world/3D-model workflows.

This is **not** an instruction to automate `chatgpt.com`, scrape OpenAI, imitate a dot, embed private ChatGPT UI, or bypass plan/region/account restrictions.

## Non-negotiable production boundaries

Preserve all current WORLDIFACT behavior and security controls, especially:
- Stripe, PayPal, subscriptions, points/credits, checkout return behavior and customer balances.
- Existing provider-spend protections, including the USD 1.75 Astra per-job guard.
- Existing Oracle/Codex/Blender generation behavior, 15-minute request timeout, no automatic paid retry, receipt recovery, idempotency and failed-job settlement/refund rules.
- Existing account isolation and Supabase-backed WORLDIFACT identity.
- Existing Studio and Game Lab routes and current model library behavior.
- No anonymous generation/write path and no cross-account access.
- No paid provider request in tests, CI, smoke tests, installation or plugin discovery.
- No secrets in source, logs, browser bundles, GitHub output or command arguments.

Do not duplicate billing, entitlement or generation logic inside MCP handlers. MCP tools must call/refactor the existing trusted server-side domain functions so there is one source of truth.

## Phase 1 — MCP transport

Add the official Node MCP SDK and Zod dependencies and expose a production Streamable HTTP endpoint at:

`https://worldifact.xodobrox.workers.dev/mcp`

Integrate it into the existing Cloudflare Worker architecture rather than starting a second public service.

Implement the minimum tool set with accurate schemas and annotations:

1. `get_worldifact_status`
   - Read-only.
   - May return only non-sensitive public readiness/status information.
   - No account required.

2. `get_profile`
   - Read-only, authenticated.
   - Returns a minimal connected-account profile resolved from validated MCP credentials.
   - Mark with the OpenAI profile metadata where supported.

3. `list_my_worlds`
   - Read-only, authenticated, scope `worlds:read`.
   - Only worlds owned by the authenticated user.

4. `get_my_world`
   - Read-only, authenticated, scope `worlds:read`.
   - Exact owned world only.

5. `create_or_update_world`
   - Write tool, authenticated, scope `worlds:write`.
   - Validate the same WORLDIFACT world schema/limits already used by `/api/worlds`.
   - Preserve ownership and optimistic/idempotent behavior.

6. `list_my_models`
   - Read-only, authenticated, scope `models:read`.
   - Only models available to that account under existing WORLDIFACT rules.

7. `start_3d_model`
   - Write tool, authenticated, scope `models:generate`.
   - Route into the existing Studio entitlement/reservation/Oracle pipeline.
   - Never create a second billing path.
   - Require explicit prompt/reference inputs and return the existing job/receipt identity.
   - Never silently retry a paid provider call.

8. `get_generation_status`
   - Read-only, authenticated, scope `models:read`.
   - Query only the authenticated user's existing job.

9. `get_model_download`
   - Read-only, authenticated, scope `models:read`.
   - Reuse existing download/subscription rules; do not weaken them.

Use concise structured responses suitable for ChatGPT/Codex/dots. Tool names/descriptions must be factual and must not manipulate model selection.

## Phase 2 — OAuth 2.1 for MCP

The current WORLDIFACT browser account is cookie-based. Do **not** reuse browser cookies as MCP authentication.

Implement/attach an OAuth 2.1 authorization flow that meets the current MCP authorization contract:
- protected resource metadata under the appropriate `/.well-known/oauth-protected-resource` URL;
- authorization-server discovery metadata;
- authorization-code flow with PKCE `S256`;
- correct `resource` propagation and audience binding;
- issuer, audience/resource, expiry/not-before and scope validation on every MCP request;
- support the OpenAI host registration mode selected for this deployment (CIMD, DCR, or a predefined client) without weakening verification;
- proper `401` / `WWW-Authenticate` challenges;
- per-tool `securitySchemes`.

Required scopes:
- `profile:read`
- `worlds:read`
- `worlds:write`
- `models:read`
- `models:generate`

Prefer an established OAuth-capable identity provider compatible with WORLDIFACT's existing Supabase account identity rather than inventing a new auth system. If the current provider cannot satisfy required MCP OAuth metadata/client-registration/audience semantics, stop and document the exact blocker instead of deploying insecure custom auth.

## Phase 3 — WORLDIFACT UI

Add a small integration surface in WORLDIFACT, e.g. `/integrations/openai`, labeled truthfully:

**Connect WORLDIFACT to ChatGPT / Codex / dots**

It may explain that WORLDIFACT is connected as a Plugin/MCP tool provider. Do not claim that a dot is embedded in WORLDIFACT.

Show:
- MCP readiness state;
- whether authenticated tools are configured;
- connection/privacy explanation;
- current scopes;
- a copyable MCP endpoint only after the endpoint is actually live and verified.

Do not expose secrets or OAuth tokens in the page.

## Phase 4 — Plugin package

Add the portable plugin metadata needed by current OpenAI plugin tooling:
- root `mcp.json` with the remote Streamable HTTP WORLDIFACT MCP server;
- plugin metadata/skills only where they add truthful workflow guidance;
- no hidden instructions, no preference manipulation, no unsupported claims.

A WORLDIFACT skill may guide an agent through:
1. inspect status/account;
2. inspect or create a world;
3. start one authorized 3D generation;
4. poll the exact existing job;
5. surface the finished model;
6. never create a second paid job unless the user explicitly requests another generation.

## Phase 5 — MCP Events (follow-up ready)

Design the integration so we can later add MCP Events for:
- `model.generation.completed`
- `model.generation.failed`
- `world.updated`

Do not enable outbound event subscriptions until the base MCP/OAuth integration is fully verified. Event delivery must preserve account ownership and contain no private model payload beyond what is required.

## Verification

Add tests that exercise the real Worker handler and MCP transport:
- initialize / tool listing / tool call;
- input validation and response schemas;
- anonymous public status succeeds;
- private tools require OAuth;
- missing/expired/wrong-audience token rejected;
- insufficient scope rejected;
- cross-account object access rejected;
- generation request uses the existing reservation/settlement path;
- same idempotency key/receipt cannot double-charge;
- failed/rejected work cannot cause a hidden retry;
- existing USD 1.75 provider cap remains intact;
- existing Stripe/PayPal/subscription/credit tests remain unchanged and green;
- CORS/origin behavior is deliberate for MCP and does not weaken browser endpoints;
- no paid provider call in automated tests.

Run:
`npm run verify`
`npm run deploy:check`

Also validate the built endpoint with the current MCP Inspector using Streamable HTTP. Once deployed to a non-production/review endpoint, verify connection in ChatGPT developer mode before any production merge.

## Delivery

Create a focused PR. Include:
- architecture and threat-model notes;
- exact files changed;
- test results;
- OAuth readiness/blockers;
- rollback steps;
- confirmation that payment configuration and existing generation economics were not changed;
- confirmation that no paid generation was triggered by development or CI.

Do **not** merge/deploy production merely because the code compiles. Production merge is allowed only after the full existing CI is green and the MCP/OAuth connection is verified on a safe endpoint.
