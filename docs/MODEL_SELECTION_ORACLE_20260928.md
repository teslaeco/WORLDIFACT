# Explicit model choice and Oracle Astra cost guard

## Scope and truth boundaries

The model chooser displays GPT-6 Sol (50 points for a paid attempt) and GPT-6 Astra (250 points) before generation. The quote panel reads the current authenticated account, displays a possible 0-point funded free Sol allowance or a paid point charge, and calculates the balance after reservation. The server remains authoritative: the shared free pool and durable provider reserves are checked again on submission. No card is charged by the generation button and there is no automatic model upgrade.

This release does not implement an individual cash-priced Astra pass. Existing one-time credit packs are supported, but a top-up alone does not unlock Astra. A future single-use pass needs a separate idempotent payment grant, model-scoped entitlement, provider reserve and refund policy before it can be sold.

Sol FAST is a scene/asset specification plus a lightweight procedural preview, not the detailed Oracle/Blender mesh workflow. ASTRA commercial activation stays disabled. The guard installer does not enable the public billing flag, create products, or generate a paid test model.

## Stripe attempt on 28 September 2026

After the owner reported renewed write permissions, the account list was refreshed and the live catalogue was read. It still contained only the existing membership and top-up. A direct PostProducts call for the approved Pro plan was blocked by the connection's safety validation because the safety state of the request could not be established. No new product or price was created. This was not treated as permission to retry through an alternative API operation, stored credential or workflow.

## Oracle installation

Run the reviewed, pinned release from the original OCI Cloud Shell account. The launcher locates the existing `froge-blender` VM in `eu-amsterdam-1` and uses the existing local SSH key without reading or uploading its contents. SSH host verification stays enabled.

```bash
python3 -B tools/profit_guard/oracle_launch.py --approve-service-restart
```

The command is opt-in; without that argument it is plan-only. Before restarting anything it verifies exact reviewed runner/helper hashes, verifier hashes, runtime receipts, service identity and an empty job queue. Unknown installed source or active jobs cause a STOP before maintenance. It will not overwrite a previously modified guard.

Backups of touched source and the previous verification receipt are kept in a new private workspace. Only the worker is briefly stopped; the tunnel, model files, job records and provider keys are preserved. The existing offline Codex/Blender fixture verification runs before restart. Failures restore only the exact files touched by this attempt, unless an intervening edit requires manual recovery. Successful installation reports `WORLDIFACT_ASTRA_GUARD_VERIFIED` and authenticated local health must show `astraBudgetRevision=astra-usd175-v1`, `astraBudgetMaxUsd=1.75`, and `astraBudgetPreflight=input-tokens`.

This installer supports one exact audited v33 runner variant. It deliberately refuses other versions rather than applying a speculative patch to a working production generator. A successful local guard check is not proof of satisfactory live model quality; Astra sales remain blocked until a separately authorized bounded end-to-end test passes.

## Reservation properties

- Exact input-token counting before the final Responses API call.
- GPT-6 Astra Standard only, no silent model fallback, no hidden server history or paid hosted tools.
- Maximum USD 1.75 conservative reserved model-provider cost per job; at most 8,192 output tokens per request, lowered further when required by remaining funds.
- Persistent, locked and fsynced budget stored outside the generated job directory. Cleaning job outputs, restarting the process or replaying a failed request does not restore money.
- Refusal or transport failure never refunds the API-spend reservation. Customer-point refunds remain a separate platform operation.
- Guard pricing must be reviewed before 28 October 2026. An expired or source-mismatched guard stops advertising verified readiness.

The 28/83 micro-USD per-token reservation rates deliberately exceed the current base prices, covering long-context cache writes and regional uplift with additional input framing headroom. This is not measured billing and does not cover unrelated API keys, hosting invoices, taxes or third-party charges.

Official sources reviewed 28 September 2026:
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/gpt-6-sol
- https://developers.openai.com/api/docs/guides/token-counting

## Promotion gate

Use organic beta feedback first. Before buying promotion: verify an authenticated Sol generation, the actual exported artifact, payment-to-credit settlement, and the Oracle guard plus Astra quality inside its funded budget. Do not advertise standalone Astra purchases or detailed Sol meshes as available until implemented and verified. Ask for feedback, never votes.

Draft beta post (publish only after an end-to-end Sol check):

> I am building WORLDIFACT, a playable 3D world with tools for exploring AI-assisted creation. The beta now makes model choice and point costs clearer before generation. SOL is for lightweight procedural drafts; the more detailed ASTRA workflow is being prepared behind additional cost safeguards. I would love honest feedback on the creation flow, previews and downloads. https://worldifact.xodobrox.workers.dev/shop

## Verification

Local guard unit tests ran without model calls. CI for this change must verify the full application, quote behavior, persistent budget tests, installer default no-op, hash rejection, and rollback fixtures. Do not infer actual Oracle installation, a paid generation, Stripe catalogue writes, or Android visual QA from these tests.
