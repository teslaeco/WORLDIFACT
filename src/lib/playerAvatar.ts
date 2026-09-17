import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { uploadedPlayerGlbUrl } from '../generated/uploadedPlayer.js'

/**
 * Shared WORLDIFACT player avatar.
 *
 * Source: a mobile-optimised GLB derived directly from the model STL uploaded by
 * the owner on 18 Sep 2026. The previous Neptune Queen / rapper substitutions
 * are intentionally not used here.
 */
export function createPlayerAvatar() {
  const root = new THREE.Group()
  root.name = 'worldifact-uploaded-player'
  root.userData.avatarSource = 'owner-upload:model-mm-1.stl'
  root.userData.avatarLoaded = false
  // Invisible layout anchor keeps the world framed while the embedded uploaded
  // GLB is decoded asynchronously. It is not a fallback character.
  const boundsAnchor = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 1.78, 0.01),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  boundsAnchor.position.y = 0.89
  boundsAnchor.name = 'uploaded-avatar-bounds-anchor'
  root.add(boundsAnchor)

  let loaded: THREE.Object3D | null = null
  let baseY = 0
  let last = 0
  let mixer: THREE.AnimationMixer | null = null
  let revoked = false
  let modelUrl = ''

  const releaseUrl = () => {
    if (!revoked && modelUrl) {
      URL.revokeObjectURL(modelUrl)
      revoked = true
    }
  }

  if ('document' in globalThis) {
    void uploadedPlayerGlbUrl().then((url: string) => {
      modelUrl = url
      new GLTFLoader().load(url, gltf => {
        const model = gltf.scene
        const bounds = new THREE.Box3().setFromObject(model)
        const size = bounds.getSize(new THREE.Vector3())
        if (!Number.isFinite(size.y) || size.y <= 0.01) {
          releaseUrl()
          return
        }

        // Normalise the uploaded millimetre-scale character to a 1.78 m game avatar.
        const scale = 1.78 / size.y
        model.scale.setScalar(scale)
        model.updateMatrixWorld(true)
        const scaled = new THREE.Box3().setFromObject(model)
        const center = scaled.getCenter(new THREE.Vector3())
        model.position.x -= center.x
        model.position.z -= center.z
        model.position.y -= scaled.min.y
        baseY = model.position.y
        model.name = 'WORLDIFACT_owner_uploaded_main_character'
        model.traverse(part => {
          if (part instanceof THREE.Mesh) {
            part.castShadow = true
            part.receiveShadow = true
          }
        })
        loaded = model
        root.add(model)
        root.userData.avatarLoaded = true

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model)
          const clip = gltf.animations.find(c => /idle|walk|locomotion/i.test(c.name)) ?? gltf.animations[0]
          mixer.clipAction(clip).reset().play()
        }
        releaseUrl()
      }, undefined, () => {
        root.userData.avatarLoaded = false
        releaseUrl()
      })
    }).catch(() => {
      root.userData.avatarLoaded = false
      releaseUrl()
    })
  }

  return {
    root,
    update(time: number, speed: number, seated = false, reaching = 0) {
      const delta = last ? Math.min(0.05, Math.max(0, time - last)) : 0
      last = time
      mixer?.update(delta)
      if (!loaded) return

      // The uploaded STL-derived contest LOD has no skeletal animation. Keep the
      // exact silhouette and use restrained whole-body motion rather than inventing
      // a different procedural character. If a future exact rigged GLB replaces this
      // derivative, its embedded animation is used automatically above.
      if (!mixer) {
        const gait = Math.min(1, Math.max(0, speed))
        loaded.position.y = baseY + (seated ? -0.24 : Math.abs(Math.sin(time * 7.5)) * 0.012 * gait)
        loaded.rotation.z = seated ? -0.025 : Math.sin(time * 7.5) * 0.012 * gait
        loaded.rotation.x = reaching ? -0.025 * reaching : 0
      }
    },
  }
}
