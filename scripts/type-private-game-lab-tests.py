"""Type fixture responses explicitly; keep every behavioral assertion intact."""
from pathlib import Path
marker=Path('ops/private-game-lab-test-types.json')
if marker.exists():raise SystemExit(0)
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
marker.write_text('{"fixtureTypesOnly":true}\n')
