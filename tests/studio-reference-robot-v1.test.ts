import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {
  REFERENCE_ROBOT_PROFILE, REFERENCE_ROBOT_INSTRUCTIONS,
  oracleStudioPayload, studioQualityProfile, validateStudioInput,
  validateOracleStudioPayload, inputDigest, STUDIO_AGENT_INSTRUCTION_LIMIT
} from '../src/lib/studioProtocol.ts'
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,17,8,0,32,0,32,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
const photo=(view:'front'|'back'|'left')=>({name:'EcoMech '+view+'.jpg',view,
  dataUrl:jpeg,textureMaxSize:4096 as const,subject:'Same armored industrial guardian with raised green chili'})
const ID='567890ab-1234-4234-8234-123456789abc'
const base={worldId:'enchanted-ai-shop',purpose:'figurine',textureMaxSize:4096,prompt:
 'Build a realistic full-body humanoid battle robot holding a green chili. One side emerald and cobalt armor, the other exposes MCC electrical motors, contactors and copper windings. Preserve photographed silhouette.',
 studioExecution:{revision:'studio-execution-v1',model:'astra',mode:'standard'},photos:[photo('front'),photo('left')]}

test('genuine visual robot is detected before an MCC cabinet, preserving each original image and selected model',async()=>{
 const input=validateStudioInput(base)
 assert.equal(studioQualityProfile(input),REFERENCE_ROBOT_PROFILE)
 const before=await inputDigest(input)
 const payload=oracleStudioPayload(ID,input)
 assert.ok('photos' in payload && 'agentInstructions' in payload)
 if(!payload.photos || !('agentInstructions' in payload))throw Error('Expected image Standard contract')
 assert.equal(payload.id,ID)
 assert.deepEqual(payload.studioExecution,input.studioExecution)
 assert.equal(payload.photos[0].dataUrl,jpeg)
 assert.equal(payload.photos[0].view,'front')
 assert.equal(payload.photos[1].view,'side')
 assert.match(payload.agentInstructions,/Original reference view labels .*Reference 2: left/)
 assert.match(payload.agentInstructions,/RECONSTRUCT THE OVERALL SILHOUETTE FIRST/)
 assert.match(payload.agentInstructions,/viewer-left finished emerald\/cobalt/)
 assert.match(payload.agentInstructions,/FIRST build_model/)
 assert.match(payload.agentInstructions,/MCC components/)
 assert.match(payload.agentInstructions,/pass every image content block to image\(block\)/)
 assert.doesNotMatch(payload.agentInstructions,/INDUSTRIAL ELECTRICAL CABINET — TRUE 3D MODE/)
 assert.doesNotMatch(payload.agentInstructions,/REFERENCE CHARACTER — REALISTIC 3D MODE/)
 assert.match(payload.agentInstructions,/USD 1\.75 guard/)
 assert.match(payload.agentInstructions,/no automatic paid retries/)
 assert.ok(payload.agentInstructions.length<=STUDIO_AGENT_INSTRUCTION_LIMIT)
 assert.doesNotThrow(()=>validateOracleStudioPayload(payload,5000))
 assert.equal(await inputDigest(input),before)
 assert.equal(createHash('sha256').update(JSON.stringify(input)).digest('hex'),before)
})

test('a text-only robot must not be called image-conditioned, nor acquire the new visual label',()=>{
 const input=validateStudioInput({...base,photos:[]})
 assert.equal(studioQualityProfile(input),'standard')
 const payload=oracleStudioPayload(ID,input)
 assert.ok('agentInstructions' in payload)
 if(!('agentInstructions' in payload))throw Error('Expected detail instructions')
 assert.doesNotMatch(payload.agentInstructions,/REFERENCE-DRIVEN ROBOT RECONSTRUCTION \(V1\)/)
 assert.equal('photos' in payload,false)
})

test('generic control cabinets, vacuums, non-humanoid industrial robot arms and unrelated characters keep original routes',()=>{
 const samples=[
  ['An MCC control cabinet operated with a robot controller','industrial-electrical-cabinet-v1','object'],
  ['An automated robot vacuum cleaner','standard','object'],
  ['A CNC robotic manipulator arm','standard','object'],
  ['An electrical cabinet with 12 contactors and an HMI','industrial-electrical-cabinet-v1','object'],
  ['A woman wearing a robotic costume','reference-character-v1','figurine'],
  ['Model humanoidalnego robota z mechaniczną klatką piersiową','reference-robot-fidelity-v1','figurine'],
  ['A battle mech holding an emerald green chili','reference-robot-fidelity-v1','figurine'],
 ] as const
 for(const [prompt,expected,purpose] of samples)
  assert.equal(studioQualityProfile({prompt,photos:[photo('front')],purpose}),expected,prompt)
})

test('all signed photos remain intact for Sol/Luna as well, with immutable exact selected-model policy',()=>{
 for(const model of ['astra','sol','luna'] as const){
  const input=validateStudioInput({...base,studioExecution:{revision:'studio-execution-v1',model,mode:'standard'}})
  const payload=oracleStudioPayload(ID,input)
  assert.ok('photos' in payload && 'agentInstructions' in payload)
  if(!payload.photos || !('agentInstructions' in payload))throw Error('missing')
  assert.deepEqual(payload.photos.map(v=>v.dataUrl),[jpeg,jpeg])
  assert.deepEqual(payload.studioExecution,input.studioExecution)
  assert.doesNotThrow(()=>validateOracleStudioPayload(payload,5000))
  assert.match(payload.agentInstructions,model==='astra'?/USD 1\.75 guard/:model==='sol'?/USD 0\.35 guard/:/USD 0\.10 guard/)
 }
})

test('unrecognized encrypted/provider selections cannot smuggle a substitute reconstruction service into the verified wire',()=>{
 assert.throws(()=>validateStudioInput({...base,studioExecution:{revision:'studio-execution-v1',model:'tripo',mode:'standard'}}))
 assert.ok(REFERENCE_ROBOT_INSTRUCTIONS.length<2500)
 assert.equal(REFERENCE_ROBOT_PROFILE,'reference-robot-fidelity-v1')
})
