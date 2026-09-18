import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type DemoShopKind = 'tower' | 'character' | 'vehicle' | 'object'

export function demoShopKind(prompt: string): DemoShopKind {
  const value = prompt.toLowerCase()
  if (/(tower|building|house|skyscraper|wież|budyn|dom)/.test(value)) return 'tower'
  if (/(character|person|figur|human|posta|astronaut|queen)/.test(value)) return 'character'
  if (/(car|vehicle|rover|truck|auto|pojazd|samoch)/.test(value)) return 'vehicle'
  return 'object'
}

function buildDemo(kind: DemoShopKind) {
  const group = new THREE.Group()
  const main = new THREE.MeshStandardMaterial({ color: '#75b7c9', roughness: 0.45, metalness: 0.18 })
  const accent = new THREE.MeshStandardMaterial({ color: '#d6bf82', roughness: 0.38, metalness: 0.22 })
  const dark = new THREE.MeshStandardMaterial({ color: '#263b46', roughness: 0.65, metalness: 0.08 })
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, scale: [number, number, number] = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.scale.set(...scale)
    group.add(mesh)
    return mesh
  }

  if (kind === 'tower') {
    add(new THREE.BoxGeometry(2.8, 0.35, 2.4), dark, 0, 0.18, 0)
    for (let i = 0; i < 6; i++) {
      const width = 2.4 - i * 0.22
      const depth = 2.0 - i * 0.14
      add(new THREE.BoxGeometry(width, 0.62, depth), i % 2 ? accent : main, 0, 0.62 + i * 0.62, i * 0.04)
    }
  } else if (kind === 'character') {
    add(new THREE.CylinderGeometry(0.48, 0.6, 1.7, 20), main, 0, 1.2, 0)
    add(new THREE.SphereGeometry(0.45, 24, 18), accent, 0, 2.35, 0)
    add(new THREE.CylinderGeometry(0.13, 0.13, 1.35, 12), dark, -0.28, 0.05, 0)
    add(new THREE.CylinderGeometry(0.13, 0.13, 1.35, 12), dark, 0.28, 0.05, 0)
    const left = add(new THREE.CylinderGeometry(0.1, 0.1, 1.25, 12), accent, -0.72, 1.28, 0)
    left.rotation.z = -0.25
    const right = add(new THREE.CylinderGeometry(0.1, 0.1, 1.25, 12), accent, 0.72, 1.28, 0)
    right.rotation.z = 0.25
  } else if (kind === 'vehicle') {
    add(new THREE.BoxGeometry(2.8, 0.7, 1.55), main, 0, 0.75, 0)
    add(new THREE.BoxGeometry(1.25, 0.7, 1.35), accent, -0.2, 1.35, 0)
    for (const x of [-0.95, 0.95]) for (const z of [-0.72, 0.72]) {
      const wheel = add(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 18), dark, x, 0.38, z)
      wheel.rotation.x = Math.PI / 2
    }
  } else {
    add(new THREE.IcosahedronGeometry(1.25, 1), main, 0, 1.35, 0)
    add(new THREE.TorusGeometry(1.55, 0.08, 10, 48), accent, 0, 1.35, 0).rotation.x = Math.PI / 2
    add(new THREE.CylinderGeometry(0.8, 1.05, 0.35, 24), dark, 0, 0.18, 0)
  }
  return group
}

export default function DemoShopPreview({ prompt }: { prompt: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const kind = demoShopKind(prompt)

  useEffect(() => {
    const element = host.current
    if (!element) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) }
    catch { setFailed(true); return }

    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
    renderer.setClearColor('#07111a')
    renderer.outputColorSpace = THREE.SRGBColorSpace
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(5.2, 4.2, 6.2)
    scene.add(new THREE.HemisphereLight('#eaf7ff', '#22343b', 2.2))
    const key = new THREE.DirectionalLight('#fff1d0', 3)
    key.position.set(4, 6, 5)
    scene.add(key)
    const model = buildDemo(kind)
    scene.add(model)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.copy(center)
    controls.update()

    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      model.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => material.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [kind])

  return <div className="demo-shop-preview">
    <div ref={host} className="demo-shop-canvas" aria-label="DEMO local procedural 3D preview" />
    <p className="demo-shop-label"><strong>DEMO · MOCK</strong> Local procedural {kind} preview. No GPT-6 Astra, Oracle or paid generation request was made.</p>
    {failed && <p role="alert">3D DEMO preview is unavailable on this device.</p>}
  </div>
}
