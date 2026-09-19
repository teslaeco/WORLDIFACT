# Codex task — upgrade WORLDIFACT player, water physics and fan equipment

Date: 2026-09-19
Repository: teslaeco/WORLDIFACT
Branch: feat/fan-queen-water-flight-20260919

## Goal

Upgrade the shared WORLDIFACT starting world with the exact current MPC2 / 8 Planets fan-queen asset already referenced by the app, realistic river behavior, and a compact inventory/equipment loop.

## Player asset

1. Keep the exact current Queen source job already wired through `/api/avatar/neptune-queen`:
   - Oracle job: `99397623-e45c-48dc-95ec-6f84446a54d5`.
2. The current source model is much larger than the old avatar proxy's 12 MB ceiling. Raise the bounded proxy ceiling to **48 MB**, matching the existing FORGE builder archive limit, while retaining GLB type/header/length checks and read-only provenance headers.
3. The Queen is the default shared-world avatar. Keep the archived rapper as an optional alternate.
4. Start the Queen with **no fan equipped**. Hide separately named embedded fan/wachlarz nodes when the GLB exposes them. Do not corrupt or rewrite the source GLB.
5. Preserve the procedural fallback only as a failure fallback; remove its always-visible fan.

## River / swimming

- A player who walks into the river outside a portal must not walk on the water plane.
- Entering the river should:
  - create a visible splash;
  - lower the avatar into the water;
  - transition into swimming;
  - reduce movement speed;
  - animate a swim stroke / bob;
  - allow exiting onto the opposite bank.
- Portal detection remains active while swimming. A swimmer can enter any valid portal.
- Flying bypasses swimming because the player is above the water.
- Driving behavior stays unchanged.

## Inventory and fan mechanics

Add an **Equipment** panel accessible on desktop and mobile.

Outfits:
- Original
- Tracksuit
- Dress
- Casual

These are lightweight visual equipment overlays, not claims of new photoreal garments.

Fan 1:
- Start stowed.
- Button: throw/deploy as **Fan Drone**.
- The same movement joystick / WASD controls the drone while deployed.
- Camera follows the drone.
- Button recalls it to the player.

Fan 2 / flight:
- Activating flight recalls any deployed drone.
- Two fan devices mount horizontally at the player's shoulders.
- Player rises into a hover and can fly using the normal movement joystick / WASD.
- Toggle again to land/stow.
- Flight remains a gameplay mechanic only.

## Truth / safety boundaries

- Do not claim a new generated character asset. Reuse the exact saved Queen source already referenced by WORLDIFACT.
- Do not expose Oracle secrets.
- Do not make a paid generation request.
- No manufacturing claims.
- Keep GAME / MAKE truth labels intact.
- Preserve portal, rover, door, audio and mobile controls.

## QA

Add tests for:
- 48 MB avatar proxy ceiling and exact Queen job provenance;
- starting player equipment has fans stowed;
- river bounds / water entry / bank exit;
- portal crossing remains independent from swim state;
- drone and flight state transitions;
- default Queen label and equipment UI;
- existing movement, rover, portal and WebGL fallback regressions.

Run exact-head CI. After green CI, merge and deploy to production under the owner's explicit instruction in this conversation. Update `docs/CONTEST_STATUS.md` with implementation and production evidence.
