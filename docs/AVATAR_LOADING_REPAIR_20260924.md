# Original Queen delivery repair — 24 September 2026

Owner request: the detailed Fan Queen is absent or appears after a long wait; the mobile screenshot shows the original-character load error. Scope is avatar delivery only, not the deferred comparison images/buttons, contest submission, generators or billing.

## Findings

The current source is still Oracle job `99397623-e45c-48dc-95ec-6f84446a54d5`. Two anonymous production GETs from the diagnostic runner returned HTTP200 and 27,676,800 bytes. Header/total times were 1.331/1.418 seconds and 1.288/1.368 seconds. These are runner measurements, not Android timings. The prior frontend imposed an unconditional 30-second deadline over the complete transfer. The server fetched and buffered the same original for each call with no explicit edge cache; responses expired from the browser cache after five minutes. A slow but healthy ~28 MB mobile download could therefore end with an error even while bytes were arriving.

## Repair

- Keep the exact original model, textures, rig, fan and existing asset provenance. Apply only lossless HTTP gzip and a versioned Cloudflare cache of validated responses. Compression variants have separate keys and `Vary: Accept-Encoding`; no visitor cookies or secrets enter cache keys. Cache failures remain non-fatal, non-GET/HEAD methods stay rejected, removed Oracle configuration stays fail-closed, and errors/HTML/redirects/partial models are never cached. Cache writes use the Worker request context rather than delaying the player response.
- Increase browser cache lifetime to one day. Allocate decoded model storage once when the validated size is known. Preserve the bounded 48 MB decoded ceiling and complete GLB checks.
- Replace the fixed 30-second deadline with a first-response timeout, a progress-reset inactivity timeout and a hard bounded total deadline. Retry a transient GET failure once; never retry authorization errors or generation. Logout cancels both the current request and retry backoff. Preload and world continue to share one promise.
- Display actual decoded download progress and distinguish preparing the model/animation from network transfer. React progress updates are limited to changes in the displayed status/whole percent. No substitute mannequin or fake loading percentage.

## Production resource-limit follow-up

PR84 passed 453 tests and deployed as `113fda7105ca8dd49a258405608cafdb675eb529` in run35978415804. The real transport probe35978549212 confirmed the exact original SHA and reduction from27,676,800 to18,076,285 wire bytes, but its second request failed. Diagnostic35978751536 reproduced two gzip200/MISS responses followed by Cloudflare503/error1102 (resource limits). The error alone does not distinguish CPU from memory. Native local workerd with a similarly sized synthetic fixture passed three requests; that was insufficient to establish production safety. Therefore the preceding on-demand Queen compression/cache path is superseded in production, not declared successful.

The current repair packages the hash-pinned original as a gzip static release during `postbuild`. It writes only into ignored `dist`, never commits model binaries, uses only the existing anonymous public game model, and fails the build for missing/substituted/oversized data. Future builds prefer the immutable release; the old read-only avatar API bootstraps the first one. No generation, external publication, credentials or billing changes.

With the existing ASSETS binding, the Queen API now streams the already prepared release without Oracle fetches, full-body buffering, request-time compression or Cache API writes. Missing/HTML/partial release assets fail closed rather than re-entering the resource-heavy fallback. Original visitor encoding negotiation (including Cloudflare's original-header metadata), HEAD, source-configuration guard, identity streaming and logout/client retry semantics remain intact. Browser recovery and progress from PR84 are retained. No model geometry, rig, fan or texture is changed.

## Evidence and limits

The release adds tests for zero pre-consumption of the forwarded stream, no Oracle/cookie/token forwarding, fixed asset selection, correct identity/HEAD handling, invalid asset/configuration guards, mandatory build preparation, and rejected truncated or same-size substituted originals. Full current-head CI and actual repeated production delivery must pass before declaring this follow-up released. Physical Android rendering/FPS and decoding time remain unmeasured; browser security restrictions remain respected. Exact final evidence is recorded in the follow-up PR.
