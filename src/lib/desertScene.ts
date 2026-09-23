import * as THREE from 'three'
import { DESERT, type SandField } from './desertTerrain.ts'

/** Leave a real rectangular hole: the meadow plane must not cover excavated sand. */
export function meadowGroundGeometry() {
  const p:number[]=[],uv:number[]=[]
  const rect=(x0:number,x1:number,z0:number,z1:number)=>{
    for(const [x,z] of [[x0,z0],[x0,z1],[x1,z0],[x1,z0],[x0,z1],[x1,z1]]){p.push(x,0,z);uv.push(x/8,z/8)}
  }
  rect(-115,DESERT.minX,-115,115);rect(DESERT.maxX,115,-115,115)
  rect(DESERT.minX,DESERT.maxX,-115,DESERT.minZ);rect(DESERT.minX,DESERT.maxX,DESERT.maxZ,115)
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals()
  return geometry
}
export function createDesertScene(field:SandField) {
  const root=new THREE.Group();root.name='editable-desert-game-zone'
  const position=new Float32Array(field.heights.length*3),uv=new Float32Array(field.heights.length*2),indices:number[]=[]
  for(let r=0;r<field.rows;r++)for(let c=0;c<field.columns;c++){
    const i=r*field.columns+c;position.set([DESERT.minX+c*DESERT.cell,field.heights[i],DESERT.minZ+r*DESERT.cell],i*3);uv.set([c*.1,r*.1],i*2)
    if(r<field.rows-1&&c<field.columns-1)indices.push(i,i+field.columns,i+1,i+1,i+field.columns,i+field.columns+1)
  }
  const geometry=new THREE.BufferGeometry();geometry.setIndex(indices)
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeVertexNormals()
  const colors=new Float32Array(field.heights.length*3)
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage))
  const material=new THREE.MeshStandardMaterial({color:'#e6bc7b',vertexColors:true,roughness:.97})
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSand;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSand = position;')
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSand;').replace('#include <color_fragment>','#include <color_fragment>\nfloat dune = sin(vSand.x * 9.0 + sin(vSand.z * 2.0)) * 0.04 + sin(vSand.x * 82.0) * sin(vSand.z * 117.0) * 0.018;\ndiffuseColor.rgb *= 0.96 + dune;')
  }
  const mesh=new THREE.Mesh(geometry,material);mesh.name='diggable-sand-surface';mesh.receiveShadow=true;root.add(mesh)
  // A bounded subsurface bottom, below the maximum digging depth, closes the terrain box.
  const bottom=new THREE.Mesh(new THREE.BoxGeometry(25,.1,25),new THREE.MeshStandardMaterial({color:'#9e7d50',roughness:1}))
  bottom.position.set(27.5,-1.5,26.5);root.add(bottom)
  let revision=-1
  return {root,mesh, sync(){
    if(revision===field.revision)return false
    revision=field.revision
    for(let i=0;i<field.heights.length;i++){
      position[i*3+1]=field.heights[i]
      const cut=Math.min(1,Math.max(0,field.original[i]-field.heights[i])/.70)
      colors.set([1-.36*cut,1-.45*cut,1-.54*cut],i*3)
    }
    geometry.attributes.color.needsUpdate=true
    geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();return true
  }}
}
