import * as THREE from 'three'
/** Small embedded, deterministic maps; no image API, external asset or browser canvas. */
export function paintedMetal(color: string) {
  const size = 64, colorBytes = new Uint8Array(size * size * 4), roughBytes = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = (x * 17 + y * 31 + (x * y) % 11) % 7
    colorBytes.set([239 + grain, 239 + grain, 239 + grain, 255], (y * size + x) * 4)
    roughBytes.set([255, 185 + grain * 5, 255, 255], (y * size + x) * 4)
  }
  const map = new THREE.DataTexture(colorBytes, size, size), roughnessMap = new THREE.DataTexture(roughBytes, size, size)
  map.colorSpace = THREE.SRGBColorSpace
  for (const texture of [map, roughnessMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 4); texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true }
  const material = new THREE.MeshStandardMaterial({ color, map, roughnessMap, metalness: 0.28, roughness: 0.8 })
  material.name = 'worldifact-object-color'
  return material
}
const GLYPHS: Record<string, string[]> = {
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'C': ['01111','10000','10000','10000','10000','10000','01111'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'N': ['10001','11001','11001','10101','10011','10011','10001'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  '4': ['10010','10010','10010','11111','00010','00010','00010'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
}
export function instrumentScreen() {
  const width = 128, height = 64, data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([22, 48 + Math.floor(y / 9), 30, 255], (y * width + x) * 4)
  const text = (value: string, startX: number, startY: number) => Array.from(value).forEach((letter, index) => {
    const glyph = GLYPHS[letter]
    glyph?.forEach((line, y) => Array.from(line).forEach((pixel, x) => { if (pixel === '1') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const px = startX + index * 12 + x * 2 + dx, py = startY + y * 2 + dy
      if (px < width && py < height) data.set([167, 234, 119, 255], (py * width + px) * 4)
    } }))
  })
  text('MCC', 8, 7); text('400V', 8, 29); text('RUN', 78, 45)
  const texture = new THREE.DataTexture(data, width, height)
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.needsUpdate = true
  texture.name = 'procedural-demo-instrument-not-live-data'
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.24, metalness: 0, emissive: '#19320e', emissiveIntensity: 0.2 })
}
