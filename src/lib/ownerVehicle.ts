import * as THREE from "three";

export const OWNER_VEHICLE_RUNTIME_ID = "owner-mars-solar-landship";
export const OWNER_VEHICLE_SOURCE_SHA256 = "4dcd03f56c9ccaa8c11a286a4103c60101fe14a687481e22eb525c3bf62af6bd";
export const OWNER_VEHICLE_GAME_SHA256 = "7f27b281103325aa6f2aa58fcc396be7cf319bc683a91c4798ca374d592d70c3";
export const OWNER_VEHICLE_SOURCE_BYTES = 2_822_664;
export const OWNER_VEHICLE_GAME_BYTES = 1_291_820;
export const OWNER_VEHICLE_POSITION = Object.freeze({ x: -1.5, z: 11 });
export const OWNER_VEHICLE_SCALE = 0.23;
export const OWNER_VEHICLE_ROTATION = 0;
export const OWNER_VEHICLE_DRIVE_SCALE = 1.32;
export const OWNER_VEHICLE_SPEED = 7;
export const OWNER_VEHICLE_TURN_SPEED = 0.82;
export const OWNER_VEHICLE_CAMERA_SCALE = 1.45;
export const OWNER_VEHICLE_SEAT_OFFSET = Object.freeze({ x: -0.3, y: 1.42, z: -0.35 });
export const OWNER_VEHICLE_EXIT_OFFSET = Object.freeze({ x: -2.35, y: 0, z: 0 });
export const OWNER_VEHICLE_SOURCE_EXTENT = Object.freeze({ x: 13.73599984552134, y: 14.59000039100647, z: 29.989337921142578 });
export const OWNER_VEHICLE_HALF_X = OWNER_VEHICLE_SOURCE_EXTENT.x * OWNER_VEHICLE_SCALE / 2;
export const OWNER_VEHICLE_HALF_Z = OWNER_VEHICLE_SOURCE_EXTENT.z * OWNER_VEHICLE_SCALE / 2;

export const OWNER_VEHICLE_PARTS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `/world-assets/owner-landship/part-${String(index).padStart(2, "0")}.b64`),
);

const MAX_PART_CHARS = 48_000;
const MAX_TOTAL_CHARS = 300_000;

function base64ToBytes(value: string) {
  if (value.length > MAX_TOTAL_CHARS || !/^[A-Za-z0-9+/=\r\n]+$/.test(value)) throw new Error("Invalid owner vehicle asset encoding.");
  const compact = value.replace(/\s+/g, "");
  const decoded = atob(compact);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

async function gunzip(bytes: Uint8Array) {
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack the owner vehicle GAME asset.");
  const packedBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(packedBuffer).set(bytes);
  const stream = new Blob([packedBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  if (buffer.byteLength < 1_200_000 || buffer.byteLength > 1_350_000) throw new Error("Owner vehicle GAME asset size is invalid.");
  return buffer;
}

export async function loadOwnerVehicle(fetcher: typeof fetch = fetch) {
  const parts = await Promise.all(OWNER_VEHICLE_PARTS.map(async (partPath) => {
    const response = await fetcher(partPath, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Owner vehicle GAME asset is unavailable: ${partPath} (${response.status}).`);
    const text = await response.text();
    if (!text || text.length > MAX_PART_CHARS) throw new Error(`Owner vehicle GAME asset part is invalid: ${partPath}.`);
    return text;
  }));
  const packed = base64ToBytes(parts.join(""));
  if (packed.byteLength < 200_000 || packed.byteLength > 225_000) throw new Error("Owner vehicle GAME package size is invalid.");
  const bytes = await gunzip(packed);
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  const root = gltf.scene;
  root.name = "owner-mars-solar-landship-game-derivative";
  root.position.set(OWNER_VEHICLE_POSITION.x, 0.02, OWNER_VEHICLE_POSITION.z);
  root.rotation.y = OWNER_VEHICLE_ROTATION;
  root.scale.setScalar(OWNER_VEHICLE_SCALE);
  root.userData.provenance = "OWNER_PROVIDED_SOURCE__GAME_MATERIAL_OPTIMIZED_DERIVATIVE";
  root.userData.sourceSha256 = OWNER_VEHICLE_SOURCE_SHA256;
  root.userData.gameSha256 = OWNER_VEHICLE_GAME_SHA256;
  root.userData.driveable = true;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material && "side" in material && material.transparent) material.side = THREE.DoubleSide;
  });
  return root;
}

export type OwnerVehiclePose = { x: number; z: number; rotation: number };

function localPoint(point: { x: number; z: number }, pose: OwnerVehiclePose) {
  const dx = point.x - pose.x;
  const dz = point.z - pose.z;
  const c = Math.cos(pose.rotation), s = Math.sin(pose.rotation);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

export function resolveOwnerVehicleCollision(
  oldPoint: { x: number; z: number },
  nextPoint: { x: number; z: number },
  margin = 0.6,
  pose: OwnerVehiclePose = { x: OWNER_VEHICLE_POSITION.x, z: OWNER_VEHICLE_POSITION.z, rotation: OWNER_VEHICLE_ROTATION },
) {
  const local = localPoint(nextPoint, pose);
  const occupied = Math.abs(local.x) < OWNER_VEHICLE_HALF_X + margin && Math.abs(local.z) < OWNER_VEHICLE_HALF_Z + margin;
  return occupied ? { x: oldPoint.x, z: oldPoint.z } : { x: nextPoint.x, z: nextPoint.z };
}
