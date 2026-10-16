import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './GpuTrialsPage.css'

type PublishedModel = {
  id: 'chess-cube-512-led-rook' | 'ecomech-asymmetric-mechanical-study' | 'halloween-multi-asset-room-study'
  name: string
  gpu: string
  gpuName: string
  assetPath: string
  bytes: number
  sha256: string
  triangleCount: number
  meshCount: number
  embeddedPbrTexture: true
  type: 'GPU_PROCEDURAL_TEST_NOT_PHOTO_RECONSTRUCTION'
  imageSimilarity: 'NOT_MEASURED'
  astraGenerated: false
  makeReady: false
}

type PublishedManifest = {
  revision: 'worldifact-gpu-trials-public-v1'
  sourceRunId: number
  models: PublishedModel[]
}

const expectedIds = [
  'chess-cube-512-led-rook',
  'ecomech-asymmetric-mechanical-study',
  'halloween-multi-asset-room-study',
] as const

function parseManifest(raw: unknown): PublishedManifest {
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_MANIFEST')
  const value = raw as Partial<PublishedManifest>
  if (value.revision !== 'worldifact-gpu-trials-public-v1' ||
      !Number.isSafeInteger(value.sourceRunId) || Number(value.sourceRunId) < 1 ||
      !Array.isArray(value.models) || value.models.length !== 3) throw new Error('INVALID_GPU_RUN')
  for (const id of expectedIds) {
    const model = value.models.find(item => item && item.id === id)
    if (!model || model.type !== 'GPU_PROCEDURAL_TEST_NOT_PHOTO_RECONSTRUCTION' ||
        model.astraGenerated !== false || model.imageSimilarity !== 'NOT_MEASURED' ||
        model.makeReady !== false || model.embeddedPbrTexture !== true ||
        typeof model.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(model.sha256) ||
        model.assetPath !== `/gpu-trials/assets/${id}.glb` ||
        !Number.isSafeInteger(model.bytes) || model.bytes < 100 ||
        !Number.isSafeInteger(model.triangleCount) || model.triangleCount < 500 ||
        !Number.isSafeInteger(model.meshCount) || model.meshCount < 14 ||
        typeof model.gpu !== 'string' || typeof model.gpuName !== 'string' ||
        model.gpu.length > 16 || model.gpuName.length > 120 ||
        typeof model.name !== 'string' || model.name.length > 100) throw new Error('INVALID_MODEL_EVIDENCE')
  }
  return value as PublishedManifest
}

function Preview({ model }: { model: PublishedModel }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading'|'ready'|'fallback'>('loading')
  useEffect(() => {
    const target = host.current
    if (!target) return
    setState('loading')
    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let resize: ResizeObserver | null = null
    let frame = 0
    let content: THREE.Group | null = null
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#10171e')
    const camera = new THREE.PerspectiveCamera(48, 1, .01, 10000)
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      target.appendChild(renderer.domElement)
      renderer.domElement.setAttribute('aria-label', `Interactive 3D preview of ${model.name}`)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.enablePan = true
      scene.add(new THREE.HemisphereLight('#d6faff', '#374355', 2.2))
      const key = new THREE.DirectionalLight('#ffffff', 3.5)
      key.position.set(4, 8, 6)
      scene.add(key)
      const fill = new THREE.DirectionalLight('#64ffcf', 1.6)
      fill.position.set(-6, 3, -3)
      scene.add(fill)
      const currentRenderer = renderer
      const currentControls = controls
      resize = new ResizeObserver(() => {
        if (!target.clientWidth || !target.clientHeight) return
        currentRenderer.setSize(target.clientWidth, target.clientHeight, false)
        camera.aspect = target.clientWidth / target.clientHeight
        camera.updateProjectionMatrix()
      })
      resize.observe(target)
      const loader = new GLTFLoader()
      loader.load(model.assetPath, gltf => {
        if (disposed) {
          gltf.scene.traverse(obj => {
            if (obj instanceof THREE.Mesh) obj.geometry.dispose()
          })
          return
        }
        content = gltf.scene
        scene.add(content)
        const bounds = new THREE.Box3().setFromObject(content)
        const size = bounds.getSize(new THREE.Vector3())
        const centre = bounds.getCenter(new THREE.Vector3())
        const radius = Math.max(size.x, size.y, size.z)
        if (!(radius > 0) || !Number.isFinite(radius)) {
          setState('fallback')
          return
        }
        currentControls.target.copy(centre)
        camera.position.copy(centre).add(new THREE.Vector3(radius * 1.7, radius * 1.1, radius * 2))
        camera.near = Math.max(radius * .001, .01)
        camera.far = Math.max(radius * 20, 100)
        camera.updateProjectionMatrix()
        currentControls.update()
        setState('ready')
      }, undefined, () => { if (!disposed) setState('fallback') })
      const animate = () => {
        if (disposed) return
        currentControls.update()
        currentRenderer.render(scene, camera)
        frame = requestAnimationFrame(animate)
      }
      animate()
    } catch {
      setState('fallback')
    }
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resize?.disconnect()
      controls?.dispose()
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const material of materials) {
            if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose()
            material.dispose()
          }
        }
      })
      renderer?.dispose()
      renderer?.domElement.remove()
    }
  }, [model.assetPath, model.name])
  return <div className="gpu-trials-preview" ref={host}>
    {state === 'loading' && <p className="gpu-trials-overlay">Loading actual GLB geometry…</p>}
    {state === 'fallback' && <p className="gpu-trials-overlay">3D preview unavailable on this device. Download and open the GLB in a compatible viewer.</p>}
  </div>
}

export default function GpuTrialsPage() {
  const [models, setModels] = useState<PublishedManifest | null>(null)
  const [status, setStatus] = useState<'loading'|'empty'|'ready'>('loading')
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/gpu-trials/manifest.json', { credentials: 'omit', cache: 'no-store', signal: ctl.signal })
      .then(async response => {
        if (!response.ok) throw new Error('NO_PUBLISHED_GPU_RESULTS')
        return parseManifest(await response.json())
      })
      .then(manifest => {
        setModels(manifest)
        setSelected(manifest.models[0].id)
        setStatus('ready')
      })
      .catch(() => { if (!ctl.signal.aborted) setStatus('empty') })
    return () => ctl.abort()
  }, [])

  const active = models?.models.find(m => m.id === selected)
  return <main className="gpu-trials-page">
    <header className="gpu-trials-header">
      <a href="/world">← Back to WORLDIFACT</a>
      <span className="gpu-trials-eyebrow">3D ENGINEERING LAB · PUBLIC GPU QUALIFICATION</span>
      <h1>Three GPUs. Three real 3D models.</h1>
      <p>Rotate the geometry, examine embedded PBR textures and download the verified GLB. These are procedural test assets, <strong>not</strong> photorealistic reconstructions from reference images, and not manufacturing-approved.</p>
    </header>
    {status === 'loading' && <p role="status">Checking verified GPU results…</p>}
    {status === 'empty' && <section className="gpu-trials-empty" role="status">
      <h2>GPU results are not published yet</h2>
      <p>Models will appear after a real RunPod job, file hash verification, teardown of temporary GPU resources and release checks. Offline CPU fixtures are available separately in the GitHub Actions test report.</p>
      <a href="https://github.com/teslaeco/WORLDIFACT/actions/workflows/three-gpu-trials-offline.yml" target="_blank" rel="noreferrer">View independent offline tests ↗</a>
    </section>}
    {status === 'ready' && models && <section className="gpu-trials-results" aria-label="Verified procedural GPU models">
      <nav className="gpu-trials-selector" aria-label="Select model">
        {models.models.map(m => <button key={m.id} onClick={() => setSelected(m.id)}
          className={m.id === selected ? 'gpu-trials-current' : ''} aria-pressed={m.id === selected}>
          <strong>{m.name}</strong><span>{m.gpu} · {m.triangleCount.toLocaleString()} triangles</span>
        </button>)}
      </nav>
      {active && <article className="gpu-trials-viewer" key={active.id}>
        <Preview model={active}/>
        <div className="gpu-trials-details">
          <h2>{active.name}</h2>
          <p>GPU: {active.gpuName}. Geometry: {active.meshCount} meshes, {active.triangleCount.toLocaleString()} triangles. Texture: embedded PBR base color.</p>
          <p className="gpu-trials-disclosure">PROCEDURAL · GPU TEST · NOT ASTRA · NOT PHOTO RECONSTRUCTION · MAKE NOT VALIDATED</p>
          <a className="gpu-trials-download" href={active.assetPath} download={active.id + '.glb'}>Download genuine textured GLB</a>
          <p className="gpu-trials-hash">SHA-256: <code>{active.sha256}</code></p>
        </div>
      </article>}
      <p className="gpu-trials-receipt">Evidence: <a target="_blank" rel="noreferrer" href={`https://github.com/teslaeco/WORLDIFACT/actions/runs/${models.sourceRunId}`}>GitHub Actions run #{models.sourceRunId} ↗</a>. Provider compute and model likeness are separate from these procedural qualification results.</p>
    </section>}
  </main>
}
