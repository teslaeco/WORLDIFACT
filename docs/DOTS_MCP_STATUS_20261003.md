# WORLDIFACT Dots/MCP repair — 3 October 2026

## Actual connection state

PR #170 is a draft. Creating a Dot and its cloud computer did not connect it to WORLDIFACT. The MCP/OAuth implementation has not been merged or verified in ChatGPT. This repair preserves the newer production fixes by merging main `7462a64` into the review branch.

A public, unauthenticated read of the existing identity project's discovery endpoint returned HTTP 404 with `error_code: feature_disabled` and `msg: OAuth server is disabled` on 3 October 2026:

https://oiezgikconcyjvdeshdh.supabase.co/auth/v1/.well-known/oauth-authorization-server

A direct public request to the WORLDIFACT host from the repair executor received Cloudflare HTTP 403 / error 1010. This is not evidence of an application failure or a working MCP deployment. No bypass was attempted.

## Reproduced defects and repairs

- MCP accepted a valid same-issuer token with the generic `authenticated` audience and an unrelated OAuth client ID. The verifier now requires the exact operator-configured MCP resource audience and approved client ID in addition to the original signed scope, expiry, issuer, subject and upstream verification checks. User-editable metadata never grants access.
- Browser-account configuration incorrectly implied MCP configuration. MCP now requires explicit resource, client and callback pins, remains disabled when these are absent, and reports configuration separately from a verified connection.
- Consent accepted a broad family of ChatGPT callbacks and rechecked only the callback before approval. Authorization-detail reads and approval now validate the same authorization ID, pinned client, exact callback and supported identity scopes. Unnecessary phone access is rejected. A provider's already-approved redirect-only response can prove only the callback pin; the independent MCP token gate still requires the pinned client and resource. That reconnect path remains part of the live OAuth release check.
- Private tool authentication returned only a tool result with HTTP 200. The repair adds the standard HTTP 401 / `WWW-Authenticate` challenge while retaining the OpenAI linking metadata.
- MCP used wildcard CORS without validating browser origins. Invalid origins now fail before tool execution; browser cookies do not authenticate MCP calls.
- Repeating the same old `start_3d_model` call created a new prepared receipt every time. An inert test with the real account/budget classes reproduced two UUIDs and two simulated charges. Preparing and starting are now separate: the start requires the exact prepared receipt and unchanged input and reuses existing Studio idempotency. No real customer balance or provider call was involved in the regression.
- Unsupported fields and generation profiles were silently dropped/defaulted. Runtime validation now rejects unsupported input instead of quietly turning a request into STANDARD text-only generation.
- Cloudflare's Worker-first routing covered only `/api/*`. The configuration now explicitly routes MCP and protected-resource discovery paths to the Worker instead of the SPA asset fallback.
- Consent UI responses are bound to the current account/authorization flow. Old details cannot authorize a new flow and stale responses cannot redirect it.

## Remaining release gates — not solved by a successful build

The current Supabase documentation describes access tokens with `aud: authenticated` and `client_id`; its example does not include a signed `scope` claim. Its `email` and `profile` scopes govern identity disclosure, not granular WORLDIFACT world/model permissions. The stock token contract therefore does **not** satisfy this draft's resource-bound signed-scope verifier or the original task's granular authorization requirements.

Do not remove audience/scope verification just to make login pass. Before enabling this integration:

1. Establish a supported authorization-server configuration or reviewed broker/hook that propagates the exact MCP `resource`, verifies the actual grant, and issues cryptographically bound audience and scopes. The original `profile:read`, `worlds:read`, `worlds:write`, `models:read`, `models:generate` permission design remains a release gate; it is not implemented by renaming OIDC identity scopes.
2. Review the shared Supabase project's OAuth-token access to existing Cube Chess/WORLDIFACT data. Do not enable unrestricted dynamic registration or broad third-party database access as a shortcut.
3. Enable/configure OAuth only after that contract is proven. Use the exact OpenAI client ID and redirect URI supplied by the connection setup, not guessed callback IDs. The current consent UI supports pinned ChatGPT HTTPS callbacks; it does not claim support for Codex CLI loopback redirects.
4. Configure the Worker variables below on an isolated review deployment. The ordinary browser login configuration is independent.
5. Run the public no-cost readiness probe, then use MCP Inspector and a real test-account OAuth flow to verify linking, revocation, account isolation and no-spend read tools. Fixture tests are not evidence of a live OAuth exchange.
6. Merge only after exact-head repository CI, packaging and the review-endpoint OAuth check pass. Main pushes automatically deploy production, so a merge is a deployment action.

Required operator values (not secrets, but no fabricated defaults are installed):

| Worker variable | Required value |
| --- | --- |
| `MCP_RESOURCE_URL` | Exact canonical HTTPS MCP resource ending in `/mcp` |
| `MCP_OAUTH_CLIENT_IDS` | Comma-separated reviewed registered client IDs; maximum 10 |
| `MCP_OAUTH_REDIRECT_URIS` | Exact corresponding ChatGPT HTTPS callbacks; maximum 10; no query/hash/wildcard |

The protected-resource issuer derives from the validated `SUPABASE_URL`, so discovery and token verification cannot silently reference different projects.

## User-facing status and no-cost checks

The review branch adds `/integrations/openai`. It distinguishes a responding transport, syntactically configured OAuth and the still-unverified account connection. It never generates a model or spends points.

Run `node scripts/check-mcp-readiness.mjs https://<review-host>/mcp` for public protocol/discovery checks only. No token, account write, generation, OAuth registration or consent is sent. Passing this check does not prove authenticated connection or generated-model quality.

References verified for this repair:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/

## Rollback and boundaries

All work stays in draft PR #170 until release gates are met. No production setting, OAuth registration, secret, provider limit, pricing, customer account or Oracle runtime is changed by the repair. No paid generation is used for development or verification. If later deployed, unset the three MCP pins to disable authenticated MCP and consent while preserving browser account access, or revert the focused integration release. Existing generated files and receipts must be retained.

Final local and remote test evidence is recorded in `docs/CONTEST_STATUS.md` and the PR description.
