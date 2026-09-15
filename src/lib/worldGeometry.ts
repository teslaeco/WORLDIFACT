import * as THREE from "three";
import { createSolarVehicle } from "./solarVehicle.ts";
import type { WorldObject } from "./blueprint.ts";

function material(color: string, metalness = 0, roughness = 0.7) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}
function box(
  g: THREE.Group,
  size: number[],
  pos: number[],
  mat: THREE.Material,
) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(...(size as [number, number, number])),
    mat,
  );
  m.position.set(...(pos as [number, number, number]));
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export function createWorldObject(o: WorldObject) {
  const g = new THREE.Group();
  g.name = o.name;
  g.userData = { assetId: o.id, kind: o.kind };
  g.position.set(o.x, 0, o.z);
  g.rotation.y = (o.rotation * Math.PI) / 180;
  g.scale.setScalar(o.scale);
  if (o.kind === "rover") {
    const vehicle = createSolarVehicle();
    for (const child of [...vehicle.children]) g.add(child);
    return g;
  }
  const base = material(o.color),
    dark = material("#273c49", 0.4),
    glass = material("#56c9d3", 0.55, 0.18),
    white = material("#eff2e1");
  base.name = "worldifact-object-color";
  if (o.kind === "habitat") {
    box(g, [5.8, 0.25, 5], [0, 0.12, 0], dark);
    box(g, [5.5, 3.2, 0.2], [0, 1.8, -2.3], base);
    for (const x of [-2.65, 2.65]) box(g, [0.2, 3.2, 4.6], [x, 1.8, 0], base);
    for (const x of [-1.8, 1.8]) box(g, [1.8, 3.2, 0.2], [x, 1.8, 2.3], base);
    box(g, [1.8, 0.7, 0.2], [0, 3.05, 2.3], base);
    const roof = box(g, [6.15, 0.25, 5.55], [0, 3.65, 0], dark);
    roof.rotation.x = -0.08;
    for (const x of [-1.75, 1.75])
      box(g, [1.16, 1.1, 0.07], [x, 2.0, 2.42], glass);
    const door = new THREE.Group();
    door.name = "door";
    door.position.set(-0.8, 0.25, 2.45);
    box(door, [1.6, 2.55, 0.13], [0.8, 1.27, 0], material("#ba8454"));
    box(door, [0.08, 0.2, 0.1], [1.38, 1.25, 0.12], white);
    g.add(door);
    box(g, [2, 0.16, 0.65], [0, 0.18, 2.8], white);
    box(g, [2.9, 0.08, 1.7], [0, 3.9, -0.7], material("#284b85", 0.4, 0.3));
    box(g, [1.8, 0.12, 0.9], [-1.2, 1.1, -1.5], white);
    for (const x of [-1.95, -0.5])
      box(g, [0.08, 1, 0.08], [x, 0.6, -1.5], dark);
  } else if (o.kind === "solar-array") {
    for (const x of [-2, 2]) box(g, [0.17, 1.8, 0.17], [x, 0.9, 0], white);
    const panelMaterial = material(o.color, 0.45, 0.22);
    panelMaterial.name = "worldifact-object-color";
    const p = box(
      g,
      [5.3, 0.15, 3],
      [0, 1.9, 0],
      panelMaterial,
    );
    p.rotation.x = 0.35;
    for (let x = -2.5; x <= 2.5; x += 0.5)
      box(g, [0.025, 0.03, 2.9], [x, 2.03, 0], glass).rotation.x = 0.35;
  } else if (o.kind === "tree") {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 2.6, 7),
      material("#795335"),
    );
    trunk.position.y = 1.3;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(1.5 - i * 0.25, 2.4, 8),
        base,
      );
      crown.position.y = 2.5 + i * 1.1;
      g.add(crown);
    }
  } else if (o.kind === "sculpture") {
    const statue = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), base);
    statue.position.y = 1.9;
    g.add(statue);
    box(g, [2.4, 0.4, 2.4], [0, 0.2, 0], dark);
  } else {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), base);
    rock.position.y = 0.7;
    rock.scale.set(1.2, 0.8, 0.9);
    g.add(rock);
  }
  return g;
}

export function createDecorativeTerrain(objects: WorldObject[]) {
  const group = new THREE.Group();
  group.name = "decorative-terrain";
  const trees = objects.filter((o) => o.kind === "tree");
  const rocks = objects.filter((o) => o.kind === "rock");
  const transform = new THREE.Object3D();

  if (trees.length) {
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.18, 0.28, 2.6, 7),
      material("#795335"),
      trees.length,
    );
    trunks.name = "instanced-tree-trunks";
    const crowns = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 8),
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.7,
        vertexColors: true,
      }),
      trees.length * 3,
    );
    crowns.name = "instanced-tree-crowns";
    const color = new THREE.Color();
    let crownIndex = 0;
    for (const [treeIndex, tree] of trees.entries()) {
      const rotation = (tree.rotation * Math.PI) / 180;
      transform.position.set(tree.x, 1.3 * tree.scale, tree.z);
      transform.rotation.set(0, rotation, 0);
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      trunks.setMatrixAt(treeIndex, transform.matrix);
      for (let level = 0; level < 3; level++) {
        const radius = (1.5 - level * 0.25) * tree.scale;
        transform.position.set(
          tree.x,
          (2.5 + level * 1.1) * tree.scale,
          tree.z,
        );
        transform.rotation.set(0, rotation, 0);
        transform.scale.set(radius, 2.4 * tree.scale, radius);
        transform.updateMatrix();
        crowns.setMatrixAt(crownIndex, transform.matrix);
        crowns.setColorAt(crownIndex, color.set(tree.color));
        crownIndex++;
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    group.add(trunks, crowns);
  }

  if (rocks.length) {
    const rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1.2, 0),
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.7,
        vertexColors: true,
      }),
      rocks.length,
    );
    rockMesh.name = "instanced-rocks";
    const color = new THREE.Color();
    for (const [index, rock] of rocks.entries()) {
      transform.position.set(rock.x, 0.7 * rock.scale, rock.z);
      transform.rotation.set(0, (rock.rotation * Math.PI) / 180, 0);
      transform.scale.set(
        1.2 * rock.scale,
        0.8 * rock.scale,
        0.9 * rock.scale,
      );
      transform.updateMatrix();
      rockMesh.setMatrixAt(index, transform.matrix);
      rockMesh.setColorAt(index, color.set(rock.color));
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
    group.add(rockMesh);
  }

  return group;
}
export function updateWorldObject(group: THREE.Group, o: WorldObject) {
  group.name = o.name;
  group.userData.assetId = o.id;
  group.userData.kind = o.kind;
  group.position.set(o.x, 0, o.z);
  group.rotation.y = (o.rotation * Math.PI) / 180;
  group.scale.setScalar(o.scale);
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const candidate of Array.isArray(child.material)
      ? child.material
      : [child.material])
      if (
        candidate.name === "worldifact-object-color" &&
        candidate instanceof THREE.MeshStandardMaterial
      )
        candidate.color.set(o.color);
  });
}
export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) geometries.add(o.geometry);
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  for (const g of geometries) g.dispose();
  for (const m of materials)
    for (const v of Object.values(m))
      if (v instanceof THREE.Texture) textures.add(v);
  for (const texture of textures) texture.dispose();
  for (const m of materials) m.dispose();
}
