# Bounded STANDARD construction

This package replaces the open-ended planning control for fresh requests carrying
the explicit STANDARD contract and the existing USD 1.75 terms. It retains the
installed MPC2 scene validator, Blender builder, sandboxed edit tools, current-GLB
rendering and export implementation. FAST, cabinet, character, reference-only and
existing USD 2/4 routes keep their existing selection rules.

The model returns one complete scene plan. The host validates and builds it,
retrieves the actual current renders, and requests a separate assessment. An
optional sandboxed correction requires capacity for a fresh assessment before
rebuilding. Export requires the original completion checks. A rejected verdict
can preserve a private draft but cannot return success to the legacy worker.

The original authenticated Gateway and original ledger remain the sole provider
and cost boundary. Every request is bound to immutable payload bytes and a
single-use permit. Full output allowance, mandatory future money and request
slots are checked under the existing ledger lock. No predicted cache discount,
hidden history, model fallback, output truncation, new spending ceiling or
automatic paid retry is introduced. Authenticated completed usage is retained
privately; it is not represented as an invoice.

## Verification

The construction unit and transaction suite uses the exact historical package
checkout and public source fixture:

```sh
MODEL_CONTEXT_ANCESTOR_REPOSITORY="$PWD/.context-ancestor" \
MODEL_COMPLETION_SOURCE="$PWD/.model-completion-source/oracle_connector" \
python3 -B -m unittest discover -s tools/model_construction -p 'test_*.py' -v
```

The ancestor is WORLDIFACT commit
`2380a7e2dad05a40b3753faf06c2635ed444be51`; the public source is
Froge-MPC-2-test commit `d3f61b842dcfeda2ed794210caafc391919a75be`.
`assemble_test_runtime.py` reconstructs and hashes the exact installed-v2 source
boundary without reading a live worker.

`test_native_pipeline.py` is an explicitly selected integration gate. It exercises
real native Blender geometry, GLB images, sandboxed edits, exports, the loopback
Gateway and the original ledger. Only provider responses and activation proof are
fixtures. Acceptance, rejection and revision-2 correction are covered. Native
success does not establish Oracle container isolation or live model quality.

The parser accepts the documented nullable `content` metadata on Responses
reasoning items, validating each `reasoning_text` block before discarding it.
Only the single completed assistant answer enters the existing typed scene or
assessment validation. Authentication still binds the original response bytes.
Unsupported output shapes report fixed categories without recording reasoning
text or arbitrary provider field names. Unit and native fixtures cover absent,
null, empty and populated reasoning content; they do not represent a captured
live-provider response.

`offline_construction.py` is a separate mandatory Podman gate. It has no native
fallback. The install stage also runs the inherited generic, cabinet and legacy
STANDARD gates. Final source-bound attestation is created only after the genuine
stage gates pass and is verified in a fresh process.

## Maintenance and release

Installation changes three existing Python files and adds five helpers. It
transactionally rebinds the affected receipt chain. Existing jobs, source models,
cost ledgers, account data, configured credentials, pricing terms and provider
limits are preserved. Missing or changed source/receipt evidence refuses the
operation. An unfrozen manifest cannot enter maintenance.

For the exact receipt-verified construction-v1 installation, the explicit
`--update-payload` mode updates only `construction_payload.py` and the top
construction receipt. It requires the compiled predecessor source manifest,
retains every older receipt unchanged, and runs the same four isolated gates.
The worker is stopped only after idle admission and restarted through the
existing activation latch. A failed update restores the original helper and
receipt; ambiguous activation remains unconfirmed. The initial installation
path continues to refuse an already installed helper set. Both modes require
the separate maintenance approval flag and any exact cancelled-job consent.

The existing idle-queue fence, process identity checks, pidfds, guardian and
activation latch remain required. Cancelled-job cleanup is refused by default;
any approved exception must be bound to the exact current job identity. A prior
cleanup approval is not a blanket future exception.

Use only the reviewed, checksum-pinned launcher command for the approved release.
Default invocation is a plan, not activation. After a refusal or uncertain
outcome, inspect the saved receipt and health before considering another action.

The GitHub merge uses a separate exact-parent, exact-file source-only envelope.
It must skip Cloudflare deployment before Production credentials are admitted.
Merging these tools does not by itself install them on Oracle. A live paid model
test remains a separate, explicitly bounded action.
