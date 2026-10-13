# Durable Oracle admission repair

**Production release: NO-GO until actual VM gates and account acceptance pass.**
The new native-gated activation transaction is implemented; it has not been
installed on production. This differs from the earlier preparation-only utility.

## Entry points and provenance

- `install_admission.py` is still preparation-only. Its `--activate` refusal is
  not removed or reused as permission to modify a running server.
- `activation.py` is the separate full transaction. Its default is inert. The
  operator must use the source-pinned flat package and explicitly approve service
  maintenance. Existing historical maintenance grants do not cover this package.
- `build_activation_package.py` combines unchanged, individually hash-verified
  historical dependencies with the new public activation modules. It never reads
  a VM, copies credentials, starts services or invokes a model.

The predecessor is the exact 15-file runtime previously inspected on the VM.
The candidate server SHA-256 is
`c3e6b1e2894515ceabb4ec6570b8e68a5398664743212a36ba16a77be8200150`,
independently reconstructed in GitHub run 38339263726. The existing price,
provider, renderer and model-selection module bytes are unchanged. Two new
admission helpers have independent fixed SHA-256 pins. No caller, receipt,
environment setting or CLI argument may supply alternative source authority.

## Admission and queue behavior

STAGE commits the original immutable payload and ownership/fingerprint to private
FULL-synchronized SQLite before acknowledgement and before Worker point/budget
reservation. It cannot invoke a provider. START follows the original one-use
account dispatch authority. Repeated same-ID reads never create a replacement
paid request. Local input preparation is fsynced, serialized and bounded; an
uncertain provider attempt is never requeued.

The reviewed queue repair preserves never-started queued rows across restart,
claims rows before adding in-memory running flags, and always removes those flags
even if timing diagnostics fail. A transient storage error cannot kill the only
queue thread. An uncertain committed claim remains reviewable rather than being
executed again. None of this establishes the historical cost of a missing UUID.

## Activation transaction

`activation.py` verifies the exact predecessor, original receipts, protected
native executables, source inventory, service configuration, price expiry, disk
headroom and operator scope. Active/unknown jobs or unresolved staged admissions
refuse maintenance. A historical cancellation still requires its explicit exact
cleanup-consent arguments; no cancellation row or customer file is deleted.

A private backup precedes the existing exact-process pidfd/guardian lease. The
original fence code and security pins are unchanged. Only code and verified
native tools enter a disposable stage; live jobs, API configuration and budget
ledgers are never copied into it.

The stage executes the genuine generic CLI/MCP/Blender gate, original cabinet,
legacy STANDARD and phased construction gates, then all six Astra/Sol/Luna x
Standard/Fast native model gates. Provider responses are scripted in these native
gates; their real render/tool witnesses are not paid quality evidence. Complete
source-bound reports, not a success marker alone, are required for rebinding.

The additional `offline_admission.py` gate uses the actual staged HTTP handler,
SQLite inbox and immutable model-term binder over three fresh processes. It
forbids subprocess/model execution and non-loopback network in those children,
uses synthetic credentials and state, preserves a queued row through reopen,
and verifies once-only preparation with an empty provider-spend ledger. This is
isolated restart evidence, not a production reboot or paid provider call.

After all gates, the transaction rebinds receipts and writes only its exact
approved file set under a maintenance marker. Authenticated health and a final
idle/source fence precede the activation latch. Failure before that latch rolls
back only known owned bytes and modes; concurrent unknown edits are preserved.
An ambiguous/committed activation is never automatically rolled back, restarted
or retried. Retain all admission journals, customer artifacts and accounting
state after any future code rollback.

## Tests and release boundaries

`test_worker_recovery.py` reproduces the old queue failure and executes the real
queue functions with inert rendering and real SQLite, including ten sequential
requests. `test_activation.py` uses explicit synthetic process/native witnesses
to exercise the complete real file transaction: every write failure and lost
acknowledgement, bad evidence/source, concurrent edits, active jobs, pre-latch
rollback and ambiguous activation. These fixtures do not prove real VM native
gates. `test_activation_source.py` binds the candidate to the exact original
runtime reconstructed by CI.

The Python 3.9/3.12 workflow also constructs the flat source package, checks its
inert default and original native dependency pins. Do not equate that package
check with running the real VM installation.

Before merge/deploy: obtain current VM access, run the separately approved native
transaction, verify actual durable admission and authenticated owned library
exports, complete the two authorized capped Astra Standard acceptance requests,
and require green checks on the exact final head and a preserving Worker release.
No Stripe, subscription, customer balance, provider price or account-role changes
are part of this repair. Historical uncertain holds remain for evidence-based
reconciliation. The original read-only `cloud_shell_probe.py` checks the OLD
runtime; after installation use the new receipt and authenticated health, not
that old-predecessor probe as an acceptance check.
