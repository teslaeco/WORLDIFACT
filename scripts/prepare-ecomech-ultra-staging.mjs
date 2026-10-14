/**
 * Build public STAGING assets from verified output of the reviewed native
 * Blender workflow. Large files are chunked under Cloudflare's 25 MiB/file
 * cap; no new AI requests, no customer API, no synthetic preview model.
 */
import { open, mkdir, readFile, copyFile, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { build } from 'esbuild'
const input=process.env.ECOMECH_ULTRA_INPUT || '.ecomech-ultra-input'
const output='.ecomech-ultra-public'
const source=JSON.parse(await readFile(join(input,'MANIFEST_ULTRA.json'),'utf8'))
const qa=JSON.parse(await readFile(join(input,'INTEGRITY_REPORT.json'),'utf8'))
if(source.sourceGLBSha256!=='7e7f3aea755dfdd0ad957124d7e1dc33004905e0052fdab3d60b587f34cdc7b4' ||
   source.sourceOracleJob!=='6fa9be43-f371-4bcd-8fe7-7a3ea9967855' ||
   source.additionalPaidProviderRequests!==0 ||
   qa.meshQuality!=='GEOMETRY_ONLY_NOT_ARTISTIC_QA' ||
   !Number.isInteger(qa.GAME?.triangles)||qa.GAME.triangles<2_000_000||qa.GAME.triangles>3_000_000 ||
   !Number.isInteger(qa.MOBILE_LOD?.triangles) ||qa.MOBILE_LOD.triangles>300_000)
 throw Error('Unverified real Astra source, real highpoly geometry or mobile LOD')
const expected=source.outputs
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
async function testFile(file){
 const data=await readFile(join(input,file))
 if(!expected[file]||data.length!==expected[file].bytes||digest(data)!==expected[file].sha256)
  throw Error('Input format has changed: '+file)
 return data
}
const preview='ECOMECH_ASTRA_BLENDER_MOBILE_LOD.glb'
const previewData=await testFile(preview)
if(previewData.byteLength>25*1024*1024)throw Error('Mobile WebGL asset too large for Cloudflare')
await mkdir(join(output,'chunks'),{recursive:true})
await copyFile(join(input,preview),join(output,'robot.glb'))
const entries={
 glb:['ECOMECH_ASTRA_BLENDER_ULTRA_GAME.glb','model/gltf-binary'],
 fbx:['ECOMECH_ASTRA_BLENDER_ULTRA.fbx','application/octet-stream'],
 obj:['ECOMECH_ASTRA_BLENDER_ULTRA.obj','text/plain'],
 blend:['ECOMECH_ASTRA_BLENDER_ULTRA_EDITABLE.blend','application/octet-stream']
}
const listing={}
const CHUNK=18*1024*1024
for(const [key,[filename,mime]] of Object.entries(entries)){
 const file=join(input,filename)
 const ref=await testFile(filename)
 const f=await open(file,'r')
 const parts=[]
 try{
  for(let offset=0,i=0;offset<ref.byteLength;offset+=CHUNK,i++){
   const size=Math.min(CHUNK,ref.byteLength-offset)
   const buffer=Buffer.alloc(size)
   const {bytesRead}=await f.read(buffer,0,size,offset)
   if(bytesRead!==size)throw Error('Short original chunk read')
   const name=key+'-'+String(i).padStart(3,'0')+'.part'
   await writeFile(join(output,'chunks',name),buffer)
   parts.push({path:'/chunks/'+name,bytes:size,sha256:digest(buffer)})
  }
 }finally{await f.close()}
 listing[key]={name:filename,bytes:ref.byteLength,sha256:expected[filename].sha256,mime,parts}
}
const upload={revision:'worldifact-ecomech-ultra-chunked-v1',
 sourceJobId:'6fa9be43-f371-4bcd-8fe7-7a3ea9967855',downloads:listing}
await writeFile(join(output,'downloads.json'),JSON.stringify(upload))
const report={
 revision:'ecomech-ultra-real-binary-staging-v1',
 provenance:'ORACLE_CONFIRMED',model:'gpt-6-astra',
 geometryProcess:'WORLDIFACT_NATIVE_BLENDER_MECHANICAL_PASS',
 originalJobId:'6fa9be43-f371-4bcd-8fe7-7a3ea9967855',
 sourceSha256:source.sourceGLBSha256,additionalPaidProviderRequests:0,
 completion:'COMPLETE_UNREVIEWED',verifiedHumanArtisticQuality:false,
 makeApproved:false,gameMobileLOD:qa.MOBILE_LOD,
 originalGLB:{sha256:listing.glb.sha256,bytes:listing.glb.bytes,
  triangles:qa.GAME.triangles,renderedTriangles:qa.GAME.triangles,
  meshes:qa.GAME.meshDefinitions,materials:qa.GAME.materialCount},
 versions:{originalAstraTriangles:40024,blenderDetailedTriangles:qa.GAME.triangles},
 highresBytes:listing.glb.bytes,
 formats:Object.keys(entries)
}
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2))
await build({entryPoints:['src/ecomechAstraViewer.ts'],bundle:true,minify:true,
 outfile:join(output,'viewer.js'),platform:'browser',format:'iife',target:'es2022'})
const buttons=Object.entries(listing).map(([key,file])=>'<a class="download" href="/downloads/'+key+
 '">Download '+key.toUpperCase()+' · '+(file.bytes/1e6).toFixed(1)+' MB</a>').join('')
const html=[
'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
'<meta name="theme-color" content="#06191c"><title>WORLDIFACT — EcoMech original Astra + Blender ULTRA</title>',
'<style>:root{color-scheme:dark;font:15px/1.5 system-ui,Arial,sans-serif;background:#061319;color:#e3f9f6}',
'*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 60% 18%,#193d4b,#061319 72%)}',
'main{max-width:1440px;margin:auto;padding:clamp(14px,3vw,40px)}header{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}',
'h1{font-size:clamp(30px,5vw,58px);line-height:1.05;margin:30px 0 12px;color:#d4fff4}',
'.badge{color:#87efd5;border:1px solid #397465;border-radius:20px;padding:5px 12px}',
'.layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;margin-top:25px}',
'#viewport{height:min(74vh,720px);min-height:340px;touch-action:none;border:1px solid #375c62;border-radius:15px;position:relative;overflow:hidden}',
'#viewport canvas{display:block;max-width:100%}#loading,#fallback{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:#091e28;padding:20px}',
'#loading[hidden],#fallback[hidden]{display:none}aside{background:#0f252e;border:1px solid #2d555d;border-radius:15px;padding:20px}',
'button,a.download{display:inline-flex;padding:11px 14px;min-height:44px;align-items:center;justify-content:center;margin:4px;',
'border:1px solid #367c75;border-radius:9px;background:#183640;color:#d4fff8;text-decoration:none;cursor:pointer;font:inherit;font-size:13px}',
'a.download{background:#75efc0;color:#03291d;font-weight:800}p,small{color:#adc8cb}a{color:#8ef5e5}',
'.alert{border-left:3px solid #ecc05c;padding:12px;background:#2b2d23;margin-top:15px}',
'@media(max-width:800px){.layout{grid-template-columns:1fr}#viewport{height:58vh;min-height:340px}}',
'</style></head><body><main><header><strong>WORLDIFACT · ULTRA ORIGINAL GLB</strong><span class="badge">GPT-6 ASTRA BASE + BLENDER DETAIL · UNREVIEWED</span></header>',
'<h1>ECOMECH — Green Chili Guardian ULTRA</h1>',
'<p>Live, real geometry preview: this browser loads the 208,884-triangle mobile version. Full high-detail GLB contains '+
qa.GAME.triangles.toLocaleString('en-US')+' triangles, separate editable motor and cable assemblies, and is never automatically loaded on mobile.</p>',
'<div class="layout"><div id="viewport"><div id="loading">Loading real same-origin model...</div>',
'<div id="fallback" hidden>WebGL2 unavailable. Download the original GLB instead.</div></div><aside>',
'<strong id="origin">Reading verified origin...</strong><p id="metrics">Loading GLB statistics...</p><small id="ready">Drag to rotate, pinch to zoom.</small>',
'<h3>Full-resolution files</h3>'+buttons+'<div>',
'<button id="orbit">Auto rotate</button><button id="wire" aria-pressed="false">Wireframe</button>',
'<button id="grid" aria-pressed="false">Grid</button><button id="reset">Reset</button></div><div>',
'<button id="front">Front</button><button id="rear">Back</button><button id="left">Left</button><button id="right">Right</button></div>',
'<p class="alert">Generated source: GPT-6 Astra (Oracle-confirmed, original 40,024 triangles). Further high-resolution mechanical geometry: WORLDIFACT Blender 4.3. Do not misrepresent the latter as a new Astra API call. GAME and MAKE remain UNREVIEWED. This is NOT an automatic 3D print order or commercial storefront.</p>',
'</aside></div><footer><p>Same-origin HTTPS staging, independently verified file hashes and byte-range downloads. No API key, no billing, no customer points.</p></footer>',
'<script src="./viewer.js" defer></script></main></body></html>'
].join('\n')
await writeFile(join(output,'index.html'),html)
console.log('ULTRA_STAGING_READY',JSON.stringify({gameBytes:listing.glb.bytes,triangles:qa.GAME.triangles,
 mobileBytes:previewData.length,chunks:Object.values(listing).reduce((n,x)=>n+x.parts.length,0)}))
