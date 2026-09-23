import * as THREE from 'three'

/** Local procedural GAME photovoltaic finish; no outside image or generation request. */
export function createPVMaterial() {
  const size = 128, data = new Uint8Array(size * size * 4)
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const border = x % 32 < 2 || y % 64 < 2
    const busbar = x % 32 === 10 || x % 32 === 22
    const grain = ((x * 17 + y * 31) % 7) - 3
    data.set(border ? [104,150,183,255] : busbar ? [74,115,151,255] : [20+grain,55+grain,92+grain,255],(y*size+x)*4)
  }
  const map = new THREE.DataTexture(data,size,size)
  map.colorSpace=THREE.SRGBColorSpace; map.wrapS=map.wrapT=THREE.RepeatWrapping
  map.minFilter=THREE.LinearMipmapLinearFilter; map.magFilter=THREE.LinearFilter
  map.generateMipmaps=true; map.needsUpdate=true
  const material = new THREE.MeshStandardMaterial({map,color:'#d3e8ff',metalness:.38,roughness:.32})
  material.name='GAME-photovoltaic-cells'
  return material
}
