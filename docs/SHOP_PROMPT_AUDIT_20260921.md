# AI Shop: generation-start rejection hidden by a generic error

21 September 2026. Reviewed baseline: `360b9e0a9d86cfcf9f395a448d636c1073fc75b4`.

## Finding

The owner reported an unchanged previous preview after attempting another SLOW model. The screenshot shows SLOW availability and no explicit failure reason. Availability is not validation of a particular input.

The earlier assistant supplied a 3751-character geometry prompt. The baseline Shop permits 4000 characters, but `oracleStudioPayload()` appends export and manufacturing instructions. For the default Shop purpose `figurine` and texture ceiling 4096, those instructions add 1555 characters. The resulting 5306-character payload exceeds the server's 5000-character maximum (by 306). For `object`, the total is 5304; it also exceeds the maximum. `server/studio.ts` preflight rejects such a payload with `Shorten the description: the worker accepts 5000 characters including export instructions.` The UI discards that explanation and renders `We could not complete that step. Please try again.`

This is a source-reproduced input rejection, not proof that the Oracle machine or the model provider is down. The exact mobile request response was not available. Public `/api/health` and `/api/studio/status` could not be fetched in the available web tool; shell network access failed at DNS. Do not infer live credit exhaustion, a stopped worker or an outage from those tool limitations.

## Repair

`studioPromptBudget()` derives overhead from the existing canonical payload builder, rather than a hard-coded guessed reserve. It subtracts that overhead from the worker limit advertised by Studio status, respects the existing 4000-character API draft ceiling, and normalizes whitespace the same way as server input validation. Unknown limits fail closed with a refresh instruction. Nothing silently truncates a design or removes mandatory rules.

AI Shop shows the effective limit beside the description and explains overage immediately above Generate. The submit path also checks the budget before preparing a receipt, clearing the previous preview or starting a generation. The separate FAST blueprint path keeps its existing 2000-character behavior.

A small allowlist maps known failures to actionable customer text; arbitrary provider exceptions, private URLs and tokens are never echoed. A visible recovery button uses the existing selected receipt/status/artifact path, not a new generation POST. No automatic retry, change of model, backend deployment, capacity increase or paid test is included.

## Reproduction and verification

- Baseline `studioProtocol.ts` locally reconstructed and checked against Git blob `5aa6560707599d59c45119f081e30e9ebcc0bd63`.
- Baseline `ShopPage.tsx` checked against Git blob `61197ea5f14d300be7c086592621cc762f591cad` before applying the small UI diff.
- 3751 + 1555 = 5306; 5000 - 1555 = 3445 effective default draft limit.
- `node --experimental-strip-types --test tests/studio-prompt-budget.test.ts`: 9/9 PASS in local Node 22.16. Repository CI uses Node 24.
- Coverage includes incident overage, exact boundary and boundary + 1, every purpose/texture combination, alternate worker limits, missing/invalid capacity, normalization, unchanged design input, retained manufacturing rules and safe errors.
- Strict TypeScript check of the new helper and the exact baseline protocol passed.
- TypeScript transpilation found no Shop TSX syntax errors. This is not a full React/browser or repository typecheck.
- Full local verify/dry-run could not run in the partial checkout without dependencies. Exact-head PR CI is required before release.

## Immediate operator guidance

For the current 5000-character worker contract, replace only the description with a version shorter than 3400 characters; keep the existing reference image. Do not clear browser storage or repeatedly press Generate. Shortening addresses this verified length rejection, but does not by itself establish that other live readiness gates pass. A new generation still requires an explicit user action and uses the owner's existing API budget.

## Boundaries

No private reference picture, design document, signed job receipt or secret is published. No new model or engineering-quality claim is made. The full earlier project ledger remains preserved unchanged in the adjacent archive document.
