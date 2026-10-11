/** Prospective supervised-agent guidance, not an enforced runtime replacement.
 * The original tool schemas, budget guard and visual acceptance still govern. */
export const STUDIO_READBACK_EXAMPLE = `const r=await tools.mcp__blender__get_current_model({section:'summary',expected_revision:revision});
if(r.isError){text(r);throw Error('Current model read failed; do not guess its state.');}
const snapshot=JSON.parse(r.content.find(b=>b.type==='text').text);store('current_model',snapshot);
const display={...snapshot,scene:null,edits:null,sections:{...snapshot.sections},stored_snapshot:'current_model'};
for(const key of ['scene','edits']){if(display.sections[key])display.sections[key]={...display.sections[key],inline:false,stored:snapshot[key]!=null};}
text(display);`

export const STUDIO_READBACK_GUIDE = `WORLDIFACT MCP READBACK CONTRACT v1:
The only inspect_render view values are "front", "side", "back", "three-quarter", "face". Reference-image labels are not tool view names: never send "left", "right", "top", "detail", "perspective", "isometric" or "three_quarter" to inspect_render. Use the exact applicable supported views and retain all mandatory current-revision visual checks.
get_current_model section values are exactly "summary", "scene", "edits", "report", "visual_review". Its page limit is an integer from 1 to 16000 inclusive. Use limit:16000 for section pages; never request the entire section by increasing that limit. Start at offset:0; pass the descriptor's expected_sha256 and current expected_revision, follow each returned next_offset until null, concatenate page.text and store the complete result. Offsets count Unicode code points: never advance by JavaScript text.length. Do not paginate summary or attach a section hash to summary.
Batch required inspect_render calls and one summary read in the same exec, forwarding every actual image block with image(block). Assess the returned pixels on the next model turn before an honest finish_model or a necessary correction. Do not turn each view or section page into a separate model reasoning turn.
Use this summary presentation after inspection, and the same full-storage/compact-display pattern for build/edit snapshots. Preserve all errors, reports, completion_contract, revisions and inspected_views; do not print repeated full scene JSON or accumulated edit code into model history. Read exact needed data from the saved complete snapshot. If a section is null, load its verified pages before using it. Never infer missing contents or visual acceptance.
${STUDIO_READBACK_EXAMPLE}
This example does not finish, accept, retry or generate a model. It does not change the original brief, reference bytes, capabilities, provider ceiling or any completion gate.`
