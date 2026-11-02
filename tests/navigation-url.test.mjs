import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const read=name=>readFileSync(new URL(`../app/static/${name}`,import.meta.url),'utf8');
const html=read('index.html'), routing=read('navigation-url.js');
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
function setup(url){
 const dom=new JSDOM(html,{url:'https://example.com/mentora/'+url,runScripts:'outside-only'}),w=dom.window;
 w.ResizeObserver=class{observe(){}};w.CSS={escape:x=>x};w.matchMedia=()=>({matches:false});w.setInterval=()=>0;w.structuredClone=structuredClone;
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.startNewChat=()=>w.dispatchEvent(new w.Event('veya:chat-navigate'));
 w.eval(routing);return{dom,w};
}
test('workspace URL ownership clears conflicting state and preserves host options and base path',()=>{
 const s=setup('?theme=light&host=demo#section'),{w}=s;
 try{
  const base='https://example.com/mentora/?tab=tasks&task=t&run=r&dayShare=secret&dayResult=d&case=c&board=b&portfolioView=returns&theme=light#section';
  for(const [target,state,expected] of [['home',{},''],['widgets',{board:'starter-forex'},'widgets'],['portfolio',{portfolioView:'returns'},'portfolio'],['tasks',{task:'t',run:'r',dayShare:'secret'},'tasks'],['costs',{},'costs']]){
   const url=w.MentoraNavigation.url(target,state,base);
   assert.equal(url.pathname,'/mentora/');assert.equal(url.hash,'#section');assert.equal(url.searchParams.get('theme'),'light');assert.equal(url.searchParams.get('tab')||'',expected);
   for(const key of ['board','portfolioView','task','run','dayShare'])assert.equal(url.searchParams.get(key),state[key]||null);
   assert.equal(url.searchParams.has('case'),false);assert.equal(url.searchParams.has('dayResult'),false);
  }
 }finally{w.close();}
});
test('legacy unambiguous deep links recover; mixed leftovers cleanly resolve to home',()=>{
 for(const [query,tab] of [['?board=starter-forex','widgets'],['?portfolioView=returns','portfolio'],['?portfolioView=returns&board=starter-forex',null]]){
  const {w}=setup(query+'&theme=light');try{assert.equal(new URL(w.location).searchParams.get('tab'),tab);assert.equal(new URL(w.location).searchParams.get('theme'),'light');if(!tab)assert.equal(w.location.search,'?theme=light');}finally{w.close();}
 }
 for(const query of ['?dayShare=token','?task=t&run=r','?dayResult=t','?case=demo']){const {w}=setup(query);assert.equal(w.location.search,query);w.close();}
});
const defaults={version:1,boards:['stocks','crypto','forex'].map(id=>({id:'starter-'+id,title:id,messages:[],cards:[{id:id+'-chart',title:id,component:'tv-advanced-chart',status:'ready',url:'/generated/'+id+'.html',x:0,y:0,w:12,h:24}]}))};
function dataFetch(w,defaultResponse=()=>Promise.resolve(defaults)){
 w.fetch=async path=>({ok:true,json:async()=>path==='/api/widgets/default-boards'?await defaultResponse():path==='/api/day/tasks'?{tasks:[],sceneTasks:[],markets:[],serverTime:new Date().toISOString()}:path.endsWith('/workflow')?{watchlist:[],preferences:{},strategies:{}}:path.endsWith('/opportunities')?{items:[]}:{positions:[],trades:[],plans:[],history:[],settings:{},scan:{}}});
}
test('cold forex deep link survives asynchronous defaults, then home removes all workspace state',async()=>{
 const {w}=setup('?tab=widgets&board=starter-forex&portfolioView=returns&theme=light');
 try{
  let resolveDefaults;dataFetch(w,()=>new Promise(resolve=>{resolveDefaults=resolve;}));
  w.eval(read('widgets.js'));w.eval(read('day-tasks.js'));await tick();
  assert.equal(new URL(w.location).searchParams.get('board'),'starter-forex');assert.equal(new URL(w.location).searchParams.has('portfolioView'),false);
  resolveDefaults(defaults);await tick();
  assert.equal(JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')).activeId,'starter-forex');assert.equal(new URL(w.location).searchParams.get('board'),'starter-forex');
  w.dispatchEvent(new w.Event('veya:chat-navigate'));assert.equal(w.location.search,'?theme=light');assert.equal(w.document.querySelector('#widgetWorkspace').hidden,true);
 }finally{w.close();}
});
test('switching portfolio to widgets preserves the previous history entry and popstate restores it',async()=>{
 const {w}=setup('?tab=portfolio&portfolioView=returns&theme=light');
 try{
  dataFetch(w);w.eval(read('widgets.js'));w.eval(read('day-tasks.js'));w.eval(read('portfolio.js'));await tick();
  w.document.querySelector('#railWidgets').click();await tick();assert.equal(new URL(w.location).searchParams.get('tab'),'widgets');assert.equal(new URL(w.location).searchParams.has('portfolioView'),false);
  w.history.back();await tick();assert.equal(new URL(w.location).searchParams.get('tab'),'portfolio');assert.equal(new URL(w.location).searchParams.get('portfolioView'),'returns');assert.equal(new URL(w.location).searchParams.has('board'),false);assert.equal(w.document.querySelector('#portfolioWorkspace').hidden,false);
  w.history.forward();await tick();assert.equal(new URL(w.location).searchParams.get('tab'),'widgets');assert.equal(w.document.querySelector('#widgetWorkspace').hidden,false);assert.equal(w.document.querySelector('#railHome').hasAttribute('aria-current'),false);assert.equal(w.document.querySelector('#railWidgets').getAttribute('aria-current'),'page');
 }finally{w.close();}
});
test('late defaults cannot pull the user back from home or overwrite a manually chosen board',async()=>{
 for(const action of ['home','select']){
  const {w}=setup('?tab=widgets&board=starter-forex');
  try{
   let resolveDefaults;dataFetch(w,()=>new Promise(resolve=>{resolveDefaults=resolve;}));if(action==='select')w.localStorage.setItem('mentora-widget-boards-v1',JSON.stringify({activeId:'mine',openIds:['mine','other'],boards:[{id:'mine',title:'Mine',cards:[]},{id:'other',title:'Other',cards:[]}]}));w.eval(read('widgets.js'));w.eval(read('day-tasks.js'));await tick();
   if(action==='home')w.dispatchEvent(new w.Event('veya:chat-navigate'));
   else w.document.querySelector('[data-board=other]').click();
   const before=w.location.href;resolveDefaults(defaults);await tick();
   assert.equal(w.location.href,before);
  }finally{w.close();}
 }
});

test('explicit workspace takes precedence over stale parameters, including legacy task result links',()=>{
 for(const [query,expected] of [
  ['?tab=widgets&board=starter-forex&portfolioView=returns&dayShare=old','?tab=widgets&board=starter-forex'],
  ['?tab=portfolio&portfolioView=returns&board=starter-forex&case=demo','?tab=portfolio&portfolioView=returns'],
  ['?tab=tasks&dayResult=t&run=r&board=starter-forex','?tab=tasks&task=t&run=r'],
  ['?tab=tasks&task=t&run=r&dayShare=token&portfolioView=returns','?tab=tasks&task=t&run=r&dayShare=token']
 ]){const {w}=setup(query);try{assert.equal(w.location.search,expected);}finally{w.close();}}
});
test('task landing navigation clears widget state and browser back restores the chosen board',async()=>{
 const {w}=setup('?tab=widgets&board=starter-forex&theme=light');
 try{
  dataFetch(w);w.eval(read('widgets.js'));w.eval(read('day-tasks.js'));await tick();
  w.document.querySelector('#railTasks').click();await tick();assert.equal(w.location.search,'?theme=light&tab=tasks');
  assert.equal(w.document.querySelector('#taskWorkspace').hidden,false);
  w.history.back();await tick();assert.equal(new URL(w.location).searchParams.get('board'),'starter-forex');assert.equal(w.document.querySelector('#widgetWorkspace').hidden,false);assert.equal(w.document.querySelector('#railHome').hasAttribute('aria-current'),false);
 }finally{w.close();}
});

test('failed deep-link loading keeps existing boards and stops advertising the unresolved destination',async()=>{
 const {w}=setup('?tab=widgets&board=starter-forex');
 try{
  w.localStorage.setItem('mentora-widget-boards-v1',JSON.stringify({activeId:'mine',boards:[{id:'mine',title:'My research',cards:[]}]}));
  dataFetch(w,()=>Promise.reject(new Error('offline')));w.eval(read('widgets.js'));await tick();
  assert.equal(new URL(w.location).searchParams.get('board'),'mine');assert.match(w.document.querySelector('#widgetStatus').textContent,/目标看板暂时无法加载/);assert.equal(JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')).boards.length,1);
 }finally{w.close();}
});
