import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { ADMIN_RELEASE_BASE as BASE, ADMIN_RELEASE_MARKER as MARKER, ADMIN_RELEASE_CONTENT as CONTENT, ADMIN_RELEASE_PATHS as PATHS, selectPipelineReleaseOptions } from '../scripts/select-pipeline-only-release.mjs'
import { buildAiShopUiConfig } from '../scripts/build-compatible-mcc-config.mjs'
const head = '1'.repeat(40), blob = '2'.repeat(40)
const changes = PATHS.map(path => ({path, status: [MARKER,'tests/admin-source-release.test.mjs'].includes(path) ? 'A' : 'M'}))
function select(overrides = {}) {
  const v = {parent:BASE,changes,content:CONTENT,mode:'100644',parents:`${head} ${BASE}\n`,...overrides}
  return selectPipelineReleaseOptions('fixture',(_cwd,args)=> {
    if(args[0]==='rev-parse') return args.at(-1)==='HEAD^{commit}' ? head : v.parent
    if(args[0]==='diff') return v.changes.map(c=>`${c.status}\0${c.path}\0`).join('')
    if(args[0]==='rev-list') return v.parents
    if(args[0]==='ls-tree') return (args.length>5 ? PATHS : [MARKER]).map(p=>`${v.mode} blob ${blob}\t${p}\0`).join('')
    if(args[0]==='cat-file') return v.content
    throw Error('Unexpected Git read')
  })
}
test('approved source release selects only existing preserving transport',()=>{
  const opts=select()
  assert.deepEqual(opts,{aiShopUi:true,preserveSecrets:true,preserveBilling:true,preserveRemoteVars:true})
  assert.equal(readFileSync(new URL('../'+MARKER,import.meta.url),'utf8'),CONTENT)
  const base=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'))
  const config=buildAiShopUiConfig(base,opts)
  assert.equal(config.vars,undefined)
  assert.deepEqual(config.durable_objects,base.durable_objects)
  assert.deepEqual(config.migrations,base.migrations)
  assert.equal(JSON.parse(CONTENT).activateAdmin,false)
  assert.equal(JSON.parse(CONTENT).activatePromotions,false)
})
test('source release rejects wrong parent, merge commit, altered scope and symlinks',()=>{
  for(const override of [{parent:'3'.repeat(40)},{parents:`${head} ${BASE} ${'4'.repeat(40)}\n`},{content:CONTENT+' '},{mode:'120000'},{changes:changes.slice(1)},{changes:[...changes,{status:'M',path:'wrangler.jsonc'}]},{changes:changes.map(c=>c.path===MARKER ? {...c,status:'M'}:c)}]) assert.throws(()=>select(override),/SCOPE_NOT_VERIFIED/)
})
test('unscoped CLI publication stops before producing synchronization flags',()=>{
  const run=spawnSync(process.execPath,['scripts/select-pipeline-only-release.mjs'],{encoding:'utf8'})
  // A real reviewed single-parent release may pass; all other heads must fail closed.
  if(run.status===0) {
    assert.match(run.stdout,/preserve_billing=true/)
    assert.match(run.stdout,/preserve_remote_vars=true/)
  } else {
    assert.equal(run.status,1)
    assert.equal(run.stdout,'')
    assert.match(run.stderr,/stopped before credential setup/)
  }
})
