import * as THREE from 'three'
import { createSoilLoad, type SandField, type Contact, type SoilLoad } from './desertTerrain.ts'
export type DigTool='loader'|'backhoe'
export type BucketAction='carry'|'dig'|'dump'

/** Two-link elbow in the vertical plane. Gives an actual connected boom, not floating equipment. */
export function boomElbow(base:THREE.Vector3,tip:THREE.Vector3,upper=2.2,lower=2.0){
  const d=tip.clone().sub(base),distance=Math.max(.01,d.length()),unit=d.clone().normalize()
  const reachable=Math.min(upper+lower-.001,Math.max(Math.abs(upper-lower)+.001,distance))
  const along=(upper*upper-lower*lower+reachable*reachable)/(2*reachable)
  const perpendicular=new THREE.Vector3(0,unit.z,-unit.y)
  if(perpendicular.y<0)perpendicular.negate()
  return base.clone().addScaledVector(unit,along).addScaledVector(perpendicular,Math.sqrt(Math.max(0,upper*upper-along*along)))
}
export function createBackhoe(car:THREE.Group,initialLoad:SoilLoad=createSoilLoad(), saved?:{enabled:boolean;tool:DigTool}){
  const root=new THREE.Group();root.name='optional-backhoe-loader';root.visible=false;car.add(root)
  const metal=new THREE.MeshStandardMaterial({color:'#dfa544',metalness:.45,roughness:.43})
  const steel=new THREE.MeshStandardMaterial({color:'#526477',metalness:.75,roughness:.30})
  const soil=new THREE.MeshStandardMaterial({color:'#c79b59',roughness:1})
  const rodGeometry=new THREE.CylinderGeometry(1,1,1,10),up=new THREE.Vector3(0,1,0)
  const rod=(name:string,material=metal)=>{const mesh=new THREE.Mesh(rodGeometry,material);mesh.name=name;mesh.castShadow=true;root.add(mesh);return mesh}
  const frontArms=[rod('loader-left'),rod('loader-right')],pistons=[rod('front-piston-left',steel),rod('front-piston-right',steel)]
  const boom=rod('rear-boom'),stick=rod('rear-stick'),ram=rod('rear-hydraulic-cylinder',steel)
  const box=(parent:THREE.Group,size:[number,number,number],position:[number,number,number],material=metal)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh
  }
  function bucket(name:string,width:number,direction:number){
    const g=new THREE.Group();g.name=name;root.add(g)
    box(g,[width,.09,.68],[0,.045,0],steel)
    box(g,[width,.48,.07],[0,.28,-direction*.32])
    for(const side of [-1,1])box(g,[.07,.45,.68],[side*width*.5,.26,0])
    for(let i=0;i<6;i++)box(g,[.095,.07,.22],[(i/5-.5)*width,.035,direction*.4],steel)
    const load=new THREE.Mesh(new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2),soil)
    load.position.y=.11;load.scale.set(width*.46,.28,.29);load.name='collected-sand';g.add(load)
    return {g,load,width,direction}
  }
  const front=bucket('front-loader-bucket',2.2,-1),rear=bucket('rear-digging-bucket',.9,1)
  const load=initialLoad,point=new THREE.Vector3(),position=new THREE.Vector3(),scale=new THREE.Vector3()
  let enabled=saved?.enabled ?? initialLoad.amount>0,tool:DigTool=saved?.tool ?? 'loader',action:BucketAction='carry',height=.75,moved=0
  root.visible=enabled
  const line=(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3,radius:number)=>{
    const delta=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5)
    mesh.scale.set(radius,delta.length(),radius);mesh.quaternion.setFromUnitVectors(up,delta.normalize())
  }
  function update(dt:number,field:SandField|null){
    if(!enabled)return
    const active=tool==='loader'?front:rear,other=tool==='loader'?rear:front
    // The front loader and rear articulated backhoe are visible, but only the selected tool is lowered.
    front.g.position.set(0,tool==='loader'?height:.8,-3.55)
    rear.g.position.set(0,tool==='backhoe'?height:1.1,tool==='backhoe'?5.25:3.4)
    active.g.rotation.x=action==='dump'?-active.direction*.85:0
    other.g.rotation.x=0
    root.updateWorldMatrix(true,true)
    point.set(0,0,active.direction*.4);active.g.localToWorld(point)
    car.getWorldPosition(position);car.getWorldScale(scale)
    const ground=field?.heightAt(point.x,point.z)??0
    const localGround=(ground-position.y)/Math.max(.01,scale.y)
    const goal=action==='dig'?Math.max(tool==='backhoe'?-1.3:-.55,localGround-.13):action==='dump'?1.45:.85
    height=THREE.MathUtils.damp(height,goal,action==='dig'?3.5:5,dt)
    active.g.position.y=height
    frontArms.forEach((arm,i)=>{
      const side=i?1:-1,a=new THREE.Vector3(side*1.03,.9,-1.0),b=front.g.position.clone().add(new THREE.Vector3(side*.93,.25,.1))
      line(arm,a,b,.10);line(pistons[i],new THREE.Vector3(side*1.05,1.4,-1.5),a.clone().lerp(b,.7),.045)
    })
    const base=new THREE.Vector3(0,1.25,2.15),tip=rear.g.position.clone().add(new THREE.Vector3(0,.3,-.12)),elbow=boomElbow(base,tip)
    line(boom,base,elbow,.16);line(stick,elbow,tip,.125);line(ram,base.clone().add(new THREE.Vector3(0,.3,0)),base.clone().lerp(elbow,.77),.055)
    root.updateWorldMatrix(true,true)
    point.set(0,0,active.direction*.4);active.g.localToWorld(point)
    const contact:Contact={x:point.x,y:point.y,z:point.z,radius:Math.min(1.5,active.width*.55*scale.x)}
    moved=action==='dig'?field?.dig(contact,load,dt)??0:action==='dump'?field?.dump(contact,load,dt)??0:0
    front.load.visible=tool==='loader'&&load.amount>1e-5;rear.load.visible=tool==='backhoe'&&load.amount>1e-5
    active.load.scale.y=.30*Math.cbrt(load.amount/load.capacity)
  }
  return {root,load,update,get enabled(){return enabled},get tool(){return tool},get action(){return action},get moved(){return moved},
    setEnabled(value:boolean){if(!value&&load.amount>1e-6)return;enabled=value;root.visible=value;action='carry';if(!value)height=.85},
    setTool(value:DigTool){if(load.amount>1e-6)return;tool=value;action='carry';height=.85},
    setAction(value:BucketAction){if(enabled)action=value},
    contact(){return point.clone()}
  }
}
export type Backhoe=ReturnType<typeof createBackhoe>
