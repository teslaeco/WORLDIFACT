# 15 October 2026 — Six-portal landing LIVE: merge and preserving release verified

## Current verified milestone

[PR #294](https://github.com/teslaeco/WORLDIFACT/pull/294) was merged with the owner's authorization as `a83a85d4c830147bb5861120ed3dafcd7d63a86d`. Its tree is identical to the reviewed head `d974cfa47751252cc0c5c3fc51219334163945fe`. All five exact-head PR workflows succeeded. [Verify #1258](https://github.com/teslaeco/WORLDIFACT/actions/runs/38687579077) passed the full verify command, foundations, Wrangler dry-run and hosted Studio read-only inspection. [Merge/release authorization and scope](https://github.com/teslaeco/WORLDIFACT/pull/294#issuecomment-6185439110).

**VERIFIED LIVE:** release commit `c82c6abe246996630b1d751a40dcf769181089f5` was published by [Publish six portals preserving production](https://github.com/teslaeco/WORLDIFACT/actions/runs/38689313662), job `116271405543`, with conclusion **SUCCESS**. The public verification report was emitted at `2026-10-15T05:57:29Z`. Actual Cloudflare version: `630e387c-15d8-42b6-848d-bacf32e2b697`. Public origin: https://worldifact.xodobrox.workers.dev.

The release's original `npm run verify` passed: **2311 tests, 2311 passed, zero failed, skipped or cancelled**, plus lint, TypeScript, HTTP smoke and build. Foundations and the preserving Wrangler dry-run passed. [Verify WORLDIFACT on the release commit](https://github.com/teslaeco/WORLDIFACT/actions/runs/38689313583) also completed successfully, including the hosted Studio read-only inspection. Passing lint does not mean zero warnings or a clean dependency-security audit.

The actual post-deployment `PUBLIC_RELEASE_VERIFIED` report confirms:
- 12 standard HTML routes and **437 built assets** verified against the release output.
- An additional public `GET /account/worlds` returned **200**, with HTML equal to the built application entry.
- Six-portal and scrolling-resource JS/CSS markers are present in the verified public asset set.
- Studio reports `ready=true`, the existing durable admission/execution revisions, `astra`, `sol`, `luna`, Standard/Fast, and the existing unlimited-allowance flag. These are capability/readiness checks, not new successful provider generations.
- `paidGenerationDuringDeploy=false`; `browserVisualAcceptance=NOT_PERFORMED`.

## Preserved production settings and workflow distinction

The one-use `six-portals-release-once.yml` envelope permitted only the exact merged parent, its own marker/workflow, and the pre-publication status update. It ran the original full verification before using the existing reviewed preserving-config builder and `wrangler deploy --keep-vars`. No secret synchronization, billing mutation, paid generation, Oracle restart or unrelated PR was included.

The separate historical [Cloudflare workflow run 38689313636](https://github.com/teslaeco/WORLDIFACT/actions/runs/38689313636) remains **FAILED** at `Verify one-time pipeline release scope before credential setup`. Its credential setup, secret synchronization and publication steps were skipped. That old scope guard was not disabled or rewritten. This is a separate failed-closed workflow, not the outcome of the successful production release above. Do not claim that every repository workflow is green.

The release workflow syntax was checked locally before publication: YAML parsing, every shell block with `bash -n`, and all three embedded JavaScript blocks with `node --check`. Workflow blob: `bbad1067704e9d4eab057075fc725503856284eb`. Actual publication evidence is the completed release job, not those syntax checks. This documentation-only follow-up changes no application source, release marker or deployment configuration.

## VERIFIED changes and CI diagnosis

- The account landing contains six neon portal links: `/chess`, `/iss`, `/planets`, `/shop`, `/lab`, and `/account/worlds`. The shared-world page also exposes My Worlds as its sixth direct navigation destination.
- The compact resource strip includes NASA, ESA and JAXA with an explicit no-partnership/no-endorsement notice. The ISS preservation petition is retained.
- CI run [38686038820](https://github.com/teslaeco/WORLDIFACT/actions/runs/38686038820) identified four syntax errors introduced by unescaped slashes in two route regex literals. Those literals were replaced with exact route extraction and equality assertions.
- The revised account-entry test preserves the existing header-branding, guest-entry, gated-provider, OAuth-error and untrusted-redirect assertions. It additionally verifies all six routes exactly once and in order on both landing navigations.
- The later routing failure was a stale `Five portals` expectation in `tests/account-entry-routing.test.mjs`. The test now checks `Six portals` and the six actual route destinations, not merely a replacement heading. Existing private-world, model-library and zero-network-request routing checks remain intact.
- Diagnostic run [38687138379](https://github.com/teslaeco/WORLDIFACT/actions/runs/38687138379) reported 2309/2311 passing tests. Its two failures were the stale heading and the intentionally detected temporary CI diagnostic wrapper. The original `.github/workflows/ci.yml` was restored byte-for-byte to blob `47fa876758aef48ec15b915eb7c4fc72c4293c36`; the protected-workflow test and its expected hash were not changed. Final Verify #1258 and the actual production release subsequently passed.

## Explicit limits

UNKNOWN: physical Android visual/animation acceptance and a signed-in My Worlds browser walkthrough. The 3D meadow still has five physical gateways; the sixth addition in this PR is page navigation. The owner authorized this source release after green CI; HTTP and source-asset checks do not certify visual quality, model-generation reliability or new 3D reconstruction capability. No failed test, authentication control or provider-budget guard was disabled.

## Preserved prior operational history

All preceding status records, including actual-model-provenance releases and their limits, are preserved byte-for-byte in [the prior status snapshot](CONTEST_STATUS.before-294-19dfe39.md), original blob `c77f694ecadfd8dce4492b59848e8eb5931b2c70`. The snapshot stays in this directory so its relative links retain their original base. Historical VERIFIED claims retain their original dates and are not a fresh production audit.
