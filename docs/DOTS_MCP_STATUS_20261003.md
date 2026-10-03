# WORLDIFACT Dots/MCP repair — 3 October 2026

## Actual connection state

PR #170 is a draft. Creating a Dot and its cloud computer did not connect it to WORLDIFACT. The MCP/OAuth implementation has not been merged or verified in ChatGPT. This repair preserves the newer production fixes by merging main `7462a64` into the review branch. The owner subsequently requested completion of the optional connection; the current implementation uses a dedicated Worker OAuth broker, described below.

A public, unauthenticated read of the existing identity project's discovery endpoint returned HTTP 404 with `error_code: feature_disabled` and `msg: OAuth server is disabled` on 3 October 2026. This ruled out the original stock Supabase OAuth design. Enabling that shared project's OAuth server is **not** a prerequisite of the replacement broker:

https://oiezgikconcyjvdeshdh.supabase.co/auth/v1/.well-known/oauth-authorization-server

A direct public request to the WORLDIFACT host from the repair executor received Cloudflare HTTP 403 / error 1010. This is not evidence of an application failure or a working MCP deployment. No bypass was attempted.

## Reproduced defects and repairs

- MCP accepted a valid same-issuer token with the generic `authenticated` audience and an unrelated OAuth client ID. The active broker path now accepts only its own dedicated credentials bound to the exact MCP resource, reviewed client, approved scopes and account. A browser Supabase JWT cannot authenticate an MCP call. User-editable metadata never grants access.
- Browser-account configuration incorrectly implied MCP configuration. MCP now requires its enable flag, OAuth storage and explicit resource, client and callback pins, remains disabled when these are absent, and reports configuration separately from a verified connection.
- The original Supabase consent proxy accepted a broad family of ChatGPT callbacks and rechecked only the callback before approval. The replacement broker validates the pinned client/callback and S256 request, renders explicit granular consent, and binds approval to both the initiating browser and the verified account. The legacy consent endpoint is unavailable while broker mode is enabled.
- Private tool authentication returned only a tool result with HTTP 200. The repair adds the standard HTTP 401 / `WWW-Authenticate` challenge while retaining the OpenAI linking metadata.
- MCP used wildcard CORS without validating browser origins. Invalid origins now fail before tool execution; browser cookies do not authenticate MCP calls.
- Repeating the same old `start_3d_model` call created a new prepared receipt every time. An inert test with the real account/budget classes reproduced two UUIDs and two simulated charges. Preparing and starting are now separate: the start requires the exact prepared receipt and unchanged input and reuses existing Studio idempotency. No real customer balance or provider call was involved in the regression.
- Unsupported fields and generation profiles were silently dropped/defaulted. Runtime validation now rejects unsupported input instead of quietly turning a request into STANDARD text-only generation.
- Cloudflare's Worker-first routing covered only `/api/*`. The configuration now explicitly routes MCP, OAuth authorization/token and discovery paths to the Worker instead of the SPA asset fallback.
- Consent is bound to the current account/authorization flow. Switching accounts before approval rejects the old transaction. A signed-out request resumes through a short-lived, same-browser login continuation.

## Current broker design

`server/mcpOAuth.ts` uses `@cloudflare/workers-oauth-provider` pinned to `1.2.1` on the same Worker. Supabase remains the existing browser identity verifier, not the MCP authorization server. No shared-project OAuth enablement, unrestricted dynamic registration or third-party Supabase refresh token is required.

- The Worker publishes its own issuer, `/oauth/authorize` and `/oauth/token`; protected-resource metadata names the exact canonical `/mcp` resource.
- The reviewed configuration pins the OpenAI CIMD client `https://chatgpt.com/oauth/client.json` and callback `https://chatgpt.com/connector_platform_oauth_redirect`. The package negotiates the current plural CIMD authentication-method metadata, including `none` when offered alongside `private_key_jwt`. No client-registration endpoint is exposed.
- Authorization requires the code flow, S256 PKCE and the exact resource/callback. Successful and denied authorization responses include the issuer (`iss`, RFC 9207). Discovery advertises only the implemented authorization-code grant and public-client authentication method `none`.
- Consent grants individual `profile:read`, `worlds:read`, `worlds:write`, `models:read` and `models:generate` permissions. The MCP dispatcher independently checks the permission required by each tool. Identity scopes are not substituted for these permissions.
- The broker first verifies the current browser access token with Supabase. Its grant properties contain only that verified account ID, access token and expiry, encrypted by the OAuth library. Browser access/refresh tokens are never returned to the MCP client; no refresh token is stored or issued by this integration.
- Dedicated access expires no later than the source session and at most one hour after connection. Every authenticated MCP request revalidates the source token/account with Supabase. An expired or rejected source session requires reconnection; the broker never refreshes it silently.
- The consent POST checks same-origin submission, the library's browser-bound transaction cookie, expiry and the original account. `/api/mcp/connection` lists only that signed-in user's grants and permits an explicit same-origin disconnect. Credential properties are not included in that response.
- OAuth storage and rate limits are separate from customer generation budgets. Authorizing or viewing a connection does not generate, reserve points or pay a provider. Existing receipt, input, account and point-ceiling checks still govern any later explicit model start.

## Verification and limitations

Eight genuine Miniflare/workerd tests execute the pinned OAuth library against inert OpenAI metadata and Supabase identity fixtures. They pass discovery/CIMD negotiation, authorization and token exchange, source-expiry limits, granular downscoping, rejected client/callback/resource/PKCE requests, browser-bound login continuation, cross-origin/account-switch rejection, denial, sequential code replay rejection, account-scoped grant listing and disconnect. They verify that dedicated credentials differ from the source session and that no refresh token or source credential appears in responses.

Sixteen core MCP tests pass, including scope enforcement and same-job preparation/start/recovery behavior. Existing regression fixtures use real local account/budget classes with inert upstream calls; they do not debit a real customer or call a paid provider. The broker revision's local aggregate verification passes lint and TypeScript and runs 968 tests: 967 pass, and only the retained native Chromium regression is blocked because no Chrome/Chromium executable is installed in this executor. That test remains enabled for exact-head remote CI. Separate local DEMO HTTP/origin checks, production build, production Worker packaging (`deploy:check`) and isolated-review Wrangler dry-run pass. Exact-head remote CI remains pending; no browser or authenticated live-connection success is inferred from these results.

Cloudflare KV transaction and authorization-code consumption are not atomic against simultaneous duplicate requests. The observed replay guarantee is **sequential** rejection; these tests do not establish strict concurrent single-use or instantaneous global revocation. The browser/PKCE bindings, account checks and expiry still apply. One signed-out login-continuation cookie also means a second simultaneous login flow can replace the first, which then requires restarting.

## Remaining release gates — not solved by fixture tests

1. Finish exact-head CI and packaging with the broker and optional connection UI included.
2. Deploy and inspect the isolated review endpoint with separate OAuth storage, no production account ledger/provider secrets, and generation/billing disabled. The review deployment is still pending at this checkpoint.
3. Run the public no-cost readiness probe, then a real test-account OAuth flow to verify account linking, read tools, scope denial, account isolation, expiry and disconnect. A real ChatGPT/Dots account link is still unverified. The original PR's successful real OAuth test remains a merge gate.
4. Verify the exact OpenAI request/client metadata/callback on that live flow. Current pins support ChatGPT HTTPS callbacks, not Codex CLI loopback redirects.
5. Merge only after the review-endpoint OAuth check and required CI pass. Main pushes automatically deploy production, so a merge is a deployment action.

Required Worker configuration (the committed review configuration is not evidence of live provisioning):

| Worker variable | Required value |
| --- | --- |
| `MCP_OAUTH_ENABLED` | Exact string `true`; absent/false disables the broker |
| `OAUTH_KV` | Dedicated OAuth KV binding, separate for review and production |
| `MCP_RESOURCE_URL` | Exact canonical HTTPS MCP resource ending in `/mcp` |
| `MCP_OAUTH_CLIENT_IDS` | Reviewed OpenAI CIMD URLs; current pin `https://chatgpt.com/oauth/client.json` |
| `MCP_OAUTH_REDIRECT_URIS` | Exact corresponding ChatGPT HTTPS callbacks; maximum 10; no query/hash/wildcard |
| `ACCOUNT_LIMITER` | Connection rate limiter; configured fallback `GENERATION_LIMITER` is supported |

The authorization issuer derives from the canonical MCP resource origin. Supabase configuration remains independent and is used only for existing account verification. CIMD resolution requires the configured `global_fetch_strictly_public` compatibility flag.

## User-facing status and no-cost checks

The review branch adds `/integrations/openai` and an optional Dots entry in the shared account bar. It distinguishes a responding transport, configured OAuth and account-scoped grant status. The interface does not turn configuration alone into proof of a working ChatGPT/Dots link. Viewing it never generates a model or spends points.

Run `node scripts/check-mcp-readiness.mjs https://<review-host>/mcp` for public protocol/discovery checks only. No token, account write, generation, OAuth registration or consent is sent. Passing this check does not prove authenticated connection or generated-model quality.

References used for the initial investigation:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/

## Rollback and boundaries

The branch remains a draft until the release gates are met. An isolated no-generation review deployment is prepared but has not yet been verified; no live deployment or account link is claimed here. No production secret, provider limit, pricing, customer balance or Oracle runtime is changed by the local repair. No paid generation is used for development or verification. If later deployed, set `MCP_OAUTH_ENABLED` to `false` to disable the broker and authenticated MCP while preserving browser account access, or revert the focused integration release. Existing generated files and receipts must be retained.

Final local and remote test evidence is recorded in `docs/CONTEST_STATUS.md` and the PR description.
