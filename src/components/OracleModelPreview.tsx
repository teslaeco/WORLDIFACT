import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
  type Group,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { disposeObject } from '../lib/worldGeometry'
import { createModelSlot } from '../lib/modelSlot'

type View = 'all' | 'face' | 'clothes' | 'shoes' | 'back'
type Props = { url: string; label?: string }

/** WORLDIFACT viewer; the externally hosted Froge generator is not modified. */
export default function OracleModelPreview({ url, label = 'Generated 3D model' }: Props) {
  // A new source gets clean loading/error state before it can show an old result.
  return <ModelPreviewSession key={JSON.stringify([url, label])} url={url} label={label} />
}

function ModelPreviewSession({ url, label }: { url: string; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const fitView = useRef<((view?: View) => void) | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Loading generated GLB…')
  const [person, setPerson] = useState(false)

  useEffect(() => {
    const element = host.current
    if (!element) return
    let disposed = false
    let renderer: WebGLRenderer
    let model: Group | null = null
    let isPerson = false
    const slot = createModelSlot<Group>(loaded => {
      loaded.removeFromParent()
      disposeObject(loaded)
    })

    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      setError('WebGL is unavailable on this device. The GLB can still be downloaded explicitly.')
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(new Color('#070e18'))
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.domElement.setAttribute('aria-label', `${label} — drag to rotate, pinch to zoom`)
    element.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(40, 1, 0.001, 100000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const pmrem = new PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    const environment = pmrem.fromScene(room, 0.04)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.6
    room.dispose()
    pmrem.dispose()

    const key = new DirectionalLight(0xfff4e8, 1.5)
    key.position.set(3, 4, 5)
    scene.add(key)
    const fill = new DirectionalLight(0xc5deff, 0.45)
    fill.position.set(-3, 1, -3)
    scene.add(fill)

    let box = new Box3()
    let center = new Vector3()
    let size = new Vector3(1, 1, 1)
    let max = 1

    const fit = (view: View = 'all') => {
      if (!model) return
      const vertical = camera.fov * Math.PI / 360
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
      const framing = box.clone()
      // Use this load's metadata, not React state as an effect dependency.
      if (isPerson && view !== 'all' && view !== 'back') {
        const [low, high, breadth] = view === 'face' ? [0.8, 1, 0.38] : view === 'shoes' ? [0, 0.2, 0.85] : [0.38, 0.84, 1]
        framing.min.y = box.min.y + size.y * low
        framing.max.y = box.min.y + size.y * high
        framing.min.x = center.x - size.x * breadth / 2
        framing.max.x = center.x + size.x * breadth / 2
      }
      const target = framing.getCenter(new Vector3())
      const direction = new Vector3(view === 'face' ? 0.12 : 0.55, view === 'shoes' ? 0.7 : 0.18, view === 'back' ? -1.7 : 1.7).normalize()
      const right = new Vector3(0, 1, 0).cross(direction).normalize()
      const up = direction.clone().cross(right).normalize()
      let distance = 0
      for (const x of [framing.min.x, framing.max.x]) for (const y of [framing.min.y, framing.max.y]) for (const z of [framing.min.z, framing.max.z]) {
        const offset = new Vector3(x, y, z).sub(target)
        distance = Math.max(
          distance,
          Math.abs(offset.dot(right)) / Math.tan(horizontal) + offset.dot(direction),
          Math.abs(offset.dot(up)) / Math.tan(vertical) + offset.dot(direction),
        )
      }
      controls.minDistance = Math.max(max * 0.08, 0.001)
      controls.maxDistance = Math.max(max * 12, 1)
      controls.target.copy(target)
      camera.position.copy(target).add(direction.multiplyScalar(Math.max(distance * 1.12, max * 0.8)))
      camera.near = Math.max(max / 1000, 0.0001)
      camera.far = Math.max(max * 100, 100)
      camera.updateProjectionMatrix()
      controls.update()
    }
    fitView.current = fit

    let framed = false
    const resize = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      if (!framed && model) { fit(); framed = true }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    const loader = new GLTFLoader()
    loader.load(url, gltf => {
      // Even a load that completes after unmount owns disposable GPU resources.
      if (!slot.replace(gltf.scene)) return
      model = gltf.scene
      model.traverse(object => { if (object.userData.froge_kind === 'person') isPerson = true })
      box = new Box3().setFromObject(model)
      center = box.getCenter(new Vector3())
      size = box.getSize(new Vector3())
      if (box.isEmpty() || ![...center.toArray(), ...size.toArray()].every(Number.isFinite)) {
        slot.dispose()
        model = null
        setError('The GLB has empty or invalid bounds. The source artifact was not modified.')
        return
      }
      max = Math.max(size.x, size.y, size.z, 0.001)
      setPerson(isPerson)
      scene.add(model)
      framed = false
      resize()
      fit()
      setStatus('GENERATED-UNREVIEWED GLB loaded in the browser; visual review is still required.')
    }, undefined, () => {
      if (!disposed) setError('The generated GLB could not be rendered. The artifact remains available for explicit download.')
    })

    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      disposed = true
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      environment.dispose()
      slot.dispose()
      model = null
      renderer.dispose()
      renderer.domElement.remove()
      fitView.current = null
    }
  }, [url, label])

  return <div className="oracle-model-preview">
    <div ref={host} className="oracle-model-canvas" />
    <p role="status" className="result-note">{error || status}</p>
    <div className="scene-toolbar" aria-label="Generated model views">
      <button onClick={() => fitView.current?.('all')}>Whole model</button>
      {person ? <>
        <button onClick={() => fitView.current?.('face')}>Face</button>
        <button onClick={() => fitView.current?.('clothes')}>Clothes</button>
        <button onClick={() => fitView.current?.('shoes')}>Shoes</button>
        <button onClick={() => fitView.current?.('back')}>Back</button>
      </> : null}
      <span className="result-note">Drag to rotate · pinch to zoom</span>
    </div>
  </div>
}
