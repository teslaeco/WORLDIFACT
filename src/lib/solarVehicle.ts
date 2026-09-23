import * as THREE from 'three';
import { createPVMaterial } from './pvMaterial.ts';

/** Original procedural GAME mesh shaped from the owner's PV vehicle reference. */
export function createSolarVehicle() {
  const car = new THREE.Group();
  const pv = createPVMaterial();
  const trim = new THREE.MeshStandardMaterial({ color: '#344b59', roughness: .4, metalness: .75 });
  trim.name = 'worldifact-object-color';
  const rubber = new THREE.MeshStandardMaterial({ color: '#18212a', roughness: .98 });
  const glass = new THREE.MeshStandardMaterial({ color: '#74959e', transparent: true, opacity: .25, roughness: .13, metalness: .2, depthWrite: false, side: THREE.DoubleSide });
  const lamp = new THREE.MeshStandardMaterial({ color: '#f3f7e3', emissive: '#e7f3d4', emissiveIntensity: 1.5 });
  const addBox = (parent: THREE.Group, size: [number, number, number], pos: [number, number, number], mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...pos); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  addBox(car, [2.72, .28, 4.9], [0, .72, 0], trim);
  addBox(car, [2.62, .64, 4.5], [0, 1.06, 0], pv);
  const bonnet = addBox(car, [2.56, .13, 1.45], [0, 1.43, -1.64], pv); bonnet.rotation.x = -.12;
  const rear = addBox(car, [2.56, .13, 1.12], [0, 1.48, 1.75], pv); rear.rotation.x = .17;
  addBox(car, [2.22, .11, 2.13], [0, 2.3, .03], pv);
  const windscreen = addBox(car, [2.17, 1.0, .035], [0, 1.88, -1.05], glass); windscreen.rotation.x = -.37;
  const backscreen = addBox(car, [2.17, .85, .035], [0, 1.94, 1.19], glass); backscreen.rotation.x = .37;
  for (const side of [-1, 1]) {
    const door = new THREE.Group(); door.name = side === -1 ? 'driver-door' : 'passenger-door';
    door.position.set(side * 1.31, 1.08, -.91);
    addBox(door, [.055, .57, 1.91], [0, .03, .96], pv);
    addBox(door, [.035, .7, 1.75], [0, .68, .92], glass);
    addBox(door, [.085, .055, 1.92], [0, .34, .95], trim);
    addBox(door, [.09, .95, .055], [0, .61, 1.88], trim);
    addBox(door, [.095, .045, .24], [side * .055, .2, 1.53], trim);
    car.add(door);
    addBox(car, [.11, .97, .12], [side * 1.12, 1.85, -.99], trim).rotation.x = -.37;
    addBox(car, [.11, .87, .12], [side * 1.12, 1.9, 1.19], trim).rotation.x = .37;
    addBox(car, [.36, .19, .27], [side * 1.53, 1.57, -.65], pv);
    addBox(car, [.58, .12, .035], [side * .81, 1.28, -2.32], lamp);
    for (const z of [-1.55, 1.55]) {
      const wheel = new THREE.Group(); wheel.name = 'wheel'; wheel.position.set(side * 1.4, .68, z);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(.565, .095, 10, 40), rubber); tire.name = 'hollow-wheel-tyre'; tire.scale.z = .43 / .19; tire.rotation.y = Math.PI / 2; wheel.add(tire);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(.49, .49, .455, 32), pv); disc.name = 'stock-wheel-disc'; disc.rotation.z = Math.PI / 2; wheel.add(disc);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .48, 16), trim); hub.name = 'stock-wheel-hub'; hub.rotation.z = Math.PI / 2; wheel.add(hub);
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12;
        const tread = addBox(wheel, [.45, .075, .095], [0, Math.cos(a) * .64, Math.sin(a) * .64], rubber);
        tread.rotation.x = a;
      }
      car.add(wheel);
    }
    addBox(car, [.62, .14, .68], [side * .54, 1.13, .1], rubber);
    addBox(car, [.62, .63, .12], [side * .54, 1.5, .43], rubber).rotation.x = -.12;
  }
  addBox(car, [2.06, .17, .3], [0, 1.53, -.77], trim);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(.19, .025, 8, 24), rubber);
  steering.position.set(-.55, 1.62, -.55); steering.rotation.x = -.4; car.add(steering);
  return car;
}
