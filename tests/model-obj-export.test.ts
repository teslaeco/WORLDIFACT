import test from 'node:test'
import assert from 'node:assert/strict'
import { modelObjExport } from '../src/lib/modelObjExport.ts'
function glb(external = false) {
  const positions = new Float32Array([0,0,0,1,0,0,0,1,0])
  const doc = { asset:{version:'2.0'}, buffers:[{byteLength:36,...(external?{uri:'https://private.invalid/data'}:{})}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36}], accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}], nodes:[{mesh:0,translation:[10,0,0]},{mesh:0,translation:[0,20,0]}],scenes:[{nodes:[0,1]}],scene:0 }
  const text=JSON.stringify(doc),json=new TextEncoder().encode(text.padEnd(Math.ceil(text.length/4)*4,' '))
  const bytes=new Uint8Array(12+8+json.length+8+36),view=new DataView(bytes.buffer)
  ;[0x46546c67,2,bytes.length,json.length,0x4e4f534a].forEach((n,i)=>view.setUint32(i*4,n,true))
  bytes.set(json,20);view.setUint32(20+json.length,36,true);view.setUint32(24+json.length,0x004e4942,true);bytes.set(new Uint8Array(positions.buffer),28+json.length)
  return new Blob([bytes])
}
test('OBJ uses the authorized GLB geometry and retains world placements of shared meshes',async()=>{
 const out=await modelObjExport(glb()),text=await out.text()
 assert.equal(out.type,'text/plain');assert.equal(text.split('\n').filter(l=>l.startsWith('f ')).length,2)
 assert.match(text,/v 10 0 0\n/);assert.match(text,/v 11 0 0\n/);assert.match(text,/v 0 20 0\n/);assert.match(text,/v 0 21 0\n/)
 assert.match(text,/use GLB or Blender for PBR materials/)
})
test('OBJ conversion rejects malformed GLB and external resources without a fetch',async()=>{
 await assert.rejects(()=>modelObjExport(new Blob(['not a model'])),/GLB/)
 await assert.rejects(()=>modelObjExport(glb(true)),/External/)
})
