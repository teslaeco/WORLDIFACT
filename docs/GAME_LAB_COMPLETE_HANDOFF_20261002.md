# Complete Shop / Game Lab handoff

## Scope

The owner's requested full-flow check found two remaining handoff gaps after deployed PR #171. Detailed-model recovery and placement were verified with deterministic fixtures. Procedural blueprint GLBs were download-only, and an unsaved world could disappear when navigating to Shop before its autosave timer fired.

## Procedural model preservation

- Preserve the exact locally emitted GLB and original prompt.
- Record explicit blueprint provenance and the actual generation result/model/request/evidence, distinct from detailed Studio jobs.
- Use a stable namespaced local identity and immutable archive writes. Do not fabricate a signed receipt or assert account ownership.
- Preserve all historical detailed Studio archive records.
- Keep local download available when archive persistence fails, and show a clear retry/error state without starting another model request.
- Emit the existing archive-change notification so Game Lab updates automatically.
- Keep procedural entries outside the detailed-job ownership verification endpoint.

## World navigation safety

- For a dirty active world, wait for a confirmed revision-checked save before following a Shop link.
- Preserve the character-brief route state for the character-specific Shop link.
- Reject overlapping navigation attempts and stale owner/world/edit results.
- A failed save keeps the user and draft in the editor; it does not silently discard or regenerate anything.
- Signed-out browsing and untouched onboarding must not create account records.

## Verification boundary

Tests use deterministic fixture providers and storage/API adapters with actual production handlers. This is not evidence that a new paid model was generated, that browser IndexedDB works on a specific device, or that a private model rendered correctly on Android. The production browser session used for public UI checks was signed out and had WebGL disabled. Exact-head CI and deployed asset integrity remain the release gate.
