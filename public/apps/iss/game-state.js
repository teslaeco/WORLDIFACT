export const ITEMS=[
 {id:'hand',key:'0',name:'Ręce',abbr:'DŁOŃ'},
 {id:'wrench',key:'1',name:'Klucz',abbr:'KLUCZ'},
 {id:'driver',key:'2',name:'Wkrętak',abbr:'WKRĘT'},
 {id:'meter',key:'3',name:'Tester',abbr:'TEST'},
 {id:'fuse',key:'4',name:'Kaseta F-A',abbr:'F-A'},
 {id:'parts',key:'5',name:'Nakrętki',abbr:'MOC.'},
 {id:'patch',key:'6',name:'Łata testowa',abbr:'ŁATA'},
 {id:'filter',key:'7',name:'Filtr',abbr:'FILTR'},
 {id:'connector',key:'8',name:'Złącze',abbr:'ZŁĄCZE'}
];
export const TASKS=[
 {id:'rack',name:'Osłona szafy',zone:'inside',kind:'torque',tool:'driver',count:3,pos:[-1.72,-.15,7.7],detail:'Dokręć 3 śruby pokrywy. Puść E, gdy wskaźnik znajdzie się w zielonym zakresie.'},
 {id:'filter',name:'Wkład wentylacji',zone:'inside',kind:'sequence',pos:[1.72,-.1,14],detail:'Zatrzymaj moduł, wymień wkład i wykonaj test przepływu.',steps:[['Wyłącz wentylator','hand'],['Otwórz pokrywę','driver'],['Wymień wkład filtra','filter','filter'],['Zamknij pokrywę','driver'],['Sprawdź przepływ','meter']]},
 {id:'seal',name:'Komora szczelności',zone:'inside',kind:'sequence',pos:[-1.72,-.1,17.2],detail:'To oddzielna komora ćwiczebna. Nie jest pęknięciem rzeczywistego kadłuba ISS.',steps:[['Odczytaj trend ciśnienia','meter'],['Odizoluj komorę ćwiczebną','hand'],['Nałóż łatę demonstracyjną','patch','patch'],['Sprawdź trend po uszczelnieniu','meter']]},
 {id:'bolts',name:'Wspornik kratownicy',zone:'outside',kind:'torque',tool:'wrench',count:4,pos:[-12,-4.5,0],detail:'Dokręć 4 śruby wspornika treningowego. Narzędzie i śruby obracają się podczas pracy.'},
 {id:'nuts',name:'Mocowanie osłony',zone:'outside',kind:'torque',tool:'wrench',count:2,consumable:'parts',pos:[-18,-4.5,0],detail:'Załóż 2 nakrętki z torby i dokręć kluczem do zielonego zakresu.'},
 {id:'fuse',name:'Rozdzielnia treningowa F1',zone:'outside',kind:'sequence',pos:[-10,-4.5,4],detail:'Autorski obwód treningowy FORGE. Wymiana kasety jest możliwa dopiero po odłączeniu zasilania i teście.',steps:[['Odłącz i zablokuj obwód','hand'],['Potwierdź brak napięcia','meter'],['Otwórz pokrywę','driver'],['Wymień kasetę F-A','fuse','fuse'],['Zamknij pokrywę','driver'],['Włącz obwód i wykonaj test','meter']]},
 {id:'connector',name:'Złącze czujnika',zone:'outside',kind:'sequence',pos:[-22,-4.5,4],detail:'Wymień złącze w odłączonym obwodzie i sprawdź sygnał.',steps:[['Odłącz gałąź czujnika','hand'],['Sprawdź gałąź testerem','meter'],['Zwolnij mocowanie','driver'],['Wymień złącze','connector','connector'],['Sprawdź sygnał po połączeniu','meter']]},
 {id:'solar',name:'Napęd panelu testowego',zone:'outside',kind:'sequence',pos:[-26,-4.5,0],detail:'Oddzielny panel demonstracyjny pozwala przećwiczyć serwis napędu; oryginalne panele NASA pozostają w źródłowej konfiguracji.',steps:[['Odczytaj anomalię napędu','meter'],['Odłącz napęd','hand'],['Zamocuj zespół regulacji','wrench'],['Ustaw panel w kierunku znacznika Słońca','hand'],['Sprawdź napęd i bilans mocy','meter']]}
];
export function freshState(){return {version:2,zone:'inside',bag:false,suit:false,selected:'hand',oxygen:100,doors:{10:false,20:false},items:{fuse:2,parts:4,patch:2,filter:2,connector:2},used:0,tasks:Object.fromEntries(TASKS.map(t=>[t.id,{step:0,done:false}])),message:'Podejdź do pomarańczowej torby i naciśnij E.'};}
export function taskInfo(state,id){const t=TASKS.find(t=>t.id===id);if(!t)throw Error('Nieznane zadanie');return {task:t,status:state.tasks[id]};}
export function selectItem(state,id){if(!ITEMS.some(i=>i.id===id))throw Error('Nieznany przedmiot');if(!state.bag&&id!=='hand')return fail(state,'Najpierw weź torbę z narzędziami.');state.selected=id;return {ok:true};}
function fail(s,msg){s.message=msg;return {ok:false,message:msg};}
export function takeBag(s){if(s.bag)return {ok:true};s.bag=true;s.message='Torba zabrana. Narzędzia wybierzesz klawiszami 0–8 lub w ekwipunku.';return {ok:true};}
export function equipSuit(s){if(s.zone!=='inside')return fail(s,'Skafander zakłada się wewnątrz.');s.suit=true;s.oxygen=100;s.message='Skafander założony. Hełm, plecak i asekuracja gotowe w symulatorze.';return {ok:true};}
export function canExit(s){return s.bag&&s.suit;}
export function enterZone(s,zone){if(!['inside','outside'].includes(zone))throw Error('Nieznana strefa');if(zone==='outside'&&!canExit(s))return fail(s,'Przed wyjściem weź torbę i załóż skafander przy szafce w śluzie.');s.zone=zone;if(zone==='inside')s.oxygen=100;return {ok:true};}
export function requirement(s,id){const {task:t,status:q}=taskInfo(s,id);if(q.done)return {done:true,label:'Zadanie ukończone'};if(t.kind==='torque')return {tool:t.tool,label:`${t.id==='nuts'?'Załóż i dokręć nakrętkę':'Dokręć śrubę'} ${q.step+1}/${t.count}`,hold:true};const step=t.steps[q.step];return {label:step[0],tool:step[1],consumable:step[2],hold:false};}
export function perform(s,id,{distance=Infinity,torque=null}={}){
 const {task:t,status:q}=taskInfo(s,id);if(q.done)return fail(s,'Ta naprawa jest już ukończona.');
 if(s.zone!==t.zone||!Number.isFinite(distance)||distance<0||distance>2.35)return fail(s,'Podejdź bliżej stanowiska (do 2,35 m).');
 if(!s.bag)return fail(s,'Potrzebujesz torby z narzędziami.');if(s.zone==='outside'&&!s.suit)return fail(s,'Do pracy na zewnątrz wymagany jest skafander.');
 const r=requirement(s,id);if(s.selected!==r.tool)return fail(s,`Wybierz: ${ITEMS.find(i=>i.id===r.tool).name}.`);
 if(t.kind==='torque'&&(!Number.isFinite(torque)||torque<.65||torque>.85))return fail(s,torque>.85?'Za mocno. Poluzowano mocowanie w symulatorze — spróbuj ponownie.':'Za słabo. Przytrzymaj E i puść w zielonym zakresie.');
 const consume=t.kind==='torque'?t.consumable:r.consumable;if(consume&&!(s.items[consume]>0))return fail(s,'Brak części w torbie. Uzupełnij zapas w magazynku.');
 if(consume){s.items[consume]--;s.used++;}q.step++;q.done=q.step>=(t.kind==='torque'?t.count:t.steps.length);
 s.message=q.done?`Ukończono: ${t.name}. ${t.id==='seal'?'Mniejszy ubytek nie potwierdza nośności kadłuba.':'Test ćwiczenia zaliczony.'}`:`Wykonano krok. Następnie: ${requirement(s,id).label}.`;
 return {ok:true,completed:q.done,step:q.step,message:s.message};
}
export function refill(s){if(s.zone!=='inside')return fail(s,'Magazynek znajduje się wewnątrz.');for(const k of Object.keys(s.items))s.items[k]=k==='parts'?4:2;s.message='Uzupełniono części w torbie. Zużyte elementy pozostają w pojemniku zwrotnym.';return {ok:true};}
export function restoreState(input){const s=freshState();if(!input||input.version!==2)return s;
 s.bag=input.bag===true;s.suit=input.suit===true;s.zone='inside';
 for(const t of TASKS){const n=input.tasks?.[t.id]?.step;const max=t.kind==='torque'?t.count:t.steps.length;if(Number.isInteger(n)&&n>=0&&n<=max)s.tasks[t.id]={step:n,done:n===max};}
 for(const k of Object.keys(s.items)){const n=input.items?.[k];if(Number.isInteger(n)&&n>=0&&n<=20)s.items[k]=n;}
 s.used=Number.isInteger(input.used)&&input.used>=0?Math.min(input.used,1000):0;s.message='Wczytano postęp. Zaczynasz bezpiecznie w module wewnętrznym.';return s;
}
