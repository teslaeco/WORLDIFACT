import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectGLB } from "../src/lib/glb.ts";
import { readArchive } from "../src/lib/archive.ts";
import { createWorldObject, disposeObject } from "../src/lib/worldGeometry.ts";
import { demoBlueprint } from "../src/lib/blueprint.ts";
import * as THREE from "three";

function container(doc: unknown) {
  const text = JSON.stringify(doc),
    data = new TextEncoder().encode(
      text.padEnd(Math.ceil(text.length / 4) * 4, " "),
    );
  const buffer = new ArrayBuffer(20 + data.length),
    view = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, data.length, 0x4e4f534a].forEach((n, i) =>
    view.setUint32(i * 4, n, true),
  );
  new Uint8Array(buffer, 20).set(data);
  return buffer;
}
const doc = () => ({
  asset: { version: "2.0" },
  accessors: [{ count: 300 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }, { mesh: 0 }],
});
test("GLB inspection counts source and instantiated geometry separately", () => {
  const result = inspectGLB(container(doc()));
  assert.equal(result.triangles, 100);
  assert.equal(result.renderedTriangles, 200);
  assert.throws(() => inspectGLB(new ArrayBuffer(20)), /container/);
});
test("GLB rejects external assets, cycles, deep trees and instance amplification", () => {
  assert.throws(
    () =>
      inspectGLB(
        container({
          ...doc(),
          images: [{ uri: "https://example.test/private.png" }],
        }),
      ),
    /External/,
  );
  assert.throws(
    () =>
      inspectGLB(
        container({ ...doc(), nodes: [{ children: [1] }, { children: [0] }] }),
      ),
    /cyclic/,
  );
  assert.throws(
    () =>
      inspectGLB(
        container({
          ...doc(),
          nodes: Array.from({ length: 150 }, (_, i) => ({
            children: i ? [i - 1] : [],
          })),
        }),
      ),
    /deep/,
  );
  assert.throws(
    () =>
      inspectGLB(container({ ...doc(), accessors: [{ count: 9_000_000 }] })),
    /million/,
  );
});
test("unavailable browser storage does not break scene loading", () => {
  assert.deepEqual(
    readArchive({
      getItem() {
        throw new Error("Disabled");
      },
    }),
    [],
  );
});
test("all supported procedural kinds produce bounded nonempty geometry", () => {
  const kinds = [
    "rover",
    "habitat",
    "tree",
    "solar-array",
    "rock",
    "sculpture",
  ] as const;
  for (const kind of kinds) {
    const group = createWorldObject({
      ...demoBlueprint().objects[0],
      kind,
      scale: 1,
      x: 0,
      z: 0,
    });
    group.updateMatrixWorld(true);
    const size = new THREE.Box3()
      .setFromObject(group)
      .getSize(new THREE.Vector3());
    assert.ok(
      Number.isFinite(size.length()) && size.length() > 0 && size.length() < 20,
      kind,
    );
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const pos = o.geometry.getAttribute("position");
        assert.ok(pos && Array.from(pos.array).every(Number.isFinite), kind);
      }
    });
    disposeObject(group);
  }
});
