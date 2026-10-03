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

## 500-point option: earlier decision boundary (superseded below)

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

## Approved price tiers — 3 October 2026 follow-up

The owner subsequently fixed both new detailed Studio prices: 250 points with a
USD 2 provider ceiling, or 500 points with a USD 4 ceiling. These are bounded
generation attempts, not a guarantee that every elaborate model will finish.
The UI presents the exact point price, requires explicit acceptance of 500
points for the unchanged draft, and never automatically upgrades or retries.
Only the authenticated worker's proven `MODEL_BUDGET_EXCEEDED` outcome explains
that a model is too elaborate for the selected budget. Generic cost-guard,
account funding, token-count, expiry and transport errors do not imply that.

The canonical input and account-bound signed receipt include the exact tier,
pricing revision and explicit acceptance. A new priced quote expires after five
minutes. An already admitted matching job remains recoverable after that expiry
or during maintenance under its original stored terms without another charge or
Oracle submission. The ledger atomically checks both points and provider funding,
reserves exactly 200 or 400 cents, and settles/reconciles only that job's matching
immutable liability receipt. Historical 175-cent jobs keep their original terms.

The shared provider pool is not enlarged by a higher point price. The existing
70% allocation, plan prices, balances, minimum-margin rules and support grants
remain unchanged. Available points alone therefore do not guarantee sufficient
funded provider authority for another attempt. Unknown liabilities remain held.

The new Oracle package persists immutable pricing outside mutable job artifacts
under the provider reservation lock, before job admission. Both reservations and
settlements use those same terms; sealing a terminal receipt permanently prevents
future paid requests for the job. Health advertises the new exact tier contract
only after the reviewed package is installed. Legacy health fields and omitted
pricing input remain compatible with the prior USD 1.75 guard. The source update
does not claim that the original Oracle worker has already been upgraded.

PR #194's earlier reconciliation deployment succeeded at main
`8aa7dbc56f4f638af130fbe26c7b4a2b31656b70`, run 37135396401, version
`9e7f77b8-c313-4bc1-9fb1-de5b4871a2f2`, with all 955 JavaScript tests passing.
This pricing follow-up's exact final checks and deployment belong to its PR.
No paid model generation, balance reset, support-grant activation or card charge
is part of this validation. Activation still requires the original authorized
OCI Cloud Shell/SSH maintenance context and verification of the runtime contract.

## Original Cloud Shell activation evidence — 3 October, evening

PR #195 merged as `12149bd6c55d8de95044a4c41e55ccf87fed47c6` and
Cloudflare release 37138372766 succeeded with 997 tests, zero skipped, and version
`ffc3edf8-e1e3-4b21-a51e-cced052125c9`. This is application-release evidence only.

The owner's original Cloud Shell verified launcher SHA-256
`7248bce0ab366cf2f0984cd8ad4c092eec2b7722c9d1eb03099bf539a8ae39a9`.
Its first installation attempt returned `unsafe_job_history` and no confirmed
activation. A later read-only SQLite snapshot reported `cancelled=1`, `failed=60`
and `succeeded=80`, with no other states. Those are stored states, not visual
quality or financial-settlement attestations. The owner then ran the explicit
single-cancelled-job cleanup option. That attempt returned
`accepted_or_unknown_socket`, `activation_committed=null`,
`job_rows_changed=false`, and `paid_generation_requested=false`.

The socket refusal is before the admitted installation lease. The old checker
counts every socket-backed descriptor, including systemd journal stdout/stderr,
but recognizes only TCP/TCP6 and demands exactly one descriptor. Its pipe-based
kernel fixtures did not cover journal streams. Inherited journal sockets are a
candidate explanation, not remotely confirmed by the screenshot. Unknown or
accepted request sockets must remain a refusal; an output-descriptor number or
AF_UNIX alone is insufficient evidence to exempt it. No job, reservation, source,
or financial guard may be reset to make installation proceed.

### Journal socket maintenance correction

The tier installer now exempts only inherited stdout/stderr sockets proven by
kernel AF_UNIX peer/cookie/VFS evidence to terminate at the protected journal
stdout socket. Accepted or unknown application sockets still refuse maintenance;
the original freeze, pidfd, database and cancellation-consent checks remain.
The package and guardian pin the new verifier. A checksum-pinned read-only
diagnostic can run after a single failed installation attempt, without retrying
maintenance or requesting a paid generation.

Local verification: launcher 11/11 and diagnostic 8/8 passed; journal protocol and
integration tests passed. This execution kernel does not provide usable AF_UNIX
socket diagnostics, so the real-kernel positive tests require mandatory Ubuntu CI.
`deploy:check` passed with temporary Wrangler log/config locations. Local
`npm run verify` failed in four existing test files and the build dependency fetch
failed with `EAI_AGAIN`; neither is recorded as a pass. Hosted CI is the release
gate. No successful Oracle activation is implied by this source correction.
