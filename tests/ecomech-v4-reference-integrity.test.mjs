import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  assertPinnedEcomechReference,
  ECOMECH_V4_REFERENCE_SHA256,
  ECOMECH_V4_REFERENCE_WIDTH,
  ECOMECH_V4_REFERENCE_HEIGHT,
} from '../scripts/lib/ecomechReferenceIntegrity.mjs'
import { readReferenceImage } from '../scripts/ecomech-v4-astra-image-once.mjs'

// Synthetic header is deliberately not claimed to be a decodable source photo.
// The exact production SHA-256 pin prevents it from being sent to Oracle.
function syntheticPng() {
  const bytes = new Uint8Array(48_000)
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82])
  const data = new DataView(bytes.buffer)
  data.setUint32(16,ECOMECH_V4_REFERENCE_WIDTH,false)
  data.setUint32(20,ECOMECH_V4_REFERENCE_HEIGHT,false)
  return bytes
}

test('V4 reference is bound to the recovered original SHA-256', () => {
  assert.equal(ECOMECH_V4_REFERENCE_SHA256,
    '9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053')
  const bytes=syntheticPng()
  const digest=createHash('sha256').update(bytes).digest('hex')
  assert.equal(assertPinnedEcomechReference(bytes,digest).sha256,digest)
  assert.throws(()=>assertPinnedEcomechReference(bytes),/REFERENCE_SHA_MISMATCH_NO_PAID_CALL/)
  bytes[399]=1
  assert.throws(()=>assertPinnedEcomechReference(bytes,digest),/REFERENCE_SHA_MISMATCH_NO_PAID_CALL/)
})

test('V4 refuses altered dimensions and oversized untrusted reference', () => {
  const bytes=syntheticPng()
  new DataView(bytes.buffer).setUint32(20,1403,false)
  assert.throws(()=>assertPinnedEcomechReference(bytes),/REFERENCE_IMAGE_DIMENSIONS_CHANGED/)
  bytes[0]=0
  assert.throws(()=>assertPinnedEcomechReference(bytes),/REFERENCE_PNG_INVALID/)
})

test('V4 reference network path rejects changed photo before any Oracle submission',async()=>{
  let calls=0
  const bytes=syntheticPng()
  await assert.rejects(readReferenceImage(async()=>{
    calls++
    return new Response(bytes,{status:200,headers:{'content-type':'image/png','content-length':String(bytes.length)}})
  }),/REFERENCE_SHA_MISMATCH_NO_PAID_CALL/)
  assert.equal(calls,1)
})

test('V4 reads image using strict streaming byte ceiling',async()=>{
  const bytes=syntheticPng()
  await assert.rejects(readReferenceImage(async()=>new Response(bytes,{
    headers:{'content-type':'image/png','content-length':String(13*1024*1024)}
  })),/PROVIDER_RESPONSE_TOO_LARGE/)
})
