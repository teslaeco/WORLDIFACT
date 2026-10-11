/** Prospective supervised-agent guidance, not an enforced runtime replacement.
 * The original tool schemas, budget guard and visual acceptance still govern. */
export const STUDIO_READBACK_EXAMPLE = `const r=await tools.mcp__blender__get_current_model({section:'summary',expected_revision:revision});
if(r.isError){text(r);throw Error('Current model read failed; do not guess its state.');}
const snapshot=JSON.parse(r.content.find(b=>b.type==='text').text);store('current_model',snapshot);
const display={...snapshot,scene:null,edits:null,sections:{...snapshot.sections},stored_snapshot:'current_model'};
for(const key of ['scene','edits']){if(display.sections[key])display.sections[key]={...display.sections[key],inline:false,stored:snapshot[key]!=null};}
text(display);`

export const STUDIO_READBACK_GUIDE = `WORLDIFACT MCP READBACK CONTRACT v1:
inspect_render views ONLY: front,side,back,three-quarter,face. Never use reference labels as tool views. Keep mandatory current-revision checks.
get_current_model sections ONLY: summary,scene,edits,report,visual_review. Page limit: integer from 1 to 16000 inclusive. Use limit:16000,offset:0,descriptor expected_sha256,current expected_revision; follow returned next_offset to null; concatenate/store page.text. Offsets count Unicode code points, not JS text.length. No pagination/hash on summary.
Batch required renders+summary in one exec; image(block) EVERY image; assess actual pixels next turn before finish/correction. No reasoning turn per page/view.
Store full snapshots; compact display below keeps errors/reports/completion_contract/revisions/inspected_views. Use exact stored data; load null sections via verified pages. Never guess data/acceptance or reprint scene/edit history.
${STUDIO_READBACK_EXAMPLE}
Read only: no finish/retry. Brief/images, capabilities, budget and completion gates unchanged.`
