import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PORTALS } from "../config/portals";
import { meadowBlueprint } from "../lib/blueprint";
import type { WorldBlueprint, WorldObject } from "../lib/blueprint";
import { avoidVehicleBodies, findRoverExit, movePlayer } from "../lib/movement";
import { movementAxes, STILL } from "../lib/gameControls";
import type { MoveAxes } from "../lib/gameControls";
import { enteredPortal, nearestPortal, PORTAL_RADIUS } from "../lib/portalNavigation";
import { createLakeEnvironment } from "../lib/lakeEnvironment";
import { createPlayerAvatar, type AvatarChoice } from "../lib/playerAvatar";
import { avatarProgressLabel, subscribeAvatarProgress, type AvatarProgress } from "../lib/avatarAsset";
import { createFanDrone, nextEquipmentMode, type EquipmentMode, type OutfitPreset } from "../lib/playerEquipment";
import { fallingBodyY, FLIGHT_BODY_Y, FLIGHT_SPEED, inRiver, nextWaterMode, SWIM_SPEED, swimBodyY, WATER_LEVEL, type WaterMode } from "../lib/waterPhysics";
import { createWorldAudio, worldAudioTheme } from "../lib/worldAudio";
import { clonePortalSculpture, loadPortalSculpture, rotatePortalSculpture } from "../lib/portalSculpture";
import TouchJoystick from "./TouchJoystick";
import { createJumpState, requestJump, resetJump, stepJump, jumpFlipAngle, jumpAnimation } from "../lib/playerJump";
import { createMeadowGrass, createMeadowTexture, updateMeadowGrass } from "../lib/meadowGrass";
import { WALK_SPEED } from "../lib/avatarPose";
import { createSandField, createSoilLoad, inDesert } from "../lib/desertTerrain";
import { excavationCamera } from "../lib/excavationCamera";
import { createDesertScene, meadowGroundGeometry } from "../lib/desertScene";
import { createBackhoe, type DigTool } from "../lib/backhoe";
import { parseRim, mountRim } from "../lib/vehicleRims";
import {
  GIANT_BUILDING_ENTRANCE,
  GIANT_INTERIOR_FLOOR_Y,
  GIANT_INTERIOR_SPAWN,
  clampGiantInterior,
  createGiantBuildingEntrance,
  createGiantBuildingInterior,
  loadGiantBuilding,
  nearGiantBuildingEntrance,
  nearGiantInteriorExit,
  resolveGiantBuildingCollision,
} from "../lib/giantBuilding";
import {
  OWNER_VEHICLE_CAMERA_SCALE,
  OWNER_VEHICLE_DRIVE_SCALE,
  OWNER_VEHICLE_EXIT_OFFSET,
  OWNER_VEHICLE_HALF_X,
  OWNER_VEHICLE_HALF_Z,
  OWNER_VEHICLE_RUNTIME_ID,
  OWNER_VEHICLE_SEAT_OFFSET,
  OWNER_VEHICLE_SPEED,
  OWNER_VEHICLE_TURN_SPEED,
  loadOwnerVehicle,
  resolveOwnerVehicleCollision,
} from "../lib/ownerVehicle";
import "./WorldMovement.css";
import {
  createDecorativeTerrain,
  createWorldObject,
  disposeObject,
  updateWorldObject,
} from "../lib/worldGeometry";
interface Props {
  onPortalOpen: (id: string) => void;
  blueprint?: WorldBlueprint;
  activePortalId?: string;
}
const START = meadowBlueprint();
interface RuntimeObject {
  spec: WorldObject;
  group: THREE.Group;
  doorOpen: boolean;
}
export default function StartingWorld({
  onPortalOpen,
  blueprint = START,
  activePortalId,
}: Props) {
  const mount = useRef<HTMLDivElement>(null),
    input = useRef<Record<string, boolean>>({}),
    action = useRef(""),
    jumpRequests = useRef(0),
    runtimeObjects = useRef<RuntimeObject[]>([]);
  const audio = useRef<ReturnType<typeof createWorldAudio> | null>(null);
  const audioEnabled = useRef(false);
  const zoom = useRef(4.8);
  const overview = useRef(false);
  const [music, setMusic] = useState(false);
  const [avatarChoice, setAvatarChoice] = useState<AvatarChoice>("queen");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [outfit, setOutfit] = useState<OutfitPreset>("original");
  const outfitRef = useRef<OutfitPreset>("original");
  const [equipmentStatus, setEquipmentStatus] = useState<EquipmentMode>("stowed");
  const [transition, setTransition] = useState(false);
  const [captureNotice, setCaptureNotice] = useState("");
  const [wide, setWide] = useState(false);
  const [zoomValue, setZoomValue] = useState(4.8);
  const [jumpCount, setJumpCount] = useState(0);
  const [vehicleHud, setVehicleHud] = useState({ enabled: false, tool: "loader", action: "carry", load: 0, capacity: 1600, status: "Ready" });
  const [rimStatus, setRimStatus] = useState("Original Astra rim: file not linked. Load the original GLB; no screenshot substitute.");
  const sandSession = useRef<{ key: string; field: ReturnType<typeof createSandField>; loads: Map<string, { load: ReturnType<typeof createSoilLoad>; enabled: boolean; tool: DigTool }> } | null>(null);
  const rimSource = useRef<THREE.Object3D | null>(null);
  const rimInstaller = useRef<((model: THREE.Object3D) => void) | null>(null);
  const rimEpoch = useRef(0);
  useEffect(() => () => { rimEpoch.current++; if (rimSource.current) disposeObject(rimSource.current); rimSource.current = null; }, []);
  const importRim = async (file: File | undefined) => {
    if (!file) return;
    const epoch = ++rimEpoch.current;
    let model: THREE.Object3D | null = null;
    try {
      if (!/\.glb$/i.test(file.name) || file.size > 30 * 1024 * 1024) throw new Error("Choose the original embedded GLB rim, up to 30 MB.");
      setRimStatus("Validating original rim…");
      model = await parseRim(await file.arrayBuffer());
      if (epoch !== rimEpoch.current) { disposeObject(model); return; }
      rimInstaller.current?.(model);
      if (rimSource.current) disposeObject(rimSource.current);
      rimSource.current = model; model = null;
      setRimStatus(`Owner-provided rim: ${file.name}. Original geometry retained; provider not independently verified.`);
    } catch (error) {
      if (model) disposeObject(model);
      if (epoch === rimEpoch.current) setRimStatus(error instanceof Error ? error.message : "The rim could not be loaded.");
    }
  };
  const capture = useRef<(() => void) | null>(null);
  const avatarRuntime = useRef<ReturnType<typeof createPlayerAvatar> | null>(null);
  useEffect(() => {
    if (!captureNotice) return;
    const timer = setTimeout(() => setCaptureNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [captureNotice]);
  useEffect(() => { outfitRef.current = outfit; avatarRuntime.current?.setOutfit(outfit); }, [outfit]);
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
  const toggleMusic = async () => {
    try {
      audio.current ??= createWorldAudio(worldAudioTheme(activePortalId));
      const next = !audioEnabled.current;
      await audio.current.setPlaying(next);
      audioEnabled.current = next; setMusic(next);
    } catch { setCaptureNotice("Audio is unavailable in this browser."); }
  };
  const stick = useRef<MoveAxes>({ ...STILL });
  const onStickMove = useCallback((axes: MoveAxes) => { stick.current = axes; }, []);
  const latestBlueprint = useRef(blueprint);
  const open = useRef(onPortalOpen);
  useEffect(() => {
    open.current = onPortalOpen;
  }, [onPortalOpen]);
  const [failed, setFailed] = useState(false),
    [ready, setReady] = useState(false),
    [driving, setDriving] = useState(false);
  const [avatarState, setAvatarState] = useState<"loading" | "ready" | "error">("loading");
  const [avatarAttempt, setAvatarAttempt] = useState(0);
  const [avatarProgress, setAvatarProgress] = useState<AvatarProgress | null>(null);
  useEffect(() => subscribeAvatarProgress(avatarChoice, setAvatarProgress), [avatarChoice, avatarAttempt]);
  const [textureFailed, setTextureFailed] = useState(false);
  const [sculptureFailed, setSculptureFailed] = useState(false);
  const [buildingStatus, setBuildingStatus] = useState("Giant tower: queued");
  const [ownerVehicleStatus, setOwnerVehicleStatus] = useState("Mars solar landship: queued");
  const [insideGiantBuilding, setInsideGiantBuilding] = useState(false);
  const [interaction, setInteraction] = useState("Interact");
  const [hint, setHint] = useState(
      "Walk onto a glowing water portal to enter.",
    ),
    [location, setLocation] = useState("Riverlight meadow");
  const sceneStructure = `${blueprint.biome}:${blueprint.objects
    .map((o) => `${o.id}:${o.kind}`)
    .join(",")}`;
  useEffect(() => {
    latestBlueprint.current = blueprint;
  }, [blueprint]);
  useEffect(() => {
    if (!mount.current) return;
    const host = mount.current;
    const mobile = matchMedia("(pointer: coarse)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !mobile });
      renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    queueMicrotask(() => {
      setFailed(false);
      setReady(false);
      setDriving(false);
      setTextureFailed(false);
      setSculptureFailed(false);
      setBuildingStatus("Giant tower: queued");
      setOwnerVehicleStatus("Mars solar landship: queued");
      setInsideGiantBuilding(false);
    });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute(
      "aria-label",
      "3D world. Drag to look, use the joystick or W A S D to move, and walk onto a water portal to enter.",
    );
    renderer.domElement.style.touchAction = "none";
    const sceneBlueprint = latestBlueprint.current,
      scene = new THREE.Scene(),
      lunar = sceneBlueprint.biome === "lunar",
      sea = sceneBlueprint.biome === "ocean";
    scene.background = new THREE.Color(
      lunar ? "#172842" : sea ? "#7487bb" : "#a1c8cf",
    );
    scene.fog = new THREE.Fog(scene.background, 40, 155);
    const camera = new THREE.PerspectiveCamera(
      60,
      host.clientWidth / host.clientHeight,
      0.1,
      240,
    );
    scene.add(
      new THREE.HemisphereLight("#fff5db", lunar ? "#253449" : "#294437", 2.3),
    );
    const sun = new THREE.DirectionalLight("#ffe9bc", 3);
    sun.position.set(30, 55, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
    Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
    sun.shadow.bias = -.0004;
    scene.add(sun);
    const environment = lunar ? null : createLakeEnvironment(scene, mobile, () => setTextureFailed(true), sea);
    if (!lunar && !sea && sandSession.current?.key !== sceneStructure) sandSession.current = { key: sceneStructure, field: createSandField(), loads: new Map() };
    const sandField = !lunar && !sea ? sandSession.current!.field : null;
    const desert = sandField ? createDesertScene(sandField) : null;
    if (desert) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192
    const ctx=canvas.getContext('2d')
    if(ctx){
      ctx.fillStyle='#213342';ctx.fillRect(0,0,512,192);ctx.textAlign='center'
      ctx.fillStyle='#ffe3a7';ctx.font='bold 36px sans-serif';ctx.fillText('DESERT WORKSITE',256,65)
      ctx.fillStyle='#ffffff';ctx.font='24px sans-serif';ctx.fillText('Drive · lower bucket · collect · dump',256,111)
      ctx.font='20px sans-serif';ctx.fillText('GAME terrain · changes last in this session',256,156)
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:true,depthWrite:false}))
      label.position.set(39,1.5,37);label.scale.set(2.8,1.05,1);desert.root.add(label)
    }
  }
    const grass = !lunar && !sea ? createMeadowGrass(mobile) : null;
    const groundAt = (x: number, z: number) => sandField?.heightAt(x, z) ?? 0;
    if (!sea) {
      const ground = new THREE.Mesh(
        lunar ? new THREE.PlaneGeometry(230, 230) : meadowGroundGeometry(),
        new THREE.MeshStandardMaterial({ color: lunar ? "#626874" : "#ffffff", map: lunar ? null : createMeadowTexture(), roughness: 1 }),
      );
      if (lunar) ground.rotation.x = -Math.PI / 2;
      ground.name = lunar ? "lunar-ground" : "green-meadow";
      ground.receiveShadow = true; scene.add(ground);
      if (grass) scene.add(grass);
      if (desert) scene.add(desert.root);
    }
    if (lunar) {
      scene.add(createDecorativeTerrain(Array.from({ length: 32 }, (_, i) => ({
        id: `lunar-rock-${i}`, kind: "rock", name: "Lunar rock",
        x: Math.sin(i * 2.4) * (48 + i % 8), z: Math.cos(i * 2.4) * (48 + i % 8),
        scale: 1.5 + i % 4, rotation: i * 19, color: "#7c8992",
      }))));
    } else if (!sea) {
      const trees: WorldObject[] = [];
      for (let i = 0; i < 65; i++) {
        const x = ((i * 31) % 125) - 62, z = ((i * 47) % 120) - 60;
        if (Math.abs(z) < 10 || (Math.abs(x) < 24 && Math.abs(z) < 32) || inDesert(x, z, 1)) continue;
        trees.push({ id: `valley-tree-${i}`, kind: "tree", name: "Valley flora", x, z, scale: 0.6 + i % 5 * 0.2, rotation: i * 17 % 360, color: i % 2 ? "#2e674d" : "#45754c" });
      }
      scene.add(createDecorativeTerrain(trees));
    }
    const objects: RuntimeObject[] = sceneBlueprint.objects.map((o) => ({
      spec: o,
      group: createWorldObject(o),
      doorOpen: false,
    }));
    const specOf = (runtime: RuntimeObject) =>
      latestBlueprint.current.objects.find((o) => o.id === runtime.spec.id) ??
      runtime.spec;
    runtimeObjects.current = objects;
    for (const o of objects) scene.add(o.group);

    // The owner's source GLB is represented in-browser by a bounded GAME-optimized
    // derivative. Its exterior is loaded after the core world/avatar so this
    // 3D landmark cannot delay the five portals or Queen startup.
    const giantEntrance = !lunar && !sea ? createGiantBuildingEntrance() : null;
    const giantInterior = !lunar && !sea ? createGiantBuildingInterior() : null;
    if (giantEntrance) scene.add(giantEntrance);
    if (giantInterior) scene.add(giantInterior);
    let giantBuildingDisposed = false;
    const giantBuildingLoadTimer = giantEntrance ? window.setTimeout(() => {
      queueMicrotask(() => setBuildingStatus("Giant tower: loading owner model…"));
      void (async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const root = await loadGiantBuilding();
            if (giantBuildingDisposed) { disposeObject(root); return; }
            scene.add(root);
            queueMicrotask(() => setBuildingStatus("Giant tower: higher-fidelity owner model ready · GAME"));
            return;
          } catch (error) {
            lastError = error;
            if (attempt === 0 && !giantBuildingDisposed) {
              queueMicrotask(() => setBuildingStatus("Giant tower: retrying exterior load…"));
              await new Promise(resolve => window.setTimeout(resolve, 850));
            }
          }
        }
        console.error("[WORLDIFACT Giant Tower]", lastError);
        if (!giantBuildingDisposed) {
          const reason = lastError instanceof Error ? lastError.message.replace(/^Giant building GAME /, "").slice(0, 90) : "load failed";
          queueMicrotask(() => setBuildingStatus(`Giant tower exterior unavailable · ${reason} · generated GAME interior remains accessible`));
        }
      })();
    }, mobile ? 900 : 450) : undefined;
    if (!giantEntrance) queueMicrotask(() => setBuildingStatus("Giant tower is available in the valley world"));

    // The owner's second supplied vehicle is a static GAME model until a reviewed
    // rig/drive setup exists. Load it separately so it cannot delay the Queen,
    // portals, or the existing photovoltaic explorer.
    let ownerVehicleDisposed = false;
    let ownerVehicleRuntime: RuntimeObject | null = null;
    const ownerVehicleLoadTimer = !lunar && !sea ? window.setTimeout(() => {
      queueMicrotask(() => setOwnerVehicleStatus("Mars solar landship: loading owner model…"));
      void loadOwnerVehicle().then(root => {
        if (ownerVehicleDisposed) { disposeObject(root); return; }
        const runtime: RuntimeObject = {
          spec: {
            id: OWNER_VEHICLE_RUNTIME_ID,
            kind: "rover",
            name: "Mars solar landship",
            x: root.position.x,
            z: root.position.z,
            scale: OWNER_VEHICLE_DRIVE_SCALE,
            rotation: THREE.MathUtils.radToDeg(root.rotation.y),
            color: "#6f7881",
          },
          group: root,
          doorOpen: false,
        };
        ownerVehicleRuntime = runtime;
        objects.push(runtime);
        runtimeObjects.current = objects;
        scene.add(root);
        queueMicrotask(() => setOwnerVehicleStatus("Mars solar landship: owner model ready · DRIVEABLE GAME vehicle"));
      }).catch(error => {
        console.error("[WORLDIFACT owner landship]", error);
        if (!ownerVehicleDisposed) queueMicrotask(() => setOwnerVehicleStatus("Mars solar landship unavailable · existing world remains playable"));
      });
    }, mobile ? 1_350 : 700) : undefined;
    if (lunar || sea) queueMicrotask(() => setOwnerVehicleStatus("Mars solar landship is available in the valley world"));

    const backhoes = new Map(objects.filter(o => specOf(o).kind === "rover").map(o => {
      const saved = sandSession.current?.loads.get(o.spec.id);
      const load = saved?.load ?? createSoilLoad();
      return [o, createBackhoe(o.group, load, saved)];
    }));
    let rimMounts: ReturnType<typeof mountRim>[] = [];
    rimInstaller.current = model => {
      const next: ReturnType<typeof mountRim>[] = [];
      try { for (const car of backhoes.keys()) next.push(mountRim(car.group, model)); }
      catch (error) { next.forEach(mount => mount.dispose()); throw error; }
      rimMounts.forEach(mount => mount.dispose()); rimMounts = next;
      for (const car of backhoes.keys()) car.group.traverse(child => { if (child.name === "stock-wheel-disc" || child.name === "stock-wheel-hub") child.visible = false; });
    };
    if (rimSource.current) rimInstaller.current(rimSource.current);
    const isOwnerVehicle = (car: RuntimeObject | null | undefined) => car?.spec.id === OWNER_VEHICLE_RUNTIME_ID;
    const worldOffset = (car: RuntimeObject, offset: { x: number; y: number; z: number }, scaleOffset = true) => {
      const v = new THREE.Vector3(offset.x, offset.y, offset.z);
      if (scaleOffset) v.multiplyScalar(specOf(car).scale);
      return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.group.rotation.y).add(car.group.position);
    };
    const vehicleSeatWorld = (car: RuntimeObject) => isOwnerVehicle(car)
      ? worldOffset(car, OWNER_VEHICLE_SEAT_OFFSET, false)
      : worldOffset(car, { x: -.55, y: .26, z: .1 });
    const vehicleOutsideWorld = (car: RuntimeObject) => isOwnerVehicle(car)
      ? worldOffset(car, OWNER_VEHICLE_EXIT_OFFSET, false)
      : worldOffset(car, { x: -2.15, y: 0, z: .25 });
    const vehicleGround = (car: RuntimeObject, x: number, z: number, rotation: number) => {
      const offsets = isOwnerVehicle(car)
        ? [-1, 1].flatMap(side => [-1, 1].map(front => ({ x: side * OWNER_VEHICLE_HALF_X * .82, z: front * OWNER_VEHICLE_HALF_Z * .78 })))
        : [-1, 1].flatMap(side => [-1.55, 1.55].map(wz => ({ x: side * 1.4 * specOf(car).scale, z: wz * specOf(car).scale })));
      const heights = offsets.map(offset => groundAt(
        x + Math.cos(rotation) * offset.x + Math.sin(rotation) * offset.z,
        z - Math.sin(rotation) * offset.x + Math.cos(rotation) * offset.z,
      ));
      return { y: Math.max(...heights), spread: Math.max(...heights) - Math.min(...heights) };
    };
    const portals = PORTALS.map((p, i) => {
      const g = new THREE.Group();
      g.position.set(p.position.x, 0.08, p.position.z);
      g.userData.portalId = p.id;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(PORTAL_RADIUS, 0.065, 8, 64),
        new THREE.MeshStandardMaterial({
          color: p.color,
          emissive: p.color,
          emissiveIntensity: 1.2,
          metalness: 0.4,
          roughness: 0.2,
        }),
      );
      rim.rotation.x = -Math.PI / 2;
      g.add(rim);
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(PORTAL_RADIUS - 0.07, 64),
        new THREE.MeshBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      face.rotation.x = -Math.PI / 2;
      g.add(face);
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(PORTAL_RADIUS + 0.16, PORTAL_RADIUS + 0.2, 64),
        new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
      );
      ripple.rotation.x = -Math.PI / 2;
      g.add(ripple);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 160;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "rgba(6, 22, 32, 0.9)";
      ctx.beginPath();
      ctx.roundRect(4, 4, 504, 152, 22);
      ctx.fill();
      ctx.fillStyle = "#f1f6ee";
      ctx.textAlign = "center";
      ctx.font = "600 38px sans-serif";
      ctx.fillText(p.shortTitle, 256, 68);
      ctx.fillStyle = p.color;
      ctx.font = "500 24px sans-serif";
      ctx.fillText(p.id === activePortalId ? "YOU ARE HERE" : "WALK IN TO OPEN", 256, 120);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          depthTest: true,
          depthWrite: false,
        }),
      );
      label.scale.set(3.7, 1.16, 1);
      label.position.y = 2.4;
      g.add(label);
      scene.add(g);
      return { g, face, ripple, i, id: p.id, sculpture: undefined as THREE.Group | undefined };
    });
    let sculptureDisposed = false;
    // All five beacons reuse the owner's exact open-frame Forge geometry.
    void loadPortalSculpture([PORTALS[0].color, "#53baff"], 1.8).then(original => {
      if (sculptureDisposed) { disposeObject(original); return; }
      for (const [index, portal] of portals.entries()) {
        const color = PORTALS[index].color;
        const accent = `#${new THREE.Color(color).offsetHSL(.04, .22, -.07).getHexString()}`;
        const sculpture = index === 0 ? original : clonePortalSculpture(original, [color, accent]);
        sculpture.position.y = 4.25;
        rotatePortalSculpture(sculpture, 0, index * .35);
        portal.sculpture = sculpture;
        portal.g.add(sculpture);
      }
    }).catch(() => { if (!sculptureDisposed) setSculptureFailed(true); });
    const avatar = createPlayerAvatar(avatarChoice, state => queueMicrotask(() => { if (!sculptureDisposed) setAvatarState(state); }));
    avatarRuntime.current = avatar;
    avatar.setOutfit(outfitRef.current);
    avatar.setFlightFans(false);
    queueMicrotask(() => setEquipmentStatus("stowed"));
    scene.add(avatar.root);
    const fanDrone = createFanDrone();
    scene.add(fanDrone.root);
    let equipmentMode: EquipmentMode = "stowed";
    let waterMode: WaterMode = "land";
    let waterEnteredAt = 0;
    type Splash = { ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; drops: { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; velocity: THREE.Vector3 }[]; age: number };
    const splashes: Splash[] = [];
    const splashAt = (x: number, z: number, strength = 1) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(.24, .34, 24),
        new THREE.MeshBasicMaterial({ color: "#d8fbff", transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, WATER_LEVEL + .035, z);
      scene.add(ring);
      const drops: Splash["drops"] = [];
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2;
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(.035 + (i % 3) * .009, 6, 5),
          new THREE.MeshBasicMaterial({ color: "#d8fbff", transparent: true, opacity: .9 }),
        );
        mesh.position.set(x, WATER_LEVEL + .08, z);
        scene.add(mesh);
        drops.push({ mesh, velocity: new THREE.Vector3(Math.cos(angle) * (1.1 + i % 4 * .16) * strength, (2.4 + i % 3 * .28) * strength, Math.sin(angle) * (1.1 + i % 4 * .16) * strength) });
      }
      splashes.push({ ring, drops, age: 0 });
    };
    const updateSplashes = (dt: number) => {
      for (let i = splashes.length - 1; i >= 0; i--) {
        const splash = splashes[i];
        splash.age += dt;
        splash.ring.scale.setScalar(1 + splash.age * 3.8);
        splash.ring.material.opacity = Math.max(0, .82 * (1 - splash.age / .75));
        for (const drop of splash.drops) {
          drop.velocity.y -= 7.8 * dt;
          drop.mesh.position.addScaledVector(drop.velocity, dt);
          drop.mesh.material.opacity = Math.max(0, .9 * (1 - splash.age / .8));
        }
        if (splash.age > .82) {
          scene.remove(splash.ring); splash.ring.geometry.dispose(); splash.ring.material.dispose();
          for (const drop of splash.drops) { scene.remove(drop.mesh); drop.mesh.geometry.dispose(); drop.mesh.material.dispose(); }
          splashes.splice(i, 1);
        }
      }
    };
    let boarding: { car: RuntimeObject; from: THREE.Vector3; outside: THREE.Vector3; seat: THREE.Vector3; time: number; exiting: boolean } | null = null;
    const player = new THREE.Vector3(0, 2.3, 17),
      forward = new THREE.Vector3(),
      right = new THREE.Vector3(),
      target = new THREE.Vector3(),
      cameraGoal = new THREE.Vector3(),
      cameraAim = new THREE.Vector3();
    const jump = createJumpState();
    let flightHeight = 0, shownJumps = -1, cameraInitialized = false;
    let vehicleViewYaw = 0;
    let yaw = 0,
      pitch = -0.16,
      ride: (typeof objects)[number] | null = null,
      frame = 0,
      previous = performance.now(),
      hud = 0,
      elapsed = 0;
    let contextLost = false;
    let navigating = false;
    let insideBuilding = false;
    let navigationTimer: ReturnType<typeof setTimeout> | undefined;
    let drag: { id: number; x: number; y: number; moved: number } | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clear = () => {
      input.current = {};
      stick.current = { ...STILL };
      action.current = "";
      jumpRequests.current = 0;
      for (const machine of backhoes.values()) machine.setAction("carry");
      drag = null;
    };
    const enter = (id: string) => {
      if (navigating || id === activePortalId) return;
      navigating = true;
      clear();
      setReady(false);
      setTransition(true);
      if (audioEnabled.current) audio.current?.portal();
      navigationTimer = setTimeout(() => open.current(id), reduced ? 0 : 520);
    };
    const visibility = () => {
      clear();
      void audio.current?.setPlaying(audioEnabled.current && !document.hidden).catch(() => {});
    };
    capture.current = () => {
      try {
        renderer.render(scene, camera);
        renderer.domElement.toBlob(blob => {
          if (!blob || contextLost) return;
          const url = URL.createObjectURL(blob), link = document.createElement('a');
          link.href = url; link.download = `WORLDIFACT-${sceneBlueprint.biome}.png`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          setCaptureNotice("Current world image saved.");
        }, 'image/png');
      } catch { setCaptureNotice("This browser could not save the current view."); }
    };
    const wheelZoom = (event: WheelEvent) => {
      event.preventDefault();
      zoom.current = THREE.MathUtils.clamp(zoom.current + Math.sign(event.deltaY), 3, 24);
      setZoomValue(zoom.current);
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return;
      const k = e.key.toLowerCase();
      // Focused DOM controls keep their native Space activation (one press, not two).
      if (k === " " && e.target instanceof HTMLButtonElement) return;
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "e",
          "f",
          "g",
          "i",
          " ",
        ].includes(k)
      ) {
        e.preventDefault();
        input.current[k] = true;
      }
      if (k === "e" && !e.repeat) action.current = "interact";
      if (k === "f" && !e.repeat) action.current = "fan-drone";
      if (k === "g" && !e.repeat) action.current = "fan-flight";
      if (k === "i" && !e.repeat) setInventoryOpen(value => !value);
      if (k === " " && !e.repeat) jumpRequests.current = Math.min(2, jumpRequests.current + 1);
      if (k === "escape") action.current = equipmentMode === "drone" || equipmentMode === "flight" ? "fan-stow" : "exit";
    };
    const up = (e: KeyboardEvent) => {
      input.current[e.key.toLowerCase()] = false;
    };
    const pointerDown = (e: PointerEvent) => {
      if (drag || navigating || (e.pointerType === "mouse" && e.button !== 0)) return;
      renderer.domElement.focus({ preventScroll: true });
      renderer.domElement.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    };
    const pointerMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      // Looking around a parked excavator must NOT turn the chassis or move its bucket.
      if (ride) vehicleViewYaw -= dx * 0.003;
      else yaw -= dx * 0.003;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -0.8, 0.6);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const pointerUp = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const tap = drag.moved < 8;
      drag = null;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
      if (!tap) return;
      const rect = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(
        portals.filter(p => p.id !== activePortalId).map((p) => p.g),
        true,
      )[0];
      if (hit && hit.distance < 45) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.portalId) o = o.parent;
        if (o) enter(o.userData.portalId);
      }
    };
    const cancelLook = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    const lost = (e: Event) => {
      e.preventDefault();
      if (contextLost) return;
      contextLost = true;
      cancelAnimationFrame(frame);
      setReady(false);
      setFailed(true);
      clear();
    };
    const restored = () => {
      if (!contextLost) return;
      contextLost = false;
      previous = performance.now();
      setFailed(false);
      setReady(true);
      frame = requestAnimationFrame(animate);
    };
    renderer.domElement.addEventListener("wheel", wheelZoom, { passive: false });
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", cancelLook);
    renderer.domElement.addEventListener("lostpointercapture", cancelLook);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.domElement.addEventListener("webglcontextrestored", restored);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    const resize = new ResizeObserver(() => {
      if (host.clientWidth && host.clientHeight) {
        camera.aspect = host.clientWidth / host.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(host.clientWidth, host.clientHeight);
      }
    });
    resize.observe(host);
    function animate(now: number) {
      if (contextLost || navigating) return;
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      elapsed += dt;
      const axes = movementAxes(input.current, stick.current);
      const waitingForQueen = avatarChoice === "queen" && !avatar.root.userData.avatarLoaded;
      const operating = ride ? backhoes.get(ride) : undefined;
      const movingBucket = operating?.enabled && operating.action !== "carry";
      const move = waitingForQueen || boarding || overview.current || movingBucket || jump.preparation > 0 ? 0 : axes.forward;
      const side = waitingForQueen || boarding || overview.current || movingBucket || jump.preparation > 0 ? 0 : axes.side;
      const controllingDrone = equipmentMode === "drone";
      const canJump = !waitingForQueen && !boarding && !ride && !overview.current && equipmentMode === "stowed" && waterMode === "land" && flightHeight < .05;
      if (!canJump) resetJump(jump);
      for (let presses = jumpRequests.current; presses > 0; presses--) requestJump(jump, canJump);
      jumpRequests.current = 0;
      stepJump(jump, dt);
      if (ride) yaw -= side * dt * (isOwnerVehicle(ride) ? OWNER_VEHICLE_TURN_SPEED : 1.25);
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const old = player.clone();
      const habitats = objects.filter((o) => specOf(o).kind === "habitat")
        .map((o) => ({ spec: specOf(o), doorOpen: o.doorOpen }));

      if (controllingDrone) {
        fanDrone.root.position.addScaledVector(forward, move * dt * 9.5);
        fanDrone.root.position.addScaledVector(right, side * dt * 9.5);
        fanDrone.root.position.x = THREE.MathUtils.clamp(fanDrone.root.position.x, -46, 46);
        fanDrone.root.position.z = THREE.MathUtils.clamp(fanDrone.root.position.z, -46, 46);
        fanDrone.root.position.y = THREE.MathUtils.damp(fanDrone.root.position.y, 2.7 + Math.sin(elapsed * 1.8) * .18, 5, dt);
      } else {
        const movementSpeed = insideBuilding ? WALK_SPEED : ride ? isOwnerVehicle(ride) ? OWNER_VEHICLE_SPEED : (operating?.enabled ? 3.2 : 9) : equipmentMode === "flight" ? FLIGHT_SPEED : waterMode === "land" ? WALK_SPEED : SWIM_SPEED;
        player.addScaledVector(forward, move * dt * movementSpeed);
        if (!ride) player.addScaledVector(right, side * dt * movementSpeed);
        if (insideBuilding) {
          const bounded = clampGiantInterior(player);
          player.x = bounded.x; player.z = bounded.z;
        } else {
          player.x = THREE.MathUtils.clamp(player.x, -42, 42);
          player.z = THREE.MathUtils.clamp(player.z, -42, 42);
        }

        let moved = insideBuilding
          ? { x: player.x, z: player.z }
          : equipmentMode === "flight"
            ? { x: player.x, z: player.z }
            : movePlayer(old, player, habitats, ride ? (operating?.enabled ? 6 : 3) * specOf(ride).scale : 0);
        if (!insideBuilding && !ride && !boarding && equipmentMode !== "flight") moved = avoidVehicleBodies(old, moved, objects.filter(o => specOf(o).kind === 'rover').map(o => ({ ...specOf(o), x: o.group.position.x, z: o.group.position.z, rotation: o.group.rotation.y * 180 / Math.PI })));
        if (!insideBuilding && equipmentMode !== "flight") moved = resolveGiantBuildingCollision(old, moved, ride ? 2.4 * specOf(ride).scale : .55);
        if (!insideBuilding && equipmentMode !== "flight" && ownerVehicleRuntime && ride !== ownerVehicleRuntime) moved = resolveOwnerVehicleCollision(
          old,
          moved,
          ride ? 2.1 * specOf(ride).scale : .6,
          { x: ownerVehicleRuntime.group.position.x, z: ownerVehicleRuntime.group.position.z, rotation: ownerVehicleRuntime.group.rotation.y },
        );
        player.x = moved.x;
        player.z = moved.z;
        if (ride && vehicleGround(ride, player.x, player.z, yaw).spread > .62 * specOf(ride).scale) {
          player.x = old.x; player.z = old.z;
        }

        const crossed = insideBuilding ? undefined : enteredPortal(old, player, PORTALS, activePortalId);
        if (crossed && !boarding) { enter(crossed.id); return; }

        if (!insideBuilding && !ride && !boarding) {
          const beforeWater = waterMode;
          const proposed = jump.height > .02 ? waterMode : nextWaterMode(waterMode, player, PORTALS, PORTAL_RADIUS, equipmentMode);
          if (beforeWater === "land" && proposed === "falling") {
            waterMode = "falling";
            waterEnteredAt = elapsed;
            splashAt(player.x, player.z, 1);
            setCaptureNotice("Splash! Swim with the joystick — water portals still work.");
          } else if (beforeWater !== "land" && proposed === "land") {
            waterMode = "land";
            splashAt(player.x, player.z, .62);
            setCaptureNotice("Back on the river bank.");
          } else waterMode = proposed;
          if (waterMode === "falling" && elapsed - waterEnteredAt >= .38) waterMode = "swimming";
        } else waterMode = "land";
      }

      const near = controllingDrone || insideBuilding ? undefined : objects
        .filter((o) => (specOf(o).kind === "rover" && o.group.position.distanceTo(player) < (isOwnerVehicle(o) ? 7.5 : 6)) || (specOf(o).kind === "habitat" && o.group.position.distanceTo(player) < 7))
        .sort(
          (a, b) =>
            a.group.position.distanceTo(player) -
            b.group.position.distanceTo(player),
        )[0];
      const nearPortal = controllingDrone || insideBuilding ? undefined : nearestPortal(player, PORTALS, activePortalId);
      const nearBuildingEntrance = !!giantEntrance && !controllingDrone && !insideBuilding && nearGiantBuildingEntrance(player);
      const nearBuildingExit = !!giantInterior && insideBuilding && nearGiantInteriorExit(player);
      if (boarding) action.current = "";
      if (action.current && !boarding) {
        const a = action.current;
        action.current = "";
        if (waitingForQueen && a !== "reset") {
          setCaptureNotice("The original character is still loading.");
        } else if (jump.jumps > 0 && (a === "drive" || (a === "interact" && ((near && !nearPortal) || nearBuildingEntrance || nearBuildingExit)))) {
          setCaptureNotice("Land before entering a vehicle.");
        } else if (a.startsWith("bucket-") || a === "backhoe-mode") {
          const machine = ride ? backhoes.get(ride) : undefined;
          if (!machine || !sandField) setCaptureNotice("Enter the rover in the meadow to use the loader.");
          else if (a === "backhoe-mode") {
            if (machine.load.amount > .00001 && machine.enabled) setCaptureNotice("Empty the bucket before removing the attachment.");
            else { vehicleViewYaw = 0; machine.setEnabled(!machine.enabled); setCaptureNotice("Desert digging area: right of the meadow, X 15–40 / Z 14–39. Dig lowers the selected bucket into contact with the sand."); }
          } else if (a === "bucket-tool") {
            if (machine.load.amount > .00001) setCaptureNotice("Empty the current bucket before switching tools.");
            else { vehicleViewYaw = 0; machine.setTool(machine.tool === "loader" ? "backhoe" : "loader"); }
          }
          else if (a === "bucket-dig") machine.setAction("dig");
          else if (a === "bucket-dump") machine.setAction("dump");
          else machine.setAction("carry");
        } else if (a === "fan-drone") {
          if (insideBuilding) setCaptureNotice("Drone equipment stays stowed inside the Giant Tower.");
          else if (ride) setCaptureNotice("Exit the rover before deploying the fan drone.");
          else {
            const next = nextEquipmentMode(equipmentMode, "toggle-drone");
            equipmentMode = next;
            resetJump(jump);
            avatar.setFlightFans(false);
            if (next === "drone") {
              fanDrone.root.visible = true;
              fanDrone.root.position.set(player.x, Math.max(2.5, avatar.root.position.y + 1.7), player.z).addScaledVector(forward, 1.8);
              setEquipmentStatus("drone");
              setCaptureNotice("Fan 1 deployed as a drone — joystick / WASD now flies it.");
            } else {
              fanDrone.root.visible = false;
              setEquipmentStatus("stowed");
              setCaptureNotice("Fan drone recalled.");
            }
          }
        } else if (a === "fan-flight") {
          if (insideBuilding) setCaptureNotice("Flight equipment stays stowed inside the Giant Tower.");
          else if (ride) setCaptureNotice("Exit the rover before using shoulder flight.");
          else {
            const next = nextEquipmentMode(equipmentMode, "toggle-flight");
            equipmentMode = next;
            resetJump(jump);
            fanDrone.root.visible = false;
            avatar.setFlightFans(next === "flight");
            setEquipmentStatus(next);
            if (next === "flight") {
              if (inRiver(player)) splashAt(player.x, player.z, .8);
              waterMode = "land";
              setCaptureNotice("Flight engaged — raise the hand fan and steer with the joystick / WASD.");
            } else {
              waterMode = inRiver(player) ? "swimming" : "land";
              if (waterMode === "swimming") splashAt(player.x, player.z, .65);
              setCaptureNotice(waterMode === "swimming" ? "Fans stowed — swimming." : "Fans stowed — back on foot.");
            }
          }
        } else if (a === "fan-stow") {
          equipmentMode = "stowed";
          fanDrone.root.visible = false;
          avatar.setFlightFans(false);
          setEquipmentStatus("stowed");
          waterMode = inRiver(player) ? "swimming" : "land";
        } else if (a === "interact" && nearBuildingExit) {
          insideBuilding = false;
          if (giantInterior) giantInterior.visible = false;
          setInsideGiantBuilding(false);
          player.set(GIANT_BUILDING_ENTRANCE.x, 2.3, GIANT_BUILDING_ENTRANCE.z + 1.65);
          resetJump(jump); flightHeight = 0; waterMode = "land"; cameraInitialized = false;
          yaw = 0; pitch = -0.16;
          setCaptureNotice("Back outside the giant tower.");
        } else if (a === "interact" && nearBuildingEntrance) {
          if (ride || equipmentMode !== "stowed") {
            setCaptureNotice("Exit the vehicle and stow flight equipment before entering the tower.");
          } else if (!giantInterior) {
            setCaptureNotice("The tower interior is unavailable in this world.");
          } else {
            insideBuilding = true;
            giantInterior.visible = true;
            setInsideGiantBuilding(true);
            player.set(GIANT_INTERIOR_SPAWN.x, 2.3, GIANT_INTERIOR_SPAWN.z);
            resetJump(jump); flightHeight = 0; waterMode = "land"; cameraInitialized = false;
            yaw = Math.PI; pitch = -0.12;
            setCaptureNotice("Entered Giant Tower · GAME / GENERATED INTERIOR. The owner model exterior is separate.");
          }
        } else if (a === "interact" && nearPortal) {
          enter(nearPortal.id);
          return;
        } else if (a === "reset") {
          player.set(0, 2.3, 17);
          resetJump(jump); flightHeight = 0; cameraInitialized = false;
          for (const machine of backhoes.values()) machine.setAction("carry");
          zoom.current = 4.8; setZoomValue(4.8);
          overview.current = false; setWide(false);
          for (const object of objects) object.doorOpen = false;
          yaw = 0; vehicleViewYaw = 0;
          pitch = -0.16;
          ride = null;
          setDriving(false);
          equipmentMode = "stowed";
          fanDrone.root.visible = false;
          avatar.setFlightFans(false);
          setEquipmentStatus("stowed");
          waterMode = "land";
          insideBuilding = false;
          if (giantInterior) giantInterior.visible = false;
          setInsideGiantBuilding(false);
        } else if (
          a === "exit" ||
          (ride && (a === "drive" || a === "interact"))
        ) {
          if (ride) {
            backhoes.get(ride)?.setAction("carry");
            const seat = vehicleSeatWorld(ride);
            const ownerOutside = isOwnerVehicle(ride) ? vehicleOutsideWorld(ride) : null;
            const exit = ownerOutside
              ? { x: ownerOutside.x, z: ownerOutside.z }
              : findRoverExit(ride.group.position, ride.group.rotation.y, specOf(ride).scale, habitats, true);
            if (exit) {
              boarding = { car: ride, from: seat.clone(), outside: new THREE.Vector3(exit.x, groundAt(exit.x, exit.z), exit.z), seat, time: 0, exiting: true };
              ride.doorOpen = true;
            }
          }
        } else if (
          a === "drive" ||
          (a === "interact" &&
            near && specOf(near).kind === "rover" &&
            near.group.position.distanceTo(player) < 6)
        ) {
          const r =
            a === "drive"
              ? objects.find((o) => specOf(o).kind === "rover")
              : near;
          if (r && r.group.position.distanceTo(player) < (isOwnerVehicle(r) ? 7.5 : 6)) {
            const outside = vehicleOutsideWorld(r);
            outside.y = groundAt(outside.x, outside.z);
            const clearPath = avoidVehicleBodies(player, movePlayer(player, outside, habitats), objects.filter(o => specOf(o).kind === "rover").map(o => ({ ...specOf(o), x: o.group.position.x, z: o.group.position.z, rotation: o.group.rotation.y * 180 / Math.PI })));
            if (Math.hypot(clearPath.x - outside.x, clearPath.z - outside.z) < .01) {
              boarding = { car: r, from: new THREE.Vector3(player.x, groundAt(player.x, player.z), player.z), outside, seat: vehicleSeatWorld(r), time: 0, exiting: false };
              yaw = r.group.rotation.y;
            } else setCaptureNotice(isOwnerVehicle(r) ? "Move to the left side of the Mars landship to enter." : "Approach the left-hand door to enter.");
          }
        } else if (
          a === "door" ||
          (a === "interact" &&
            near && specOf(near).kind === "habitat" &&
            near.group.position.distanceTo(player) < 7)
        ) {
          const h =
            a === "door"
              ? objects.find((o) => specOf(o).kind === "habitat")
              : near;
          if (h) h.doorOpen = !h.doorOpen;
        }
      }
      for (const o of objects) {
        const door = o.group.getObjectByName(specOf(o).kind === "rover" ? "driver-door" : "door");
        if (door)
          door.rotation.y = THREE.MathUtils.damp(
            door.rotation.y,
            o.doorOpen ? -Math.PI * 0.55 : 0,
            12,
            dt,
          );
      }
      for (const [car, machine] of backhoes) {
        if (ride === car && !boarding) { car.group.position.set(player.x, vehicleGround(car, player.x, player.z, yaw).y, player.z); car.group.rotation.y = yaw; }
        machine.update(dt, sandField);
      }
      desert?.sync();
      if (grass) updateMeadowGrass(grass, reduced ? 0 : elapsed);
      let seated = !!ride;
      let gait = Math.min(1, Math.hypot(player.x - old.x, player.z - old.z) / Math.max(dt * WALK_SPEED, .001));
      let reaching = 0;
      let swimming = waterMode !== "land";
      if (boarding) {
        boarding.time += dt;
        const b = boarding, t = b.time;
        const smooth = (v: number) => THREE.MathUtils.smoothstep(v, 0, 1);
        b.car.doorOpen = t > (b.exiting ? 0 : .9) && t < 2.65;
        reaching = t > .9 && t < 1.45 ? 1 : 0;
        swimming = false;
        if (b.exiting) {
          avatar.root.position.lerpVectors(b.seat, b.outside, smooth((t - .6) / 1.35));
          seated = t < .7; gait = t > .7 && t < 2.0 ? .5 : 0;
        } else if (t < .9) {
          avatar.root.position.lerpVectors(b.from, b.outside, smooth(t / .9));
          gait = .65;
        } else {
          avatar.root.position.lerpVectors(b.outside, b.seat, smooth((t - 1.4) / 1.05));
          seated = t > 1.9; gait = t > 1.4 && t < 2.15 ? .4 : 0;
        }
        player.x = avatar.root.position.x; player.z = avatar.root.position.z;
        avatar.root.rotation.y = b.car.group.rotation.y;
        if (t >= 3.1) {
          if (b.exiting) { ride = null; setDriving(false); }
          else { ride = b.car; player.copy(ride.group.position); player.y = 2.3; setDriving(true); }
          b.car.doorOpen = false; boarding = null;
        }
      } else if (ride) {
        swimming = false;
        avatar.root.position.copy(vehicleSeatWorld(ride));
        avatar.root.rotation.y = yaw;
      } else if (equipmentMode === "flight") {
        swimming = false;
        flightHeight = THREE.MathUtils.damp(flightHeight, FLIGHT_BODY_Y, 5, dt);
        avatar.root.position.set(player.x, flightHeight + Math.sin(elapsed * 2.1) * .04, player.z);
        if (gait > .02) avatar.root.rotation.y = Math.atan2(-(player.x - old.x), -(player.z - old.z));
      } else {
        flightHeight = THREE.MathUtils.damp(flightHeight, 0, 6, dt);
        if (flightHeight < .005) flightHeight = 0;
        const bodyY = insideBuilding ? GIANT_INTERIOR_FLOOR_Y : waterMode === "falling" ? fallingBodyY(elapsed - waterEnteredAt) : waterMode === "swimming" ? swimBodyY(elapsed) : groundAt(player.x, player.z);
        avatar.root.position.set(player.x, bodyY + jump.height + flightHeight, player.z);
        if (gait > .02) avatar.root.rotation.y = Math.atan2(-(player.x - old.x), -(player.z - old.z));
      }
      avatar.update(elapsed, gait, seated, reaching, swimming, equipmentMode === "flight", jumpFlipAngle(jump, reduced), jump.jumps > 0, jumpAnimation(jump));
      if (shownJumps !== jump.jumps) { shownJumps = jump.jumps; setJumpCount(shownJumps); }
      fanDrone.update(elapsed, Math.min(1, Math.hypot(axes.forward, axes.side)));
      updateSplashes(dt);

      if (controllingDrone) {
        camera.position.copy(fanDrone.root.position).addScaledVector(forward, -Math.max(4, zoom.current * .75));
        camera.position.y = fanDrone.root.position.y + 2.1;
        target.copy(fanDrone.root.position).addScaledVector(forward, 1.4);
        camera.lookAt(target);
      } else if (ride && !boarding) {
        ride.group.position.set(player.x, vehicleGround(ride, player.x, player.z, yaw).y, player.z);
        ride.group.rotation.y = yaw;
        const machine = backhoes.get(ride);
        if (machine?.enabled) {
          const view = excavationCamera(ride.group, machine.contact(), machine.tool === "backhoe", zoom.current, vehicleViewYaw, pitch);
          cameraGoal.copy(view.position); cameraAim.copy(view.target);
        } else {
          const orbit = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicleViewYaw);
          const cameraScale = isOwnerVehicle(ride) ? OWNER_VEHICLE_CAMERA_SCALE : specOf(ride).scale;
          cameraGoal.copy(player).addScaledVector(orbit, -(zoom.current + 1) * cameraScale);
          cameraGoal.y = ride.group.position.y + 4.6 * cameraScale;
          cameraAim.copy(player).addScaledVector(forward, isOwnerVehicle(ride) ? 3.2 : 2.0);
          cameraAim.y = ride.group.position.y + (isOwnerVehicle(ride) ? 1.7 : 1.3);
        }
        camera.position.lerp(cameraGoal, 1 - Math.exp(-7 * dt));
        target.lerp(cameraAim, 1 - Math.exp(-9 * dt)); camera.lookAt(target);
        for (const w of ride.group.children)
          if (w.name === "wheel") w.rotation.x -= Math.sign(move) * Math.hypot(player.x - old.x, player.z - old.z) / (.66 * specOf(ride).scale);
      } else {
        const visualY = avatar.root.position.y;
        player.y = swimming ? 1.15 : 2.3;
        cameraGoal.copy(player).addScaledVector(forward, -zoom.current);
        cameraGoal.y = Math.max(1.05, visualY + 2.05 - Math.sin(pitch) * zoom.current * .72);
        target.set(player.x, visualY + (swimming ? 1.35 : 1.05), player.z).addScaledVector(forward, .35);
        if (!cameraInitialized) {
          camera.position.copy(cameraGoal); cameraAim.copy(target); cameraInitialized = true;
        } else {
          const blend = 1 - Math.exp(-10 * dt);
          camera.position.lerp(cameraGoal, blend); cameraAim.lerp(target, blend);
        }
        camera.lookAt(cameraAim);
      }
      if (overview.current) {
        camera.position.set(Math.sin(yaw) * 18, 48 + zoom.current, 30 + Math.cos(yaw) * 12);
        camera.lookAt(0, 0, 3);
      }
      environment?.update(reduced ? 0 : elapsed);
      for (const p of portals) {
        const focused = p.id === nearPortal?.id;
        p.face.material.opacity = p.id === activePortalId ? 0.07 : focused ? 0.58 : 0.26;
        p.ripple.scale.setScalar(reduced ? 1 : 1 + Math.sin(elapsed * 1.4 + p.i) * 0.06);
        if (p.sculpture) {
          rotatePortalSculpture(p.sculpture, reduced ? 0 : elapsed, p.i * .35);
          p.sculpture.position.y = 4.25 + (reduced ? 0 : Math.sin(elapsed * Math.PI * 2 / 5 + p.i) * .12);
        }
      }
      if (now - hud > 200) {
        hud = now;
        const machine = ride ? backhoes.get(ride) : undefined;
        setVehicleHud({ enabled: machine?.enabled ?? false, tool: machine?.tool ?? "loader", action: machine?.action ?? "carry", load: machine ? Math.round(machine.load.amount * 1000) : 0, capacity: machine ? Math.round(machine.load.capacity * 1000) : 1600, status: machine?.status ?? "Ready" });
        const travelMode = insideBuilding ? "inside giant tower" : controllingDrone ? "fan drone" : equipmentMode === "flight" ? "flying" : waterMode === "swimming" || waterMode === "falling" ? "swimming" : ride ? "driving" : "on foot";
        setLocation(
          `${insideBuilding ? "Giant Tower · GAME interior" : sceneBlueprint.biome} · ${Math.round(player.x)}, ${Math.round(player.z)} · ${travelMode}`,
        );
        setHint(
          nearBuildingExit
            ? `${mobile ? "Tap the action button" : "E"} · exit Giant Tower to the meadow`
            : nearBuildingEntrance
              ? `${mobile ? "Tap the action button" : "E"} · enter the enormous Giant Tower`
              : nearPortal
                ? `${waterMode === "swimming" || waterMode === "falling" ? "Swim" : "Move"} onto the light to enter ${nearPortal.shortTitle}`
                : controllingDrone
              ? "Fan 1 drone · joystick / WASD fly · Equipment to recall"
              : equipmentMode === "flight"
                ? "Flight active · joystick / WASD steer · tap Land to return"
                : waterMode === "swimming" || waterMode === "falling"
                  ? "Swimming · joystick / WASD · you can enter portals directly from the water"
                  : ride
                    ? isOwnerVehicle(ride) ? "Mars solar landship · joystick / WASD drive & steer · Interact to exit" : machine?.enabled ? `Front-quarter work view · drag to look · ${machine.status}` : "Joystick: drive & steer · enable Backhoe mode to dig in the desert"
                    : near
                      ? `${mobile ? "Tap the action button" : "E"} · ${specOf(near).kind === "habitat" ? "open / close door" : isOwnerVehicle(near) ? "drive Mars solar landship" : "drive rover"}`
                      : insideBuilding
                        ? "Walk through the generated GAME lobby · use the glowing EXIT marker to leave"
                        : mobile ? "Left thumb: move · right thumb: look · tap Jump twice for a flip" : "WASD move · Space jump (twice: flip) · G fly/land · I equipment",
        );
        setInteraction(boarding ? "Entering / leaving vehicle…" : equipmentMode === "drone" ? "Recall fan drone" : equipmentMode === "flight" ? "Land / stow fans" : nearBuildingExit ? "Exit Giant Tower" : nearBuildingEntrance ? "Enter Giant Tower" : nearPortal ? `Enter ${nearPortal.shortTitle}` : ride ? isOwnerVehicle(ride) ? "Exit Mars landship" : "Exit rover" : near ? specOf(near).kind === "habitat" ? "Open / close door" : isOwnerVehicle(near) ? "Drive Mars landship" : "Drive rover" : "Interact");
      }
      renderer.render(scene, camera);
      if (!contextLost) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame((now) => {
      if (contextLost) return;
      setReady(true);
      animate(now);
    });
    return () => {
      sculptureDisposed = true;
      giantBuildingDisposed = true;
      ownerVehicleDisposed = true;
      if (giantBuildingLoadTimer !== undefined) clearTimeout(giantBuildingLoadTimer);
      if (ownerVehicleLoadTimer !== undefined) clearTimeout(ownerVehicleLoadTimer);
      contextLost = true;
      cancelAnimationFrame(frame);
      clearTimeout(navigationTimer);
      capture.current = null;
      sun.shadow.dispose();
      resize.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("wheel", wheelZoom);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", cancelLook);
      renderer.domElement.removeEventListener("lostpointercapture", cancelLook);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      clear();
      for (const [car, machine] of backhoes) if (sandSession.current?.key === sceneStructure) sandSession.current.loads.set(car.spec.id, { load: machine.load, enabled: machine.enabled, tool: machine.tool });
      avatar.dispose();
      if (avatarRuntime.current === avatar) avatarRuntime.current = null;
      rimInstaller.current = null; rimMounts.forEach(mount => mount.dispose()); rimMounts = [];
      runtimeObjects.current = [];
      environment?.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [sceneStructure, activePortalId, avatarChoice, avatarAttempt]);
  useEffect(() => {
    const byId = new Map(blueprint.objects.map((o) => [o.id, o]));
    for (const runtime of runtimeObjects.current) {
      const next = byId.get(runtime.spec.id);
      if (!next) continue;
      updateWorldObject(runtime.group, next);
    }
  }, [blueprint]);
  return (
    <section
      className={`starting-world-shell${driving ? " is-driving" : ""}${inventoryOpen ? " equipment-open" : ""}`}
      aria-label="WORLDIFACT playable world"
    >
      <div className="starting-world" ref={mount} />
      {transition && <div className="portal-transition" aria-live="polite">Entering world…</div>}
      {failed ? (
        <div className="webgl-fallback" role="alert">
          <h2>3D is unavailable in this browser</h2>
          <p>Your saved worlds and all portal links remain available below.</p>
        </div>
      ) : null}
      {!ready && !failed ? (
        <div className="loading-overlay" role="status">
          Preparing your world…
        </div>
      ) : null}
      <div className="world-top">
        <span className="eyebrow">GENERATED SCENERY · DEMO GAMEPLAY</span>
        <strong>{blueprint.title}</strong>
        <span>{location}</span>
        {avatarState === "loading" && <span role="status">{avatarProgressLabel(avatarProgress)}</span>}
        {avatarState === "error" && <span role="alert">The original character could not load. <button type="button" onClick={() => setAvatarAttempt(value => value + 1)}>Retry character</button></span>}
        {textureFailed ? <span role="status">Scenery image unavailable. Movement remains available.</span> : null}
        {sculptureFailed ? <span role="status">Portal sculptures are unavailable. All five portals remain open.</span> : null}
        <span role="status">{buildingStatus}</span>
        <span role="status">{ownerVehicleStatus}</span>
        {insideGiantBuilding ? <span>Giant Tower · GAME / GENERATED INTERIOR</span> : null}
      </div>
      <label className="avatar-note avatar-picker">Character
        <select value={avatarChoice} onChange={e => setAvatarChoice(e.target.value as AvatarChoice)} aria-label="Choose player character">
          <option value="queen">Fan Queen · 8 Planets / MPC2</option>
          <option value="rapper">Rapper · MPC2 archive</option>
        </select>
      </label>
      <button type="button" className="equipment-toggle" aria-expanded={inventoryOpen} onClick={() => setInventoryOpen(value => !value)}>
        Equipment
      </button>
      {inventoryOpen && <div className="equipment-panel" role="group" aria-label="Player equipment">
        <strong>Equipment &amp; view</strong>
        <div className="world-actions">
        <button
          onClick={() => {
            action.current = "drive";
          }}
          disabled={!blueprint.objects.some((o) => o.kind === "rover") || (!driving && interaction !== "Drive rover")}
        >
          {driving ? "Exit vehicle" : "Drive vehicle"}
        </button>
        {blueprint.objects.some(o => o.kind === "habitat") && <button
          onClick={() => {
            action.current = "door";
          }}
          disabled={!blueprint.objects.some((o) => o.kind === "habitat")}
        >
          Toggle workshop door
        </button>}
        <button
          onClick={() => {
            action.current = "reset";
          }}
        >
          Reset view
        </button>
        <button onClick={() => { overview.current = !overview.current; setWide(overview.current); }} aria-pressed={wide}>{wide ? "Follow character" : "Whole meadow"}</button>
        <button onClick={() => { void toggleMusic(); }} aria-pressed={music}>{music ? "Music off" : "Music on"}</button>
        <button onClick={() => capture.current?.()}>Save view PNG</button>
        <label className="camera-zoom">Camera <input aria-label="Camera distance" type="range" min="3" max="24" step="0.1" value={zoomValue} onChange={e => { zoom.current = Number(e.target.value); setZoomValue(zoom.current); }} /></label>
      </div>
        <label>Camera distance <input aria-label="Equipment camera distance" type="range" min="3" max="12" step="0.1" value={zoomValue} onChange={e => { zoom.current = Number(e.target.value); setZoomValue(zoom.current); }} /></label>
        <small>The original fan, its handle and all nine original rotor modules move together with the hand. Flight hardware is separate GAME equipment.</small>
        <label>Outfit
          <select value={outfit} onChange={e => setOutfit(e.target.value as OutfitPreset)} aria-label="Choose outfit">
            <option value="original">Original</option>
            <option value="tracksuit">Tracksuit</option>
            <option value="dress">Dress</option>
            <option value="casual">Casual</option>
          </select>
        </label>
        <button type="button" disabled={!ready || failed || driving || insideGiantBuilding} onClick={() => { action.current = "fan-drone"; }}>
          {equipmentStatus === "drone" ? "Fan 1 · Recall drone" : "Fan 1 · Throw / drone"}
        </button>
        <button type="button" disabled={!ready || failed || driving || insideGiantBuilding} onClick={() => { action.current = "fan-flight"; }}>
          {equipmentStatus === "flight" ? "Fan 2 · Land + stow" : "Fan 2 · Mount both / fly"}
        </button>
        <button type="button" disabled={equipmentStatus === "stowed"} onClick={() => { action.current = "fan-stow"; }}>Stow fans</button>
        <label>Original rim GLB (local only)
          <input type="file" accept=".glb,model/gltf-binary" aria-label="Load original vehicle rim GLB" onChange={event => { void importRim(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <small role="status">{rimStatus}</small>
        <small>Editable desert: X 15–40 / Z 14–39. Digging changes the terrain mesh. Terrain and bucket loads last for this world session.</small>
        <small>Keyboard: Space jump · press twice for a flip · G flight · F drone · I equipment.</small>
      </div>}
      {driving && !inventoryOpen && <div className="vehicle-tools" role="group" aria-label="Backhoe-loader controls">
        <button type="button" aria-pressed={vehicleHud.enabled} onClick={() => { action.current = "backhoe-mode"; }}>{vehicleHud.enabled ? "Remove attachment" : "Backhoe mode"}</button>
        {vehicleHud.enabled && <>
          <button type="button" disabled={vehicleHud.load > 0} onClick={() => { action.current = "bucket-tool"; }}>{vehicleHud.tool === "loader" ? "Front loader" : "Rear backhoe"} ⇄</button>
          <button type="button" aria-pressed={vehicleHud.action === "dig"} onClick={() => { action.current = "bucket-dig"; }}>Lower / dig</button>
          <button type="button" aria-pressed={vehicleHud.action === "carry"} onClick={() => { action.current = "bucket-carry"; }}>Raise / carry</button>
          <button type="button" disabled={vehicleHud.load === 0} aria-pressed={vehicleHud.action === "dump"} onClick={() => { action.current = "bucket-dump"; }}>Dump load</button>
          <output aria-live="off">Bucket: {vehicleHud.load} / {vehicleHud.capacity} L · GAME<br />{vehicleHud.status}</output>
        </>}
      </div>}
      {captureNotice && <div className="capture-notice" role="status">{captureNotice}</div>}
      <div className="world-hint" role="status">
        {hint}
      </div>
      <div className="world-controls" aria-label="Game controls">
        <TouchJoystick onMove={onStickMove} disabled={!ready || failed} />
        <div className="world-interact">
          <span>DRAG TO LOOK</span>
          {!driving && <div className="world-special-actions">
            <button type="button" disabled={!ready || failed || driving || insideGiantBuilding || avatarState !== "ready"} aria-pressed={equipmentStatus === "flight"} onClick={() => { action.current = "fan-flight"; }}>{equipmentStatus === "flight" ? "Land" : "Fly"}<span className="keyboard-shortcut" aria-hidden="true">G</span></button>
            <button type="button" disabled={!ready || failed || driving || avatarState !== "ready" || equipmentStatus !== "stowed" || jumpCount >= 2} aria-label={jumpCount === 1 ? "Double jump and flip" : "Jump"} onClick={() => { jumpRequests.current = Math.min(2, jumpRequests.current + 1); }}>{jumpCount === 1 ? "Double jump" : "Jump"}<span className="keyboard-shortcut" aria-hidden="true">Space</span></button>
          </div>}
          <button
            type="button"
            disabled={!ready || failed || interaction === "Interact"}
            onClick={() => { action.current = equipmentStatus === "drone" ? "fan-drone" : equipmentStatus === "flight" ? "fan-flight" : "interact"; }}
          >
            {interaction}{equipmentStatus === "stowed" && <span className="keyboard-shortcut" aria-hidden="true">E</span>}
          </button>
        </div>
      </div>
    </section>
  );
}
