import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  PROJECT_ATTACHMENT_ACCEPT,
  PROJECT_ATTACHMENT_LIMIT,
  PROJECT_ATTACHMENT_MAX_BYTES,
  attachmentCategory,
  validateProjectAttachment,
} from '../src/lib/projectAttachments.ts'

const file = (name, size = 1024, type = '') => ({ name, size, type, lastModified: 1 })

test('project attachments allow two files and cap each file at 100 MB', () => {
  assert.equal(PROJECT_ATTACHMENT_LIMIT, 2)
  assert.equal(PROJECT_ATTACHMENT_MAX_BYTES, 100 * 1024 * 1024)
  assert.equal(validateProjectAttachment(file('brief.pdf', PROJECT_ATTACHMENT_MAX_BYTES, 'application/pdf')), 'document')
  assert.throws(() => validateProjectAttachment(file('too-large.mp4', PROJECT_ATTACHMENT_MAX_BYTES + 1, 'video/mp4')), /100 MB/)
})

test('project attachment allow-list covers documents, 3D, textures, video and zip without executable formats', () => {
  assert.equal(attachmentCategory(file('spec.docx', 10, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')), 'document')
  assert.equal(attachmentCategory(file('character.glb', 10, 'model/gltf-binary')), 'model-3d')
  assert.equal(attachmentCategory(file('mesh.fbx', 10, 'application/octet-stream')), 'model-3d')
  assert.equal(attachmentCategory(file('albedo.exr', 10, 'image/aces')), 'texture')
  assert.equal(attachmentCategory(file('turntable.mp4', 10, 'video/mp4')), 'video')
  assert.equal(attachmentCategory(file('materials.zip', 10, 'application/zip')), 'archive')
  assert.equal(attachmentCategory(file('run.exe', 10, 'application/x-msdownload')), null)
  for (const ext of ['.pdf', '.docx', '.glb', '.fbx', '.png', '.mp4', '.zip']) assert.match(PROJECT_ATTACHMENT_ACCEPT, new RegExp(ext.replace('.', '\\.')))
})

test('Shop and Game Lab both expose the shared local project-file picker and its truth boundary', async () => {
  const [shop, lab, picker] = await Promise.all([
    readFile(new URL('../src/pages/ShopPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/P0GameLab.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ProjectAttachmentPicker.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(shop, /ProjectAttachmentPicker scope="shop"/)
  assert.match(lab, /ProjectAttachmentPicker scope="game-lab"/)
  assert.match(picker, /max {PROJECT_ATTACHMENT_LIMIT} files · 100 MB each/)
  assert.match(picker, /not uploaded to GPT-6 Astra, Oracle, a supplier or manufacturing automatically/)
  assert.match(picker, /PDF \/ Word \/ 3D \/ texture \/ video \/ ZIP/)
})
