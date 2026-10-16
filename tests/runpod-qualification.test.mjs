import {test} from 'node:test'
import assert from 'node:assert/strict'
import {plan,IMAGE,REGISTRY} from '../scripts/runpod-qualify-once.mjs'
const storage={ARTIFACT_S3_ENDPOINT:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',
  ARTIFACT_BUCKET:'fixture-private',ARTIFACT_ACCESS_KEY_ID:'fixture-key',ARTIFACT_SECRET_ACCESS_KEY:'fixture-secret'}
const input={run:'gha-12345-1',worker:'# reviewed operator probe\n'.repeat(100),pool:'AMPERE_80',storage,now:1000000}
test('qualification has bounded workers, time, immutable image and private pull',()=>{
  const p=plan(input)
  assert.equal(p.image,IMAGE);assert.match(IMAGE,/@sha256:[a-f0-9]{64}$/)
  assert.equal(p.registry,REGISTRY)
  assert.deepEqual(p.workers,{min:0,max:1,idleTimeout:5})
  assert.equal(p.timeout,900000);assert.equal(p.disk,100)
  assert.deepEqual(p.mounts,{network:[],global:[]});assert.deepEqual(p.dataCenterIds,[])
  assert.equal(p.env.ENABLE_RUNPOD_WORKER,'false')
  assert.equal(p.env.QUALIFICATION_EXPIRES_AT,'2200')
  assert.equal('entrypoint' in p,false)
  assert.equal('cmd' in p,false)
  assert.match(p.env.QUALIFICATION_PROBE_SHA,/^[a-f0-9]{64}$/)
})
test('paid reruns and arbitrary resource names are refused',()=>{
  for(const run of ['gha-12345-2','../../customer','gha-foo-1',''])
    assert.throws(()=>plan({...input,run}),/FIRST_ATTEMPT/)
})
test('storage credentials cannot be directed at an arbitrary host',()=>{
  for(const endpoint of ['https://attacker.example','http://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',
    storage.ARTIFACT_S3_ENDPOINT+'/path',storage.ARTIFACT_S3_ENDPOINT+'?token=anything'])
    assert.throws(()=>plan({...input,storage:{...storage,ARTIFACT_S3_ENDPOINT:endpoint}}),/DESTINATION/)
})
test('incomplete storage prevents a paid allocation',()=>{
  for(const key of Object.keys(storage))
    assert.throws(()=>plan({...input,storage:{...storage,[key]:''}}),/MISSING_PRIVATE_STORAGE/)
})
test('operator source is attested without sending it as a container command',()=>{
  const worker=input.worker+'\n# $HOME `id` $(whoami) ;\n'
  const p=plan({...input,worker})
  assert.ok(!JSON.stringify(p).includes(worker))
  assert.notEqual(p.env.QUALIFICATION_PROBE_SHA,plan(input).env.QUALIFICATION_PROBE_SHA)
})
