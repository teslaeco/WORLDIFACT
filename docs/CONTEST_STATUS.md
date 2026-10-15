# 2026-10-15 — ECOMECH V6 original six-part neural research and QA — NO-GO

IMPLEMENTED/TESTED: free MIT TripoSR CPU six-part image-to-mesh: [generation run #38698419490](https://github.com/teslaeco/WORLDIFACT/actions/runs/38698419490) SUCCESS; independent no-paid real binary/PBR depth tests: [#38701960353](https://github.com/teslaeco/WORLDIFACT/actions/runs/38701960353) SUCCESS. Original GLB 4,376,136 bytes SHA-256 `193ad27bd19ec94941b24222662024460d62758c7e2b0e53e7e55e51196f5970`, 218,450 faces / 6 neural parts. Physical GLB archive on isolated branch outside `public/`: [original archive #38702243568](https://github.com/teslaeco/WORLDIFACT/actions/runs/38702243568) SUCCESS at commit `d02a706e6dcc036920a9e620a64179fc818eecb8`. QA: depth/height **0.11164 FAIL**, zero PBR/normal textures, no rig, 360-degree visual review absent. Draft outline overlap **0.80342** uses the same annotation as assembly and is NOT an independent similarity result. Provider attribution: local open source TripoSR + WORLDIFACT assembly, NOT Astra-created geometry. New AI/vendor spend USD **0.00**. Premium, GAME release and MAKE **NO-GO**. Full details `docs/ECOMECH_V6_CHARACTER_ENGINE_STATUS_20261015.md`. [Draft PR #298](https://github.com/teslaeco/WORLDIFACT/pull/298), stacked on V5 #297, not merged/deployed. GitHub bot-created head check may need authorization, not silently treated green.

---

# 2026-10-15 — Character Engine V5 root-cause repair (DRAFT only)

IMPLEMENTED/TESTED: [draft PR #297](https://github.com/teslaeco/WORLDIFACT/pull/297). Photo-referenced robots containing MCC, motor, wiring and contactor words now select the **humanoid robot** instruction profile rather than a cabinet. Sol/Astra advice is opt-in on the draft and does not submit, alter the account, price, model or original job. Explicit prior model/price remains authoritative. Real V5 QA tests include actual robot photo, existing MCC and woman model regressions and no paid dispatch. The older legacy /reserve test now correctly asserts the existing immediate 250-point debit against `credits`, with zero `reservedCredits` hold and same-ID idempotency; no payment code was changed. [Exact production-code CI #38701270312](https://github.com/teslaeco/WORLDIFACT/actions/runs/38701270312) SUCCESS on `827fe3b7eb339beb5d3f5ad1e5527710934e61cf`. No new OpenAI API jobs/cost, no merge or deployment. New actual photo-likeness model remains BLOCKED; green tests do not prove photorealism.

---
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
