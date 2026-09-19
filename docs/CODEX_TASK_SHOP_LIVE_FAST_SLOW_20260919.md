# Codex task — restore AI Shop LIVE generation and expose FAST / SLOW

Date: 2026-09-19
Repository: teslaeco/WORLDIFACT
Branch: fix/shop-live-fast-slow-20260919

## Objective

Restore the public Enchanted AI Shop real 3D generation path after the launch-window quota/expiry ended, and expose the already implemented generation profiles as clear customer choices:

- **FAST · DRAFT** -> existing `fast-draft-v1` profile.
- **SLOW · QUALITY** -> existing `standard` profile.

Both profiles must continue to use the verified server-side WORLDIFACT / Oracle pipeline whose worker health contract reports OpenAI `gpt-6-astra`. Do not invent a second model ID and do not put any OpenAI or Oracle secret in the browser.

## Required behavior

1. Remove the **application-level cumulative attempt ceiling and launch-date expiry** from the ongoing production mode.
2. Keep all operational safety controls:
   - Cloudflare per-IP rate limiting;
   - request/body/image limits;
   - same-origin checks;
   - signed Studio receipts and idempotent job submission;
   - provider/worker timeouts;
   - safe error messages;
   - explicit DEMO fallback;
   - Oracle FAST worker budget guard (`fastBudgetRevision=fast-usd4-v1`, max USD 4) when FAST is selected.
3. Represent ongoing generation explicitly as an unlimited cumulative pool in the internal budget/status contract. Never fake a large finite number.
4. Keep the committed base `wrangler.jsonc` disabled-by-default. Build an ephemeral paid production config only when the explicit ongoing-live release marker is present.
5. Retire the expired contest-live deployment path so a new `main` push cannot fail merely because 2026-09-19T07:00:00Z has passed.
6. AI Shop UI:
   - make **FAST · DRAFT** and **SLOW · QUALITY** visible;
   - default to SLOW / existing STANDARD quality path;
   - FAST is selectable only when the worker confirms `fastReady && fastBudgetReady`;
   - FAST remains text-only / 2K / non-terrain in v1;
   - when reference photos are present, keep SLOW selected and explain why FAST is unavailable;
   - do not expose quota/debug/secret controls to customers.
7. The public button must become usable whenever the connected production worker reports ready.
8. Preserve provenance labels: generated GLB remains **GENERATED-UNREVIEWED** and MAKE remains **VALIDATION REQUIRED**.
9. Add/update tests for:
   - unlimited cumulative budget status/reservation;
   - no duplicate Studio paid submit for a receipt;
   - public health/status readiness in unlimited mode;
   - visible FAST/SLOW selector and SLOW default;
   - FAST disabled when capability is not verified or when references make it incompatible;
   - ongoing live config is generated only from the reviewed disabled base;
   - expired contest marker is no longer the production deployment selector.
10. Update `docs/CONTEST_STATUS.md` with verified root cause, branch/PR state, test evidence, and the production cost/deploy gate.

## Hard boundaries

- Do not merge or deploy from this task without explicit owner approval.
- Do not make a paid model request in CI or smoke tests.
- Do not expose secrets.
- Do not claim a model is manufacturing-ready.
- Do not remove rate limiting just to satisfy “no limits”; “no limits” here means no customer-visible/global cumulative attempt quota or launch-window expiry.
