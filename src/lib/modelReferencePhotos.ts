import { Box3, Color, DirectionalLight, HemisphereLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { parseReferenceModel } from './modelReferenceGeometry.ts'
import { disposeObject } from './worldGeometry.ts'
import type { StudioPhoto } from './studioProtocol.ts'
import type { ReferenceFileKind } from './studioFileReferences.ts'

/** Render the selected local model into the existing image-reference contract. No upload or AI call. */
export async function modelReferencePhotos(bytes: ArrayBuffer, name: string, kind: Exclude<ReferenceFileKind, 'text'>): Promise<StudioPhoto[]> {
  let renderer: WebGLRenderer | undefined
  const root = await parseReferenceModel(bytes, kind)
  try {
    try { renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }) }
    catch { throw new Error('This browser cannot render the model reference. Attach three screenshots of it instead; nothing was uploaded or generated.') }
    renderer.setSize(1024, 1024); renderer.setPixelRatio(1)
    const scene = new Scene(); scene.background = new Color('#e8edf2')
    scene.add(root, new HemisphereLight('#ffffff', '#596777', 2.5))
    const light = new DirectionalLight('#ffffff', 3); light.position.set(4, 6, 5); scene.add(light)
    const bounds = new Box3().setFromObject(root), center = bounds.getCenter(new Vector3())
    const radius = bounds.getSize(new Vector3()).length() / 2
    const extent = radius * 1.15
    const camera = new OrthographicCamera(-extent, extent, extent, -extent, Math.max(radius / 1000, 0.000001), radius * 10)
    const views = [['front', 0, 0, 1], ['left', -1, 0, 0], ['back', 0, 0, -1]] as const
    const output: StudioPhoto[] = []
    for (const [view, x, y, z] of views) {
      camera.position.copy(center).add(new Vector3(x, y, z).multiplyScalar(radius * 3))
      camera.lookAt(center); camera.updateProjectionMatrix()
      renderer.render(scene, camera)
      const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.9)
      if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > 2 * 1024 * 1024) throw new Error('The model views could not be prepared within the image-reference limit.')
      output.push({ name: `${name.slice(0, 90)} — ${view}.jpg`, view, dataUrl, textureMaxSize: 4096 })
    }
    return output
  } finally {
    disposeObject(root)
    renderer?.dispose(); renderer?.forceContextLoss()
  }
}
