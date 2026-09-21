# Codex task — WORLDIFACT shared accounts and cosmic login

Implement the owner's 21 September 2026 request in `teslaeco/WORLDIFACT`:

1. Reuse the exact live Chess Cube Supabase project and existing `auth.users` identity. Do not create another password/user database. Keep provider sessions in Secure/HttpOnly cookies; verify the user server-side for every authorization decision. Add email registration/sign-in/sign-out, shared account restoration and guarded password recovery.
2. Add `/login`, `/account` and `/account/credits`. The login scene loads the original FORGE `polyhedron.glb`, never an approximate primitive. Rotate XYZ with a five-second cycle; cyan/green idle LEDs, changed colors while submitting, success-only paint/sun eruption lasting at most 2.8 seconds followed by the meadow. Respect reduced motion and preserve usable forms without WebGL.
3. Place five original-model clones above the existing water portals, each in its portal's own color. Preserve meadow gameplay, camera, avatars and portal behavior.
4. Free accounts: two FAST generations per rolling 24 hours with downloads; one SLOW generation per UTC calendar day, with SLOW downloads requiring active subscription. Credit-funded requests cost 50. A paid subscription period grants 1,500 credits; configured top-ups add separately verified credits. No invented prices or checkout success.
5. Store quotas, debit/refund state and job ownership atomically per existing account UUID. Preserve global provider safety gates. Sign Studio receipts for their account owner, namespace blueprint request IDs, reject cross-account reads and repeat charges, and refund confirmed failed jobs only.
6. Stripe checkout, customer portal and signed webhooks are configuration-gated. Verify current provider state, products, customer binding, mode and paid invoices. Make grants/reversals idempotent; do not grant on the checkout return URL. Prevent duplicate subscriptions.
7. Reuse the copied same-origin Chess AuthGate through a cookie-backed adapter. Preserve guest play. Do not claim cross-origin SSO into independently hosted FORGE archives, or Google OAuth, until their separate integrations exist.
8. Never hand full SLOW GLB/export bytes to a free browser as a so-called protected preview. Current Oracle has no reviewed raster preview endpoint: preserve the completed result and expose the limitation. This outstanding backend capability must be resolved before claiming the entire requested flow is complete.
9. Run meaningful account, quota, payment and artifact authorization tests; run typecheck/build/HTTP smoke/Worker dry-run. Preserve the repository's recorded browser approval block. Report the unavailable real-browser gate honestly.
10. Prepare a reviewable draft PR and record the exact status. Do not merge, enable billing, make charged generations or deploy production in this task without the owner's applicable final authorization.

## Implemented in this branch

See `SHARED_ACCOUNT_AUDIT.md`, `ACCOUNT_BILLING_SETUP.md` and `CONTEST_STATUS.md`. This brief was executed by Codex in the current task, not merely passed to an unverified background job.
