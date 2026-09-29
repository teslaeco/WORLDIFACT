import * as THREE from 'three'
import type { WorldCharacter } from './privateWorld.ts'
import { normalizedCommand } from './editorTools.ts'

/** Immediate, explicitly procedural character. Never claimed as a paid AI model. */
export function createCharacterPreview(c:WorldCharacter):THREE.Group {
  const root=new THREE.Group();root.name='Procedural character preview'
  const text=normalizedCommand([c.description,c.outfit,c.hair,c.style].join(' '))
  const slim=/slim|szczupl|smukl/.test(text),broad=/broad|muscular|muskul|szerok/.test(text),width=slim?.85:broad?1.2:1
  const dress=/dress|skirt|sukien|sukni|spodnic/.test(text),longHair=/long|dlug/.test(normalizedCommand(c.hair+' '+c.description))
  const cloth=new THREE.MeshStandardMaterial({color:c.outfitColor,roughness:.76}),skin=new THREE.MeshStandardMaterial({color:'#c6916e',roughness:.8}),hair=new THREE.MeshStandardMaterial({color:c.hairColor,roughness:.88}),shoe=new THREE.MeshStandardMaterial({color:'#253139',roughness:.73}),white=new THREE.MeshStandardMaterial({color:'#ecf1e6',roughness:.5}),eye=new THREE.MeshStandardMaterial({color:'#19242d'})
  const part=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m}
  part(new THREE.CapsuleGeometry(.23*width,.45,5,12),cloth,0,1.13)
  part(new THREE.CapsuleGeometry(.07,.08,3,10),skin,0,1.55)
  part(new THREE.SphereGeometry(.22,20,14),skin,0,1.79)
  part(new THREE.SphereGeometry(.227,18,12,0,Math.PI*2,0,Math.PI*.55),hair,0,1.82)
  if(longHair){const m=part(new THREE.CapsuleGeometry(.19,.42,4,12),hair,0,1.55,-.1);m.scale.set(1,.95,.6)}
  for(const x of [-.075,.075]){const m=part(new THREE.SphereGeometry(.04,10,8),white,x,1.81,.192);m.scale.set(1,.7,.35);part(new THREE.SphereGeometry(.019,8,6),eye,x,1.81,.207)}
  part(new THREE.SphereGeometry(.027,10,8),skin,0,1.75,.222)
  const limbs:THREE.Group[]=[]
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.name=side<0?'left-leg':'right-leg';leg.position.set(side*.145*width,.78,0);root.add(leg)
    const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.095,.44,4,10),dress?skin:cloth);mesh.position.y=-.33;mesh.castShadow=true;leg.add(mesh)
    const foot=new THREE.Mesh(new THREE.CapsuleGeometry(.11,.13,4,10),shoe);foot.rotation.x=Math.PI/2;foot.position.set(0,-.67,.065);foot.castShadow=true;leg.add(foot);limbs.push(leg)
    const arm=new THREE.Group();arm.name=side<0?'left-arm':'right-arm';arm.position.set(side*.31*width,1.43,0);root.add(arm)
    const sleeve=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.25,4,10),cloth);sleeve.position.y=-.18;sleeve.castShadow=true;arm.add(sleeve)
    const hand=new THREE.Mesh(new THREE.CapsuleGeometry(.062,.1,4,10),skin);hand.position.y=-.43;hand.castShadow=true;arm.add(hand);limbs.push(arm)
  }
  if(dress)part(new THREE.CylinderGeometry(.24*width,.43*width,.58,20),cloth,0,.76)
  if(/hat|cap|czapk|kapel/.test(text)){part(new THREE.CylinderGeometry(.25,.25,.14,18),cloth,0,1.99);part(new THREE.CylinderGeometry(.34,.34,.025,18),cloth,0,1.93)}
  if(c.label&&typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')
    if(ctx){ctx.clearRect(0,0,512,128);ctx.fillStyle='#f5f7ec';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 46px sans-serif';ctx.fillText(c.label,256,64,480);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;part(new THREE.PlaneGeometry(.39,.1),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),0,1.23,.232)}
  }
  root.userData.previewLimbs=limbs;root.userData.provenance='PROCEDURAL_PREVIEW';return root
}
