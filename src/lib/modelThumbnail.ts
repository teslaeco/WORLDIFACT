import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene } from 'three'
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js'
import { buildSoftwareModel } from './softwareModelPreview'
import { frameModel } from './modelFraming'
import { disposeObject } from './worldGeometry'

/** One bounded static geometry snapshot. No WebGL context, animation or external I/O. */
export async function modelThumbnail(blob: Blob, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted()
  const bytes = await blob.arrayBuffer()
  signal.throwIfAborted()
  const { model, bounds } = buildSoftwareModel(bytes)
  const scene = new Scene()
  scene.add(model, new AmbientLight(new Color().setRGB(.65, .65, .65), 1))
  const light = new DirectionalLight(0xffffff, 2); light.position.set(4, 8, 6); scene.add(light)
  let renderer: SVGRenderer | undefined
  try {
    const frame = frameModel({ min: bounds.min.toArray(), max: bounds.max.toArray() }, 1.5)
    const camera = new PerspectiveCamera(40, 1.5, frame.near, frame.far)
    camera.position.set(...frame.position); camera.lookAt(...frame.target); camera.updateMatrixWorld()
    renderer = new SVGRenderer(); renderer.setSize(360, 240); renderer.setPrecision(2)
    renderer.setClearColor(new Color('#0b1922'), 1)
    scene.updateMatrixWorld(true); renderer.render(scene, camera)
    signal.throwIfAborted()
    return new Blob([new XMLSerializer().serializeToString(renderer.domElement)], { type: 'image/svg+xml' })
  } finally { disposeObject(model); renderer?.clear(); scene.clear() }
}
