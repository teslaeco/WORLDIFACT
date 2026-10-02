# Game Lab generated-model placement repair

2 October 2026. Owner requested diagnosis and repair of generated models not adding to AI Game Lab, then authorized merge and deployment after green checks.

## Data path

AI Shop fetches an authorized completed model and archives its original GLB plus prompt in the local Studio archive. Game Lab displays these locally available files; `/api/worlds/library` adds account-verification badges and is still rechecked for verified entries before import. Explicit local-byte use never asserts cloud ownership or starts generation.

A model import validates the embedded GLB, hashes the unchanged original, and stores it in the current account's device library. The world entity references this local asset ID. World saves are account-isolated, revision-checked JSON documents. They preserve entity ID, asset ID, position, elevation, scale and rotation; GLB files are not uploaded by this path.

## Repairs

1. Normalize derived scene labels, including legacy records, before strict world validation. Preserve the original prompt and file.
2. Add a library model directly at the current marker in one action; select it for transforms. Keep the Build placement tool for intentional further copies.
3. Lock import before permission/read awaits and discard results after account, world or component changes. Never add twice from overlapping clicks.
4. Show local models without waiting for optional account verification, and reject older refresh results.
5. Provide an explicit replace/relink action for a selected model. Preserve its entity ID and transform, so importing a file on another device can restore the saved placement. Do not guess by filename.
6. Repair a missing blob under its existing asset ID only when the newly imported bytes match the saved SHA-256. Never overwrite an existing original.
7. Keep preview in-flight, failed and cached states separate. Explicit retries and successful local imports can retry failures; unrelated scene edits cannot spin a load loop.
8. Bound concurrent reads and in-flight memory, release unused render resources, reset between world/account sessions and release late results.

## Verification boundaries

The new tests run real editor event handlers, world validation/save/read, local-storage callbacks and preview-cache code with deterministic adapters. They do not simulate a physical Android browser or prove visual GLB fidelity. Existing GLB security checks, account boundaries, resource limits and full repository CI remain enabled.

Game Lab accepts embedded GLB, not FBX or BLEND. Private originals remain outside the repository. No model regeneration, paid provider request, point/billing mutation, new secret or change to a generation allowance is part of this repair.
