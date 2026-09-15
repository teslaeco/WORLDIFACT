import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PORTALS } from "../config/portals";
import { demoBlueprint } from "../lib/blueprint";
import type { WorldBlueprint, WorldObject } from "../lib/blueprint";
import { findRoverExit, movePlayer } from "../lib/movement";
import { movementAxes, STILL } from "../lib/gameControls";
import type { MoveAxes } from "../lib/gameControls";
import { enteredPortal, nearestPortal, PORTAL_RADIUS } from "../lib/portalNavigation";
import { createLakeEnvironment } from "../lib/lakeEnvironment";
import TouchJoystick from "./TouchJoystick";
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
const START = demoBlueprint("village forest");
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
    runtimeObjects = useRef<RuntimeObject[]>([]);
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
  const [textureFailed, setTextureFailed] = useState(false);
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
    });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
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
      65,
      host.clientWidth / host.clientHeight,
      0.1,
      240,
    );
    scene.add(
      new THREE.HemisphereLight("#fff5db", lunar ? "#253449" : "#294437", 2.3),
    );
    const sun = new THREE.DirectionalLight("#ffe9bc", 3);
    sun.position.set(30, 55, 20);
    scene.add(sun);
    const environment = lunar ? null : createLakeEnvironment(scene, mobile, () => setTextureFailed(true), sea);
    if (!sea) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(230, 230),
        new THREE.MeshStandardMaterial({ color: lunar ? "#626874" : "#62905d", roughness: 1 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.name = lunar ? "lunar-ground" : "green-meadow";
      scene.add(ground);
    }
    if (lunar) {
      scene.add(createDecorativeTerrain(Array.from({ length: 32 }, (_, i) => ({
        id: `lunar-rock-${i}`, kind: "rock", name: "Lunar rock",
        x: Math.sin(i * 2.4) * (48 + i % 8), z: Math.cos(i * 2.4) * (48 + i % 8),
        scale: 1.5 + i % 4, rotation: i * 19, color: "#7c8992",
      }))));
    } else if (!sea) {
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.2, 12), new THREE.MeshStandardMaterial({ color: "#bdad87", roughness: 0.85 }));
      bridge.name = "river-footbridge";
      bridge.position.set(0, 0.16, 0);
      scene.add(bridge);
      const trees: WorldObject[] = [];
      for (let i = 0; i < 65; i++) {
        const x = ((i * 31) % 125) - 62, z = ((i * 47) % 120) - 60;
        if (Math.abs(z) < 10 || (Math.abs(x) < 24 && Math.abs(z) < 32)) continue;
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
      return { g, face, ripple, i, id: p.id };
    });
    const player = new THREE.Vector3(0, 2.3, 17),
      forward = new THREE.Vector3(),
      right = new THREE.Vector3(),
      target = new THREE.Vector3();
    let yaw = 0,
      pitch = -0.16,
      ride: (typeof objects)[number] | null = null,
      frame = 0,
      previous = performance.now(),
      hud = 0,
      elapsed = 0;
    let contextLost = false;
    let navigating = false;
    let drag: { id: number; x: number; y: number; moved: number } | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clear = () => {
      input.current = {};
      stick.current = { ...STILL };
      action.current = "";
      drag = null;
    };
    const enter = (id: string) => {
      if (navigating || id === activePortalId) return;
      navigating = true;
      clear();
      setReady(false);
      open.current(id);
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      const k = e.key.toLowerCase();
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
        ].includes(k)
      ) {
        e.preventDefault();
        input.current[k] = true;
      }
      if (k === "e" && !e.repeat) action.current = "interact";
      if (k === "escape") action.current = "exit";
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
      yaw -= dx * 0.003;
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
    document.addEventListener("visibilitychange", clear);
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
      const { forward: move, side } = movementAxes(input.current, stick.current);
      if (ride) yaw -= side * dt * 1.25;
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const old = player.clone();
      player.addScaledVector(forward, move * dt * (ride ? 16 : 7));
      if (!ride) player.addScaledVector(right, side * dt * 7);
      player.x = THREE.MathUtils.clamp(player.x, -42, 42);
      player.z = THREE.MathUtils.clamp(player.z, -42, 42);
      const habitats = objects.filter((o) => specOf(o).kind === "habitat")
        .map((o) => ({ spec: specOf(o), doorOpen: o.doorOpen }));
      const moved = movePlayer(old, player, habitats, ride ? 2.85 * specOf(ride).scale : 0);
      player.x = moved.x;
      player.z = moved.z;
      const crossed = enteredPortal(old, player, PORTALS, activePortalId);
      if (crossed) { enter(crossed.id); return; }
      const near = objects
        .filter((o) => (specOf(o).kind === "rover" && o.group.position.distanceTo(player) < 6) || (specOf(o).kind === "habitat" && o.group.position.distanceTo(player) < 7))
        .sort(
          (a, b) =>
            a.group.position.distanceTo(player) -
            b.group.position.distanceTo(player),
        )[0];
      const nearPortal = nearestPortal(player, PORTALS, activePortalId);
      if (action.current) {
        const a = action.current;
        action.current = "";
        if (a === "interact" && nearPortal) {
          enter(nearPortal.id);
          return;
        } else if (a === "reset") {
          player.set(0, 2.3, 17);
          yaw = 0;
          pitch = -0.16;
          ride = null;
          setDriving(false);
        } else if (
          a === "exit" ||
          (ride && (a === "drive" || a === "interact"))
        ) {
          if (ride) {
            const exit = findRoverExit(ride.group.position, ride.group.rotation.y, specOf(ride).scale, habitats);
            if (exit) {
              player.set(exit.x, 2.3, exit.z);
              ride = null;
              setDriving(false);
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
          if (r) {
            ride = r;
            player.copy(r.group.position);
            player.y = 2.3;
            yaw = r.group.rotation.y;
            setDriving(true);
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
        const door = o.group.getObjectByName("door");
        if (door)
          door.rotation.y = THREE.MathUtils.damp(
            door.rotation.y,
            o.doorOpen ? -Math.PI * 0.55 : 0,
            12,
            dt,
          );
      }
      if (ride) {
        ride.group.position.set(player.x, 0, player.z);
        ride.group.rotation.y = yaw;
        camera.position
          .copy(player)
          .addScaledVector(forward, -7 * specOf(ride).scale);
        camera.position.y = 4.6 * specOf(ride).scale;
        target.copy(player).addScaledVector(forward, 6);
        target.y = 1.3;
        camera.lookAt(target);
        for (const w of ride.group.children)
          if (w.name === "wheel") w.rotation.x -= move * dt * 14;
      } else {
        player.y = 2.3;
        camera.position.copy(player);
        target.copy(player).add(forward);
        target.y += Math.tan(pitch);
        camera.lookAt(target);
      }
      environment?.update(reduced ? 0 : elapsed);
      for (const p of portals) {
        const focused = p.id === nearPortal?.id;
        p.face.material.opacity = p.id === activePortalId ? 0.07 : focused ? 0.58 : 0.26;
        p.ripple.scale.setScalar(reduced ? 1 : 1 + Math.sin(elapsed * 1.4 + p.i) * 0.06);
      }
      if (now - hud > 200) {
        hud = now;
        setLocation(
          `${sceneBlueprint.biome} · ${Math.round(player.x)}, ${Math.round(player.z)}`,
        );
        setHint(
          nearPortal
            ? `Walk onto the light to enter ${nearPortal.shortTitle}`
            : ride
              ? "Joystick: drive & steer · drag to look"
              : near
                ? `${mobile ? "Tap the action button" : "E"} · ${specOf(near).kind === "habitat" ? "open / close door" : "drive rover"}`
                : mobile ? "Left thumb: move · right thumb: look" : "WASD move · drag to look · walk onto a water portal",
        );
        setInteraction(nearPortal ? `Enter ${nearPortal.shortTitle}` : ride ? "Exit rover" : near ? specOf(near).kind === "habitat" ? "Open / close door" : "Drive rover" : "Interact");
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
      contextLost = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", cancelLook);
      renderer.domElement.removeEventListener("lostpointercapture", cancelLook);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      clear();
      runtimeObjects.current = [];
      environment?.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [sceneStructure, activePortalId]);
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
      className="starting-world-shell"
      aria-label="WORLDIFACT playable world"
    >
      <div className="starting-world" ref={mount} />
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
        {textureFailed ? <span role="status">Scenery image unavailable. Movement remains available.</span> : null}
      </div>
      <div className="world-actions">
        <button
          onClick={() => {
            action.current = "drive";
          }}
          disabled={!blueprint.objects.some((o) => o.kind === "rover")}
        >
          {driving ? "Exit rover" : "Drive rover"}
        </button>
        <button
          onClick={() => {
            action.current = "door";
          }}
          disabled={!blueprint.objects.some((o) => o.kind === "habitat")}
        >
          Toggle workshop door
        </button>
        <button
          onClick={() => {
            action.current = "reset";
          }}
        >
          Reset view
        </button>
      </div>
      <div className="world-hint" role="status">
        {hint}
      </div>
      <div className="world-controls" aria-label="Game controls">
        <TouchJoystick onMove={onStickMove} disabled={!ready || failed} />
        <div className="world-interact">
          <span>DRAG TO LOOK</span>
          <button
            type="button"
            disabled={!ready || failed || interaction === "Interact"}
            onClick={() => { action.current = "interact"; }}
          >
            {interaction}<span className="keyboard-shortcut" aria-hidden="true">E</span>
          </button>
        </div>
      </div>
    </section>
  );
}
