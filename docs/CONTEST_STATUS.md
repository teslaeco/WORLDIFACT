# 15 October 2026 — Six-portal landing and PR #294 CI repair

Review: [PR #294](https://github.com/teslaeco/WORLDIFACT/pull/294). This work is on a review branch; no merge, production deployment, subscription change or paid generation was performed.

## VERIFIED changes and diagnosis

- The account landing contains six neon portal links: `/chess`, `/iss`, `/planets`, `/shop`, `/lab`, and `/account/worlds`. The shared-world page also exposes My Worlds as its sixth direct navigation destination.
- The compact resource strip includes NASA, ESA and JAXA with an explicit no-partnership/no-endorsement notice. The ISS preservation petition is retained.
- CI run [38686038820](https://github.com/teslaeco/WORLDIFACT/actions/runs/38686038820) identified four syntax errors introduced by unescaped slashes in two route regex literals. Those literals were replaced with exact route extraction and equality assertions.
- The revised account-entry test preserves the existing header-branding, guest-entry, gated-provider, OAuth-error and untrusted-redirect assertions. It additionally verifies all six routes exactly once and in order on both landing navigations.
- The later routing failure was a stale `Five portals` expectation in `tests/account-entry-routing.test.mjs`. The test now checks `Six portals` and the six actual route destinations, not merely a replacement heading. Existing private-world, model-library and zero-network-request routing checks remain intact.
- Diagnostic run [38687138379](https://github.com/teslaeco/WORLDIFACT/actions/runs/38687138379) reported 2309/2311 passing tests. Its two failures were the stale heading and the intentionally detected temporary CI diagnostic wrapper. The original `.github/workflows/ci.yml` is restored byte-for-byte to blob `47fa876758aef48ec15b915eb7c4fc72c4293c36`; the protected-workflow test and its expected hash were not changed.
- Both edited test files passed local `node --check`. This is syntax evidence, not a replacement for CI or browser testing.

## Required review gates

The final review head must pass the original `npm run verify`, foundations build, Wrangler dry-run and hosted-Studio read-only inspection. The definitive exact-head result is the latest [PR check](https://github.com/teslaeco/WORLDIFACT/pull/294/checks), with run and commit evidence recorded in the PR conversation. No failed test, workflow step, authentication control or provider budget guard is disabled by this repair.

UNKNOWN: physical Android visual/animation acceptance and a signed-in My Worlds browser walkthrough. The 3D meadow still has five physical gateways; the sixth addition in this PR is page navigation. This entry does not certify model-generation reliability or announce a production release.

## Preserved prior operational history

All preceding status records, including actual-model-provenance releases and their limits, are preserved byte-for-byte in [the prior status snapshot](CONTEST_STATUS.before-294-19dfe39.md), original blob `c77f694ecadfd8dce4492b59848e8eb5931b2c70`. The snapshot stays in this directory so its relative links retain their original base. Historical VERIFIED claims retain their original dates and are not a fresh production audit.
