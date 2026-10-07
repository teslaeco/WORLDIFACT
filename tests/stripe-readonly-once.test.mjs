import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants, createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TARGET_HASH, BASE_SHA, BRANCH, MAX_PAGES, PAGE_SIZE, MAX_RESPONSE_BYTES, createStripeReader, collectReport, subscriptionReport, invoiceReport, encryptReport, main } from '../scripts/stripe-readonly-once.mjs';

const SECRET = 'sk_live_FAKE_ONLY_0123456789abcdef';
const CANARY = 'PRIVATE_BODY_EMAIL_CARD_CLIENTSECRET_CANARY';
const OWNER = 'cus_FixtureOwner';
const NOW = new Date('2026-10-07T05:00:00.000Z');
// An isolated fixture module changes only the hash; production targeting stays constant.
const source = await readFile('scripts/stripe-readonly-once.mjs', 'utf8');
const fixtureHash = createHash('sha256').update(OWNER).digest('hex');
assert.equal(source.split(TARGET_HASH).length, 2);
const fixtureDir = await mkdtemp(join(tmpdir(), 'stripe-owner-fixture-'));
let collectOwnerReport;
try {
  const fixturePath = join(fixtureDir, 'fixture.mjs');
  await writeFile(fixturePath, source.replace(TARGET_HASH, fixtureHash));
  collectOwnerReport = (await import(pathToFileURL(fixturePath).href)).collectReport;
} finally { await rm(fixtureDir, { recursive: true, force: true }); }
const list = (data, has_more = false) => new Response(JSON.stringify({ object: 'list', data, has_more }), { headers: { 'content-type': 'application/json' } });
const makeInvoice = overrides => ({ id: 'in_Fixture1', object: 'invoice', livemode: true, customer: OWNER, subscription: 'sub_Fixture1', created: 1790000000, status: 'paid', paid: true, paid_out_of_band: false, billing_reason: 'subscription_cycle', amount_paid: 2999, amount_due: 2999, amount_remaining: 0, currency: 'usd', status_transitions: { paid_at: 1790000010 }, lines: { has_more: false, data: [{ amount: 2999, currency: 'usd', quantity: 1, proration: false, price: { unit_amount: 2999, currency: 'usd', lookup_key: 'worldifact_membership_1500_usd_2999_month_v1', recurring: { interval: 'month', interval_count: 1 } } }] }, ...overrides });
const keypair = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
function decrypt(envelope) {
  const key = privateDecrypt({ key: keypair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(envelope.wrappedKey, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  cipher.setAAD(Buffer.from(envelope.aad, 'base64')); cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString());
}

test('all live requests use strict allowlisted GET resources, origin, headers and no payload', async () => {
  const calls = [], reader = createStripeReader(SECRET, async (url, options) => { calls.push({ url, options }); return list([]); });
  await reader('customers', { limit: PAGE_SIZE });
  await reader('subscriptions', { limit: PAGE_SIZE, customer: OWNER, status: 'all' });
  await reader('invoices', { limit: PAGE_SIZE, customer: OWNER });
  await reader('invoices', { limit: PAGE_SIZE, 'created[gte]': 1789344000, 'created[lte]': Math.floor(NOW.getTime()/1000) });
  for (const { url, options } of calls) {
    assert.equal(new URL(url).origin, 'https://api.stripe.com');
    assert.match(new URL(url).pathname, /^\/v1\/(customers|subscriptions|invoices)$/);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
    assert.equal(options.body, undefined); assert.equal(options.headers.Authorization, `Bearer ${SECRET}`);
    assert.equal(options.headers['Stripe-Version'], '2024-06-20');
    assert.equal(url.includes(SECRET), false); assert.ok(options.signal instanceof AbortSignal);
  }
});

test('resource, query, customer and pagination injection fail before transport', async () => {
  let calls = 0; const reader = createStripeReader(SECRET, async () => { calls++; return list([]); });
  for (const [resource, params] of [
    ['https://evil.invalid', { limit: PAGE_SIZE }], ['customers/../../charges', { limit: PAGE_SIZE }], ['__proto__', { limit: PAGE_SIZE }],
    ['customers', { limit: PAGE_SIZE, email: CANARY }], ['invoices', { limit: PAGE_SIZE, expand: ['data.payment_intent'] }],
    ['subscriptions', { limit: PAGE_SIZE, customer: 'cus_abc&email=leak' }], ['subscriptions', { limit: PAGE_SIZE, status: 'active' }],
    ['invoices', { limit: PAGE_SIZE, starting_after: 'in_abc/next' }], ['invoices', { limit: PAGE_SIZE, 'created[gte]': -1 }],
    ['customers', { limit: 1000 }], ['customers', {}],
  ]) await assert.rejects(reader(resource, params), /INVALID_REQUEST/);
  assert.equal(calls, 0);
});

test('invalid, test and missing credential fail before any request', () => {
  for (const key of [null, undefined, '', 'pk_live_0123456789abcdef', 'sk_test_0123456789abcdef', SECRET + '\n' + CANARY]) assert.throws(() => createStripeReader(key), /CONFIGURATION_FAILED/);
});

test('HTTP errors and network exceptions reveal only fixed codes, never raw body or request', async () => {
  for (const status of [301, 302, 307, 401, 403, 429, 500]) {
    let bodyRead = false;
    const response = new Response(CANARY + SECRET, { status, headers: { Location: 'https://evil.invalid/' + SECRET } });
    const originalReader = response.body.getReader.bind(response.body);
    response.body.getReader = () => { bodyRead = true; return originalReader(); };
    const reader = createStripeReader(SECRET, async () => response);
    await assert.rejects(reader('customers', { limit: PAGE_SIZE }), error => { assert.equal(String(error).includes(CANARY), false); assert.equal(String(error).includes(SECRET), false); return true; });
    assert.equal(bodyRead, false);
  }
  const reader = createStripeReader(SECRET, async () => { throw new Error(CANARY + SECRET); });
  await assert.rejects(reader('customers', { limit: PAGE_SIZE }), /^Error: NETWORK_FAILED$/);
});

test('oversized declared and streaming bodies, malformed lists, test-mode records and repeated IDs fail closed', async () => {
  const oversizedHeader = createStripeReader(SECRET, async () => new Response('{}', { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }));
  await assert.rejects(oversizedHeader('customers', { limit: PAGE_SIZE }), /RESPONSE_TOO_LARGE/);
  const oversizedStream = createStripeReader(SECRET, async () => new Response('x'.repeat(MAX_RESPONSE_BYTES + 1)));
  await assert.rejects(oversizedStream('customers', { limit: PAGE_SIZE }), /RESPONSE_TOO_LARGE/);
  for (const response of [new Response(CANARY), list([{id:'cus_bad',livemode:false}]), list([],true), new Response(JSON.stringify({object:'list',data:[],has_more:CANARY}))]) {
    const reader = createStripeReader(SECRET, async () => response);
    await assert.rejects(reader('customers', { limit: PAGE_SIZE }), /INVALID_RESPONSE/);
  }
  const report = await collectReport(SECRET, { now: NOW, fetcher: async url => new URL(url).pathname === '/v1/customers' ? list([{ id:'cus_Duplicate', livemode:true }], true) : list([]) });
  assert.deepEqual(report.errors, [{stage:'customer_lookup',code:'INVALID_RESPONSE'}]);
});

test('bounded customer scan never serializes non-owner records or raw fields and reports incomplete coverage', async () => {
  let customerCalls = 0;
  const report = await collectReport(SECRET, { now: NOW, fetcher: async url => {
    if (new URL(url).pathname === '/v1/customers') { customerCalls++; return list([{ id:`cus_Fixture${customerCalls}`, livemode:true, email:CANARY, name:CANARY, metadata:{secret:SECRET} }], true); }
    return list([]);
  } });
  assert.equal(customerCalls, MAX_PAGES); assert.equal(report.customerLookup.complete, false); assert.equal(report.customerLookup.recordsScanned, MAX_PAGES);
  assert.equal(report.owner.found, false); assert.equal(JSON.stringify(report).includes(CANARY), false); assert.equal(JSON.stringify(report).includes('cus_Fixture'), false); assert.equal(JSON.stringify(report).includes(SECRET), false);
});

test('report allowlists provider fields, enum values and amounts and marks truncated nested data', () => {
  const malicious = { id:'sub_Fixture1', status:CANARY, livemode:true, customer:OWNER, email:CANARY, metadata:{value:SECRET}, latest_invoice:{id:'in_Fixture1',hosted_invoice_url:CANARY}, items:{has_more:false,data:Array(21).fill({quantity:1,price:{id:'constructor',unit_amount:9999,currency:'usd',nickname:CANARY}})}, pending_update:{expires_at:1790000000,description:CANARY,subscription_items:[]} };
  const s = subscriptionReport(malicious);
  assert.equal(s.status,'unknown'); assert.equal(s.itemsComplete,false); assert.equal(s.items.length,20); assert.equal(s.items[0].price.knownPlan,'unknown');
  const i = invoiceReport(makeInvoice({email:CANARY,customer_email:CANARY,hosted_invoice_url:CANARY,invoice_pdf:CANARY,payment_intent:{client_secret:SECRET},metadata:{value:CANARY},billing_reason:CANARY}));
  assert.equal(i.billingReason,'unknown');
  const text = JSON.stringify([s,i]); for (const forbidden of [CANARY,SECRET,OWNER,'payment_intent','client_secret','invoice_pdf','hosted_invoice_url']) assert.equal(text.includes(forbidden),false);
});

test('sales counts paid positive subscription invoices, keeps currencies separate and excludes top-ups, open invoices and out-of-band payments', async () => {
  const invoices = [
    makeInvoice({id:'in_USD',customer:'cus_Buyer1'}),
    makeInvoice({id:'in_EUR',customer:'cus_Buyer2',currency:'eur',amount_paid:5000}),
    makeInvoice({id:'in_Zero',amount_paid:0}),
    makeInvoice({id:'in_Open',status:'open',paid:false}),
    makeInvoice({id:'in_Topup',subscription:null,billing_reason:'manual'}),
    makeInvoice({id:'in_External',paid_out_of_band:true}),
  ];
  const report = await collectReport(SECRET, {now:NOW,fetcher:async url => new URL(url).pathname === '/v1/invoices' ? list(invoices) : list([])});
  assert.equal(report.sales.complete,true); assert.equal(report.sales.paidSubscriptionInvoices,2); assert.equal(report.sales.uniquePayingCustomers,2);
  assert.deepEqual(report.sales.byCurrency,{usd:{amountPaidMinorUnits:2999,otherCustomerAmountPaidMinorUnits:2999},eur:{amountPaidMinorUnits:5000,otherCustomerAmountPaidMinorUnits:5000}});
  assert.equal(JSON.stringify(report).includes('cus_Buyer'),false);
});

test('all fixture results roundtrip authenticated ciphertext only; changed ciphertext or AAD cannot decrypt', () => {
  const report = { schema:'test', sensitive:CANARY, invoices:[makeInvoice()] };
  const encrypted = encryptReport(report,keypair.publicKey);
  assert.deepEqual(decrypt(encrypted),report);
  assert.deepEqual(Object.keys(encrypted).sort(),['aad','cipher','ciphertext','iv','schema','tag','wrappedKey','wrapping'].sort());
  assert.equal(JSON.stringify(encrypted).includes(CANARY),false); assert.equal(JSON.stringify(encrypted).includes(OWNER),false);
  const changed = Buffer.from(encrypted.ciphertext,'base64'); changed[0] ^= 1;
  assert.throws(() => decrypt({...encrypted,ciphertext:changed.toString('base64')}));
  assert.throws(() => decrypt({...encrypted,aad:Buffer.from('other').toString('base64')}));
  assert.notEqual(encryptReport(report,keypair.publicKey).ciphertext,encrypted.ciphertext);
});

test('weak recipient, wrong run scope, retries and expired authorization fail before Stripe access with fixed output', async () => {
  const weak = generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  assert.throws(() => encryptReport({},weak.publicKey),/CONFIGURATION_FAILED/);
  const valid = {GITHUB_REPOSITORY:'teslaeco/WORLDIFACT',GITHUB_REF:`refs/heads/${BRANCH}`,GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',DIAGNOSTIC_BEFORE:BASE_SHA,STRIPE_SECRET_KEY:SECRET};
  let calls=0;
  for (const overrides of [{GITHUB_REF:'refs/heads/main'},{GITHUB_RUN_ATTEMPT:'2'},{DIAGNOSTIC_BEFORE:'other'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_EVENT_NAME:'workflow_dispatch'}]) {
    const logs=[];
    assert.equal(await main({...valid,...overrides},{fetcher:async()=>{calls++;throw new Error(CANARY);},now:NOW,output:value=>logs.push(value)}),1);
    assert.deepEqual(logs,['DIAGNOSTIC_FAILED_DETAILS_SUPPRESSED']);
  }
  const logs=[]; assert.equal(await main(valid,{fetcher:async()=>{calls++;},now:new Date('2026-10-08'),output:value=>logs.push(value)}),1); assert.equal(calls,0);
});

test('production entry failure prints no exception, secret, source or environment', () => {
  const result = spawnSync(process.execPath,[resolve('scripts/stripe-readonly-once.mjs')],{encoding:'utf8',env:{PATH:process.env.PATH,STRIPE_SECRET_KEY:SECRET,PRIVATE_TEST_VALUE:CANARY}});
  assert.equal(result.status,1); assert.equal(result.stdout,'DIAGNOSTIC_FAILED_DETAILS_SUPPRESSED\n'); assert.equal(result.stderr,'');
});

test('workflow confines production key to one step and uploads exact ciphertext for one day', async () => {
  const workflow=await readFile('.github/workflows/stripe-readonly-once.yml','utf8');
  assert.equal((workflow.match(/secrets\./g)||[]).length,1);
  assert.ok(workflow.includes('persist-credentials: false')); assert.ok(workflow.includes('retention-days: 1')); assert.ok(workflow.includes('path: .stripe-readonly-encrypted/report.enc.json'));
  assert.ok(workflow.includes("github.run_attempt == 1")); assert.ok(workflow.includes(`github.event.before == '${BASE_SHA}'`));
  for(const forbidden of ['workflow_dispatch','pull_request_target','npm ci','wrangler','CLOUDFLARE','OPENAI_API_KEY','OWNER_ACCESS_TOKEN']) assert.equal(workflow.includes(forbidden),false);
  const source=await readFile('scripts/stripe-readonly-once.mjs','utf8');
  assert.equal(source.includes('console.'),false); assert.equal(source.includes('JSON.stringify(env)'),false);
  assert.equal((source.match(/method: 'GET'/g)||[]).length,1);
  assert.equal(source.includes('method: \'POST\''),false);
  assert.equal(source.includes('process.stderr'),false);
  assert.equal(source.includes('BEGIN PRIVATE KEY'),false);
  assert.match(TARGET_HASH,/^[a-f0-9]{64}$/);
});

test('owner match queries only the matched customer and reports current plan, pending upgrade and invoice evidence', async () => {
  const urls=[];
  const report=await collectOwnerReport(SECRET,{now:NOW,fetcher:async url=>{
    const parsed=new URL(url); urls.push(parsed);
    if(parsed.pathname==='/v1/customers') return list([{id:'cus_Unrelated',livemode:true,email:CANARY},{id:OWNER,livemode:true,email:CANARY}]);
    if(parsed.pathname==='/v1/subscriptions') return list([{id:'sub_Fixture1',customer:OWNER,livemode:true,status:'active',created:1790000000,current_period_start:1790000000,current_period_end:1792592000,cancel_at_period_end:false,latest_invoice:'in_Fixture1',items:{has_more:false,data:[{quantity:1,price:{unit_amount:2999,currency:'usd',lookup_key:'worldifact_membership_1500_usd_2999_month_v1',recurring:{interval:'month',interval_count:1}}}]},pending_update:{expires_at:1791417600,subscription_items:[{quantity:1,price:{id:'price_1UKi3GBrIVB6dkxNm66OnDAr',unit_amount:9999,currency:'usd',recurring:{interval:'month',interval_count:1}}}]}}]);
    if(parsed.searchParams.has('customer'))return list([makeInvoice()]);
    return list([makeInvoice(),makeInvoice({id:'in_Another',customer:'cus_Another'})]);
  }});
  assert.equal(report.owner.found,true); assert.deepEqual(report.errors,[]);
  assert.equal(report.owner.subscriptions[0].items[0].price.knownPlan,'creator');
  assert.equal(report.owner.subscriptions[0].pendingUpdate.items[0].price.knownPlan,'pro');
  assert.equal(report.owner.invoices[0].amountPaidMinorUnits,2999);
  assert.equal(report.owner.invoiceCoverage.complete,true); assert.equal(report.owner.subscriptionCoverage.complete,true);
  assert.equal(report.sales.otherPayingCustomers,1); assert.equal(report.sales.otherCustomerPaidSubscriptionInvoices,1);
  for(const url of urls.filter(u=>u.searchParams.has('customer')))assert.equal(url.searchParams.get('customer'),OWNER);
  assert.equal(JSON.stringify(report).includes(CANARY),false); assert.equal(JSON.stringify(report).includes(OWNER),false);
});

test('mismatched customer in provider response cannot become owner evidence', async () => {
  const report=await collectOwnerReport(SECRET,{now:NOW,fetcher:async url=>{
    const parsed=new URL(url);
    if(parsed.pathname==='/v1/customers')return list([{id:OWNER,livemode:true}]);
    if(parsed.pathname==='/v1/subscriptions')return list([{id:'sub_Other',customer:'cus_Other',livemode:true}]);
    if(parsed.searchParams.has('customer'))return list([makeInvoice({customer:'cus_Other'})]);
    return list([]);
  }});
  assert.deepEqual(report.owner.subscriptions,[]); assert.deepEqual(report.owner.invoices,[]);
  assert.deepEqual(report.errors,[{stage:'owner_subscriptions',code:'INVALID_RESPONSE'},{stage:'owner_invoices',code:'INVALID_RESPONSE'}]);
});

test('successful entry writes only authenticated ciphertext and fixed log label, including provider-failure reports', async () => {
  const dir=await mkdtemp(join(tmpdir(),'stripe-offline-fixture-')); const prior=process.cwd();
  try{
    await mkdir(join(dir,'.github'));
    await writeFile(join(dir,'.github/stripe-diagnostic-recipient.pem'),keypair.publicKey);
    process.chdir(dir);
    const logs=[];
    const env={GITHUB_REPOSITORY:'teslaeco/WORLDIFACT',GITHUB_REF:`refs/heads/${BRANCH}`,GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',DIAGNOSTIC_BEFORE:BASE_SHA,STRIPE_SECRET_KEY:SECRET};
    assert.equal(await main(env,{now:NOW,output:value=>logs.push(value),fetcher:async()=>{throw new Error(CANARY+SECRET);}}),0);
    assert.deepEqual(logs,['ENCRYPTED_DIAGNOSTIC_READY']);
    const text=await readFile('.stripe-readonly-encrypted/report.enc.json','utf8');
    assert.equal(text.includes(CANARY),false); assert.equal(text.includes(SECRET),false);
    const report=decrypt(JSON.parse(text));
    assert.deepEqual(report.errors,[{stage:'customer_lookup',code:'NETWORK_FAILED'},{stage:'sales_invoices',code:'NETWORK_FAILED'}]);
    assert.equal(report.sales.complete,false);
  }finally{process.chdir(prior);await rm(dir,{recursive:true,force:true});}
});

test('owner pagination advances strict resource cursors and preserves complete evidence', async()=>{
  const pages={subscriptions:0,invoices:0};
  const report=await collectOwnerReport(SECRET,{now:NOW,fetcher:async url=>{
    const u=new URL(url);
    if(u.pathname==='/v1/customers')return list([{id:OWNER,livemode:true}]);
    if(u.pathname==='/v1/subscriptions'){
      const page=++pages.subscriptions;
      assert.equal(u.searchParams.get('starting_after'),page===1?null:'sub_Page1');
      return list([{id:`sub_Page${page}`,customer:OWNER,livemode:true,status:'active',items:{has_more:false,data:[]}}],page===1);
    }
    if(u.searchParams.has('customer')){
      const page=++pages.invoices;
      assert.equal(u.searchParams.get('starting_after'),page===1?null:'in_Page1');
      return list([makeInvoice({id:`in_Page${page}`})],page===1);
    }
    return list([]);
  }});
  assert.deepEqual(pages,{subscriptions:2,invoices:2});
  assert.equal(report.owner.subscriptionCoverage.complete,true);assert.equal(report.owner.invoiceCoverage.complete,true);
  assert.equal(report.owner.subscriptions.length,2);assert.equal(report.owner.invoices.length,2);
  assert.deepEqual(report.errors,[]);
});

test('owner permission denial remains an encrypted fixed error and does not imply missing invoices',async()=>{
  const report=await collectOwnerReport(SECRET,{now:NOW,fetcher:async url=>{
    const u=new URL(url);
    if(u.pathname==='/v1/customers')return list([{id:OWNER,livemode:true}]);
    if(u.pathname==='/v1/subscriptions')return new Response(CANARY+SECRET,{status:403});
    if(u.searchParams.has('customer'))return new Response(CANARY+SECRET,{status:500});
    return list([]);
  }});
  assert.equal(report.owner.found,true);
  assert.deepEqual(report.errors,[{stage:'owner_subscriptions',code:'PERMISSION_DENIED'},{stage:'owner_invoices',code:'PROVIDER_ERROR'}]);
  assert.equal(report.owner.subscriptionCoverage,undefined);assert.equal(report.owner.invoiceCoverage,undefined);
  const plain=JSON.stringify(report);assert.equal(plain.includes(CANARY),false);assert.equal(plain.includes(SECRET),false);
});

test('committed recipient is the independently verified owner public key',async()=>{
  const {createPublicKey}=await import('node:crypto');
  const pem=await readFile('.github/stripe-diagnostic-recipient.pem','utf8');
  assert.equal(pem.includes('PRIVATE'),false);
  const key=createPublicKey(pem);assert.equal(key.asymmetricKeyType,'rsa');assert.ok(key.asymmetricKeyDetails.modulusLength>=3072);
  const fingerprint=createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
  assert.equal(fingerprint,'3bf15fcd52c05c4b2622a697f083d32fb71450013a339bb07f7e821de4384aa3');
});
