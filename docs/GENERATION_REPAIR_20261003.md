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
Production release 37132224035 of PR #193 succeeded. Its bounded authenticated
health GET attested completion and prebuild maintenance, but did not attest the
STANDARD context policy. The existing pinned Oracle
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


## Follow-up: terminal reservation reconciliation

A completed authenticated model response already reduces its individual Oracle
reservation to a conservative usage upper bound. The account ledger previously
kept the entire 175-cent admission reservation after dispatch. This follow-up
returns only the difference between that original reservation and the final
sealed maximum liability, rounded UP to cents. For example, a 175-cent admission
with a 42-cent terminal upper liability returns 133 cents of provider authority.
That example is illustrative, not a measured production job.

The Worker fetches a strict, bounded receipt itself from the authenticated Oracle
connection. Browser input cannot supply a receipt or funding amount. The internal
account transaction verifies the exact owned terminal ordinary Astra held job,
excludes support grants and pre-dispatch releases, and writes its one-use marker
atomically with the funding adjustment. Unknown or malformed receipts, missing
ledgers, unsupported runtime revisions and interrupted reads never replenish
funding. Re-reading an already settled result remains possible if reconciliation
is unavailable. There is no provider POST or replacement generation.

The Oracle half must be installed and verified on the existing worker before a
receipt can be used. A source merge/Cloudflare deployment alone cannot attest
that installation or establish that historical account funding was recovered.
The existing original OCI Cloud Shell/SSH maintenance context remains required;
no credential extraction or unrelated host is an alternative.

## 500-point option: decision boundary

The owner requested an explicit 500-point consent option, not an automatic point
debit or an unbounded API budget. The existing 250-point/USD 1.75 contract remains
active until the operator's dollar cap for that option is fixed. A higher point
price alone does not make the existing runtime finish a larger job.

A future quote must bind the exact input, model, total point price, provider cap
and policy revision to one expiring server quote. Customer acceptance must be
explicit before reservation/submission; changing input invalidates it. The
server must verify both available customer points and funded provider authority
atomically, with one-use/idempotency semantics. Crossing a cap must stop, not
retry or silently charge more. The quote must not claim a guaranteed completion
price: only each concrete next model request can currently be token-counted;
future tool results and model outputs are unknown before generation.

No 500-point option or new dollar limit is enabled by this repair. No paid
execution, card charge, support grant, balance reset or GPU purchase is part of
validation. Exact local/hosted results belong to this follow-up's PR.

Local follow-up validation: 954 of 955 JavaScript tests pass, including the
actual SQLite reconciliation cases. The sole failure is the existing native
Chromium fixture because Chromium is absent in this executor; it stays enabled
in hosted CI. TypeScript, lint (existing warnings), local DEMO HTTP/origin checks,
application compilation and Worker deployment dry-run pass. These fixtures make
no paid provider call. Hosted CI and the new Oracle-package tests are recorded
in the follow-up PR.

The Oracle receipt package passes 64 offline checks, including real file-lock
races, the authenticated handler, immutable replay, missing-evidence refusals,
the Python-to-TypeScript protocol bridge and installation rollback. An independent
review found and fixed incomplete request history being mistaken for zero spend.
Its strict installer accepts only the verified prebuild ancestor; the separate
STANDARD-context variant requires a composed reviewed upgrade. No target Oracle
installation is claimed.
