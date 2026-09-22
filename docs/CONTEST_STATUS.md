# WORLDIFAKT — Cloudflare account-request runtime correction

Date: 22 September 2026. Follow-up to merged PR #65.

- The real Google callback failure was reproduced using the actual account module in native Cloudflare `workerd`/Miniflare, with synthetic credentials and an isolated outbound fixture. `redirect: 'error'` throws synchronously in this runtime, before any Supabase request. The unchanged account handler returned the same HTTP 503 as production with **zero outbound calls**; changing the mode to `manual` reached the fixture and returned the expected HTTP 401 for invalid credentials. Fetch binding was independently excluded as the cause.
- The correction uses supported manual redirects and explicitly rejects redirect responses. It never follows a provider redirect or forwards account/payment credentials to a redirected host. Existing PKCE, callback state, verified account identity, secure cookies and finite request deadlines remain enforced.
- The same unsupported option is present in the Stripe, PayPal and original sculpture fetch paths and is corrected there as part of this runtime defect. Payments remain disabled pending the owner's merchant verification and credentials.
- PR #65's timeout/header/diagnostic changes alone did **not** resolve production: after its successful deployment, owned synthetic password and session probes still returned HTTP 503 in approximately 8.2 seconds. Earlier end-to-end timings included client/network overhead and did not prove an upstream timeout. The previous causal timeout claim is withdrawn below.
- Complete real Google sign-in acceptance remains **OPEN** until a real user completes sign-in after this correction. Synthetic failure probes establish connectivity and fail-closed behavior, not successful user authentication.

- Local verification: **348 tests pass / 1 existing Chromium-only test blocked**, 349 total, zero skipped/cancelled. All three new native `workerd` tests pass, including successful fixture PKCE token exchange followed by identity verification and secure session issuance; these are isolated fixtures, not real Google login evidence. Provider redirect regressions cover 301/302/303/307/308, body cancellation, no follow, no secret exposure and no credit grants. The exact already-locked esbuild/Miniflare versions are now explicit development dependencies; no resolved dependency was upgraded.
- Lint has zero errors; TypeScript, real local HTTP DEMO/origin smoke, production build, Worker dry-run and diff check pass. The existing browser restriction is preserved.

Publication and real-user Google acceptance: pending this runtime correction.

---

# WORLDIFAKT — account time budget and Google callback diagnostics (PR #65)

Date: 22 September 2026. Branch: `fix/google-pkce-callback`.

The owner reported the generic Google error after a real login. Supabase Auth logs show successful Google callbacks at 06:23:38 and 06:29:10 UTC, without a subsequent token exchange in the inspected interval. The previous cancellation-only probe verified the redirect allowlist, not a complete successful sign-in.

- The callback now reports a fixed, non-sensitive failure category instead of collapsing configuration, missing/expired browser flow, state mismatch, incomplete callback, provider rejection, rate limit, exchange, service and identity failures into the same message. Raw provider errors, auth codes, states, credentials and user data are never included in these diagnostics.
- Browser guidance distinguishes a lost/mismatched browser session from a provider or service failure. Unknown query values always render the fixed generic message; they cannot inject provider text.
- Publishable Supabase keys are sent in `apikey`; user access JWTs and supported legacy anon JWTs are the only Bearer values. This conforms to the [Supabase API-key contract](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations). Two synthetic invalid-code requests returned the same expected `404 flow_state_not_found` with and without the old Bearer header, so this header cleanup is **not established as the reported failure's cause**.
- An owned production initiation/callback probe with a synthetic invalid code confirmed that the Worker sets its secure flow cookie, recognizes a returned matching flow and does not issue a session for a fake code. No real credential, account code, account creation or paid request was used.
- Existing PKCE, state, exact-origin, provider identity, HttpOnly/Secure cookie and rate-limit protections remain enforced. No cookie/session protection was weakened.
- Direct synthetic Supabase requests returned expected authentication failures after 13,947 ms (GET /user) and up to 14,485 ms (password grant), beyond the old 12-second deadline. Provider requests now have a bounded 25-second budget; the shared browser client allows 80 seconds for at most three sequential bounded provider operations. No automatic retry is added for one-time codes or rotating tokens. The cause of the provider/network slowness itself remains unconfirmed.
- Pending refreshes remain coalesced until completion, with the 15-second result-reuse window starting afterward. Regression tests cover a refresh still pending after 20 seconds and ensure an interrupted exchange is not retried.
- The initial timeout hypothesis was **not established** by these end-to-end timings and is superseded by the native runtime reproduction above. Complete Google sign-in acceptance remains **OPEN** until a real user signs in after the runtime correction.

- A production password-login probe using only a random address under reserved `example.invalid` and a random password returned HTTP 503 after 12,940 ms with the upstream-unavailable error and no session. This independently reproduces a server-to-Supabase failure; it does not use or test a real user's password. It shifts the investigation toward upstream connectivity rather than assuming the user's browser lost its flow cookie.
- Local verification: 342 tests pass; the one existing Chromium-only test is blocked by the unavailable browser binary. TypeScript, lint (warnings only), real HTTP DEMO/origin smoke, production build, Worker dry-run and diff check pass.

PR #65 merged as `e472507de5da5c258d5a2d6dd7cbeff96b9eb1ba` after all five PR checks passed. Production verify `35696853068` and deploy `35696853111` passed 343/343 tests. Cloudflare version `a3b89a41-29dc-4ebf-b573-fe45c89e5b0a` passed release smoke (16 routes, 33 hub assets and 105 foundation assets), but production account probes still returned HTTP 503. This release did **not** fix Google sign-in; the runtime correction above follows from that failed acceptance check.

---

# WORLDIFAKT — login-first and one USD 29.99 price correction

Date: 22 September 2026. Local branch: `fix/worldifakt-login-and-single-price`.
Base production main: `8582b93ce667a0d244abb1ed0397f51099c6af69` (merged PR #63).

## Implementation and review findings

- Owner correction supersedes the former USD 30 top-up price: every paid 1,500-credit offer now costs **USD 29.99**. The page has one paid card, with explicit monthly or one-time purchase selection. PayPal is one-time only; renewal terms and download entitlements remain explicit. Settlement rejects stale USD 30 amounts.
- `/` opens the account page first. `/world` opens the existing meadow and five portals. The account screen uses illuminated depth-styled **WORLDIFAKT** lettering, email registration/login, a Google action and disabled future providers with lowercase “wkrótce dostępne” (the owner’s requested Polish label). Cube Chess names are removed from that screen, while the original app and shared database are preserved.
- Google OAuth with server-side PKCE and verified HttpOnly sessions is implemented against the existing Chess Supabase project. The owner saved the exact WORLDIFACT callback in the same project. A new disposable PKCE authorization/cancellation diagnostic returned to WORLDIFACT with matching state, confirming the allowlist is accepted. The reviewed Google readiness flag is enabled for deployment. See `SHARED_ACCOUNT_AUDIT.md`; no real user was created or signed in.
- The original sculpture proxy currently returns HTTP 502. A bundled 228 KB geometry-only glTF now preserves all original vertices, indices, transforms, 48 meshes and 2,976 triangles. Its poster projects those actual triangles for loading/no-WebGL cases. The shared loader fixes both the entry screen and five portals without depending on the failed proxy. Source hashes and reproduction evidence accompany the assets.
- The five-second XYZ animation and verified-login 2.8-second transition are preserved, with reduced-motion support. Static React rendering confirms login-first routing, provider labels and a single paid price; it is not browser/Android visual evidence.

## Current gates and publication state

- Payment keys remain deferred by the owner pending merchant verification. Card, eligible Google Pay and PayPal integrations stay disabled; no charge, payout change or paid model call occurred. Bank account details were not copied into the repository.
- The owner completed Supabase dashboard sign-in and saved the Google callback. Its redirect has been verified; a real Google sign-in remains untested. The separate password-recovery callback remains an operator configuration gate. The Oracle protected raster preview, existing legacy-receipt recovery and copied Chess legacy social clients remain the separately documented backend/migration gaps; this correction does not claim those were completed.
- Aggregate `npm run verify`: **336 PASS / 1 browser test BLOCKED**, 337 total, no skipped/cancelled tests. The only failure is the existing Chromium-required assertion; Chromium is absent and recorded browser restrictions are preserved. Lint has zero errors; TypeScript, separate real HTTP DEMO/origin smoke, production build, Worker dry-run and diff checks pass. Browser/device appearance remains unverified.
- PR #64 merged as `71282740322db047adfd68f617ea009d7fc4c977` after all five head checks passed. Production verify `35693185139` passed 337/337 tests; deploy `35693185075` succeeded with Cloudflare version `13ccb29c-14f0-49c7-8f4d-e077b018ba6d`. Release smoke verified 16 routes, 33 hub assets and 105 foundation assets. Browser confirmed root login, enabled Google button, future-provider labels and one USD 29.99 price. No successful real Google sign-in was claimed; the owner subsequently reported a callback failure (see the current diagnostic milestone above).

---

# Historical PR #63 — membership and credit packs (price superseded below)

Date: 22 September 2026. PR: https://github.com/teslaeco/WORLDIFACT/pull/63 .

## VERIFIED — code and local checks at PR #63 preparation

- Follow-up: approved monthly membership is USD 29.99 / 1,500 credits. A production-only GitHub Actions step is prepared to pass complete provider secret groups to Cloudflare through captured stdin; it never enables billing. No real secret has been retrieved or uploaded in this session. See `STRIPE_GITHUB_SETUP.md` for exact dashboard fields.
- Owner-approved one-time pack: **USD 30.00 / 1,500 credits / 30 generations at 50 credits each**. Repeat purchases are supported. Separate follow-up subscription offer: **USD 29.99 monthly / 1,500 credits**. No competitor parity claim is made.
- Cards and eligible Google Pay wallets use Stripe-hosted Checkout. PayPal uses server-created Orders v2; the supplied reusable HostedButtons ID is retained as an inactive reference because verified per-account binding was not established for that snippet.
- Payment UI shows price, one-time nature, provider availability, test mode, return/cancel/pending states, and explicit notice that packs alone do not activate membership or unlock SLOW downloads.
- Provider amount, currency, quantity, merchant/customer/account ownership, environment and settlement are checked server-side. Return URLs never grant credits. PayPal approved-order webhooks can complete an owned approved payment even if the browser does not return.
- Transactional grant IDs prevent duplicates across capture/webhook paths; refund tombstones prevent late fulfillment from restoring reversed funds. PayPal disputes can hold generation/download access pending review.
- Sandbox/test wallets, customers and orders have a separate Durable Object namespace. Provider/ledger mode mismatch fails closed.
- Stripe historical one-time Price allowlist supports fixed-price settlement/refunds after rotation. Recurring Price/interval changes still require a separate migration.
- No bank account numbers/screenshots were copied into repository files, bundles or payment code. Payout details remain an operator-dashboard task. No claim of encrypting the user's original chat attachments is made.
- Latest full local run: **316 tests PASS / 1 browser test BLOCKED** (317 total, zero skipped/cancelled). The sole failure is the required Chromium availability assertion. Provider tests use stubs; they are not real PayPal/Stripe acceptance evidence. The eight new secret-sync tests and monthly price/settlement checks pass.
- TypeScript/build, local HTTP DEMO/origin smoke, lint (warnings only), Worker dry-run and diff check passed. `npm run verify` was attempted; the existing native Chromium regression is unavailable locally because Chromium is absent. Recorded browser restrictions are preserved; no Android/visual pass is claimed.
- Implementation review corrected test/live wallet mixing, interrupted PayPal browser-return recovery, historical Stripe price fulfillment and repeated-capture UI state.

## BLOCKED — activation, payouts and full commercial release

1. Configure Stripe merchant credentials, exact Price and signed webhook; enable Google Pay and validate eligible-device checkout.
2. Configure PayPal REST app credentials, merchant ID and verified webhook. The public HostedButtons SDK snippet is not sufficient for automatic account credits.
3. Choose and verify the Revolut payout destination in the payment provider's dashboard. No bank account was added or changed, and no payout destination is claimed connected.
4. Configure the approved USD 29.99 monthly recurring Price. One-time USD 30.00 packs do not unlock subscription-only SLOW downloads.
5. Complete provider sandbox create/approve/capture/credit/refund acceptance and browser/mobile review. Existing protected free-SLOW image preview and account migration limitations remain from the earlier milestone.
6. This preparation-stage publication block was subsequently resolved: PR #63 merged as `8582b93ce667a0d244abb1ed0397f51099c6af69`; verify run `35688114182` and deploy run `35688114247` succeeded. Cloudflare version: `800e051d-5646-4e43-bb67-59add99e59a5`. Payments remained disabled. The owner then rejected the split-price display; the current correction above supersedes it.

Executed task: `docs/CODEX_TASK_PAYMENTS_20260922.md`. Configuration and primary provider sources: `docs/ACCOUNT_BILLING_SETUP.md`. Remote CI results are recorded in PR #63; the earlier shared-account CI below is historical evidence, not evidence for this new payment revision.

---

# WORLDIFACT — shared accounts and cosmic login (review branch)

Date: 21 September 2026. Branch: `feat/shared-accounts-cosmic-login`.
Base main: `360b9e0a9d86cfcf9f395a448d636c1073fc75b4`.

## VERIFIED — implemented, checked locally and in PR CI

- Existing Chess Supabase project `oiezgikconcyjvdeshdh` is reused; live read-only settings check returned HTTP 200, signup enabled, email/Google configured. No second password database, account creation or email send occurred during testing.
- Secure HttpOnly cookie login/register/session/logout; existing account UUID verified upstream for authorization; rate limits, origin checks and guarded PKCE password recovery.
- Same-origin copied Chess identity uses the existing AuthGate via a pinned-source adapter. Guest play remains available. External original Chess/FORGE sessions are separate, and copied Chess legacy social-data features and Google OAuth are not claimed migrated.
- `/login`, `/account`, `/account/credits`, `/account/reset`, visible Sign in navigation and authenticated Chess launch.
- Original FORGE sculpture verified by actual public GET: **9,807,116 bytes**, SHA-256 `c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a`. 48 meshes / 2,976 triangles retained. Five-second XYZ animation, cyan/green LEDs, five portal colors, NASA Earth background, success-only 2.8-second sun/paint effect, reduced-motion and WebGL fallback.
- Atomic per-account ledger: 2 free FAST / rolling 24h, 1 free SLOW / UTC day; credit-funded generation 50 points; subscription grant 1,500 points = 30 generations; confirmed-failure refunds and idempotent settlement.
- Studio receipts bind the account UUID in their HMAC, and blueprint idempotency IDs have a separate cryptographic namespace. Legacy Oracle routes cannot bypass account enforcement.
- Free SLOW GLB/PBR/FBX/BLEND bytes are denied server-side. Previously generated owned results unlock when subscription is active. Uncertain submissions retain their reservation and expose a status-review state rather than automatic resubmission/refund.
- Stripe integration is implemented but **BLOCKED / NOT ENABLED** until merchant secrets and verified webhook configuration exist; the owner subsequently approved USD 30 / 1,500 credits (see the payment milestone above). The owner subsequently selected USD 29.99 per month (see the current payment milestone). Checkout return URLs never grant credits. Tests cover paid invoice reconciliation, replayed/out-of-order events, duplicate subscriptions, refunds, customer binding and forged signatures.

## Verification

- **272/272 non-browser tests PASS**, no failures/skips in that subset. All new account/credit/security tests use stubs and are not live payment or live generation proof.
- TypeScript, production build, real local HTTP DEMO/origin smoke, Worker dry-run and diff whitespace check: **PASS**. Lint: zero errors; existing and hook/HMR warnings remain.
- `npm run verify` was executed; its browser-specific existing Chromium test cannot run here because Chromium is absent. The recorded browser approval block is respected; no alternate browser or renderer used. Browser/Android visual acceptance remains **BLOCKED / NOT VERIFIED**.
- [PR #63](https://github.com/teslaeco/WORLDIFACT/pull/63), source head `784b7e30ac85600e7a3d573e973690dc49ff9614`, tree `c4f90bca2a56d0d3258a5b40536c4fd7c209dcf7`: all six GitHub checks **PASS**. [Verify WORLDIFACT run 35660547707](https://github.com/teslaeco/WORLDIFACT/actions/runs/35660547707) passed the complete `npm run verify`, pinned Chess/Terra foundation assembly and Worker dry-run. This CI result does not establish visual or physical-device acceptance.
- No paid AI generation, purchase, production deployment or merge was performed.

## NO-GO — full requested commercial release

1. The current Oracle API has no reviewed protected raster-preview endpoint. Free SLOW jobs complete without exposing their full model; UI truthfully reports that the image preview is unavailable. Implement/deploy that backend capability before claiming the complete requested experience.
2. The owner supplied USD 30 / 1,500 credits. The recurring offer is now USD 29.99/month. Configure/test payment providers and webhooks before enabling payment buttons. See the payment milestone above.
3. Allowlist the exact Supabase recovery callback before setting `SUPABASE_RECOVERY_REDIRECT_READY=true`. Existing email/password sign-in and signup use the already configured Chess provider. Validate email-confirmation UX with an authorized real test account.
4. Account enforcement intentionally rejects old anonymous signed receipts. Existing local downloaded originals are preserved. An owner-authorized legacy receipt migration/recovery process is needed before promising old server jobs are available in the new account.
5. Exact PR CI, physical/mobile visual acceptance and owner permission are required before merge/production deployment. This branch is a reviewable implementation, not a claim that the new feature is live.

Task executed: `docs/CODEX_TASK_SHARED_ACCOUNTS_20260921.md`. Auth evidence: `docs/SHARED_ACCOUNT_AUDIT.md`. Billing setup: `docs/ACCOUNT_BILLING_SETUP.md`.

---

# WORLDIFACT — project attachments + Oracle bridge release

Date: 20 September 2026.

## VERIFIED — local attachment release (#57)

- PR #57 **MERGED**: https://github.com/teslaeco/WORLDIFACT/pull/57
- Merge: `8be766130ad56da761ef20bbb2155cfa54a4db36`.
- Production deploy `35504155102`: **SUCCESS**.
- Verify `35504155105`: **SUCCESS**.
- Cloudflare version: `7dbab147-8e17-4edb-935b-ccfb03ff79be`.
- **223 tests PASS**.
- Shop + Game Lab accept max **2 local project references**, max **100 MB each**, across document, 3D, texture, video and ZIP allow-lists.

## VERIFIED — Oracle-backed web bridge release (#59)

- PR #59 **MERGED**: https://github.com/teslaeco/WORLDIFACT/pull/59
- Exact reviewed head `c2fc06bac8743d65279ede9395ea64540b3ee8d4`: **Verify WORLDIFACT SUCCESS** and **Review Oracle project-file patch SUCCESS**.
- Merge: `7efd491926c96cbca61b9eb9fde22696b0d2dbc7`.
- Post-merge Verify `35504945660`: **SUCCESS**.
- Production deploy `35504945607`: **SUCCESS**.
- Cloudflare version: `50c4689e-240e-4716-855c-d5786c904502`.
- **227 tests PASS**.
- Release smoke: **PASS**; no paid AI request.
- Existing production generation remains **LIVE / READY**.
- Existing Oracle bridge remains **CONNECTOR_READY**, connector version **33**.
- Browser now has a fail-closed same-origin project-file client:
  - signed 24-hour project session;
  - slot 0/1 only;
  - 100 MB/file;
  - same-origin and rate-limit checks;
  - raw streaming proxy; Oracle bearer token remains server-side;
  - automatic local fallback when Oracle storage capability is absent.

## VERIFIED — reviewed Oracle v33 patch package

- Reviewed exact current FAST v33 `server.py` SHA-256:
  `1f09db9835e9ee22361e468d051da7e847dbff36fe7e52a2f2c9c6f6337402b9`.
- Reviewed project-file patched `server.py` SHA-256:
  `6795c356d67c72f4aed545505772182f907c9a242ad0cf0076689720a386bb14`.
- `tools/project_files/patch_server.py` adds private `state/project-files` storage with two slots, 100 MB/file, SHA-256 metadata, a 4 GB free-disk floor, seven-day retention, list/delete and health capability advertisement.
- `tools/project_files/install_project_files.py` is rollback-safe:
  - exact source hash required;
  - refuses active model jobs;
  - backs up `server.py`;
  - changes only `server.py`;
  - restarts only `froge-worker.service`;
  - performs authenticated local health verification;
  - rolls back automatically on verification failure;
  - makes **no AI/model request**.
- CI reconstructed the exact current v33 worker from the pinned public source, compiled the patch and installer and passed success/rollback/active-job/source-mismatch tests.

## BLOCKED — Oracle VM runtime installation

- The website has the Oracle project-file bridge deployed, but **Oracle project-file storage is not yet VERIFIED LIVE**.
- The current ChatGPT GitHub connection can merge/deploy WORLDIFACT and the production workflow can sync the existing `ORACLE_ENDPOINT` / `ORACLE_API_TOKEN` into Cloudflare, but the available toolset does **not** expose the Oracle Cloud Shell / SSH private-key execution channel required to replace `~/froge-connector/server.py` and restart the VM service.
- The existing Oracle HTTP v33 API has health/jobs/artifact functions; it has no reviewed self-update endpoint. Do not bypass that boundary through model execution.
- Therefore do **not** claim Oracle-backed file persistence until authenticated `/v1/health` reports:
  - `projectFilesRevision: 1`
  - `projectFileMaxBytes: 104857600`
  - `projectFileMaxCount: 2`
- Until then, the deployed UI remains safely in **LOCAL REFERENCE** mode; ordinary Astra/Oracle model generation remains unchanged.

## Truth boundary

Project files stored locally—or later in the Oracle project-file vault—are references only. PDF/Word/3D/video/ZIP content is not claimed to have influenced GPT-6 Astra or Blender until a separately reviewed parser/import pipeline actually feeds that content to generation. MAKE remains **VALIDATION REQUIRED**.

---

# WORLDIFACT — local project attachments staging

Date: 20 September 2026.

## VERIFIED — implementation scope

- Branch: `feat/project-attachments-100mb-20260920`.
- Added one shared attachment surface to **AI Shop** and **AI Game Lab**.
- Each surface accepts at most **2 project files**, with a hard **100 MB per-file** client validation ceiling.
- Supported local project references:
  - documents: PDF, DOC/DOCX, ODT, RTF, TXT, Markdown, CSV, JSON;
  - 3D: GLB/GLTF, FBX, OBJ, STL, PLY, USD/USDZ, BLEND, MTL/BIN;
  - textures/images: PNG/JPG/WebP/TIFF/BMP/EXR/HDR;
  - video: MP4/WebM/MOV/M4V;
  - ZIP packages.
- Executable / script / HTML content is not accepted by the shared picker.
- Texture/image and video attachments receive local browser previews; document/3D/archive attachments remain local project references.
- The attachment picker uses a best-effort IndexedDB device archive. If browser quota/storage fails, files remain usable in the current session and the UI says persistence failed.
- **Truth boundary:** arbitrary 100 MB PDF/Word/3D/video files are **not** automatically uploaded to GPT-6 Astra, Oracle, suppliers or manufacturing. The existing reviewed image-reference controls remain the only binary reference inputs actually sent into generation. This avoids falsely claiming that unsupported file content affected a model.
- Task brief: `docs/CODEX_TASK_PROJECT_ATTACHMENTS_20260920.md`.
- No paid generation request is required by this change.

## RELEASE GATE

- Exact-head CI must be green before merge.
- Merge and production deployment require explicit owner approval after CI.
- MAKE remains **VALIDATION REQUIRED**.

---

# WORLDIFACT — Fan Queen / swimming / equipment RELEASED

Date: 19 September 2026.

## VERIFIED — PR #56 merged and production deployed

- PR #56: https://github.com/teslaeco/WORLDIFACT/pull/56 — **MERGED**.
- Exact reviewed PR head: `521e4eb4676826fba1ef483cfb13ebf826445275`.
- Exact-head checks: **4/4 SUCCESS**:
  - Verify WORLDIFACT `35471636236`
  - Review FAST draft worker (no paid API) `35471636226`
  - Review FAST Cloud Shell launcher `35471636233`
  - Review FAST v33 installation safety `35471636232`
- Squash merge on `main`: `7e48d076fd71913b14d2271d4e331a0aeeca6e3e`.
- Post-merge main verification `35471761244`: **SUCCESS**.
- Production workflow `35471761219`: **SUCCESS**.
- Verification suite: **220 tests PASS**.
- Production URL: https://worldifact.xodobrox.workers.dev
- Cloudflare version: `c582224b-91c8-444c-9911-5d6333dafe76`.
- Release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 contract, explicit DEMO path and origin rejection. **No paid API call was made by release smoke.**
- Production GPT-6 Astra health remains `generationReady: true`, `mode: READY`.
- Production Oracle bridge remains `CONNECTOR_READY`, connector version **33**.
- Production Studio remains `ready: true`, `photoReady: true`, reason `READY`.

## LIVE gameplay shipped

- Default shared-world avatar points to the exact current MPC2 / 8 Planets Queen source job `99397623-e45c-48dc-95ec-6f84446a54d5`.
- The bounded avatar proxy now accepts up to **48 MB**, allowing the current ~29.5 MB FORGE Queen source while retaining GLB type/header/length validation and read-only source-job provenance.
- The Queen starts without a fan; separately named embedded fan/wachlarz nodes are hidden when exposed by the source GLB.
- Equipment includes Original / Tracksuit / Dress / Casual GAME-preview overlays.
- Fan 1 can be deployed/recalled as a joystick/WASD-controlled drone with follow camera.
- Fan 2 mounts both fan devices horizontally at the shoulders and toggles player flight.
- Missing a portal and entering the river now causes a visible splash, water entry, reduced-speed swimming and swim presentation instead of walking on the water plane.
- Swimmers can still cross/enter portal disks. Exiting the river returns to land. Flight bypasses swimming.
- Rover, doors, audio, portal navigation, mobile joystick, DEMO fallback and WebGL fallback remain covered by the regression suite.
- MAKE remains **VALIDATION REQUIRED**. Outfits, fan drone, swimming and flight are GAME mechanics only.

## Remaining visual QA boundary

- CI and release smoke verify code, route and production deployment behavior; they do not substitute for a physical Android/WebGL visual acceptance pass of the exact Queen GLB, splash appearance, fan alignment or mobile camera framing.
- No new character model was generated and no Oracle/OpenAI generation charge was made for this release.

---

# WORLDIFACT — Fan Queen / river / equipment staging

Date: 19 September 2026.

## VERIFIED — implementation milestone

- Branch: `feat/fan-queen-water-flight-20260919`.
- PR #56: https://github.com/teslaeco/WORLDIFACT/pull/56.
- The shared-world default remains the exact current MPC2 / 8 Planets Queen Oracle source job `99397623-e45c-48dc-95ec-6f84446a54d5`.
- The avatar proxy ceiling is raised from 12 MB to **48 MB**, matching the FORGE builder archive ceiling and allowing the current ~29.5 MB Queen source to pass the bounded avatar route while preserving GLB type/header/length validation and read-only provenance headers.
- The Queen now starts fan-free; separately named embedded fan/wachlarz nodes are hidden when the source GLB exposes them.
- Added GAME-preview equipment:
  - Original / Tracksuit / Dress / Casual overlays;
  - Fan 1 throw/recall drone controlled by the normal joystick / WASD with follow camera;
  - Fan 2 mounts both fan devices horizontally at the shoulders and toggles player flight.
- Added river physics:
  - missed portals cause a splash and water entry instead of walking on the water plane;
  - falling transitions to swimming with reduced speed and swim animation;
  - leaving the river returns to land;
  - portal sweep/near-portal logic remains active for the swimmer;
  - flight bypasses swimming.
- Rover, doors, portal navigation, audio, DEMO fallback and mobile joystick behavior are preserved.
- Task brief: `docs/CODEX_TASK_FAN_QUEEN_WATER_FLIGHT_20260919.md`.
- Exact implementation head `0567a1449506e603124b67691e4f0f8f3714f1ad` passed **Verify WORLDIFACT** including `npm run verify`, foundations, `deploy:check` and hosted Studio no-generation inspection.
- No paid generation request was made by CI.

## GO / NO-GO

- **GO for merge/deploy after this documentation-only milestone re-verifies.**
- Owner explicitly authorized implementation, merge and production deployment in the current conversation.
- MAKE remains **VALIDATION REQUIRED**. Outfit overlays, fans, swimming, drone and flight are GAME mechanics and are not manufacturing claims.

---

# WORLDIFACT — FAST Shop repair RELEASED

Date: 19 September 2026.

## VERIFIED — PR #55 merged and production deployed

- PR #55: https://github.com/teslaeco/WORLDIFACT/pull/55 — **MERGED**.
- Exact reviewed PR head: `bd41fc6038f1233a572f90237fa98d0ea3e69c22`.
- Exact-head checks: **4/4 SUCCESS**:
  - Verify WORLDIFACT `35463297621`
  - Review FAST draft worker (no paid API) `35463297674`
  - Review FAST Cloud Shell launcher `35463297680`
  - Review FAST v33 installation safety `35463297695`
- Squash merge on `main`: `24849fe6d5938079bc7bb84022419e9b4815c6d3`.
- Post-merge main verification `35463416210`: **SUCCESS**.
- Production workflow `35463416201`: **SUCCESS**.
- Production URL: https://worldifact.xodobrox.workers.dev
- Cloudflare version: `e23d3486-15ed-4df8-ac10-87d3c4bc8dfd`.
- Release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 contract, explicit DEMO path and origin rejection. **No paid API call was made by release smoke.**
- Verification suite: **214 tests PASS**.

## VERIFIED — production capability after release

- GPT-6 Astra health: `generationReady: true`, `mode: READY`.
- Oracle bridge: `CONNECTOR_READY`, connector version **33**.
- SLOW Studio: `ready: true`, `photoReady: true`, Oracle `CONNECTOR_READY`, reason `READY`.
- Legacy Oracle FAST profile remains present: `fastReady: true`.
- Legacy worker monetary guard is expired/unconfirmed: `fastBudgetReady: false`. Customer FAST no longer depends on that expired guard.
- Customer **FAST · DRAFT** now uses the server-side GPT-6 Astra blueprint path and renders a labelled local procedural 3D draft.
- Customer **SLOW · QUALITY** remains the detailed Oracle/Blender path with reference-image support.
- FAST output is explicitly **LIVE · GENERATED SPEC / PROCEDURAL DRAFT**; it is not represented as an Oracle production mesh, 2K/4K texture deliverable, manufacturing-ready file, quote or order.
- Interior FAST prompts have a dedicated procedural room preview with floor/walls, sofa, dining table/chairs, TV and pendant-lamp structure.
- Rate limiting, validation, timeouts, origin checks, SLOW signed receipts/idempotency, DEMO fallback and MAKE **VALIDATION REQUIRED** boundaries remain active.

## Production test boundary

- Deployment/readiness and static release behavior are verified without spending on an extra production FAST generation.
- A real user FAST click will make one paid GPT-6 Astra request under the already authorized ongoing LIVE generation configuration.

---

# WORLDIFACT — FAST Shop production repair staging

Date: 19 September 2026.

## VERIFIED — root cause

- Production SLOW / Oracle generation is healthy and the public Studio reports `ready: true`, `photoReady: true`, `fastReady: true`.
- The old Oracle FAST monetary guard in `tools/fast_preview/fast_spend.py` has a fixed `VALID_UNTIL` of **2026-09-18T07:00:00Z**. After that deadline the worker no longer advertises the old `fastBudgetRevision`, so `/api/studio/status` reports `fastBudgetReady: false`.
- That is why the customer FAST button stayed disabled while SLOW continued to work. The failure is not the current OpenAI key, Cloudflare LIVE mode or Oracle connector readiness.
- The current GitHub/Cloudflare release path can deploy WORLDIFACT automatically, but this session does not have the Oracle VM's Cloud Shell SSH key as a GitHub secret. Do not weaken or bypass the expired worker-side spend guard.

## IMPLEMENTED — safe automatic repair path

- Branch: `fix/shop-fast-astra-procedural-20260919`.
- Customer **SLOW · QUALITY** remains unchanged: detailed Oracle/Blender Studio model generation with reference-image support.
- Customer **FAST · DRAFT** is moved off the expired Oracle FAST-spend guard and onto the already deployed server-side GPT-6 Astra `/api/blueprint` path.
- FAST makes exactly one LIVE Astra request, validates the returned `WorldBlueprint + AssetSpec`, and shows a lightweight local procedural 3D draft.
- FAST is explicitly labelled **LIVE · GENERATED SPEC / PROCEDURAL DRAFT**. It does **not** claim an Oracle mesh, production GLB, 2K/4K texture package or manufacturing readiness.
- FAST remains text-only and does not accept reference images; SLOW is the path for image-guided detailed geometry.
- Added an interior procedural preview so prompts for living rooms / dining rooms / bungalow interiors produce a room-like scene instead of a generic tower.
- Duplicate FAST submit is blocked client-side by the existing single-operation guard.
- Existing Oracle FAST worker profile remains internal/legacy and is not silently bypassed.
- Diagnostic output now records `fastBudgetReady` separately from `fastReady`.

## RELEASE GATE

- Merge/deploy is authorized by the owner's current instruction to complete the FAST repair automatically.
- Required before merge: exact-head CI green; no paid generation in CI.
- After merge: main verification and Cloudflare deployment must pass, then production read-only diagnostics must show `generationReady: true` for Astra and SLOW Studio `READY`.
- MAKE remains **VALIDATION REQUIRED**.

---

# WORLDIFACT — AI Shop LIVE recovery RELEASED

Date: 19 September 2026.

## VERIFIED — PR #54 merged and production deployed

- PR #54 **MERGED** by explicit owner approval.
- Squash merge on `main`: `7ebb01966db292a67a67ab15c9e576098f926199`.
- Exact PR head `0825fe3e514e0d1e3fea0bad7caf89b8371e245d`: all 5 required checks **SUCCESS**.
- Post-merge main **Verify WORLDIFACT** run `35459875244`: **SUCCESS**.
- Production workflow `35459875295`: **SUCCESS**.
- Cloudflare production URL: https://worldifact.xodobrox.workers.dev
- Cloudflare version: `1ba15fa0-a86e-4c65-bf4f-7f3acb3814e5`.
- Release smoke: **SUCCESS** and made no paid generation request.
- Production deployment mode: **LIVE**.
- Production `/api/health`: `generationReady: true`, `mode: READY`.
- Production Oracle bridge: `CONNECTOR_READY`, connector version **33**.
- Production Studio: `ready: true`, `photoReady: true`, `fastReady: true`, Oracle `CONNECTOR_READY`, reason `READY`.
- Production secret sync steps for OpenAI and Oracle both completed successfully without exposing secret values.

## LIVE behavior

- **SLOW · QUALITY** uses the existing detailed STANDARD Studio path and supports reference images.
- **FAST · DRAFT** uses the reviewed `fast-draft-v1` path and is exposed only when the worker confirms its FAST capability and monetary guard.
- The old contest launch expiry and application-level cumulative customer-attempt ceiling are removed for ongoing LIVE mode.
- Cloudflare per-IP rate limiting, request/image limits, same-origin checks, signed Studio receipts, duplicate-submit protection, timeouts, safe errors and explicit DEMO fallback remain active.
- No generated asset is automatically manufacturing-approved: GLBs remain **GENERATED-UNREVIEWED** and MAKE remains **VALIDATION REQUIRED**.

---

# WORLDIFACT — AI Shop LIVE recovery / FAST + SLOW staging

## VERIFIED — Shop recovery CI milestone

- Exact code head `5eb656541da4e9ed3dd0fadc7fdb6ad9a5422cbf` passed **Verify WORLDIFACT**: `npm run verify`, pinned foundations, `npm run deploy:check`, and the no-generation hosted Studio inspection all succeeded.
- **Review approved FAST cost guard**, **Review FAST Cloud Shell launcher**, and **Review FAST draft worker (no paid API)** also succeeded on that exact code head.
- PR #54 is mergeable and remains a draft. Production is still **NO-GO** until the owner explicitly approves ongoing paid generation without WORLDIFACT's former global cumulative cap, plus merge and production deployment.
- The remaining per-IP rate limiter and all validation / receipt / idempotency / timeout guards stay enabled.

Date: 19 September 2026.

## VERIFIED — root cause

- The production contest LIVE configuration is time-bounded and its fixed generation expiry is **2026-09-19T07:00:00Z**. The current time is after that boundary, so the Shop correctly falls back to **Generation temporarily unavailable / DEMO** instead of sending an unauthorized paid request.
- The committed base `wrangler.jsonc` remains disabled-by-default.
- The AI Shop already contains the reviewed `fast-draft-v1` worker profile plus the existing STANDARD detailed profile, but the customer mode selector was hidden.
- Current official OpenAI Model Guide was rechecked on 19 Sep 2026: the production model ID remains `gpt-6-astra` through the Responses API. FAST/SLOW in this change are WORLDIFACT 3D worker profiles; they do not invent or swap to a different OpenAI model.
- Existing operational guards remain mandatory: per-IP limiter, request/image size validation, same-origin checks, signed Studio receipts, idempotent submissions, timeouts, safe errors, explicit DEMO fallback and the verified FAST worker monetary guard.

## IMPLEMENTED — branch only, NOT production

- Branch: `fix/shop-live-fast-slow-20260919`.
- Added visible Shop choices:
  - **SLOW · QUALITY** -> existing `standard` profile, default, supports reference images and the detailed quality path.
  - **FAST · DRAFT** -> existing `fast-draft-v1`, 2K/text-only/non-terrain v1, selectable only when the worker confirms `fastReady && fastBudgetReady`.
- Added an explicit ongoing generation budget mode using `GENERATION_REQUEST_LIMIT=unlimited` and no launch-date expiry. In that mode the Durable Object keeps usage/idempotency telemetry but does not block on a cumulative attempt count.
- **Rate limiting is NOT removed.** “No limits” here means no application-level cumulative customer-attempt quota / contest expiry; abuse and safety controls still apply.
- Added `scripts/build-live-generation-config.ts`; the disabled base config remains unchanged.
- Cloudflare release selection now uses `ops/LIVE_GENERATION_ONGOING_20260919`; the expired contest marker is retired on this branch.
- Added/updated tests for unlimited budget semantics, LIVE health readiness, Studio idempotency, release config and visible FAST/SLOW Shop controls.
- Codex execution brief: `docs/CODEX_TASK_SHOP_LIVE_FAST_SLOW_20260919.md`.

## BLOCKED — cost / merge / production gate

- **NO-GO for merge/deploy until CI is green and the owner explicitly approves the ongoing production spend exposure.**
- This branch intentionally removes WORLDIFACT's global cumulative request ceiling. Provider/account limits and retained rate/safety guards still exist, but application-level cumulative spend is no longer capped.
- No paid Astra/Oracle generation call is part of CI or release smoke.
- MAKE remains **VALIDATION REQUIRED** and generated GLBs remain **GENERATED-UNREVIEWED**.

---

# WORLDIFACT — Product Hunt embeds released

Date: 19 September 2026.

## RELEASED — PR #53

- PR #53: https://github.com/teslaeco/WORLDIFACT/pull/53 — **MERGED**.
- Squash merge on `main`: `2df5ffebf865951889ed44685875767965882dd1`.
- Exact-head PR verification: **SUCCESS**.
- Post-merge main verification run `35425274653`: **SUCCESS** — **207/207 tests PASS**, zero failures; foundation assembly and Wrangler dry-run passed.
- Production workflow `35425274680`: **SUCCESS**.
- Cloudflare version: `2dda43d4-702b-4948-8d0f-4af912242683`.
- Public URL: https://worldifact.xodobrox.workers.dev
- Public release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 contract, explicit no-cost DEMO generation path and origin rejection.

## PRODUCT HUNT SURFACES NOW PUBLISHED

- Official featured badge supplied by the owner: `post_id=1254175`.
- Official product-review badge supplied by the owner: `product_id=1321124`.
- Product Hunt comments card supplied by the owner: `https://cards.producthunt.com/cards/comments/5874571?v=1`.
- The section asks for feedback/reviews and does not ask for upvotes.
- Responsive mobile layout and lazy loading are enabled.

## READ-ONLY PRODUCTION STATUS AFTER DEPLOY

At `2026-09-19T05:57:55Z`:

```json
{
  "health": {
    "generationReady": true,
    "mode": "READY",
    "allowance": { "used": 23, "limit": 50, "remaining": 27 }
  },
  "oracleWorlds": {
    "oracle": "CONNECTOR_READY",
    "connectorVersion": 33,
    "characterStandard": 20
  },
  "studio": {
    "ready": true,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "READY",
    "allowance": { "used": 23, "limit": 50, "remaining": 27 }
  }
}
```

- No paid model request was made by the deployment smoke or read-only diagnostic.
- Existing LIVE expiry remains `2026-09-19T07:00:00Z`.
- MAKE remains **VALIDATION REQUIRED**.

---

# WORLDIFACT — Product Hunt comments embed prepared

Date: 19 September 2026.

## PREPARED — NOT MERGED / NOT DEPLOYED

- Branch: `feat/product-hunt-comments-embed`.
- Added the exact Product Hunt comments card supplied by the owner: `https://cards.producthunt.com/cards/comments/5874571?v=1`.
- Added the official Product Hunt featured badge supplied by the owner (`post_id=1254175`) and the official product-review badge (`product_id=1321124`).
- The Product Hunt area is labelled as community feedback, is responsive on mobile, lazy-loads remote Product Hunt assets, and links to the WORLDIFACT Product Hunt product/review surfaces.
- No copy asks for an upvote; the page asks for feedback and reviews.
- No paid API generation, OpenAI/Oracle secret, allowance, model ID or MAKE status changed.
- Merge and production deployment require explicit owner approval after CI is green.

---

# WORLDIFACT — AI Shop generation root-cause fix

Date: 18 September 2026.

## RELEASED — PR #52

- PR #52: https://github.com/teslaeco/WORLDIFACT/pull/52 — **MERGED**.
- Squash merge on `main`: `955eee944dedbe01433dad68e1853bb1fd1a4272`.
- Exact-head verification: **SUCCESS — 206/206 tests PASS**, zero failures.
- Production workflow `35389099460`: **SUCCESS**.
- Cloudflare version: `80a77d03-a19a-4ce9-8cec-aa570b59eeeb`.
- Public URL: https://worldifact.xodobrox.workers.dev

## VERIFIED — root cause

A real public FAST Studio job was accepted as `queued` and then failed on the Oracle worker with the exact worker detail:

`No valid current FAST draft exists.`

The failure was not caused by the browser, depleted allowance or missing Oracle connection. Production at diagnosis still had remaining shared allowance and `/api/studio/prepare` returned a valid signed receipt.

Direct Oracle health advertises the FAST profile/revision, but the reviewed FAST monetary/production guard is not present in production health. WORLDIFACT had therefore been exposing FAST as customer-usable before the complete FAST path was verified.

## VERIFIED — STANDARD production E2E

- Real STANDARD job: `9bd056d7-826a-4508-9330-2db93022091c`.
- State progression: `queued → building → succeeded`.
- Retrieved and validated GLB: **923,624 bytes**.
- Production STANDARD E2E test: **PASS**.
- This consumed one real shared reservation; it is genuine production evidence, not a mock.

## FIX

- FAST submissions now fail closed **before paid reservation** unless both the exact FAST capability and reviewed FAST budget guard are confirmed.
- AI Shop automatically switches a restored FAST draft to STANDARD when FAST is not fully verified.
- Failed/cancelled restored jobs are archived and cleared automatically after status recovery; the user's description is preserved.
- STANDARD remains the active verified customer 3D generation path.
- No secret, model identifier or Oracle credential changed.
- MAKE remains **VALIDATION REQUIRED**.

## POST-DEPLOY READ-ONLY STATUS

At `2026-09-18T20:02:44Z`:

```json
{
  "health": {
    "generationReady": true,
    "allowance": { "used": 23, "limit": 50, "remaining": 27 }
  },
  "studio": {
    "ready": true,
    "reason": "READY",
    "oracle": "CONNECTOR_READY",
    "photoReady": true,
    "fastReady": true,
    "fastBudgetReady": false,
    "allowance": { "used": 23, "limit": 50, "remaining": 27 }
  }
}
```

The Shop uses both FAST readiness signals, so `fastBudgetReady:false` forces the customer flow to STANDARD instead of the broken FAST path.

---

# WORLDIFACT — LIVE generation restored after Product Hunt allowance exhaustion

Date: 18 September 2026.

## RELEASED — PR #51

- PR #51: https://github.com/teslaeco/WORLDIFACT/pull/51 — **MERGED**.
- Squash merge on `main`: `02e04e9a2194a01b124cb67ed16a7f48fef6aaa0`.
- Exact-head verification `35372652498`: **SUCCESS** — **205/205 tests PASS**, zero failures.
- Post-merge verification `35372838941`: **SUCCESS**.
- Production workflow `35372839006`: **SUCCESS**.
- Cloudflare version: `c05df2e0-6487-4d28-b317-e7946f9009e4`.
- Public URL: https://worldifact.xodobrox.workers.dev
- Public release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 contract, explicit no-cost DEMO path and origin rejection.

## VERIFIED — generation restored

Production read-only diagnostic after deployment:

```json
{
  "health": {
    "generationReady": true,
    "mode": "READY",
    "allowance": { "used": 15, "limit": 50, "remaining": 35 }
  },
  "oracleWorlds": {
    "oracle": "CONNECTOR_READY"
  },
  "studio": {
    "ready": true,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "READY",
    "allowance": { "used": 15, "limit": 50, "remaining": 35 }
  }
}
```

- The Durable Object counter was **not reset**. The 15 historical reservations remain counted.
- The new cumulative ceiling is **50**, leaving **35** reservations at this verification point.
- Fixed contest expiry remains **2026-09-19T07:00:00Z** and the existing per-IP rate limiter remains active.
- `/api/health` now reads the real persistent allowance and stops advertising LIVE when the allowance is exhausted.
- AI Game Lab stops showing Astra as available after a 429/503 response.
- AI Shop no longer presents a failed/cancelled restored job as an endlessly running multi-hour generation; it provides **Start a new model**, safely archives the old receipt and preserves the draft.
- No secret, OpenAI key, Oracle credential or model ID changed. MAKE remains **VALIDATION REQUIRED**.

---

# WORLDIFACT — restore LIVE generation after launch allowance exhaustion

Date: 18 September 2026.

## VERIFIED — current incident
- Production release from PR #50 is healthy, but the persistent shared generation allowance is exhausted: `used 15 / limit 15 / remaining 0`.
- Customer Android screenshots at launch time show AI Game Lab still labelled "Astra blueprint ready" while a LIVE request returns `Preview generation allowance has ended`, and AI Shop shows a restored failed job with an old multi-hour elapsed timer.
- Root cause #1: `/api/health` previously reported configuration readiness without reading the Durable Object's real remaining allowance.
- Root cause #2: the Shop correctly restored an old receipt, but its failed-state card still rendered the historical elapsed duration and looked like an active hung generation.
- OpenAI Model Guide rechecked 18 Sep 2026: production model remains `gpt-6-astra` through the Responses API: https://developers.openai.com/api/docs/guides/latest-model

## IMPLEMENTED — hotfix branch
- Branch: `hotfix/restore-live-generation-20260918`.
- The cumulative contest ceiling is raised from **15 to 50**. The persistent counter is **not reset**; the 15 already-reserved attempts remain counted, so this change restores at most **35 additional reservations**.
- The fixed contest expiry remains **2026-09-19T07:00:00Z** and the existing per-IP limiter remains active.
- `/api/health` now reads the real shared allowance and advertises `READY` only while `remaining > 0`. When exhausted, it truthfully switches to DEMO instead of showing a misleading Astra-ready state.
- AI Game Lab immediately stops advertising LIVE after a 429/503 response.
- AI Shop no longer shows a failed/cancelled restored job as an endlessly running timer. It exposes a visible **Start a new model** action that safely archives the old receipt before clearing the selection.
- No secret, OpenAI key, Oracle endpoint/token or provider model identifier is changed.
- MAKE remains **VALIDATION REQUIRED**.

## AUTHORIZATION
- The owner previously explicitly authorized API spending through the available API funds and explicitly authorized merge/deploy for the launch recovery. This hotfix uses that authorization while retaining the hard cumulative ceiling, expiry and rate limiter above.
- Merge/deploy only after exact-head CI is green.

---

# WORLDIFACT — Product Hunt live stability hotfix

Date: 18 September 2026.

## VERIFIED — incident cause
- Customer screenshots show AI Game Lab returning `Preview generation allowance has ended. DEMO is still available.` and AI Shop changing from available earlier in the day to unavailable after a long failed job.
- The production safety design uses one persistent Durable Object counter for Astra blueprints, Studio and Oracle submissions. Reservations are cumulative and are intentionally not reset or refunded by deploys or failed requests.
- The authorized contest release ceiling remains 15 total reservations. This hotfix does **not** raise that paid ceiling and does not reset the counter.
- Exact current reserved-attempt count has not been freshly read from production in this branch; no extra paid request is used for diagnosis.

## IMPLEMENTED — no-cost launch resilience
- Branch: `hotfix/producthunt-live-stability-20260918`.
- Astra portal generation falls back immediately to explicit `DEMO · MOCK` when LIVE returns 429/503, without making a second provider request.
- AI Shop exposes an explicit local procedural 3D `DEMO · MOCK` preview while LIVE Studio generation is unavailable. It is never treated as a generated production mesh or MAKE-approved asset.
- Chess Cube 512 no longer starts as a nested heavyweight 3D iframe on the portal route. The route gives an immediate full-screen same-origin guest launch plus the original public build link, reducing mobile WebGL/memory stalls.
- World audio now uses audible locally synthesized 30-second loops with distinct themes for the meadow, Chess, Fix ISS, 8 Planets, Shop and Game Lab. No remote audio asset or generation API is used.

## RELEASED — PR #50
- PR #50: https://github.com/teslaeco/WORLDIFACT/pull/50 — **MERGED**.
- Squash merge on `main`: `bd5dee5b9adff2f53d90150ad8d4c3e7e30e77c7`.
- Exact-head PR verification `35334247265`: **SUCCESS**.
- Post-merge main verification `35343128366`: **SUCCESS**.
- Production workflow `35343128317`: **SUCCESS**.
- Cloudflare version: `4fde199c-c92a-416d-ad18-d18558794f8c`.
- Public URL: https://worldifact.xodobrox.workers.dev
- Public release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 behavior, explicit DEMO generation path and origin rejection. No paid API call was made by the release smoke.
- Production `/api/health`: `generationReady: true`, `mode: READY`, model `gpt-6-astra`.
- Oracle bridge: `CONNECTOR_READY`.
- Production Studio read-only diagnostic: `ready: false`, `photoReady: true`, `fastReady: true`, reason `ALLOWANCE_EXHAUSTED`, allowance `used: 15 / limit: 15 / remaining: 0`.

## CURRENT BOUNDARY
- The no-cost launch resilience hotfix is live: Astra/Shop fall back to explicit `DEMO · MOCK`, Chess uses the mobile-safe full-screen guest launcher with watchdog, and each world has a distinct 30-second local audio loop.
- Restoring additional **real paid** Astra/Studio generation after the persistent ceiling is exhausted still requires a new explicit cumulative request ceiling/cost authorization.

---

# WORLDIFACT — FINAL CONTEST LIVE RELEASE STATUS

Date: 18 September 2026.

## VERIFIED — production LIVE

- Public URL: https://worldifact.xodobrox.workers.dev
- Current documented main release: `ef0ea61d2a378ed4d564b5f175f0780dd3d61fdb` (PR #49).
- PR #47: bounded contest LIVE Astra + Studio generation — **MERGED**.
- PR #48: LIVE-safe no-cost release smoke — **MERGED**.
- PR #49: read-only verification of the succeeded contest Studio GLB — **MERGED**.
- Main CI run `35290764716`: **SUCCESS** — **201/201 tests PASS**, 0 failures, lint 10 warnings / 0 errors, typecheck/build/HTTP smoke/foundation assembly/Wrangler dry-run PASS.
- Production run `35290764801`: **SUCCESS**.
- Cloudflare version: `a707acf7-f67b-4ee3-870b-d6c9cdaf3ba2`.
- Public release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 pinned original app entries/assets, API 404 contract, explicit no-cost DEMO path and origin rejection.
- Production `/api/health`: `generationReady: true`, `mode: READY`, model `gpt-6-astra`.
- Oracle bridge: `CONNECTOR_READY`.
- Studio: `ready: true`, `photoReady: true`, `fastReady: true`, reason `READY`.

## VERIFIED — real paid generation evidence

### GPT-6 Astra
- Real LIVE request: `7c73e32a-9ea5-4446-8cfa-88869ef6ce08`.
- OpenAI provider response: `resp_045e51c5890735c7016aac829307e887d2a354469365e377f6`.
- Result: **LIVE · GENERATED**, 3 validated scene objects.
- This proves the production server-side Responses API path returned a real validated Astra result. It does not claim an arbitrary finished 3D production mesh.

### Studio / Oracle / Blender 3D
- Real Studio job: `3fb599e9-c07b-44d9-ac29-af62f04eede9`.
- Job reached: **succeeded**.
- Read-only artifact verification run `35290860092`: **SUCCESS**.
- Retrieved GLB: **30,344 bytes**.
- SHA-256: `dd42f8c5d5853873de21390c11c1261d3ff86a2af52259bd16231ae850c816c2`.
- Structural report: **10 meshes, 39 nodes, 4 materials, 0 animations, 452 declared vertices**.
- Artifact provenance remains **GENERATED-UNREVIEWED**. Binary/container integrity is verified; visual quality and manufacturing suitability require separate review.

## LIVE safety boundary

- Global generation budget is cumulative and never resets.
- Current production allowance after the verified LIVE calls: **used 9 / limit 15 / remaining 6**.
- Fixed LIVE expiry: **2026-09-19T07:00:00Z**.
- Existing per-IP rate limiting remains active.
- The committed base `wrangler.jsonc` remains disabled-by-default; the authorized contest LIVE deployment is derived at release time from the explicit marker.
- MAKE remains **VALIDATION REQUIRED**. No generated GLB is automatically a manufacturing-approved file, supplier approval, quote or order.
- No Product Hunt submission is claimed by this release record.

---

# WORLDIFACT status — contest LIVE activation release

Date: 18 September 2026.

## VERIFIED
- PR #45 is merged on `main` at `81a4ac2493a9d102d816079b494bd18f255c91da`.
- Post-merge CI and Cloudflare deployment for PR #45 succeeded.
- Official OpenAI Model Guide rechecked on 18 Sep 2026: production model ID remains `gpt-6-astra` via the Responses API: https://developers.openai.com/api/docs/guides/latest-model
- Production secrets for OpenAI, Cloudflare and Oracle are synchronized by the existing release workflow without exposing them to the frontend.
- The contest LIVE release keeps the committed `wrangler.jsonc` disabled by default and derives an ephemeral production config only when `ops/CONTEST_LIVE_20260918` exists.

## AUTHORIZED / BOUNDED LIVE RELEASE
- Owner explicitly approved merge, production deployment and API spending on 18 Sep 2026.
- Global cumulative generation ceiling: **15 reservations total**. Existing Durable Object usage remains counted and is never reset.
- Fixed expiry: **2026-09-19T07:00:00Z** (end of the full Sep 18 Product Hunt launch day in Pacific time).
- LIVE deployment enables:
  - GPT-6 Astra structured `/api/blueprint` for all five WORLDIFACT portal IDs;
  - public pilot access through existing same-origin/rate-limit protections;
  - Oracle bridge jobs;
  - native Studio/Blender 3D jobs;
  - existing per-IP limiter and global Durable Object ceiling.
- Legacy one-off FAST approval override is disabled in the contest config so it cannot reduce or replace the new explicit cumulative ceiling.
- MAKE remains **VALIDATION REQUIRED**. No generated artifact becomes manufacturing-approved automatically.

## FINAL RELEASE GATE
- Branch: `release/contest-live-20260918`.
- Required before merge: exact-head CI green, production dry-run green, then merge is pre-authorized by the owner.
- After merge, the normal production workflow deploys the bounded LIVE config automatically.
- A one-time post-deploy workflow is allowed to spend exactly enough for one real Astra blueprint smoke and one real Studio 3D smoke; it does not repeat on later documentation commits.

---

# WORLDIFACT status — PR #45 generator availability hotfix

Date: 18 September 2026.

- PR #45: https://github.com/teslaeco/WORLDIFACT/pull/45 — **OPEN / CI REQUIRED / NOT MERGED**.
- Base: `main@51b263085241b0dfc85c990e357a69efff59ea1b`.
- Goal: keep every contest-facing Astra blueprint generator usable without turning a disabled paid gate into a dead UI.
- Portal generator and AI Game Lab primary actions now choose the reviewed LIVE path only when `/api/health` reports generation ready; otherwise they run an explicit local `DEMO · MOCK` fallback with no API cost.
- Portal generator drawers are expanded by default for immediate reviewer access.
- No OpenAI/Oracle/Cloudflare secret, quota, allowance, paid-generation flag or Oracle job setting changed.
- Detailed Shop 3D model generation is still a separate Oracle/Blender cost gate and remains unavailable when its allowance is zero.
- Merge/deploy: **BLOCKED pending green exact-head CI and owner approval for merge**.
- Paid LIVE Astra / Oracle activation: **BLOCKED pending a new explicit owner cost cap**.

---

# WORLDIFACT status — contest mobile/EVA/avatar hotfix released

Date: 18 September 2026 (production deployment completed 17 Sep 22:28 UTC).

## Released hotfix

- PR #43: https://github.com/teslaeco/WORLDIFACT/pull/43 — **MERGED**.
- Squash merge on `main`: `13920ffa4b8efb4364a5f486bc23d15bacaf73ae`.
- Final pre-merge workflow: `35281920942` — **SUCCESS**.
- Post-merge verification: `35282057435` — **SUCCESS**, **197/197 tests PASS**, zero failures.
- Production workflow: `35282057350` — **SUCCESS**.
- Cloudflare version: `6822bf81-cc94-4a95-9251-e80647d34272`.
- Public URL: https://worldifact.xodobrox.workers.dev
- Release smoke: **PASS** — 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 behavior, DEMO generation and origin rejection. No paid API call.

## Published behavior

- Fix ISS EVA receives a separate safety hotfix layer with a clamped external camera, visual zero-gravity drift, reset-to-safe-view control and EVA route helper while keeping the reviewed NASA historical ISS exterior visible.
- Android/mobile presentation moves non-critical navigation to a bottom dock and removes large non-critical meadow overlays from the gameplay center.
- Portal pages render the selected world's primary experience before the collapsible Astra generator drawer.
- Game Lab and portal reference uploads accept up to **6 MB** per supported reference flow, with a phone-camera **Scan · BETA** entry.
- The shared meadow defaults to the exact current MPC2 Neptune Queen Oracle job `99397623-e45c-48dc-95ec-6f84446a54d5`; it does not use the old public queen asset.
- A compact player selector also exposes the previously verified Froge MPC2 `rapper-v10.glb` archive model as **Rapper · MPC2 archive**.
- If the exact current Queen artifact is unavailable, the runtime uses a lightweight queen-shaped procedural fallback rather than silently substituting an older Queen file.
- Reading avatar GLBs is read-only and does not reserve generation budget.

## Current generation boundary

The production deployment deliberately keeps the existing cost gate unchanged. Latest read-only post-deploy diagnostic at `2026-09-17T22:28:10.695Z`:

```json
{
  "health": { "generationReady": false, "mode": "DEMO" },
  "oracleWorlds": { "oracle": "CONNECTOR_READY", "connectorVersion": 33, "characterStandard": 20 },
  "studio": {
    "ready": false,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "APPROVED_TEST_PENDING_ACTIVATION",
    "allowance": { "used": 7, "limit": 0, "remaining": 0 }
  }
}
```

This release does **not** claim a new paid Astra generation, a refreshed allowance, ISS manufacturing approval, or a new supplier order.

---

# WORLDIFACT contest status — current canonical state

Date: 17 September 2026.

This file records the current contest/release state. Older milestone detail remains available in Git history and the linked pull requests/workflow runs.

## Production release — PR #42

- PR: https://github.com/teslaeco/WORLDIFACT/pull/42 — **MERGED**.
- Reviewed runtime head: `6fba3120f2082a5521ddb59d7fc31a8bcdecc7a1`.
- Final documentation-only head: `0b595f050da86196802481465fd951b595a8e032`.
- Squash merge on `main`: `17b7d2b92b412b25177965cf1bca2ba8a7b9ff0f`.
- Final reviewed branch verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35272650802 — **SUCCESS**.
- Post-merge main verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35275080694 — **SUCCESS**.
- Production deployment: https://github.com/teslaeco/WORLDIFACT/actions/runs/35275080859 — **SUCCESS**.
- Cloudflare version: `05bcefa8-4a25-45f3-b48b-c92046b47ce2`.
- Public WORLDIFACT: https://worldifact.xodobrox.workers.dev

## Published product state

WORLDIFACT exposes exactly five primary worlds:

1. Chess Cube 512 AI — `/chess`
2. Terra — Fix ISS — `/iss`
3. 8 Planets in 8 Days — `/planets`
4. Enchanted AI Shop — `/shop`
5. AI Game Lab — `/lab`

The single server-side `/api/blueprint` path now accepts the exact five WORLDIFACT portal IDs and reuses the existing GPT-6 Astra Responses API integration instead of creating five independent AI backends. Legacy calls without `worldId` remain compatible and resolve to AI Game Lab.

Chess Cube, Fix ISS, 8 Planets and Enchanted AI Shop have a reusable Astra portal surface with prompt + optional reference image, procedural preview, explicit `LIVE · GENERATED` / `DEMO · MOCK` provenance and `MAKE: VALIDATION REQUIRED`. AI Game Lab keeps its existing native Astra workbench.

Unknown portal IDs are rejected before provider access. The server-only key, schema validation, limiter/budget gate, timeouts, safe errors and no-cost DEMO fallback remain in place.

## Terra / Fix ISS

Fix ISS now describes the product as a repair and preservation simulation exploring the idea of maintaining ISS and treating it as a human-heritage object. It does not claim NASA endorsement and does not claim that preserving the complete station in orbit is proven technically feasible.

The public page says **Sales starting soon** while the model and manufacturing validation are refined. It also labels as **PLANNED** that part of future sales revenue is intended for promotion/awareness supporting the ISS preservation campaign at https://c.org/QkbzHd5kWN. It does not claim a current donation or guaranteed percentage.

For EVA, WORLDIFACT no longer relies only on the previous plain-blue stylized Earth. `public/apps/iss/terra-earth.js` adapts the Terra Observation Earth-source logic reviewed from `Terraforming-Planet/Polar-Sun-Moon-Analysis` commit `c91d59eafb87cf9657f8bf78a5e431fb35665849` under MIT. It uses official NASA GIBS products `BlueMarble_ShadedRelief_Bathymetry` and dated `VIIRS_SNPP_CorrectedReflectance_TrueColor`, with Blue Marble fallback if the dated layer fails. Source/licence attribution is recorded in `ASSET_LICENSES.md`.

The EVA globe is a visual simulator backdrop. It is not labelled as live scientific observation evidence. Terra Observation remains the source/date-aware Earth-observation application.

## Verification evidence

Production verification completed with:

- **191/191 tests PASS**; zero failed, skipped or cancelled tests.
- lint: nine existing warnings, zero errors.
- TypeScript: PASS.
- local HTTP smoke: PASS; deterministic DEMO only, no paid provider request.
- production build: PASS.
- reviewed Chess/Terra/ISS assembly: PASS.
- Wrangler dry-run: PASS.
- deployment: PASS.
- public release smoke: **PASS** for 13 HTML routes, 23 matching hub assets, 103 original app entries/assets, API 404 behavior, DEMO generation and origin rejection.
- deployment smoke made **no paid API generation call**.

## Latest production capability snapshot

Read-only diagnostic at `2026-09-17T21:11:10.610Z`:

```json
{
  "health": {
    "http": 200,
    "mode": "DEMO",
    "generationReady": false,
    "generation": "NOT_REQUESTED"
  },
  "oracleWorlds": {
    "http": 200,
    "oracle": "CONNECTOR_READY",
    "connectorVersion": 33,
    "characterStandard": 20,
    "generation": "NOT_REQUESTED"
  },
  "studio": {
    "http": 200,
    "ready": false,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "APPROVED_TEST_PENDING_ACTIVATION",
    "allowance": {
      "used": 7,
      "limit": 0,
      "remaining": 0
    },
    "generation": "NOT_REQUESTED"
  }
}
```

This proves the deployed connector/capability state only. It does not prove a new paid Astra generation, a repaired original ISS mesh, a supplier-approved manufacturing file, a completed order or a Product Hunt submission.

## Remaining hard blockers before claiming full LIVE model-generation readiness

- New real model generation is not currently armed in production; the current allowance reports `used: 7`, `limit: 0`, `remaining: 0`.
- The current Studio/Oracle mesh workflow does not accept the saved original ISS 3MF/GLB as an input mesh, so no output may be described as a repaired version of that exact source until such an input path exists and is used.
- MAKE remains `VALIDATION REQUIRED` until a real manufacturing partner accepts the exact revision/process/size.
- Payment settlement and supplier ordering are not connected.
- Product Hunt publication/submission still requires explicit owner approval at the final submission step.

## Relevant previous production milestones

- PR #41 customer storefront: https://github.com/teslaeco/WORLDIFACT/pull/41
- PR #40 Shop MAKE options: https://github.com/teslaeco/WORLDIFACT/pull/40
- PR #37 editable next-model draft lifecycle: https://github.com/teslaeco/WORLDIFACT/pull/37

Public URLs:

- Home: https://worldifact.xodobrox.workers.dev/
- Chess: https://worldifact.xodobrox.workers.dev/chess
- Fix ISS: https://worldifact.xodobrox.workers.dev/iss
- 8 Planets: https://worldifact.xodobrox.workers.dev/planets
- AI Shop: https://worldifact.xodobrox.workers.dev/shop
- AI Game Lab: https://worldifact.xodobrox.workers.dev/lab
- Terra Observation inside WORLDIFACT: https://worldifact.xodobrox.workers.dev/terra
- Original Terra Observation: https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/
