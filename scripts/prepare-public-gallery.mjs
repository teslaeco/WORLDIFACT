import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
/** Container repack only. Meshes, transforms, materials and binary geometry remain exact. */
export function packEmbeddedGltf(source) {
  if (sha256(source) !== 'b9fcc0315079e268efbb44465afb285b49e8d858aeaecb2cf96c1bcb0db2ade3') throw Error('The reviewed public polyhedron source changed.')
  const json = JSON.parse(source.toString('utf8'))
  if (json.buffers?.length !== 1 || !/^data:application\/octet-stream;base64,[A-Za-z0-9+/]+=*$/.test(json.buffers[0].uri)) throw Error('Expected one embedded public geometry buffer.')
  const bin = Buffer.from(json.buffers[0].uri.split(',')[1], 'base64')
  if (bin.length !== json.buffers[0].byteLength || sha256(bin) !== 'aac357c5288fb186d0776b1313fbef98a8462f2027de876c79d1198ff233c82c') throw Error('Public polyhedron geometry does not match its reviewed provenance.')
  delete json.buffers[0].uri
  const text = Buffer.from(JSON.stringify(json)), jsonLength = Math.ceil(text.length / 4) * 4, binLength = Math.ceil(bin.length / 4) * 4
  const output = Buffer.alloc(28 + jsonLength + binLength)
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8)
  output.writeUInt32LE(jsonLength, 12); output.writeUInt32LE(0x4e4f534a, 16)
  output.fill(32, 20, 20 + jsonLength); text.copy(output, 20)
  output.writeUInt32LE(binLength, 20 + jsonLength); output.writeUInt32LE(0x004e4942, 24 + jsonLength); bin.copy(output, 28 + jsonLength)
  return output
}
export async function readPublicGalleryAssets() {
  const parts = await Promise.all(Array.from({ length: 6 }, (_, i) => readFile(resolve(root, `public/world-assets/owner-landship/part-${String(i).padStart(2, '0')}.b64`), 'utf8')))
  const landship = gunzipSync(Buffer.from(parts.join('').replace(/\s/g, ''), 'base64'), { maxOutputLength: 1_291_820 })
  if (landship.length !== 1_291_820 || sha256(landship) !== '7f27b281103325aa6f2aa58fcc396be7cf319bc683a91c4798ca374d592d70c3') throw Error('The reviewed public landship source changed.')
  const polyhedron = packEmbeddedGltf(await readFile(resolve(root, 'public/world-assets/polyhedron-led.gltf')))
  return new Map([['mars-solar-landship.glb', landship], ['led-polyhedron.glb', polyhedron]])
}
export async function preparePublicGallery(output = resolve(root, 'public/gallery-assets')) {
  const assets = await readPublicGalleryAssets()
  await mkdir(output, { recursive: true })
  for (const [name, bytes] of assets) await writeFile(resolve(output, name), bytes)
  return assets
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const assets = await preparePublicGallery()
  for (const [name, bytes] of assets) console.log(`${name}: ${bytes.length} bytes, SHA-256 ${sha256(bytes)}`)
}
