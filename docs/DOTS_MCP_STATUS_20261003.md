# WORLDIFACT Dots/MCP repair — 3 October 2026

## Actual connection state

PR #170 is a draft. Creating a Dot and its cloud computer did not connect it to WORLDIFACT. The MCP/OAuth implementation has not been merged into production, and a real account link has not been approved. This repair preserves the newer production fixes by merging main `7462a64` into the review branch. The owner subsequently requested completion of the optional connection; the current implementation uses a dedicated Worker OAuth broker, described below. The isolated review deployment and ChatGPT endpoint discovery are now observed; their exact evidence is recorded below.

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

Sixteen core MCP tests pass, including scope enforcement and same-job preparation/start/recovery behavior. Existing regression fixtures use real local account/budget classes with inert upstream calls; they do not debit a real customer or call a paid provider. The broker revision's local aggregate verification passes lint and TypeScript and runs 968 tests: 967 pass, and only the retained native Chromium regression is blocked because no Chrome/Chromium executable is installed in this executor. That test remained enabled and subsequently passed remotely. Separate local DEMO HTTP/origin checks, production build, production Worker packaging (`deploy:check`) and isolated-review Wrangler dry-run pass. These tests do not establish an authenticated live connection.

### Remote and isolated-review evidence

The broker was published to draft [PR #170](https://github.com/teslaeco/WORLDIFACT/pull/170) as commit `f4ad9aa61364af23d6b49114c015a1452cfb3fb0`, tree `a315efb234fa91857b2c2e2538d58a7b93cd3032`. All five repository CI workflows passed, including [Verify WORLDIFACT run 37119124888](https://github.com/teslaeco/WORLDIFACT/actions/runs/37119124888). This evidence applies to that exact broker commit, not to later changes.

Isolated [review run 37119123080](https://github.com/teslaeco/WORLDIFACT/actions/runs/37119123080) passed **968/968 tests**, including the native Chromium regression, and successfully deployed https://worldifact-dots-review.xodobrox.workers.dev at 11:18 UTC on 3 October 2026 as Cloudflare version `88ca9249-d75c-4ba7-bef7-0eb1acb67ff2`. Its first immediate public readiness probe received HTTP 404 for MCP initialize, so the overall review workflow failed despite the successful deployment. The follow-up adds a bounded retry only for that post-deploy HTTP 404; its new exact-head CI/workflow results remain pending.

Subsequent browser inspection showed the review page reporting MCP responding and OAuth configured. At 13:19 Amsterdam time on 3 October, the ChatGPT add-MCP dialog automatically discovered the pinned stable CIMD client/callback and both OAuth endpoints. This verifies discovery, not account authorization. OAuth was not approved, no plugin was created, and no authenticated tool call or generation was claimed.

Cloudflare KV transaction and authorization-code consumption are not atomic against simultaneous duplicate requests. The observed replay guarantee is **sequential** rejection; these tests do not establish strict concurrent single-use or instantaneous global revocation. The browser/PKCE bindings, account checks and expiry still apply. One signed-out login-continuation cookie also means a second simultaneous login flow can replace the first, which then requires restarting.

## Remaining release gates — not solved by fixture tests

1. Finish exact-head CI and the isolated review workflow for the narrow post-deploy 404 retry follow-up. The prior broker commit's five repository CI workflows passed.
2. Complete the public no-cost readiness probe against the deployed isolated endpoint. Its storage remains separate, with no production account ledger/provider secrets and with generation/billing disabled.
3. Complete a real test-account OAuth flow to verify account linking, read tools, scope denial, account isolation, expiry and disconnect. A real ChatGPT/Dots account link is still unverified. The original PR's successful real OAuth test remains a merge gate.
4. Preserve the exact client/callback and endpoint settings discovered by ChatGPT in the review browser. Current pins support ChatGPT HTTPS callbacks, not Codex CLI loopback redirects.
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

The branch remains a draft until the release gates are met. The isolated no-generation review endpoint is deployed and discovery was observed, but no production merge or approved OAuth account link is claimed here. The owner-approved profile-only connection-test plugin was created; it still awaits account linking. No production secret, provider limit, pricing, customer balance or Oracle runtime is changed by this review deployment. No paid generation is used for development or verification. If later released to production, set `MCP_OAUTH_ENABLED` to `false` to disable the broker and authenticated MCP while preserving browser account access, or revert the focused integration release. Existing generated files and receipts must be retained.

Final local and remote test evidence is recorded in `docs/CONTEST_STATUS.md` and the PR description.

## Google login follow-up — pending callback configuration

The owner requested Google login for the created connection-test plugin. The
review deployment omits `SUPABASE_GOOGLE_REDIRECT_READY`, disabling its Google
button. On 3 October 2026, a disposable Supabase PKCE authorization followed by
standard cancellation returned to the existing Chess GitHub Pages site instead
of the review callback. No Google request, account login or token exchange was
performed. The shared Google provider is enabled, but the review callback is
not accepted.

Add this entry to the existing project's Authentication → URL Configuration →
Redirect URLs, preserving the existing Site URL and redirect entries:

`https://worldifact-dots-review.xodobrox.workers.dev/api/account/oauth/callback?state=*`

The review configuration deliberately keeps Google disabled until
the exact callback is verified. Supabase dashboard authentication is currently
pending. The connected Supabase tools do not expose auth configuration changes.
A real workerd regression covers signed-out Dots authorization → Google PKCE
callback → verified browser session → the same broker consent continuation.
All nine broker runtime tests pass with inert provider responses. This is not
evidence of a completed Google login or linked ChatGPT account.

The owner explicitly approved solving the dashboard CAPTCHA. Two secure email/password submissions reached an interactive challenge; after submitting the challenge answer, the dashboard returned to sign-in. A canonical settings-page check also returned to sign-in. The owner subsequently supplied a screenshot showing the dashboard error `Invalid login credentials`. This is a rejected dashboard login, not evidence that CAPTCHA alone caused the failure. Further automated sign-in attempts were stopped. No Supabase configuration was changed; the review Google flag remains disabled. The exact redirect entry can instead be added by the owner in their own Supabase dashboard and verified through the public cancellation probe before deployment.

## Distinguish review from the main sign-in page

The owner reported the disabled Google button as a main-site regression. Their screenshot includes the Dots Optional account-bar link, present in the review build and absent from the last deployed production header. Fresh production UI inspection showed an enabled Google button, then a verified signed-in account with its existing credit balance. This proves the observed production session is usable, not a newly completed Google exchange on every device. Personal account details and balance are intentionally omitted from this public record.

The review login now displays a prominent test-environment notice and a fixed link to the main `/login`. Exact HTTPS-origin matching keeps the notice off production and unrelated hosts. The link sends no referrer and carries no OAuth continuation, state or other query parameters. It never transfers sessions or authorizes Dots. The shared provider callback remains a separate unresolved configuration gate.
