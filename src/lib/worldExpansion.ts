import * as THREE from "three";

export const WORLD_BOUND = 174;
export const GRAND_DESERT = Object.freeze({ minX: 52, maxX: 174, minZ: -126, maxZ: 126 });
export const MOUNTAIN_COAST = Object.freeze({ minX: -174, maxX: -52, minZ: -126, maxZ: 126 });

function ribbon(points: THREE.Vector3[], width: number, material: THREE.Material) {
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - previous.x, dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length * width * .5, nz = dx / length * width * .5;
    positions.push(current.x + nx, current.y, current.z + nz, current.x - nx, current.y, current.z - nz);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function expandedGroundHeight(x: number, z: number) {
  if (x < GRAND_DESERT.minX || x > GRAND_DESERT.maxX || z < GRAND_DESERT.minZ || z > GRAND_DESERT.maxZ) return 0;
  const edge = Math.min(1, Math.max(0, (x - GRAND_DESERT.minX) / 16));
  return Math.max(.03, edge * (.55 + 1.45 * Math.sin(x * .105 + z * .058) ** 2 + .42 * Math.sin(z * .16 + x * .035)));
}

function duneMesh(mobile: boolean) {
  const columns = mobile ? 30 : 54, rows = mobile ? 44 : 78;
  const width = GRAND_DESERT.maxX - GRAND_DESERT.minX, depth = GRAND_DESERT.maxZ - GRAND_DESERT.minZ;
  const geometry = new THREE.PlaneGeometry(width, depth, columns, rows);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (GRAND_DESERT.minX + GRAND_DESERT.maxX) / 2;
    const z = p.getZ(i);
    p.setY(i, expandedGroundHeight(x, z));
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#d9a35d", roughness: .98, metalness: 0 }));
  mesh.name = "grand-desert-surface";
  mesh.position.x = (GRAND_DESERT.minX + GRAND_DESERT.maxX) / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function mountainField(mobile: boolean) {
  const group = new THREE.Group(); group.name = "mountain-coast-ridges";
  const count = mobile ? 24 : 42;
  const geometry = new THREE.ConeGeometry(1, 1, mobile ? 7 : 10);
  const material = new THREE.MeshStandardMaterial({ color: "#5c6b5b", roughness: .92, vertexColors: true });
  const peaks = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const band = i % 3;
    const x = -72 - band * 24 - ((i * 19) % 18);
    const z = -112 + ((i * 37) % 224);
    const height = 13 + (i % 7) * 3.2 + band * 4;
    const radius = 10 + (i % 5) * 2.1;
    transform.position.set(x, height * .5 - .1, z);
    transform.rotation.set(0, (i * .91) % Math.PI, 0);
    transform.scale.set(radius, height, radius * (.75 + (i % 4) * .08));
    transform.updateMatrix(); peaks.setMatrixAt(i, transform.matrix);
    peaks.setColorAt(i, color.set(i % 4 === 0 ? "#879477" : i % 3 === 0 ? "#697967" : "#536354"));
  }
  peaks.instanceMatrix.needsUpdate = true;
  if (peaks.instanceColor) peaks.instanceColor.needsUpdate = true;
  peaks.receiveShadow = true; peaks.castShadow = true;
  group.add(peaks);
  return group;
}

function coastForest(mobile: boolean) {
  const group = new THREE.Group(); group.name = "mountain-coast-forest";
  const count = mobile ? 44 : 86, transform = new THREE.Object3D(), color = new THREE.Color();
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.16, .28, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: "#745136", roughness: .95 }),
    count,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 2.1, 7),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .88, vertexColors: true }),
    count,
  );
  for (let i = 0; i < count; i++) {
    const x = -61 - ((i * 23) % 67);
    let z = -112 + ((i * 41) % 224);
    if (Math.abs(z) < 13 && x > -94) z += z >= 0 ? 18 : -18;
    const scale = .7 + (i % 5) * .12;
    transform.position.set(x, 1.2 * scale, z); transform.rotation.set(0, i * .37, 0); transform.scale.setScalar(scale); transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
    transform.position.set(x, 3.1 * scale, z); transform.scale.set(1.25 * scale, 1.45 * scale, 1.25 * scale); transform.updateMatrix(); crowns.setMatrixAt(i, transform.matrix);
    crowns.setColorAt(i, color.set(i % 2 ? "#2f7048" : "#3f8055"));
  }
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  group.add(trunks, crowns);
  return group;
}

function oasis(mobile: boolean) {
  const group = new THREE.Group(); group.name = "grand-desert-oasis";
  const water = new THREE.Mesh(new THREE.CircleGeometry(12, mobile ? 32 : 64), new THREE.MeshStandardMaterial({ color: "#2e9ec2", roughness: .22, metalness: .08, transparent: true, opacity: .88 }));
  water.rotation.x = -Math.PI / 2; water.position.set(104, .36, -42); group.add(water);
  const palmMat = new THREE.MeshStandardMaterial({ color: "#5f3e28", roughness: .92 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#3b7e49", roughness: .86 });
  for (let i = 0; i < (mobile ? 7 : 12); i++) {
    const angle = i / (mobile ? 7 : 12) * Math.PI * 2, radius = 14 + (i % 3);
    const x = 104 + Math.cos(angle) * radius, z = -42 + Math.sin(angle) * radius;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .3, 4.6, 7), palmMat); trunk.position.set(x, 2.3, z); trunk.rotation.z = Math.sin(i) * .08;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.4, 8), leafMat); crown.position.set(x, 5.1, z); crown.rotation.x = Math.PI; group.add(trunk, crown);
  }
  return group;
}

export function createExpandedWorld(mobile: boolean) {
  const root = new THREE.Group(); root.name = "expanded-world-zones";
  const desert = new THREE.Group(); desert.name = "grand-desert-zone"; desert.userData.zone = "Grand Desert · GAME";
  desert.add(duneMesh(mobile), oasis(mobile));
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0), rockMaterial = new THREE.MeshStandardMaterial({ color: "#9f7046", roughness: .98 });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, mobile ? 28 : 52), transform = new THREE.Object3D();
  for (let i = 0; i < rocks.count; i++) {
    const x = 63 + ((i * 31) % 103), z = -118 + ((i * 47) % 236), s = .7 + (i % 6) * .32;
    transform.position.set(x, .45 * s, z); transform.rotation.set(i * .21, i * .39, i * .17); transform.scale.set(s * 1.2, s * .7, s); transform.updateMatrix(); rocks.setMatrixAt(i, transform.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true; desert.add(rocks);

  const coast = new THREE.Group(); coast.name = "mountain-coast-zone"; coast.userData.zone = "Mountain Coast · GAME";
  coast.add(mountainField(mobile), coastForest(mobile));
  const riverMaterial = new THREE.MeshStandardMaterial({ color: "#4ba7bf", roughness: .18, metalness: .03, transparent: true, opacity: .82 });
  const river = ribbon([
    new THREE.Vector3(-56, .07, 78), new THREE.Vector3(-72, .07, 57), new THREE.Vector3(-84, .07, 31),
    new THREE.Vector3(-72, .07, 7), new THREE.Vector3(-91, .07, -18), new THREE.Vector3(-112, .07, -39),
    new THREE.Vector3(-137, .07, -54), new THREE.Vector3(-156, .07, -61),
  ], mobile ? 3.2 : 4.2, riverMaterial);
  river.name = "mountain-coast-river"; coast.add(river);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(62, 270, 1, 1), new THREE.MeshStandardMaterial({ color: "#287697", roughness: .2, metalness: .08, transparent: true, opacity: .9 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(-196, -.08, 0); ocean.name = "western-ocean"; coast.add(ocean);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(20, 260), new THREE.MeshStandardMaterial({ color: "#c9b37c", roughness: .98 }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(-158, .015, 0); beach.name = "mountain-coast-beach"; coast.add(beach);
  root.add(desert, coast);
  return root;
}

export function expandedZoneName(x: number, z: number) {
  if (x >= GRAND_DESERT.minX && Math.abs(z) <= GRAND_DESERT.maxZ) return "Grand Desert";
  if (x <= MOUNTAIN_COAST.maxX && Math.abs(z) <= MOUNTAIN_COAST.maxZ) return x < -145 ? "Mountain Coast · ocean overlook" : "Mountain Coast · valley";
  return "Riverlight meadow";
}

export function expandedWorldContains(x: number, z: number, margin = 0) {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= WORLD_BOUND - margin && Math.abs(z) <= WORLD_BOUND - margin;
}
