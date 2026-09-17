import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, PerspectiveCamera,
  PMREMGenerator, Scene, WebGLRenderer, type Group,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { disposeObject } from '../lib/worldGeometry'
import { createModelSlot } from '../lib/modelSlot'
import { frameModel, type ModelBounds, type ModelView } from '../lib/modelFraming'

type Props = { url: string; label?: string }

/** WORLDIFACT viewer; the externally hosted Froge generator is not modified. */
export default function OracleModelPreview({ url, label = 'Generated 3D model' }: Props) {
  return <ModelPreviewSession key={JSON.stringify([url, label])} url={url} label={label} />
}

function ModelPreviewSession({ url, label }: { url: string; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const fitView = useRef<((view?: ModelView) => void) | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Loading generated GLB…')
  const [person, setPerson] = useState(false)
  const [ready, setReady] = useState(false)

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

    let bounds: ModelBounds | null = null
    let preset: ModelView = 'all'
    let framed = false
    let preserveUserOrbit = false
    const interactionStarted = () => { preserveUserOrbit = true }
    controls.addEventListener('start', interactionStarted)

    const fit = (view: ModelView) => {
      if (!model || !bounds) return
      const frame = frameModel(bounds, camera.aspect, camera.getEffectiveFOV(), view, isPerson)
      // Finish old damping before applying a preset so residual drag cannot move it.
      const damping = controls.enableDamping
      controls.enableDamping = false
      controls.update()
      controls.minDistance = frame.minDistance
      controls.maxDistance = frame.maxDistance
      controls.target.set(...frame.target)
      camera.position.set(...frame.position)
      camera.near = frame.near
      camera.far = frame.far
      camera.updateProjectionMatrix()
      controls.update()
      controls.enableDamping = damping
      framed = true
    }
    fitView.current = (view = 'all') => {
      preset = view
      preserveUserOrbit = false
      fit(view)
    }
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      // Refit the selected preset on orientation/layout changes, but do not
      // discard a manually chosen orbit/zoom because a phone keyboard resized UI.
      if (model && (!framed || !preserveUserOrbit)) fit(preset)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    const loader = new GLTFLoader()
    loader.load(url, gltf => {
      if (!slot.replace(gltf.scene)) return
      model = gltf.scene
      model.traverse(object => { if (object.userData.froge_kind === 'person') isPerson = true })
      const box = new Box3().setFromObject(model)
      bounds = { min: box.min.toArray(), max: box.max.toArray() }
      try {
        // Validate before rendering; input geometry/materials are never rescaled.
        frameModel(bounds, camera.aspect, camera.getEffectiveFOV())
      } catch {
        slot.dispose()
        model = null
        bounds = null
        setError('The GLB has empty or invalid bounds. The source artifact was not modified.')
        return
      }
      setPerson(isPerson)
      scene.add(model)
      framed = false
      resize()
      setReady(true)
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
      controls.removeEventListener('start', interactionStarted)
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
      <button disabled={!ready} onClick={() => fitView.current?.('all')}>Whole model</button>
      <button disabled={!ready} onClick={() => fitView.current?.('front')}>Front</button>
      <button disabled={!ready} onClick={() => fitView.current?.('left')}>Left side</button>
      <button disabled={!ready} onClick={() => fitView.current?.('right')}>Right side</button>
      <button disabled={!ready} onClick={() => fitView.current?.('back')}>Back</button>
      {person ? <>
        <button disabled={!ready} onClick={() => fitView.current?.('face')}>Face</button>
        <button disabled={!ready} onClick={() => fitView.current?.('clothes')}>Clothes</button>
        <button disabled={!ready} onClick={() => fitView.current?.('shoes')}>Shoes</button>
      </> : null}
      <span className="result-note">Drag to rotate · pinch to zoom</span>
    </div>
    <small className="result-note">Views use the model’s authored +Y up / +Z front axes. Character detail regions are approximate. Switching views does not regenerate or alter the model.</small>
  </div>
}
