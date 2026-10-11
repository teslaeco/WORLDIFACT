import {test} from 'node:test'
import assert from 'node:assert/strict'
import {CRYSTAL_FACES, CRYSTAL_VERTICES} from '../src/lib/crystal18.ts'
test('the welcome jewel has exactly eighteen polygon faces and a closed manifold',()=>{assert.equal(CRYSTAL_FACES.length,18);assert.equal(CRYSTAL_FACES.filter(f=>f.length===6).length,12);assert.equal(CRYSTAL_FACES.filter(f=>f.length===4).length,6);const edges=new Map<string,number>(),vertices=new Set<number>();for(const face of CRYSTAL_FACES){face.forEach(v=>vertices.add(v));face.forEach((v,i)=>{const edge=[v,face[(i+1)%face.length]].sort((a,b)=>a-b).join(':');edges.set(edge,(edges.get(edge)??0)+1)})}assert.equal(vertices.size,32);assert.equal(edges.size,48);assert.equal(vertices.size-edges.size+CRYSTAL_FACES.length,2);assert.ok([...edges.values()].every(n=>n===2))})

test('all eighteen faces are planar, outward facing and nondegenerate', () => {
  for (const face of CRYSTAL_FACES) {
    const [a,b,c] = face.map(i=>CRYSTAL_VERTICES[i])
    const u=b.map((v,i)=>v-a[i]), v=c.map((v,i)=>v-a[i])
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    assert.ok(Math.hypot(...n)>0)
    const d=n.reduce((s,x,i)=>s+x*a[i],0)
    assert.ok(d>0, 'outward winding')
    for(const i of face) assert.ok(Math.abs(n.reduce((s,x,k)=>s+x*CRYSTAL_VERTICES[i][k],0)-d)<1e-9)
    for(const vertex of CRYSTAL_VERTICES) assert.ok(n.reduce((s,x,i)=>s+x*vertex[i],0)<=d+1e-9)
  }
})
