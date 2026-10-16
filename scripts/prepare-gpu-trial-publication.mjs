/** Publish only three provider-attested procedural GPU results.
 * Absent/incomplete provider output MUST NEVER become a public model.
 * No reference photos or customer assets are handled by this script.
 */
import { readFile, mkdir, writeFile, copyFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const specs = [
  { id: 'chess-cube-512-led-rook', gpu: 'L4', name: 'Chess Cube 512 · LED rook' },
  { id: 'ecomech-asymmetric-mechanical-study', gpu: 'A100', name: 'ECOMECH · mechanical study' },
  { id: 'halloween-multi-asset-room-study', gpu: 'H100', name: 'Halloween · music room study' },
]
const SHA = /^[0-9a-f]{64}$/
const EXPECTED = 'GPU_PROCEDURAL_TEST_NOT_PHOTO_RECONSTRUCTION'
const readJSON = async path => {
  const text = await readFile(path, 'utf8')
  if (text.length > 200_000) throw new Error('OVERSIZED_GPU_RECEIPT')
  return JSON.parse(text)
}
const assert = (test, error) => { if (!test) throw new Error(error) }

function verifyGLB(raw, metadata) {
  assert(Buffer.isBuffer(raw) && raw.length > 100 && raw.length <= 3_000_000, 'GLB_SIZE')
  assert(raw.toString('ascii', 0, 4) === 'glTF' &&
    raw.readUInt32LE(4) === 2 && raw.readUInt32LE(8) === raw.length, 'GLB_HEADER')
  const jsonLength = raw.readUInt32LE(12)
  assert(jsonLength > 0 && jsonLength < 200_000 &&
    raw.readUInt32LE(16) === 0x4e4f534a &&
    20 + jsonLength <= raw.length, 'GLB_JSON_CHUNK')
  const gltf = JSON.parse(raw.toString('utf8', 20, 20 + jsonLength))
  assert(gltf.asset?.version === '2.0' &&
    Array.isArray(gltf.meshes) && gltf.meshes.length >= 14 &&
    gltf.meshes.length === metadata.meshCount &&
    Array.isArray(gltf.materials) &&
    gltf.materials.some(m => m?.pbrMetallicRoughness?.baseColorTexture), 'GLB_GEOMETRY_OR_PBR_MISSING')
  assert(Array.isArray(gltf.nodes) && gltf.nodes.length >= 14 &&
    Array.isArray(gltf.images) && gltf.images.length >= 1, 'GLB_NODES_OR_TEXTURES_MISSING')
  for (const item of [...(gltf.buffers || []), ...(gltf.images || [])]) {
    assert(item && (!('uri' in item) || (typeof item.uri === 'string' &&
      item.uri.startsWith('data:'))), 'EXTERNAL_GLB_RESOURCE')
  }
  return raw.length
}
function verifyReceipt(receipt, spec, raw) {
  assert(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'INVALID_GPU_RECEIPT')
  assert(receipt.revision === 'worldifact-three-gpu-procedural-qualification-v1' &&
    receipt.kind === EXPECTED && receipt.task === spec.id &&
    receipt.gpuClass === spec.gpu && receipt.gpuResultValidated === true,
    'GPU_PROVENANCE_MISMATCH')
  const actualGpu = typeof receipt.gpuName === 'string' ? receipt.gpuName.toUpperCase() : ''
  const expectedGpu = spec.gpu === 'L4'
    ? (actualGpu.includes('NVIDIA L4') || (actualGpu.includes('NVIDIA') && actualGpu.includes('RTX 4090')))
    : actualGpu.includes('NVIDIA ' + spec.gpu)
  assert(expectedGpu && receipt.actualGpuHardware === receipt.gpuName &&
    Number(receipt.gpuVramGiB) >= (spec.gpu === 'L4' ? 21 : 72) &&
    Number.isFinite(receipt.cudaMatrixChecksum) &&
    Number.isFinite(receipt.cudaComputeMs) && receipt.cudaComputeMs >= 0, 'CUDA_PROOF_MISSING')
  assert(receipt.astraCallExecuted === false && receipt.neuralImageTo3D === false &&
    receipt.originalImageMatch === 'NOT_MEASURED' && receipt.makeReady === false, 'FALSE_NEURAL_OR_MAKE_CLAIM')
  assert(typeof receipt.glbSha256 === 'string' && SHA.test(receipt.glbSha256) &&
    createHash('sha256').update(raw).digest('hex') === receipt.glbSha256,
    'GLB_INTEGRITY_MISMATCH')
  assert(Number.isSafeInteger(receipt.meshCount) && receipt.meshCount >= 14 &&
    Number.isSafeInteger(receipt.triangleCount) && receipt.triangleCount >= 500,
    'GEOMETRY_EVIDENCE_MISSING')
  verifyGLB(raw, receipt)
}
export async function prepareGpuGallery(inputDir, outputDir, runId) {
  assert(Number.isSafeInteger(runId) && runId > 0 && runId < 1e14, 'UNVERIFIED_ACTIONS_RUN_ID')
  const source = resolve(inputDir)
  const target = resolve(outputDir)
  assert(source !== target && !target.startsWith(source + '/'), 'OUTPUT_MUST_BE_OUTSIDE_PRIVATE_INPUT')
  const files = await readdir(source)
  assert(files.length === 6, 'EXACTLY_THREE_GLB_AND_THREE_RECEIPTS_REQUIRED')
  const values = []
  const copied = []
  // Audit all source files before writing any public byte.
  for (const spec of specs) {
    const glb = join(source, spec.id + '.glb')
    const json = join(source, spec.id + '.json')
    assert(files.includes(spec.id + '.glb') && files.includes(spec.id + '.json'),
      'MISSING_GPU_MODEL_OR_RECEIPT')
    const raw = await readFile(glb)
    const receipt = await readJSON(json)
    verifyReceipt(receipt, spec, raw)
    copied.push({ spec, raw, receipt })
    values.push({
      id: spec.id, name: spec.name, gpu: spec.gpu,
      gpuName: receipt.gpuName, assetPath: '/gpu-trials/assets/' + spec.id + '.glb',
      bytes: raw.length, sha256: receipt.glbSha256, triangleCount: receipt.triangleCount,
      meshCount: receipt.meshCount, embeddedPbrTexture: true,
      type: EXPECTED, imageSimilarity: 'NOT_MEASURED', astraGenerated: false, makeReady: false,
    })
  }
  await mkdir(join(target, 'assets'), { recursive: true })
  for (const part of copied) {
    await writeFile(join(target, 'assets', part.spec.id + '.glb'), part.raw,
      { flag: 'wx' })
  }
  const manifest = { revision: 'worldifact-gpu-trials-public-v1',
    sourceRunId: runId, models: values }
  await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n',
    { flag: 'wx' })
  return { published: 3, manifest, totalBytes: copied.reduce((v, x) => v + x.raw.length, 0) }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await prepareGpuGallery(process.argv[2], process.argv[3],
      Number(process.env.GPU_EVIDENCE_RUN_ID))
    console.log(JSON.stringify({ status: 'GPU_GLB_PUBLICATION_STAGED_ONLY',
      count: result.published, runId: result.manifest.sourceRunId, bytes: result.totalBytes }))
  } catch {
    console.error('GPU_GLB_PUBLICATION_BLOCKED: incomplete, invalid or non-GPU model evidence')
    process.exitCode = 2
  }
}
