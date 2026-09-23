import * as THREE from 'three'
/** A front-quarter working view beyond the cutting edge, rather than behind the cab. */
export function excavationCamera(car:THREE.Object3D, contact:THREE.Vector3, rear:boolean, distance=5.5, orbit=0, pitch=0) {
  const scale=car.getWorldScale(new THREE.Vector3()).x
  const yaw=car.getWorldQuaternion(new THREE.Quaternion())
  const direction=new THREE.Vector3(0,0,rear?1:-1).applyQuaternion(yaw)
  const side=new THREE.Vector3(1,0,0).applyQuaternion(yaw)
  const d=THREE.MathUtils.clamp(distance,4,12)*scale
  const aim=contact.clone();aim.y=Math.max(contact.y+.4,car.getWorldPosition(new THREE.Vector3()).y+.25)
  const offset=direction.multiplyScalar(d*.70).addScaledVector(side,d*.72)
  offset.applyAxisAngle(new THREE.Vector3(0,1,0),orbit)
  offset.y=d*THREE.MathUtils.clamp(.70-pitch,.45,1.2)
  return {position:aim.clone().add(offset),target:aim}
}
