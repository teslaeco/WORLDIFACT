import * as THREE from 'three'

/** Deterministic GLB writer for bounded procedural MeshStandardMaterial scenes.
 * Supports the owned geometry kit and embeds RGBA DataTextures as PNG, without
 * document/canvas/FileReader, third-party endpoints or a browser environment.
 * Unsupported material/texture features fail rather than silently disappear.
 */
const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let at=0; for(const p of parts) {out.set(p,at); at+=p.length} return out }
const u32be = (n: number) => {const a=new Uint8Array(4); new DataView(a.buffer).setUint32(0,n); return a}
function crc32(data: Uint8Array) {let c=0xffffffff; for(const v of data){c^=v; for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0)} return (c^0xffffffff)>>>0}
function pngChunk(type: string, data: Uint8Array) {const body=concat([new TextEncoder().encode(type),data]); return concat([u32be(data.length),body,u32be(crc32(body))])}
export function rgbaPng(width: number,height: number,pixels: Uint8Array) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>2048||height>2048||pixels.length!==width*height*4) throw new Error('Invalid procedural texture')
  const rows=new Uint8Array(height*(width*4+1)); for(let y=0;y<height;y++) rows.set(pixels.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1)
  const deflate: Uint8Array[]=[new Uint8Array([0x78,0x01])]
  for(let at=0;at<rows.length;at+=65535){const count=Math.min(65535,rows.length-at), head=new Uint8Array(5);head[0]=at+count===rows.length?1:0;const v=new DataView(head.buffer);v.setUint16(1,count,true);v.setUint16(3,(~count)&65535,true);deflate.push(head,rows.subarray(at,at+count))}
  let a=1,b=0;for(const v of rows){a=(a+v)%65521;b=(b+a)%65521}deflate.push(u32be(((b<<16)|a)>>>0))
  const header=new Uint8Array(13), h=new DataView(header.buffer);h.setUint32(0,width);h.setUint32(4,height);header.set([8,6,0,0,0],8)
  return concat([new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',concat(deflate)),pngChunk('IEND',new Uint8Array())])
}
type Json = Record<string, any>
export function exportProceduralGlb(root: THREE.Object3D): ArrayBuffer {
  const doc: Json={asset:{version:'2.0',generator:'WORLDIFACT bounded procedural exporter'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[],images:[],textures:[],samplers:[]}
  const chunks:Uint8Array[]=[], materials=new Map<THREE.Material,number>(), textures=new Map<THREE.Texture,number>();let length=0,triangles=0
  function buffer(data: Uint8Array,target?:number){const pad=(4-length%4)%4;if(pad){chunks.push(new Uint8Array(pad));length+=pad}const index=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,...(target?{target}:{})});chunks.push(data);length+=data.length;if(length>45_000_000)throw new Error('Procedural model exceeds export size');return index}
  function accessor(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,index=false) {
    if(attribute.count>9_000_000 || ![1,2,3,4].includes(attribute.itemSize))throw new Error('Invalid geometry attribute')
    const values=index?new Uint32Array(attribute.count):new Float32Array(attribute.count*attribute.itemSize), min=Array(attribute.itemSize).fill(Infinity),max=Array(attribute.itemSize).fill(-Infinity)
    for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++){const value=attribute.getComponent(i,c);if(!Number.isFinite(value)||(index&&(!Number.isInteger(value)||value<0)))throw new Error('Invalid vertex');values[i*attribute.itemSize+c]=value;min[c]=Math.min(min[c],value);max[c]=Math.max(max[c],value)}
    const out=doc.accessors.length;doc.accessors.push({bufferView:buffer(new Uint8Array(values.buffer),index?34963:34962),componentType:index?5125:5126,count:attribute.count,type:['','SCALAR','VEC2','VEC3','VEC4'][attribute.itemSize],min,max});return out
  }
  function texture(t:THREE.Texture){if(textures.has(t))return textures.get(t)!;if(!(t instanceof THREE.DataTexture)||t.format!==THREE.RGBAFormat||t.type!==THREE.UnsignedByteType||!(t.image.data instanceof Uint8Array))throw new Error('Only embedded RGBA data textures are supported')
    const view=buffer(rgbaPng(t.image.width,t.image.height,t.image.data)); const image=doc.images.length;doc.images.push({bufferView:view,mimeType:'image/png'});const sampler=doc.samplers.length;doc.samplers.push({wrapS:t.wrapS,wrapT:t.wrapT,magFilter:t.magFilter===THREE.NearestFilter?9728:9729,minFilter:t.minFilter===THREE.NearestFilter?9728:9729});
    // Three wrapping enums differ from glTF constants.
    const s=doc.samplers[sampler]; s.wrapS=t.wrapS===THREE.RepeatWrapping?10497:t.wrapS===THREE.MirroredRepeatWrapping?33648:33071;s.wrapT=t.wrapT===THREE.RepeatWrapping?10497:t.wrapT===THREE.MirroredRepeatWrapping?33648:33071
    const out=doc.textures.length;doc.textures.push({source:image,sampler});textures.set(t,out);return out
  }
  function texInfo(t:THREE.Texture){const info:Json={index:texture(t)};if(t.repeat.x!==1||t.repeat.y!==1||t.offset.x!==0||t.offset.y!==0||t.rotation!==0){doc.extensionsUsed=['KHR_texture_transform'];info.extensions={KHR_texture_transform:{scale:[t.repeat.x,t.repeat.y],offset:[t.offset.x,t.offset.y],rotation:t.rotation}}}return info}
  function material(m:THREE.Material){if(materials.has(m))return materials.get(m)!;if(!(m instanceof THREE.MeshStandardMaterial)||m.normalMap||m.aoMap||m.bumpMap||m.displacementMap||m.alphaMap)throw new Error('Unsupported procedural material feature')
    const pbr:Json={baseColorFactor:[m.color.r,m.color.g,m.color.b,m.opacity],metallicFactor:m.metalness,roughnessFactor:m.roughness};if(m.map)pbr.baseColorTexture=texInfo(m.map)
    if(m.roughnessMap){if(m.metalnessMap && m.metalnessMap!==m.roughnessMap)throw new Error('Separate metal/rough maps must be packed');pbr.metallicRoughnessTexture=texInfo(m.roughnessMap)}else if(m.metalnessMap)throw new Error('Unpacked metalness map')
    const out=doc.materials.length;doc.materials.push({name:m.name,pbrMetallicRoughness:pbr,doubleSided:m.side===THREE.DoubleSide,emissiveFactor:m.emissive.toArray().map(v=>Math.min(1,v*m.emissiveIntensity)),...(m.transparent?{alphaMode:'BLEND'}:{})});materials.set(m,out);return out
  }
  root.updateMatrixWorld(true)
  root.traverse(o=> {if(!(o instanceof THREE.Mesh)||!o.visible)return;if(o.isSkinnedMesh||o instanceof THREE.InstancedMesh||Array.isArray(o.material))throw new Error('Use a bounded static mesh before export')
    const geometry=o.geometry,position=geometry.getAttribute('position');if(!position||position.count<3)throw new Error('Empty geometry');const count=geometry.index?.count??position.count;triangles+=Math.floor(count/3);if(triangles>3_000_000||doc.nodes.length>=5000)throw new Error('Procedural geometry limit exceeded')
    if(geometry.index)for(let i=0;i<geometry.index.count;i++)if(geometry.index.getX(i)>=position.count)throw new Error('Index outside vertex buffer')
    const attributes:Json={POSITION:accessor(position)};const normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');if(normal)attributes.NORMAL=accessor(normal);if(uv)attributes.TEXCOORD_0=accessor(uv)
    const primitive:Json={attributes,material:material(o.material),mode:4};if(geometry.index)primitive.indices=accessor(geometry.index,true)
    const mesh=doc.meshes.length;doc.meshes.push({name:o.name,primitives:[primitive]});doc.scenes[0].nodes.push(doc.nodes.length);doc.nodes.push({name:o.name,mesh,matrix:o.matrixWorld.toArray()})
  })
  if(!doc.meshes.length)throw new Error('No procedural meshes to export')
  const bin=concat(chunks),jsonRaw=new TextEncoder().encode(JSON.stringify({...doc,buffers:[{byteLength:bin.length}]})),jsonLength=(jsonRaw.length+3)&~3,binLength=(bin.length+3)&~3
  const out=new Uint8Array(12+8+jsonLength+8+binLength),view=new DataView(out.buffer);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,out.length,true);view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jsonLength);out.set(jsonRaw,20);const at=20+jsonLength;view.setUint32(at,binLength,true);view.setUint32(at+4,0x004e4942,true);out.set(bin,at+8);return out.buffer
}
