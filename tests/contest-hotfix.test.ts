import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared world uses only the user-upload visual target and no old Queen/Rapper selector', async () => {
  const player = await readFile(new URL('../src/lib/playerAvatar.ts', import.meta.url), 'utf8');
  const world = await readFile(new URL('../src/components/StartingWorld.tsx', import.meta.url), 'utf8');
  assert.match(player, /user-upload:model-mm-1-mobile-proxy/);
  assert.match(player, /worldifact-user-upload-player/);
  assert.doesNotMatch(player, /neptune|rapper|queen\.glb|99397623/i);
  assert.doesNotMatch(world, /avatarChoice|avatar-picker|Rapper|Neptune Queen/);
});

test('Game Lab and portal reference uploads are raised to six MB and include phone scan entry points', async () => {
  for (const path of ['../src/components/P0GameLab.tsx','../src/components/PortalAstraGenerator.tsx']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /6 \* 1024 \* 1024/);
    assert.match(source, /up to 6 MB/);
    assert.match(source, /capture="environment"/);
  }
  const worker = await readFile(new URL('../server/worker.ts', import.meta.url), 'utf8');
  assert.match(worker, /MAX_IMAGE_BYTES = 6 \* 1024 \* 1024/);
  assert.match(worker, /maxReferenceImageMb: 6/);
});

test('AI Shop reference selection automatically leaves FAST instead of disabling uploads', async () => {
  const source = await readFile(new URL('../src/pages/ShopPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /const referenceLimit: TextureLimit = fast \? 4096 : textureLimit/);
  assert.match(source, /if \(fast\) \{ setProfile\('standard'\); setTextureLimit\(referenceLimit\) \}/);
  assert.doesNotMatch(source, /disabled=\{busy \|\| photoBusy \|\| fast \|\| photos\.length >= 3\}/);
  assert.match(source, /Originals up to 12 MB are prepared locally before upload/);
});

test('EVA hotfix preserves NASA station visibility, float presentation and safe camera clamp', async () => {
  const source = await readFile(new URL('../public/apps/iss/eva-hotfix.js', import.meta.url), 'utf8');
  assert.match(source, /NASA_VTAD_ISS_HISTORICAL/);
  assert.match(source, /FORGE_Exterior_Training_Overlay/);
  assert.match(source, /Math\.sin\(t \* 1\.55\)/);
  assert.match(source, /clamp\(distance, 4\.8, 8\.4\)/);
  const html = await readFile(new URL('../public/apps/iss/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="reset-view"/);
  assert.match(html, /id="eva-guide"/);
  assert.match(html, /eva-hotfix\.js/);
  assert.match(html, /hotfix\.css/);
});

test('mobile hotfix gives portal gameplay the viewport and compacts the ISS HUD', async () => {
  const css = await readFile(new URL('../src/mobile-hotfix.css', import.meta.url), 'utf8');
  assert.match(css, /\.foundation-page > \.foundation-heading/);
  assert.match(css, /height:calc\(100dvh - var\(--mobile-dock\)/);
  assert.match(css, /\.foundation-loading \{ display:none !important; \}/);
  const issCss = await readFile(new URL('../public/apps/iss/hotfix.css', import.meta.url), 'utf8');
  assert.match(issCss, /width:132px !important/);
  assert.match(issCss, /\.quick-goals \{ display:none !important; \}/);
  const portal = await readFile(new URL('../src/pages/PortalPage.tsx', import.meta.url), 'utf8');
  assert.match(portal, /Open Chess full screen/);
  assert.match(portal, /foundation-frame/);
  assert.doesNotMatch(portal, /foundation-loading/);
});

test('contest release configuration enables public Astra and Studio with a persistent high ceiling', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.vars.OPENAI_MODEL, 'gpt-6-astra');
  assert.equal(config.vars.ENABLE_PAID_GENERATION, 'true');
  assert.equal(config.vars.PUBLIC_PILOT, 'true');
  assert.equal(config.vars.ENABLE_STUDIO_JOBS, 'true');
  assert.equal(config.vars.ENABLE_ORACLE_JOBS, 'true');
  assert.equal(config.vars.GENERATION_REQUEST_LIMIT, '10000');
  assert.equal(config.vars.ENABLE_APPROVED_FAST_TEST, 'false');
  assert.ok(Date.parse(config.vars.GENERATION_EXPIRES_AT) > Date.parse('2026-09-18T00:00:00Z'));
});
