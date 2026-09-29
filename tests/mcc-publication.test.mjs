import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PUBLIC_FILES, ORIGIN, boundedPublicGet, verifyMccPublication } from '../scripts/check-mcc-publication.mjs'

test('publication verifier reads the actual public photos and prices without a write or credential', async () => {
  const records = new Map(await Promise.all(PUBLIC_FILES.map(async ([file,path,mime]) => [path,{mime,data:await readFile('public/'+file)}])))
  const calls = []
  const fetcher = async (url, init) => {
    calls.push(url); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error')
    assert.deepEqual(Object.keys(init.headers), ['Accept']); assert.ok(url.startsWith(ORIGIN+'/'))
    const path = url.slice(ORIGIN.length)
    if (path === '/api/billing/status') return Response.json({generationCosts:{luna:15,sol:50,astra:250}})
    const row = records.get(path); assert.ok(row)
    return new Response(row.data, {headers:{'content-type':row.mime}})
  }
  const result = await verifyMccPublication({fetcher, sleep:async()=>assert.fail('Unexpected retry')})
  assert.equal(result.publication,'VERIFIED'); assert.equal(result.files.length,5); assert.equal(calls.length,6); assert.equal(result.paidRequests,0)
})
test('unexpected paths, redirects, wrong types and corrupt public bytes never verify', async () => {
  await assert.rejects(boundedPublicGet('/api/blueprint','application/json',async()=>assert.fail('Must not call')),/PUBLIC_PATH_NOT_ALLOWED/)
  await assert.rejects(boundedPublicGet('/compare/mcc/','text/html',async()=>new Response('',{status:302,headers:{Location:'https://other.test/'}})))
  await assert.rejects(boundedPublicGet('/compare/mcc/','text/html',async()=>Response.json({})))
  let calls=0
  await assert.rejects(verifyMccPublication({fetcher:async()=>{calls++;return new Response('incorrect',{headers:{'content-type':'text/html'}})},sleep:async()=>{}}),/PUBLIC_FILE_MISMATCH/)
  assert.equal(calls,4)
})
