import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { avatarApi, MAX_AVATAR_GLB_BYTES, NEPTUNE_QUEEN_JOB_ID, RAPPER_ARCHIVE_URL } from '../server/avatar.ts';

function minimalGlb() {
  const bytes = new Uint8Array(20);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  return bytes;
}

test('exact current Neptune Queen is proxied read-only from the saved Oracle job', async () => {
  let calls = 0;
  const response = await avatarApi(
    new Request('https://worldifact.test/api/avatar/neptune-queen'),
    { ORACLE_ENDPOINT: 'https://current-queen.trycloudflare.com', ORACLE_API_TOKEN: 'server-secret' },
    (async (input, init) => {
      calls++;
      assert.equal(String(input), `https://current-queen.trycloudflare.com/v1/jobs/${NEPTUNE_QUEEN_JOB_ID}/model`);
      assert.equal(init?.method, 'GET');
      assert.match(String((init?.headers as Record<string,string>).Authorization), /^Bearer /);
      return new Response(minimalGlb(), { status: 200, headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': '20' } });
    }) as typeof fetch,
  );
  assert.ok(response);
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-WORLDIFACT-Source-Job'), '99397623-e45c-48dc-95ec-6f84446a54d5');
  assert.equal(MAX_AVATAR_GLB_BYTES, 48 * 1024 * 1024, 'the current FORGE Queen must fit the bounded 48 MB avatar proxy');
});

test('avatar endpoint fails closed and never invents an old queen asset', async () => {
  const response = await avatarApi(new Request('https://worldifact.test/api/avatar/neptune-queen'), {}, (() => { throw new Error('network must not run'); }) as typeof fetch);
  assert.ok(response);
  assert.equal(response.status, 503);
  const source = await readFile(new URL('../src/lib/playerAvatar.ts', import.meta.url), 'utf8');
  assert.match(source, /99397623-e45c-48dc-95ec-6f84446a54d5/);
  assert.doesNotMatch(source, /queen\.glb|E19/i);
});


test('shared world avatar picker offers the exact current Queen and archived rapper without old queen assets', async () => {
  const player = await readFile(new URL('../src/lib/playerAvatar.ts', import.meta.url), 'utf8');
  const world = await readFile(new URL('../src/components/StartingWorld.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/mobile-hotfix.css', import.meta.url), 'utf8');
  assert.match(player, /99397623-e45c-48dc-95ec-6f84446a54d5/);
  const asset = await readFile(new URL('../src/lib/avatarAsset.ts', import.meta.url), 'utf8');
  assert.match(asset, /\/api\/avatar\/rapper-la/);
  assert.match(world, /Fan Queen · 8 Planets \/ MPC2/);
  assert.match(world, /Fan 1 · Throw \/ drone/);
  assert.match(world, /Fan 2 · Mount both \/ fly/);
  assert.match(world, /Tracksuit/);
  assert.match(world, /Dress/);
  assert.match(world, /Casual/);
  assert.match(world, /Rapper · MPC2 archive/);
  assert.match(css, /avatar-picker/);
  assert.equal(RAPPER_ARCHIVE_URL, 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/models/rapper-v10.glb');
  assert.doesNotMatch(player, /queen\.glb|E19/i);
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

test('mobile hotfix hides non-critical meadow controls and docks navigation outside gameplay center', async () => {
  const css = await readFile(new URL('../src/mobile-hotfix.css', import.meta.url), 'utf8');
  assert.match(css, /\.world-actions \{ display:none !important; \}/);
  assert.match(css, /position:fixed/);
  assert.match(css, /bottom:0/);
  assert.match(css, /foundation-frame/);
  const portal = await readFile(new URL('../src/pages/PortalPage.tsx', import.meta.url), 'utf8');
  assert.match(portal, /world-primary-frame[\s\S]*portal-generator-drawer/, 'primary world must render before Astra drawer');
});
