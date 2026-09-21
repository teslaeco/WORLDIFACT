# Shared WORLDIFACT / Cube Chess accounts

Audit and local implementation: 21 September 2026. This document does not claim production publication or a real end-to-end account test.

## Existing account provider — VERIFIED from public source and deployed code

The current [Cube Chess main revision](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/commit/e134964e9c8b7edc43c26b508973f6fb658af90d) uses Supabase Auth, not a separate custom password server. Relevant source:

- `web/auth/AuthApi.js`: signup, password login, session restoration/refresh, logout and recovery requests.
- `web/auth/AuthGate.js`: login/register/guest presentation.
- `.github/workflows/deploy-pages.yml`: public project URL and publishable/anon-key build input.
- `supabase/migrations/20260729020500_create_profiles.sql`: existing `auth.users` identity with an automatic `public.profiles` trigger.
- `supabase/migrations/20260802_premium_subscriptions.sql`: server-written Chess subscription scaffold, not evidence of live billing.

The public browser release returned HTTP 200. Its deployed `main-ChxXguKx.js` contains the same project URL (`https://oiezgikconcyjvdeshdh.supabase.co`) and a public `sb_publishable_` key. Those public values are the server adapter defaults. No service-role key, user record, password, session or private database content was read. Whether each SQL migration is currently applied was not verified by reading production tables.

A read-only request to `/auth/v1/settings` using that public key returned HTTP 200 with signup enabled and email/Google providers enabled. This confirms the live identity service is reachable; it does not prove email delivery or a completed account login. The pinned WORLDIFACT Chess source `705d7b0fe5fff03a5d7975fe094804af1eef44ea` has the same `AuthApi.js` blob (`892ffbd020671c76d721588c115a1b106502d988`) and `AuthGate.js` as the audited current main. The build adapter checks that exact AuthApi blob before replacement.

Creating a WORLDIFACT identity in this same Supabase project creates an identity usable by the existing Chess account login. WORLDIFACT does not create another user/password database.

## Implemented account boundary

`server/accounts.ts` proxies the existing provider and emits only a minimal verified player profile. Passwords pass to Supabase over HTTPS and are never persisted by WORLDIFACT. The provider's access/refresh tokens are placed in `__Host-` cookies with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` and no Domain attribute. No session token is returned in JSON or exposed to client JavaScript.

Mutating routes require an exact same-origin request. Account inputs and provider responses have byte limits, schema validation, request timeouts, safe errors and provider redirect rejection. IP and hashed-email buckets use `ACCOUNT_LIMITER`, falling back to the existing `GENERATION_LIMITER`. Missing protection fails closed. Privileged `service_role` configuration is explicitly rejected.

`getVerifiedAccount` verifies the access cookie with `/auth/v1/user`; a browser-supplied user ID, decoded-but-unverified JWT or local storage profile is not accepted. Clients should call `/api/account/session` to refresh before retrying after an expired session. Concurrent refreshes coalesce within a Worker isolate and briefly reuse a completed result. Cross-isolate refresh races still rely on Supabase's provider-side refresh reuse policy. Failed refreshes do not clear cookies that a concurrent request might have just renewed.

## Same account and same session are different

The published Chess site originally stores session tokens in localStorage on `teslaeco.github.io`. Those entries do not automatically appear on `worldifact.xodobrox.workers.dev` or the separate FORGE Sites.

The build now replaces only the pinned local Chess foundation's `web/auth/AuthApi.js` with `scripts/lib/chess-auth-proxy.js`. The copied `/apps/chess/index.html` consumes the same WORLDIFACT HttpOnly session and player UUID. Signed-in portal links must use this account-capable entry. The explicit guest entry remains anonymous. Server session restoration precedes a remembered guest identity to avoid silently keeping a logged-in player in guest mode.

This does not change the external GitHub Pages deployment or grant login sessions to independently hosted FORGE archives. The copied Chess profile/social clients that expect an old localStorage bearer token are not migrated by this identity adapter. Do not claim that those database features are fully integrated. Legacy provider buttons route to the WORLDIFACT email page; provider-specific OAuth is not implemented by this adapter.

## Password recovery configuration gate

Recovery is implemented as a PKCE flow with an HttpOnly verifier, not token-bearing browser storage or an arbitrary return URL. The exact callback must be allowlisted in the existing Supabase project:

`https://worldifact.xodobrox.workers.dev/api/account/recovery/callback`

Only after this configuration is verified may the operator set `SUPABASE_RECOVERY_REDIRECT_READY=true`. Until then the recovery route returns a clear unavailable response and sends no recovery email. The callback exchanges the one-time code server-side, installs a short-lived recovery cookie and redirects to `/account/reset`. `/api/account/password` requires that verified recovery session, updates the password, attempts global refresh-session revocation and clears local cookies. The result explicitly reports whether revocation succeeded. Existing JWT access tokens may remain valid until provider expiry even after refresh-token revocation.

Registration uses the provider's existing verification-email configuration and existing site URL; WORLDIFACT does not claim delivery before an email is received. SMTP configuration, email quota, redirect allowlists and real account confirmation are operator verification gates. Reference: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [session model](https://supabase.com/docs/guides/auth/sessions).

## Verification

Local tests cover safe cookie issuance, exact profile extraction, forged/duplicate cookies, cross-origin rejection, input bounds, enumeration-resistant registration, error sanitization, limiter fail-closed behavior, concurrent refresh, logout, privileged-key rejection, PKCE callback binding, password reset, and the copied Chess adapter contract. All provider responses in these tests are fixtures. No production account was created and no email was sent by the implementation checks.
