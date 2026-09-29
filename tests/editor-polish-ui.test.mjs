import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
import * as tools from '../src/lib/editorTools.ts'
import {blankWorld,newEntity} from '../src/lib/privateWorld.ts'
async function load(path){const url=new URL(path,import.meta.url),module={exports:{}},localRequire=createRequire(url);const code=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;runInNewContext(code,{module,exports:module.exports,require(id){if(id==='../lib/editorTools')return tools;if(['react','react/jsx-runtime'].includes(id))return localRequire(id);throw new Error('Unexpected import '+id)}},{timeout:1000});return module.exports.default}
test('actual selection toolbar displays transform actions and scene selection without side effects',async()=>{
 const Component=await load('../src/components/WorldSelectionToolbar.tsx'),world=blankWorld();world.entities=[newEntity('tree',3,4)];let writes=0;const mutate=()=>writes++
 const html=renderToStaticMarkup(React.createElement(Component,{world,selected:world.entities[0].id,point:{x:0,z:0},mode:'move',snap:1,disabled:false,onSelect:mutate,onMode:mutate,onSnap:mutate,onChange:mutate,onFocus:mutate,onError:mutate}))
 for(const label of ['Move','Rotate','Scale','Move to marker','Focus selection','Duplicate','Place on ground','Select placed object'])assert.ok(html.includes(label),label)
 assert.equal(writes,0);assert.match(html,/aria-pressed="true"/)
})
test('actual Codex panel recognizes the user river request without launching an agent',async()=>{
 const Component=await load('../src/components/WorldCodexPanel.tsx'),world=blankWorld();world.entities=[newEntity('tree',0,0)];let writes=0
 const html=renderToStaticMarkup(React.createElement(Component,{world,selected:null,request:'Przesuń drzewa by nie stały na rzece',disabled:false,onChange:()=>writes++,onMessage:()=>writes++}))
 assert.match(html,/Preview tree relocation/);assert.match(html,/Copy Codex instruction/);assert.match(html,/does not claim to run remote Codex/);assert.equal(writes,0)
})
