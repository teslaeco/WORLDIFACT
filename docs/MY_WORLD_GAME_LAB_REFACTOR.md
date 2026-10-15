# My World / Game Lab separation — implementation contract

Status: IN PROGRESS. This document does not claim deployment.

## Product boundaries
- AI Shop: create individual assets, inspect generated files and provenance, save to personal library, and send a selected asset to My World. Remove the embedded WorldBlueprint creator from the Shop page; retain links to My World.
- My World (/account/worlds): create and edit WorldBlueprint scenes, import owned AI Shop assets, position and configure objects, save revisions, and hand off a versioned GameProject to Game Lab.
- AI Game Lab (/lab): load saved GameProject, playtest with vehicle/character controls, adjust physics, camera, speed and collision parameters via validated prompts, select rendering quality, and save test settings. No world or asset generation form here.
- 8 Planets: display a dismissible pre-entry experimental / under-development notice; never claim stable gameplay.
- Exports: Game Lab only. Windows, Linux, and Android builds require an actual build pipeline, platform-specific packaging and artifact validation. Show PLANNED/BLOCKED until working; never present a procedural GLB as an APK or executable.

## Data and access
Asset -> WorldBlueprint -> versioned GameProject -> Playtest -> ExportJob -> verified downloadable artifact.
Persist owner ID and provenance at every stage; authorize ownership server-side.
Paid subscription entitlement is required for starting a packaged-game export, checked on the server. Free users can create and playtest subject to normal usage policies. Do not trust client-side flags. Add quotas, rate limits, build timeouts, job idempotency, artifact expiration and safe errors. Admin exemptions require explicit server-side entitlements.
Do not charge for local settings changes. Quote any paid export before starting a billable job; do not debit on failure.
Prevent unsaved-change loss on internal navigation and browser refresh where supported.

## Acceptance
1. AI Shop no longer renders the WorldBlueprint form; model generation remains intact.
2. My World creates, saves, reloads, and reopens a scene with multiple owned assets.
3. Game Lab opens the saved scene and playtests a drivable vehicle; speed/steering updates affect playtest, not source assets.
4. Anonymous/unsubscribed users cannot start an export job even by direct API request.
5. A subscribed user gets a real artifact only after a successful platform build; failed builds are visible and retryable.
6. Android narrow viewport has no overlapping controls or duplicate navigation.
7. Existing generator jobs, library, billing and old deep links do not regress.
8. Unit, integration, end-to-end, mobile and production smoke tests pass before deployment.
