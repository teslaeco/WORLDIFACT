import type { PointXZ } from "./movement.ts";
interface PortalTarget { id: string; position: PointXZ }

// Mobile joystick movement and collision correction can leave the avatar just
// outside the old portal edge. Keep crossing intentional, but make the water
// gate and Interact reach a little more forgiving on coarse-pointer devices.
export const PORTAL_RADIUS = 1.8;
export const PORTAL_REACH = 5.0;

export function nearestPortal<T extends PortalTarget>(point: PointXZ, portals: readonly T[], activeId?: string): T | undefined {
  return portals.filter(p => p.id !== activeId)
    .map(portal => ({ portal, distance: Math.hypot(point.x - portal.position.x, point.z - portal.position.z) }))
    .filter(p => p.distance <= PORTAL_REACH)
    .sort((a, b) => a.distance - b.distance)[0]?.portal;
}

/** Sweep the actual collision-resolved movement across a water portal's disk. */
export function enteredPortal<T extends PortalTarget>(from: PointXZ, to: PointXZ, portals: readonly T[], activeId?: string): T | undefined {
  const dx = to.x - from.x, dz = to.z - from.z, length2 = dx * dx + dz * dz;
  if (!Number.isFinite(length2) || length2 < 0.000001) return undefined;
  let first: T | undefined, firstTime = Infinity;
  for (const portal of portals) {
    if (portal.id === activeId) continue;
    const x = from.x - portal.position.x, z = from.z - portal.position.z;
    const c = x * x + z * z - PORTAL_RADIUS * PORTAL_RADIUS;
    const b = x * dx + z * dz, discriminant = b * b - length2 * c;
    if (discriminant < 0) continue;
    const time = c <= 0 ? 0 : (-b - Math.sqrt(discriminant)) / length2;
    if (time >= 0 && time <= 1 && time < firstTime) { first = portal; firstTime = time; }
  }
  return first;
}
