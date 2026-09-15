import type { WorldObject } from "./blueprint.ts";
export interface PointXZ { x: number; z: number }
export interface HabitatObstacle { spec: WorldObject; doorOpen: boolean }

function local(point: PointXZ, spec: WorldObject): PointXZ {
  const angle = spec.rotation * Math.PI / 180;
  const x = point.x - spec.x, z = point.z - spec.z;
  return {
    x: (Math.cos(angle) * x - Math.sin(angle) * z) / spec.scale,
    z: (Math.sin(angle) * x + Math.cos(angle) * z) / spec.scale,
  };
}
function blocked(point: PointXZ, habitats: HabitatObstacle[], vehicleRadius: number, placement = false) {
  return habitats.some(({ spec, doorOpen }) => {
    const p = local(point, spec);
    const radius = vehicleRadius / spec.scale;
    if (Math.abs(p.x) >= 2.9 + radius || Math.abs(p.z) >= 2.55 + radius) return false;
    if (vehicleRadius > 0 || placement) return true;
    const interior = Math.abs(p.x) < 2.35 && Math.abs(p.z) < 2;
    const entrance = doorOpen && Math.abs(p.x) < 0.65 && p.z > 1.65;
    return !interior && !entrance;
  });
}

// Sample the path, not only its endpoint: small/scaled walls must not be
// skipped at the maximum frame delta. Door passage follows object rotation.
export function movePlayer(from: PointXZ, target: PointXZ, habitats: HabitatObstacle[], vehicleRadius = 0): PointXZ {
  if (![from.x, from.z, target.x, target.z, vehicleRadius].every(Number.isFinite) || vehicleRadius < 0)
    return { ...from };
  const bound = 42 - vehicleRadius;
  const end = {
    x: Math.max(-bound, Math.min(bound, target.x)),
    z: Math.max(-bound, Math.min(bound, target.z)),
  };
  const step = 0.1 * Math.min(1, ...habitats.map(({ spec }) => spec.scale));
  const count = Math.max(1, Math.ceil(Math.hypot(end.x - from.x, end.z - from.z) / step));
  let safe = { ...from };
  for (let i = 1; i <= count; i++) {
    const point = { x: from.x + (end.x - from.x) * i / count, z: from.z + (end.z - from.z) * i / count };
    if (blocked(point, habitats, vehicleRadius)) break;
    safe = point;
  }
  return safe;
}

export function findRoverExit(rover: PointXZ, rotation: number, scale: number, habitats: HabitatObstacle[]): PointXZ | null {
  for (const offset of [Math.PI / 2, -Math.PI / 2, 0, Math.PI, Math.PI / 4, -Math.PI / 4]) {
    const angle = rotation + offset;
    const distance = 3.5 * scale + 0.5;
    const point = { x: rover.x + Math.sin(angle) * distance, z: rover.z + Math.cos(angle) * distance };
    if (Math.abs(point.x) <= 41.5 && Math.abs(point.z) <= 41.5 && !blocked(point, habitats, 0.3, true)) return point;
  }
  return null;
}
