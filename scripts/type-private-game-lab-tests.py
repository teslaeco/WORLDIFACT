"""Type fixture responses and update expected UI only for the owner's explicit changes."""
from pathlib import Path
marker=Path('ops/private-game-lab-test-types.json')
if marker.exists():raise SystemExit(0)
def edit(path,old,new,count=1):
    f=Path(path);s=f.read_text()
    if s.count(old)!=count:raise RuntimeError('Test integration context changed: '+path+' :: '+old[:90])
    f.write_text(s.replace(old,new))
f=Path('tests/creator-astra-access.test.ts');s=f.read_text()
s=s.replace("import {AccountEntitlements,type EntitlementStorage}","import {AccountEntitlements,type EntitlementStorage,type EntitlementStatus,type Reservation}")
assert s.count(')).json();return {call,values}}')==1
s=s.replace(')).json();return {call,values}}',')).json() as Promise<EntitlementStatus & Reservation>;return {call,values}}')
f.write_text(s)
f=Path('tests/private-worlds.test.ts');s=f.read_text()
s=s.replace("const alice =", "type WorldReply = { ok: boolean; code: number; revision: number; ids: string[]; document: ReturnType<typeof blankWorld>; worlds: { id: string }[] }\nconst readReply = (response: Response) => response.json() as Promise<WorldReply>\nconst alice =")
assert s.count('1790640000000)).json()')==1
s=s.replace('1790640000000)).json()', '1790640000000)).json() as Promise<WorldReply>')
s=s.replace("(await (await f.request('/api/worlds/' + w.id))!.json()).document.name", "(await readReply((await f.request('/api/worlds/' + w.id))!)).document.name")
s=s.replace("(await (await f.request('/api/worlds', 'GET', undefined, 'bob'))!.json()).worlds.length", "(await readReply((await f.request('/api/worlds', 'GET', undefined, 'bob'))!)).worlds.length")
f.write_text(s)
edit('tests/contest-finish.test.mjs','contest portal generators are expanded by default for immediate review','non-Shop portal generators remain expanded; the explicitly removed Shop duplicate stays absent')
edit('tests/contest-finish.test.mjs','  assert.match(source, /<details open className="portal-generator-drawer portal-page">/)','  assert.doesNotMatch(source, /<details open className="portal-generator-drawer portal-page">/)')
edit('tests/portal-entry.test.mjs','direct PortalPage Shop renders the real native generation form, Astra surface and WORLDIFACT return','direct PortalPage Shop preserves its real model form without the removed world-blueprint duplicate')
edit('tests/portal-entry.test.mjs','  assert.match(html, /data-world="enchanted-ai-shop"/)','  assert.doesNotMatch(html, /data-world="enchanted-ai-shop"/)\n  assert.match(html, /AI model · Model AI/)')
edit('tests/shop-render-helper.mjs',"      if (id === 'react') return react", "      if (id === 'react-router-dom' && adapters[id]) return { ...localRequire(id), ...adapters[id] }\n      if (id === 'react') return react")
edit('tests/shop-draft-lifecycle.test.mjs',"reconciliationRequired = false } = {})", "reconciliationRequired = false, withExistingJob = true, characterPrompt = '' } = {})")
edit('tests/shop-draft-lifecycle.test.mjs',"new Map([[clientModule.STUDIO_RECEIPT_KEY, JSON.stringify(selected)]])", "new Map(withExistingJob ? [[clientModule.STUDIO_RECEIPT_KEY, JSON.stringify(selected)]] : [])")
edit('tests/shop-draft-lifecycle.test.mjs',"const Component = await loadShopComponent({ react: hookReact, globals, adapters: {", "const Component = await loadShopComponent({ react: hookReact, globals, adapters: {\n    'react-router-dom': { useLocation: () => ({ pathname: '/shop', state: characterPrompt ? { worldPrompt: characterPrompt } : null }) },")
f=Path('tests/shop-draft-lifecycle.test.mjs')
f.write_text(f.read_text()+'''

test('private character brief fills an empty Shop draft without a generation, and never overwrites a recovered job', async () => {
  const characterPrompt = 'A silver-haired explorer with a teal jacket'
  const fresh = await harness({ withExistingJob: false, characterPrompt })
  try {
    assert.equal(fresh.byId('studio-prompt').props.value, characterPrompt)
    assert.equal(fresh.calls.filter(call => call.method === 'POST').length, 0)
  } finally { fresh.close() }
  const recovered = await harness({ characterPrompt })
  try {
    assert.equal(recovered.byId('studio-prompt').props.value, 'Original brown chess knight')
    assert.equal(recovered.calls.filter(call => call.method === 'POST').length, 0)
  } finally { recovered.close() }
})
''')
# Improve failure summaries without hiding any failed assertion or allowing a failed build.
f=Path('.github/workflows/prepare-private-game-lab.yml');s=f.read_text();s=s.replace('            tail -n 180 /tmp/world-verify.log', "            grep -E '✖|tests |pass |fail |error TS' /tmp/world-verify.log || true\n            tail -n 110 /tmp/world-verify.log");f.write_text(s)
marker.write_text('{"typedFixturesAndUpdatedOwnerRequirements":true}\n')
