import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAvatarEquipment, hideEmbeddedFanNodes, type OutfitPreset } from './playerEquipment';

export const NEPTUNE_QUEEN_AVATAR_JOB = '99397623-e45c-48dc-95ec-6f84446a54d5';
export type AvatarChoice = 'queen' | 'rapper';
const AVATAR_URLS: Record<AvatarChoice, string> = { queen: '/api/avatar/neptune-queen', rapper: '/api/avatar/rapper-la' };

type Rig = {
  hips?: THREE.Bone; head?: THREE.Bone;
  leftArm?: THREE.Bone; rightArm?: THREE.Bone;
  leftLeg?: THREE.Bone; rightLeg?: THREE.Bone;
};

function proceduralQueenFallback() {
  const root = new THREE.Group(); root.name = 'neptune-queen-fallback';
  const dark = new THREE.MeshStandardMaterial({ color: '#071525', roughness: .58, metalness: .18 });
  const teal = new THREE.MeshStandardMaterial({ color: '#078c89', roughness: .38, metalness: .42 });
  const emerald = new THREE.MeshStandardMaterial({ color: '#087547', roughness: .42, metalness: .28 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b98568', roughness: .72 });
  const hair = new THREE.MeshStandardMaterial({ color: '#111216', roughness: .62 });
  const part = (parent: THREE.Group, radius: number, length: number, y: number, mat = dark) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 10), mat);
    mesh.position.y = y; mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  part(root, .19, .33, 1.16, dark);
  const waist = new THREE.Mesh(new THREE.ConeGeometry(.24, .17, 8), teal); waist.position.y = .96; root.add(waist);
  const neck = part(root, .07, .05, 1.48, skin); neck.scale.x = .9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 18, 14), skin); head.position.y = 1.69; head.scale.set(.9, 1.15, .9); root.add(head);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(.095, 14, 10), hair); bun.position.set(0,1.86,.01); bun.scale.set(.9,1.2,.9); root.add(bun);
  const collar = new THREE.Mesh(new THREE.ConeGeometry(.2,.25,6,1), teal); collar.position.set(0,1.44,.02); collar.rotation.x = Math.PI; root.add(collar);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * .115, .88, 0); root.add(hip); legs.push(hip);
    part(hip, .072, .32, -.2, skin);
    const knee = new THREE.Group(); knee.position.y = -.42; hip.add(knee); knees.push(knee);
    part(knee, .06, .3, -.21, skin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.13,.09,.25), dark); shoe.position.set(0,-.45,-.06); knee.add(shoe);
    const shoulder = new THREE.Group(); shoulder.position.set(side * .27,1.38,0); root.add(shoulder); arms.push(shoulder);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.16,.36,4), side < 0 ? emerald : teal); spike.rotation.z = side * Math.PI / 2; spike.position.set(side * .12,.02,0); shoulder.add(spike);
    part(shoulder,.058,.2,-.14,dark);
    const fore = new THREE.Group(); fore.position.y=-.29; shoulder.add(fore); part(fore,.047,.2,-.14,skin);
  }
  root.userData.avatarSource = 'procedural-fallback-current-queen-target';
  return { root, legs, knees, arms };
}


function proceduralRapperFallback() {
  const root = new THREE.Group(); root.name = 'rapper-fallback';
  const skin = new THREE.MeshStandardMaterial({ color: '#a97b62', roughness: .72 });
  const shirt = new THREE.MeshStandardMaterial({ color: '#252b34', roughness: .8 });
  const denim = new THREE.MeshStandardMaterial({ color: '#304b66', roughness: .82 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#ececec', roughness: .6 });
  const hair = new THREE.MeshStandardMaterial({ color: '#3a332d', roughness: .85 });
  const part = (parent: THREE.Group, radius: number, length: number, y: number, mat = shirt) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 10), mat);
    mesh.position.y = y; mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  part(root, .2, .42, 1.18, shirt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 18, 14), skin); head.position.y = 1.69; head.scale.set(.92, 1.08, .95); root.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.153, 18, 10, 0, Math.PI * 2, 0, Math.PI * .45), hair); hairCap.position.y = 1.735; root.add(hairCap);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * .12, .9, 0); root.add(hip); legs.push(hip);
    part(hip, .075, .34, -.2, denim);
    const knee = new THREE.Group(); knee.position.y = -.43; hip.add(knee); knees.push(knee);
    part(knee, .064, .31, -.21, denim);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.145,.095,.27), shoeMat); shoe.position.set(0,-.455,-.07); knee.add(shoe);
    const shoulder = new THREE.Group(); shoulder.position.set(side * .25,1.37,0); root.add(shoulder); arms.push(shoulder);
    part(shoulder,.06,.23,-.15,shirt);
    const fore = new THREE.Group(); fore.position.y=-.31; shoulder.add(fore); part(fore,.048,.22,-.14,skin);
  }
  root.userData.avatarSource = 'procedural-fallback-rapper';
  return { root, legs, knees, arms };
}

function findBone(root: THREE.Object3D, patterns: RegExp[]) {
  let found: THREE.Bone | undefined;
  root.traverse(object => {
    if (found || !(object instanceof THREE.Bone)) return;
    const name = object.name.toLowerCase();
    if (patterns.some(pattern => pattern.test(name))) found = object;
  });
  return found;
}
function findRig(root: THREE.Object3D): Rig {
  return {
    hips: findBone(root,[/hips?/,/pelvis/]), head: findBone(root,[/^head/,/head$/]),
    leftArm: findBone(root,[/left.*upper.*arm/,/upperarm_l/,/arm_l/]), rightArm: findBone(root,[/right.*upper.*arm/,/upperarm_r/,/arm_r/]),
    leftLeg: findBone(root,[/left.*thigh/,/thigh_l/,/upleg_l/]), rightLeg: findBone(root,[/right.*thigh/,/thigh_r/,/upleg_r/]),
  };
}

export function createPlayerAvatar(choice: AvatarChoice = 'queen') {
  const fallback = choice === 'rapper' ? proceduralRapperFallback() : proceduralQueenFallback();
  const root = new THREE.Group(); root.name = choice === 'rapper' ? 'rapper-player' : 'neptune-queen-player'; root.userData.avatarSource = choice === 'rapper' ? 'froge-archive:rapper-v10.glb' : `oracle-job:${NEPTUNE_QUEEN_AVATAR_JOB}`;
  const avatarUrl = AVATAR_URLS[choice];
  root.add(fallback.root);
  const equipment = createAvatarEquipment(root);
  let loaded: THREE.Object3D | null = null, rig: Rig = {}, mixer: THREE.AnimationMixer | null = null, last = 0;
  let loadedBaseY = 0;

  if ('document' in globalThis) {
    new GLTFLoader().load(avatarUrl, gltf => {
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= .01) return;
      const scale = 1.78 / size.y;
      model.scale.setScalar(scale); model.updateMatrixWorld(true);
      const scaled = new THREE.Box3().setFromObject(model), center = scaled.getCenter(new THREE.Vector3());
      model.position.x -= center.x; model.position.z -= center.z; model.position.y -= scaled.min.y;
      loadedBaseY = model.position.y;
      model.name = choice === 'rapper' ? 'Rapper_archive_v10' : 'Neptune_Queen_current_99397623';
      if (choice === 'queen') root.userData.hiddenEmbeddedFans = hideEmbeddedFanNodes(model);
      model.traverse(part => { if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; } });
      fallback.root.visible = false; loaded = model; root.add(model); rig = findRig(model);
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        const clip = gltf.animations.find(c => /idle|walk|locomotion/i.test(c.name)) ?? gltf.animations[0];
        mixer.clipAction(clip).reset().play();
      }
      root.userData.avatarLoaded = true;
    }, undefined, () => { root.userData.avatarLoaded = false; });
  }

  return {
    root,
    setOutfit(next: OutfitPreset) { equipment.setOutfit(next); },
    setFlightFans(active: boolean) { equipment.setFlightFans(active); },
    update(time: number, speed: number, seated = false, reaching = 0, swimming = false) {
      const delta = last ? Math.min(.05, Math.max(0,time-last)) : 0; last=time; mixer?.update(delta);
      const gait = Math.sin(time * (swimming ? 5.4 : 8)) * Math.min(speed,1);
      fallback.legs.forEach((leg,i)=>{leg.rotation.x=swimming ? gait*(i?-.25:.25)-.3 : seated?-1.35:gait*(i?-.48:.48);});
      fallback.knees.forEach((knee,i)=>{knee.rotation.x=swimming ? .35 + Math.max(0,gait*(i?-1:1))*.25 : seated?1.35:Math.max(0,gait*(i?-1:1))*.65;});
      fallback.arms.forEach((arm,i)=>{arm.rotation.x=swimming ? Math.sin(time*5.4 + i*Math.PI)*.85 : seated?-.95:-gait*(i?-.38:.38);});
      fallback.arms[0].rotation.z=-reaching*.72;
      if (loaded && !mixer) {
        if (rig.leftLeg) rig.leftLeg.rotation.x = swimming ? gait*.24-.25 : seated ? -1.15 : gait*.42;
        if (rig.rightLeg) rig.rightLeg.rotation.x = swimming ? -gait*.24-.25 : seated ? -1.15 : -gait*.42;
        if (rig.leftArm) rig.leftArm.rotation.x = swimming ? Math.sin(time*5.4)*.72 : seated ? -.75 : -gait*.34;
        if (rig.rightArm) rig.rightArm.rotation.x = swimming ? Math.sin(time*5.4+Math.PI)*.72 : seated ? -.75 : gait*.34;
        if (rig.leftArm) rig.leftArm.rotation.z = -reaching*.55;
        if (rig.head) rig.head.rotation.y = Math.sin(time*.8)*.025;
      }
      const visual = loaded ?? fallback.root;
      visual.position.y = (loaded ? loadedBaseY : 0) + Math.sin(time*(swimming?2.8:1.7))*(swimming?.015:.003);
      visual.rotation.z = swimming ? Math.sin(time*2.1)*.035 : Math.sin(time*.75)*.004;
      equipment.update(time);
    }
  };
}
