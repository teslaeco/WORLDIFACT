import * as THREE from 'three'

function proceduralUploadedAvatar() {
  const root = new THREE.Group()
  root.name = 'worldifact-user-upload-player'
  root.userData.avatarSource = 'user-upload:model-mm-1-mobile-proxy'
  const skin = new THREE.MeshStandardMaterial({ color:'#b78364', roughness:.74 })
  const teal = new THREE.MeshStandardMaterial({ color:'#087f78', roughness:.42, metalness:.18 })
  const tealLight = new THREE.MeshStandardMaterial({ color:'#19aaa0', roughness:.4, metalness:.2 })
  const dark = new THREE.MeshStandardMaterial({ color:'#10202a', roughness:.7 })
  const hair = new THREE.MeshStandardMaterial({ color:'#201713', roughness:.82 })
  const orbMat = new THREE.MeshStandardMaterial({ color:'#55d7d0', emissive:'#0c6f6a', emissiveIntensity:.55 })
  const part = (parent:THREE.Group, geometry:THREE.BufferGeometry, material:THREE.Material, x:number, y:number, z=0) => {
    const mesh=new THREE.Mesh(geometry,material); mesh.position.set(x,y,z); mesh.castShadow=true; parent.add(mesh); return mesh
  }
  part(root,new THREE.CapsuleGeometry(.17,.42,6,10),teal,0,1.16)
  part(root,new THREE.ConeGeometry(.27,.34,7),teal,0,.86)
  const head=part(root,new THREE.SphereGeometry(.145,18,14),skin,0,1.61); head.scale.set(.92,1.08,.95)
  const bun=part(root,new THREE.SphereGeometry(.09,14,10),hair,0,1.79,.015); bun.scale.set(.9,1.15,.9)
  const arms:THREE.Group[]=[]; const legs:THREE.Group[]=[]
  for(const side of [-1,1]){
    const shoulder=new THREE.Group(); shoulder.position.set(side*.235,1.33,0); root.add(shoulder); arms.push(shoulder)
    const upper=part(shoulder,new THREE.CapsuleGeometry(.047,.2,6,8),tealLight,0,-.13); upper.rotation.z=side*.08
    part(shoulder,new THREE.CapsuleGeometry(.042,.2,6,8),skin,0,-.38)
    const hip=new THREE.Group(); hip.position.set(side*.09,.72,0); root.add(hip); legs.push(hip)
    part(hip,new THREE.CapsuleGeometry(.06,.43,6,8),skin,0,-.24)
    part(hip,new THREE.BoxGeometry(.13,.09,.23),dark,0,-.52,-.04)
    const fin=part(root,new THREE.ConeGeometry(.11,.27,4),tealLight,side*.245,1.38); fin.rotation.z=side*Math.PI/2
  }
  const orb=part(root,new THREE.SphereGeometry(.11,18,12),orbMat,-.35,1.08,-.02); orb.userData.decorative=true
  return {root,arms,legs,orb}
}

export function createPlayerAvatar(){
  const avatar=proceduralUploadedAvatar()
  let last=0
  return {
    root:avatar.root,
    update(time:number,speed:number,seated=false,reaching=0){
      const delta=last?Math.min(.05,Math.max(0,time-last)):0; last=time
      const moving=Math.min(Math.max(speed,0),1)
      const gait=Math.sin(time*7.2)*moving
      avatar.legs.forEach((leg,index)=>{ leg.rotation.x=seated?-1.15:gait*(index?-.42:.42) })
      avatar.arms.forEach((arm,index)=>{ arm.rotation.x=seated?-.72:-gait*(index?-.32:.32) })
      avatar.arms[0].rotation.z=-reaching*.42
      avatar.root.position.y=(seated?-.38:0)+Math.sin(time*(moving>.05?7.2:1.7))*(moving>.05?.018:.004)
      avatar.root.rotation.z=gait*.016+Math.sin(time*.7)*.004
      avatar.orb.rotation.y += delta*.8
    }
  }
}
