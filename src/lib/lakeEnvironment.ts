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
        varying vec3 vWorldPosition;
        void main() {
          vUv = textureMatrix * vec4(position, 1.0);
          vLakePosition = position;
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
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
        varying vec3 vWorldPosition;
        void main() {
          vec2 ground = vec2(vLakePosition.x, -vLakePosition.y);
          float width = 4.6 + sin(ground.x * 0.13) * 0.22 + sin(ground.x * 0.39) * 0.12;
          float bank = width - abs(ground.y);
          if (river > 0.5 && bank < 0.0) discard;
          vec2 flow = vec2(ground.x - time * 1.65, ground.y);
          float wave1 = sin(flow.x * 2.6 + sin(flow.y * 1.8));
          float wave2 = sin(flow.x * 5.8 - flow.y * 3.1 + time * 0.7);
          float wave3 = sin(flow.x * 12.3 + flow.y * 6.7);
          vec2 slope = vec2(wave1 * 0.055 + wave3 * 0.013, wave2 * 0.045);
          vec4 waterUv = vUv;
          waterUv.xy += slope * 0.12 * vUv.w;
          vec3 reflected = texture2DProj(tDiffuse, waterUv).rgb;
          vec3 view = normalize(cameraPosition - vWorldPosition);
          vec3 normal = normalize(vec3(slope.x, 1.0, slope.y));
          float fresnel = 0.08 + 0.54 * pow(1.0 - max(dot(view, normal), 0.0), 3.0);
          float shallow = 1.0 - smoothstep(0.0, 1.2, bank);
          vec3 bed = mix(vec3(0.025, 0.17, 0.19), vec3(0.18, 0.28, 0.22), shallow);
          float ripple = pow(max(0.0, wave1 * wave2), 8.0);
          float foam = shallow * pow(max(0.0, sin(flow.x * 7.0 + sin(flow.y * 11.0))), 12.0);
          vec3 halfLight = normalize(view + normalize(vec3(0.45, 0.8, 0.3)));
          float sparkle = pow(max(dot(normal, halfLight), 0.0), 120.0);
          gl_FragColor = vec4(mix(bed, reflected, fresnel) + ripple * 0.035 + foam * 0.11 + sparkle * 0.2, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  // RGBA8 avoids requiring half-float color attachments on Android GPUs.
  water.getRenderTarget().texture.type = THREE.UnsignedByteType;
  water.name = ocean ? "mirror-lake-water" : "flowing-river";
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
