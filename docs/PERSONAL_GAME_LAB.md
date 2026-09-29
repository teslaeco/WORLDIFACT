# Your game, not the portal hub

Game Lab is a separate first-version world editor. The shared five-portal world remains at `/world`; AI Shop no longer embeds another copy below its product form.

## Owner flow

The cosmic opening uses the already-audited original FORGE LED sculpture. New game opens the world name and character brief. The editor starts with no placed objects: only a meadow, river, editable sky and local test-character proxy. Character descriptions do not trigger paid generation. Send a character brief to AI Shop explicitly, choose a priced model there, then import the resulting owned GLB.

The five-step tutorial points to World, Create, Library, Terrain and Assistant. Tap a point and place a local model or built-in object, sculpt a hill/valley, change sky, rename, transform, undo/redo and test controls. The local assistant prepares validated edits; Apply is always a human action. Jump/fly/sprint/reset buttons call actual runtime control handlers rather than producing decorative labels.

## Storage and ownership

Account metadata is stored in the existing `AccountEntitlements` object selected solely from the Supabase-verified account UUID. The public API rejects owner query overrides, missing/cross-origin POST origins and non-JSON writes. A second user cannot read/update the first user's collection. Optimistic revisions return 409 on stale writes instead of overwriting them. Cloud writes are explicit; a 400ms local-draft debounce never calls AI or repeatedly writes to the server.

Initial limits: eight world documents per account, 96KB/document, 80 placements, 64 terrain edits, 16 distinct placed local assets and 30 undo snapshots. Imported GLBs stay in a new account-namespaced IndexedDB library (32 assets / 192MB, 64MB/model). Original shared-browser archive entries are shown only after server confirmation of completed job ownership. Manual imports are deliberate user-selected local files. Cloud metadata is not cloud GLB backup: a second device needs the original model files. Export JSON is a layout/settings backup, not a standalone executable game.

## Costs and Creator Astra

Editing, terrain, local buttons, library placement, the opening scene and tutorial require zero provider requests. Rendering uses the visitor device; storage/hosting still have infrastructure costs. The real AI Create action uses the existing Luna15/Sol50 endpoint and requires explicit submission. Its validated response is proposed before being appended. No background agent loop, network-enabled arbitrary code, model substitution or automatic retry is introduced.

Creator retains 1500 credits for USD29.99, with a recommended starter allocation of two Astra attempts (500 credits) plus 20 Sol attempts (1000 credits), not extra free generations. All-Astra allocation is six attempts. An account-period cap enforces at most six Creator Astra attempts, even after topups; failures do not reset the provider spend reserve. Existing grants and subscriber prices are not rewritten. The USD10.50 worst-case provider reserve for 1500 credits is unchanged. This is a contribution-budget calculation, not a net-profit or completion-quality guarantee.

The global Astra commercial/runtime gate is unchanged until the new Oracle output policy is actually installed and a separately authorized live generation/export test passes. Do not sell a historical cabinet screenshot as proof of the current constrained generator working.

## Native WebMCP and honest limits

Native `document.modelContext` tools may inspect the currently open owned world and propose local edits. They do not apply edits, start paid AI, mutate billing or export credentials. Registration uses an abort signal; logout/unmount closes availability. Unsupported browsers show `WEBMCP_UNAVAILABLE`. This follows the ForgeMCP read/propose/verify/human-decision pattern; it is not a hosted Codex agent, and no Codex API session is claimed.

This release is not an entire Unity/Unreal replacement. Player proxies/imported meshes move as a unit; automatic character rigging, full mesh collisions, real fluid simulation, multiplayer, executable game publication and cross-device binary asset synchronization are not implemented. The controls, local placement and terrain tools described above are functional first-version features.
