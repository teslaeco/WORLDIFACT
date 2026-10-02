import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passesStudioStructuralQuality } from '../src/lib/studioQuality.ts'
import {
  FAST_DRAFT_PROFILE, INDUSTRIAL_ELECTRICAL_PROFILE, PHOTO_VIEWS, STUDIO_FAILURE_CODES, STUDIO_FAILURE_DETAILS,
  inputDigest, oracleStudioPayload, studioQualityProfile, validateStudioInput, type StudioInput,
} from '../src/lib/studioProtocol.ts'

const id = '33333333-3333-4333-8333-333333333333'
// Container-only JPEG fixture. No provider, image-generation or network calls.
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
const cabinet: StudioInput = {
  worldId: 'enchanted-ai-shop', purpose: 'object', textureMaxSize: 4096,
  prompt: 'Reconstruct this electrical control cabinet with DIN rails, terminal blocks, relays and routed cables.',
  photos: ['front', 'left', 'right', 'back'].map((view, i) => ({
    name: `reference-${i}.jpg`, view: view as 'front' | 'left' | 'right' | 'back',
    dataUrl: jpeg, subject: 'The same electrical cabinet', textureMaxSize: 4096,
  })),
}

function standardPayload(input: StudioInput) {
  // Exercise the canonical input -> adapter -> JSON wire payload boundary.
  const payload = oracleStudioPayload(id, validateStudioInput(input))
  if (!('agentInstructions' in payload)) throw new Error('Expected STANDARD payload')
  return JSON.parse(JSON.stringify(payload)) as { id: string; prompt: string; agentInstructions: string; photos?: StudioInput['photos'] }
}

test('cabinet Oracle payload requires a complete first build and real physical detail rather than a later box upgrade', () => {
  const payload = standardPayload(cabinet)
  assert.equal(studioQualityProfile(cabinet), INDUSTRIAL_ELECTRICAL_PROFILE)
  assert.match(payload.agentInstructions, /FIRST build_model scene must already be a substantive, densely populated cabinet/)
  assert.match(payload.agentInstructions, /not a coarse bootstrap, empty shell or collection of plain boxes expecting a later upgrade/)
  assert.match(payload.agentInstructions, /enclosure, populated equipment and routed wiring together in that first complete scene/)
  assert.match(payload.agentInstructions, /tubes for bent conductors, extrusions\/lofts for shaped channels and housings, lathes for round hardware/)
  assert.match(payload.agentInstructions, /Never pad triangle counts with invisible\/duplicate geometry, degenerate faces, gratuitous subdivision or relabelled copies/)
  assert.match(payload.agentInstructions, /Linked copies contribute to rendered triangles and nodes, but do not create new distinct mesh definitions/)
  assert.match(payload.agentInstructions, /not EXT_mesh_gpu_instancing/)
  assert.match(payload.agentInstructions, /USD 1\.75 guard/)
  assert.match(payload.agentInstructions, /Do not start another job, change limits or substitute another generator/)
  assert.doesNotMatch(payload.prompt, /batched Blender script/)
})

test('cabinet instructions expose the exact enforced structural minima without relaxing any gate', () => {
  const instructions = standardPayload(cabinet).agentInstructions
  const minima = { renderedTriangles: 20000, meshCount: 8, substantialMeshCount: 6, primitiveCount: 8, materialCount: 3, nodeCount: 8 }
  for (const [metric, minimum] of Object.entries(minima)) {
    const advertised = instructions.match(new RegExp(`\\b${metric} >= (\\d+)`))
    assert.equal(Number(advertised?.[1]), minimum, `${metric} must be disclosed accurately`)
  }
  assert.match(instructions, /6 distinct meshes each containing at least 24 triangles/)
  const boundary = { ...minima, triangles: 20000, largestMeshTriangles: 3000, imageCount: 0, byteLength: 100000 }
  assert.equal(passesStudioStructuralQuality(boundary, INDUSTRIAL_ELECTRICAL_PROFILE), true)
  for (const [metric, minimum] of Object.entries(minima)) {
    assert.equal(passesStudioStructuralQuality({ ...boundary, [metric]: minimum - 1 }, INDUSTRIAL_ELECTRICAL_PROFILE), false,
      `The real gate must reject an output below advertised ${metric}`)
  }
  assert.match(instructions, /unique and rendered triangles each <= 3000000, nodes <= 5000/)
  assert.match(instructions, /GLB <= 50000000 bytes, with embedded buffers\/textures/)
})

test('STANDARD payload gives the actual ordered Blender tool sequence and requires real image inspection and terminal finish', () => {
  const { agentInstructions: instructions, prompt } = standardPayload(cabinet)
  const steps = ['get_modeling_contract', 'build_model', 'inspect_render', 'get_current_model', 'finish_model']
  const positions = steps.map(name => instructions.indexOf(`tools.mcp__blender__${name}(`))
  assert.ok(positions.every(at => at >= 0), 'Every required step uses its installed fully qualified tool name')
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'Describe the sequence in executable order')
  assert.match(instructions, /build_model\(\{scene_json:JSON\.stringify\(scene\),expected_revision:revision\}\)/)
  assert.match(instructions, /0 before the first successful build/)
  assert.match(instructions, /front, side and back, plus face for a person\/portrait and three-quarter for a cabinet/)
  assert.match(instructions, /pass every image content block to image\(block\)/)
  assert.match(instructions, /get_current_model\(\{section:'summary',expected_revision:revision\}\)/)
  assert.match(instructions, /finish_model\(\{expected_revision:revision,accepted,issues,summary\}\) and await its successful result/)
  assert.match(instructions, /otherwise use accepted=false with specific issues and an honest draft summary/)
  assert.match(instructions, /Never claim success, finished review or final export without a successful finish_model result/)
  assert.match(prompt, /successfully call finish_model before claiming completion/)
})

test('maximum STANDARD payloads fit installed Oracle lengths across quality modes and preserve exact signed references', async () => {
  for (const [purpose, prefix] of [
    ['object', 'electrical cabinet '], ['figurine', 'adult woman character '], ['terrain', 'detailed mountain landscape '],
  ] as const) {
    for (const textureMaxSize of [2048, 4096, 8192] as const) {
      const input = validateStudioInput({ ...cabinet, purpose, textureMaxSize,
        prompt: (prefix + 'visible reference detail '.repeat(200)).slice(0, 4000),
        photos: cabinet.photos.map((photo, i) => ({ ...photo, textureMaxSize, name: `${i}`.padEnd(120, 'n'), subject: 's'.repeat(160) })),
      })
      const before = JSON.stringify(input), digest = await inputDigest(input)
      input.photos.forEach(Object.freeze); Object.freeze(input.photos); Object.freeze(input)
      const payload = standardPayload(input)
      assert.equal(payload.id, id)
      assert.ok(payload.prompt.startsWith(input.prompt), 'The full user description remains intact')
      assert.ok(payload.prompt.length <= 5000, `Oracle prompt ceiling for ${purpose}/${textureMaxSize}`)
      assert.ok(payload.agentInstructions.length <= 12000, `Oracle instruction ceiling for ${purpose}/${textureMaxSize}`)
      assert.deepEqual(Object.keys(payload).sort(), ['agentInstructions', 'id', 'photos', 'prompt'])
      assert.deepEqual(payload.photos, input.photos.map(photo => photo.view === 'left' || photo.view === 'right' ? { ...photo, view: 'side' } : photo))
      assert.deepEqual(payload.photos?.map(photo => photo.dataUrl), input.photos.map(photo => photo.dataUrl))
      assert.match(payload.agentInstructions, /Reference 1: front; Reference 2: left; Reference 3: right; Reference 4: back/)
      assert.equal(JSON.stringify(input), before)
      assert.equal(await inputDigest(input), digest, 'Adapter changes cannot alter the signed canonical input')
    }
  }
})

test('completion instructions preserve all supported reference labels and do not leak into FAST', () => {
  for (const view of PHOTO_VIEWS) {
    const input: StudioInput = { ...cabinet, photos: [{ ...cabinet.photos[0], view }] }
    const payload = standardPayload(input)
    assert.deepEqual(payload.photos, [{ ...input.photos[0], view: view === 'left' || view === 'right' ? 'side' : view }])
  }
  const unrelated = standardPayload({ ...cabinet, photos: [], prompt: 'A blue chess rook' })
  assert.doesNotMatch(unrelated.agentInstructions, /Exact cabinet export gate|FIRST build_model scene must already be a substantive/)
  const fast = oracleStudioPayload(id, validateStudioInput({ ...cabinet, photos: [], textureMaxSize: 2048, generationProfile: FAST_DRAFT_PROFILE }))
  assert.equal(fast.generationProfile, FAST_DRAFT_PROFILE)
  assert.equal('agentInstructions' in fast, false)
  assert.doesNotMatch(fast.prompt, /finish_model|FIRST build_model|20000/)
})

test('unfinished generator drafts have an allowlisted terminal code with no success or automatic retry claim', () => {
  assert.ok(STUDIO_FAILURE_CODES.includes('ORACLE_JOB_INCOMPLETE'))
  assert.match(STUDIO_FAILURE_DETAILS.ORACLE_JOB_INCOMPLETE, /unfinished draft before completing model review and export/)
  assert.match(STUDIO_FAILURE_DETAILS.ORACLE_JOB_INCOMPLETE, /Reserved customer points were released; no automatic retry/)
})
