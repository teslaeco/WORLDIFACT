import { test } from 'node:test'
import assert from 'node:assert/strict'
import { characterRouteAdvice, creativeIntent } from '../src/lib/characterEngineV5.ts'
import { INDUSTRIAL_ELECTRICAL_PROFILE, REFERENCE_CHARACTER_PROFILE, REFERENCE_ROBOT_V5_PROFILE, oracleStudioPayload, studioQualityProfile, validateOracleStudioPayload, type StudioInput } from '../src/lib/studioProtocol.ts'
import { passesStudioStructuralQuality } from '../src/lib/studioQuality.ts'
import { inspectGLB } from '../src/lib/glb.ts'
import { detailedAssemblyGLBFixture, detailedGLBFixture } from './detailed-studio-fixture.ts'
import { MODEL_CATALOG } from '../src/lib/modelCatalog.ts'

const photo=(view:'front'|'back')=>({name:view+'.jpeg',view,dataUrl:'data:image/jpeg;base64,AA==',textureMaxSize:4096 as const})
const robot=(prompt:string):StudioInput=>({worldId:'enchanted-ai-shop',purpose:'figurine',textureMaxSize:4096,
  photos:[photo('front')],prompt,studioExecution:{revision:'studio-execution-v1',model:'sol',mode:'standard'}})

test('V5 image-guided robot with MCC keywords is never routed to the cabinet workflow',()=>{
  const prompt='ECOMECH humanoid robot holding a green chili; half green/blue armor, half exposed MCC contactors, copper motor coils and gears.'
  const input=robot(prompt)
  assert.equal(creativeIntent(input),'reference-robot')
  assert.equal(studioQualityProfile(input),REFERENCE_ROBOT_V5_PROFILE)
  const p=oracleStudioPayload('22222222-2222-4222-8234-222222222222',input)
  assert.ok('agentInstructions' in p)
  assert.equal(p.studioExecution?.model,'sol')
  if(!('agentInstructions' in p)) throw Error('Reference image contract missing')
  assert.match(p.agentInstructions,/PHOTO-GROUNDED ROBOT/)
  assert.match(p.agentInstructions,/This is a CHARACTER, not an MCC cabinet/)
  assert.match(p.agentInstructions,/silhouette/)
  assert.doesNotMatch(p.agentInstructions,/INDUSTRIAL ELECTRICAL CABINET — TRUE 3D MODE/)
  assert.deepEqual(p.photos,input.photos)
  assert.ok(p.agentInstructions.length < 12000)
  assert.ok(validateOracleStudioPayload(p,5000).includes('ECOMECH'))
})

test('V5 never confuses genuine electrical cabinet with a robot',()=>{
  const input=robot('Build an electrical control cabinet with MCC breakers, DIN rails and copper terminals')
  assert.equal(studioQualityProfile(input),INDUSTRIAL_ELECTRICAL_PROFILE)
  const p=oracleStudioPayload('33333333-3333-4333-8333-333333333333',input)
  assert.ok('agentInstructions' in p)
  if('agentInstructions' in p) {
    assert.match(p.agentInstructions,/INDUSTRIAL ELECTRICAL CABINET/)
    assert.doesNotMatch(p.agentInstructions,/PHOTO-GROUNDED ROBOT/)
  }
})

test('V5 preserves real human character workflow and Polish text intent',()=>{
  const input=robot('Zrób realistyczną postać kobiety, dłonie i włosy.')
  assert.equal(creativeIntent(input),'reference-person')
  assert.equal(studioQualityProfile(input),REFERENCE_CHARACTER_PROFILE)
  assert.equal(creativeIntent({prompt:'A chessboard with many characters printed as symbols',photos:[]}), 'other-asset')
})

test('V5 recommends Astra for world and Sol for robot/person, only as non-billing advice',()=>{
  const cases=[
    ['Recreate an entire world with a humanoid mech and eight planets','world','astra'],
    ['ECOMECH humanoid robot with green chili and exposed MCC motors','reference-robot','sol'],
    ['Realistic woman in purple dress','reference-person','sol'],
    ['A green transformer box cabinet','other-asset','sol'],
  ] as const
  for(const [prompt,intent,model] of cases) {
    const result=characterRouteAdvice({prompt,photos:[photo('front')],purpose:'game'})
    assert.equal(result.intent,intent)
    assert.equal(result.recommendedModel,model)
    assert.equal(result.estimatedPointCeiling,MODEL_CATALOG[model].creditsPerGeneration)
    assert.equal(result.maxProviderLiabilityUsdPerJob,MODEL_CATALOG[model].maxProviderCents/100)
    assert.equal(result.attribution,'ROUTING_ADVICE_ONLY')
    assert.equal(result.modelChanged,false)
    assert.equal(result.paidGenerationStarted,false)
    assert.equal(result.requiresExplicitGenerate,true)
    assert.equal(result.fidelityGuarantee,false)
  }
})

test('V5 does not assign a hero approval merely for polygon quantity',()=>{
  const base=inspectGLB(detailedGLBFixture().buffer)
  assert.equal(passesStudioStructuralQuality(base,REFERENCE_ROBOT_V5_PROFILE),false)
  const dense=inspectGLB(detailedAssemblyGLBFixture(12,2400,4).buffer)
  assert.equal(passesStudioStructuralQuality(dense,REFERENCE_ROBOT_V5_PROFILE),true)
  assert.equal(characterRouteAdvice({prompt:'A robot'}).fidelityGuarantee,false)
})

test('V5 no photos/no explicit robot stays on old standard contract',()=>{
  const input:StudioInput={...robot('Simple blue chess pawn'),photos:[]}
  assert.equal(studioQualityProfile(input),'standard')
  const p=oracleStudioPayload('44444444-4444-4444-8444-444444444444',input)
  assert.ok('agentInstructions' in p)
  if('agentInstructions' in p) assert.doesNotMatch(p.agentInstructions,/PHOTO-GROUNDED ROBOT/)
})
