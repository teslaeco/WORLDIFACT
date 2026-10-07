import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping, AmbientLight, Box3, Color, DirectionalLight, Group, LoadingManager, PerspectiveCamera,
  PMREMGenerator, Scene, Vector3, WebGLRenderer, type WebGLRenderTarget,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js'
import { disposeObject } from '../lib/worldGeometry'
import { createModelSlot } from '../lib/modelSlot'
import { frameModel, type ModelBounds, type ModelView } from '../lib/modelFraming'
import { buildSoftwareModel, inspectEmbeddedGlb, isEmbeddedPreviewImage, ModelPreviewError, readModelPreviewBytes, SOFTWARE_PREVIEW_LIMITS } from '../lib/softwareModelPreview'

type Props = { url: string; label?: string; targetDimensionsMm?: [number, number, number]; customerMode?: boolean }

/** WORLDIFACT viewer; the externally hosted Froge generator is not modified. */
export default function OracleModelPreview({ url, label = 'Generated 3D model', targetDimensionsMm, customerMode = false }: Props) {
  return <ModelPreviewSession key={JSON.stringify([url, label, targetDimensionsMm, customerMode])} url={url} label={label} targetDimensionsMm={targetDimensionsMm} customerMode={customerMode} />
}

function ModelPreviewSession({ url, label, targetDimensionsMm, customerMode }: { url: string; label: string; targetDimensionsMm?: [number, number, number]; customerMode: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const fitView = useRef<((view?: ModelView) => void) | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(customerMode ? 'Loading your preview…' : 'Loading generated GLB…')
  const [person, setPerson] = useState(false)
  const [ready, setReady] = useState(false)
  const [software, setSoftware] = useState(false)

  useEffect(() => {
    const element = host.current
    if (!element) return
    let disposed = false
    const abort = new AbortController()
    let renderer: WebGLRenderer | null = null
    let svg: SVGRenderer | null = null
    let controls: OrbitControls | null = null
    let environment: WebGLRenderTarget | null = null
    let observer: ResizeObserver | null = null
    let redraw: number | null = null
    let model: Group | null = null
    let isPerson = false
    const slot = createModelSlot<{ scene: Group; scenes: Group[] }>(loaded => {
      const resources = new Group()
      for (const scene of new Set(loaded.scenes)) resources.add(scene)
      disposeObject(resources)
      resources.clear()
    })
    const scene = new Scene()
    const camera = new PerspectiveCamera(40, 1, 0.001, 100000)
    let bounds: ModelBounds | null = null
    let preset: ModelView = 'all'
    let framed = false
    let preserveUserOrbit = false
    const interactionStarted = () => { preserveUserOrbit = true }
    const contextLost = (event: Event) => {
      event.preventDefault()
      if (!disposed) { renderer?.setAnimationLoop(null); setReady(false); setSoftware(true) }
    }
    const cleanup = () => {
      if (disposed) return
      disposed = true
      abort.abort()
      observer?.disconnect()
      if (redraw !== null) cancelAnimationFrame(redraw)
      renderer?.domElement.removeEventListener('webglcontextlost', contextLost)
      renderer?.setAnimationLoop(null)
      controls?.removeEventListener('start', interactionStarted)
      controls?.dispose()
      environment?.dispose()
      slot.dispose()
      model = null
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer?.domElement.remove()
      svg?.clear()
      svg?.domElement.remove()
      fitView.current = null
    }
    const drawSoftware = () => {
      if (disposed || !svg || !model || redraw !== null) return
      redraw = requestAnimationFrame(() => {
        redraw = null
        if (!disposed && svg && model) {
          try { svg.render(scene, camera) } catch {
            slot.dispose(); model = null; bounds = null
            svg.clear(); setReady(false)
            setError('The simplified model preview could not be drawn. The original file is still available.')
          }
        }
      })
    }
    const fit = (view: ModelView) => {
      if (!model || !bounds || disposed) return
      const frame = frameModel(bounds, camera.aspect, camera.getEffectiveFOV(), view, isPerson)
      const damping = controls?.enableDamping ?? false
      if (controls) {
        controls.enableDamping = false
        controls.update()
        controls.minDistance = frame.minDistance
        controls.maxDistance = frame.maxDistance
        controls.target.set(...frame.target)
      }
      camera.position.set(...frame.position)
      camera.near = frame.near
      camera.far = frame.far
      camera.updateProjectionMatrix()
      camera.lookAt(...frame.target)
      controls?.update()
      if (controls) controls.enableDamping = damping
      framed = true
      drawSoftware()
    }
    const resize = () => {
      if (disposed) return
      const width = element.clientWidth, height = element.clientHeight
      if (!width || !height) return
      renderer?.setSize(width, height, false)
      // SVG work is bounded and redraws only for resize or an explicit view selection.
      const scale = Math.min(1, 1024 / width, 1024 / height)
      svg?.setSize(width * scale, height * scale)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      if (model && (!framed || !preserveUserOrbit)) fit(preset)
      else drawSoftware()
    }
    setReady(false)
    setError('')
    setStatus(software ? 'Loading a simplified model preview…' : customerMode ? 'Loading your preview…' : 'Loading generated GLB…')
    try {
      if (software) {
        svg = new SVGRenderer()
        svg.setClearColor(new Color('#070e18'), 1)
        svg.setPrecision(3)
        svg.domElement.setAttribute('role', 'img')
        svg.domElement.setAttribute('aria-label', `${label} — simplified untextured model preview`)
        svg.domElement.style.width = '100%'
        svg.domElement.style.height = '100%'
        element.appendChild(svg.domElement)
        // SVGRenderer uses ambient color directly and ignores ambient intensity.
        scene.add(new AmbientLight(new Color().setRGB(0.35, 0.35, 0.35), 1))
      } else {
        renderer = new WebGLRenderer({ antialias: true, alpha: false })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setClearColor(new Color('#070e18'))
        renderer.toneMapping = ACESFilmicToneMapping
        renderer.toneMappingExposure = 1
        renderer.domElement.setAttribute('aria-label', `${label} — drag to rotate, pinch to zoom`)
        renderer.domElement.addEventListener('webglcontextlost', contextLost)
        element.appendChild(renderer.domElement)
        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.addEventListener('start', interactionStarted)
        let pmrem: PMREMGenerator | null = null
        let room: RoomEnvironment | null = null
        try {
          pmrem = new PMREMGenerator(renderer)
          room = new RoomEnvironment()
          environment = pmrem.fromScene(room, 0.04)
          scene.environment = environment.texture
          scene.environmentIntensity = 0.6
        } finally { room?.dispose(); pmrem?.dispose() }
      }
      const key = new DirectionalLight(0xfff4e8, software ? 0.55 : 1.5)
      key.position.set(3, 4, 5)
      scene.add(key)
      const fill = new DirectionalLight(0xc5deff, software ? 0.18 : 0.45)
      fill.position.set(-3, 1, -3)
      scene.add(fill)
      fitView.current = (view = 'all') => { preset = view; preserveUserOrbit = false; fit(view) }
      observer = new ResizeObserver(resize)
      observer.observe(element)
      resize()
      renderer?.setAnimationLoop(() => {
        if (disposed) return
        try { controls?.update(); renderer?.render(scene, camera) }
        catch { renderer?.setAnimationLoop(null); setReady(false); setSoftware(true) }
      })
    } catch {
      cleanup()
      if (!software) setSoftware(true)
      else setError('This device cannot display the simplified model preview. The original file is still available.')
      return cleanup
    }

    void (async () => {
      try {
        const bytes = await readModelPreviewBytes(url, abort.signal, software ? SOFTWARE_PREVIEW_LIMITS.bytes : undefined)
        if (disposed) return
        inspectEmbeddedGlb(bytes)
        let loaded: { scene: Group; scenes: Group[] }
        let softwareBounds: Box3 | null = null, reducedDetail = ''
        if (software) {
          const result = buildSoftwareModel(bytes)
          isPerson = result.person
          softwareBounds = result.bounds
          if (result.sourceTriangles > result.triangles) reducedDetail = ` Geometry is reduced from ${result.sourceTriangles} to ${result.triangles} triangles; small parts and fine details may be missing.`
          loaded = { scene: result.model, scenes: [result.model] }
        } else {
          // Source validation guarantees embedded images; allow only internal Blob or bounded embedded image data URLs.
          const manager = new LoadingManager()
          manager.setURLModifier(resource => {
            if (!resource.startsWith('blob:') && !isEmbeddedPreviewImage(resource)) throw new ModelPreviewError('External model resources are not supported in this preview.')
            return resource
          })
          loaded = await new GLTFLoader(manager).parseAsync(bytes, '')
        }
        if (!slot.replace(loaded)) return
        model = loaded.scene
        model.traverse(object => { if (object.userData.froge_kind === 'person') isPerson = true })
        let box = softwareBounds?.clone() ?? new Box3().setFromObject(model)
        if (targetDimensionsMm && targetDimensionsMm.every(n => Number.isFinite(n) && n > 0)) {
          const source = box.getSize(new Vector3())
          if (source.x > 0 && source.y > 0 && source.z > 0) {
            model.scale.set(targetDimensionsMm[0] / source.x, targetDimensionsMm[1] / source.y, targetDimensionsMm[2] / source.z)
            model.updateMatrixWorld(true)
            box = softwareBounds ? softwareBounds.clone().applyMatrix4(model.matrix) : new Box3().setFromObject(model)
          }
        }
        bounds = { min: box.min.toArray(), max: box.max.toArray() }
        frameModel(bounds, camera.aspect, camera.getEffectiveFOV())
        setPerson(isPerson)
        scene.add(model)
        framed = false
        resize()
        setReady(true)
        setStatus(software
          ? `Simplified untextured preview of your model.${reducedDetail} Base colors only; textures, lighting effects and fine appearance may differ. The original file is unchanged.`
          : customerMode ? 'Preview ready.' : 'GENERATED-UNREVIEWED GLB loaded in the browser; visual review is still required.')
      } catch (cause) {
        if (disposed) return
        renderer?.setAnimationLoop(null)
        slot.dispose()
        model = null
        bounds = null
        setReady(false)
        setError(cause instanceof ModelPreviewError ? `${cause.message} The original file is still available.` : customerMode ? 'Your model preview could not be rendered. The original file is still available.' : 'The generated GLB could not be rendered. The artifact remains available for explicit download.')
      }
    })()
    return cleanup
  }, [url, label, targetDimensionsMm, customerMode, software])

  return <div className="oracle-model-preview">
    <p role={error ? 'alert' : 'status'} className="result-note">{error || status}</p>
    <div ref={host} className="oracle-model-canvas" hidden={!!error} />
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
      <span className="result-note">{ready ? software ? 'Choose a view · simplified image' : 'Drag to rotate · pinch to zoom' : ''}</span>
    </div>
    {!customerMode && <small className="result-note">Views use the model’s authored +Y up / +Z front axes. Character detail regions are approximate. Switching views does not regenerate or alter the model.</small>}
  </div>
}
