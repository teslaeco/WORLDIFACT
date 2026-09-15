import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PORTALS } from "../config/portals";
import { demoBlueprint } from "../lib/blueprint";
import type { WorldBlueprint, WorldObject } from "../lib/blueprint";
import { findRoverExit, movePlayer } from "../lib/movement";
import {
  createDecorativeTerrain,
  createWorldObject,
  disposeObject,
  updateWorldObject,
} from "../lib/worldGeometry";
interface Props {
  onPortalOpen: (id: string) => void;
  blueprint?: WorldBlueprint;
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
}: Props) {
  const mount = useRef<HTMLDivElement>(null),
    input = useRef<Record<string, boolean>>({}),
    action = useRef(""),
    runtimeObjects = useRef<RuntimeObject[]>([]);
  const latestBlueprint = useRef(blueprint);
  const open = useRef(onPortalOpen);
  useEffect(() => {
    open.current = onPortalOpen;
  }, [onPortalOpen]);
  const [failed, setFailed] = useState(false),
    [ready, setReady] = useState(false),
    [driving, setDriving] = useState(false);
  const [hint, setHint] = useState(
      "Explore the river, drive the rover, or open a workshop.",
    ),
    [location, setLocation] = useState("Valley entrance");
  const sceneStructure = `${blueprint.biome}:${blueprint.objects
    .map((o) => `${o.id}:${o.kind}`)
    .join(",")}`;
  useEffect(() => {
    latestBlueprint.current = blueprint;
  }, [blueprint]);
  useEffect(() => {
    if (!mount.current) return;
    const host = mount.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    queueMicrotask(() => {
      setFailed(false);
      setReady(false);
      setDriving(false);
    });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute(
      "aria-label",
      "3D world. Drag to look; W A S D to move.",
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
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(230, 230),
      new THREE.MeshStandardMaterial({
        color: lunar ? "#626874" : sea ? "#657f77" : "#62905d",
        roughness: 1,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const riverMaterial = new THREE.MeshStandardMaterial({
      color: sea ? "#756fde" : "#459fba",
      metalness: 0.6,
      roughness: 0.2,
    });
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 8, 1, 1),
      riverMaterial,
    );
    river.rotation.x = -Math.PI / 2;
    river.position.y = 0.035;
    scene.add(river);
    // The bridge is passable scenery; both banks connect the same playable world.
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: "#bdad87", roughness: 0.85 }),
    );
    bridge.position.set(0, 0.12, 0);
    scene.add(bridge);
    for (const x of [-2.5, 2.5]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: "#50564e" }),
      );
      rail.position.set(x, 1, 0);
      scene.add(rail);
    }
    const mountainGeometry = new THREE.ConeGeometry(22, 1, 5);
    const mountainMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 1,
      flatShading: true,
      vertexColors: true,
    });
    const mountains = new THREE.InstancedMesh(
      mountainGeometry,
      mountainMaterial,
      20,
    );
    mountains.name = "instanced-mountain-ring";
    const snow = lunar
      ? null
      : new THREE.InstancedMesh(
          new THREE.ConeGeometry(6, 1, 5),
          new THREE.MeshStandardMaterial({ color: "#dde9dc", roughness: 1 }),
          20,
        );
    if (snow) snow.name = "instanced-snow-caps";
    const sceneryTransform = new THREE.Object3D();
    const sceneryColor = new THREE.Color();
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2,
        dist = 85 + (i % 3) * 9,
        h = 22 + ((i * 7) % 20);
      const x = Math.sin(angle) * dist,
        z = Math.cos(angle) * dist;
      sceneryTransform.position.set(x, h / 2 - 1, z);
      sceneryTransform.rotation.set(0, i, 0);
      sceneryTransform.scale.set(1, h, 1);
      sceneryTransform.updateMatrix();
      mountains.setMatrixAt(i, sceneryTransform.matrix);
      mountains.setColorAt(
        i,
        sceneryColor.set(lunar ? "#49545f" : i % 2 ? "#718977" : "#637970"),
      );
      if (snow) {
        sceneryTransform.position.set(x, h - h * 0.14 - 1, z);
        sceneryTransform.rotation.set(0, i, 0);
        sceneryTransform.scale.set(1, h * 0.28, 1);
        sceneryTransform.updateMatrix();
        snow.setMatrixAt(i, sceneryTransform.matrix);
      }
    }
    mountains.instanceMatrix.needsUpdate = true;
    if (mountains.instanceColor) mountains.instanceColor.needsUpdate = true;
    scene.add(mountains);
    if (snow) {
      snow.instanceMatrix.needsUpdate = true;
      scene.add(snow);
    }
    const terrain: WorldObject[] = [];
    for (let i = 0; i < 65; i++) {
      const x = ((i * 31) % 125) - 62,
        z = ((i * 47) % 120) - 60;
      if (Math.abs(z) < 10 || (Math.abs(x) < 24 && Math.abs(z) < 32)) continue;
      terrain.push({
        id: `terrain-${i}`,
        kind: lunar ? "rock" : "tree",
        name: "Valley flora",
        x,
        z,
        scale: 0.6 + (i % 5) * 0.2,
        rotation: (i * 17) % 360,
        color: lunar ? "#8c9195" : i % 2 ? "#2e674d" : "#45754c",
      });
    }
    scene.add(createDecorativeTerrain(terrain));
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
      g.position.set(p.position.x, 2.1, p.position.z);
      g.userData.portalId = p.id;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.095, 8, 40),
        new THREE.MeshStandardMaterial({
          color: p.color,
          emissive: p.color,
          emissiveIntensity: 0.65,
          metalness: 0.4,
          roughness: 0.2,
        }),
      );
      g.add(rim);
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(1.4, 40),
        new THREE.MeshBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
        }),
      );
      g.add(face);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0b202b";
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = "#f1f6ee";
      ctx.textAlign = "center";
      ctx.font = "600 34px sans-serif";
      ctx.fillText(p.shortTitle, 256, 72);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          depthTest: false,
        }),
      );
      label.scale.set(4, 1, 1);
      label.position.y = 2.1;
      g.add(label);
      scene.add(g);
      return { g, face, i, id: p.id };
    });
    const player = new THREE.Vector3(0, 2.3, 25),
      forward = new THREE.Vector3(),
      right = new THREE.Vector3(),
      target = new THREE.Vector3();
    let yaw = 0,
      pitch = -0.06,
      ride: (typeof objects)[number] | null = null,
      frame = 0,
      previous = performance.now(),
      hud = 0,
      elapsed = 0;
    let contextLost = false;
    let drag: { id: number; x: number; y: number; moved: number } | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clear = () => {
      input.current = {};
      action.current = "";
      drag = null;
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
      renderer.domElement.focus();
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
        portals.map((p) => p.g),
        true,
      )[0];
      if (hit && hit.distance < 30) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.portalId) o = o.parent;
        if (o) open.current(o.userData.portalId);
      }
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
    renderer.domElement.addEventListener("pointercancel", clear);
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
      if (contextLost) return;
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      elapsed += dt;
      const keys = input.current,
        move =
          (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0),
        side =
          (keys.d || keys.arrowright ? 1 : 0) -
          (keys.a || keys.arrowleft ? 1 : 0);
      if (ride) yaw -= side * dt * 1.25;
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const old = player.clone(),
        length = Math.hypot(move, ride ? 0 : side) || 1;
      player.addScaledVector(forward, (move / length) * dt * (ride ? 16 : 7));
      if (!ride) player.addScaledVector(right, (side / length) * dt * 7);
      player.x = THREE.MathUtils.clamp(player.x, -42, 42);
      player.z = THREE.MathUtils.clamp(player.z, -42, 42);
      const habitats = objects.filter((o) => specOf(o).kind === "habitat")
        .map((o) => ({ spec: specOf(o), doorOpen: o.doorOpen }));
      const moved = movePlayer(old, player, habitats, ride ? 2.85 * specOf(ride).scale : 0);
      player.x = moved.x;
      player.z = moved.z;
      const near = objects
        .filter((o) => ["rover", "habitat"].includes(specOf(o).kind))
        .sort(
          (a, b) =>
            a.group.position.distanceTo(player) -
            b.group.position.distanceTo(player),
        )[0];
      const nearPortal = portals.find(
        (p) => p.g.position.distanceTo(player) < 3.8,
      );
      if (action.current) {
        const a = action.current;
        action.current = "";
        if (a === "reset") {
          player.set(0, 2.3, 25);
          yaw = 0;
          pitch = -0.06;
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
        } else if (a === "interact" && nearPortal) open.current(nearPortal.id);
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
      const fade = THREE.MathUtils.clamp(1 - Math.abs(player.z) / 32, 0.1, 1);
      for (const p of portals) {
        p.face.material.opacity = fade * 0.7;
        p.g.position.y = 2.1 + (reduced ? 0 : Math.sin(elapsed + p.i) * 0.08);
      }
      if (now - hud > 500) {
        hud = now;
        setLocation(
          `${sceneBlueprint.biome} · ${Math.round(player.x)}, ${Math.round(player.z)}`,
        );
        setHint(
          ride
            ? "W/S accelerate · A/D steer · E exit"
            : nearPortal
              ? "E · enter portal"
              : near && near.group.position.distanceTo(player) < 7
                ? `E · ${specOf(near).kind === "habitat" ? "open / close door" : "drive rover"}`
                : "WASD move · drag to look · cross the bridge to explore",
        );
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
      renderer.domElement.removeEventListener("pointercancel", clear);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      clear();
      runtimeObjects.current = [];
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [sceneStructure]);
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
      <div className="touch-controls" aria-label="Touch movement">
        {[
          ["w", "Forward", "↑"],
          ["a", "Left", "←"],
          ["s", "Back", "↓"],
          ["d", "Right", "→"],
        ].map(([key, label, arrow]) => (
          <button
            key={key}
            aria-label={label}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              input.current[key] = true;
            }}
            onPointerUp={() => {
              input.current[key] = false;
            }}
            onPointerCancel={() => {
              input.current[key] = false;
            }}
            onLostPointerCapture={() => {
              input.current[key] = false;
            }}
          >
            {arrow}
          </button>
        ))}
        <button
          onClick={() => {
            action.current = "interact";
          }}
        >
          Interact · E
        </button>
      </div>
    </section>
  );
}
