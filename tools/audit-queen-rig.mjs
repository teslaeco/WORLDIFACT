/** Offline numerical audit of an authorized original GLB. No browser, network,
 * image decoding, generation, or original-model publication. Node 24. */
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { avatarBodyBounds, bindStaticAvatar } from '../src/lib/avatarLocomotion.ts'
import { orientQueenForGameplay } from '../src/lib/queenDetails.ts'
const [path,output]=process.argv.slice(2)
if(!path)throw new Error('Usage: node tools/audit-queen-rig.mjs ORIGINAL.glb [REPORT.json]')
const bytes=fs.readFileSync(path),hash=data=>createHash('sha256').update(data).digest('hex')
const loader=new GLTFLoader()
loader.register(()=>({name:'GEOMETRY_AUDIT_NO_IMAGE_DECODE',loadTexture:async()=>new THREE.Texture()}))
const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const root=new THREE.Group(),model=gltf.scene;root.add(model);orientQueenForGameplay(model)
const first=avatarBodyBounds(model);model.scale.multiplyScalar(1.78/first.body.getSize(new THREE.Vector3()).y);model.updateMatrixWorld(true)
const normalized=avatarBodyBounds(model)
model.position.x-=normalized.center.x;model.position.z-=normalized.center.z;model.position.y-=normalized.body.min.y;root.updateMatrixWorld(true)
const signatures=()=>{const result=[];root.traverse(o=>{if(o instanceof THREE.Mesh){const h=createHash('sha256');for(const key of ['position','normal','uv']){const a=o.geometry.attributes[key]?.array;if(a)h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength))}const a=o.geometry.index?.array;if(a)h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));result.push(h.digest('hex'))}});return result.sort()}
const originals=signatures(),rig=bindStaticAvatar(root)
assert.deepEqual(signatures(),originals,'Original geometry, UVs and indices must remain unchanged')
assert.equal(rig.fanParts,92,'The current original has 20 fan meshes plus 72 meshes in nine rotor modules')
const left=root.getObjectByName('NeptuneQueen-leg001'),right=root.getObjectByName('NeptuneQueen-leg')
assert.ok(left instanceof THREE.SkinnedMesh && right instanceof THREE.SkinnedMesh)
for(const [mesh,expected]of [[left,2],[right,5]]){const ids=mesh.geometry.attributes.skinIndex;for(let i=0;i<ids.count;i++)assert.equal(ids.getY(i),expected,'A named leg cannot be split between two chains')}
const hand=root.getObjectByName('anatomical-hand-right'),handle=root.getObjectByName('NeptuneQueen-fan-grip-handle')
const localGrip=handle.geometry.boundingBox?.getCenter(new THREE.Vector3())??(()=>{handle.geometry.computeBoundingBox();return handle.geometry.boundingBox.getCenter(new THREE.Vector3())})()
const handPositions=hand.geometry.attributes.position
let minimumLegGap=Infinity,maximumGripSurfaceDistance=0,minimumFootY=Infinity
const boundsOf=mesh=>{const b=new THREE.Box3(),p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);b.expandByPoint(v.applyMatrix4(mesh.matrixWorld))}return b}
for(let frame=0;frame<180;frame++){
 rig.update(1/60,1);root.updateMatrixWorld(true);rig.skeleton.update()
 if(frame%5)continue
 const l=boundsOf(left),r=boundsOf(right);minimumLegGap=Math.min(minimumLegGap,r.min.x-l.max.x)
 const grip=handle.localToWorld(localGrip.clone());let nearest=Infinity
 for(let i=0;i<handPositions.count;i++){const p=new THREE.Vector3().fromBufferAttribute(handPositions,i);hand.applyBoneTransform(i,p);p.applyMatrix4(hand.matrixWorld);nearest=Math.min(nearest,p.distanceTo(grip))}
 maximumGripSurfaceDistance=Math.max(maximumGripSurfaceDistance,nearest)
 for(const name of ['NeptuneQueen-shoe','NeptuneQueen-shoe001'])minimumFootY=Math.min(minimumFootY,boundsOf(root.getObjectByName(name)).min.y)
}
assert.ok(minimumLegGap>.025,`Actual source legs overlap: ${minimumLegGap}`)
assert.ok(maximumGripSurfaceDistance<.03,`Original handle detached from curled fingers: ${maximumGripSurfaceDistance}`)
assert.ok(minimumFootY>-.025,`Feet penetrate ground: ${minimumFootY}`)
rig.update(.05,0,false,false,false,true,{airborne:true,tuck:1,crouch:0});root.updateMatrixWorld(true)
assert.ok(rig.legs.every(l=>l.knee.rotation.x<-2),'Actual source skeleton must tuck in the flip')
const report={sourceJob:'99397623-e45c-48dc-95ec-6f84446a54d5',sha256:hash(bytes),bytes:bytes.length,sourceMeshes:originals.length,preservedGeometryAttributes:true,completeFanMeshes:rig.fanParts,rotorModules:9,namedLegChainsSeparated:true,walkSamples:36,minimumLegGapMetres:minimumLegGap,maximumGripToHandSurfaceMetres:maximumGripSurfaceDistance,minimumShoeHeightMetres:minimumFootY,maximumTuckKneeRadians:rig.legs[0].knee.rotation.x,verification:'NUMERICAL ORIGINAL-MODEL AUDIT; NOT A RENDER OR ANDROID FPS TEST'}
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2));rig.dispose()
