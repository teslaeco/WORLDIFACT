# Private Game Lab — editing, characters and cost controls

## Selection and movement

At `/lab` or `/builder`, tap an object or select it from **Scene objects**. Choose **Move**, **Rotate** or **Scale**, then drag the handle. **Snap** controls placement spacing; **Move to marker**, **Focus selection**, **Duplicate** and **Place on ground** work without an AI call. One completed gesture becomes one undo entry. Cancelled gestures and stale selections do not change the saved world.

The editor keeps the main portal world separate. World names, terrain, object placement, sky and controls belong to the logged-in account. Saving remains revision checked; another tab cannot silently overwrite a newer save.

## Models and practical limits

The old four-imported-model, two-MCC and 48-object placement caps are removed. Rendering is resource-budgeted: detailed meshes use a two-million-triangle/1,800-draw-call budget; imported file caching is bounded to 96 MB. When files are absent, still loading or too costly, lightweight placeholders keep their saved placement. Original models are never deleted or downsampled by this behavior.

World manifests are capped at 96 KiB and 4,096 records as a protocol safety ceiling; the byte limit normally comes first. There are eight worlds per account and at most 128 terrain edits. These storage/security limits are not a claim of unlimited hardware. The device library no longer has a 12-file cap; its total is bounded to 350 MB with a 50 MB maximum per self-contained GLB. Layouts save to the account, but model files remain in owner-namespaced storage on the current device. Keep original-file backups.

## Character

Creating a world now shows a procedural character immediately in both Edit and Play. Supported body, clothing, hair and color presets are generated locally for zero AI points; the character is not advertised as a detailed AI reconstruction. **Focus character** makes it easier to find.

In the **Character** panel, choose an existing library GLB or explicitly request one detailed Astra job through the established Studio/Oracle/Codex/Blender MCP pipeline. The request is account-metered and still requires the Astra runtime gate. Creating the world does not itself buy a generation. Per-account/per-world receipts recover the same job after interruption; a completed GLB is validated and saved before adoption. A result cannot silently replace a changed character description. A static GLB is not automatically rigged; embedded animations are used only where present.

## Assistant and Codex

Local commands remain free, reviewed typed edits. The command “Przesuń drzewa by nie stały na rzece” offers to move intersecting starter trees clear of the river, while keeping the other objects unchanged. Apply is explicit and stale proposals must be regenerated.

A Codex/MCP instruction is generated from the world, selected object and request. Use **Show generated task**, **Copy Codex instruction** or **Download task**. It is a scoped task, not a hidden remote agent. Opening the original Forge Studio does not transfer this private scene, cookies or API credentials. The actual detailed character job uses the existing guarded production pipeline when enabled; no new uncapped multi-agent runtime has been introduced.

## Subscription management

The existing Stripe portal still manages payment methods and cancellation. A separate change-plan route opens customer confirmation for an existing subscription rather than creating a duplicate. It rejects unknown targets, unpaid/pending billing state and paused generation plans. A complete paid full-price invoice is required before granting an upgraded pack. Customer confirmation is not simulated by this app.

Astra sales and Creator Astra access remain pending the actual Oracle output-policy update and a successful bounded live generation/export test. The previous USD2.10 test authorization is not reused. No paid provider request or customer charge is made merely by opening this editor or a billing confirmation page.

## Verification boundary

Automated tests cover account isolation, finite transforms, original preservation, larger scenes, terrain-relative placement, resource limits, character geometry/binding, real component server rendering and mocked Stripe confirmation flows. These do not establish visual performance on a physical Android device or success of a real paid character generation. Production release evidence belongs in `CONTEST_STATUS.md`.
