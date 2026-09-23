import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createSandField, createSoilLoad } from '../src/lib/desertTerrain.ts'
import { createDesertScene, meadowGroundGeometry } from '../src/lib/desertScene.ts'
import { createBackhoe, boomElbow } from '../src/lib/backhoe.ts'
import { createWorldObject, disposeObject } from '../src/lib/worldGeometry.ts'
import { meadowBlueprint } from '../src/lib/blueprint.ts'
const near=(a:number,b:number,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`)

test('sand requires cutting-edge contact, capacity and actual finite in-zone input',()=>{
  const field=createSandField(),load=createSoilLoad(),base=field.heights.slice()
  for(const contact of [{x:25,y:10,z:25,radius:1},{x:0,y:0,z:0,radius:1},{x:NaN,y:0,z:25,radius:1},{x:25,y:0,z:25,radius:50}]){
    assert.equal(field.dig(contact,load,.05),0)
  }
  assert.deepEqual(field.heights,base);assert.equal(load.amount,0)
  const contact={x:25,y:field.heightAt(25,25)-.1,z:25,radius:1}
  assert.ok(field.dig(contact,load,.05)>0)
  const capacity=load.amount;load.capacity=capacity
  assert.equal(field.dig(contact,load,.05),0)
  assert.equal(field.dig(contact,load,NaN),0)
  assert.equal(field.dump(contact,load,-1),0)
  near(field.volumeDelta()+load.amount,0)
})

test('excavation lowers the real height field, then dumping transfers conserved volume elsewhere',()=>{
  const field=createSandField(),load=createSoilLoad(),before=field.heightAt(24,26)
  for(let i=0;i<160;i++)field.dig({x:24,y:field.heightAt(24,26)-.12,z:26,radius:1.15},load,1/60)
  assert.ok(load.amount>.45 && load.amount<=load.capacity)
  assert.ok(field.heightAt(24,26)<before-.15)
  near(field.volumeDelta()+load.amount,0)
  const depositBefore=field.heightAt(33,26)
  for(let i=0;i<180;i++)field.dump({x:33,y:2,z:26,radius:1.15},load,1/60)
  assert.ok(field.heightAt(33,26)>depositBefore+.10)
  near(load.amount,0);near(field.volumeDelta(),0)
  for(let r=0;r<field.rows;r++)for(let c=0;c<field.columns;c++){
    const h=field.heights[r*field.columns+c];assert.ok(h>=-1.350001&&h<=1.650001)
    if(r===0||c===0||r===field.rows-1||c===field.columns-1)assert.equal(h,0)
  }
})

test('mesh ray intersections and gameplay ground sampling agree before and after excavation',()=>{
  const field=createSandField(),desert=createDesertScene(field),ground=new THREE.Mesh(meadowGroundGeometry(),new THREE.MeshBasicMaterial())
  const ray=new THREE.Raycaster(new THREE.Vector3(24.23,5,26.34),new THREE.Vector3(0,-1,0))
  ground.updateMatrixWorld(true);desert.root.updateMatrixWorld(true)
  assert.equal(ray.intersectObject(ground).length,0,'no undeformed flat plane may cover the desert')
  for(const editing of [false,true]){
    if(editing){const load=createSoilLoad();for(let i=0;i<120;i++)field.dig({x:24,y:field.heightAt(24,26)-.1,z:26,radius:1.2},load,.05)}
    assert.equal(desert.sync(),true);assert.equal(desert.sync(),false)
    desert.root.updateMatrixWorld(true)
    const hit=ray.intersectObject(desert.mesh)[0];assert.ok(hit)
    near(hit.point.y,field.heightAt(24.23,26.34),1e-6)
  }
  ray.ray.origin.set(0,5,17);assert.equal(ray.intersectObject(ground).length,1)
  disposeObject(desert.root);disposeObject(ground)
})

test('both real bucket tools lower into transformed sand, carry their load and dump a new mound',()=>{
  for(const tool of ['loader','backhoe'] as const)for(const yaw of [0,.62]){
    const field=createSandField(),car=new THREE.Group();car.position.set(27,.14,26);car.rotation.y=yaw
    const machine=createBackhoe(car);machine.setEnabled(true);machine.setTool(tool)
    for(let i=0;i<90;i++)machine.update(1/60,field)
    assert.equal(machine.load.amount,0,'raised bucket must not mine remotely')
    machine.setAction('dig');let lowest=Infinity;for(let i=0;i<300;i++){machine.update(1/60,field);lowest=Math.min(lowest,machine.contact().y)}
    assert.ok(machine.load.amount>.08,`${tool} at ${yaw} must collect real soil`)
    assert.ok(lowest<.35,'cutting edge contacted the surface before the automatic full-bucket lift');
    if(machine.action==='carry')near(machine.load.amount,machine.load.capacity);near(field.volumeDelta()+machine.load.amount,0)
    const collected=machine.load.amount;machine.setAction('carry');for(let i=0;i<90;i++)machine.update(1/60,field)
    near(machine.load.amount,collected);assert.ok(machine.contact().y>.8)
    car.position.x+=3;machine.setAction('dump');for(let i=0;i<200;i++)machine.update(1/60,field)
    near(machine.load.amount,0);near(field.volumeDelta(),0)
    car.updateMatrixWorld(true);car.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)))
    disposeObject(car)
  }
})

test('backhoe boom is connected with fixed link lengths for working target positions',()=>{
  const base=new THREE.Vector3(0,1.25,2.15)
  for(const y of [-1,.4,1.8]){
    const tip=new THREE.Vector3(0,y,5.13),elbow=boomElbow(base,tip)
    near(base.distanceTo(elbow),2.2);near(elbow.distanceTo(tip),2)
  }
})

test('the original rover accepts the attachment without changing four independent wheel pivots',()=>{
  const car=createWorldObject({...meadowBlueprint().objects[0],x:0,z:0,rotation:0}),wheels=car.children.filter(o=>o.name==='wheel')
  assert.equal(wheels.length,4)
  const matrices=wheels.map(w=>w.matrix.clone()),machine=createBackhoe(car)
  assert.equal(machine.enabled,false);machine.setEnabled(true);machine.update(.05,null)
  wheels.forEach((w,i)=>assert.deepEqual(w.matrix,matrices[i]))
  assert.ok(car.getObjectByName('rear-stick'));assert.ok(car.getObjectByName('front-loader-bucket'))
  machine.setAction('dig');machine.setEnabled(false);assert.equal(machine.action,'carry')
  disposeObject(car)
})

test('a loaded bucket cannot disappear or switch tools; world rebuild restores the same material and tool',()=>{
 const field=createSandField(),car=new THREE.Group();car.position.set(26,.1,25)
 const first=createBackhoe(car);first.setEnabled(true);first.setTool('backhoe');first.setAction('dig')
 for(let i=0;i<300;i++)first.update(1/60,field)
 assert.ok(first.load.amount>.1)
 first.setTool('loader');assert.equal(first.tool,'backhoe')
 first.setEnabled(false);assert.equal(first.enabled,true)
 first.setAction('carry');const before=first.load.amount
 const nextCar=new THREE.Group(),resumed=createBackhoe(nextCar,first.load,{enabled:first.enabled,tool:first.tool})
 assert.equal(resumed.load.amount,before);assert.equal(resumed.tool,'backhoe');assert.ok(resumed.enabled)
 near(field.volumeDelta()+resumed.load.amount,0)
 disposeObject(car);disposeObject(nextCar)
})
