import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { paintedMetal, instrumentScreen } from './qualityMaterials.ts'

/** Original bounded GAME kit, shared by FREE and paid drafts. NOT electrical design.
 * Generates repeated parts locally from one semantic object; never calls a provider.
 */
export function createMccCabinet(color = '#d6d8d3') {
  const root = new THREE.Group(); root.name = 'MCC procedural cabinet'
  root.userData = { target: 'GAME', generatedGeometry: 'parameterized-kit', manufacturing: 'NOT_VALIDATED', nominalUnits: 'metres' }
  const paint = paintedMetal(color), blue = new THREE.MeshStandardMaterial({ color: '#195591', metalness: 0.25, roughness: 0.52 })
  const dark = new THREE.MeshStandardMaterial({ color: '#252c30', metalness: 0.1, roughness: 0.65 }), steel = new THREE.MeshStandardMaterial({ color: '#929da1', metalness: 0.8, roughness: 0.34 })
  const yellow = new THREE.MeshStandardMaterial({ color: '#f5d43c', roughness: 0.62 }), black = new THREE.MeshStandardMaterial({ color: '#17191a', roughness: 0.6 }), display = instrumentScreen()
  const lights = ['#d74836', '#67b74b', '#ebbf38'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, emissive: c, emissiveIntensity: 0.25 }))
  const geometry = new Map<string, THREE.BufferGeometry>()
  function box(parent: THREE.Group, name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, rounded = false) {
    const key = [w,h,d,rounded].join(':')
    if (!geometry.has(key)) geometry.set(key, rounded ? new RoundedBoxGeometry(w,h,d,1,Math.min(w,h,d) * 0.12) : new THREE.BoxGeometry(w,h,d))
    const mesh = new THREE.Mesh(geometry.get(key)!, material); mesh.name = name; mesh.position.set(x,y,z); parent.add(mesh); return mesh
  }
  const cylinder = new THREE.CylinderGeometry(1,1,1,12)
  function knob(parent: THREE.Group, name: string, x: number, y: number, z: number, r: number, depth: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(cylinder, material); mesh.name = name; mesh.rotation.x = Math.PI / 2; mesh.scale.set(r,depth,r); mesh.position.set(x,y,z); parent.add(mesh)
  }
  const triangle = new THREE.BufferGeometry(); triangle.setAttribute('position',new THREE.Float32BufferAttribute([0,0.07,0,-0.07,-0.06,0,0.07,-0.06,0],3)); triangle.setIndex([0,1,2]); triangle.computeVertexNormals()
  function hazard(parent: THREE.Group, x: number, y: number, z: number) {
    const edge = new THREE.Mesh(triangle,black); edge.position.set(x,y,z); parent.add(edge)
    const sign = new THREE.Mesh(triangle,yellow); sign.scale.setScalar(0.82); sign.position.set(x,y,z+0.001); parent.add(sign)
    const bolt = box(parent,'warning-mark',x,y,z+0.003,0.018,0.052,0.002,black); bolt.rotation.z = -0.3
  }
  box(root,'plinth',0,0.1,0,6.5,0.2,0.8,dark,true)
  box(root,'roof',0,2.41,0,6.5,0.12,0.8,dark,true)
  box(root,'back',0,1.3,-0.365,6.4,2.25,0.06,paint)
  for (let column=0;column<7;column++) {
    const x=-2.76+column*0.92, sections=column===0?2:4, height=2.2/sections
    const bay = new THREE.Group(); bay.name=`bay-${column+1}`; root.add(bay)
    box(bay,'vertical-side',x-0.451,1.3,0,0.025,2.2,0.76,paint)
    for (let row=0;row<sections;row++) {
      const y=0.2+height*(row+0.5)
      const module = new THREE.Group(); module.name=`drawer-${column+1}-${row+1}`; module.userData={kind:'mcc-module'}; bay.add(module)
      box(module,'door',x,y,0.372,0.89,height-0.016,0.045,paint,true)
      for (const side of [-1,1]) {
        box(module,'hinge',x+side*0.414,y+height*0.3,0.405,0.026,0.075,0.013,steel)
        knob(module,'fastener',x+side*0.404,y-height*0.37,0.401,0.008,0.004,steel)
      }
      hazard(module,x+0.13,y+height*0.31,0.4)
      box(module,'blue-control-plate',x+0.08,y,0.410,0.38,0.22,0.023,blue,true)
      if ((column+row)%3!==0 || column===0) {
        box(module,'instrument-bezel',x+0.08,y,0.434,0.26,0.20,0.044,dark,true)
        box(module,'screen',x+0.065,y+0.014,0.458,0.176,0.096,0.005,display)
        for(let key=0;key<3;key++) box(module,'instrument-key',x+0.025+key*0.038,y-0.061,0.461,0.026,0.018,0.01,steel,true)
      } else for(let lamp=0;lamp<3;lamp++) knob(module,'pilot-light',x-0.03+lamp*0.106,y,0.44,0.026,0.036,lights[lamp])
      knob(module,'isolator-base',x-0.28,y,0.425,0.049,0.04,dark)
      box(module,'isolator-handle',x-0.28,y,0.455,0.023,0.084,0.022,steel,true)
      box(module,'door-handle',x+0.352,y,0.441,0.018,0.124,0.05,dark,true)
      box(module,'blank-identification-plate',x-0.10,y+height*0.39,0.399,0.19,0.025,0.002,steel)
    }
    for(let slot=0;slot<6;slot++) box(bay,'vent',x-0.32+slot*0.127,0.237,0.404,0.087,0.013,0.005,dark)
  }
  box(root,'end-side',3.21,1.3,0,0.025,2.2,0.76,paint)
  root.traverse(o=> { if(o instanceof THREE.Mesh) {o.castShadow=true; o.receiveShadow=true} })
  root.userData.deviceCount=26
  return root
}
