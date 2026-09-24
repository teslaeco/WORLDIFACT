# Original Queen: internal static response metadata

PR85 published successfully with 458 tests, but strict probe35980230582 caught a fail-closed502. Read-only diagnostic35980438300 verified the raw deployed gzip exists (GET200, application/gzip, gzip magic, 18,076,285 bytes) while HEAD omitted Content-Length. Internal ASSETS responses may omit transport Content-Length too; the previous helper incorrectly required it.

Accept an absent length on this fixed, build-validated asset without buffering or inventing its compressed size. Any present invalid/oversized length, HTML, redirect, partial response, unexpected encoding or disabled source still fails closed. The decoded model length remains pinned for client progress. A regression test covers absent-length GET and HEAD.

Six local release tests passed with Node22's explicit type-stripping flag, followed by typecheck and lint (17 inherited warnings, zero errors). The first local invocation without that flag could not load TypeScript, not a model/test assertion failure; CI uses Node24. Full current-head CI remains a merge gate. Production body SHA and actual encoded bytes, not an optional HTTP length header, are the final delivery verification contract. No model, rig, fan, billing, generation or deployment workflow changes.
