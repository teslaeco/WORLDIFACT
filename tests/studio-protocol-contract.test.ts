import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { passesStudioStructuralQuality } from '../src/lib/studioQuality.ts'
import {
  FAST_DRAFT_PROFILE, INDUSTRIAL_ELECTRICAL_PROFILE, PHOTO_VIEWS, STUDIO_FAILURE_CODES, STUDIO_FAILURE_DETAILS,
  inputDigest, oracleStudioPayload, prepareStudioInput, studioQualityProfile, validateStudioInput, type StudioInput,
} from '../src/lib/studioProtocol.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'

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

test('explicit cabinet descriptions override only the appended figurine default, including directly negated miniature labels', async () => {
  for (const prompt of [
    'An industrial electrical cabinet for a pump station, with two hinged doors.',
    'Build a realistic industrial MCC electrical cabinet with a side service hatch.',
    'Create an electrical control cabinet with a steel enclosure, not a figurine or miniature.',
    'An electrical cabinet, not a miniature or a figurine, with a service latch.',
    'Odtwórz szafę sterowniczą z dwoma drzwiami i korytkami przewodów.',
    'Szafa elektryczna z panelem serwisowym, nie figurka ani miniatura.',
  ]) {
    for (const photos of [[], cabinet.photos]) {
      const input = validateStudioInput({ ...cabinet, prompt: `  ${prompt}  `, purpose: 'figurine', photos })
      const before = JSON.stringify(input), digest = await inputDigest(input)
      input.photos.forEach(Object.freeze); Object.freeze(input.photos); Object.freeze(input)
      const payload = standardPayload(input)
      assert.ok(payload.prompt.startsWith(prompt + '\n\nWORLDIFACT: build the requested editable 3D object,'))
      assert.doesNotMatch(payload.prompt, /editable 3D figurine|full-size|full-scale/)
      assert.deepEqual(payload, standardPayload({ ...input, purpose: 'object' }), 'Only the appended kind changes')
      assert.equal(studioQualityProfile(input), photos.length ? INDUSTRIAL_ELECTRICAL_PROFILE : 'standard')
      assert.deepEqual(payload.photos, photos.length ? photos.map(photo => ['left', 'right'].includes(photo.view) ? { ...photo, view: 'side' } : photo) : undefined)
      assert.equal(JSON.stringify(input), before)
      assert.equal(input.purpose, 'figurine', 'The receipt-bound purpose stays unchanged')
      assert.equal(await inputDigest(input), digest)
      assert.equal((await prepareStudioInput(input)).inputDigest, digest)
    }
  }
})

test('miniatures, characters, furniture and individual components retain their requested figurine instruction', () => {
  for (const prompt of [
    'An electrical cabinet miniature for a railway diorama.',
    'A control cabinet, not a figurine but a miniature at 1:24 scale.',
    'An industrial cabinet at 1:12 scale with a tiny latch.',
    'An industrial cabinet toy with plastic hinges.',
    'Szafa sterownicza jako miniatura do makiety.',
    'A character beside an electrical cabinet wearing a breaker badge.',
    'An electrical cabinet beside an adult character.',
    'A walnut furniture cabinet with a decorative brass handle.',
    'A relay and a circuit breaker with legible terminal markings.',
    'A circuit breaker for an industrial electrical cabinet.',
  ]) {
    const payload = standardPayload({ ...cabinet, purpose: 'figurine', prompt, photos: [] })
    assert.ok(payload.prompt.startsWith(prompt + '\n\nWORLDIFACT: build the requested editable 3D figurine,'), prompt)
  }
})

test('cabinet wording preserves selected price terms, legacy175 and the maximum prompt overhead', () => {
  const input: StudioInput = { ...cabinet, purpose: 'figurine', photos: [],
    prompt: ('An industrial electrical cabinet with service doors. ' + 'surface detail '.repeat(300)).slice(0, 4000) }
  const legacy = oracleStudioPayload(id, input)
  assert.ok('agentInstructions' in legacy)
  assert.equal('studioPricing' in legacy, false)
  assert.match(legacy.agentInstructions, /existing per-job USD 1\.75 guard/)
  const generic = standardPayload({ ...input, prompt: 'An ornate ceramic jug.' })
  assert.ok(legacy.prompt.length - input.prompt.length <= generic.prompt.length - 'An ornate ceramic jug.'.length)
  assert.ok(legacy.prompt.length <= 5000)
  for (const budgetTier of ['standard', 'extended'] as const) {
    const selection = { pricingRevision: STUDIO_PRICING_REVISION, budgetTier, acceptedPoints: STUDIO_PRICING[budgetTier].points }
    const payload = oracleStudioPayload(id, validateStudioInput({ ...input, ...selection }))
    assert.ok('agentInstructions' in payload)
    assert.deepEqual(payload.studioPricing, STUDIO_PRICING[budgetTier])
    assert.match(payload.agentInstructions, new RegExp(`selected per-job USD ${budgetTier === 'standard' ? '2\\.00' : '4\\.00'} guard`))
    assert.deepEqual(payload, oracleStudioPayload(id, validateStudioInput({ ...input, purpose: 'object', ...selection })))
  }
})

test('canonical input digests remain byte-compatible while Oracle wire fixtures bind corrected output scope', async () => {
  const photos = [{ name: 'ceramic-reference.jpg', view: 'left' as const, dataUrl: jpeg, subject: 'Synthetic protocol reference', textureMaxSize: 4096 as const }]
  // Canonical input digests captured from e36797e7 stay unchanged. Oracle wire
  // hashes intentionally include the corrected GAME/MAKE instruction scope.
  // Synthetic fixtures only: no user prompt, job, account or provider data.
  const cases = [
    ['A glazed teal teapot with a rounded handle.', 'figurine', [], 'fde3023881c1f982415e5671a4a46cff1ce65cdeca4c6d8559e86f438fd44253', '2826ec9d4c4fda3158d93f18ba9bdf16bdd9461c5670dc66187b6f37fab9cc15'],
    ['An adult character wearing a circuit breaker badge.', 'figurine', photos, '8ab9a40689311eda50deaf971683d0529d04a538894de27027adc60649af327a', 'f36331b65d48bc61362aa4062c456ae276849884a2e27f603f557b15d0bdcae1'],
    ['A 1:24 scale miniature electrical cabinet for a diorama.', 'figurine', photos, '7ca962cff4d8a507222099b0a435a55522b64ecbd75e2fbe100c7a3c9912014f', 'f88568265d6b91ed17cbacbd9ca78dfbd0fe4fb1cbcba6191cfb82a9fc041822'],
    ['An electrical cabinet with a narrow service door.', 'object', [], 'ac32eae3ea33f0f043b7a75b8971f8066ef2800d79a018aefac3deff926adf10', 'fc652a907e409e7f68222bdfbfc4eee185ca5f000a55a9e6a42bca4afe0480f4'],
    ['A rocky valley with a small wooden footbridge.', 'terrain', photos, '19ed565c69937a96fa1045281bf27fef032ec54bec88862c2dd2ffdf7fb1e255', '3ecd7aff9355665c17587d8942448527be4b8ca6c7e42ef78b4572ed552bd092'],
    ['A brass exploration drone with folding wings.', 'game', [], '7841686491ee4788183d5c5296b578c7c2c4667bbf59ce3cf431f622d25d4283', '28014de408fef54f1b8bbd31dff0132e1bdf8e613bb032022386dd9440150093'],
  ] as const
  for (const [prompt, purpose, references, digest, payloadDigest] of cases) {
    const input = validateStudioInput({ worldId: 'enchanted-ai-shop', prompt: ` ${prompt} `, purpose, textureMaxSize: 4096, photos: references })
    assert.equal(await inputDigest(input), digest, prompt)
    assert.equal(createHash('sha256').update(JSON.stringify(oracleStudioPayload(id, input))).digest('hex'), payloadDigest, prompt)
  }
  const fast = validateStudioInput({ worldId: 'enchanted-ai-shop', prompt: 'An industrial control cabinet with two doors.', purpose: 'figurine', photos: [], textureMaxSize: 2048, generationProfile: FAST_DRAFT_PROFILE })
  assert.equal(await inputDigest(fast), 'd7d424db5ca5ddc2f64fb3ee9c05cd65126de33e745413bd8b6dd569df0efffd')
  assert.equal(createHash('sha256').update(JSON.stringify(oracleStudioPayload(id, fast))).digest('hex'), '096221e58b854382118a9a6a8d1dead3ad0a2d38539414af2111c2cd939abceb')
})

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
