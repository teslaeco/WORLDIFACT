import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, InstancedMesh, Mesh } from 'three'
import { createMccBay } from '../src/lib/mccGeometry.ts'
import { createWorldObject, disposeObject } from '../src/lib/worldGeometry.ts'
import { validateBlueprint } from '../src/lib/blueprint.ts'

test('free-quality MCC has genuine separate doors, controls, displays and PBR data maps', () => {
  const bay = createMccBay(), names: string[] = []
  let triangles = 0, maps = 0
  bay.traverse(o => {
    names.push(o.name)
    if (!(o instanceof Mesh)) return
    const count = o.geometry.index?.count ?? o.geometry.attributes.position.count
    triangles += count / 3 * (o instanceof InstancedMesh ? o.count : 1)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const material = m as typeof m & { roughnessMap?: unknown; normalMap?: unknown }
      if (material.roughnessMap && material.normalMap) maps++
    }
  })
  assert.equal(names.filter(n => n.startsWith('Compartment door')).length, 6)
  assert.equal(names.filter(n => n.startsWith('HMI glass')).length, 2)
  assert.ok(names.includes('Panel screws') && names.includes('Ventilation slots'))
  assert.ok(maps >= 6); assert.ok(triangles < 20000)
  const bounds = new Box3().setFromObject(bay)
  assert.ok(bounds.max.y - bounds.min.y > 2.2)
  assert.ok(bounds.max.x - bounds.min.x < .7)
  disposeObject(bay)
})
test('MCC is generated from validated blueprint geometry, not a prompt-only demo override', () => {
  const b = validateBlueprint({ version: 1, title: 'MCC', biome: 'valley', objects: [{ id: 'bay1', name: 'Control bay', kind: 'mcc-bay', x: 2, z: 3, scale: 1, rotation: 90, color: '#b8c1c7' }] })
  const first = createWorldObject(b.objects[0])
  assert.equal(first.position.x, 2); assert.equal(first.position.z, 3)
  assert.equal(first.rotation.y, Math.PI / 2)
  let doors = 0; first.traverse(o => { if (o.name.startsWith('Compartment door')) doors++ })
  assert.equal(doors, 6)
  disposeObject(first)
})
