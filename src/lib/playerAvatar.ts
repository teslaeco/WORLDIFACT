import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAvatarEquipment, type OutfitPreset } from './playerEquipment.ts';
import { avatarBodyBounds, bindStaticAvatar, type GameRig } from './avatarLocomotion.ts';
import { disposeObject } from './worldGeometry.ts';
import { loadAvatarBytes } from './avatarAsset.ts';
import type { JumpAnimation } from './playerJump.ts';
import { orientQueenForGameplay, polishQueenFootwear } from './queenDetails.ts';

export const NEPTUNE_QUEEN_AVATAR_JOB = '99397623-e45c-48dc-95ec-6f84446a54d5';
export type AvatarChoice = 'queen' | 'rapper';

type Rig = {
  hips?: THREE.Bone; head?: THREE.Bone;
  leftArm?: THREE.Bone; rightArm?: THREE.Bone;
  leftLeg?: THREE.Bone; rightLeg?: THREE.Bone;
  leftKnee?: THREE.Bone; rightKnee?: THREE.Bone; leftFoot?: THREE.Bone; rightFoot?: THREE.Bone;
};

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
    leftLeg: findBone(root,[/left.*thigh/,/left.*upleg/,/thigh_l/,/upleg_l/]), rightLeg: findBone(root,[/right.*thigh/,/right.*upleg/,/thigh_r/,/upleg_r/]),
    leftKnee: findBone(root,[/leftleg$/,/left.*calf/,/calf_l/,/shin_l/]), rightKnee: findBone(root,[/rightleg$/,/right.*calf/,/calf_r/,/shin_r/]),
    leftFoot: findBone(root,[/left.*foot/,/foot_l/]), rightFoot: findBone(root,[/right.*foot/,/foot_r/]),
  };
}

export function createPlayerAvatar(choice: AvatarChoice = 'queen', onState?: (state: 'loading' | 'ready' | 'error') => void) {
  const fallback = choice === 'rapper' ? proceduralRapperFallback() : { root: new THREE.Group(), legs: [] as THREE.Group[], knees: [] as THREE.Group[], arms: [] as THREE.Group[] };
  let disposed = false, gameRig: GameRig | null = null;
  rootState('loading');
  function rootState(state: 'loading' | 'ready' | 'error') { onState?.(state); }
  const root = new THREE.Group(); root.name = choice === 'rapper' ? 'rapper-player' : 'neptune-queen-player'; root.userData.avatarSource = choice === 'rapper' ? 'froge-archive:rapper-v10.glb' : `oracle-job:${NEPTUNE_QUEEN_AVATAR_JOB}`;
  const visualRoot = new THREE.Group(); visualRoot.name = "avatar-hip-pivot"; root.add(visualRoot);
  visualRoot.add(fallback.root);
  const equipment = createAvatarEquipment(visualRoot);
  let loaded: THREE.Object3D | null = null, rig: Rig = {}, mixer: THREE.AnimationMixer | null = null, last = 0;
  let loadedBaseY = 0;

  if ('document' in globalThis) {
    void loadAvatarBytes(choice).then(bytes => {
      if (disposed) return null;
      return new GLTFLoader().parseAsync(bytes, choice === 'queen' ? '/game-assets/' : '/api/avatar/');
    }).then(gltf => {
      if (!gltf) return;
      if (disposed) { disposeObject(gltf.scene); return; }
      const model = gltf.scene;
      if (choice === "queen") { orientQueenForGameplay(model); polishQueenFootwear(model); }
      const { body: bounds } = avatarBodyBounds(model), size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= .01) { disposeObject(model); rootState('error'); return; }
      const scale = 1.78 / size.y;
      model.scale.multiplyScalar(scale); model.updateMatrixWorld(true);
      const { body: scaled, center } = avatarBodyBounds(model);
      model.position.x -= center.x; model.position.z -= center.z; model.position.y -= scaled.min.y;
      loadedBaseY = model.position.y;
      model.name = choice === 'rapper' ? 'Rapper_archive_v10' : 'Neptune_Queen_current_99397623';
      // The original fan belongs to the character; it must not be hidden.
      model.traverse(part => { if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; } });
      fallback.root.visible = false; loaded = model; visualRoot.add(model); rig = findRig(model);
      if (choice === 'queen' && !rig.leftLeg && !rig.rightLeg && !gltf.animations.length) {
        // Bind only the original character, not the optional equipment overlays.
        equipment.root.removeFromParent();
        try { gameRig = bindStaticAvatar(visualRoot); } finally { visualRoot.add(equipment.root); }
        root.userData.fanParts = gameRig.fanParts; root.userData.fanAttached = gameRig.fanAttached;
      }
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        const clip = gltf.animations.find(c => /idle|walk|locomotion/i.test(c.name)) ?? gltf.animations[0];
        mixer.clipAction(clip).reset().play();
      }
      root.userData.avatarLoaded = true; rootState('ready');
    }).catch(() => { if (!disposed) { root.userData.avatarLoaded = false; root.visible = false; rootState('error'); } });
  }

  return {
    root,
    dispose() { disposed = true; mixer?.stopAllAction(); if (loaded) mixer?.uncacheRoot(loaded); gameRig?.dispose(); },
    setOutfit(next: OutfitPreset) { equipment.setOutfit(next); },
    setFlightFans(active: boolean) { equipment.setFlightFans(active); },
    update(time: number, speed: number, seated = false, reaching = 0, swimming = false, flying = false, flip = 0, jumping = false, motion: JumpAnimation = { tuck: jumping ? Math.max(.2, Math.sin(flip / 2) ** 2) : 0, crouch: 0, airborne: jumping }) {
      const delta = last ? Math.min(.05, Math.max(0,time-last)) : 0; last=time; mixer?.update(delta);
      const gait = Math.sin(time * (swimming ? 5.4 : 8)) * Math.min(speed,1);
      fallback.legs.forEach((leg,i)=>{leg.rotation.x=swimming ? gait*(i?-.25:.25)-.3 : seated?-1.35:gait*(i?-.48:.48);});
      fallback.knees.forEach((knee,i)=>{knee.rotation.x=swimming ? .35 + Math.max(0,gait*(i?-1:1))*.25 : seated?1.35:Math.max(0,gait*(i?-1:1))*.65;});
      fallback.arms.forEach((arm,i)=>{arm.rotation.x=swimming ? Math.sin(time*5.4 + i*Math.PI)*.85 : seated?-.95:-gait*(i?-.38:.38);});
      if (fallback.arms[0]) fallback.arms[0].rotation.z=-reaching*.72;
      gameRig?.update(delta, speed, seated, swimming, flying, jumping, motion);
      // Rotate the entire rendered character about the hips, never the camera/collider.
      visualRoot.rotation.x = -flip;
      visualRoot.position.set(0, .9 * (1 - Math.cos(flip)), .9 * Math.sin(flip));
      if (loaded && !mixer && !gameRig) {
        if (rig.leftLeg) rig.leftLeg.rotation.x = swimming ? gait*.24-.25 : seated ? -1.15 : gait*.42;
        if (rig.rightLeg) rig.rightLeg.rotation.x = swimming ? -gait*.24-.25 : seated ? -1.15 : -gait*.42;
        if (rig.leftArm) rig.leftArm.rotation.x = swimming ? Math.sin(time*5.4)*.72 : seated ? -.75 : -gait*.34;
        if (rig.rightArm) rig.rightArm.rotation.x = swimming ? Math.sin(time*5.4+Math.PI)*.72 : seated ? -.75 : gait*.34;
        if (rig.leftArm) rig.leftArm.rotation.z = -reaching*.55;
        if (rig.head) rig.head.rotation.y = Math.sin(time*.8)*.025;
      }
      // Native rigs and the optional fallback also articulate the knees during the flip.
      if (!gameRig && (motion.airborne || motion.crouch > 0)) {
        const bend = motion.airborne ? .30 + 1.95 * motion.tuck : 1.0 * motion.crouch;
        const hip = motion.airborne ? .18 + 1.35 * motion.tuck : .5 * motion.crouch;
        for (const leg of [rig.leftLeg, rig.rightLeg]) if (leg) leg.rotation.x = hip;
        for (const knee of [rig.leftKnee, rig.rightKnee]) if (knee) knee.rotation.x = -bend;
        for (const foot of [rig.leftFoot, rig.rightFoot]) if (foot) foot.rotation.x = bend - hip;
        fallback.legs.forEach(leg => { leg.rotation.x = hip; });
        fallback.knees.forEach(knee => { knee.rotation.x = -bend; });
      }
      const visual = loaded ?? fallback.root;
      if (!gameRig) visual.position.y = (loaded ? loadedBaseY : 0) + Math.sin(time*(swimming?2.8:1.7))*(swimming?.015:.003);
      if (!gameRig) visual.rotation.z = swimming ? Math.sin(time*2.1)*.035 : Math.sin(time*.75)*.004;
      equipment.update(time);
    }
  };
}
