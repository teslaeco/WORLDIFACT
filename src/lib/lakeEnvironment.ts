import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import panoramaUrl from "../assets/mirror-lake.webp";

/** The generated panorama supplies the background AND the material lighting. */
export function createLakeEnvironment(scene: THREE.Scene, mobile: boolean, onTextureError: () => void) {
  let disposed = false;
  const water = new Reflector(new THREE.PlaneGeometry(400, 400), {
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
        varying vec4 vUv;
        varying vec3 vLakePosition;
        void main() {
          vec4 waterUv = vUv;
          waterUv.xy += vec2(sin(vLakePosition.x * 0.34 + time * 0.4), cos(vLakePosition.y * 0.27 - time * 0.32)) * 0.00045 * vUv.w;
          vec4 base = texture2DProj(tDiffuse, waterUv);
          gl_FragColor = vec4(mix(base.rgb, base.rgb * color, 0.14), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  // RGBA8 avoids requiring half-float color attachments on Android GPUs.
  water.getRenderTarget().texture.type = THREE.UnsignedByteType;
  water.name = "mirror-lake-water";
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.035;
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
