# 12 October 2026 — intermittent generation and library visibility audit (in progress)

Current evidence and remaining release gates are in
[P0 recovery validation](GENERATION_P0_RECOVERY_VALIDATION_20261012.md).
PR #274 remains draft/unmerged; production recovery is **NO-GO**.

Evidence: owner screenshots show both a completed chessboard with export controls and separate requests ending in `ORACLE_JOB_MISSING` with points awaiting provider-cost review. The model-completion failure and the account gallery are separate systems; a successful local browser copy is not proof of a settled cloud row.

Reviewed the latest 75 updated pull requests, main `d70adf1c627c9bd5721b6a32e6c020fb3ae59869`, and the account settlement, Oracle dispatch, Gallery and Studio Coordinator code. PR #269 fixed concurrent status polling; #271 fixed display of historic failures after reload. Neither proves Oracle POST persistence. PR #270 supplies mocked admission coverage, not live provider acceptance. Remote Desktop Commander was offline during this review, so provider VM journal, persisted Oracle rows and exact API cost have **not** been independently inspected. No paid generation or refund was initiated.

Confirmed gallery visibility limitation: the account ledger lists entries in 64-row UUID-key order, sorted by completion time only within each returned cursor page. The latest completed job may therefore be absent from the first visible page even when it exists in the account ledger. `StudioGallery` already supports a separately authenticated `/api/studio/library/:id` lookup and existing off-page/deep-link tests. This patch passes the Shop's **exact completed signed receipt ID** to the compact gallery so that the model can be displayed independent of its position within the first page. It changes no account row, provider dispatch, priced admission, credits, Stripe settings, or Oracle configuration. It does **not** solve global recent-first ordering across all historical pages.

Outstanding P0: determine why certain admitted Studio requests have no persisted Oracle job. Inspect the exact request-id trail across Worker diagnostic stages RECEIVED / ADMITTED / SENT_TO_PROVIDER / PROVIDER_RESPONSE, Oracle reverse proxy/tunnel, worker SQLite and service journal, within existing retention. Disambiguate transport/timeout, 429/400, unmatched payload IDs, worker persistence and duplicate reservation. Preserve request IDs, held points, immutable provider liabilities, costs, account ownership and original artifacts. Do **not** auto-retry an uncertain POST, equate 404 with zero provider spending, or silently mark work completed. Design a durable idempotent acceptance/outbox with acceptance acknowledgement and reconciliation once evidence supports a root cause, then test interrupted requests, concurrent polls, restart/reload, 429s, unavailable provider, and actual completed-model account listing with mocked infrastructure. Live paid end-to-end testing requires fresh bounded authorization.

The continuation adds original FBX, BLEND and texture ZIP downloads to the selected
account preview through existing authenticated export routes. Missing exports
stay unavailable, expired tickets renew only for the same owned model, and logout
aborts an in-flight download. No conversion or provider submission is added.

Local verification now passes 2,290/2,290 Node tests, including 29 gallery/transport
checks and real SQLite Durable Object restart recovery with mocked Oracle. Library
pagination tests retain all 68 completed models in a 260-record history. These are
local results, not a verified customer account on production. The PR records hosted
checks for its final commit. Do not mark the missing-job incident fixed or claim
deployment from these results.

The latest owner Cloud Shell screenshot establishes seven exact source hashes,
healthy SQLite, 43.58 GiB free and two active services. The matching server's
restart handler incorrectly fails queued work; this regression is reproduced and
fixed in an uninstalled Oracle candidate. Thirty new Python tests and negotiated
Worker STAGE/START cover durable input, same-ID recovery and no repeated paid
dispatch. Full installed receipt authentication, a reviewed gated installer,
actual VM acceptance and original receipt/billing correlation remain incomplete.
No production repair or deployment is claimed.
