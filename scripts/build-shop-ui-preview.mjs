import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { preparePublicGallery } from './prepare-public-gallery.mjs'
import { PUBLIC_MODELS } from '../src/lib/publicGallery.ts'

export const PREVIEW_WORKER_NAME = 'worldifact-shop-ui-preview-20261007'
export const PREVIEW_BRANCH = 'review/ai-shop-original-20261007'
export const PREVIEW_LABEL = 'Interface preview · sample account and balance · no generation or payments'
export const PREVIEW_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src blob: https://worldifact-shop-ui-preview-20261007.xodobrox.workers.dev/gallery-assets/;  worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"

export const PREVIEW_ASSET_PATHS = PUBLIC_MODELS.map(model => model.path)

/** API responses stay synthetic. Native fetch can read only exact public assets
 * and this isolated origin's local Blobs, never account/provider endpoints. */
export function createPreviewFetch(nativeFetch, origin = 'https://ui-preview.invalid', assetPaths = []) {
  return async function previewFetch(input, init = {}) {
    const method = String(init.method || (typeof input === 'object' ? input.method : '') || 'GET').toUpperCase()
    const raw = typeof input === 'string' ? input : input?.url || String(input)
    const url = new URL(raw, origin)
    const denied = () => Response.json({ previewFixture: true, error: 'Interface preview only. Generation, account changes, uploads and payments are disabled.' }, { status: 405 })
    if (method !== 'GET' || url.origin !== origin || url.username || url.password || url.search || url.hash) return denied()
    if (nativeFetch && (assetPaths.includes(url.pathname) && url.protocol === 'https:' || url.protocol === 'blob:' && raw.startsWith(`blob:${origin}/`))) {
      return nativeFetch(url.href, { method: 'GET', credentials: 'omit', redirect: 'error', signal: init.signal, headers: {} })
    }
    if (url.protocol !== 'https:') return denied()
    const reply = value => Response.json({ previewFixture: true, ...value })
    if (url.pathname === '/api/account/session') return reply({ user: { id: 'ui-preview-only', email: 'preview@example.invalid', displayName: 'Preview' } })
    if (url.pathname === '/api/account/entitlements') return reply({
      paidGenerationPolicy: 'paid-membership-held-points-v1', credits: 1000, reservedCredits: 0, availableCredits: 1000,
      subscription: { active: true, plan: 'pro' }, generationCosts: { luna: 15, sol: 50, astra: 250 },
      free: { fastRemaining: 2, slowRemaining: 0 }, billingReview: false,
      generationAdmission: { luna: { allowed: true }, sol: { allowed: true }, astra: { allowed: true } }, studioAdmission: { allowed: true },
    })
    if (url.pathname === '/api/billing/status') return reply({ plans: { pro: { checkoutReady: false }, studio: { checkoutReady: false } } })
    if (url.pathname === '/api/health') return reply({ generationReady: true, model: 'gpt-6.1-sol', qualityModel: 'gpt-6-astra', astraBlueprintReady: true, lunaBlueprintReady: true, draftModels: ['sol', 'luna'] })
    if (url.pathname === '/api/studio/status') return reply({
      ready: true, detailedReady: true, photoReady: true, fastReady: true, accountRequired: true,
      reason: 'READY', oracle: 'PREVIEW_FIXTURE_ONLY', promptMaxLength: 4000, detailedReferenceLimit: 4,
      newJobPolicy: 'legacy-usd175-v1', tiersReady: false,
    })
    if (url.pathname === '/api/studio/current') return reply({ accountContract: 'approved-test-account-v1', current: null })
    if (url.pathname === '/api/studio/library') return reply({ accountId: 'ui-preview-only', models: [], hasMore: false, nextCursor: null })
    if (url.pathname === '/api/project-files/status') return reply({ ready: false, oracle: 'PREVIEW_FIXTURE_ONLY' })
    return Response.json({ previewFixture: true, error: 'No account service, saved request or generated artifact exists in this interface preview.' }, { status: 404 })
  }
}

/** Capture form/navigation actions before React can act; the server is also
 * assets-only and its CSP restricts connections to public assets/local Blobs. */
export function installPreviewGuards(scope, fetchFixture) {
  Object.defineProperty(scope, 'fetch', { value: fetchFixture, writable: false, configurable: false })
  const inform = () => {
    const notice = scope.document.getElementById('preview-action-notice')
    if (notice) notice.textContent = 'Preview only. No request was sent and no points or payment were used.'
  }
  scope.document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); inform() }, true)
  scope.document.addEventListener('click', event => {
    if (event.target?.closest?.('a')) { event.preventDefault(); event.stopImmediatePropagation(); inform() }
  }, true)
  const disableUploads = () => scope.document.querySelectorAll('input[type="file"]').forEach(input => { if (!input.disabled) input.disabled = true })
  new scope.MutationObserver(disableUploads).observe(scope.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  disableUploads()
}

export async function buildShopPreview() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const source = resolve(root, '.review/shop-preview-source'), output = resolve(root, '.review/shop-ui-preview')
  await mkdir(source, { recursive: true })
  const imported = path => JSON.stringify(resolve(root, path))
  const entry = `import ${imported('src/index.css')};\nimport React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { BrowserRouter } from 'react-router-dom';\nimport ShopPage from ${imported('src/pages/ShopPage.tsx')};\nimport { AccountProvider } from ${imported('src/lib/account.tsx')};\nimport AccountStatusBar from ${imported('src/components/AccountStatusBar.tsx')};\nif (location.pathname !== '/shop') history.replaceState(null, '', '/shop');\nconst fixture = (${createPreviewFetch.toString()})(globalThis.fetch.bind(globalThis), location.origin, ${JSON.stringify(PREVIEW_ASSET_PATHS)});\n(${installPreviewGuards.toString()})(globalThis, fixture);\ncreateRoot(document.getElementById('root')).render(<BrowserRouter><AccountProvider><AccountStatusBar /><ShopPage /></AccountProvider></BrowserRouter>);\n`
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex,nofollow" /><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}" /><title>WORLDIFACT · interface preview</title><style>.preview-disclosure{margin:0;padding:10px 16px;background:#172929;border-bottom:1px solid #375457;color:#c2dcd5;text-align:center;font:12px/1.45 system-ui}.preview-disclosure small{display:block;color:#afc5ce}.preview-disclosure output{display:block;color:#ecd3a2}.preview-disclosure output:empty{display:none}</style></head><body><aside class="preview-disclosure"><strong>${PREVIEW_LABEL}</strong><small>Design review with public project examples below. No real account data or new generation.</small><output id="preview-action-notice" aria-live="polite"></output></aside><div id="root"></div><script type="module" src="/entry.jsx"></script></body></html>`
  await writeFile(resolve(source, 'entry.jsx'), entry)
  await writeFile(resolve(source, 'index.html'), html)
  await build({ configFile: false, root: source, publicDir: false, envDir: false, envPrefix: [], plugins: [react()],
    build: { outDir: output, emptyOutDir: true, sourcemap: false, minify: true }, logLevel: 'warn',
  })
  const publicAssets = await preparePublicGallery(resolve(output, 'gallery-assets'))
  if (publicAssets.size !== PREVIEW_ASSET_PATHS.length) throw Error('Unexpected public gallery asset set.')
  await writeFile(resolve(output, '_headers'), `/*\n  Content-Security-Policy: ${PREVIEW_CSP}\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n`)
  const emitted = await readFile(resolve(output, 'index.html'), 'utf8')
  if (!emitted.includes(PREVIEW_LABEL) || !emitted.includes('connect-src')) throw new Error('Preview isolation disclosure was not emitted.')
  console.log(`Built UI-only preview at ${output}; two pinned public project models; no backend, app credentials, private assets or generation.`)
  return { output }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildShopPreview()
