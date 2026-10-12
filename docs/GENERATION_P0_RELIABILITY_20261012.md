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
