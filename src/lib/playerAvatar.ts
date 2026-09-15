import * as THREE from 'three';

/** Neutral animation mannequin. It is explicitly not the unavailable shop model. */
export function createPlayerAvatar() {
  const root = new THREE.Group(); root.name = 'animation-mannequin';
  const cloth = new THREE.MeshStandardMaterial({ color: '#b1c9c8', roughness: .85 });
  const skin = new THREE.MeshStandardMaterial({ color: '#a6b1b3', roughness: .7 });
  const dark = new THREE.MeshStandardMaterial({ color: '#293c49', roughness: .9 });
  const part = (parent: THREE.Group, radius: number, length: number, y: number, mat = cloth) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 10), mat);
    mesh.position.y = y; mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  part(root, .2, .34, 1.14);
  part(root, .11, .08, 1.51, skin);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.155, 16, 12), skin); head.position.y = 1.72; head.scale.y = 1.12; root.add(head);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * .13, .94, 0); root.add(hip); legs.push(hip);
    part(hip, .087, .26, -.2);
    const knee = new THREE.Group(); knee.position.y = -.4; hip.add(knee); knees.push(knee);
    part(knee, .063, .28, -.21);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.15, .1, .27), dark); foot.position.set(0, -.47, -.07); knee.add(foot);
    const shoulder = new THREE.Group(); shoulder.position.set(side * .26, 1.4, 0); root.add(shoulder); arms.push(shoulder);
    part(shoulder, .064, .19, -.14);
    const elbow = new THREE.Group(); elbow.position.y = -.28; shoulder.add(elbow); elbow.rotation.x = -.12;
    part(elbow, .05, .18, -.14, skin);
  }
  return { root, update(time: number, speed: number, seated = false, reaching = 0) {
    const gait = Math.sin(time * 8) * Math.min(speed, 1);
    legs.forEach((leg, i) => { leg.rotation.x = seated ? -1.35 : gait * (i ? -.52 : .52); });
    knees.forEach((knee, i) => { knee.rotation.x = seated ? 1.35 : Math.max(0, gait * (i ? -1 : 1)) * .7; });
    arms.forEach((arm, i) => { arm.rotation.x = seated ? -1.0 : -gait * (i ? -.42 : .42); });
    arms[0].rotation.z = reaching * .85;
  } };
}
