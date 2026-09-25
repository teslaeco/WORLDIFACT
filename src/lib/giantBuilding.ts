import * as THREE from "three";

export const GIANT_BUILDING_SOURCE_SHA256 = "9c2c61af94243788e1938d99b598f8bfd1281ac710bf41236467db263b5a4e5a";
export const GIANT_BUILDING_GAME_SHA256 = "5cdb61971ce42634acfb3759a73a8ff01f94cb71b18f8feb5df436d754e443d2";
export const GIANT_BUILDING_SOURCE_TRIANGLES = 242_120;
export const GIANT_BUILDING_GAME_TRIANGLES = 14_785;

export const GIANT_BUILDING_POSITION = Object.freeze({ x: -30, z: -24 });
export const GIANT_BUILDING_SCALE = 5.5;
export const GIANT_BUILDING_HEIGHT = 10.02797893 * GIANT_BUILDING_SCALE;
export const GIANT_BUILDING_ENTRANCE = Object.freeze({ x: -30, z: -12.8 });
export const GIANT_INTERIOR_FLOOR_Y = 72;
export const GIANT_INTERIOR_SPAWN = Object.freeze({ x: 0, z: 5.25 });
export const GIANT_INTERIOR_EXIT = Object.freeze({ x: 0, z: 7.25 });
export const GIANT_INTERIOR_BOUNDS = Object.freeze({ minX: -10.7, maxX: 10.7, minZ: -7.35, maxZ: 7.35 });

const SOURCE_HALF_X = 1.8 * GIANT_BUILDING_SCALE;
const SOURCE_HALF_Z = 1.7 * GIANT_BUILDING_SCALE;
export const GIANT_BUILDING_FOOTPRINT = Object.freeze({
  minX: GIANT_BUILDING_POSITION.x - SOURCE_HALF_X,
  maxX: GIANT_BUILDING_POSITION.x + SOURCE_HALF_X,
  minZ: GIANT_BUILDING_POSITION.z - SOURCE_HALF_Z,
  maxZ: GIANT_BUILDING_POSITION.z + SOURCE_HALF_Z,
});

export const GIANT_BUILDING_PARTS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `/world-assets/giant-building/part-${String(index).padStart(2, "0")}.b64`),
);

const MAX_PART_CHARS = 48_000;
const MAX_TOTAL_CHARS = 480_000;

function label(text: string, width = 512, height = 128) {
  const browserDocument = (globalThis as unknown as { document?: { createElement: (tagName: "canvas") => any } }).document;
  if (!browserDocument) return null;
  const canvas = browserDocument.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(5,18,27,.92)";
  ctx.beginPath(); ctx.roundRect(4, 4, width - 8, height - 8, 20); ctx.fill();
  ctx.fillStyle = "#f4f7f2"; ctx.textAlign = "center"; ctx.font = "700 30px sans-serif";
  ctx.fillText(text, width / 2, 55);
  ctx.fillStyle = "#7de6d4"; ctx.font = "500 19px sans-serif";
  ctx.fillText("GAME · GENERATED INTERIOR", width / 2, 91);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
}

export function createGiantBuildingEntrance() {
  const root = new THREE.Group();
  root.name = "giant-building-entrance";
  root.position.set(GIANT_BUILDING_ENTRANCE.x, 0, GIANT_BUILDING_ENTRANCE.z);
  const mat = new THREE.MeshStandardMaterial({ color: "#62d9c5", emissive: "#1e7b70", emissiveIntensity: 1.25, metalness: .42, roughness: .25 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(.16, 3.2, .16), mat);
  const right = left.clone();
  left.position.set(-1.25, 1.6, 0); right.position.set(1.25, 1.6, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.66, .16, .16), mat); top.position.y = 3.15;
  root.add(left, right, top);
  const sign = label("ENTER GIANT TOWER");
  if (sign) { sign.position.set(0, 4.05, 0); sign.scale.set(4.8, 1.2, 1); root.add(sign); }
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.05, 48),
    new THREE.MeshBasicMaterial({ color: "#62d9c5", transparent: true, opacity: .58, depthWrite: false, side: THREE.DoubleSide }),
  );
  pad.rotation.x = -Math.PI / 2; pad.position.y = .035; root.add(pad);
  return root;
}

export function createGiantBuildingInterior() {
  const root = new THREE.Group();
  root.name = "giant-building-generated-interior";
  root.position.y = GIANT_INTERIOR_FLOOR_Y;
  root.visible = false;
  root.userData.provenance = "GAME_GENERATED_INTERIOR";

  const stone = new THREE.MeshStandardMaterial({ color: "#cfc3a8", roughness: .74, metalness: .04 });
  const dark = new THREE.MeshStandardMaterial({ color: "#26353d", roughness: .46, metalness: .32 });
  const glass = new THREE.MeshStandardMaterial({ color: "#6da5b7", transparent: true, opacity: .42, roughness: .17, metalness: .08, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(24, .25, 18), stone); floor.position.y = -.125; floor.receiveShadow = true; root.add(floor);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(24, .2, 18), dark); ceiling.position.y = 7.4; root.add(ceiling);
  const back = new THREE.Mesh(new THREE.BoxGeometry(24, 7.5, .25), stone); back.position.set(0, 3.65, -8.9); root.add(back);
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(.25, 7.5, 18), stone); sideA.position.set(-11.9, 3.65, 0); root.add(sideA);
  const sideB = sideA.clone(); sideB.position.x = 11.9; root.add(sideB);
  const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(9.65, 7.5, .25), stone); frontLeft.position.set(-7.1, 3.65, 8.9); root.add(frontLeft);
  const frontRight = frontLeft.clone(); frontRight.position.x = 7.1; root.add(frontRight);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.65, 3, .25), stone); lintel.position.set(0, 6.15, 8.9); root.add(lintel);
  const windowA = new THREE.Mesh(new THREE.BoxGeometry(.08, 4.8, 8), glass); windowA.position.set(-11.72, 4.0, 0); root.add(windowA);
  const windowB = windowA.clone(); windowB.position.x = 11.72; root.add(windowB);
  for (const x of [-7.5, 0, 7.5]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.28, .34, 6.8, 12), dark);
    pillar.position.set(x, 3.4, -1.8); root.add(pillar);
  }
  const desk = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.05, 1.4), dark); desk.position.set(0, .55, -5.2); root.add(desk);
  const exitMat = new THREE.MeshStandardMaterial({ color: "#ffcf72", emissive: "#9a5d13", emissiveIntensity: 1.2, metalness: .3, roughness: .28 });
  const exitPad = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 36), new THREE.MeshBasicMaterial({ color: "#ffcf72", transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
  exitPad.rotation.x = -Math.PI / 2; exitPad.position.set(GIANT_INTERIOR_EXIT.x, .035, GIANT_INTERIOR_EXIT.z); root.add(exitPad);
  const exitBar = new THREE.Mesh(new THREE.BoxGeometry(3.1, .16, .16), exitMat); exitBar.position.set(0, 3.1, 8.45); root.add(exitBar);
  const sign = label("EXIT TO MEADOW");
  if (sign) { sign.position.set(0, 4.1, 8.35); sign.scale.set(4.6, 1.15, 1); root.add(sign); }

  const ambient = new THREE.HemisphereLight("#fff5dd", "#172329", 1.8); root.add(ambient);
  for (const x of [-7, 0, 7]) {
    const light = new THREE.PointLight("#ffe9c4", 38, 18, 2); light.position.set(x, 6.5, -1); root.add(light);
  }
  root.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

function base64ToBytes(value: string) {
  if (value.length > MAX_TOTAL_CHARS || !/^[A-Za-z0-9+/=\r\n]+$/.test(value)) throw new Error("Invalid building asset encoding.");
  const compact = value.replace(/\s+/g, "");
  const decoded = atob(compact);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

async function gunzip(bytes: Uint8Array) {
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack the giant building GAME asset.");
  const packedBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(packedBuffer).set(bytes);
  const stream = new Blob([packedBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  if (buffer.byteLength < 560_000 || buffer.byteLength > 610_000) throw new Error("Giant building GAME asset size is invalid.");
  return buffer;
}

export async function loadGiantBuilding(fetcher: typeof fetch = fetch) {
  const parts = await Promise.all(GIANT_BUILDING_PARTS.map(async (path) => {
    const response = await fetcher(path, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error("Giant building GAME asset is unavailable.");
    const text = await response.text();
    if (!text || text.length > MAX_PART_CHARS) throw new Error("Giant building GAME asset part is invalid.");
    return text;
  }));
  const packed = base64ToBytes(parts.join(""));
  if (packed.byteLength < 340_000 || packed.byteLength > 365_000) throw new Error("Giant building GAME package size is invalid.");
  const bytes = await gunzip(packed);
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  const root = gltf.scene;
  root.name = "giant-owner-building-game-derivative";
  root.position.set(GIANT_BUILDING_POSITION.x, .11, GIANT_BUILDING_POSITION.z);
  root.scale.setScalar(GIANT_BUILDING_SCALE);
  root.userData.provenance = "OWNER_PROVIDED_SOURCE__HIGHER_FIDELITY_GAME_DERIVATIVE";
  root.userData.sourceSha256 = GIANT_BUILDING_SOURCE_SHA256;
  root.userData.gameSha256 = GIANT_BUILDING_GAME_SHA256;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true; object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material && "side" in material && material.transparent) material.side = THREE.DoubleSide;
  });
  return root;
}

export function nearGiantBuildingEntrance(point: { x: number; z: number }, radius = 4.1) {
  return Math.hypot(point.x - GIANT_BUILDING_ENTRANCE.x, point.z - GIANT_BUILDING_ENTRANCE.z) <= radius;
}

export function nearGiantInteriorExit(point: { x: number; z: number }, radius = 2.7) {
  return Math.hypot(point.x - GIANT_INTERIOR_EXIT.x, point.z - GIANT_INTERIOR_EXIT.z) <= radius;
}

export function clampGiantInterior(point: { x: number; z: number }) {
  return {
    x: THREE.MathUtils.clamp(point.x, GIANT_INTERIOR_BOUNDS.minX, GIANT_INTERIOR_BOUNDS.maxX),
    z: THREE.MathUtils.clamp(point.z, GIANT_INTERIOR_BOUNDS.minZ, GIANT_INTERIOR_BOUNDS.maxZ),
  };
}

export function resolveGiantBuildingCollision(
  oldPoint: { x: number; z: number },
  nextPoint: { x: number; z: number },
  margin = .55,
) {
  const inside = nextPoint.x > GIANT_BUILDING_FOOTPRINT.minX - margin &&
    nextPoint.x < GIANT_BUILDING_FOOTPRINT.maxX + margin &&
    nextPoint.z > GIANT_BUILDING_FOOTPRINT.minZ - margin &&
    nextPoint.z < GIANT_BUILDING_FOOTPRINT.maxZ + margin;
  return inside ? { x: oldPoint.x, z: oldPoint.z } : { x: nextPoint.x, z: nextPoint.z };
}
