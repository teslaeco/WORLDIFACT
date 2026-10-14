/**
 * Package ONLY the actual completed/retained Oracle artifact into a static,
 * unauthenticated STAGING viewer. There is no customer-generation endpoint,
 * payment button, deployment to worldifact main, or synthetic substitute mesh.
 */
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { validateCandidateGLB } from './ecomech-astra-once.mjs'

const root='.ecomech-astra-preview'
const report=JSON.parse(await readFile('ecomech-astra-evidence/report.json','utf8'))
const bytes=new Uint8Array(await readFile('ecomech-astra-evidence/original.glb'))
const info=validateCandidateGLB(bytes)
if(info.sha256!==report.originalGLB?.sha256 || report.jobId!=='6fa9be43-f371-4bcd-8fe7-7a3ea9967855')
  throw Error('ORIGINAL_ORACLE_GLB_NOT_BOUND_TO_SAME_JOB')
if(bytes.byteLength>24*1024*1024)throw Error('ASSET_LARGER_THAN_STAGING_STATIC_LIMIT_KEEP_GITHUB_ARTIFACT')
if(!['INCOMPLETE_UNREVIEWED','COMPLETE_UNREVIEWED'].includes(report.completion))
  throw Error('ONLY_ORIGINAL_VERIFIED_GLBS_CAN_BE_PREVIEWED')
await mkdir(root,{recursive:true})
await copyFile('ecomech-astra-evidence/original.glb',root+'/robot.glb')
const publicReport={jobId:report.jobId,completion:report.completion,provenance:report.provenance,
  providerSelected:'gpt-6-astra',providerCostLimitUsd:1.75,apiActualCostUsd:null,
  renderingProvider:'Oracle/Blender MCP',resultIsOriginal:true,
  modelReferenceImageAttached:false,modelOriginalSha256:info.sha256,
  makeManufacturingReady:false,clientPointCharge:0,gameModelValidated:false,
  originalGLB:info}
await writeFile(root+'/report.json',JSON.stringify(publicReport,null,2)+'\n')
await build({entryPoints:[fileURLToPath(new URL('../src/ecomechAstraViewer.ts',import.meta.url))],bundle:true,minify:true,
  outfile:root+'/viewer.js',format:'iife',platform:'browser',target:'es2022',legalComments:'none'})
const html=String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="theme-color" content="#07131c">
<title>WORLDIFACT — ECOMECH original Astra test GLB</title>
<style>
:root{color-scheme:dark;font:15px/1.5 system-ui,Arial,sans-serif;background:#08141c;color:#e3f4f5}
*{box-sizing:border-box}body{margin:0;min-width:300px;background:radial-gradient(circle at 60% 20%,#173743,#07111a 70%)}
a{color:#7bdfef}main{max-width:1440px;margin:auto;padding:clamp(14px,2.8vw,36px)}
header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.logo{font-weight:900;letter-spacing:.24em;color:#7ff4cf;font-size:15px}
.status{border:1px solid #346663;color:#a9f8e6;border-radius:18px;padding:5px 12px;font-size:12px}
h1{font-size:clamp(32px,5vw,62px);line-height:1.08;letter-spacing:-.045em;margin:28px 0 10px}
p{color:#bbd0da;max-width:830px}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;margin-top:24px}
#viewport{height:min(68vh,740px);min-height:350px;background:linear-gradient(#122838,#0b141c);border:1px solid #35545e;border-radius:18px;position:relative;overflow:hidden;touch-action:none}
#viewport canvas{display:block;max-width:100%}
#loading,#fallback{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;color:#d6edf2;background:#11222c}
#fallback[hidden],#loading[hidden]{display:none}
aside{background:#10202a;border:1px solid #2c4b56;border-radius:18px;padding:20px}
aside h2{font-size:16px;margin:0 0 10px}button,a.download{display:inline-flex;align-items:center;justify-content:center;border:1px solid #34575e;background:#193640;color:#defaf5;border-radius:9px;padding:12px 13px;margin:4px 3px 4px 0;min-height:44px;text-decoration:none;cursor:pointer;font:inherit;font-size:13px}
button:hover,a.download:hover{background:#22505b}
a.download{background:#6fe1c2;color:#032321;border:0;font-weight:850}
small{color:#9cbcc3}#origin{font-weight:750;color:#a4fce5}#metrics{overflow-wrap:anywhere}
.notice{background:#2b2318;border-left:3px solid #e8ab52;padding:14px;margin-top:14px;border-radius:6px}
footer{font-size:12px;color:#8cadb7;margin:24px 0}
@media(max-width:790px){.grid{grid-template-columns:1fr}aside{padding:16px}
#viewport{height:55vh;min-height:350px}h1{margin-top:20px;font-size:34px}}
</style>
</head>
<body>
<main>
<header><div class="logo">WORLDIFACT · ORIGINAL ARTIFACT</div><div class="status">ASTRA TEST · UNREVIEWED</div></header>
<h1>ECOMECH — Green chili guardian</h1>
<p>Original GLB delivered from the same authenticated Oracle job. Rotate the real 3D mesh and inspect the exposed electric motors, split armor and the chili. This page does not generate another model or charge credits.</p>
<div class="grid">
<section id="viewport" aria-label="Actual GLB 3D viewer">
  <div id="loading" role="status">Loading original GLB from the staging server…</div>
  <div id="fallback" hidden role="alert">WebGL2 unavailable. The GLB is still available to download.</div>
</section>
<aside>
<h2>Model evidence</h2>
<div id="origin">Reading Oracle provenance…</div>
<p id="metrics">Reading original geometry…</p>
<p id="ready" aria-live="polite">The GLB is not a photograph. Test output is subject to visual review.</p>
<a class="download" href="./robot.glb" download="ECOMECH_ASTRA_ORIGINAL.glb">Download original GLB</a>
<div><button id="orbit">Auto rotate</button><button id="wire" aria-pressed="false">Wireframe</button><button id="grid" aria-pressed="false">Grid</button><button id="reset">Reset</button></div>
<div><button id="front">Front</button><button id="rear">Back</button><button id="left">Left</button><button id="right">Right</button></div>
<div class="notice">GAME: experimental and UNREVIEWED. MAKE: not approved for 3D printing. No fake polygon inflation, automatic paid retry, or third-party generator substitution.</div>
</aside>
</div>
<footer>Test build, isolated from WORLDIFACT customer accounts. Original API job ID: 6fa9be43-f371-4bcd-8fe7-7a3ea9967855. AI model confirmation is shown only when the original Oracle budget receipt verifies it. Reference artwork was not uploaded in this text-only test.</footer>
</main>
<script src="./viewer.js" defer></script>
</body></html>`
await writeFile(root+'/index.html',html)
console.log('STATIC_STAGING_PACKAGED',JSON.stringify({bytes:info.bytes,sha256:info.sha256,triangles:info.triangles,source:report.provenance}))
