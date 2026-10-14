/** One-use, owner-approved production verification/refund of ONLY proven zero provider liability.
 * Never prints owner identifiers, emails, Stripe customer IDs or credentials.
 * Runs exclusively under the protected GitHub Actions production environment.
 */
import { createHash, createHmac } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const OWNER_HASH='55055d5f79ce5573d5fb08fb0b0ca7295fe32385ba172872dc2843b51d5d7249'
const STRIPE_CUSTOMER_HASH='d8271adb1c72b0c8923c500661e0a83c10c9c20600d588ad2e90336701f7c417'
const PREFIX='WORLDIFACT-OWNER-UNUSED-POINTS-20261014-v1:'
const ORIGIN='https://worldifact.xodobrox.workers.dev'
const ENDPOINT=ORIGIN+'/api/ops/owner-unused-points-20261014'
const APPROVAL_TAG='owner-unused-points-20261014-exactly-once-v1'
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const SHA=/^[a-f0-9]{64}$/
const hash=(v)=>createHash('sha256').update(v).digest('hex')
const env=process.env
if(env.GITHUB_REPOSITORY!=='teslaeco/WORLDIFACT'||env.GITHUB_RUN_ATTEMPT!=='1'||
  !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||
  !env.OWNER_ACCESS_TOKEN||!env.GITHUB_TOKEN||
  !env.STRIPE_SECRET_KEY||!/^([sr]k)_live_/.test(env.STRIPE_SECRET_KEY))
  throw new Error('PROTECTED_PRODUCTION_SECRETS_REQUIRED')

async function identifyOwner(){
  const matches=[]
  let startingAfter=null
  for(let page=0;page<8;page++){
    const url=new URL('https://api.stripe.com/v1/customers')
    url.searchParams.set('limit','100')
    if(startingAfter)url.searchParams.set('starting_after',startingAfter)
    const r=await fetch(url,{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY},
      redirect:'error',signal:AbortSignal.timeout(18000)})
    if(r.status!==200)throw new Error('STRIPE_OWNER_LOOKUP_UNAVAILABLE_'+r.status)
    const d=await r.json()
    if(!Array.isArray(d.data)||d.data.length>100||typeof d.has_more!=='boolean')
      throw new Error('STRIPE_RESPONSE_INVALID')
    for(const customer of d.data){
      const uid=customer?.metadata?.worldifact_uid
      if(customer?.livemode===true&&typeof customer?.id==='string' &&
        hash(customer.id)===STRIPE_CUSTOMER_HASH && typeof uid==='string' &&
        UUID.test(uid) && hash(uid)===OWNER_HASH && !customer.deleted)
        matches.push(uid)
    }
    if(!d.has_more)break
    if(!d.data.length)throw new Error('STRIPE_EMPTY_NEXT_PAGE')
    startingAfter=d.data.at(-1).id
    if(page===7)throw new Error('STRIPE_SCAN_INCOMPLETE')
  }
  if(matches.length!==1)throw new Error('OWNER_IDENTITY_NOT_UNIQUE')
  return matches[0]
}
async function request(mode,uid,expected){
  const body=JSON.stringify({uid,at:Date.now(),operation:mode,...(expected?{expected}:{})})
  const signature=createHmac('sha256',env.OWNER_ACCESS_TOKEN).update(PREFIX+body).digest('hex')
  const r=await fetch(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),
    headers:{Origin:ORIGIN,'Content-Type':'application/json','X-WORLDIFACT-Owner-Maintenance-Proof':signature},
    body})
  if(!r.headers.get('content-type')?.includes('application/json')){
    await r.body?.cancel();throw new Error(mode.toUpperCase()+'_BAD_RESPONSE')
  }
  const d=await r.json()
  if(r.status!==200)throw new Error(mode.toUpperCase()+'_HTTP_'+r.status+'_'+String(d.error||d.status||'UNKNOWN').slice(0,64))
  if(d.revision!=='owner-unused-points-verified-v1'||d.paidGenerationRequested!==false)
    throw new Error('RESPONSE_IDENTITY_OR_COST_INVALID')
  return d
}
async function claimOnce(){
  const r=await fetch('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs',{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,
      Accept:'application/vnd.github+json','Content-Type':'application/json',
      'X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({ref:'refs/tags/'+APPROVAL_TAG,sha:env.GITHUB_SHA})})
  if(r.status!==201){await r.body?.cancel();throw new Error('APPROVAL_ALREADY_CONSUMED_NO_REPEAT')}
  const d=await r.json()
  if(d.ref!=='refs/tags/'+APPROVAL_TAG||d.object?.sha!==env.GITHUB_SHA)
    throw new Error('GITHUB_TAG_NOT_VERIFIED')
}
const report={revision:'owner-unused-points-reconciliation-run-v1',
  runId:env.GITHUB_RUN_ID||null,paidGenerationRequested:false,refundCurrency:'WORLDIFACT points',
  startedAt:new Date().toISOString(),phase:'owner-identification'}
await mkdir('owner-unused-points-evidence',{recursive:true})
const persist=async()=>writeFile('owner-unused-points-evidence/report.json',JSON.stringify(report,null,2)+'\n')
try{
  const uid=await identifyOwner()
  report.phase='preview'
  const preview=await request('preview',uid)
  const numeric=['credits','held','available']
  if(preview.status!=='preview'||!preview.before||!numeric.every(k=>Number.isSafeInteger(preview.before[k])&&preview.before[k]>=0)||
    !Number.isSafeInteger(preview.refundableJobs)||!Number.isSafeInteger(preview.refundablePoints)||
    preview.refundablePoints<0||preview.refundableJobs<0||!SHA.test(preview.zeroDigest))
    throw new Error('PREVIEW_INVALID')
  report.before=preview.before
  report.audit={checked:preview.checked,pages:preview.pages,positiveProviderCost:preview.positiveProviderCost,
    receiptsUnavailable:preview.receiptsUnavailable,blueprintForReview:preview.blueprintForReview,
    skipped:preview.skipped,refundableJobs:preview.refundableJobs,refundablePoints:preview.refundablePoints}
  console.log('Verified preview:',JSON.stringify({held:report.before.held,available:report.before.available,
    checked:preview.checked,zeroLiabilityJobs:preview.refundableJobs,refundablePoints:preview.refundablePoints,
    positiveProviderCost:preview.positiveProviderCost,unresolved:preview.receiptsUnavailable}))
  if(preview.refundableJobs===0){
    report.phase='no-provably-unused-holds'
    await persist()
    console.log('No verified unused point holds to release. All unverified/positive liabilities remain untouched.')
    process.exit(0)
  }
  if(preview.refundablePoints<=0||preview.refundablePoints>preview.before.held)
    throw new Error('REFUND_MORE_THAN_HELD')
  // Permanent exact-run receipt prevents inadvertently replaying a financial
  // operation through a GitHub Actions UI rerun or a duplicate branch push.
  await claimOnce()
  report.phase='applying-once'
  await persist()
  const expected={held:preview.before.held,zeroCount:preview.refundableJobs,
    zeroDigest:preview.zeroDigest,zeroPoints:preview.refundablePoints}
  const result=await request('release-zero',uid,expected)
  if(result.status!=='reconciled'||!Number.isSafeInteger(result.releasedPoints)||
      result.releasedPoints<0||result.releasedPoints>preview.refundablePoints||
      !Number.isSafeInteger(result.releasedJobs)||result.releasedJobs>preview.refundableJobs||
      !result.after||!numeric.every(k=>Number.isSafeInteger(result.after[k])&&result.after[k]>=0))
    throw new Error('FINANCIAL_SETTLEMENT_RESPONSE_INVALID')
  report.phase='finished'
  report.after=result.after
  report.releasedPoints=result.releasedPoints
  report.releasedJobs=result.releasedJobs
  report.refusedJobs=result.refusedJobs
  report.finishedAt=new Date().toISOString()
  await persist()
  console.log('VERIFIED POINT RETURN:',JSON.stringify({before:report.before,after:report.after,
    releasedPoints:report.releasedPoints,releasedJobs:report.releasedJobs,
    positiveProviderHeld:preview.positiveProviderCost,uncertainReceipts:preview.receiptsUnavailable}))
}catch(error){
  report.phase='blocked'
  report.error=String(error?.message||'UNKNOWN').slice(0,180)
  await persist()
  throw new Error(report.error)
}
