/** Final layout adjustment on the reviewed branch. No network or billing calls. */
import { readFile, writeFile } from 'node:fs/promises'
const path = 'src/pages/ShopPage.tsx'
const before = await readFile(path, 'utf8')
const anchor = '            <small>STANDARD remains the detailed Oracle/Blender path. FAST uses the public server-side Sol blueprint path and a local procedural preview; it does not claim an Oracle mesh.</small>'
if (before.split(anchor).length !== 2) throw new Error('Expected one reviewed selector anchor')
const after = before.replace(anchor, '          </div>\n          <div className="shop-internal-only" hidden>\n' + anchor)
await writeFile(path, after)
console.log('The public model dropdown is now directly followed by the compact cost notice and prompt; advanced internal fields remain hidden.')
