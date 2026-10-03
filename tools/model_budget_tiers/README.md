# Studio provider-budget tiers

This optional Oracle package adds authenticated, immutable Studio job terms for
`studio-pricing-v1`. Existing jobs and requests without the new pricing contract
retain their original USD 1.75 provider ceiling. Existing ledgers, terminal seals,
job rows, model files and customer balances are never reset or upgraded.

| Tier | Customer points | Maximum provider liability |
| --- | ---: | ---: |
| `standard` | 250 | USD 2.00 |
| `extended` | 500 | USD 4.00 |

The authenticated creation request supplies `studioPricing` with exactly
`revision`, `tier`, `points` and `maxProviderCents`. Only the reviewed pairs
`standard / 250 / 200` and `extended / 500 / 400` are accepted, and only for the
existing `standard` generation profile. Terms are bound outside the job folder
under the same durable lock used by provider reservation before the job is
queued. Repeating a job identifier with different terms returns a conflict;
existing provider evidence cannot acquire higher limits.

The actual installed reservation path reads that immutable binding on every
reservation. The output limits, model, request ceiling, completion contract,
geometry gates and authenticated usage-settlement policy remain unchanged.
A terms file that is malformed or linked does not fall back to a legacy budget.

## Terminal liability evidence

`GET /v1/jobs/{canonical-lowercase-uuid}/budget` retains the existing bearer
protection, terminal-state requirement, immutable seal and exact receipt schema.
Historical receipts retain `astra-low-reconciled-v2` and `capMicroUsd=1750000`.
New receipts use `astra-low-tiered-v1` with `capMicroUsd=2000000` or `4000000`
from the bound job terms. They report an upper liability, never an invoice.
Missing or inconsistent evidence never becomes a zero-cost receipt.

The reserve lock prevents a later provider reservation after a seal. A request
that reserved first remains included at its full outstanding ceiling. Late
completed usage may lower the ledger but cannot replace the immutable receipt.
Migrated legacy holds retain the full original cap. Customer point settlement
remains separate from provider-liability settlement.

`MODEL_BUDGET_EXCEEDED` is reported only from validated evidence that the next
minimum guarded reservation exceeded the remaining budget. This also preserves the precise exhaustion
reason when a terminal job retains a draft result. Generic provider failures,
ledger faults and uncertain usage do not establish budget exhaustion.

## Reviewed ancestry and maintenance

Only these exact source sets are admitted:

- The reviewed six-source cabinet-prebuild runtime.
- The reviewed seven-source PR194 terminal-budget runtime and its matching
  runtime receipt, completion/prebuild receipts and guard identities.

Unknown sources, partial installations and installed STANDARD-context variants
are refused. Historical packages remain untouched. The copied maintenance fence
changes only the admitted source manifests; the original pidfd guardian, process,
cgroup, session, database, cancellation-consent and exact-worker recovery gates
are preserved. The installed proof covers all eight sources, including
`studio_pricing.py` and `terminal_budget.py`.

The launcher and installer are inert without explicit maintenance approval. The
launcher requires an immutable reviewed 40-character Git commit, checks every
package Git blob, uses the original Oracle key and strict SSH host checking, and
invokes one bounded installer. It does not run a model, create credentials or
change the quick tunnel.

```sh
python3 -B oracle_tiers_launch.py --source-commit REVIEWED_40_CHARACTER_COMMIT --approve-service-maintenance
```

Use that command only after exact-commit review and CI, with service maintenance
authorized. The optional `--allow-cancelled-cleanup` retains the original explicit
consent for residual work of one bound cancelled job. It never admits queued,
running or unknown job states and never rewrites cancellation history.

Installation preserves a byte-and-mode backup, verifies the actual patched
Codex/MCP/Blender generic and cabinet pipelines in an isolated stage with inert
responses, binds the receipts, starts behind a maintenance marker and checks
authenticated local health. Before activation, failures restore original source
and receipts. After the activation commit point, uncertain health is reported
without automatically stopping or rolling back a worker that could accept work.

Success is `WORLDIFACT_STUDIO_PRICING_VERIFIED`. Health must advertise
`studioPricingRevision=studio-pricing-v1`, the exact two `studioPricingTiers`,
`worldifactTerminalBudgetPolicy=worldifact-terminal-budget-v1`, and both
maintenance flags as false. The result records `legacy_provider_cap_micro_usd`
as `1750000`; `provider_limits_changed` is true only for committed activation,
false after pre-activation restoration, and null when activation is uncertain.
Source publication and offline tests do not establish installation on Oracle.

## Offline verification

```sh
MODEL_COMPLETION_SOURCE=/path/to/pinned/oracle_connector \
  python3 -B -m unittest discover -s tools/model_budget_tiers -p 'test_*.py' -v
```

The source fixture is reconstructed from Froge commit
`d3f61b842dcfeda2ed794210caafc391919a75be` through the existing reviewed patch
chain. Installer tests use disposable source trees and explicit service doubles;
launcher tests do not use OCI or SSH. They cover both ancestors, unchanged
historical guardian operations, source drift, interrupted writes, rollback,
activation uncertainty, cancellation consent, helper proof coverage, idempotence,
and the pinned flat package. No paid request or live installation is implied.
