# 15 October 2026 — Six-portal landing: merged; preserving publication prepared

## Current verified milestone

[PR #294](https://github.com/teslaeco/WORLDIFACT/pull/294) was merged with the owner's authorization as `a83a85d4c830147bb5861120ed3dafcd7d63a86d`. Its tree is identical to the reviewed head `d974cfa47751252cc0c5c3fc51219334163945fe`. All five exact-head PR workflows succeeded. [Verify #1258](https://github.com/teslaeco/WORLDIFACT/actions/runs/38687579077) passed the full verify command, foundations, Wrangler dry-run and hosted Studio read-only inspection. [Merge/release authorization and scope](https://github.com/teslaeco/WORLDIFACT/pull/294#issuecomment-6185439110).

Publication is PENDING at this checkpoint, not yet claimed LIVE. The one-use `six-portals-release-once.yml` envelope permits only the exact merged parent above, its own marker/workflow, and this status update. It runs the original full verification before using the existing reviewed preserving-config builder and `wrangler deploy --keep-vars`. Existing deployment selectors and their guard tests are unchanged. No secret synchronization, billing mutation, paid generation, Oracle restart or unrelated PR is included.

The workflow syntax was checked locally: YAML parsing, every shell block with `bash -n`, and all three embedded JavaScript blocks with `node --check`. The checked workflow blob is `bbad1067704e9d4eab057075fc725503856284eb`. These checks do not establish successful deployment.

Release acceptance requires an actual Cloudflare receipt, byte-for-byte matching of the built public files, a public GET of `/account/worlds`, released six-portal/marquee asset markers, and preserved public Studio readiness. The result and version belong in the release job and the [PR evidence thread](https://github.com/teslaeco/WORLDIFACT/pull/294).

## VERIFIED changes and CI diagnosis

- The account landing contains six neon portal links: `/chess`, `/iss`, `/planets`, `/shop`, `/lab`, and `/account/worlds`. The shared-world page also exposes My Worlds as its sixth direct navigation destination.
- The compact resource strip includes NASA, ESA and JAXA with an explicit no-partnership/no-endorsement notice. The ISS preservation petition is retained.
- CI run [38686038820](https://github.com/teslaeco/WORLDIFACT/actions/runs/38686038820) identified four syntax errors introduced by unescaped slashes in two route regex literals. Those literals were replaced with exact route extraction and equality assertions.
- The revised account-entry test preserves the existing header-branding, guest-entry, gated-provider, OAuth-error and untrusted-redirect assertions. It additionally verifies all six routes exactly once and in order on both landing navigations.
- The later routing failure was a stale `Five portals` expectation in `tests/account-entry-routing.test.mjs`. The test now checks `Six portals` and the six actual route destinations, not merely a replacement heading. Existing private-world, model-library and zero-network-request routing checks remain intact.
- Diagnostic run [38687138379](https://github.com/teslaeco/WORLDIFACT/actions/runs/38687138379) reported 2309/2311 passing tests. Its two failures were the stale heading and the intentionally detected temporary CI diagnostic wrapper. The original `.github/workflows/ci.yml` was restored byte-for-byte to blob `47fa876758aef48ec15b915eb7c4fc72c4293c36`; the protected-workflow test and its expected hash were not changed. Final Verify #1258 subsequently passed.

## Explicit limits

UNKNOWN: physical Android visual/animation acceptance and a signed-in My Worlds browser walkthrough. The 3D meadow still has five physical gateways; the sixth addition in this PR is page navigation. The owner requested this source release after green CI; this is not certification of visual quality, model-generation reliability or new 3D reconstruction capability. No failed test, authentication control or provider-budget guard was disabled.

## Preserved prior operational history

All preceding status records, including actual-model-provenance releases and their limits, are preserved byte-for-byte in [the prior status snapshot](CONTEST_STATUS.before-294-19dfe39.md), original blob `c77f694ecadfd8dce4492b59848e8eb5931b2c70`. The snapshot stays in this directory so its relative links retain their original base. Historical VERIFIED claims retain their original dates and are not a fresh production audit.
