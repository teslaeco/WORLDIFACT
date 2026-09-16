import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

type Props = {
  url: string
  label?: string
}

export default function OracleModelPreview({ url, label = 'Generated 3D model' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [status, setStatus] = useState('Loading generated GLB…')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x102027)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10_000)
    camera.position.set(2.4, 1.8, 3.2)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch {
      setStatus('WebGL is unavailable on this device. The GLB can still be downloaded explicitly.')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const hemi = new THREE.HemisphereLight(0xffffff, 0x20343c, 2.5)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 3)
    key.position.set(4, 7, 5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xaadfff, 1.5)
    fill.position.set(-4, 2, -3)
    scene.add(fill)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.05
    controls.maxDistance = 500

    let model: THREE.Object3D | null = null
    let raf = 0
    let disposed = false

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth)
      const height = Math.max(1, canvas.clientHeight)
      if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const frame = () => {
      if (disposed) return
      resize()
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const loader = new GLTFLoader()
    loader.load(
      url,
      gltf => {
        if (disposed) return
        model = gltf.scene
        scene.add(model)
        const box = new THREE.Box3().setFromObject(model)
        if (box.isEmpty()) {
          setStatus('GLB loaded, but no visible mesh was found.')
          return
        }
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        model.position.sub(center)
        const maxDim = Math.max(size.x, size.y, size.z, 0.01)
        const distance = maxDim * 1.7
        camera.near = Math.max(maxDim / 10_000, 0.001)
        camera.far = Math.max(distance * 50, 100)
        camera.position.set(distance * 0.75, distance * 0.45, distance)
        camera.updateProjectionMatrix()
        controls.target.set(0, 0, 0)
        controls.minDistance = maxDim * 0.15
        controls.maxDistance = maxDim * 12
        controls.update()
        setStatus('REAL · GENERATED-UNREVIEWED · drag to rotate, pinch/wheel to zoom')
      },
      undefined,
      () => {
        if (!disposed) setStatus('The generated GLB could not be rendered on this device. The artifact remains available for explicit download.')
      },
    )

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      if (model) {
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          object.geometry?.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) material?.dispose()
        })
        scene.remove(model)
      }
      renderer.dispose()
    }
  }, [url])

  return <div className="starting-world-shell" style={{ position: 'relative' }} aria-label={label}>
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    <div className="world-hint" role="status">{status}</div>
  </div>
}
