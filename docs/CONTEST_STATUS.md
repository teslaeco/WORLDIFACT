# WORLDIFACT — Oracle FAST-spend compatibility checkpoint

Updated 28 September 2026 after the owner's second diagnostic screenshot.

## VERIFIED from the owner's read-only diagnostic

Worker and tunnel are active. `codex_runner.py` has valid Python syntax, one Responses URL literal and a `fast_spend` import. It does not import `astra_spend`; `astra_spend.py` is missing. Runner Git blob: `52c9d68d131178f879bedb9dc496c3c08cc2a3cf`. This explains why the earlier base-only installer refused the installed variant. It is not evidence that the ASTRA guard is installed.

## Implemented on this review branch

The installer adds exact, reversible recognition of the already installed FAST-spend variant. It preserves current source and older safeguards; it does not loosen identity verification or install the older base over production. Namespace/additional-tools validation and genuinely offline token-count fixtures are corrected. CI reconstructs the real source from pinned provenance and checks it against the screenshot, then runs guard, no-write inspection and rollback tests. Results remain PENDING until this exact commit's workflow completes.

No paid model calls, real Oracle installation, Stripe writes, live price changes or application deployment were performed here. The owner must run the updated pinned launcher before actual runtime success can be recorded. Astra commercial activation remains blocked until runtime protection and a bounded live quality test are verified.

Detailed compatibility/provenance notes: [Oracle FAST-spend compatibility](ORACLE_FAST_SPEND_COMPAT_20260928.md).

The complete earlier application-release ledger is preserved at [pre-source-inspection history](history/CONTEST_STATUS_before_SOURCE_INSPECTION_20260928.md). This branch is maintenance preparation, not a new published application.
