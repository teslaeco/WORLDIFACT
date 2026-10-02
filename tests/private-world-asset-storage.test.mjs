import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeWorldAsset, loadWorldAsset, listWorldAssets } from '../src/lib/privateWorldAssets.ts';
const owner = '11111111-1111-4111-8111-111111111111';
function fixtureGLB() {
    const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' } })), length = Math.ceil(json.length / 4) * 4;
    const bytes = new Uint8Array(20 + length), view = new DataView(bytes.buffer);
    [0x46546c67, 2, bytes.length, length, 0x4e4f534a].forEach((n, i) => view.setUint32(i * 4, n, true));
    bytes.fill(32, 20);
    bytes.set(json, 20);
    return new Blob([bytes], { type: 'model/gltf-binary' });
}
// Deterministic IndexedDB API adapter. Exercises production inspection, hashing,
// owner keys and transaction callbacks; this is not browser storage evidence.
function storage() {
    const stores = new Map([['assets', new Map()], ['blobs', new Map()]]);
    const database = { close() { }, transaction() {
            const tx = { oncomplete: null, onabort: null, onerror: null, aborted: false,
                abort() { this.aborted = true; queueMicrotask(() => this.onabort?.()); },
                objectStore(name) {
                    const data = stores.get(name);
                    const request = (action) => { const r = { result: undefined, onsuccess: null, onerror: null }; queueMicrotask(() => { if (!tx.aborted) {
                        r.result = action();
                        r.onsuccess?.();
                    } }); return r; };
                    return {
                        getAll: () => request(() => [...data.values()]), get: (key) => request(() => data.get(key)),
                        add: (value, key) => request(() => { data.set(key ?? value.key, structuredClone(value)); }),
                        put: (value, key) => request(() => { data.set(key, structuredClone(value)); }),
                    };
                },
            };
            setImmediate(() => { if (!tx.aborted)
                tx.oncomplete?.(); });
            return tx;
        } };
    const originalIDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'), originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() { const r = { result: database, onsuccess: null }; queueMicrotask(() => r.onsuccess?.()); return r; } } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
    return { stores, close() { for (const [key, original] of [['indexedDB', originalIDB], ['window', originalWindow]]) {
            if (original)
                Object.defineProperty(globalThis, key, original);
            else
                Reflect.deleteProperty(globalThis, key);
        } } };
}
test('stored and legacy device labels normalize without rewriting the original GLB or archive prompt', async () => {
    const f = storage(), blob = fixtureGLB(), prompt = '  Tall vehicle\nSolar roof\tBlue wheels  ';
    try {
        const item = await storeWorldAsset(owner, prompt, blob);
        assert.equal(item.name, 'Tall vehicle Solar roof Blue wheels');
        assert.equal(prompt, '  Tall vehicle\nSolar roof\tBlue wheels  ');
        const original = await loadWorldAsset(owner, item.id);
        assert.deepEqual(await original.arrayBuffer(), await blob.arrayBuffer());
        const metadata = f.stores.get('assets').get(`${owner}:${item.id}`);
        metadata.name = 'Legacy model\nwith lines';
        assert.equal((await listWorldAssets(owner))[0].name, 'Legacy model with lines');
        assert.equal((await storeWorldAsset(owner, 'Different label', blob)).id, item.id);
        assert.equal(metadata.name, 'Legacy model\nwith lines', 'original stored metadata is not silently rewritten');
        assert.equal(f.stores.get('assets').size, 1);
    }
    finally {
        f.close();
    }
});
test('reimport of identical bytes repairs a missing blob under the saved scene asset ID', async () => {
    const f = storage(), blob = fixtureGLB();
    try {
        const first = await storeWorldAsset(owner, 'Original model', blob);
        f.stores.get('blobs').delete(`${owner}:${first.id}`);
        await assert.rejects(loadWorldAsset(owner, first.id), /not in your device library/);
        const restored = await storeWorldAsset(owner, 'Recovered copy', blob);
        assert.equal(restored.id, first.id);
        assert.equal(restored.sha256, first.sha256);
        assert.deepEqual(await (await loadWorldAsset(owner, first.id)).arrayBuffer(), await blob.arrayBuffer());
        assert.equal(f.stores.get('assets').size, 1);
        await assert.rejects(loadWorldAsset('22222222-2222-4222-8222-222222222222', first.id), /not in your device library/);
    }
    finally {
        f.close();
    }
});
