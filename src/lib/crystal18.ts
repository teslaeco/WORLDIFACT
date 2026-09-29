/** Eight vertices per ring. Polygon faces, not triangulation count. */
export const CRYSTAL_FACES = [...Array.from({length:8},(_,i)=>[i,(i+1)%8,8+i]),...Array.from({length:8},(_,i)=>[8+i,(i+1)%8,8+(i+1)%8]),Array.from({length:8},(_,i)=>7-i),Array.from({length:8},(_,i)=>8+i)]
