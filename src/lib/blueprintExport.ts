import { Group } from 'three'
import { exportProceduralGlb } from './proceduralGlb.ts'
import { validateBlueprint, type WorldBlueprint } from './blueprint.ts'
import { createWorldObject, disposeObject } from './worldGeometry.ts'
import { inspectGLB } from './glb.ts'

/** The exported mesh is built from the validated response, never the prompt-only demo. */
export async function exportBlueprintGlb(value: WorldBlueprint): Promise<ArrayBuffer> {
  const blueprint = validateBlueprint(value)
  const group = new Group()
  group.name = blueprint.title
  group.userData = { target: 'GAME', source: 'AI_SPECIFICATION', geometry: 'PROCEDURAL', manufacturing: 'NOT_VALIDATED' }
  try {
    for (const object of blueprint.objects) group.add(createWorldObject(object))
    const buffer = exportProceduralGlb(group)
    if (!(buffer instanceof ArrayBuffer)) throw new Error('A binary GLB is required.')
    const inspected = inspectGLB(buffer)
    if (inspected.triangles < 1 || inspected.meshCount < 1) throw new Error('The generated blueprint contains no exportable mesh.')
    return buffer
  } finally { disposeObject(group) }
}
