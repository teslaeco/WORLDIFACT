import type { PointXZ } from './movement.ts'
import type { EquipmentMode } from './playerEquipment.ts'

export const WATER_LEVEL = 0.045
export const SWIM_BODY_Y = -0.78
export const SWIM_SPEED = 3.4
export const FLIGHT_BODY_Y = 3.15
export const FLIGHT_SPEED = 10.5

export type WaterMode = 'land' | 'falling' | 'swimming'

export function riverHalfWidth(x: number) {
  return 4.6 + Math.sin(x * 0.13) * 0.22 + Math.sin(x * 0.39) * 0.12
}

export function inRiver(point: PointXZ) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false
  return Math.abs(point.z) <= riverHalfWidth(point.x)
}

export function insidePortalDisk(point: PointXZ, portals: readonly { position: PointXZ }[], radius: number) {
  return portals.some(portal => Math.hypot(point.x - portal.position.x, point.z - portal.position.z) <= radius)
}

export function nextWaterMode(
  current: WaterMode,
  point: PointXZ,
  portals: readonly { position: PointXZ }[],
  portalRadius: number,
  equipment: EquipmentMode,
): WaterMode {
  if (equipment === 'flight') return 'land'
  const wet = inRiver(point)
  if (!wet) return 'land'
  if (insidePortalDisk(point, portals, portalRadius)) return current
  if (current === 'land') return 'falling'
  return current
}

export function swimBodyY(time: number) {
  return SWIM_BODY_Y + Math.sin(time * 2.6) * 0.055
}

export function fallingBodyY(age: number) {
  const t = Math.max(0, Math.min(1, age / .38))
  const eased = t * t * (3 - 2 * t)
  return SWIM_BODY_Y * eased
}
