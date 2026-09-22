import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** The exact public FORGE geometry, bundled with only its unused wood textures removed. */
export const PORTAL_SCULPTURE_URL = "/world-assets/polyhedron-led.gltf";
export const PORTAL_SCULPTURE_POSTER_URL = "/world-assets/polyhedron-led-poster.svg";
export const SCULPTURE_CYCLE_SECONDS = 5;
export type SculpturePalette = readonly [string, string];
export const LOGIN_SCULPTURE_PALETTE: SculpturePalette = ["#56ffad", "#38bfff"];

let modelBytes: Promise<ArrayBuffer> | undefined;
function originalBytes() {
  modelBytes ??= fetch(PORTAL_SCULPTURE_URL, { credentials: "same-origin", signal: AbortSignal.timeout(12_000) })
    .then(async response => {
      if (!response.ok) throw new Error("The original Forge model is unavailable.");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 20 || bytes.byteLength > 512 * 1024) {
        throw new Error("The original Forge model could not be read.");
      }
      const gltf = JSON.parse(new TextDecoder().decode(bytes));
      if (gltf.asset?.version !== "2.0" || gltf.meshes?.length !== 48 || gltf.nodes?.length !== 49 || gltf.buffers?.length !== 1 || !gltf.buffers[0].uri?.startsWith("data:application/octet-stream;base64,") || gltf.images?.length) throw new Error("The original Forge model could not be verified.");
      return bytes;
    })
    .catch(error => { modelBytes = undefined; throw error; });
  return modelBytes;
}

function ledMaterial(color: string) {
  return new THREE.MeshStandardMaterial({
    name: "WORLDIFACT LED frame",
    color,
    emissive: color,
    emissiveIntensity: 2.1,
    metalness: .55,
    roughness: .24,
    side: THREE.DoubleSide,
  });
}

/** Retain every original vertex, open face and source transform; only restyle surfaces. */
export async function loadPortalSculpture(palette: SculpturePalette = LOGIN_SCULPTURE_PALETTE, size = 3.25) {
  const bytes = await originalBytes();
  // The bundled public-source revision retains all original accessor bytes and
  // transforms; three unused 4K wood textures are removed at build preparation.
  // No runtime dependency on the external FORGE proxy or image decoders remains.
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(bytes.slice(0), "");
  const source = gltf.scene;
  const oldMaterials = new Set<THREE.Material>();
  const oldTextures = new Set<THREE.Texture>();
  const materials = palette.map(ledMaterial);
  let edge = 0;
  source.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      oldMaterials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) oldTextures.add(value);
    }
    node.userData.ledChannel = edge++ % 2;
    node.material = materials[node.userData.ledChannel];
    node.castShadow = false;
    node.receiveShadow = false;
  });
  for (const texture of oldTextures) {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close();
  }
  for (const material of oldMaterials) material.dispose();
  const box = new THREE.Box3().setFromObject(source);
  const bounds = box.getSize(new THREE.Vector3());
  const scale = size / Math.max(bounds.x, bounds.y, bounds.z, .001);
  const centered = new THREE.Group();
  centered.add(source);
  source.position.sub(box.getCenter(new THREE.Vector3()));
  centered.scale.setScalar(scale);
  const root = new THREE.Group();
  root.name = "original-forge-polyhedron-led";
  root.userData.source = PORTAL_SCULPTURE_URL;
  root.add(centered);
  return root;
}

/** Geometry is shared unchanged; each portal owns its two LED materials. */
export function clonePortalSculpture(original: THREE.Group, palette: SculpturePalette) {
  const clone = original.clone(true);
  const materials = palette.map(ledMaterial);
  clone.traverse(node => {
    if (node instanceof THREE.Mesh) node.material = materials[Number(node.userData.ledChannel) || 0];
  });
  return clone;
}

export function setSculpturePalette(root: THREE.Object3D, palette: SculpturePalette) {
  const visited = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial) || visited.has(node.material)) return;
    visited.add(node.material);
    const color = palette[Number(node.userData.ledChannel) || 0];
    node.material.color.set(color);
    node.material.emissive.set(color);
  });
}

export function rotatePortalSculpture(root: THREE.Object3D, seconds: number, offset = 0) {
  const angle = (seconds % SCULPTURE_CYCLE_SECONDS) / SCULPTURE_CYCLE_SECONDS * Math.PI * 2;
  root.rotation.set(.24 + angle, .42 + angle + offset, .12 + angle);
}
