# Private Game Lab — account-owned world prototype

## Included

A new original editor replaces the portal-map view at `/lab` and `/builder`. The main portal world stays at `/world`. Shop retains its main asset generator; the duplicate footer world generator is removed.

New users see a star-themed welcome and an 18-face octagonal antiprism (16 triangle faces and two octagonal caps). Naming a world and describing a character creates no AI call. The editable scene starts with only ground, grass and the river. The local character is a placeholder, not an AI-generated reconstruction; the saved brief can be handed to AI Shop without submitting a job.

Local editing: terrain raycast point, model placement, X/Z/elevation/scale/rotation inspector, mountain/valley stamps, undo/redo, day/stars, game control toggles and play test. Jump, sprint and proximity interaction work in the test scene with keyboard and touch controls. Interaction currently reports the nearby object; full scripted actions, multiplayer, publishing standalone games, combat and animation retargeting are not claimed.

The five-step guide covers world/character setup, explicit model generation, gallery insertion, terrain/controls and playing/saving/exporting.

## Storage and isolation

`/api/worlds` verifies the existing Supabase access cookie and derives the account Durable Object identity. It never trusts a client owner field. The internal world namespace is separate from billing and jobs. Saves use an expected revision; conflicts preserve the unsaved draft. Deletions keep a revision tombstone. Limits are eight worlds, 48 placed objects, 64 terrain stamps and 64 KiB per manifest. Auto-save is delayed after edits and stops after errors rather than retrying in a loop. Existing financial records are not migrated or modified by scene saves.

World manifests are private server records. Embedded GLB files are stored in owner-namespaced IndexedDB, up to 12 files/150 MB per device library, 50 MB per file and four imported model placements per scene. They do NOT sync as model bytes across devices. Other users' manifests are inaccessible through the API. Like other browser storage, files are not protected against an administrator of the same device or developer-tools access.

The legacy gallery itself is a device archive. The editor only lists matching completed jobs after a server ownership/download check. An unassigned historical file must be explicitly imported by its owner rather than silently claimed. Only local validated GLB buffers reach the loader; arbitrary external resource URLs are rejected.

## Cost model

Entering, creating/naming, saving, importing/placing existing GLB, sculpting, changing sky and local control commands do not call a model and consume zero AI points. Normal hosting/storage request charges still exist; this is not a zero-total-cost guarantee.

The local assistant is an explicit rules-based command helper. Its preview requires Apply. It is not advertised as a connected Codex agent. Optional AI object planning calls the existing Luna/Sol endpoint once, with existing price/entitlement/provider budget limits. Changes made while AI is pending invalidate automatic application. No remote MCP process, third-party endpoint, shell execution or unattended agent loop is enabled.

## Creator membership Astra policy

Same USD29.99 subscription and 1,500 points. The recommended mix is TWO Astra attempts (500 points) plus TWENTY Sol attempts (1,000 points). Alternatively, six Astra attempts consume all 1,500 points. The conservative provider reserve remains USD10.50: 2×1.75 + 20×0.35 = 10.50, identical to 6×1.75. This is an allocation inside the existing grant, NOT two bonus generations, not a promise of successful generation, and not guaranteed net company profit.

Creator's six-attempt maximum is per confirmed subscription period; a top-up, repeated invoice/webhook, failed attempt or point refund does not reset it. The production commercial safety flag still gates access. Until the existing updated Oracle pipeline has a successful authorized live test, UI must describe Creator Astra as pending activation, not a working included service.

## Sources and integration review

Official OpenAI model and Codex noninteractive documentation re-opened 29 September 2026. No API key was fetched or placed in frontend code. ForgeMCP's MIT license was reviewed; this release copies no Forge source or model assets and starts no remote agents. A JSON brief export is provided for future guarded Codex/MCP use, without claiming execution.

## Testing boundaries

Unit/integration tests must cover owner isolation, CSRF, unsafe fields, concurrency, deletion tombstones, financial cap/replays/refunds, local commands and the exact polyhedron face count. Renderer code supports context-loss notice and teardown; no successful Android visual test is inferred from a build or numeric geometry test. Actual production publication must be recorded separately in CONTEST_STATUS.
