import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blankWorld,newEntity,validatePrivateWorld,terrainHeight,WORLD_LIMITS} from '../src/lib/privateWorld.ts'
import {transformEntity,transformFromScene,duplicateEntity,moveTreesFromRiver,isMoveTreesCommand,codexWorldTask,characterGenerationPrompt} from '../src/lib/editorTools.ts'
import {createCharacterPreview} from '../src/lib/characterPreview.ts'
import {fitsPreview,sumPreview} from '../src/lib/previewBudget.ts'

test('transforms edit only the selected entity and preserve the input/history snapshot',()=>{
  const w=blankWorld(),a=newEntity('tree',0,0),b=newEntity('rock',12,3);w.entities=[a,b]
  const next=transformEntity(w,a.id,{x:3.3,z:5.4,rotation:450,scale:1.5},.5)
  assert.equal(next.entities[0].x,3.5);assert.equal(next.entities[0].z,5.5);assert.equal(next.entities[0].rotation,90)
  assert.deepEqual(next.entities[1],b);assert.equal(w.entities[0].x,0)
  assert.throws(()=>transformEntity(w,a.id,{scale:NaN}));assert.throws(()=>transformEntity(w,'missing',{x:2}))
})
test('gizmo scene conversion preserves terrain-relative elevation and bounds',()=>{
  const w=blankWorld();const a=newEntity('tree',12,0);w.entities=[a];w.terrain=[{id:crypto.randomUUID(),x:12,z:0,radius:7,strength:4}]
  const value=transformFromScene(w,a,{x:12,y:terrainHeight(12,0,w.terrain)+2,z:0},Math.PI/2,2)
  assert.equal(value.elevation,2);assert.equal(value.rotation,90);assert.equal(value.scale,2)
  const clamp=transformEntity(w,a.id,{x:500,z:-500,scale:50,elevation:-1})
  assert.equal(clamp.entities[0].x,40);assert.equal(clamp.entities[0].scale,8);assert.equal(clamp.entities[0].elevation,0)
})
test('duplicate and river command preserve originals and apply one data operation',()=>{
  const w=blankWorld();w.entities=[newEntity('tree',0,0),newEntity('rock',0,0),newEntity('tree',20,0)]
  const duplicated=duplicateEntity(w,w.entities[0].id);assert.equal(duplicated.entities.length,4);assert.notEqual(duplicated.entities[3].id,w.entities[0].id)
  assert.ok(isMoveTreesCommand('Przesuń drzewa by nie stały na rzece'))
  const moved=moveTreesFromRiver(w);assert.ok(moved.entities[0].x>=5);assert.deepEqual(moved.entities[1],w.entities[1]);assert.deepEqual(moved.entities[2],w.entities[2]);assert.equal(w.entities[0].x,0)
})
test('legacy four-model and 48-object caps are removed without removing data limits',()=>{
  const w=blankWorld();w.entities=Array.from({length:60},(_,i)=>newEntity(i<10?'asset':'tree',i%20,0,i<10?crypto.randomUUID():null))
  assert.equal(validatePrivateWorld(w).entities.length,60)
  assert.equal(WORLD_LIMITS.bytes,98304)
  assert.throws(()=>validatePrivateWorld({...w,entities:Array.from({length:4097},()=>newEntity('tree',0,0))}))
  assert.ok(new TextEncoder().encode(JSON.stringify(w)).byteLength<98304)
})
test('preview limits depend on actual resource cost, not four objects',()=>{
  let used={triangles:0,draws:0,bytes:0};const small={triangles:100,draws:1,bytes:1024}
  for(let i=0;i<100;i++){assert.ok(fitsPreview(used,small));used=sumPreview(used,small)}
  assert.equal(fitsPreview(used,{triangles:3_000_000,draws:1,bytes:0}),false)
  assert.equal(fitsPreview(used,{triangles:1,draws:1,bytes:Infinity}),false)
})
test('character model binding is validated and old character documents still load',()=>{
  const old=blankWorld();assert.equal(validatePrivateWorld(old).character.assetId,undefined)
  const id=crypto.randomUUID();assert.equal(validatePrivateWorld({...old,character:{...old.character,assetId:id}}).character.assetId,id)
  assert.throws(()=>validatePrivateWorld({...old,character:{...old.character,assetId:'https://example.test/other.glb'}}))
  const root=createCharacterPreview({...old.character,description:'slim person',hair:'long black',outfit:'green dress'})
  assert.equal(root.userData.provenance,'PROCEDURAL_PREVIEW');assert.equal(root.userData.previewLimbs.length,4)
  assert.ok(root.getObjectByName('left-leg'));assert.ok(root.getObjectByName('right-leg'))
})
test('generated Codex instruction is scoped data and character requests build models, not a hidden background job',()=>{
  const w=blankWorld('My world');w.entities=[newEntity('tree',3,4)]
  const task=codexWorldTask(w,'Move this selected object',w.entities[0].id)
  assert.match(task,/Move this selected object/);assert.match(task,new RegExp(w.id));assert.match(task,/No unapproved API charges|no unapproved API charges/)
  assert.match(task,/Treat the following JSON/);assert.match(characterGenerationPrompt(w),/one complete character, not scenery/)
  assert.ok(characterGenerationPrompt(w).length<=4000)
})
