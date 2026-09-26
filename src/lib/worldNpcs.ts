import * as THREE from "three";
import {
  applyMissionInteraction,
  createMissionState,
  missionInteraction,
  missionMessage,
  missionStatus,
  missionTarget,
  type MissionContext,
  type MissionPoint,
  type MissionTask,
} from "./worldNpcMissions.ts";

export const FORGE_WORKER_SOURCE = Object.freeze({
  repository: "teslaeco/Froge-MPC-2-test",
  commit: "bac2827fc1ec31e71dc0f5c586df43c507338725",
  path: "public/models/rapper-v10.glb",
  gitBlobSha: "25d3a7f62fb97844843e3007d498a3d93a927d42",
  sha256: "4b7e83d07723be958e7325f1cd7afc509ebc72d61a6357925c824ac716052adf",
  bytes: 10_343_368,
  url: "https://raw.githubusercontent.com/teslaeco/Froge-MPC-2-test/bac2827fc1ec31e71dc0f5c586df43c507338725/public/models/rapper-v10.glb",
  label: "Forge Worker · generic adult static example",
});

export type NpcTask = MissionTask;
export type NpcPlan = {
  id: string;
  task: NpcTask;
  from: { x: number; z: number };
  to: { x: number; z: number };
  offset: number;
};

const PLANS: NpcPlan[] = [
  // The first four are deliberately visible/reachable from the central hub on mobile.
  // Keep them clear of the five portal line at z≈2.7.
  { id: "forge-planter-east", task: "planting", from: { x: 28, z: -22 }, to: { x: 43, z: -29 }, offset: 0 },
  { id: "forge-builder-east", task: "building", from: { x: 31, z: 22 }, to: { x: 45, z: 30 }, offset: 4.5 },
  { id: "forge-carrier-west", task: "carrying", from: { x: -28, z: -23 }, to: { x: -44, z: -30 }, offset: 9 },
  { id: "forge-planter-west", task: "planting", from: { x: -31, z: 23 }, to: { x: -46, z: 33 }, offset: 2 },
  // Desktop keeps additional workers deeper in the new biomes.
  { id: "forge-builder-desert", task: "building", from: { x: 72, z: 38 }, to: { x: 106, z: 44 }, offset: 7 },
  { id: "forge-surveyor-coast", task: "surveying", from: { x: -74, z: 17 }, to: { x: -108, z: 9 }, offset: 11 },
  { id: "forge-carrier-coast", task: "carrying", from: { x: -66, z: -60 }, to: { x: -99, z: -72 }, offset: 14 },
];

export function forgeNpcPlans(mobile: boolean) {
  return PLANS.slice(0, mobile ? 4 : 7);
}

function npcMarker(task: NpcTask) {
  const root = new THREE.Group(); root.name = "forge-worker-visible-marker";
  const taskColor = task === "planting" ? "#8ee39a" : task === "building" ? "#ffcf72" : task === "carrying" ? "#90caf9" : "#ce93d8";
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(.42,.07,7,18),
    new THREE.MeshBasicMaterial({ color:taskColor, transparent:true, opacity:.92, depthWrite:false }),
  );
  halo.rotation.x=Math.PI/2; halo.position.y=2.62;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(.19,0),
    new THREE.MeshBasicMaterial({ color:"#fff4c7", transparent:true, opacity:.96, depthWrite:false }),
  );
  diamond.position.y=2.62;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(.018,.018,.72,6),
    new THREE.MeshBasicMaterial({ color:taskColor, transparent:true, opacity:.6, depthWrite:false }),
  );
  stem.position.y=2.22;
  root.add(halo,diamond,stem);
  return root;
}

function material(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: .04 });
}

function fallbackWorker(index: number) {
  const root = new THREE.Group(); root.name = "forge-worker-procedural-fallback";
  const skin = material(index % 2 ? "#b98062" : "#d3a27e");
  const cloth = material(index % 3 === 0 ? "#355f83" : index % 3 === 1 ? "#704a69" : "#536c45");
  const dark = material("#252b31");
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .72, 6, 10), cloth); body.position.y = 1.15; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.23, 12, 8), skin); head.position.y = 1.82; root.add(head);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .55, 4, 7), dark), legR = legL.clone();
  legL.name = "fallback-leg-left"; legR.name = "fallback-leg-right"; legL.position.set(-.14,.45,0); legR.position.set(.14,.45,0); root.add(legL,legR);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .48, 4, 7), skin), armR = armL.clone();
  armL.name = "fallback-arm-left"; armR.name = "fallback-arm-right"; armL.position.set(-.37,1.2,0); armR.position.set(.37,1.2,0); root.add(armL,armR);
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData.provenance = "PROCEDURAL_FALLBACK__FORGE_ASSET_PENDING";
  return root;
}

function taskProp(task: NpcTask) {
  const root = new THREE.Group(); root.name = "npc-task-" + task;
  if (task === "carrying") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(.6,.48,.5), material("#9a6f3f")); crate.position.set(0,1.05,.34); root.add(crate);
  } else if (task === "surveying") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.5,6), material("#d8e0d5")); pole.position.set(.35,.75,.2); root.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(.42,.23,.03), material("#ffcf72")); flag.position.set(.52,1.35,.2); root.add(flag);
  } else if (task === "planting") {
    const sapling = new THREE.Group(); sapling.name = "sapling";
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,.7,6), material("#6d4b31")); trunk.position.y=.35;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(.36,.72,7), material("#3f8d52")); crown.position.y=.9; sapling.add(trunk,crown); sapling.position.set(.55,0,.45); root.add(sapling);
  } else {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.15,.55,.45), material("#b38e69")); block.name="build-block"; block.position.set(.55,.28,.5); root.add(block);
  }
  root.traverse(o=>{ if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;} });
  return root;
}

function missionResult(task: NpcTask) {
  const root = new THREE.Group(); root.name = "field-mission-result-" + task; root.userData.provenance = "GAME_GENERATED_FIELD_MISSION_RESULT";
  if (task === "planting") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,1.6,7), material("#6d4b31")); trunk.position.y=.8;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(.85,1.8,9), material("#3f8d52")); crown.position.y=2.05;
    root.add(trunk,crown);
  } else if (task === "building") {
    for (let i=0;i<3;i++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.1,.5,.5), material(i === 2 ? "#65717c" : "#b38e69"));
      block.position.set((i-1)*.9,.25 + i*.48,0); root.add(block);
    }
  } else if (task === "carrying") {
    for (let i=0;i<3;i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(.65,.5,.58), material("#9a6f3f"));
      crate.position.set((i-1)*.58,.25 + (i===1?.5:0),0); root.add(crate);
    }
  } else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,2,7), material("#d8e0d5")); pole.position.y=1;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(.65,.3,.035), material("#ffcf72")); flag.position.set(.34,1.7,0);
    root.add(pole,flag);
  }
  root.traverse(o=>{ if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;} });
  return root;
}

type RuntimeNpc = {
  plan: NpcPlan;
  root: THREE.Group;
  visual: THREE.Group;
  prop: THREE.Group;
  mixer?: THREE.AnimationMixer;
};

function faceAlong(root: THREE.Object3D, dx: number, dz: number) {
  if (Math.abs(dx) + Math.abs(dz) > .001) root.rotation.y = Math.atan2(-dx, -dz);
}

export function createForgeNpcSystem(
  scene: THREE.Scene,
  mobile: boolean,
  groundAt: (x: number, z: number) => number,
  onStatus?: (value: string) => void,
  onMissionStatus?: (value: string) => void,
) {
  const root = new THREE.Group(); root.name = "forge-mpc2-living-workers"; root.userData.provenance = "FORGEMPC2_MIT__CC0_ANATOMY_COMPONENTS";
  const npcs: RuntimeNpc[] = forgeNpcPlans(mobile).map((plan,index) => {
    const npcRoot = new THREE.Group(); npcRoot.name = plan.id; npcRoot.position.set(plan.from.x,groundAt(plan.from.x,plan.from.z),plan.from.z);
    const visual = fallbackWorker(index), prop = taskProp(plan.task), marker = npcMarker(plan.task); npcRoot.add(visual,prop,marker); root.add(npcRoot);
    return { plan, root:npcRoot, visual, prop };
  });
  const missionResults = new THREE.Group(); missionResults.name = "field-mission-results"; root.add(missionResults);
  const marker = new THREE.Group(); marker.name = "field-mission-marker"; marker.visible = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(.8,1.15,28),
    new THREE.MeshBasicMaterial({ color:"#fff1a8", transparent:true, opacity:.9, side:THREE.DoubleSide, depthWrite:false }),
  );
  ring.rotation.x = -Math.PI/2; marker.add(ring);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(.04,.04,2.8,6),
    new THREE.MeshBasicMaterial({ color:"#fff4c7", transparent:true, opacity:.55, depthWrite:false }),
  );
  beacon.position.y=1.4; marker.add(beacon); root.add(marker);

  let missionState = createMissionState();
  const contexts = (): MissionContext[] => npcs.map(item => ({
    id:item.plan.id,
    task:item.plan.task,
    npc:{ x:item.root.position.x, z:item.root.position.z },
    target:item.plan.to,
  }));
  const publishMission = () => onMissionStatus?.(missionStatus(contexts(), missionState));
  const interactionAt = (point: MissionPoint) => missionInteraction(contexts(), missionState, point);
  const interact = (point: MissionPoint) => {
    const interaction = interactionAt(point);
    if (!interaction) return null;
    const wasComplete = interaction.kind === "complete";
    missionState = applyMissionInteraction(missionState, interaction);
    if (wasComplete) {
      const plan = npcs.find(item => item.plan.id === interaction.missionId)?.plan;
      if (plan && !missionResults.getObjectByName("mission-result-" + plan.id)) {
        const result = missionResult(plan.task); result.name = "mission-result-" + plan.id;
        result.position.set(plan.to.x, groundAt(plan.to.x,plan.to.z), plan.to.z);
        missionResults.add(result);
      }
    }
    publishMission();
    return missionMessage(interaction);
  };

  scene.add(root);
  let disposed = false;
  const abort = new AbortController();
  if (onStatus) onStatus("Forge workers: " + npcs.length + " GAME NPCs active · loading verified ForgeMPC2 character…");
  publishMission();

  const upgrade = async () => {
    try {
      const response = await fetch(FORGE_WORKER_SOURCE.url, { cache:"force-cache", credentials:"omit", redirect:"error", signal:abort.signal });
      if (!response.ok) throw new Error("Forge asset HTTP " + response.status);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== FORGE_WORKER_SOURCE.bytes) throw new Error("Forge asset size mismatch: " + bytes.byteLength);
      const header = new DataView(bytes,0,12);
      if (header.getUint32(0,true)!==0x46546c67 || header.getUint32(4,true)!==2 || header.getUint32(8,true)!==bytes.byteLength) throw new Error("Forge asset is not a complete GLB");
      if (globalThis.crypto?.subtle) {
        const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
        if (digest !== FORGE_WORKER_SOURCE.sha256) throw new Error("Forge asset SHA-256 mismatch");
      }
      const loaderModule = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const skeletonModule = await import("three/examples/jsm/utils/SkeletonUtils.js");
      const gltf = await new loaderModule.GLTFLoader().parseAsync(bytes, "");
      if (disposed) return;
      const source = gltf.scene; source.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(source), size = box.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= .1) throw new Error("Forge asset bounds are invalid");
      const scale = 1.78 / size.y;
      for (const [index,npcItem] of npcs.entries()) {
        const clone = skeletonModule.clone(source) as THREE.Group;
        clone.name = "forge-worker-v10-generic-adult";
        clone.scale.setScalar(scale); clone.updateMatrixWorld(true);
        const cloneBounds = new THREE.Box3().setFromObject(clone);
        clone.position.y -= cloneBounds.min.y;
        clone.userData.provenance = "FORGEMPC2_STATIC_V10__MIT__GENERIC_ADULT_NOT_LIKENESS";
        clone.traverse(o=>{ if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;} });
        npcItem.root.remove(npcItem.visual); npcItem.visual = clone; npcItem.root.add(clone);
        if (gltf.animations.length) {
          npcItem.mixer = new THREE.AnimationMixer(clone);
          npcItem.mixer.clipAction(gltf.animations[index % gltf.animations.length]).play();
        }
      }
      if (onStatus) onStatus("Forge workers: " + npcs.length + " verified ForgeMPC2 generic-adult NPCs active · GAME");
    } catch (error) {
      if (disposed || abort.signal.aborted) return;
      console.warn("[WORLDIFACT Forge workers]", error);
      if (onStatus) onStatus("Forge workers: " + npcs.length + " GAME NPCs active with procedural fallback · ForgeMPC2 asset unavailable");
    }
  };
  const loadTimer = setTimeout(() => { void upgrade(); }, mobile ? 3_000 : 2_000);

  const update = (elapsed:number, dt:number) => {
    for (const [index,npcItem] of npcs.entries()) {
      const cycle = 18, local = (elapsed + npcItem.plan.offset) % cycle;
      const a=npcItem.plan.from,b=npcItem.plan.to;
      let t=0, working=false, dx=b.x-a.x,dz=b.z-a.z;
      if(local<6){t=THREE.MathUtils.smoothstep(local/6,0,1);}
      else if(local<11){t=1;working=true;}
      else if(local<17){t=1-THREE.MathUtils.smoothstep((local-11)/6,0,1);dx=-dx;dz=-dz;}
      else t=0;
      const px=THREE.MathUtils.lerp(a.x,b.x,t), pz=THREE.MathUtils.lerp(a.z,b.z,t);
      npcItem.root.position.set(px,groundAt(px,pz),pz);
      faceAlong(npcItem.root,dx,dz);
      npcItem.visual.position.y = working ? Math.sin(elapsed*2+index)*.015 : Math.abs(Math.sin(elapsed*6+index))*.035;
      npcItem.visual.rotation.z = working ? Math.sin(elapsed*2.4+index)*.035 : 0;
      const armL=npcItem.visual.getObjectByName("fallback-arm-left"),armR=npcItem.visual.getObjectByName("fallback-arm-right");
      if(armL)armL.rotation.x=working?-.8:Math.sin(elapsed*6+index)*.55;
      if(armR)armR.rotation.x=working?-.65:-Math.sin(elapsed*6+index)*.55;
      npcItem.prop.visible = working || npcItem.plan.task==="carrying";
      if(npcItem.plan.task==="planting"){
        const sapling=npcItem.prop.getObjectByName("sapling"); if(sapling) sapling.scale.setScalar(working ? .35+.65*THREE.MathUtils.smoothstep((local-6)/5,0,1) : .25);
      } else if(npcItem.plan.task==="building"){
        const block=npcItem.prop.getObjectByName("build-block"); if(block) block.scale.y=working?.5+.5*THREE.MathUtils.smoothstep((local-6)/5,0,1):.35;
      } else if(npcItem.plan.task==="carrying"){
        npcItem.prop.visible=!working;
      }
      if(npcItem.mixer) npcItem.mixer.update(dt);
    }
    const target = missionTarget(contexts(), missionState);
    marker.visible = !!target;
    if (target) {
      marker.position.set(target.x, groundAt(target.x,target.z) + .04, target.z);
      const pulse = 1 + Math.sin(elapsed * 3.2) * .12;
      ring.scale.setScalar(pulse);
      ring.rotation.z = elapsed * .65;
      beacon.material.opacity = .42 + Math.sin(elapsed * 2.4) * .16;
    }
  };

  return {
    root,
    update,
    interactionAt,
    interact,
    missionStatus: () => missionStatus(contexts(), missionState),
    dispose(){
      disposed=true; abort.abort(); clearTimeout(loadTimer); root.removeFromParent();
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
      root.traverse(o=>{
        if(o instanceof THREE.Mesh)geometries.add(o.geometry);
        if(o instanceof THREE.Mesh) for(const mat of Array.isArray(o.material)?o.material:[o.material]) materials.add(mat);
      });
      for(const mat of materials)for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);
      for(const texture of textures)texture.dispose(); for(const geometry of geometries)geometry.dispose(); for(const mat of materials)mat.dispose();
    },
  };
}
