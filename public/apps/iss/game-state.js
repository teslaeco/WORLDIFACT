export const ITEMS=[
 {id:'hand',key:'0',name:'Hands',abbr:'HAND'},
 {id:'wrench',key:'1',name:'Wrench',abbr:'WRENCH'},
 {id:'driver',key:'2',name:'Screwdriver',abbr:'DRIVER'},
 {id:'meter',key:'3',name:'Tester',abbr:'TEST'},
 {id:'fuse',key:'4',name:'F-A cartridge',abbr:'F-A'},
 {id:'parts',key:'5',name:'Nuts',abbr:'NUTS'},
 {id:'patch',key:'6',name:'Test patch',abbr:'PATCH'},
 {id:'filter',key:'7',name:'Filter',abbr:'FILTER'},
 {id:'connector',key:'8',name:'Connector',abbr:'CONN.'}
];
export const TASKS=[
 {id:'rack',name:'Equipment rack cover',zone:'inside',kind:'torque',tool:'driver',count:3,pos:[-1.72,-.15,7.7],detail:'Tighten 3 cover bolts. Release E when the indicator is in the green zone.'},
 {id:'filter',name:'Ventilation filter',zone:'inside',kind:'sequence',pos:[1.72,-.1,14],detail:'Stop the module, replace the filter and test the airflow.',steps:[['Switch off the fan','hand'],['Open the cover','driver'],['Replace the filter','filter','filter'],['Close the cover','driver'],['Test the airflow','meter']]},
 {id:'seal',name:'Leak-test chamber',zone:'inside',kind:'sequence',pos:[-1.72,-.1,17.2],detail:'This is a separate training chamber, not a crack in the real ISS hull.',steps:[['Read the pressure trend','meter'],['Isolate the training chamber','hand'],['Apply the demonstration patch','patch','patch'],['Check the pressure trend after sealing','meter']]},
 {id:'bolts',name:'Truss bracket',zone:'outside',kind:'torque',tool:'wrench',count:4,pos:[-12,-4.5,0],detail:'Tighten 4 bolts on the training bracket. The tool and bolts rotate as you work.'},
 {id:'nuts',name:'Shield mounting',zone:'outside',kind:'torque',tool:'wrench',count:2,consumable:'parts',pos:[-18,-4.5,0],detail:'Fit 2 nuts from the bag and tighten with the wrench into the green zone.'},
 {id:'fuse',name:'F1 training switchboard',zone:'outside',kind:'sequence',pos:[-10,-4.5,4],detail:'An original FORGE training circuit. Isolate and test the circuit before replacing the cartridge.',steps:[['Isolate and lock the circuit','hand'],['Confirm absence of voltage','meter'],['Open the cover','driver'],['Replace the F-A cartridge','fuse','fuse'],['Close the cover','driver'],['Energize the circuit and test','meter']]},
 {id:'connector',name:'Sensor connector',zone:'outside',kind:'sequence',pos:[-22,-4.5,4],detail:'Replace the connector in the isolated circuit, then test the signal.',steps:[['Isolate the sensor branch','hand'],['Test the branch with the tester','meter'],['Release the fastening','driver'],['Replace the connector','connector','connector'],['Test the connected signal','meter']]},
 {id:'solar',name:'Test panel drive',zone:'outside',kind:'sequence',pos:[-26,-4.5,0],detail:'A separate demonstration panel is used to practise drive servicing; the original NASA panels keep their source configuration.',steps:[['Read the drive anomaly','meter'],['Isolate the drive','hand'],['Secure the adjustment assembly','wrench'],['Point the panel towards the Sun marker','hand'],['Test the drive and power balance','meter']]}
];
export function freshState(){return {version:2,zone:'inside',bag:false,suit:false,selected:'hand',oxygen:100,doors:{10:false,20:false},items:{fuse:2,parts:4,patch:2,filter:2,connector:2},used:0,tasks:Object.fromEntries(TASKS.map(t=>[t.id,{step:0,done:false}])),message:'Approach the orange tool bag and press E.'};}
export function taskInfo(state,id){const t=TASKS.find(t=>t.id===id);if(!t)throw Error('Unknown task');return {task:t,status:state.tasks[id]};}
export function selectItem(state,id){if(!ITEMS.some(i=>i.id===id))throw Error('Unknown item');if(!state.bag&&id!=='hand')return fail(state,'Collect the tool bag first.');state.selected=id;return {ok:true};}
function fail(s,msg){s.message=msg;return {ok:false,message:msg};}
export function takeBag(s){if(s.bag)return {ok:true};s.bag=true;s.message='Tool bag collected. Select tools with keys 0–8 or from the inventory.';return {ok:true};}
export function equipSuit(s){if(s.zone!=='inside')return fail(s,'Put on your suit inside the station.');s.suit=true;s.oxygen=100;s.message='Suit equipped. Helmet, backpack and tether are ready in the simulator.';return {ok:true};}
export function canExit(s){return s.bag&&s.suit;}
export function enterZone(s,zone){if(!['inside','outside'].includes(zone))throw Error('Unknown zone');if(zone==='outside'&&!canExit(s))return fail(s,'Before going outside, collect the bag and equip the suit at the airlock locker.');s.zone=zone;if(zone==='inside')s.oxygen=100;return {ok:true};}
export function requirement(s,id){const {task:t,status:q}=taskInfo(s,id);if(q.done)return {done:true,label:'Task complete'};if(t.kind==='torque')return {tool:t.tool,label:`${t.id==='nuts'?'Fit and tighten nut':'Tighten bolt'} ${q.step+1}/${t.count}`,hold:true};const step=t.steps[q.step];return {label:step[0],tool:step[1],consumable:step[2],hold:false};}
export function perform(s,id,{distance=Infinity,torque=null}={}){
 const {task:t,status:q}=taskInfo(s,id);if(q.done)return fail(s,'This repair is already complete.');
 if(s.zone!==t.zone||!Number.isFinite(distance)||distance<0||distance>2.35)return fail(s,'Move closer to the workstation (within 2.35 m).');
 if(!s.bag)return fail(s,'You need the tool bag.');if(s.zone==='outside'&&!s.suit)return fail(s,'A suit is required for exterior work.');
 const r=requirement(s,id);if(s.selected!==r.tool)return fail(s,`Select: ${ITEMS.find(i=>i.id===r.tool).name}.`);
 if(t.kind==='torque'&&(!Number.isFinite(torque)||torque<.65||torque>.85))return fail(s,torque>.85?'Too tight. The simulator loosened the fastening — try again.':'Too loose. Hold E and release in the green zone.');
 const consume=t.kind==='torque'?t.consumable:r.consumable;if(consume&&!(s.items[consume]>0))return fail(s,'No parts left in the bag. Refill at the supply point.');
 if(consume){s.items[consume]--;s.used++;}q.step++;q.done=q.step>=(t.kind==='torque'?t.count:t.steps.length);
 s.message=q.done?`Completed: ${t.name}. ${t.id==='seal'?'A reduced leak does not confirm hull strength.':'Training test passed.'}`:`Step complete. Next: ${requirement(s,id).label}.`;
 return {ok:true,completed:q.done,step:q.step,message:s.message};
}
export function refill(s){if(s.zone!=='inside')return fail(s,'The supply point is inside the station.');for(const k of Object.keys(s.items))s.items[k]=k==='parts'?4:2;s.message='Bag supplies refilled. Used components remain in the return container.';return {ok:true};}
export function restoreState(input){const s=freshState();if(!input||input.version!==2)return s;
 s.bag=input.bag===true;s.suit=input.suit===true;s.zone='inside';
 for(const t of TASKS){const n=input.tasks?.[t.id]?.step;const max=t.kind==='torque'?t.count:t.steps.length;if(Number.isInteger(n)&&n>=0&&n<=max)s.tasks[t.id]={step:n,done:n===max};}
 for(const k of Object.keys(s.items)){const n=input.items?.[k];if(Number.isInteger(n)&&n>=0&&n<=20)s.items[k]=n;}
 s.used=Number.isInteger(input.used)&&input.used>=0?Math.min(input.used,1000):0;s.message='Progress loaded. You restart safely inside the station.';return s;
}
