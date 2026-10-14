import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectGLB } from '../src/lib/glb.ts'
import { inspectStudioMeshEvidence, hasRealDetailedMeshEvidence } from '../src/lib/studioMeshEvidence.ts'
import { passesStudioStructuralQuality } from '../src/lib/studioQuality.ts'
import { oracleStudioPayload, studioQualityProfile, validateOracleStudioPayload, validateStudioInput,
  TEXT_CHARACTER_DETAIL_PROFILE, ROBOT_DETAIL_PROFILE, STUDIO_AGENT_INSTRUCTION_LIMIT } from '../src/lib/studioProtocol.ts'
import { detailedAssemblyGLBFixture, detailedGLBFixture } from './detailed-studio-fixture.ts'

const uid = '11111111-2222-4333-8444-555555555555'
const base = { worldId: 'enchanted-ai-shop', purpose: 'figurine', textureMaxSize: 4096, photos: [] }

/** A real GLB with independently present vertices. Synthetic evidence for the
 * structural gate only; NOT an artistic character, robot or paid AI output. */
function actualAssembly(meshCount = 7, perMesh = 3200) {
  const positions = new Float32Array(meshCount * perMesh * 9)
  const views = [], accessors = [], meshes = [], nodes = []
  for (let mesh = 0; mesh < meshCount; mesh++) {
    for (let t = 0; t < perMesh; t++) for (let corner = 0; corner < 3; corner++) {
      const offset = mesh * perMesh * 9 + t * 9 + corner * 3
      positions[offset] = mesh * 10 + t * 0.0002 + (corner === 1 ? 0.004 : 0)
      positions[offset+1] = corner === 2 ? 0.006 : 0
      positions[offset+2] = Math.sin(t * 0.05) * 0.008
    }
    views.push({ buffer: 0, byteOffset: mesh * perMesh * 36, byteLength: perMesh * 36 })
    accessors.push({ bufferView: mesh, componentType: 5126, count: perMesh * 3, type: 'VEC3' })
    meshes.push({ primitives: [{ attributes: { POSITION: mesh }, material: mesh % 3 }] })
    nodes.push({ mesh })
  }
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes, accessors, bufferViews: views, buffers: [{ byteLength: positions.byteLength }],
    materials: Array.from({length:3}, (_, i) => ({name: 'material-'+i,pbrMetallicRoughness: {baseColorFactor:[1,.5,.5,1]}})) }
  const raw = new TextEncoder().encode(JSON.stringify(doc))
  const jsonSize = Math.ceil(raw.byteLength/4)*4, binSize = positions.byteLength
  const bytes = new Uint8Array(28+jsonSize+binSize)
  const dv = new DataView(bytes.buffer)
  dv.setUint32(0,0x46546c67,true); dv.setUint32(4,2,true); dv.setUint32(8,bytes.byteLength,true)
  dv.setUint32(12,jsonSize,true); dv.setUint32(16,0x4e4f534a,true)
  bytes.fill(32,20,20+jsonSize); bytes.set(raw,20)
  dv.setUint32(20+jsonSize,binSize,true); dv.setUint32(24+jsonSize,0x004e4942,true)
  bytes.set(new Uint8Array(positions.buffer),28+jsonSize)
  return bytes
}

test('text character and combat robot get different bounded Blender contracts without touching historic object routing', () => {
  const samples = [
    ['A detailed fantasy dancer wearing armor and long flowing hair',TEXT_CHARACTER_DETAIL_PROFILE,'CHARACTER MESH V2'],
    ['A futuristic combat robot with real articulated knees and pistons',ROBOT_DETAIL_PROFILE,'ARTICULATED ROBOT V2'],
    ['Robot bojowy z pancerzem i przegubami',ROBOT_DETAIL_PROFILE,'ARTICULATED ROBOT V2'],
    ['Model postaci rycerza z oddzielonym wyposażeniem',TEXT_CHARACTER_DETAIL_PROFILE,'CHARACTER MESH V2'],
  ] as const
  for (const [prompt,expected,instruction] of samples) {
    const input = validateStudioInput({ ...base, prompt })
    assert.equal(studioQualityProfile(input),expected,prompt)
    const payload = oracleStudioPayload(uid,input)
    assert.ok('agentInstructions' in payload)
    if (!('agentInstructions' in payload)) throw Error('Expected detailed Studio instructions')
    assert.match(payload.agentInstructions,new RegExp(instruction))
    assert.match(payload.agentInstructions,/FIRST build_model/)
    assert.match(payload.agentInstructions,/finish_model/)
    assert.ok(payload.agentInstructions.length <= STUDIO_AGENT_INSTRUCTION_LIMIT)
    assert.doesNotThrow(()=>validateOracleStudioPayload(payload,5000))
    assert.ok(!('studioExecution' in payload))
  }
  for(const prompt of ['An MCC switchgear cabinet', 'A transformer', 'A command console with many lights',
    'A robot vacuum cleaner', 'A humanlike abstract lamp', 'An 8x8 chessboard']) {
    assert.equal(studioQualityProfile({...base,prompt,purpose:'object'}),'standard',prompt)
  }
})

test('model choice and immutable cost ceiling remain unchanged when geometry-first instructions are selected', () => {
  for (const model of ['astra','sol','luna'] as const) {
    const input = validateStudioInput({ ...base,
      prompt: 'A detailed armored battle robot with articulated mechanical joints',
      studioExecution: {revision:'studio-execution-v1',model,mode:'standard'} })
    assert.equal(studioQualityProfile(input),ROBOT_DETAIL_PROFILE)
    const wire=oracleStudioPayload(uid,input)
    assert.ok('studioExecution' in wire && 'agentInstructions' in wire)
    if (!('studioExecution' in wire && 'agentInstructions' in wire)) throw Error('Missing execution')
    assert.deepEqual(wire.studioExecution,input.studioExecution)
    assert.match(wire.agentInstructions,/ARTICULATED ROBOT V2/)
    assert.match(wire.agentInstructions,new RegExp('USD '+(model==='astra'?'1.75':model==='sol'?'0.35':'0.10')+' guard'.replace('.','\\.'), 'i'))
    assert.match(wire.agentInstructions,/Do not start another job/)
    assert.doesNotThrow(()=>validateOracleStudioPayload(wire,5000))
  }
})

test('a minimal texture-heavy GLB can no longer qualify for a real detailed character/robot success', () => {
  const minimum=inspectGLB(detailedGLBFixture().buffer)
  assert.equal(passesStudioStructuralQuality(minimum,TEXT_CHARACTER_DETAIL_PROFILE),false)
  assert.equal(passesStudioStructuralQuality(minimum,ROBOT_DETAIL_PROFILE),false)
  assert.throws(()=>inspectStudioMeshEvidence(detailedGLBFixture().buffer),/GLB geometry|backed|BIN/)
  // Historical metadata-only fixture passes the legacy count gate, but fails
  // the new embedded-geometry evidence gate. Do not claim it is real geometry.
  const fake=detailedAssemblyGLBFixture(12,2400,4).buffer
  const metadata=inspectGLB(fake)
  assert.equal(passesStudioStructuralQuality(metadata,TEXT_CHARACTER_DETAIL_PROFILE),true)
  assert.equal(passesStudioStructuralQuality(metadata,ROBOT_DETAIL_PROFILE),true)
  assert.throws(()=>inspectStudioMeshEvidence(fake),/backed|binary data|self-contained/)
})

test('actually backed geometry passes numerical checks but is not evidence of aesthetic quality',()=>{
  const actual=actualAssembly()
  const summary=inspectGLB(actual.buffer)
  assert.equal(summary.triangles,22400)
  assert.equal(passesStudioStructuralQuality(summary,ROBOT_DETAIL_PROFILE),true)
  assert.equal(passesStudioStructuralQuality(summary,TEXT_CHARACTER_DETAIL_PROFILE),true)
  const evidence=inspectStudioMeshEvidence(actual.buffer)
  assert.equal(evidence.embeddedPositionVertices,67200)
  assert.ok(evidence.distinctPositionSamples>48)
  assert.ok(evidence.nondegenerateTriangleSamples>=12)
  assert.equal(hasRealDetailedMeshEvidence(evidence),true)
  assert.equal(Object.hasOwn(evidence,'visualScore'),false)
  const damaged=actual.slice()
  const dv=new DataView(damaged.buffer)
  const jsonSize=dv.getUint32(12,true)
  dv.setUint32(20+jsonSize,12,true)
  assert.throws(()=>inspectStudioMeshEvidence(damaged.buffer),/Corrupted embedded BIN/)
})
