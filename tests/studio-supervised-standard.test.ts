import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { FAST_DRAFT_PROFILE, REFERENCE_FIDELITY_INSTRUCTIONS, inputDigest, oracleStudioPayload,
  prepareStudioInput, studioQualityProfile, validateStudioInput } from '../src/lib/studioProtocol.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'

const id = 'd2a5c641-5738-44e5-8ca9-63b07740dcda'
const typed = 'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:'
const supervised = 'WORLDIFACT REFERENCE-FIDELITY MODE:'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
const base = { worldId: 'enchanted-ai-shop', purpose: 'object', textureMaxSize: 2048, photos: [], prompt: 'A blue ceramic teapot with a curved handle.' }
const photos = [{ name: 'reference.jpg', view: 'left', dataUrl: jpeg, textureMaxSize: 2048, subject: 'The same object' }]

// This wire hash was recorded from the actual accepted engineering request,
// not derived by the new adapter or by a fake successful provider response.
// Job receipt: run 38004410388; GLB fecefbf591d37f65f12aa8bcf44ad56efbfc58aa8bd0010356091adb7f9ba6d0.
test('normal Shop adapter now emits exactly the accepted original-CLI MCC request', () => {
  const payload = oracleStudioPayload(id, validateStudioInput({"worldId":"enchanted-ai-shop","purpose":"object","textureMaxSize":2048,"photos":[],"prompt":"Create one complete freestanding industrial MCC electrical cabinet as an editable digital game asset, about 1.2 m wide, 2 m tall and 0.5 m deep. Its single hinged door is open approximately 100 degrees. Include a recessed backplate, three DIN rails with distinct circuit breakers, contactors, relays and PLC modules, a small HMI screen, red and green pushbuttons, a fan grille, slotted cable ducts and a bottom terminal strip. Model at least eight visibly routed cylindrical wires. Components must have real projecting 3D bodies and not be a photo on a plane. Use gray metal, off-white devices, dark terminals and colored wires. Build the complete cabinet in the first scene using the supported geometry and optional bounded initial edit. Inspect the actual front, side, back and three-quarter renders and finish the accepted result. Export a self-contained GLB. No room, background scene, brands, text labels or extra cabinet. Digital GAME output only; manufacturing and electrical safety are not validated. Keep the existing USD 1.75 budget and never start another job."}))
  assert.equal(digest(payload), '4333738b4bf67803fe1a0ef45aa2f09b0bb3d2d99965788abdd6b34374b006a6')
  assert.equal('studioPricing' in payload, false)
  assert.equal('generationProfile' in payload, false)
})

test('ordinary legacy STANDARD selects the existing supervised profile before dispatch, with all completion obligations', async () => {
  for (const purpose of ['object', 'game', 'terrain', 'figurine']) {
    const input = validateStudioInput({ ...base, purpose })
    const before = JSON.stringify(input), commitment = await inputDigest(input)
    Object.freeze(input.photos); Object.freeze(input)
    const payload = oracleStudioPayload(id, input)
    assert.ok('agentInstructions' in payload)
    assert.equal(payload.agentInstructions.split(supervised).length, 2)
    assert.ok(!payload.agentInstructions.includes(typed))
    assert.ok(!payload.agentInstructions.includes(REFERENCE_FIDELITY_INSTRUCTIONS), 'A profile alias is not a claim that a reference image exists')
    for (const tool of ['get_modeling_contract', 'build_model', 'inspect_render', 'get_current_model', 'finish_model'])
      assert.ok(payload.agentInstructions.includes('tools.mcp__blender__' + tool + '('))
    assert.match(payload.agentInstructions, /pass every image content block to image\(block\)/)
    assert.match(payload.agentInstructions, /USD 1\.75 guard/)
    assert.match(payload.agentInstructions, /otherwise use accepted=false/)
    assert.match(payload.agentInstructions, /Do not start another job, change limits or substitute another generator/)
    assert.equal(payload.id, id)
    assert.equal('photos' in payload, false)
    assert.equal(JSON.stringify(input), before)
    assert.equal(await inputDigest(input), commitment)
    assert.equal((await prepareStudioInput(input)).inputDigest, commitment)
  }
})

test('actual generic reference metadata and signed input remain intact on the restored route', async () => {
  const input = validateStudioInput({ ...base, photos })
  const commitment = await inputDigest(input)
  const payload = oracleStudioPayload(id, input)
  assert.ok('agentInstructions' in payload)
  assert.ok(!payload.agentInstructions.includes(typed))
  assert.ok(payload.agentInstructions.includes(REFERENCE_FIDELITY_INSTRUCTIONS))
  assert.match(payload.agentInstructions, /Reference 1: left/)
  assert.deepEqual(payload.photos, [{ ...input.photos[0], view: 'side' }])
  assert.equal(await inputDigest(input), commitment)
})

test('priced and specialized reference requests keep their original exact wire bytes and selected ceilings', () => {
  // Filled with pre-change adapter hashes for synthetic public inputs.
  const expected = {"cabinet":"a278f895a7eee3172fa7d41484bd3d9f042f90234f6f775304eabae1d2288e05","character":"dc97ceee4d8a71e6983db1e34137bad669a58a3ea042633b0b727bf2d0b4479f","standard":"f859f1b27828b0a4ad8d95745929fd05b2143fbc37040b19f8931d689bb1bb4f","extended":"44ab83395a2eb5502af8946c6aab93454538662c184186070e15ea9b2c7a51da","fast":"bbfd31c00a4e227d14c56abe329ad3e2d7d6cf95f8f81549ff05fac560a7a0fb"}
  for (const [kind, prompt] of [['cabinet', 'An electrical control cabinet with DIN rails.'], ['character', 'An adult woman character with a blue coat.']] as const) {
    const input = validateStudioInput({ ...base, purpose: kind === 'character' ? 'figurine' : 'object', prompt, photos })
    assert.notEqual(studioQualityProfile(input), 'standard')
    const payload = oracleStudioPayload(id, input)
    assert.equal(digest(payload), expected[kind])
    assert.ok('agentInstructions' in payload && payload.agentInstructions.includes(typed))
  }
  for (const budgetTier of ['standard', 'extended'] as const) {
    const input = validateStudioInput({ ...base, pricingRevision: STUDIO_PRICING_REVISION, budgetTier, acceptedPoints: STUDIO_PRICING[budgetTier].points })
    const payload = oracleStudioPayload(id, input)
    assert.equal(digest(payload), expected[budgetTier])
    assert.ok('agentInstructions' in payload && payload.agentInstructions.includes(typed))
    assert.deepEqual(payload.studioPricing, STUDIO_PRICING[budgetTier])
  }
  const fast = oracleStudioPayload(id, validateStudioInput({ ...base, generationProfile: FAST_DRAFT_PROFILE }))
  assert.equal(digest(fast), expected.fast)
  assert.equal('agentInstructions' in fast, false)
})
