/// <reference lib="dom" />
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_DOCUMENT_BYTES,
  MAX_EXTRA_REFERENCES,
  MAX_MODEL_REFERENCE_BYTES,
  MAX_VIDEO_REFERENCE_BYTES,
  STUDIO_ATTACHMENT_ACCEPT,
  classifyStudioAttachment,
  combinedVisualReferences,
  studioReferencePrompt,
} from '../src/lib/studioAttachments.ts'

const file = (name: string, type = '', size = 1) => ({ name, type, size }) as Pick<File, 'name' | 'type' | 'size'>

test('Shop accepts two bounded extra references across documents, 3D files, images and video', () => {
  assert.equal(MAX_EXTRA_REFERENCES, 2)
  assert.equal(MAX_DOCUMENT_BYTES, 20 * 1024 * 1024)
  assert.equal(MAX_MODEL_REFERENCE_BYTES, 48 * 1024 * 1024)
  assert.equal(MAX_VIDEO_REFERENCE_BYTES, 100 * 1024 * 1024)
  assert.equal(classifyStudioAttachment(file('spec.pdf', 'application/pdf')), 'document')
  assert.equal(classifyStudioAttachment(file('notes.docx')), 'document')
  assert.equal(classifyStudioAttachment(file('mesh.glb', 'model/gltf-binary')), 'model')
  assert.equal(classifyStudioAttachment(file('walkthrough.mp4', 'video/mp4')), 'video')
  assert.equal(classifyStudioAttachment(file('texture.webp', 'image/webp')), 'image')
  assert.match(STUDIO_ATTACHMENT_ACCEPT, /\.pdf/)
  assert.match(STUDIO_ATTACHMENT_ACCEPT, /\.docx/)
  assert.match(STUDIO_ATTACHMENT_ACCEPT, /\.glb/)
  assert.match(STUDIO_ATTACHMENT_ACCEPT, /\.mp4/)
  assert.throws(() => classifyStudioAttachment(file('payload.exe')), /Unsupported extra reference/)
})

test('document requirements are appended without silently truncating the user description', () => {
  const result = studioReferencePrompt('Create a chair.', ['Use 800 mm height and oak slats.'])
  assert.match(result, /Create a chair\./)
  assert.match(result, /Reference 1: Use 800 mm height and oak slats\./)
  assert.throws(() => studioReferencePrompt('x'.repeat(1990), ['y'.repeat(100)], 2000), /exceed 2000/)
})

test('visual reference count combines photos with prepared model/video/image previews', () => {
  const photo = { name: 'front.jpg', view: 'front', dataUrl: 'data:image/jpeg;base64,AAAA', textureMaxSize: 2048 } as const
  const attachment = {
    key: 'a', file: {} as File, name: 'movie.mp4', mime: 'video/mp4', bytes: 100,
    category: 'video' as const, previewPhoto: { ...photo, name: 'movie frame', view: 'detail' as const }, needsServerAnalysis: false,
  }
  assert.equal(combinedVisualReferences([photo], [attachment]).length, 2)
  assert.throws(() => combinedVisualReferences([photo, photo, photo], [attachment, attachment]), /at most four visual views/)
})
