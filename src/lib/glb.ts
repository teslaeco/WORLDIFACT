export interface GLBInspection {
  triangles: number;
  renderedTriangles: number;
  meshCount: number;
  materialCount: number;
  byteLength: number;
}
/** Inspect the GLB container before handing it to a renderer. No network access. */
export function inspectGLB(buffer: ArrayBuffer): GLBInspection {
  if (buffer.byteLength < 20 || buffer.byteLength > 50_000_000)
    throw new Error("Use a self-contained GLB between 20 bytes and 50 MB.");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error("Invalid GLB 2 container.");
  const length = view.getUint32(12, true);
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    length % 4 !== 0 ||
    20 + length > buffer.byteLength
  )
    throw new Error("Invalid GLB JSON chunk.");
  const doc = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
  );
  if (doc.asset?.version !== "2.0")
    throw new Error("Only glTF 2.0 is supported.");
  for (const key of ["buffers", "images", "meshes", "accessors", "nodes"])
    if (doc[key] !== undefined && !Array.isArray(doc[key]))
      throw new Error("Invalid GLB document structure.");
  for (const entry of [...(doc.buffers ?? []), ...(doc.images ?? [])])
    if (entry.uri && !/^data:/.test(entry.uri))
      throw new Error(
        "External model resources are not allowed. Embed textures and buffers in the GLB.",
      );
  let triangles = 0;
  const meshTriangles: number[] = [];
  for (const mesh of doc.meshes ?? []) {
    let meshTotal = 0;
    for (const p of mesh.primitives ?? []) {
      const count = doc.accessors?.[p.indices ?? p.attributes?.POSITION]?.count;
      if (!Number.isInteger(count) || count < 0 || count > 9_000_000)
        throw new Error("Invalid mesh accessor.");
      if (p.mode === undefined || p.mode === 4)
        meshTotal += Math.floor(count / 3);
      else if (p.mode === 5 || p.mode === 6)
        meshTotal += Math.max(0, count - 2);
    }
    triangles += meshTotal;
    meshTriangles.push(meshTotal);
  }
  const nodes = doc.nodes ?? [];
  if (nodes.length > 5000)
    throw new Error("Too many scene nodes for this preview.");
  let renderedTriangles = 0;
  const parents = new Set<number>();
  for (const node of nodes) {
    if (node.extensions?.EXT_mesh_gpu_instancing)
      throw new Error(
        "Convert GPU instances to a bounded GAME copy before preview.",
      );
    if (node.mesh !== undefined) {
      if (
        !Number.isInteger(node.mesh) ||
        meshTriangles[node.mesh] === undefined
      )
        throw new Error("Invalid scene mesh reference.");
      renderedTriangles += meshTriangles[node.mesh];
    }
    if (node.children !== undefined && !Array.isArray(node.children))
      throw new Error("Invalid scene hierarchy.");
    for (const child of node.children ?? []) {
      if (
        !Number.isInteger(child) ||
        child < 0 ||
        child >= nodes.length ||
        parents.has(child)
      )
        throw new Error("Invalid or repeated scene node.");
      parents.add(child);
    }
  }
  const visiting = new Set<number>(),
    heights = new Map<number, number>();
  function visit(id: number, depth: number): number {
    if (depth > 128 || visiting.has(id))
      throw new Error("Scene hierarchy is too deep or cyclic.");
    const cached = heights.get(id);
    if (cached !== undefined) return cached;
    visiting.add(id);
    let height = 0;
    for (const child of nodes[id].children ?? [])
      height = Math.max(height, 1 + visit(child, depth + 1));
    if (height > 128) throw new Error("Scene hierarchy is too deep.");
    visiting.delete(id);
    heights.set(id, height);
    return height;
  }
  for (let i = 0; i < nodes.length; i++) visit(i, 0);
  if (triangles > 3_000_000 || renderedTriangles > 3_000_000)
    throw new Error(
      "This preview supports up to 3 million triangles including instances. Use an optimized GAME copy.",
    );
  return {
    triangles,
    renderedTriangles,
    meshCount: doc.meshes?.length ?? 0,
    materialCount: doc.materials?.length ?? 0,
    byteLength: buffer.byteLength,
  };
}
