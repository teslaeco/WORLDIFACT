"""Regression corrections after the model-catalog integration; no network."""
from pathlib import Path

def edit(path, old, new, expected=1):
    p = Path(path); text = p.read_text()
    if text.count(old) != expected: raise RuntimeError('Review required: ' + path + ' / ' + old[:100])
    p.write_text(text.replace(old, new))

p = 'src/pages/ShopPage.tsx'
edit(p, 'SOL procedural draft · one reference image', 'GPT-6 Sol procedural draft · one reference image')
edit(p, '`Generate one draft · ${MODEL_CATALOG[budgetModel].label}`', '`Generate FAST 3D draft · ${MODEL_CATALOG[budgetModel].label}`')
edit(p, "onClick={() => { setProfile(FAST_DRAFT_PROFILE); setTextureLimit(2048) }}", "onClick={() => { setBudgetModel('sol'); setProfile(FAST_DRAFT_PROFILE); setTextureLimit(2048) }}")
edit(p, 'aria-pressed={fast} disabled=', "aria-pressed={fast && budgetModel === 'sol'} disabled=")
edit(p, 'Your reference images are kept for SLOW · QUALITY.', 'Additional views are retained for SLOW · QUALITY; budget mode uses one selected image.')
edit(p, 'FAST uses a generated Sol specification plus local procedural geometry.', 'FAST uses the selected model’s generated specification plus local procedural geometry.')

p = 'tests/shop-draft-lifecycle.test.mjs'
edit(p, "{ worldId: 'enchanted-ai-shop', prompt: 'A blue rook in FAST', mode: 'live' }", "{ worldId: 'enchanted-ai-shop', prompt: 'A blue rook in FAST', mode: 'live', model: 'gpt-6-sol' }")
edit(p, "assert.equal(fastOption.props.disabled, true, 'FAST must not silently discard selected photos')", "assert.equal(fastOption.props.disabled, false, 'Budget mode now supports one reference')\n    h.byId('studio-mode').props.onChange({ target: { value: FAST_DRAFT_PROFILE } }); await h.settle()\n    assert.ok(h.all().some(n => n.type === 'img' && /Your reference 1/.test(n.props.alt || '')), 'Changing model must retain the reference')\n    assert.equal(h.byId('studio-photos').props.disabled, true, 'One-image budget limit stays explicit')")
with Path(p).open('a') as f:
    f.write('''\n
test('one reference is sent to the selected budget model without replacing the original archive', async () => {
  const h = await harness({ ready: true })
  try {
    await h.poll()
    h.byId('studio-prompt').props.onChange({ target: { value: 'Control cabinet from the supplied reference' } })
    h.byId('studio-photos').props.onChange({ target: { files: [{ name: 'cabinet.png' }], value: 'cabinet.png' } })
    await h.settle()
    h.byId('studio-mode').props.onChange({ target: { value: FAST_DRAFT_PROFILE } }); await h.settle()
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    const posts = h.calls.filter(c => c.path === '/api/blueprint' && c.method === 'POST')
    assert.equal(posts.length, 1)
    const body = JSON.parse(posts[0].body)
    assert.equal(body.image, 'data:image/jpeg;base64,ZmFrZQ==')
    assert.equal(body.model, 'gpt-6-sol')
    assert.equal(h.archive.get(oldId).sha256, 'original')
    assert.equal(h.calls.some(c => c.path === '/api/studio/jobs' && c.method === 'POST'), false)
  } finally { h.close() }
})
''')
print('Updated lifecycle tests cover supported image input, selected-model payload, and archive preservation.')
