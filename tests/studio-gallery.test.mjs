import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('model gallery is reachable from account, AI Shop and My World', async () => {
  const [app, account, shop, myWorld, gallery] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/ShopPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PrivateGameLab.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/StudioGallery.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(app, /path="\/account\/models"/)
  assert.match(account, /\/account\/models/)
  assert.match(shop, /StudioGallery/)
  assert.match(myWorld, /Generated models on this device/)
  assert.match(myWorld, /importGalleryModel/)
  assert.match(gallery, /Preview 3D/)
  assert.match(gallery, /Download GLB/)
  assert.match(gallery, /device archive is not a cloud backup/i)
})
