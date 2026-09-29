import { proposeWorldCommand, type AssistantProposal, type GameWorld } from './gameWorld.ts'
export type WorldTool = { name:string;description:string;inputSchema:Record<string,unknown>;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>Promise<string> }
export type WorldModelContext = { registerTool:(tool:WorldTool,options:{signal:AbortSignal})=>Promise<unknown>|unknown }
/** Original adapter following the current WebMCP API; never installs a fake polyfill. */
export function worldTools(read:()=>GameWorld|null,propose:(value:AssistantProposal)=>void):WorldTool[]{
 const verify=(input:unknown,keys:string[])=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!==keys.sort().join(','))throw new Error('Invalid tool input.');const args=input as Record<string,unknown>,world=read();if(!world||args.worldId!==world.id)throw new Error('Only the current owned world can be inspected.');return{args,world}}
 return[
 {name:'worldifact_read_my_open_world',description:'Read the currently open owned WORLDIFACT game world, without account identity, tokens or model files.',inputSchema:{type:'object',properties:{worldId:{type:'string'}},required:['worldId'],additionalProperties:false},annotations:{readOnlyHint:true},execute:async input=>{const {world}=verify(input,['worldId']);return JSON.stringify({status:'READ_ONLY',id:world.id,name:world.name,sky:world.sky,objects:world.objects.map(o=>({id:o.id,name:o.name,kind:o.kind,x:o.x,z:o.z})),controls:world.controls,paidRequests:0})}},
 {name:'worldifact_propose_world_edit',description:'Propose a local terrain, sky, object or game-button change. It is NOT applied until the human presses Apply in the editor. Does not invoke AI, save to cloud, execute code or start a payment.',inputSchema:{type:'object',properties:{worldId:{type:'string'},command:{type:'string',maxLength:1000}},required:['worldId','command'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{const {args}=verify(input,['worldId','command']);if(typeof args.command!=='string')throw new Error('Use an editor command.');const proposal=proposeWorldCommand(args.command);if(!proposal)throw new Error('Unsupported local command.');propose(proposal);return JSON.stringify({status:'AWAITING_HUMAN_APPLY',proposal,paidRequests:0})}}
 ]
}
export async function registerWorldTools(context:WorldModelContext|undefined,read:()=>GameWorld|null,propose:(value:AssistantProposal)=>void,signal:AbortSignal){
 if(!context||typeof context.registerTool!=='function')return 'WEBMCP_UNAVAILABLE'
 try{for(const tool of worldTools(read,propose)){if(signal.aborted)return 'CLOSED';await context.registerTool(tool,{signal})}return signal.aborted?'CLOSED':'WEBMCP_REGISTERED'}catch{return 'WEBMCP_UNAVAILABLE'}
}
