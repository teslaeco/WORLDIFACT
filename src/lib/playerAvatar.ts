import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const AVATAR_PARTS = 6
const TARGET_HEIGHT = 1.78

function proceduralUploadedFallback() {
  const root = new THREE.Group()
  root.name = 'uploaded-avatar-fallback'
  const skin = new THREE.MeshStandardMaterial({ color: '#b78364', roughness: .75 })
  const teal = new THREE.MeshStandardMaterial({ color: '#087f78', roughness: .45, metalness: .18 })
  const dark = new THREE.MeshStandardMaterial({ color: '#10202a', roughness: .7 })
  const hair = new THREE.MeshStandardMaterial({ color: '#201713', roughness: .82 })
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    root.add(mesh)
    return mesh
  }
  part(new THREE.CapsuleGeometry(.17, .42, 6, 10), teal, 0, 1.16)
  part(new THREE.ConeGeometry(.27, .34, 7), teal, 0, .86)
  const head = part(new THREE.SphereGeometry(.145, 18, 14), skin, 0, 1.61)
  head.scale.set(.92, 1.08, .95)
  const bun = part(new THREE.SphereGeometry(.09, 14, 10), hair, 0, 1.79, .015)
  bun.scale.set(.9, 1.15, .9)
  for (const side of [-1, 1]) {
    const arm = part(new THREE.CapsuleGeometry(.048, .44, 6, 8), skin, side * .235, 1.13)
    arm.rotation.z = side * .09
    part(new THREE.CapsuleGeometry(.062, .56, 6, 8), skin, side * .09, .43)
    part(new THREE.BoxGeometry(.13, .09, .23), dark, side * .09, .08, -.04)
    const shoulder = part(new THREE.ConeGeometry(.12, .28, 4), teal, side * .245, 1.39)
    shoulder.rotation.z = side * Math.PI / 2
  }
  const orb = part(new THREE.SphereGeometry(.11, 18, 12), new THREE.MeshStandardMaterial({ color:'#55d7d0', emissive:'#0c6f6a', emissiveIntensity:.5 }), -.35, 1.08, -.02)
  orb.userData.decorative = true
  root.userData.avatarSource = 'user-upload-derived-fallback'
  return root
}

async function loadUploadedGlb() {
  const texts = await Promise.all(Array.from({ length: AVATAR_PARTS }, async (_, index) => {
    const response = await fetch(`/avatar/upload-main-gz.b64.part${index}`, { cache: 'force-cache' })
    if (!response.ok) throw new Error('avatar-part')
    return response.text()
  }))
  const packed = texts.join('')
  const raw = atob(packed)
  const gzip = Uint8Array.from(raw, char => char.charCodeAt(0))
  const stream = new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  if (buffer.byteLength < 20) throw new Error('avatar-empty')
  const bytes = new Uint8Array(buffer)
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'glTF') throw new Error('avatar-invalid')
  return buffer
}

export function createPlayerAvatar() {
  const root = new THREE.Group()
  root.name = 'worldifact-user-upload-player'
  root.userData.avatarSource = 'user-upload:model-mm-1-derived-mobile'
  const fallback = proceduralUploadedFallback()
  root.add(fallback)
  let loaded: THREE.Object3D | null = null
  let loadedBaseY = 0

  if ('document' in globalThis && 'DecompressionStream' in globalThis) {
    void loadUploadedGlb().then(buffer => {
      new GLTFLoader().parse(buffer, '', gltf => {
        const model = gltf.scene
        const bounds = new THREE.Box3().setFromObject(model)
        const size = bounds.getSize(new THREE.Vector3())
        if (!Number.isFinite(size.y) || size.y <= .01) return
        const scale = TARGET_HEIGHT / size.y
        model.scale.setScalar(scale)
        model.updateMatrixWorld(true)
        const scaled = new THREE.Box3().setFromObject(model)
        const center = scaled.getCenter(new THREE.Vector3())
        model.position.x -= center.x
        model.position.z -= center.z
        model.position.y -= scaled.min.y
        loadedBaseY = model.position.y
        model.name = 'WORLDIFACT_uploaded_main_avatar'
        model.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true
            object.receiveShadow = true
            if (Array.isArray(object.material)) object.material.forEach(material => { material.side = THREE.FrontSide })
            else object.material.side = THREE.FrontSide
          }
        })
        fallback.visible = false
        loaded = model
        root.add(model)
        root.userData.avatarLoaded = true
      }, () => { root.userData.avatarLoaded = false })
    }).catch(() => { root.userData.avatarLoaded = false })
  }

  return {
    root,
    update(time: number, speed: number, seated = false, reaching = 0) {
      const visual = loaded ?? fallback
      const moving = Math.min(Math.max(speed, 0), 1)
      const gait = Math.sin(time * 7.2) * moving
      visual.position.y = (loaded ? loadedBaseY : 0) + (seated ? -.38 : Math.sin(time * (moving > .05 ? 7.2 : 1.7)) * (moving > .05 ? .018 : .004))
      visual.rotation.z = gait * .018 + Math.sin(time * .7) * .004
      visual.rotation.x = seated ? -.08 : Math.abs(gait) * .01
      if (reaching > .05) visual.rotation.y = Math.sin(time * 2.4) * .03 * reaching
    },
  }
}
