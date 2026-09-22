// Build pinned originals checked out by the workflow. No AI generation or backend jobs.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, cp, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertEnglishFoundationOutput, assertEnglishLocaleSource, assertRuntimeTranslationPairs } from './lib/english-ui.mjs';
const sources = JSON.parse(await readFile('config/foundation-sources.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const TERRA_RUNTIME_TRANSLATIONS = [
  ['Wczytaj', 'Load'], ['Zapisz', 'Save'], ['Błąd', 'Error'], ['Otwórz', 'Open'],
  ['Zamknij', 'Close'], ['Powrót', 'Back'], ['Następny', 'Next'], ['Poprzedni', 'Previous'],
  ['Ładowanie…', 'Loading…'], ['Zaawansowany', 'Advanced'], ['Prosty', 'Simple'],
];
function run(command, args, cwd, extra = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...extra }, stdio: 'inherit', timeout: 360000, shell: false });
  if (result.error || result.status !== 0) throw Error(`Foundation command failed: ${command} ${args.join(' ')}`);
}
for (const [app, source] of Object.entries(sources)) {
  const root = resolve('.upstream', app);
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', shell: false });
  if (revision.status !== 0 || revision.stdout.trim() !== source.commit) throw Error(`Pinned ${app} source is missing. Use the foundation checkout workflow.`);
  const work = app === 'terra' ? join(root, 'web') : root;
  if (app === 'terra') {
    const main = join(work, 'src/main.tsx');
    let text = await readFile(main, 'utf8');
    // The pinned Terra source still contains legacy Polish literals. The
    // shipped contest runtime owns their reviewed English presentation.
    // Verify that source explicitly rather than treating its translation table
    // as untranslated UI when Vite bundles it with the application.
    assertRuntimeTranslationPairs(
      await readFile(join(work, 'public/contest-runtime.js'), 'utf8'),
      TERRA_RUNTIME_TRANSLATIONS,
      'Terra contest-runtime.js',
    );
    // The existing Earth-observation interface opens directly for the ISS computer mission.
    const entry = "useState<EntryMode>('chooser')", tab = "useState<Tab>('ai')";
    if (!text.includes(entry) || !text.includes(tab)) throw Error('Review the changed Terra entry points before applying the Nile mission link.');
    text = text.replace(entry, "useState<EntryMode>(new URLSearchParams(location.search).get('mission') === 'nile' ? 'advanced' : 'chooser')")
      .replace(tab, "useState<Tab>(new URLSearchParams(location.search).get('mission') === 'nile' ? 'earth' : 'ai')");
    await writeFile(main, text);
  }
  if (app === 'chess') {
    // Cube Chess intentionally ships optional locale catalogs. Verify that the
    // English catalog itself is clean and remains the fallback rather than
    // rejecting legitimate Polish/German/etc. translations bundled for users.
    assertEnglishLocaleSource(await readFile(join(root, 'web/i18n/locales.js'), 'utf8'), 'Cube Chess locales.js');
    // Reuse the existing Supabase identity through WORLDIFACT's HttpOnly cookie
    // session. This modifies the pinned local build only, not the upstream repo.
    const authPath = join(root, 'web/auth/AuthApi.js');
    const authSource = await readFile(authPath, 'utf8');
    const authProxy = await readFile('scripts/lib/chess-auth-proxy.js', 'utf8');
    const authBlob = createHash('sha1').update(`blob ${Buffer.byteLength(authSource)}\0`).update(authSource).digest('hex');
    if (authBlob !== '892ffbd020671c76d721588c115a1b106502d988' && authSource !== authProxy) {
      throw Error('Review changed Chess authentication source before installing the shared-account adapter.');
    }
    await writeFile(authPath, authProxy);
  }
  run('npm', ['ci', '--no-audit', '--no-fund'], work);
  if (app === 'chess') run('npm', ['run', 'build', '--', '--base', source.base], work);
  else run('npm', ['run', 'build'], work, {
    TERRA_PUBLIC_BASE: source.base,
    VITE_EVIDENCE_API_URL: (await readFile(join(root, 'config/evidence-worker-url.txt'), 'utf8')).trim(),
  });
  const entries = app === 'chess' ? ['index.html', 'guest.html'] : ['index.html'];
  // Both foundations intentionally bundle non-English source strings:
  // Chess provides opt-in locale catalogs and Terra's contest runtime maps its
  // legacy literals to English. Verify the reviewed entry surfaces and those
  // mechanisms here. Terra also contains old standalone archive/gallery pages
  // that remain a separately documented localization backlog; do not pretend
  // they are English merely because the main app is translated at runtime.
  await assertEnglishFoundationOutput(join(work, 'dist'), entries, {
    scanJavaScript: false,
    scanNestedHtml: false,
  });
  const destination = resolve('dist/apps', app);
  await mkdir(destination, { recursive: true });
  await cp(join(work, 'dist'), destination, { recursive: true, dereference: false });
  await cp(join(root, 'LICENSE'), join(destination, 'LICENSE'));
  if (app === 'terra') await cp(join(root, 'published'), join(destination, 'published'), {
    recursive: true, filter: path => !/\.(tiff?|zip)$/i.test(path), dereference: false,
  });
  for (const entry of entries) {
    const path = join(destination, entry);
    let html = await readFile(path, 'utf8');
    // Keep the same return controls when a user opens a copied app directly.
    const nav = `<nav class="worldifact-return" aria-label="WORLDIFACT"><a href="/" target="_top">← WORLDIFACT</a>${app === 'chess' ? '<a href="/chess/shop" target="_top">Shop boards &amp; pieces</a>' : '<a href="/iss" target="_top">Return to ISS</a>'}</nav>`;
    const chessWatchdog = app === 'chess' && entry === 'guest.html'
      ? `<script>setTimeout(function(){if(document.documentElement.dataset.directGuestReady==="true")return;var box=document.getElementById("forgemcp-guest-loading");if(!box)return;box.innerHTML='<div style="max-width:520px;padding:22px;text-align:center"><strong style="display:block;font-size:20px;margin-bottom:10px">Chess preview is taking too long</strong><p style="font-weight:400">Your browser may be short on WebGL memory. You can retry this full-screen build or return to WORLDIFACT without waiting on an endless loader.</p><p><a href="/apps/chess/guest.html?guest=1" style="color:#9fe8ff">Retry Chess</a> · <a href="/" style="color:#9fe8ff">Back to WORLDIFACT</a></p></div>';},12000);</script>`
      : '';
    html = html.replace('</head>', '<style>.worldifact-return{position:fixed;left:10px;bottom:10px;display:flex;gap:8px;z-index:20000;font:600 12px system-ui}.worldifact-return a{display:block;padding:10px 12px;border-radius:8px;background:#123341;color:#eaf9f1;text-decoration:none;border:1px solid #83bdae}html[data-worldifact-framed] .worldifact-return{display:none}</style><script>if(window.parent!==window)document.documentElement.dataset.worldifactFramed="true"</script>' + chessWatchdog + '</head>')
      .replace('</body>', nav + '</body>');
    await writeFile(path, html);
  }
}
const files = [];
async function inspect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Do not publish symlinks: ${file}`);
    if (entry.isDirectory()) await inspect(file);
    else {
      const { size } = await stat(file);
      if (size > 25 * 1024 * 1024) throw Error(`Cloudflare asset size limit: ${file}`);
      if (/\.(html|js|css|wasm|glb)$/.test(file)) {
        const bytes = await readFile(file);
        files.push({ path: '/' + file.replaceAll('\\', '/').replace(/^dist\//, ''), bytes: size, sha256: hash(bytes) });
      }
    }
  }
}
await inspect('dist/apps');
await writeFile('dist/foundation-release.json', JSON.stringify({ sources, files }, null, 2) + '\n');
console.log(`PASS: original Chess and Terra builds assembled alongside ISS; ${files.length} app entry/assets pinned for release checks.`);
