import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {auditOriginalV4} from '../scripts/ecomech-v4-original-readonly-audit.mjs'
const id='d3fc6e0f-6258-4a2d-9935-ae31b0048e61'
const env={ORACLE_ENDPOINT:'https://ecomech-audit.trycloudflare.com/',
 ORACLE_API_TOKEN:'A'.repeat(44)}
const json=(x)=>Response.json(x,{headers:{'content-type':'application/json'}})
function mockedOracle({state='failed',ownerId=id,qualityModel='gpt-6-astra',budget={},
 modelStatus=409}={}) {
  const calls=[]
  const fn=async(url,opts={})=>{
    const path=new URL(url).pathname
    calls.push({path,method:opts.method})
    assert.equal(opts.method,'GET')
    assert.equal(opts.redirect,'error')
    assert.equal(new URL(url).hostname,'ecomech-audit.trycloudflare.com')
    if(path==='/v1/jobs/'+id)return json({id:ownerId,state})
    if(path==='/v1/jobs/'+id+'/quality')return json({revision:6,state,agentUsage:{model:qualityModel}})
    if(path==='/v1/jobs/'+id+'/budget')return json(budget)
    if(path==='/v1/jobs/'+id+'/model')return new Response(null,{status:modelStatus})
    throw Error('Unexpected API route: '+path)
  }
  return {fn,calls}
}
test('original Astra failure stays FAILED, never invents GLB or an invoice, only four GETs',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'ecomech-v4-readonly-'))
  try {
    const {fn,calls}=mockedOracle()
    const {report,readRoutes}=await auditOriginalV4(env,fn,temp)
    assert.equal(report.state,'failed')
    assert.deepEqual(report.output,{state:'NOT_RECOVERED',httpStatus:409})
    assert.equal(report.oracleAgentModelMatches,true)
    assert.equal(report.maximumLiabilityUsd,null)
    assert.equal(report.actualOpenAIInvoiceUsd,null)
    assert.equal(report.paidGenerationsTriggered,0)
    assert.equal(report.providerPosts,0)
    assert.equal(report.customerPointMutations,0)
    assert.deepEqual(calls.map(x=>x.method),['GET','GET','GET','GET'])
    assert.equal(readRoutes.length,4)
    const persisted=JSON.parse(await readFile(join(temp,'audit.json'),'utf8'))
    assert.equal(persisted.jobId,id)
  } finally {await rm(temp,{recursive:true,force:true})}
})
test('original job id mismatch is a hard stop BEFORE budget and model downloads',async()=>{
  const {fn,calls}=mockedOracle({ownerId:'99999999-9999-4999-9999-999999999999'})
  await assert.rejects(auditOriginalV4(env,fn),/ORIGINAL_JOB_MISSING_OR_ID_MISMATCH_NO_RETRY/)
  assert.equal(calls.length,1)
})
test('still-building original job is not retried or paid again',async()=>{
  const {fn,calls}=mockedOracle({state:'building'})
  await assert.rejects(auditOriginalV4(env,fn),/ORIGINAL_JOB_NOT_TERMINAL_NO_RETRY/)
  assert.equal(calls.length,1)
})
test('unauthorized Oracle endpoint fails before any HTTP request',async()=>{
  let calls=0
  await assert.rejects(auditOriginalV4({...env,ORACLE_ENDPOINT:'https://malicious.example/'},
    async()=>{calls++;return json({})}),/ORACLE_READONLY_CREDENTIALS_UNAVAILABLE/)
  assert.equal(calls,0)
})
