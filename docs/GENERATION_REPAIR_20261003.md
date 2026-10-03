# Generation admission and interrupted-attempt repair — 3 October 2026

## Incident evidence

The owner reported a disabled Generate button and earlier interrupted model jobs.
The supplied screenshots show `PROVIDER_BUDGET_EXHAUSTED` admission messaging and
an earlier `ASTRA_COST_LIMIT` terminal job. These are different controls: the
account's remaining provider reservation authority versus the existing USD 1.75
per-job Oracle guard. A remaining customer-point balance does not prove unused
provider funding or establish the actual provider invoice cost.

A read-only inspection of the authenticated production Shop confirmed the funding
refusal for both Astra blueprint and detailed Astra/Blender. No model was submitted.
The screenshot that simultaneously advertises availability and a funding refusal
predates the existing shared-admission UI repair; that contradiction was not
reproduced on the current deployed source.

## Scope of this repair

- Refresh the shared account quote when a mobile tab becomes visible or a page
  is restored from the back-forward cache. Invalidate the previous decision during
  the read, retain the draft and never submit or retry a generation automatically.
- Correct the reproducible reservation leak only for newly marked, ordinarily
  funded Studio requests which fail before their one-use dispatch fence is
  claimed. Settlement and that fence must share the same ledger transaction.
  Legacy, claimed, uncertain, support-funded and already-terminal records retain
  their existing conservative treatment. No historical account adjustment is
  inferred from screenshots.
- Replace a timing-dependent Blueprint concurrency assertion with deterministic
  coverage of in-flight refusal and completed-result replay. The production
  deployment of main `7462a64c994d5fdee928e37124bbb85c4279b6eb` stopped at that
  assertion: a cached successful response is not proof of another provider call.
- Record exact completion/prebuild/standard-context maintenance policy matches
  from the existing bounded authenticated Oracle health GET during deployment.
  Only three booleans are logged; arbitrary upstream fields are discarded. This
  diagnostic does not change runtime admission or install any Oracle package.

## Remaining operational evidence

The previous Oracle completion/prebuild/context packages have source and offline
tests. Their presence in Git is not proof of installation on the original worker.
The latest successful Cloudflare release checked the existing cost/output-policy
contract, not the newer context-maintenance receipt. The existing pinned Oracle
launcher requires the original authorized OCI Cloud Shell and SSH context.

This repair does not activate an operator-funded support grant, increase any
provider cap, replenish a historical reservation, or run a paid test. Historical
funding reconciliation needs exact ledger/dispatch evidence; genuinely used or
uncertain provider funding needs a separately approved funding decision. An
`ASTRA_COST_LIMIT` job is not automatically retried or relabelled successful.

## Verification

Local lint/typecheck and 931 tests pass. The only failure in the full local
`npm run verify` is the existing native Chromium check because Chromium is not
installed in this executor; it remains enabled and mandatory in hosted CI.
The additional real Miniflare SQLite transaction suite passes all four cases
(five TAP tests including its parent): exact-once release, dispatch-first
retention, concurrent exclusion and rollback after a final job-write failure.
Local HTTP/origin checks, application compilation and Worker packaging pass.
The complete release asset hydration and Chromium check still require hosted CI.
Targeted regressions and final release checks are recorded in the repair PR.
These inert tests establish software behavior, not a successful paid mobile model.
