import { STRIPE_API_VERSION, STRIPE_CHECKOUT_API_VERSION } from '../server/billing.ts'

type Offer={name:'pro'|'studio';priceId:string;amount:number}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}
const valid=(v:unknown,p:string)=>typeof v==='string'&&new RegExp('^'+p+'_[A-Za-z0-9_]{1,180}$').test(v)
async function read(response:Response){
  if(Number(response.headers.get('content-length')||0)>256000) throw new Error('STRIPE_RESPONSE_TOO_LARGE')
  const text=await response.text(); if(text.length>256000) throw new Error('STRIPE_RESPONSE_TOO_LARGE')
  try{return object(JSON.parse(text))}catch{throw new Error('STRIPE_RESPONSE_INVALID')}
}
async function main(){
  const key=process.env.STRIPE_SECRET_KEY?.trim(), run=process.env.GITHUB_RUN_ID, attempt=process.env.GITHUB_RUN_ATTEMPT
  if(!key||!/^(?:sk|rk)_live_[A-Za-z0-9_]{16,256}$/.test(key)||!run||!attempt) throw new Error('STRIPE_LIVE_CONFIGURATION_MISSING')
  const offers:Offer[]=[
    {name:'pro',priceId:'price_1UKi3GBrIVB6dkxNm66OnDAr',amount:9999},
    {name:'studio',priceId:'price_1UKi3UBrIVB6dkxNfojjhJsv',amount:14999},
  ]
  async function request(path:string,params?:URLSearchParams,idempotency?:string){
    const response=await fetch('https://api.stripe.com/v1'+path,{method:params?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(20000),
      headers:{Authorization:'Bearer '+key,'Stripe-Version':path==='/checkout/sessions'&&params?STRIPE_CHECKOUT_API_VERSION:STRIPE_API_VERSION,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},
      ...(params?{body:params.toString()}:{})})
    const body=await read(response); if(!response.ok) throw new Error('STRIPE_CHECKOUT_PREFLIGHT_FAILED')
    return body
  }
  const results=[]
  for(const offer of offers){
    const price=await request('/prices/'+offer.priceId)
    const recurring=object(price.recurring)
    if(price.id!==offer.priceId||price.livemode!==true||price.active!==true||price.unit_amount!==offer.amount||price.currency!=='usd'||price.type!=='recurring'||recurring.interval!=='month'||recurring.interval_count!==1) throw new Error('STRIPE_PRICE_MISMATCH')
    const ref=`worldifact-${offer.name}-probe-${run}-${attempt}`
    const params=new URLSearchParams({mode:'subscription','line_items[0][price]':offer.priceId,'line_items[0][quantity]':'1','payment_method_types[0]':'card',allow_promotion_codes:'false','managed_payments[enabled]':'false',client_reference_id:ref,'metadata[worldifact_probe]':ref,'metadata[worldifact_plan]':offer.name,success_url:'https://worldifact.xodobrox.workers.dev/account/credits?billing=processing',cancel_url:'https://worldifact.xodobrox.workers.dev/account/credits?billing=cancelled'})
    const session=await request('/checkout/sessions',params,`worldifact-${offer.name}-checkout-probe-${run}-${attempt}`)
    if(!valid(session.id,'cs_live')||session.livemode!==true||session.mode!=='subscription'||session.status!=='open'||session.payment_status!=='unpaid'||session.customer!=null||session.amount_total!==offer.amount||session.currency!=='usd'||typeof session.url!=='string'||!session.url.startsWith('https://checkout.stripe.com/')) throw new Error('STRIPE_CHECKOUT_SESSION_INVALID')
    const expired=await request('/checkout/sessions/'+session.id+'/expire',new URLSearchParams(),`worldifact-${offer.name}-checkout-expire-${run}-${attempt}`)
    if(expired.id!==session.id||expired.status!=='expired'||expired.payment_status!=='unpaid') throw new Error('STRIPE_CHECKOUT_EXPIRE_FAILED')
    results.push({plan:offer.name,amount:offer.amount,currency:'USD',checkout:'verified_without_charge',expired:true})
  }
  console.log(JSON.stringify({status:'PRO_STUDIO_CHECKOUTS_VERIFIED_WITHOUT_CHARGE',results},null,2))
}
main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'STRIPE_CHECKOUT_PREFLIGHT_FAILED');process.exitCode=1})
