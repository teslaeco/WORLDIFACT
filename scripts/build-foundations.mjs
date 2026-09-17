// Build pinned originals checked out by the workflow. No AI generation or backend jobs.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, cp, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertEnglishFoundationOutput, assertEnglishLocaleSource } from './lib/english-ui.mjs';
const sources = JSON.parse(await readFile('config/foundation-sources.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
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
  }
  run('npm', ['ci', '--no-audit', '--no-fund'], work);
  if (app === 'chess') run('npm', ['run', 'build', '--', '--base', source.base], work);
  else run('npm', ['run', 'build'], work, {
    TERRA_PUBLIC_BASE: source.base,
    VITE_EVIDENCE_API_URL: (await readFile(join(root, 'config/evidence-worker-url.txt'), 'utf8')).trim(),
  });
  const entries = app === 'chess' ? ['index.html', 'guest.html'] : ['index.html'];
  await assertEnglishFoundationOutput(join(work, 'dist'), entries, { scanJavaScript: app !== 'chess' });
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
    html = html.replace('</head>', '<style>.worldifact-return{position:fixed;left:10px;bottom:10px;display:flex;gap:8px;z-index:20000;font:600 12px system-ui}.worldifact-return a{display:block;padding:10px 12px;border-radius:8px;background:#123341;color:#eaf9f1;text-decoration:none;border:1px solid #83bdae}html[data-worldifact-framed] .worldifact-return{display:none}</style><script>if(window.parent!==window)document.documentElement.dataset.worldifactFramed="true"</script></head>')
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
