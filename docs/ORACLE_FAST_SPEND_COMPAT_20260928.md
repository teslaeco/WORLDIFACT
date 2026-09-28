# Oracle ASTRA guard: preserve the already installed FAST-spend variant

The owner's 28 September 18:45 screenshot reports active worker and tunnel, syntactically valid runner, `FastGuardImport=True`, `AstraGuardImport=False`, and missing `astra_spend.py`. Runner Git blob: `52c9d68d131178f879bedb9dc496c3c08cc2a3cf`. There is no evidence of a successful ASTRA guard installation yet.

## What this change does

The installer supports the exact v33+FAST-spend pair without overwriting its older FAST safeguards. It proves the variant by both full fingerprints AND reversing only the previously reviewed FAST-spend additions back to the already reviewed ancestor hashes. A matching arbitrary new hash is not sufficient. Mixed versions, changed whitespace or a modified FAST helper remain blocked. Production source is patched in place; the reconstructed ancestor is never written to the VM.

CI reconstructs the installed variant from the pinned Froge source `d3f61b842dcfeda2ed794210caafc391919a75be`, applies the existing reviewed v33/FAST patch and the existing FAST-spend patch, and compares the result with the screenshot. CI also verifies unchanged offline-verifier blobs. This reproduces the entire runner/helper, not only a matching substring.

The same launcher remains `python3 -B tools/profit_guard/oracle_launch.py --approve-service-restart`, but it MUST be run from this reviewed commit, not the older release. It requires no API-key entry, retains strict SSH checking, refuses active jobs, backs up touched files and restores them if verification fails. Model files, balances, billing flags, server.py and blender_mcp.py are not replaced.

## Additional integration corrections

- Preserve Codex namespace-wrapped tools and developer `additional_tools` in the exact token-count request, while rejecting paid hosted tools in either location.
- The existing offline Codex/Blender smoke test mocks Responses only. Its new token-count call must also be a fixture. A separate verification process supplies fixture token counts and smaller fixture output requests while executing the real protect/reserve path and the genuine smoke test. It does not change the production dollar ceiling or write a fabricated runtime-verification receipt.
- The USD 1.75 per-job conservative provider reservation, external-to-job ledger, expiry and no-refund behavior remain. Old FAST code and its spend file are retained unchanged. Both guards may apply to a legacy FAST request; this does not enable the legacy FAST route in WORLDIFACT.
- No paid generation, product creation or Astra sales activation occurs during installation. Local runtime readiness and offline fixtures do not prove live model quality.

Official token-count and model documentation rechecked on 28 September 2026:
https://developers.openai.com/api/docs/guides/token-counting
https://developers.openai.com/api/docs/models/gpt-6-astra

## Evidence status

PENDING exact-head CI and the owner's actual Oracle installation. No current production application, price or entitlement changes are included.
