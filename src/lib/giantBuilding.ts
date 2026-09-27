import * as THREE from "three";

export const GIANT_BUILDING_SOURCE_SHA256 = "0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6";
export const GIANT_BUILDING_SOURCE_BYTES = 21_047_056;
export const GIANT_BUILDING_SOURCE_VERTICES = 491_138;
export const GIANT_BUILDING_SOURCE_TRIANGLES = 264_680;
export const GIANT_BUILDING_SOURCE_FLOORS = 10;
export const GIANT_BUILDING_RUNTIME_PROFILE = "owner-source-footprint-v1";

export const GIANT_BUILDING_POSITION = Object.freeze({ x: -18, z: -18 });
export const GIANT_BUILDING_SCALE = 5.5;
export const GIANT_BUILDING_HEIGHT = 9.62192631 * GIANT_BUILDING_SCALE;
export const GIANT_BUILDING_ENTRANCE = Object.freeze({ x: -18, z: -4.7 });
export const GIANT_INTERIOR_FLOOR_Y = 72;
export const GIANT_INTERIOR_SPAWN = Object.freeze({ x: 0, z: 5.25 });
export const GIANT_INTERIOR_EXIT = Object.freeze({ x: 0, z: 7.25 });
export const GIANT_INTERIOR_BOUNDS = Object.freeze({ minX: -10.7, maxX: 10.7, minZ: -7.35, maxZ: 7.35 });

const SOURCE_HALF_X = 2.22 * GIANT_BUILDING_SCALE;
const SOURCE_HALF_Z = 2.07 * GIANT_BUILDING_SCALE;
export const GIANT_BUILDING_FOOTPRINT = Object.freeze({
  minX: GIANT_BUILDING_POSITION.x - SOURCE_HALF_X,
  maxX: GIANT_BUILDING_POSITION.x + SOURCE_HALF_X,
  minZ: GIANT_BUILDING_POSITION.z - SOURCE_HALF_Z,
  maxZ: GIANT_BUILDING_POSITION.z + SOURCE_HALF_Z,
});

type FloorProfile = { y0: number; y1: number; points: readonly (readonly [number, number])[] };

/**
 * Source-derived floor silhouettes sampled from the owner's attached GLB.
 * The 21 MB customer file stays outside the public repository; these compact
 * profiles preserve the visible stacked/offset massing for the playable world.
 */
export const GIANT_BUILDING_FLOORS: readonly FloorProfile[] = Object.freeze([
  { y0: 0, y1: 0.93, points: [[-1.907, 1.635], [0, 2.14], [1.249, 1.84], [1.848, 1.232], [2.212, -0.13], [1.606, -0.667], [1.697, -1.333], [1.172, -1.954], [0.36, -1.682], [-0.358, -2.064], [-0.632, -1.875], [-1.755, -1.89], [-1.947, -1.039], [-1.816, -0.368], [-2.199, 0.129]] },
  { y0: 0.93, y1: 1.86, points: [[-1.943, -1.023], [-1.564, -0.29], [-1.806, 0.176], [-1.684, 0.783], [-1.098, 1.857], [1.284, 1.876], [1.648, 1.176], [1.824, -0.081], [1.495, -0.812], [1.604, -1.237], [1.008, -1.61], [-0.312, -1.905], [-1.482, -1.491]] },
  { y0: 1.86, y1: 2.79, points: [[-1.769, -0.949], [-1.485, -0.524], [-1.819, 0.083], [-1.512, 1.353], [-1.002, 1.857], [-0.495, 1.576], [-0.06, 1.798], [1.261, 1.733], [1.656, 1.017], [1.501, 0.463], [2.002, -0.077], [1.595, -0.5], [1.628, -1.22], [0.848, -1.533], [-1.466, -1.56]] },
  { y0: 2.79, y1: 3.72, points: [[-1.807, 0.085], [-1.563, 1.294], [-1.222, 1.389], [-0.975, 1.832], [0.651, 1.514], [1.327, 1.675], [1.742, 1.075], [1.532, 0.654], [1.901, -0.099], [1.544, -1.198], [-0.166, -1.924], [-0.632, -1.54], [-1.421, -1.518], [-1.776, -1.017], [-1.459, -0.347]] },
  { y0: 3.72, y1: 4.65, points: [[-1.946, 0.151], [-1.604, 1.364], [-1.019, 1.745], [1.164, 1.628], [1.806, 1.161], [1.564, 0.411], [1.803, -0.07], [1.597, -1.269], [0.951, -1.646], [0.098, -1.602], [-0.213, -1.897], [-1.475, -1.484], [-1.735, -1.017], [-1.712, -0.025]] },
  { y0: 4.65, y1: 5.58, points: [[-1.541, -0.405], [-1.897, 0.077], [-1.515, 1.339], [-1.065, 1.934], [-0.433, 1.663], [0.05, 1.917], [0.398, 1.632], [1.261, 1.759], [1.621, 1.027], [1.519, 0.382], [2.003, -0.078], [1.529, -0.82], [1.657, -1.283], [0.898, -1.643], [-1.462, -1.535], [-1.913, -1.036]] },
  { y0: 5.58, y1: 6.51, points: [[-1.716, -1.009], [-1.596, 1.365], [-0.923, 1.738], [0.73, 1.5], [1.268, 1.637], [1.765, 1.137], [1.487, 0.506], [1.789, -0.112], [1.695, -0.711], [1.55, -1.181], [-0.24, -1.959], [-1.465, -1.484]] },
  { y0: 6.51, y1: 7.44, points: [[-1.842, 0.085], [-1.508, 1.221], [-0.948, 1.702], [-0.681, 1.576], [-0.06, 1.801], [1.259, 1.67], [1.58, 1.073], [1.5, 0.248], [1.861, -0.128], [1.418, -0.715], [1.496, -1.243], [1.014, -1.623], [-0.191, -1.704], [-1.358, -1.504], [-1.703, -0.989]] },
  { y0: 7.44, y1: 7.8, points: [[-1.188, 1.386], [0.847, 1.386], [1.254, 1.023], [1.254, -1.144], [0.847, -1.518], [-1.188, -1.518], [-1.54, -1.144], [-1.54, 0.99]] },
  { y0: 7.8, y1: 9, points: [[-1.411, -1.051], [-1.416, 0.9], [-1.092, 1.27], [0.77, 1.276], [1.15, 0.942], [1.156, -1.04], [0.781, -1.391], [-1.08, -1.396]] },
]);

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
  root.name = "terrace-tower-entrance";
  root.position.set(GIANT_BUILDING_ENTRANCE.x, 0, GIANT_BUILDING_ENTRANCE.z);
  const mat = new THREE.MeshStandardMaterial({ color: "#62d9c5", emissive: "#1e7b70", emissiveIntensity: 1.25, metalness: .42, roughness: .25 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(.16, 3.2, .16), mat);
  const right = left.clone();
  left.position.set(-1.25, 1.6, 0); right.position.set(1.25, 1.6, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.66, .16, .16), mat); top.position.y = 3.15;
  root.add(left, right, top);
  const sign = label("ENTER TERRACE TOWER");
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
  root.name = "terrace-tower-generated-interior";
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

function shape(points: readonly (readonly [number, number])[]) {
  const result = new THREE.Shape();
  const [first, ...rest] = points;
  result.moveTo(first[0], -first[1]);
  for (const point of rest) result.lineTo(point[0], -point[1]);
  result.closePath();
  return result;
}

function prism(points: readonly (readonly [number, number])[], y0: number, y1: number, material: THREE.Material, name: string) {
  const geometry = new THREE.ExtrudeGeometry(shape(points), { depth: Math.max(.01, y1 - y0), bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y0, 0);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function scaledFootprint(points: readonly (readonly [number, number])[], factor: number) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point[0], z: sum.z + point[1] }), { x: 0, z: 0 });
  center.x /= points.length; center.z /= points.length;
  return points.map(point => [center.x + (point[0] - center.x) * factor, center.z + (point[1] - center.z) * factor] as const);
}

function addFacadeWindows(root: THREE.Group, floor: FloorProfile, floorIndex: number, glass: THREE.Material) {
  const plane = new THREE.PlaneGeometry(1, 1);
  const height = Math.max(.18, Math.min(.54, (floor.y1 - floor.y0) * .48));
  for (let edge = 0; edge < floor.points.length; edge++) {
    const a = floor.points[edge], b = floor.points[(edge + 1) % floor.points.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .42) continue;
    const count = Math.max(1, Math.min(4, Math.floor(length / .55)));
    const angle = -Math.atan2(dz, dx);
    const nx = -dz / length, nz = dx / length;
    for (let windowIndex = 0; windowIndex < count; windowIndex++) {
      const t = (windowIndex + 1) / (count + 1);
      const panel = new THREE.Mesh(plane, glass);
      panel.name = `source-window-${floorIndex}-${edge}-${windowIndex}`;
      panel.position.set(a[0] + dx * t - nx * .018, floor.y0 + (floor.y1 - floor.y0) * .53, a[1] + dz * t - nz * .018);
      panel.rotation.y = angle;
      panel.scale.set(Math.min(.34, length / (count + .7) * .62), height, 1);
      root.add(panel);
    }
  }
}

function addTerraceDetails(root: THREE.Group, floor: FloorProfile, floorIndex: number, terrace: THREE.Material, rail: THREE.Material, foliage: THREE.Material) {
  if (floorIndex >= GIANT_BUILDING_FLOORS.length - 2) return;
  root.add(prism(scaledFootprint(floor.points, 1.035), floor.y1 - .035, floor.y1 + .018, terrace, `terrace-slab-${floorIndex}`));
  const bar = new THREE.BoxGeometry(1, 1, 1);
  for (let edge = 0; edge < floor.points.length; edge++) {
    if ((edge + floorIndex) % 3 === 0) continue;
    const a = floor.points[edge], b = floor.points[(edge + 1) % floor.points.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .65) continue;
    const railing = new THREE.Mesh(bar, rail);
    railing.name = `terrace-rail-${floorIndex}-${edge}`;
    railing.position.set((a[0] + b[0]) / 2, floor.y1 + .075, (a[1] + b[1]) / 2);
    railing.rotation.y = -Math.atan2(dz, dx);
    railing.scale.set(length * .72, .14, .018);
    root.add(railing);
  }
  const planterGeometry = new THREE.BoxGeometry(.34, .08, .18);
  const bushGeometry = new THREE.IcosahedronGeometry(.16, 1);
  for (let plant = 0; plant < 2; plant++) {
    const p = floor.points[(floorIndex * 3 + plant * Math.max(1, Math.floor(floor.points.length / 2))) % floor.points.length];
    const planter = new THREE.Mesh(planterGeometry, terrace);
    planter.position.set(p[0] * .78, floor.y1 + .05, p[1] * .78);
    planter.scale.set(1.2, 1, 1);
    const bush = new THREE.Mesh(bushGeometry, foliage);
    bush.position.set(planter.position.x, floor.y1 + .17, planter.position.z);
    bush.scale.set(1 + (floorIndex % 3) * .12, .82 + (plant % 2) * .18, 1);
    planter.castShadow = true; bush.castShadow = true;
    root.add(planter, bush);
  }
}

function createOwnerTerraceTower() {
  const root = new THREE.Group();
  root.name = "owner-terrace-tower-game-derivative";
  const rose = new THREE.MeshStandardMaterial({ color: "#cfaea7", roughness: .72, metalness: .02 });
  const terrace = new THREE.MeshStandardMaterial({ color: "#8e8580", roughness: .79, metalness: .02 });
  const glass = new THREE.MeshStandardMaterial({ color: "#173c3d", roughness: .18, metalness: .32, transparent: true, opacity: .86, side: THREE.DoubleSide });
  const graphite = new THREE.MeshStandardMaterial({ color: "#252b2d", roughness: .34, metalness: .62 });
  const foliage = new THREE.MeshStandardMaterial({ color: "#416f3e", roughness: .84, metalness: 0 });
  const equipment = new THREE.MeshStandardMaterial({ color: "#d5d4cf", roughness: .48, metalness: .34 });

  GIANT_BUILDING_FLOORS.forEach((floor, index) => {
    root.add(prism(floor.points, floor.y0, floor.y1, rose, `owner-source-floor-${index}`));
    addFacadeWindows(root, floor, index, glass);
    addTerraceDetails(root, floor, index, terrace, glass, foliage);
  });

  const top = GIANT_BUILDING_FLOORS.at(-1)!;
  root.add(prism(scaledFootprint(top.points, 1.015), 8.985, 9.04, graphite, "roof-membrane"));
  const equipmentA = new THREE.Mesh(new THREE.BoxGeometry(.88, .22, .52), equipment);
  equipmentA.position.set(-.34, 9.15, .12);
  const equipmentB = new THREE.Mesh(new THREE.BoxGeometry(.54, .18, .72), equipment);
  equipmentB.position.set(.42, 9.12, -.28);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, .56, 8), equipment);
  mast.position.set(-.1, 9.38, .18);
  const mastArm = new THREE.Mesh(new THREE.BoxGeometry(.68, .045, .045), equipment);
  mastArm.position.set(.12, 9.55, .18);
  root.add(equipmentA, equipmentB, mast, mastArm);

  root.position.set(GIANT_BUILDING_POSITION.x, .11, GIANT_BUILDING_POSITION.z);
  root.scale.setScalar(GIANT_BUILDING_SCALE);
  root.userData.provenance = "OWNER_PROVIDED_SOURCE__FOOTPRINT_GAME_DERIVATIVE";
  root.userData.sourceSha256 = GIANT_BUILDING_SOURCE_SHA256;
  root.userData.sourceBytes = GIANT_BUILDING_SOURCE_BYTES;
  root.userData.sourceVertices = GIANT_BUILDING_SOURCE_VERTICES;
  root.userData.sourceTriangles = GIANT_BUILDING_SOURCE_TRIANGLES;
  root.userData.runtimeProfile = GIANT_BUILDING_RUNTIME_PROFILE;
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return root;
}

export async function loadGiantBuilding() {
  return createOwnerTerraceTower();
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
