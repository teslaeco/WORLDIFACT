import * as THREE from 'three'
import { riverHalfWidth } from './waterPhysics.ts'
import { inDesert } from './desertTerrain.ts'
/** Lush local clumps: one bounded draw, seeded placement and no external textures. */
export function createMeadowGrass(mobile: boolean) {
  const vertices:number[]=[]
  for(let b=0;b<5;b++){
    const angle=b*2.399,dx=Math.cos(angle),dz=Math.sin(angle),height=.20+(b%3)*.07,width=.032,lean=.09
    const point=(side:number,y:number,bend:number)=>[dx*(side*width)+dz*bend,y,dz*(side*width)-dx*bend]
    const a=point(-1,0,0),c=point(1,0,0),d=point(-.65,height*.55,lean*.3),e=point(.65,height*.55,lean*.3),tip=point(0,height,lean)
    vertices.push(...a,...c,...d,...c,...e,...d,...d,...e,...tip)
  }
  const shape=new THREE.BufferGeometry();shape.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));shape.computeVertexNormals()
  const wind={value:0},material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,side:THREE.DoubleSide})
  material.onBeforeCompile=shader=>{
    shader.uniforms.meadowTime=wind
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float meadowTime;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(meadowTime * 1.25 + instanceMatrix[3].x * .42 + instanceMatrix[3].z * .25) * position.y * position.y * .5;')
  }
  const grass=new THREE.InstancedMesh(shape,material,mobile?16000:28000);grass.name='meadow-grass-instanced';grass.userData.wind=wind
  const dummy=new THREE.Object3D(),color=new THREE.Color()
  let seed=73429
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<grass.count;i++){
    let x=0,z=0
    // Half the clumps concentrate where the character and gameplay camera actually are.
    for(let attempt=0;attempt<80;attempt++){
      x=i<grass.count*.55?(random()-.5)*32:(random()-.5)*70
      z=i<grass.count*.55?7+random()*27:(random()-.5)*68
      if(Math.abs(z)>riverHalfWidth(x)+.55&&!inDesert(x,z,.3)&&!(Math.abs(x-6)<2.1&&Math.abs(z-13)<3.1))break
    }
    dummy.position.set(x,.004,z);dummy.rotation.y=random()*Math.PI*2
    const size=.72+random()*.46;dummy.scale.set(size,size*(.8+random()*.35),size);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix)
    color.setHSL(.27+random()*.055,.42+random()*.14,.26+random()*.12);grass.setColorAt(i,color)
  }
  grass.receiveShadow=true;grass.computeBoundingSphere();return grass
}
export function updateMeadowGrass(grass:THREE.InstancedMesh,time:number){grass.userData.wind.value=time}
/** Fine green ground cover fills the far field without thousands of extra draw calls. */
export function createMeadowTexture(){
  const width=256,data=new Uint8Array(width*width*4)
  let seed=91013
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    const grain=seed/4294967296,patch=Math.sin(x/19)*Math.sin(y/27)
    data.set([61+grain*26+patch*7,102+grain*31+patch*9,39+grain*19+patch*4,255],(y*width+x)*4)
  }
  const texture=new THREE.DataTexture(data,width,width);texture.colorSpace=THREE.SRGBColorSpace
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true
  return texture
}
