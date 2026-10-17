# Owner V3 Stage 2 — failed GPU execution recovery (17 October 2026)

## Verified evidence
- Workflow run: https://github.com/teslaeco/WORLDIFACT/actions/runs/39015487151 (failure).
- Provider status: FAILED, phase PROVIDER_RESULT, failure type Refused, provider execution 650053 ms; original provider request is **not** safely retryable.
- Stage2 collection **succeeded** and reported 3 saved artifacts; `stageGateSatisfied=false`. This is partial recovery, not a deliverable GLB.
- Dedicated endpoint `bet5brl6qzq7yc` was reported deleted by the independent cleanup step, with `alreadyAbsent=true`; broader provider inventory and billing remain unverified.
- Astra stage2 preparation succeeded and must not be charged twice merely to diagnose the GPU failure.
- `prepare.py` explicitly refuses reuse of a stage2 operator-dispatch claim with `GPU_ALREADY_CLAIMED_RECONCILE_ONLY`. Do not rerun `stage2` against the same job ID.

## Recovery before a new charge
1. Preserve the existing collector artifact: https://github.com/teslaeco/WORLDIFACT/actions/runs/39015487151/artifacts/12093999686 . Its archive contains private encrypted download metadata/receipts, **not** full model bytes.
2. In an approved secret-bearing Production GitHub Actions context, choose operation `collect2` on the existing `owner-v3-stages.yml` to refresh the sealed expiring manifest **without GPU creation or paid inference**. Existing `stage2` already collected three partial artifacts; this step is optional if the saved sealed manifest remains usable.
3. Decrypt the manifest only with the original private key on the authorized operator device; inspect exact saved keys and errors. Do not commit signed URLs, private images, or keys.
4. Check whether any native geometry, texture, Blender or render checkpoint is reusable; analyze the worker/provider error with sensitive values redacted.
5. Only after diagnosis, prepare a **separate** reviewable retry revision with a fresh fixed job ID, checkpoint-aware recovery, one-shot claim keys and an explicit cost envelope. Keep the prior stage2 record immutable. Do not reset or delete its claims.
6. Obtain verified residual allowance within the previously approved USD 6 batch ceiling (or separate explicit approval for any overage), validate current RunPod endpoint/pod inventory and perform one controlled dispatch with unconditional cleanup and readback.
7. Verify complete GLB/BLEND/renders and public acceptance separately. Make no supplier-ready claim without MAKE checks.

## Current NO-GO
No new paid attempt from this documentation change. Workflow dispatch and RunPod management actions are not exposed to the active connector. The owner has authorized a retry in principle; that is not evidence that provider cost or claims are safe for immediate one-shot execution.
