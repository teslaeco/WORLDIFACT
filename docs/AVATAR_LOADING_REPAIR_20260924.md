# Original Queen delivery repair — 24 September 2026

Owner request: the detailed Fan Queen is absent or appears after a long wait; the mobile screenshot shows the original-character load error. Scope is avatar delivery only, not the deferred comparison images/buttons, contest submission, generators or billing.

## Findings

The current source is still Oracle job `99397623-e45c-48dc-95ec-6f84446a54d5`. Two anonymous production GETs from the diagnostic runner returned HTTP200 and 27,676,800 bytes. Header/total times were 1.331/1.418 seconds and 1.288/1.368 seconds. These are runner measurements, not Android timings. The prior frontend imposed an unconditional 30-second deadline over the complete transfer. The server fetched and buffered the same original for each call with no explicit edge cache; responses expired from the browser cache after five minutes. A slow but healthy ~28 MB mobile download could therefore end with an error even while bytes were arriving.

## Repair

- Keep the exact original model, textures, rig, fan and existing asset provenance. Apply only lossless HTTP gzip and a versioned Cloudflare cache of validated responses. Compression variants have separate keys and `Vary: Accept-Encoding`; no visitor cookies or secrets enter cache keys. Cache failures remain non-fatal, non-GET/HEAD methods stay rejected, removed Oracle configuration stays fail-closed, and errors/HTML/redirects/partial models are never cached. Cache writes use the Worker request context rather than delaying the player response.
- Increase browser cache lifetime to one day. Allocate decoded model storage once when the validated size is known. Preserve the bounded 48 MB decoded ceiling and complete GLB checks.
- Replace the fixed 30-second deadline with a first-response timeout, a progress-reset inactivity timeout and a hard bounded total deadline. Retry a transient GET failure once; never retry authorization errors or generation. Logout cancels both the current request and retry backoff. Preload and world continue to share one promise.
- Display actual decoded download progress and distinguish preparing the model/animation from network transfer. React progress updates are limited to changes in the displayed status/whole percent. No substitute mannequin or fake loading percentage.

## Evidence and limits

20 focused tests passed locally, including a simulated healthy 60-second mobile download, a genuinely stalled stream, bounded automatic retries, cancellation during logout, exact gzip round trips, encoding-separated cache hits/HEAD, non-cacheable failures and configuration/method guards. TypeScript, lint (17 existing warnings, zero errors), frontend bundle and Worker dry-run pass. Full local `npm run verify` stops at the preverify ISS vendor fetch because DNS is unavailable; the unchanged full GitHub CI must pass before merge. No browser security restriction is bypassed.

`scripts/check-avatar-delivery.mjs` provides an anonymous, read-only production transport check against the previously verified original SHA-256. It neither writes model files nor performs generation. Final current-head CI, merge, publication and production compression measurements belong in the PR/release record; they are not inferred from local tests. Actual physical Android rendering, decoding time and visual acceptance remain unmeasured.
