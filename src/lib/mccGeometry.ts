import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** Original procedural GAME recipe, shared equally by free and paid previews.
 * One bay; model-generated blueprint positions/repeats bays to form a lineup.
 * It is not a scan, an electrical design, or manufacturing-approved equipment.
 */
export function createMccBay(color = '#b8c1c7') {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Invalid cabinet color.')
  const bay = new THREE.Group(); bay.name = 'MCC modular bay'
  bay.userData = { kind: 'mcc-bay', units: 'm', status: 'PROCEDURAL_GAME', make: 'NOT_VALIDATED' }
  const size = 128, rough = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4, grain = ((x * 17 + y * 29 + x * y) % 11) - 5
    rough.set([170 + grain, 170 + grain, 170 + grain, 255], at)
    normal.set([128 + grain, 128 - grain, 254, 255], at)
  }
  const roughnessMap = new THREE.DataTexture(rough, size, size), normalMap = new THREE.DataTexture(normal, size, size)
  for (const texture of [roughnessMap, normalMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.needsUpdate = true }
  const metal = new THREE.MeshStandardMaterial({ color, metalness: .42, roughness: .8, roughnessMap, normalMap, normalScale: new THREE.Vector2(.12, .12) })
  metal.name = 'worldifact-object-color'
  const dark = new THREE.MeshStandardMaterial({ color: '#243640', metalness: .35, roughness: .42 })
  const plastic = new THREE.MeshStandardMaterial({ color: '#124d7b', roughness: .54 })
  const glass = new THREE.MeshStandardMaterial({ color: '#72adb5', roughness: .23, metalness: .15, emissive: '#234347', emissiveIntensity: .35 })
  const yellow = new THREE.MeshStandardMaterial({ color: '#efbf38', roughness: .55 })
  const screw = new THREE.MeshStandardMaterial({ color: '#c5cbd0', metalness: .85, roughness: .3 })
  const indicatorColors = ['#d44b41', '#dfb541', '#3aa87b']
  const indicatorMaterials = indicatorColors.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .3, roughness: .28 }))
  // Shared geometry per recipe avoids a new buffer for every indicator or screw.
  const panels = new RoundedBoxGeometry(.638, .307, .023, 2, .003)
  const housing = new THREE.BoxGeometry(.65, 2.18, .62)
  const screws = new THREE.CylinderGeometry(.008, .008, .006, 8); screws.rotateX(Math.PI / 2)
  const lamps = new THREE.CylinderGeometry(.016, .018, .009, 12); lamps.rotateX(Math.PI / 2)
  const mounts = new THREE.BoxGeometry(.17, .061, .016)
  const handleGeometry = new RoundedBoxGeometry(.017, .086, .021, 2, .003)
  const ventGeometry = new THREE.BoxGeometry(.043, .003, .003)
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, name: string, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true; bay.add(mesh); return mesh
  }
  add(housing, dark, 'Enclosure', 0, 1.12, 0)
  add(new THREE.BoxGeometry(.674, .065, .665), dark, 'Base plinth', 0, .037, 0)
  add(new THREE.BoxGeometry(.674, .065, .665), dark, 'Busbar cover', 0, 2.23, 0)
  const screwTransforms: THREE.Matrix4[] = [], lampTransforms: THREE.Matrix4[][] = [[], [], []], ventTransforms: THREE.Matrix4[] = []
  const matrix = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)
  for (let row = 0; row < 6; row++) {
    const y = .23 + row * .329
    add(panels, metal, `Compartment door ${row + 1}`, 0, y, .323)
    add(mounts, plastic, `Control fascia ${row + 1}`, -.05, y, .343)
    add(handleGeometry, dark, `Breaker rotary handle ${row + 1}`, .208, y, .36).rotation.z = row % 2 ? -.28 : .18
    for (let i = 0; i < 3; i++) lampTransforms[i].push(matrix(-.1 + i * .05, y, .358))
    for (const dx of [-.297, .297]) for (const dy of [-.123, .123]) screwTransforms.push(matrix(dx, y + dy, .341))
    if (row === 1 || row === 4) {
      add(new THREE.BoxGeometry(.125, .077, .014), dark, `HMI bezel ${row}`, -.163, y + .089, .343)
      add(new THREE.BoxGeometry(.099, .049, .004), glass, `HMI glass ${row}`, -.163, y + .089, .352)
      for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(.048 - i * .009, .003, .001), yellow, `HMI gauge ${row}-${i}`, -.165, y + .103 - i * .014, .355)
    }
    // Small warning plate has physical depth, not invented certification text.
    add(new THREE.BoxGeometry(.035, .028, .002), yellow, `Generic warning marker ${row}`, .106, y + .094, .337)
    for (let col = 0; col < 8; col++) ventTransforms.push(matrix(-.21 + col * .06, y - .106, .337))
  }
  function instances(geometry: THREE.BufferGeometry, material: THREE.Material, transforms: THREE.Matrix4[], name: string) {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length); mesh.name = name
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = mesh.receiveShadow = true; bay.add(mesh)
  }
  instances(screws, screw, screwTransforms, 'Panel screws')
  instances(ventGeometry, dark, ventTransforms, 'Ventilation slots')
  for (let i = 0; i < 3; i++) instances(lamps, indicatorMaterials[i], lampTransforms[i], `Indicator lamps ${i}`)
  return bay
}
