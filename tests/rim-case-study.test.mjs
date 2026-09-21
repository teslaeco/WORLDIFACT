import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = resolve(root, 'public')
const articleDir = resolve(publicRoot, 'blog/astra-vs-meshy-rim')
const html = readFileSync(resolve(articleDir, 'index.html'), 'utf8')
const evidence = JSON.parse(readFileSync(resolve(articleDir, 'evidence.json'), 'utf8'))

test('rim article references actual local evidence and stylesheet assets without leaving public', () => {
  for (const [, relative] of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) {
    const path = resolve(articleDir, relative)
    assert.ok(path.startsWith(publicRoot + sep), `Outside public: ${relative}`)
    assert.ok(existsSync(path), `Missing article asset: ${relative}`)
  }
  assert.equal([...html.matchAll(/<img\b/g)].length, evidence.images.length)
  assert.equal(new Set(evidence.images.map(image => image.file)).size, evidence.images.length)
})

test('published screenshot crops match their provenance hashes and declared dimensions', () => {
  for (const image of evidence.images) {
    const bytes = readFileSync(resolve(articleDir, image.file))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256, image.file)
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8 ')
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length)
    const width = bytes.readUInt16LE(26) & 0x3fff
    const height = bytes.readUInt16LE(28) & 0x3fff
    assert.equal(width, image.width)
    assert.equal(height, image.height)
    assert.ok(html.includes(`src="./${image.file}" width="${width}" height="${height}"`))
    assert.match(image.sourceSha256, /^[a-f0-9]{64}$/)
  }
})

test('article source references resolve and footer uses a full-page static navigation', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(id), `Missing anchor ${id}`)
  assert.match(html, /<html lang="en">/)
  assert.doesNotMatch(html, /<script\b|<iframe\b/i)
  for (const [, attrs] of html.matchAll(/<img\b([^>]+)>/g)) assert.match(attrs, /alt="[^"\s][^"]+"/)
  const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8')
  assert.ok(app.includes('<a href="/blog/astra-vs-meshy-rim/">'))
  assert.ok(!app.includes('<Link to="/blog/astra-vs-meshy-rim/">'))
})
