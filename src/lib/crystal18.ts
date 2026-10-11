/** Rhombic dodecahedron with its six degree-four vertices truncated.
 * Exactly 12 planar hexagons and 6 squares; no asset or network dependency.
 * The hexagons are not regular. Shared vertices retain a closed manifold.
 */
type Point = [number, number, number]
export const CRYSTAL_VERTICES: Point[] = []
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CRYSTAL_VERTICES.push([x, y, z])
for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1])
  for (const a of [-.5, .5]) for (const b of [-.5, .5]) {
    const point: Point = [0, 0, 0]
    point[axis] = sign * 1.5; point[(axis + 1) % 3] = a; point[(axis + 2) % 3] = b
    CRYSTAL_VERTICES.push(point)
  }
const dot = (a: Point, b: Point) => a.reduce((sum, n, i) => sum + n * b[i], 0)
const cross = (a: Point, b: Point): Point => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
function face(normal: Point, distance: number) {
  const ids = CRYSTAL_VERTICES.flatMap((p, i) => Math.abs(dot(p, normal) - distance) < 1e-8 ? [i] : [])
  const length = Math.sqrt(dot(normal, normal))
  const n = normal.map(x => x / length) as Point
  const ref: Point = Math.abs(n[0]) < .9 ? [1, 0, 0] : [0, 1, 0]
  const u = cross(n, ref), v = cross(n, u)
  return ids.sort((a, b) => Math.atan2(dot(CRYSTAL_VERTICES[a], v), dot(CRYSTAL_VERTICES[a], u)) - Math.atan2(dot(CRYSTAL_VERTICES[b], v), dot(CRYSTAL_VERTICES[b], u)))
}
export const CRYSTAL_FACES: number[][] = []
for (let zero = 0; zero < 3; zero++) for (const a of [-1, 1]) for (const b of [-1, 1]) {
  const normal: Point = [0, 0, 0]; normal[(zero + 1) % 3] = a; normal[(zero + 2) % 3] = b
  CRYSTAL_FACES.push(face(normal, 2))
}
for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
  const normal: Point = [0, 0, 0]; normal[axis] = sign
  CRYSTAL_FACES.push(face(normal, 1.5))
}
