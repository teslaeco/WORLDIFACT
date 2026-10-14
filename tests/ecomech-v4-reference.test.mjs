import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readReferenceImage,prepareReferenceJpeg,buildEcomechAstraPayload,approvedMarker,JOB_ID,REFERENCE_URL } from '../scripts/ecomech-v4-astra-image-once.mjs'
test('V4 refuses text-only or random bytes, never launches provider task',()=>{
 assert.throws(()=>buildEcomechAstraPayload(new Uint8Array(8)),/ACTUAL_REFERENCE_IMAGE_REQUIRED/)
 assert.throws(()=>buildEcomechAstraPayload(new Uint8Array(50000)),/REFERENCE_JPEG_INVALID/)
 assert.equal(JOB_ID,'d3fc6e0f-6258-4a2d-9935-ae31b0048e61')
 assert.match(REFERENCE_URL,/^https:\/\/cdn\.shopify\.com\//)
})
test('image retrieval fails closed on non-image or bad PNG, without billing',async()=>{
 let calls=0
 await assert.rejects(readReferenceImage(async()=>{calls++;return Response.json({error:'not-image'})}),/REFERENCE_IMAGE_UNAVAILABLE/)
 assert.equal(calls,1)
 const response=()=>new Response(new Uint8Array(50000),{headers:{'content-type':'image/png'}})
 await assert.rejects(readReferenceImage(response),/REFERENCE_PNG_INVALID/)
})
test('single approval cannot be adapted for additional attempts or cost',()=>{
 const x={approval:'ECOMECH_V4_REFERENCE_SINGLE_TEST_20261015',
  maxProviderUsd:1.75,mode:'astra-standard',originalJobId:JOB_ID,
  paidAttempts:1,validUntil:'2026-10-15T06:00:00Z'}
 assert.equal(approvedMarker(x,Date.parse('2026-10-15T01:30:00Z')),true)
 assert.throws(()=>approvedMarker({...x,paidAttempts:2},Date.parse('2026-10-15T01:30:00Z')))
 assert.throws(()=>approvedMarker({...x,maxProviderUsd:20},Date.parse('2026-10-15T01:30:00Z')))
})
