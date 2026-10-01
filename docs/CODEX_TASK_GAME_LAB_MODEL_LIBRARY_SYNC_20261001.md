# CODEX TASK — keep Game Lab model library synchronized with newly generated GLBs

Date: 2026-10-01
Product: WORLDIFACT private Game Lab / World Builder

## Incident evidence

Owner Android screenshots show a newly completed AI Shop GLB (8.9 MB, saved 2026-10-01 14:12) in the device model gallery, while the Game Lab Library still lists older generated assets. Pressing Refresh does not expose the newest GLB.

## Root cause

AI Shop stores completed GLBs in the browser IndexedDB archive. Game Lab reads that archive, then filters the whole list through `/api/worlds/library`, which only returns IDs with a current account-ledger job row and current download entitlement.

That server check is useful as an **account verification badge**, but it must not erase a GLB whose bytes already exist on the same device. A user can already import any local GLB through the explicit file picker. The current filter therefore makes the Game Lab device library stale whenever job-ledger ownership is delayed/missing even though the generated GLB is present and previewable locally.

## Required behavior

1. Every valid completed GLB stored by `saveStudioModel` must remain visible in Game Lab's generated-model section.
2. Server ownership/download verification remains additive: mark entries `ACCOUNT VERIFIED` when confirmed; otherwise label them `DEVICE ARCHIVE`. Never claim an unverified local model is account-owned.
3. A device-local unverified entry may be explicitly imported into the private world exactly like choosing the same local GLB through the file picker. This must not create a generation, charge points, grant/refund credits or claim cloud ownership.
4. An account-verified entry must re-check server download permission before import.
5. Saving a new Studio model emits a same-tab library-change event and a best-effort cross-tab storage pulse.
6. While the Library tab is open, refresh on archive event, cross-tab storage event, focus/pageshow and visibility return. Do not poll continuously.
7. Preserve archive order (newest first), original GLB bytes, hashes, prompts, saved worlds, transforms and placement records.
8. Keep server private-world isolation and `/api/worlds/library` authorization semantics unchanged.
9. Do not duplicate GLB bytes until the user explicitly chooses/imports a model into the world asset store.
10. No payment, model-generation, Oracle, Astra, Stripe, PayPal or subscription mutation belongs in this repair.

## Regression requirements

- merge helper retains a newest local GLB even when the server returns zero verified IDs;
- verified IDs receive only the verification flag and do not alter archive order or bytes;
- Game Lab source no longer filters the device archive down to server IDs;
- archive save emits the library update signal;
- full lint/typecheck/tests/build/foundations/deploy-check stay green.

## Release

Merge and deploy only from an exact green head. After deployment, verify the public Game Lab/Builder loads and no generation POST is made by library refresh.
