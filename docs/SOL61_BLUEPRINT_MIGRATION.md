# GPT-6.1 Sol direct blueprint migration

Reviewed 5 October 2026 against the official API model page:
https://developers.openai.com/api/docs/models/gpt-6.1-sol
Release date: 29 September 2026, recorded at:
https://developers.openai.com/api/docs/changelog

New Sol blueprint requests use `gpt-6.1-sol` with the existing Responses API,
`reasoning.effort: low`, `service_tier: default`, strict structured output and
4,000-token output ceiling. Luna remains `gpt-6-luna`; Astra remains
`gpt-6-astra`. The separate detailed Oracle/Blender runtime stays Astra-only.
Official availability does not establish access for the configured project/key.
The existing token-count preflight must succeed before any paid generation.

The Sol contract remains 50 customer points and a 35-cent maximum provider
reservation. Standard short-context prices per million tokens are $2 input,
$0.10 cached input, $2.50 cache write and $10 output. Above 272K input tokens,
input/cache rates double and output is 1.5 times the short rate. Including a
10% regional uplift, the existing conservative $6 input / $17 output reservation
covers the $5.50 cache-write input / $16.50 output envelope. Fast service tiers
are not enabled. No subscription price, account balance, grant or allowance is
changed by this migration.

New account reservations persist an exact `blueprintProviderModel`, and the
Worker requires the account object's matching model acknowledgement before
starting token counting or a provider request. Completion and reconciliation
check that stored identity. Historical jobs without the marker keep their
original `gpt-6-sol` identity and immutable economics. Old request IDs recover
original results rather than switching models or starting another attempt.

New browser recovery metadata also stores the exact provider model. Historical
markerless browser receipts retain the original model expectation. Archive
validation accepts both Sol versions and never relabels old provenance.

Offline coverage includes new/old identity mismatches, recovery and replay,
unchanged costs, the account acknowledgement fence, independent Luna health,
archive preservation and current portal/editor flows. Stubbed responses do not
establish live provider access, successful real generation or visual acceptance.

Mixed deployments fail closed: current clients send their exact provider model in
the JSON body and include it in new fingerprints. The old Worker rejects that
unknown field before admission; the new Worker will not reserve a fresh Sol job
without the expected model. Unnegotiated legacy POSTs are recovery-only and must
match the owned old job's fingerprint and model. Existing GET recovery remains
available. A protocol refusal stays marked as not started across reload and
requires an explicit reset before another attempt.

For newly validated failed-response usage, retained liability uses the actual
bounded output token count with the existing conservative rates/input margin.
Completed v1 reconciliation keeps its original 4,000-output-token default; the
historical read-only preview cannot write credits or reinterpret old receipts.
