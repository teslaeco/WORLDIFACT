import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { loadPortalSculpture, PORTAL_SCULPTURE_POSTER_URL, rotatePortalSculpture, setSculpturePalette } from "../lib/portalSculpture";
import { disposeObject } from "../lib/worldGeometry";
import "./CosmicLoginScene.css";

export type CosmicLoginPhase = "idle" | "submitting" | "success";
interface Props { phase: CosmicLoginPhase }
const PAINT_COLORS = ["#49ffb0", "#32c9ff", "#bc70ff", "#ff62af", "#ffbf58", "#4df5e6"];
const SUCCESS_SECONDS = 2.8;
// Official NASA GIBS visual backdrop, the same Blue Marble layer used in Terra/ISS.
const EARTH_TEXTURE = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=BlueMarble_ShadedRelief_Bathymetry&STYLES=&FORMAT=image/jpeg&TRANSPARENT=false&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=2048&HEIGHT=1024";

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(.13, "rgba(255,255,255,.9)");
  gradient.addColorStop(.4, "rgba(255,255,255,.15)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function paintTexture(seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "white";
  context.beginPath();
  for (let i = 0; i <= 80; i++) {
    const angle = i / 80 * Math.PI * 2;
    const radius = 44 + Math.sin(angle * 7 + seed) * 13 + Math.pow(Math.max(0, Math.sin(angle * 11 + seed * 2)), 10) * 44;
    const x = 128 + Math.cos(angle) * radius, y = 128 + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath(); context.fill();
  for (let i = 0; i < 15; i++) {
    const angle = i * 2.39 + seed, radius = 73 + i % 5 * 8;
    context.beginPath(); context.arc(128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius, 2 + i % 4, 0, Math.PI * 2); context.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

/** Decorative only: success is supplied after the identity provider confirms login. */
export default function CosmicLoginScene({ phase }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [modelState, setModelState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [earthReady, setEarthReady] = useState(false);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const mobile = matchMedia("(pointer: coarse)").matches;
    const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionPreference.matches;
    let disposed = false, contextLost = false, frame = 0, elapsed = 0, previous = performance.now();
    let lastPhase: CosmicLoginPhase = "idle", successStarted = -1, forceRender = true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.5));
    } catch {
      queueMicrotask(() => { if (!disposed) setFailed(true); });
      return () => { disposed = true; };
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .9;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, .1, 180);
    camera.position.set(0, 0, 9);
    scene.add(new THREE.AmbientLight("#6a86cb", 1.1));
    const keyLight = new THREE.DirectionalLight("#ffe0ae", 3.5);
    keyLight.position.set(-7, 7, 2); scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight("#40baff", 2);
    rimLight.position.set(4, -2, -4); scene.add(rimLight);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .55, .7, 1.15);
    composer.addPass(bloom);
    const output = new OutputPass(); composer.addPass(output);
    const glow = glowTexture();
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = mobile ? 750 : 1500;
    const positions = new Float32Array(starsCount * 3), colors = new Float32Array(starsCount * 3), starPhases = new Float32Array(starsCount);
    let randomSeed = 182025;
    const random = () => { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; };
    for (let i = 0; i < starsCount; i++) {
      positions[i * 3] = (random() - .5) * 150;
      positions[i * 3 + 1] = (random() - .5) * 95;
      positions[i * 3 + 2] = -15 - random() * 105;
      const tint = new THREE.Color().setHSL(.54 + random() * .11, .12 + random() * .3, .6 + random() * .35);
      tint.toArray(colors, i * 3); starPhases[i] = random() * Math.PI * 2;
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    starsGeometry.setAttribute("starPhase", new THREE.BufferAttribute(starPhases, 1));
    const starsMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, pixelRatio: { value: renderer.getPixelRatio() } },
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float starPhase; varying vec3 starColor; varying float brightness; uniform float time; uniform float pixelRatio;
        void main(){starColor=color; brightness=.65+.35*sin(time*.75+starPhase);vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(35./-p.z,1.,2.6)*pixelRatio;}`,
      fragmentShader: `varying vec3 starColor; varying float brightness; void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(starColor, smoothstep(.5,.05,d)*brightness);}`,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial); scene.add(stars);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffe4a1", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sun.position.set(-12, 6.5, -35); sun.scale.set(13, 13, 1); scene.add(sun);
    const sunCore = new THREE.Mesh(new THREE.SphereGeometry(.66, 24, 16), new THREE.MeshBasicMaterial({ color: "#fff4cc" }));
    sunCore.position.copy(sun.position); scene.add(sunCore);
    const earthMaterial = new THREE.MeshStandardMaterial({ color: "#0a2846", roughness: 1 });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(4.4, mobile ? 40 : 64, 32), earthMaterial);
    earth.position.set(8, -5, -24); earth.rotation.z = .18; scene.add(earth);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(4.48, 40, 32), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      vertexShader: `varying vec3 normalView; varying vec3 viewDirection; void main(){vec4 p=modelViewMatrix*vec4(position,1.);normalView=normalize(normalMatrix*normal);viewDirection=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 normalView; varying vec3 viewDirection; void main(){float rim=pow(1.-max(dot(normalize(normalView),normalize(viewDirection)),0.),3.);gl_FragColor=vec4(.12,.52,1.,rim*.48);}`,
    }));
    atmosphere.position.copy(earth.position); scene.add(atmosphere);
    new THREE.TextureLoader().load(EARTH_TEXTURE, texture => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      earthMaterial.map = texture; earthMaterial.color.set("#ffffff"); earthMaterial.needsUpdate = true;
      forceRender = true; setEarthReady(true);
    }, undefined, () => { /* Honest plain-blue fallback when the NASA texture cannot load. */ });
    const sculptureAnchor = new THREE.Group(); scene.add(sculptureAnchor);
    let sculpture: THREE.Group | undefined;
    void loadPortalSculpture(undefined, 3.35).then(model => {
      if (disposed) { disposeObject(model); return; }
      sculpture = model; sculptureAnchor.add(model); rotatePortalSculpture(model, 0);
      forceRender = true; setModelState("ready");
    }).catch(() => { if (!disposed) setModelState("unavailable"); });
    const dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#077b92", transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false }));
    dust.position.set(-2, -2, -12); dust.scale.set(32, 15, 1); scene.add(dust);
    const particleGeometry = new THREE.SphereGeometry(.07, 7, 5);
    const droplets = Array.from({ length: mobile ? 30 : 48 }, (_, i) => {
      const material = new THREE.MeshBasicMaterial({ color: PAINT_COLORS[i % PAINT_COLORS.length], transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(particleGeometry, material); mesh.visible = false; scene.add(mesh);
      return { mesh, destination: new THREE.Vector3((random() - .5) * 13, (random() - .5) * 8, 7), delay: random() * .35 };
    });
    const splats = Array.from({ length: 8 }, (_, i) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintTexture(i + 1), color: PAINT_COLORS[i % PAINT_COLORS.length], transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 20 + i; sprite.visible = false; scene.add(sprite);
      return { sprite, x: (i % 4 - 1.5) * .75 + (random() - .5) * .2, y: (i < 4 ? -.3 : .34) + (random() - .5) * .35, delay: i * .05 };
    });
    let narrow = false;
    const resize = () => {
      const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
      narrow = width <= 800;
      renderer.setSize(width, height); composer.setSize(width, height);
      camera.aspect = width / height; camera.updateProjectionMatrix();
      // Keep the compact mobile form above the fold: the original model occupies
      // the header's right side, while desktop gives it the left hero region.
      const visibleHeight = 2 * 9 * Math.tan(THREE.MathUtils.degToRad(43) / 2);
      const visibleWidth = visibleHeight * camera.aspect;
      const centerY = narrow ? 112 : Math.min(500, height * .55);
      const centerX = narrow ? width * .80 : width * .27;
      const modelPixels = narrow ? Math.min(118, width * .31) : Math.min(360, width * .29);
      sculptureAnchor.position.set(visibleWidth * (centerX / width - .5), visibleHeight * (.5 - centerY / height), 0);
      sculptureAnchor.scale.setScalar(modelPixels / height * visibleHeight / 3.35);
      const container = host.parentElement;
      container?.style.setProperty("--sculpture-center-x", `${centerX}px`);
      container?.style.setProperty("--sculpture-center-y", `${centerY}px`);
      container?.style.setProperty("--sculpture-size", `${modelPixels}px`);
      forceRender = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const motionChanged = () => { reduced = motionPreference.matches; forceRender = true; };
    motionPreference.addEventListener("change", motionChanged);
    const onLost = (event: Event) => { event.preventDefault(); contextLost = true; cancelAnimationFrame(frame); setFailed(true); };
    const onRestored = () => { if (disposed) return; contextLost = false; forceRender = true; previous = performance.now(); setFailed(false); frame = requestAnimationFrame(animate); };
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !disposed && !contextLost) { previous = performance.now(); forceRender = true; frame = requestAnimationFrame(animate); }
    };
    document.addEventListener("visibilitychange", visibility);
    function animate(now: number) {
      if (disposed || contextLost || document.hidden) return;
      const dt = Math.min((now - previous) / 1000, .05); previous = now;
      const currentPhase = phaseRef.current;
      if (currentPhase !== lastPhase) {
        successStarted = currentPhase === "success" ? now : -1;
        lastPhase = currentPhase; forceRender = true;
      }
      const moving = !reduced && !pausedRef.current;
      if (moving) elapsed += dt;
      const successTime = successStarted < 0 ? -1 : (now - successStarted) / 1000;
      const erupting = moving && successTime >= 0 && successTime < SUCCESS_SECONDS;
      starsMaterial.uniforms.time.value = moving ? elapsed : 0;
      if (sculpture) {
        rotatePortalSculpture(sculpture, reduced ? 0 : elapsed);
        sculpture.position.y = moving ? Math.sin(elapsed / 5 * Math.PI * 2) * .1 : 0;
        if (currentPhase === "idle") setSculpturePalette(sculpture, ["#56ffad", "#38bfff"]);
        else {
          const color = new THREE.Color().setHSL((moving ? elapsed * .14 : .75) % 1, .88, .63);
          const second = new THREE.Color().setHSL(((moving ? elapsed * .14 : .75) + .28) % 1, .88, .65);
          setSculpturePalette(sculpture, [color.getStyle(), second.getStyle()]);
        }
      }
      earth.rotation.y = .5 + (moving ? elapsed * .018 : 0);
      // One smooth luminous bloom, never a strobe; reduced motion suppresses the eruption entirely.
      const flare = erupting ? Math.sin(Math.min(1, successTime / .65) * Math.PI) * .65 : 0;
      sun.scale.setScalar(13 * (1 + flare));
      for (const drop of droplets) {
        const t = Math.max(0, (successTime - .15 - drop.delay) / 1.3);
        drop.mesh.visible = erupting && t > 0 && t < 1;
        if (!drop.mesh.visible) continue;
        drop.mesh.position.lerpVectors(sun.position, drop.destination, Math.min(1, t * t));
        drop.mesh.scale.set(.65 + t * 2.5, .65 + t * 2.5, 2.5 + t * 5);
        drop.mesh.material.opacity = Math.min(1, t * 5);
      }
      for (const splat of splats) {
        const t = successTime - 1.45 - splat.delay;
        splat.sprite.visible = erupting && t >= 0;
        if (!splat.sprite.visible) continue;
        const nearWidth = 2 * 2 * Math.tan(THREE.MathUtils.degToRad(43) / 2) * camera.aspect;
        splat.sprite.position.set(splat.x * nearWidth * .5, splat.y * (narrow ? 1.9 : 1.5), 7);
        const size = (narrow ? .9 : 1.4) * (1 - Math.exp(-t * 16));
        splat.sprite.scale.set(size, size, 1);
        splat.sprite.material.opacity = .8 * Math.min(1, t * 15) * Math.max(0, (SUCCESS_SECONDS - successTime) / .65);
      }
      if (moving || forceRender) { composer.render(); forceRender = false; }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      motionPreference.removeEventListener("change", motionChanged);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      starsGeometry.dispose(); starsMaterial.dispose();
      disposeObject(scene); bloom.dispose(); output.dispose(); composer.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, []);

  return <div className={`cosmic-login-scene${failed ? " cosmic-login-scene--fallback" : ""}`}>
    <div className="cosmic-login-canvas" ref={mount} />
    {(failed || modelState !== "ready") && <img className="cosmic-sculpture-poster" src={PORTAL_SCULPTURE_POSTER_URL} alt="Static preview of the original FORGE open-frame polyhedron" width="320" height="320" />}
    <div className="cosmic-login-vignette" aria-hidden="true" />
    {failed && <p className="cosmic-scene-notice" role="status">Static model preview · 3D animation unavailable</p>}
    {!failed && modelState !== "ready" && <p className="cosmic-scene-notice" role="status">{modelState === "loading" ? "Loading the original 3D model…" : "Static model preview · 3D animation unavailable"}</p>}
    <div className="cosmic-scene-tools">
      {!failed && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Resume animation" : "Pause animation"}</button>}
      {earthReady && <a href="https://earthdata.nasa.gov/centers/gibs" target="_blank" rel="noreferrer">Earth imagery · NASA GIBS</a>}
    </div>
  </div>;
}
