import test from 'node:test'
import assert from 'node:assert/strict'
import { oracleStudioPayload, validateOracleStudioPayload, validateStudioInput, inputDigest, STUDIO_AGENT_INSTRUCTION_LIMIT, STUDIO_BODY_LIMIT, PHOTO_VIEWS } from '../src/lib/studioProtocol.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
const base = { worldId: 'enchanted-ai-shop', purpose: 'object', textureMaxSize: 2048, prompt: 'Industrial electrical cabinet for 3D printing', photos: [] }
test('all reference profiles, MAKE rules, view labels and prices fit the real v33 envelope without dropping input', async () => {
  for (const prompt of ['A detailed transformer', 'Industrial electrical cabinet for 3D printing', 'An adult woman character for 3D printing'])
    for (const budgetTier of [undefined, 'standard', 'extended'] as const)
      for (const view of PHOTO_VIEWS) {
        const input = validateStudioInput({ ...base, purpose: 'figurine', prompt,
          photos: Array.from({length:4}, (_, i) => ({name: `Reference ${i} 🟢.jpg`, view, dataUrl: jpeg, textureMaxSize:2048})),
          ...(budgetTier ? {budgetTier, pricingRevision: STUDIO_PRICING_REVISION, acceptedPoints: STUDIO_PRICING[budgetTier].points} : {}) })
        const before = await inputDigest(input), payload = oracleStudioPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', input)
        const wire = JSON.parse(validateOracleStudioPayload(payload, 5000))
        assert.ok(wire.agentInstructions.length <= STUDIO_AGENT_INSTRUCTION_LIMIT)
        assert.ok(wire.prompt.startsWith(prompt)); assert.equal(wire.photos.length,4)
        assert.deepEqual(wire.photos.map((p: {dataUrl:string})=>p.dataUrl),[jpeg,jpeg,jpeg,jpeg])
        assert.match(wire.agentInstructions,/finish_model/); assert.match(wire.agentInstructions,/budget|guard/)
        assert.match(wire.agentInstructions,/never label a generated file safe/)
        assert.equal(await inputDigest(input),before)
      }
})
test('oversized instructions/prompt/UTF-8 body fail explicitly rather than truncating references or requirements', () => {
  const payload=oracleStudioPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',validateStudioInput(base))
  assert.ok('agentInstructions' in payload)
  assert.doesNotThrow(()=>validateOracleStudioPayload({...payload,agentInstructions:'a'.repeat(12000)},5000))
  assert.throws(()=>validateOracleStudioPayload({...payload,agentInstructions:'a'.repeat(11999)+'🟢'},5000),/instruction limit/)
  assert.throws(()=>validateOracleStudioPayload({...payload,prompt:'a'.repeat(5001)},5000),/description/)
  assert.throws(()=>validateOracleStudioPayload({...payload,photos:[{name:'🟢'.repeat(STUDIO_BODY_LIMIT/4),view:'front',textureMaxSize:2048,dataUrl:jpeg}]},5000),/upload exceeds/)
})
