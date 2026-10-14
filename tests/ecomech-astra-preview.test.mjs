import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'
import { validateCandidateGLB, JOB_ID } from '../scripts/ecomech-astra-once.mjs'

test('bundled staging viewer serves exact original fixture bytes without a fake Astra receipt, cloud or CDN',()=>{
  const root=mkdtempSync(join(tmpdir(),'ecomech-original-glb-'))
  try {
    mkdirSync(join(root,'ecomech-astra-evidence'))
    const original=detailedGLBFixture()
    const info=validateCandidateGLB(original)
    const file=join(root,'ecomech-astra-evidence','original.glb')
    writeFileSync(file,original)
    writeFileSync(join(root,'ecomech-astra-evidence','report.json'),JSON.stringify({
      jobId:JOB_ID,originalGLB:info,completion:'INCOMPLETE_UNREVIEWED',
      provenance:'SELECTED_UNCONFIRMED',userPointsCharged:0,providerCapUsd:1.75
    }))
    const builder=fileURLToPath(new URL('../scripts/build-ecomech-astra-preview.mjs',import.meta.url))
    const result=spawnSync(process.execPath,[builder],{cwd:root,encoding:'utf8',timeout:45000})
    assert.equal(result.status,0,result.stderr||result.stdout)
    const html=readFileSync(join(root,'.ecomech-astra-preview','index.html'),'utf8')
    assert.match(html,/ECOMECH — Green chili guardian/)
    assert.match(html,/Original GLB delivered from the same authenticated Oracle job/)
    assert.doesNotMatch(html,/<script\s+src="https?:/)
    assert.doesNotMatch(html,/OPENAI_API_KEY|ORACLE_API_TOKEN|Bearer\s+[A-Za-z0-9._-]+/)
    const actual=readFileSync(join(root,'.ecomech-astra-preview','robot.glb'))
    assert.deepEqual(actual,Buffer.from(original))
    assert.equal(createHash('sha256').update(actual).digest('hex'),info.sha256)
    const report=JSON.parse(readFileSync(join(root,'.ecomech-astra-preview','report.json'),'utf8'))
    assert.equal(report.provenance,'SELECTED_UNCONFIRMED')
    assert.equal(report.makeManufacturingReady,false)
    assert.equal(report.originalGLB.sha256,info.sha256)
    const viewer=readFileSync(join(root,'.ecomech-astra-preview','viewer.js'),'utf8')
    assert.ok(viewer.length>15000,'Bundled Three.js and GLTFLoader must be present for offline same-origin JS')
    assert.doesNotMatch(viewer,/\bimport\s*.*\bfrom\s*['"]https?:/)
    assert.ok(!viewer.includes('gpt-6-astra') || html.includes('UNREVIEWED'))
  } finally { rmSync(root,{recursive:true,force:true}) }
})
test('isolated Worker only hosts static test assets, never production app or API secret bindings',()=>{
  const conf=JSON.parse(readFileSync(new URL('../wrangler.ecomech-astra-preview.jsonc',import.meta.url),'utf8'))
  assert.equal(conf.name,'worldifact-ecomech-astra-preview-20261014')
  assert.equal(conf.assets.directory,'./.ecomech-astra-preview')
  assert.equal(conf.main,undefined)
  assert.equal(conf.durable_objects,undefined)
  assert.equal(conf.vars,undefined)
  assert.equal(conf.ratelimits,undefined)
  assert.equal(conf.workers_dev,true)
})
