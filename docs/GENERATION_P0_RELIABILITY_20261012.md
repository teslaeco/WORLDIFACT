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
