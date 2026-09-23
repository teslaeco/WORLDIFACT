/** Editable GAME sand height field. Units: metres and cubic metres, not engineering soil simulation. */
export const DESERT = { minX: 15, maxX: 40, minZ: 14, maxZ: 39, cell: .5 } as const
export function inDesert(x: number, z: number, margin = 0) {
  return x >= DESERT.minX - margin && x <= DESERT.maxX + margin && z >= DESERT.minZ - margin && z <= DESERT.maxZ + margin
}
export interface SoilLoad { amount: number; capacity: number }
export interface Contact { x: number; y: number; z: number; radius: number }
export const createSoilLoad = (): SoilLoad => ({ amount: 0, capacity: 1.6 })
export function createSandField() {
  const columns = Math.round((DESERT.maxX - DESERT.minX) / DESERT.cell) + 1
  const rows = Math.round((DESERT.maxZ - DESERT.minZ) / DESERT.cell) + 1
  const heights = new Float64Array(columns * rows), original = new Float64Array(heights.length)
  for (let row=0; row<rows; row++) for (let col=0; col<columns; col++) {
    const x=col*DESERT.cell, z=row*DESERT.cell
    // Exact zero-height border meets the hole in the meadow without overlap.
    const edge=Math.min(1,x/2,z/2,(25-x)/2,(25-z)/2)
    heights[row*columns+col]=edge <= 0 ? 0 : edge*(.14+.10*Math.sin(x*.36+z*.22)+.06*Math.cos(z*.65))
  }
  original.set(heights)
  let revision=0
  const index=(c:number,r:number)=>r*columns+c
  const volumeWeight=(c:number,r:number)=>(c===0||c===columns-1?.5:1)*(r===0||r===rows-1?.5:1)*DESERT.cell**2
  function heightAt(x:number,z:number) {
    if (!Number.isFinite(x)||!Number.isFinite(z)||!inDesert(x,z)) return 0
    const u=(x-DESERT.minX)/DESERT.cell,v=(z-DESERT.minZ)/DESERT.cell
    const c=Math.min(columns-2,Math.floor(u)),r=Math.min(rows-2,Math.floor(v)),a=u-c,b=v-r
    // Matches the two actual triangles per rendered cell, not a different bilinear surface.
    const h00=heights[index(c,r)],h10=heights[index(c+1,r)],h01=heights[index(c,r+1)],h11=heights[index(c+1,r+1)]
    return a+b<=1 ? h00+(h10-h00)*a+(h01-h00)*b : h11+(h01-h11)*(1-a)+(h10-h11)*(1-b)
  }
  function volumeDelta() {
    let sum=0
    // Each rendered triangle contributes area / 3 per vertex.
    for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)sum+=(heights[index(c,r)]-original[index(c,r)])*volumeWeight(c,r)
    return sum
  }
  function transfer(contact:Contact,requested:number,remove:boolean) {
    if(![contact.x,contact.y,contact.z,contact.radius,requested].every(Number.isFinite)||requested<=0||contact.radius<.1||contact.radius>2||!inDesert(contact.x,contact.z))return 0
    // An elevated bucket cannot excavate remotely. Dumping is allowed above ground.
    if(remove && contact.y>heightAt(contact.x,contact.z)+.09)return 0
    const candidates:{i:number;w:number;area:number;limit:number}[]=[]
    const c0=Math.max(1,Math.floor((contact.x-contact.radius-DESERT.minX)/DESERT.cell)),c1=Math.min(columns-2,Math.ceil((contact.x+contact.radius-DESERT.minX)/DESERT.cell))
    const r0=Math.max(1,Math.floor((contact.z-contact.radius-DESERT.minZ)/DESERT.cell)),r1=Math.min(rows-2,Math.ceil((contact.z+contact.radius-DESERT.minZ)/DESERT.cell))
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){
      const distance=Math.hypot(DESERT.minX+c*DESERT.cell-contact.x,DESERT.minZ+r*DESERT.cell-contact.z)
      if(distance>=contact.radius)continue
      const i=index(c,r),area=volumeWeight(c,r)
      // Do not dig below the cutting edge or bedrock. The bucket must follow the hole down.
      const floor=Math.max(-1.35,contact.y-.08)
      const limit=remove?Math.max(0,heights[i]-floor)*area:Math.max(0,1.65-heights[i])*area
      if(limit>1e-10)candidates.push({i,w:(1-distance/contact.radius)**2,area,limit})
    }
    let remaining=requested,moved=0
    for(let pass=0;pass<3&&remaining>1e-10;pass++){
      const weight=candidates.reduce((s,c)=>s+(c.limit>1e-10?c.w:0),0)
      if(!weight)break
      const budget=remaining
      for(const cell of candidates){
        if(cell.limit<=1e-10)continue
        const amount=Math.min(cell.limit,budget*cell.w/weight)
        heights[cell.i]+=(remove?-1:1)*amount/cell.area
        cell.limit-=amount;remaining-=amount;moved+=amount
      }
    }
    if(moved>0)revision++
    return moved
  }
  return {columns,rows,heights,original,heightAt,volumeDelta,get revision(){return revision},
    dig(contact:Contact,load:SoilLoad,seconds:number){
      if(!Number.isFinite(seconds)||seconds<=0||!validLoad(load))return 0
      const moved=transfer(contact,Math.min(load.capacity-load.amount,.72*Math.min(seconds,.05)),true)
      load.amount+=moved;return moved
    },
    dump(contact:Contact,load:SoilLoad,seconds:number){
      if(!Number.isFinite(seconds)||seconds<=0||!validLoad(load))return 0
      const moved=transfer(contact,Math.min(load.amount,1.15*Math.min(seconds,.05)),false)
      load.amount-=moved;if(load.amount<1e-12)load.amount=0;return moved
    }
  }
}
function validLoad(load:SoilLoad){return Number.isFinite(load.amount)&&Number.isFinite(load.capacity)&&load.capacity>0&&load.amount>=0&&load.amount<=load.capacity+1e-9}
export type SandField=ReturnType<typeof createSandField>
