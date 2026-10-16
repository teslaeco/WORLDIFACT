import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { prepareGpuGallery } from '../scripts/prepare-gpu-trial-publication.mjs'

const ids = [
  ['chess-cube-512-led-rook','L4','NVIDIA L4'],
  ['ecomech-asymmetric-mechanical-study','A100','NVIDIA A100 80GB'],
  ['halloween-multi-asset-room-study','H100','NVIDIA H100 80GB'],
]
function syntheticGlb() {
  const gltf = { asset: { version: '2.0' },
    meshes: Array.from({length:14},()=>({primitives:[{attributes:{POSITION:0},material:0}]})),
    nodes: Array.from({length:14},(_,i)=>({mesh:i})),
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index:0 } } }],
    textures:[{source:0}], images:[{bufferView:0,mimeType:'image/png'}],
    buffers:[{byteLength:8}],bufferViews:[{buffer:0,byteOffset:0,byteLength:8}],
    accessors:[{bufferView:0,componentType:5126,count:14,type:'VEC3'}],
    scenes:[{nodes:Array.from({length:14},(_,i)=>i)}],scene:0 }
  const json = Buffer.from(JSON.stringify(gltf))
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
  json.copy(padded)
  const bin = Buffer.alloc(8)
  bin.writeUInt32LE(8,0)
  const b = Buffer.alloc(12+8+padded.length+8+bin.length)
  b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8)
  b.writeUInt32LE(padded.length,12);b.writeUInt32LE(0x4e4f534a,16)
  padded.copy(b,20)
  const offset=20+padded.length
  b.writeUInt32LE(bin.length,offset);b.writeUInt32LE(0x004e4942,offset+4)
  bin.copy(b,offset+8)
  return b
}
async function fixture(mutator=()=>{}) {
  const root=await mkdtemp(join(tmpdir(),'worldifact-gpu-publication-'))
  const input=join(root,'in'),output=join(root,'public-gpu-trials')
  await mkdir(input)
  for(const [id,gpu,gpuName] of ids) {
    const buffer=syntheticGlb()
    const receipt={
      revision:'worldifact-three-gpu-procedural-qualification-v1',
      kind:'GPU_PROCEDURAL_TEST_NOT_PHOTO_RECONSTRUCTION',
      task:id,gpuClass:gpu,gpuName,
      gpuVramGiB:gpu==='L4'?23:80,cudaMatrixChecksum:1.23,cudaComputeMs:80,
      meshCount:14,triangleCount:800,glbSha256:createHash('sha256').update(buffer).digest('hex'),
      gpuResultValidated:true,astraCallExecuted:false,neuralImageTo3D:false,
      originalImageMatch:'NOT_MEASURED',makeReady:false,
    }
    mutator(id,receipt,buffer)
    await writeFile(join(input,id+'.glb'),buffer)
    await writeFile(join(input,id+'.json'),JSON.stringify(receipt))
  }
  return {root,input,output,cleanup:()=>rm(root,{recursive:true,force:true})}
}

test('three attestations stage exactly three GLBs and honest manifest',async()=>{
  const f=await fixture()
  try{
    const output=await prepareGpuGallery(f.input,f.output,38866390304)
    assert.equal(output.published,3)
    assert.equal(output.manifest.models.length,3)
    const files=await readdir(join(f.output,'assets'))
    assert.equal(files.length,3)
    const manifest=JSON.parse(await readFile(join(f.output,'manifest.json'),'utf8'))
    assert.equal(manifest.sourceRunId,38866390304)
    assert.ok(manifest.models.every(x=>x.astraGenerated===false&&x.makeReady===false&&x.embeddedPbrTexture===true))
  }finally{await f.cleanup()}
})
test('incomplete evidence does not write a public manifest',async()=>{
  const f=await fixture((id,receipt)=>{if(id===ids[2][0])receipt.gpuResultValidated=false})
  try{
    await assert.rejects(prepareGpuGallery(f.input,f.output,38866390304),/GPU_PROVENANCE_MISMATCH/)
    await assert.rejects(readdir(f.output))
  }finally{await f.cleanup()}
})
test('hash tampering is always rejected',async()=>{
  const f=await fixture((id,receipt)=>{if(id===ids[1][0])receipt.glbSha256='0'.repeat(64)})
  try{await assert.rejects(prepareGpuGallery(f.input,f.output,38866390304),/GLB_INTEGRITY_MISMATCH/)}
  finally{await f.cleanup()}
})
test('no IMAGE TO 3D claims may be published',async()=>{
  const f=await fixture((id,receipt)=>{if(id===ids[0][0])receipt.astraCallExecuted=true})
  try{await assert.rejects(prepareGpuGallery(f.input,f.output,38866390304),/FALSE_NEURAL_OR_MAKE_CLAIM/)}
  finally{await f.cleanup()}
})
