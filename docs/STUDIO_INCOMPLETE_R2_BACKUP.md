# WORLDIFACT — private retained incomplete GLB backup

**Status (2026-10-14): IMPLEMENTED ON DRAFT REVIEW BRANCH. NOT ENABLED, NOT PROVISIONED, NOT DEPLOYED.**

The source safely retains a structurally valid Oracle GLB from an **original account-owned failed** Studio job under a separate `INCOMPLETE · UNREVIEWED` record. The original failed job, selected AI/mode, original SHA-256, signed receipt, provider liability, held customer points and cost cap are not changed. This is not a 3D quality guarantee or any permission to retry or charge a generation.

## Why an independent copy matters

An immutable metadata entry and SHA-256 do **not** preserve original GLB bytes. Oracle may later remove the file. An optional private Cloudflare R2 backup can preserve the original byte stream independently. It is fully opt-in, and **does not access R2 without BOTH**:
- a private `INCOMPLETE_GLB_BACKUP` R2 binding, and
- the explicit Worker variable `ENABLE_INCOMPLETE_R2_BACKUP=true`.

Neither is configured by the current `wrangler.jsonc`. Do not modify production or create a bucket without owner-approved cost scope, environment review and change control. Current production only has the previous selected/Oracle-confirmed library labels, not INCOMPLETE functionality.

## Designed behaviour

1. Authenticate the user's account and original account-bound signed job receipt, require a canonical terminal failed Studio job with an allowlisted budget/incomplete reason.
2. Only fetch the **same original job** via GET Oracle status, quality, and binary GLB. Never submit `POST /v1/jobs` and never perform financial reconciliation during this operation.
3. Validate glTF 2.0 structure, actual embedded vertex/index geometry, mesh instances and original SHA-256. A JSON-only mesh declaration cannot be considered a real GLB draft.
4. If the private R2 binding and flag are both available and the original GLB is **at most 16 MiB**, store under `incomplete-glb-v1/{verified-account-id}/{original-job-id}/{sha256}.glb`. Only harmless opaque IDs and the hash are stored in private metadata; no customer prompt or API secret is included in the object name.
5. Verify the R2 object owner/job/SHA metadata, exact byte length and actual SHA-256 **by independent GET readback**. Only then set `backupVerified = r2-sha256-readback-v1` on separate account-owned incomplete metadata. Existing failed-job ledger bytes are not updated.
6. On an owner-authorized GLB download, read verified private R2 bytes first; if missing/unavailable/corrupt, try the original Oracle artifact, enforcing the **same original SHA-256**. If neither matches, return a controlled failure, never a substitute model.
7. If the bucket is disabled, the model is larger than 16 MiB or any R2 operation fails, the record may remain **Oracle-only**. The customer UI must explicitly say no independent backup was verified, and never promise future availability.
8. An original `COMPLETE` GLB is not reclassified as INCOMPLETE. No R2 code handles completed models or general public gallery objects. No unauthenticated route exposes arbitrary R2 keys.

This backup is deliberately not an online continuation or paid model-generation service. Repeated explicit recovery may upgrade an unchanged original GLB to separately verified R2 storage; it cannot overwrite the original checksum or financial job.

## Configuration template — NOT RUN

After an approved infrastructure plan, provision a private R2 bucket **without public domain or public bucket access**. Use the exact approved name (no name is assumed here), then add to the existing Wrangler JSONC configuration:

```json
"r2_buckets": [
  {
    "binding": "INCOMPLETE_GLB_BACKUP",
    "bucket_name": "<APPROVED_PRIVATE_R2_BUCKET_NAME>"
  }
]
```

Also explicitly opt in to:

```json
"ENABLE_INCOMPLETE_R2_BACKUP": "true"
```

Do not alter existing secrets, entitlement Durable Object bindings, production account ledgers, generation guard or payment configuration. Prepare and inspect a controlled `--keep-vars` release after owner approval. Never publish a public URL to the private R2 bucket. Verify the bucket's retention and deletion policies before activation.

Official Cloudflare references:
- [Workers R2 bucket API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [R2 Worker binding setup](https://developers.cloudflare.com/r2/get-started/workers-api/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

As of the 2026-10-01 pricing update, Standard R2 lists USD 0.015/GB-month, USD 4.50/million class-A operations and USD 0.36/million class-B operations before any included allowance. These are storage/operation fees, **not** customer points, provider AI invoices, an actual invoice, or authorization to spend.

## Release verification checklist

- [x] Off-by-default source integration; no bucket access when the switch is absent.
- [x] Owner/job/hash-keyed R2 write and integrity-checked readback, fake-bucket unit tests committed.
- [x] Account and signed original-receipt R2-first download path, failing/missing Oracle simulated by an inert local test fixture.
- [x] Client distinguishes verified R2 copy from Oracle-only record and rejects forged metadata.
- [ ] Confirm green exact-head CI (npm verify, lint, TypeScript, 3D tests, HTTP smoke, build, Wrangler dry-run and other repo workflows).
- [ ] Choose a private R2 bucket and authorize R2 cost scope. Confirm full-size model strategy beyond 16 MiB.
- [ ] Provision private bucket and deploy opt-in binding in approved scope only.
- [ ] Verify one authentic pre-existing budget-exhausted account-owned job **and** R2 readback in production without generating or deleting any real model.
- [ ] Perform real signed-in browser, Android/WebGL fallback, cross-session reload/download acceptance.
- [ ] Verify no extra points, holds, provider/model metadata or previous successful library entries were altered.
- [ ] Obtain explicit merge and release authorization.

**GO/NO-GO: NO-GO** until all blockers above are closed. All inert tests are **not** a proof that a real failed Oracle job currently holds a GLB.


Updated source QA evidence: PR #284 code commit `5a184219f021b3af606dd6645b6ff994cda54efe` passed https://github.com/teslaeco/WORLDIFACT/actions/runs/38614866761 (2,334/2,334 tests, foundations, HTTP, build, Worker dry-run). No R2 bucket was provisioned and no live R2 GLB persisted. The current docs-only follow-up commit needs fresh exact-head CI. Original Oracle-only release and financial data remain unchanged.

