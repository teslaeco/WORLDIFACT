import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMeshyImagePayload, buildMeshyOfflinePreview, verifyMeshyTaskIdentity } from '../server/characterProviders/meshyV4.ts'
const image='https://cdn.shopify.com/s/files/1/1035/0172/6043/files/worldifact-ecomech-v4-reference-20261015.png?v=1792019787'
test('Meshy adapter actually uses the owner-approved IMAGE for ultra PBR and retains separate provenance',()=>{
 const input={approvedImageUrl:image,texturePrompt:'Green cobalt asymmetric mech, original green chili, cyan LEDs and dark electrical motors.',geometryResolution:'4k' as const}
 const result=buildMeshyOfflinePreview(input)
 assert.equal(result.readiness,'PREPARED_NOT_SUBMITTED')
 assert.equal(result.paidJobsSubmitted,0)
 assert.equal(result.selectedGeometryProvider,'meshy-7.1')
 assert.equal(result.providerTaskId,null)
 const p=buildMeshyImagePayload(input)
 assert.equal(p.image_url,image)
 assert.equal(p.ai_model,'meshy-7.1')
 assert.equal(p.geometry_resolution,'4k')
 assert.equal(p.enable_pbr,true)
 assert.equal(p.should_texture,true)
 assert.equal(p.image_enhancement,false)
 assert.deepEqual(p.target_formats,['glb','fbx','obj'])
 assert.equal(Object.hasOwn(p,'apiKey'),false)
 assert.equal(Object.hasOwn(result,'oracleReceipt'),false)
})
test('do not silently substitute a different third-party image URL or infer an output without matching receipt',()=>{
 const input={approvedImageUrl:image,geometryResolution:'2k' as const,texturePrompt:'robot'}
 assert.throws(()=>buildMeshyImagePayload({...input,approvedImageUrl:'https://example.com/photo.png'}))
 assert.throws(()=>buildMeshyImagePayload({...input,texturePrompt:'x'.repeat(801)}))
 assert.throws(()=>verifyMeshyTaskIdentity('original-job',{id:'foreign-job',status:'SUCCEEDED',type:'image-to-3d',model_urls:{glb:'https://example.com/model.glb'}}))
 assert.throws(()=>verifyMeshyTaskIdentity('original-job',{id:'original-job',status:'SUCCEEDED',type:'image-to-3d',model_urls:{}}))
 assert.deepEqual(verifyMeshyTaskIdentity('original-job',{id:'original-job',status:'IN_PROGRESS',type:'image-to-3d'}),{taskId:'original-job',state:'IN_PROGRESS',outputAvailable:false})
})
