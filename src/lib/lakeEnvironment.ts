import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import panoramaUrl from "../assets/mirror-lake.webp";

/** The generated panorama supplies the background AND the material lighting. */
export function createLakeEnvironment(scene: THREE.Scene, mobile: boolean, onTextureError: () => void, ocean = false) {
  let disposed = false;
  const water = new Reflector(new THREE.PlaneGeometry(ocean ? 400 : 220, ocean ? 400 : 28), {
    color: 0x91b6c0,
    textureWidth: mobile ? 512 : 768,
    textureHeight: mobile ? 512 : 768,
    clipBias: 0.003,
    multisample: 0,
    shader: {
      uniforms: {
        color: { value: new THREE.Color() },
        tDiffuse: { value: null },
        textureMatrix: { value: new THREE.Matrix4() },
        time: { value: 0 },
        river: { value: ocean ? 0 : 1 },
      },
      vertexShader: `
        uniform mat4 textureMatrix;
        varying vec4 vUv;
        varying vec3 vLakePosition;
        void main() {
          vUv = textureMatrix * vec4(position, 1.0);
          vLakePosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec3 color;
        uniform float time;
        uniform float river;
        varying vec4 vUv;
        varying vec3 vLakePosition;
        void main() {
          vec2 ground = vec2(vLakePosition.x, -vLakePosition.y);
          bool channel = abs(ground.y) <= 4.5;
          bool labPool = distance(ground, vec2(8.0, -10.0)) < 2.4;
          bool tributary = abs(ground.x - 8.0) < 1.5 && ground.y < -4.0 && ground.y > -10.0;
          if (river > 0.5 && !(channel || labPool || tributary)) discard;
          vec4 waterUv = vUv;
          waterUv.xy += vec2(sin(vLakePosition.x * 0.7 - time * 1.5), cos(vLakePosition.y * 1.2 + time * 0.8)) * 0.0018 * vUv.w;
          vec4 base = texture2DProj(tDiffuse, waterUv);
          float current = pow(max(0.0, sin(ground.x * 0.9 - time * 2.4 + sin(ground.y * 3.0))), 18.0);
          vec3 reflected = mix(base.rgb, vec3(0.055, 0.32, 0.36), 0.26);
          gl_FragColor = vec4(reflected + current * 0.055, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  // RGBA8 avoids requiring half-float color attachments on Android GPUs.
  water.getRenderTarget().texture.type = THREE.UnsignedByteType;
  water.name = ocean ? "mirror-lake-water" : "flowing-river-and-lab-pool";
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.045;
  scene.add(water);
  scene.background = new THREE.Color("#8098a5");
  scene.fog = new THREE.Fog("#a0b6bb", 95, 205);

  const texture = new THREE.TextureLoader().load(panoramaUrl, loaded => {
    if (disposed) { loaded.dispose(); return; }
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = loaded;
    scene.environment = loaded;
    scene.environmentIntensity = 0.6;
    scene.backgroundRotation.y = Math.PI * 0.7;
    scene.environmentRotation.y = Math.PI * 0.7;
  }, undefined, () => { if (!disposed) onTextureError(); });
  return {
    update(time: number) { (water.material as THREE.ShaderMaterial).uniforms.time.value = time; },
    dispose() {
      disposed = true;
      scene.remove(water);
      water.geometry.dispose();
      water.dispose();
      scene.background = null;
      scene.environment = null;
      texture.dispose();
    },
  };
}
