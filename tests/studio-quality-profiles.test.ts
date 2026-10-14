import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectGLB } from '../src/lib/glb.ts'
import { passesStudioStructuralQuality } from '../src/lib/studioQuality.ts'
import { INDUSTRIAL_ELECTRICAL_PROFILE, REFERENCE_CHARACTER_PROFILE, TEXT_CHARACTER_DETAIL_PROFILE, oracleStudioPayload, studioQualityProfile, type StudioInput } from '../src/lib/studioProtocol.ts'
import { detailedAssemblyGLBFixture, detailedGLBFixture } from './detailed-studio-fixture.ts'

const photo = (view:'front'|'left'|'right'|'back') => ({ name:view+'.jpg', view, dataUrl:'data:image/jpeg;base64,AA==', textureMaxSize:4096 as const })

test('electrical cabinet references select true-3D industrial quality mode and forbid photo-card interiors',()=>{
  const input:StudioInput={worldId:'enchanted-ai-shop',purpose:'object',textureMaxSize:4096,photos:[photo('front'),photo('left'),photo('right')],
    prompt:'Reconstruct this industrial electrical control cabinet with DIN rails, breakers, terminal blocks and dense wiring.'}
  assert.equal(studioQualityProfile(input),INDUSTRIAL_ELECTRICAL_PROFILE)
  const payload=oracleStudioPayload('11111111-1111-4111-8111-111111111111',input)
  assert.ok('agentInstructions' in payload)
  if(!('agentInstructions' in payload)) throw new Error('Expected STANDARD payload')
  assert.match(payload.agentInstructions,/TRUE 3D MODE/)
  assert.match(payload.agentInstructions,/NEVER a texture to paste over a flat interior panel/)
  assert.match(payload.agentInstructions,/at least 20 distinct visible component groups/)
  assert.match(payload.agentInstructions,/at least 8 real 3D cable\/wire runs/)
  assert.match(payload.agentInstructions,/fail honestly rather than returning a flat photo-card/)
  assert.ok(payload.agentInstructions.length<12000)
})

test('reference character mode demands volumetric anatomy and layered clothing instead of a billboard',()=>{
  const input:StudioInput={worldId:'ai-game-lab',purpose:'figurine',textureMaxSize:4096,photos:[photo('front'),photo('back')],
    prompt:'Create a realistic adult woman character with elegant layered clothing and detailed shoes.'}
  assert.equal(studioQualityProfile(input),REFERENCE_CHARACTER_PROFILE)
  const payload=oracleStudioPayload('22222222-2222-4222-8234-222222222222',input)
  assert.ok('agentInstructions' in payload)
  if(!('agentInstructions' in payload)) throw new Error('Expected STANDARD payload')
  assert.match(payload.agentInstructions,/REALISTIC 3D MODE/)
  assert.match(payload.agentInstructions,/five separated fingers/)
  assert.match(payload.agentInstructions,/actual layered 3D garments/)
  assert.match(payload.agentInstructions,/NOT manufacturing-approved/)
})

test('unrelated or text-only models stay on the standard structural contract',()=>{
  const input:StudioInput={worldId:'enchanted-ai-shop',purpose:'object',textureMaxSize:4096,photos:[],prompt:'A blue chess rook'}
  assert.equal(studioQualityProfile(input),'standard')
  assert.equal(passesStudioStructuralQuality(inspectGLB(detailedGLBFixture().buffer),'standard'),true)
})

test('object references do not acquire anatomy requirements from word fragments',()=>{
  for (const prompt of ['A chess board with many separate pieces', 'A command console with LEDs',
    'A manufacturing machine', 'A German locomotive', 'A humanlike abstract lamp']) {
    for (const purpose of ['figurine','game'] as const) {
      const input:StudioInput={worldId:'enchanted-ai-shop',purpose,textureMaxSize:4096,photos:[photo('front')],prompt}
      assert.equal(studioQualityProfile(input),'standard',prompt)
      const payload=oracleStudioPayload('22222222-2222-4222-8234-222222222222',input)
      assert.ok('agentInstructions' in payload)
      assert.doesNotMatch(payload.agentInstructions,/WORLDIFACT REFERENCE CHARACTER/)
      assert.ok(payload.prompt.startsWith(prompt))
      assert.deepEqual(payload.photos,input.photos)
    }
  }
})

test('whole character words and Polish inflections preserve reference quality gates',()=>{
  for (const prompt of ['A woman, wearing a dress', 'Two men in spacesuits', 'A girl with a helmet',
    'A human character', 'Model postaci kobiety', 'Figurka mężczyzny', 'Odtwórz tę postać', 'Model figurki']) {
    assert.equal(studioQualityProfile({prompt,purpose:'figurine',photos:[photo('front')]}),REFERENCE_CHARACTER_PROFILE,prompt)
    assert.equal(studioQualityProfile({prompt,purpose:'figurine',photos:[]}),
      prompt === 'Model figurki' ? 'standard' : TEXT_CHARACTER_DETAIL_PROFILE,prompt)
  }
})

test('flat/sparse detailed outputs fail cabinet and character gates while dense assemblies pass',()=>{
  const sparse=inspectGLB(detailedGLBFixture().buffer)
  assert.equal(passesStudioStructuralQuality(sparse,INDUSTRIAL_ELECTRICAL_PROFILE),false)
  assert.equal(passesStudioStructuralQuality(sparse,REFERENCE_CHARACTER_PROFILE),false)
  const dense=inspectGLB(detailedAssemblyGLBFixture(12,2400,4).buffer)
  assert.equal(dense.renderedTriangles,28800)
  assert.equal(dense.meshCount,12)
  assert.equal(dense.substantialMeshCount,12)
  assert.equal(passesStudioStructuralQuality(dense,INDUSTRIAL_ELECTRICAL_PROFILE),true)
  assert.equal(passesStudioStructuralQuality(dense,REFERENCE_CHARACTER_PROFILE),true)
})
