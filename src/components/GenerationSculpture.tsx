import { useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'

// Same bundled poster as the homepage/login sculpture. The live loader is lazy.
const POSTER = '/world-assets/polyhedron-led-poster.svg'

/** Decorative reuse of the exact homepage geometry; no provider or generation calls. */
export default function GenerationSculpture({ animate }: { animate: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!animate || !host.current) return
    const mount = host.current
    let stopped = false, visible = true, lost = false, frame = 0, previous = 0, seconds = 0
    let renderer: THREE.WebGLRenderer | undefined
    let sculpture: THREE.Group | undefined
    let observer: ResizeObserver | undefined
    let intersection: IntersectionObserver | undefined
    let onVisibility = () => {}
    let onLost = (_event: Event) => {}
    const releaseSculpture = (root: THREE.Group) => {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      root.traverse(node => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        geometries.add(mesh.geometry)
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
      })
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    }
    const cleanup = () => {
      stopped = true
      cancelAnimationFrame(frame)
      observer?.disconnect(); intersection?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      renderer?.domElement.removeEventListener('webglcontextlost', onLost)
      if (sculpture) { releaseSculpture(sculpture); sculpture = undefined }
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); renderer = undefined }
    }
    void (async () => {
      const [three, asset] = await Promise.all([import('three'), import('../lib/portalSculpture')])
      if (stopped) return
      renderer = new three.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.outputColorSpace = three.SRGBColorSpace
      renderer.toneMapping = three.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      renderer.setClearColor(0, 0)
      renderer.domElement.setAttribute('aria-hidden', 'true')
      mount.appendChild(renderer.domElement)
      const scene = new three.Scene()
      const camera = new three.PerspectiveCamera(38, 1, 0.1, 20)
      camera.position.set(0, 0, 6)
      scene.add(new three.AmbientLight('#67bfe2', 1.2))
      const key = new three.DirectionalLight('#b8ffe4', 3)
      key.position.set(3, 4, 6); scene.add(key)
      const shouldMove = () => !stopped && !lost && visible && !document.hidden
      const render = () => { if (!stopped && !lost && renderer) renderer.render(scene, camera) }
      const tick = (now: number) => {
        if (!shouldMove()) { frame = 0; previous = 0; return }
        if (!previous || now - previous >= 1000 / 30) {
          seconds += previous ? Math.min((now - previous) / 1000, 0.1) : 0
          previous = now
          if (sculpture) asset.rotatePortalSculpture(sculpture, seconds / 2)
          render()
        }
        frame = requestAnimationFrame(tick)
      }
      const sync = () => {
        if (shouldMove() && sculpture && !frame) frame = requestAnimationFrame(tick)
        else if (!shouldMove()) { cancelAnimationFrame(frame); frame = 0; previous = 0 }
      }
      onVisibility = sync
      document.addEventListener('visibilitychange', onVisibility)
      onLost = event => {
        event.preventDefault(); lost = true; sync()
        if (!stopped) setReady(false)
      }
      renderer.domElement.addEventListener('webglcontextlost', onLost)
      const resize = () => {
        if (!renderer || stopped) return
        const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight)
        renderer.setSize(width, height, false)
        camera.aspect = width / height; camera.updateProjectionMatrix(); render()
      }
      observer = new ResizeObserver(resize); observer.observe(mount)
      if (typeof IntersectionObserver !== 'undefined') {
        intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync() })
        intersection.observe(mount)
      }
      const loaded = await asset.loadPortalSculpture(asset.LOGIN_SCULPTURE_PALETTE, 2.65)
      if (stopped) { releaseSculpture(loaded); return }
      sculpture = loaded; scene.add(sculpture)
      asset.rotatePortalSculpture(sculpture, 0)
      resize(); setReady(!lost); sync()
    })().catch(() => { if (!stopped) { cleanup(); setReady(false) } })
    return cleanup
  }, [animate])
  return <div className="generation-sculpture" data-ready={animate && ready} aria-hidden="true">
    <img src={POSTER} alt="" width="240" height="240" />
    <div ref={host} className="generation-sculpture-canvas" />
  </div>
}
