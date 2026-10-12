# P0 reliability incident — 2026-10-12 (ongoing, source-only)

## VERIFIED
- Production main remains `d70adf1c627c9bd5721b6a32e6c020fb3ae59869` at investigation start; #271 is published and prevents old terminal failures from reappearing as the active composer result.
- Draft #273 provides authenticated lookup of a completed job by its original signed receipt, independent of the UUID-keyed 64-row cursor page. This change was carried onto isolated branch `fix/p0-generation-library-20261012` without touching billing.
- Hosted #273 CI attempted twice: 2,272 of 2,273 assertions passed; `tests/studio-native-fetch-browser.test.mjs` reported `RUNNING` due to a fixed `--dump-dom`/virtual-time snapshot of an async native fetch scenario.
- Isolated branch changes the Chromium harness to a local browser-debugging protocol loop, reading the real terminal `PASS:` or `FAIL:` state, checking script exceptions and imposing a real deadline. Browser fixtures remain inert and cannot access production.
- Original paid Astra Standard image-to-3D acceptance on October 12 succeeded once at 250 points and yielded verified downloadable model exports (prior #270 evidence). This is one data point, not a reliability guarantee.

## UNKNOWN / BLOCKED
- Cause of earlier `ORACLE_JOB_MISSING` is unknown. Remote Desktop Commander reports Online but terminal calls time out, preventing fresh read-only Oracle VM service/SQLite/provider evidence.
- Durable Oracle POST acceptance and provider charge/hold reconciliation have not been verified. Code review shows reservation -> dispatch claim -> POST and pending return on no response; do not infer safe retries or zero provider cost from a 404.
- Source changes have not been deployed. New branch exact-head hosted CI must pass before any merge; source-only browser test improvement does not repair the Oracle missing-job incident.
- No new paid API requests are authorized and none were performed.

## Required release gates
1. Hosted CI passes on exact P0 branch HEAD, including native Chromium, Miniflare, lint, typecheck, build, HTTP smoke and Worker dry-run.
2. Validate the original signed account/library lookup with off-page results and no account crossover.
3. Collect redacted Oracle/Worker logs and prove durable acceptance/reconciliation before claiming that intermittent missing jobs are fixed.
4. Review precise release scope, preserve Stripe, subscriptions, balances, secrets and provider budgets, then secure GO/NO-GO before production publication.

Status: NO-GO for the complete generation reliability repair until Oracle evidence and integration acceptance exist.

## 2026-10-12 Oracle follow-up (read-only operational evidence)

VERIFIED (LIVE): OCI Cloud Shell CLI, authenticated using its existing delegation-token profile, lists `froge-blender` as RUNNING in eu-amsterdam-1. Its network interface is AVAILABLE. Oracle Cloud Agent reports `Compute Instance Run Command` RUNNING. The published production `/api/studio/status` GET returned `ready: true`, `oracle: CONNECTOR_READY`, Astra/Sol/Luna and standard/fast modes as advertised. These are reachability/capability signals only, not evidence of reliable durable submission.

VERIFIED (SOURCE): Review of `server/studio.ts` on this branch confirms account reservation and global budget reservation, followed by one `markStudioDispatch` claim and one Oracle POST. A failed/uncertain POST transport response can leave an account job in recovery-only state. Do not replay an ambiguously accepted paid POST without provider idempotency and durable-ack evidence.

BLOCKED (VM): A single **read-only** Oracle Cloud Agent health diagnostic was accepted by the OCI command API, but its execution remained `ACCEPTED` / `VISIBLE` with no result during this check. Do not mistake command creation for execution. VM service, SQLite, and provider logs have NOT been read and no VM change, service restart, customer credit mutation, or paid POST was performed. SSH access or a completed agent execution is still needed to gather redacted correlated evidence. Agent queue delay is not proven to cause `ORACLE_JOB_MISSING`.

VERIFIED (CI): PR #274 exact HEAD `4fe2e0fe79b3acc213ca9607c12ab3308a8abe6b` had five successful hosted workflow runs at time of inspection. This applies only to that SHA; any subsequent documentation commit requires fresh exact-HEAD checks.

NO-GO: Production reliability repair is not confirmed. Keep PR #274 unmerged until VM evidence and repeated-generation acceptance gates pass; preserve all assets, holds, and billing configuration.

## 2026-10-12 20:15 CEST — SSH VM read-only evidence (user-operated)

VERIFIED (VM): Authorized SSH from the user's OCI Cloud Shell to `froge-blender` succeeded as `opc`. `froge-worker.service` and `froge-tunnel.service` both returned `ActiveState=active`, `SubState=running`, `NRestarts=0` at inspection time. Root filesystem has 83 GB total, 40 GB used, approximately 44 GB available (48%). A bounded case-insensitive keyword count over 12 hours of the worker's user journal produced no matching lines for the listed exact strings; this does NOT prove absence of failed jobs, and `NRestarts=0` must not be extrapolated to all prior time periods.

VERIFIED (VM): Discovered the live candidate state path `/home/opc/froge-connector/state/jobs.sqlite` among SQLite files in `/home/opc`; unlike archived cleanup files this is under the named active connector directory. Its table schema, current row counts and durable acceptance behavior remain UNKNOWN until a strictly read-only `mode=ro` SQLite check. The screenshot did not include raw job contents or evidence of a successful repeated paid operation.

NEXT: Read metadata and aggregate state counts only (no job IDs/prompts/emails), correlate a previously failed original receipt with redacted Worker/SQLite/Oracle records; do not alter DB, WAL, ledger, VM or subscriptions. NO-GO for production repair until evidence and approved acceptance tests exist.

## 2026-10-12 20:19 CEST — read-only live SQLite aggregate inventory

VERIFIED (USER-OPERATED VM READ): `/home/opc/froge-connector/state/jobs.sqlite` exists (421,888 bytes); `jobs` is the visible application table with columns `id, prompt, state, detail, created, updated`. No `-wal` file was present in this snapshot. SQLite was opened using `mode=ro` and `PRAGMA query_only=ON`. Aggregate rows at time of inspection: `167` total = `92 succeeded`, `74 failed`, `1 cancelled`. Approximate complete-history rates: succeeded `55.09%`, failed `44.31%`, cancelled `0.60%`. No other status was shown in the group-by output.

IMPORTANT LIMITATION: These are **historical Oracle rows**, not a controlled sequential reliability test, nor evidence of why any job failed. The specific `ORACLE_JOB_MISSING` issue concerns an account-signed request with no matching Oracle job row: missing rows are **not countable** by an Oracle jobs-table query. No claim that all 74 failures were `ORACLE_JOB_MISSING` is supported. Correlate original account receipt/Worker dispatch evidence with Oracle acceptance, rather than assuming success from aggregate counts.

NEXT READ-ONLY: group historical failures by safe allowlisted error category and recent creation date, without printing any `id`, `prompt`, raw `detail`, tokens, customer data or private asset paths. Collect stronger redacted cross-tier evidence before fixing dispatch persistence or changing spending and settlements. NO-GO unchanged.

## 2026-10-12 20:28 CEST — failed-detail classification probe

VERIFIED (VM, USER-OPERATED, READ-ONLY): A second Python/SQLite probe selected only the `detail` field for all `jobs` rows with `state='failed'`; it counted `74` rows in total, with **all 74 categorized `OTHER_OR_UNCLASSIFIED`** by a fixed allowlist of keywords in select JSON diagnostic keys. `PRAGMA quick_check` returned `ok`. No user prompts, raw details, job identifiers, payments or account values were printed or modified.

INTERPRETATION: The classifier explicitly defaulted to an empty dict on JSON parse errors and only searched keys `error`, `error_code`, `failurecode`, `failure_code`, `message`, `reason`, `code`. Therefore `OTHER_OR_UNCLASSIFIED` does **not** mean missing error text or no failure cause; the `detail` column may contain plain text, different JSON fields or nested formats. A healthy SQLite quick check is not a proof of reliable Oracle admission.

NEXT (READ-ONLY): Summarize `detail` storage formats (null / JSON object / JSON array / plain text, length buckets); run allowlisted error-pattern counts on *plain text and parsed JSON* without showing raw text; count timestamp-binned recent succeeded/failed jobs. If supported, correlate original signed missing-job receipts with protected Worker dispatch traces. DO NOT retry uncertain paid jobs, release points, reset provider budget or merge/deploy as repaired. NO-GO remains.

## 2026-10-12 — Privacy-safe read-only diagnostic tool added (P0 progress, not root fix)

IMPLEMENTED on isolated PR #274 branch: `tools/oracle_diagnostics/failure_audit.py` uses read-only SQLite `mode=ro`, `PRAGMA query_only=ON` and `quick_check` to aggregate known failed-job details across plain-text/JSON formats, including Polish/English keywords, without printing raw `detail`, `prompt`, job IDs or customer information. It counts recent time buckets separately from historical totals. `tools/oracle_diagnostics/test_failure_audit.py` provides offline fixture checks for privacy, normalization, missing DB and aggregates.

VERIFIED (LOCAL CLOUD SHELL): Exact tool and tests were exercised on synthetic SQLite rows; 3/3 tests passed and no private fixture content appeared in report. Production `jobs.sqlite` has **not** yet been processed by this new tool; its categorization remains UNKNOWN. The Cloud Shell copy is at `/home/xodobrox/worldifact_p0_failure_audit.py`; user must explicitly execute read-only SSH access (direct autonomous SSH was not available to this agent) and optionally tee the aggregate output to a local report. No paid API calls, VM deployments or restarts.

The reviewed *local source snapshot* at `worldifact-completion-source/oracle_connector/server.py` uses a SQLite insert within a transaction before responding HTTP 202 and repeat-ID lookup before new work, but it is **not authenticated as the deployed VM source**. Therefore do not claim verified production idempotency or durable provider acceptance. Correlated live requests still required; status remains NO-GO.

## 2026-10-12 20:51 CEST — full VM SQLite failure aggregate retrieved

VERIFIED (LIVE VM, USER-OPERATED): Existing read-only `tools/oracle_diagnostics/failure_audit.py` was executed via owner Cloud Shell/SSH on `froge-blender`, and its privacy-safe report was read over the connected Desktop Commander. Exactly 167 historical rows: 92 succeeded, 74 failed, 1 cancelled, `quick_check=ok`. All 74 failed `detail` values are PLAIN_TEXT, 61 SHORT and 13 MEDIUM. First-match category counts: `RATE_OR_BUDGET=17`, `BLENDER_OR_RENDER=11`, `AI_PROVIDER=4`, `TIMEOUT=4`, `VALIDATION=2`, `OTHER_OR_UNCLASSIFIED=36` (sum 74). These are keyword-derived labels, NOT independently verified root causes. No printed row IDs, prompts, raw detail, or customer data.

VERIFIED (TIME WINDOWS): Last 24h: 3 succeeded / 1 failed; previous 7 days excluding last 24h: 6 succeeded / 12 failed; days 7–30: 51 succeeded / 37 failed; older or unknown: 32 succeeded / 24 failed / 1 cancelled. Counts describe stored job history, not the population of submitted requests. An account-signed request absent from Oracle SQLite is not represented; this cannot measure `ORACLE_JOB_MISSING` incidence.

VERIFIED (SOURCE-LEVEL REFERENCE ONLY): Local dated 2026-10-10 connector snapshot at `worldifact-completion-source/oracle_connector/server.py` appears to use SQLite transaction `INSERT INTO jobs` before HTTP 202 and checks existing job ID before new generation. Deployed VM source was not verified identical; do not claim production durable admission guarantee from this snapshot.

IMPLEMENTED: Hosted `Verify WORLDIFACT` CI now explicitly runs 3 privacy/offline Python audit tests, in addition to the existing JS/TS checks. No backend Oracle mutation, no customer-asset/balance/Stripe change, no production deploy. These CI checks must pass on the latest PR HEAD.

BLOCKED / NO-GO: A complete P0 fix still requires cross-tier correlation of a known original missing receipt's Worker stage, DO reservation/dispatch claim, Oracle POST ingress and persisted row/provider invoice. Do not add blind retries for uncertain paid POST. Preserve existing financial holds pending evidence.

## 2026-10-12 — Mock-only sequential acceptance suite and CI guard correction

VERIFIED (CODE): Reverted protected `.github/workflows/ci.yml` to the exact main blob `47fa876758aef48ec15b915eb7c4fc72c4293c36` after the protected release-hash assertion blocked the prior CI edit (2,272 of 2,273 JS tests passed before reverting). Added an isolated `.github/workflows/p0-oracle-audit-tests.yml` running privacy-safe offline Python tests without secrets/provider API access. Hosted standalone P0 Oracle Audit workflow concluded SUCCESS before this documentation commit.

IMPLEMENTED (MOCK ONLY): `tests/studio-api.test.ts` now includes a ten-sequential-job test: ten distinct signed receipts, exactly one mocked Oracle POST per new job, recovery-only repeat for each ID and aggregate ten reservations. No real model generation, customer points, paid provider calls, production service modification or deployment. Await exact HEAD main CI confirmation; these fixtures do not establish Oracle VM persistence or reliable live generation.

NO-GO remains for P0 reliability until actual missing signed receipt is correlated across Cloudflare/DO/Oracle, durable ack strategy is validated, and authorized capped real multiple-job acceptance passes. Preserve existing assets, holds, subscriptions and Stripe.

## 2026-10-12 — full historical PR review and lost-acknowledgement mitigation

Reviewed the repository pull-request timeline #1–#274 (API), tracing #169 (account-signed durable recovery), #186 (late-dispatch fence), #208 (safe admission diagnostics), #231 (paid-points holding), #251 (MCP framing/provider transport), #254 (native image dispatch), #263/#264 (Worker lifetime), #268/#269 (Astra/Sol/Luna routing and recovery), and #270/#273/#274 (native test, library recovery). Source evidence still does NOT prove durable cross-system Oracle ingress after a lost POST.

IMPLEMENTED on this isolated branch: after an unexpected Oracle POST/acceptance acknowledgement error, attempt one bounded 2.5-second **read-only GET for exactly the same signed UUID**, only accepting verified id and a known nonterminal Oracle state. A successful lookup returns the observed state rather than pretending the job was missing. A 404, unavailable response or mismatched/terminal data stays pending with original receipt and existing unresolved funding, with **no second provider POST** and no automatic refund. The existing one-use account dispatch fence remains unchanged. This mitigates lost acknowledgements; it **does not persist a request that was never delivered to Oracle**, so the root P0 is not closed.

Added tests for lost acknowledgement with Oracle GET confirmation, absent job remaining pending, one-use recovery, ten sequential mocked jobs with same-receipt replays, and the six-model/mode native Miniflare test from draft PR #270. Updated the existing held-points regression to distinguish transport loss from a verified GET-recovered building job without modifying financial expectations. Exact-head CI must pass.

The handoff for the remaining durable ingress fix is written to `docs/CODEX_ORACLE_DURABLE_ADMISSION_P0_20261012.md`. Codex CLI was not present in connected Cloud Shell, so this file is a task specification, **not** an asynchronously running Codex process.

Status: NO-GO for a complete production reliability fix until Oracle's durable staged admission and once-only start acknowledgement are implemented, live VM source is verified, original missing receipt is correlated, end-to-end repeated acceptance is proven and release is approved. No production merge/deploy/provider billing/VM state/Stripe/points operation.
