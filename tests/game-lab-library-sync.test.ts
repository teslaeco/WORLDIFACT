import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mergeGameLabArchive } from '../src/lib/gameLabLibrary.ts'

function entry(id:string, savedAt:string) {
  return { id, prompt:'Generated model '+id, savedAt, byteLength:8_900_000, sha256:'a'.repeat(64), review:'UNREVIEWED' }
}

test('Game Lab keeps new device GLBs visible even when the server ledger has not verified them yet',()=>{
  const newest=entry('11111111-1111-4111-8111-111111111111','2026-10-01T14:12:15.000Z')
  const older=entry('22222222-2222-4222-8222-222222222222','2026-09-28T13:26:03.000Z')
  const merged=mergeGameLabArchive([newest,older],[older.id])
  assert.deepEqual(merged.map(item=>item.id),[newest.id,older.id],'device archive order is preserved')
  assert.equal(merged[0].accountVerified,false,'missing ledger verification never hides local GLB bytes')
  assert.equal(merged[1].accountVerified,true)
  assert.equal(merged[0].byteLength,8_900_000)
})

test('server verification is only a badge and cannot delete the generated device archive',()=>{
  const models=[
    entry('33333333-3333-4333-8333-333333333333','2026-10-01T09:25:56.000Z'),
    entry('44444444-4444-4444-8444-444444444444','2026-10-01T07:41:30.000Z'),
  ]
  const merged=mergeGameLabArchive(models,[])
  assert.equal(merged.length,models.length)
  assert.ok(merged.every(item=>item.accountVerified===false))
  assert.deepEqual(merged.map(item=>{const copy={...item};delete (copy as Partial<typeof item>).accountVerified;return copy}),models)
})


test('archive save notifies Game Lab and Game Lab no longer filters local GLBs out of view',async()=>{
  const [archiveSource,labSource]=await Promise.all([
    readFile(new URL('../src/lib/studioArchive.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/pages/PrivateGameLab.tsx',import.meta.url),'utf8'),
  ])
  assert.match(archiveSource,/worldifact:studio-archive-changed/)
  assert.match(archiveSource,/worldifact-studio-archive-revision-v1/)
  assert.match(archiveSource,/dispatchEvent\(new CustomEvent/)
  assert.match(archiveSource,/localStorage\.setItem\(STUDIO_ARCHIVE_SIGNAL_KEY/)
  assert.match(labSource,/mergeGameLabArchive\(archive,verified\)/)
  assert.doesNotMatch(labSource,/archive\.filter\(e=>\(result\.ids/)
  assert.match(labSource,/window\.addEventListener\(STUDIO_ARCHIVE_EVENT,update\)/)
  assert.match(labSource,/window\.addEventListener\('storage',storage\)/)
  assert.match(labSource,/DEVICE ARCHIVE/)
  assert.match(labSource,/Use local GLB/)
})
