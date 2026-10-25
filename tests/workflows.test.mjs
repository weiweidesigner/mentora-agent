import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../app/static/workflows.js',import.meta.url),'utf8');
const day=readFileSync(new URL('../app/static/day-tasks.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,30));
const kinds=['start','watchlist','profile','model','condition','output','watchlist_update'].map(id=>({id,label:id,description:id}));
const graph={version:1,nodes:[{id:'input',kind:'start',title:'输入',x:90,y:140,arguments:{score:3}},{id:'out',kind:'output',title:'输出',x:440,y:140}],edges:[{source:'input',target:'out',when:'always'}]};
async function setup(){
 const dom=new JSDOM(html,{url:'https://example.com/mentora/?tab=tasks',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];let saved=null,buildError=false;
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.setInterval=()=>0;w.structuredClone=structuredClone;w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.fetch=async(url,options={})=>{
  calls.push([url,options]);const body=options.body?JSON.parse(options.body):{};
  if(url.includes('/workflows/catalog'))return{ok:true,json:async()=>({kinds,tools:[{id:'search',label:'搜索',description:'工具',group:'Agent 工具'}],model:'deepseek-flash'})};
  if(url.endsWith('/workflows/build'))return{ok:!buildError,json:async()=>buildError?{detail:'模型返回了无效流程'}:{title:'AI 流程',graph}};
  if(url.endsWith('/workflows/runs')&&options.method==='POST')return{ok:true,json:async()=>({id:'trial',status:'queued'})};
  if(url.endsWith('/workflows/runs/trial'))return{ok:true,json:async()=>({id:'trial',status:'success',nodes:Object.fromEntries(body.graph?.nodes?.map(n=>[n.id,{status:'success'}])||[]),result:{interpretation:'真实结果'}})};
  if(url.endsWith('/api/day/tasks')&&options.method==='POST'){saved={...body,id:'saved-wf',nextAt:'2026-11-01T06:30:00Z'};return{ok:true,json:async()=>saved};}
  return{ok:true,json:async()=>({tasks:saved?[saved]:[],sceneTasks:[],markets:[],serverTime:new Date().toISOString()})};
 };
 w.eval(day);w.eval(code);await tick();
 return{dom,w,d:w.document,calls,error:()=>{buildError=true;},saved:()=>saved};
}
test('new task chooser preserves Agent editor and opens full-screen workflow canvas',async()=>{
 const s=await setup();try{
  s.d.querySelector('#taskSidebarNew').click();assert(s.d.querySelector('.wfChooser').open);
  s.d.querySelector('[data-choice=agent]').click();assert(s.d.querySelector('#dayDialog').open);
  s.d.querySelector('#dayDialog').close();s.d.querySelector('#taskSidebarNew').click();s.d.querySelector('[data-choice=workflow]').click();await tick();
  assert(s.d.querySelector('.wfCanvas').open);assert.equal(s.d.querySelector('#wfAgent'),null);assert(s.d.querySelector('.wfCanvas svg'));assert(s.d.querySelector('[data-add=watchlist]'));assert(s.d.querySelector('[data-add=profile]'));assert(s.d.querySelector('[data-add=tool]'));
 }finally{s.w.close();}
});
test('nodes connect, reject cycles, retain structural parameters and submit a trial snapshot',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open();s.d.querySelector('[data-add=start]').click();s.d.querySelector('[data-add=output]').click();
  let cards=s.d.querySelectorAll('[data-node]');const first=cards[0].dataset.node,last=cards[1].dataset.node;
  s.d.querySelector('[data-out="'+first+'"]').click();s.d.querySelector('[data-in="'+last+'"]').click();
  assert.equal(s.d.querySelectorAll('.wfEdgeLine').length,1);
  s.d.querySelector('[data-out="'+last+'"]').click();s.d.querySelector('[data-in="'+first+'"]').click();
  assert.equal(s.d.querySelectorAll('.wfEdgeLine').length,1);assert.match(s.d.querySelector('#wfNotice').textContent,/循环/);
  s.d.querySelector('[data-act=run]').click();await tick();await tick();
  const call=s.calls.find(([u,o])=>u.endsWith('/workflows/runs')&&o.method==='POST');const body=JSON.parse(call[1].body);
  assert.equal(body.graph.nodes.length,2);assert.equal(body.graph.edges.length,1);assert.match(s.d.querySelector('#wfNotice').textContent,/完成/);
 }finally{s.w.close();}
});
test('AI builds an editable graph and failed rebuilding keeps the previous graph',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open();s.d.querySelector('#wfBuildInput').value='读取我的自选股并汇总';s.d.querySelector('#wfBuildForm').requestSubmit();await tick();
  assert.equal(s.d.querySelectorAll('[data-node]').length,2);assert.equal(s.d.querySelector('#wfTitle').value,'AI 流程');
  s.error();s.d.querySelector('#wfBuildInput').value='修改当前流程';s.d.querySelector('#wfBuildForm').requestSubmit();await tick();
  assert.equal(s.d.querySelectorAll('[data-node]').length,2);assert.match(s.d.querySelector('#wfNotice').textContent,/无效流程/);
  assert.equal(s.d.querySelector('[data-act=repair]').hidden,false);
  s.d.querySelector('[data-act=repair]').click();await tick();
  const request=JSON.parse(s.calls.filter(([url])=>url.endsWith('/workflows/build')).at(-1)[1].body);
  assert.match(request.message,/先前错误：模型返回了无效流程/);
  assert.equal(request.graph.nodes.length,2);
 }finally{s.w.close();}
});
test('workflow reuses every schedule field and graph survives save and reopen',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph,title:'保存测试',enabled:false});
  s.d.querySelector('[data-act=schedule]').click();assert(s.d.querySelector('#dayDialog').open);
  const form=s.d.querySelector('#dayForm');form.elements.time.value='14:30';form.elements.newChat.checked=false;
  form.requestSubmit();await tick();assert.equal(s.saved(),null);
  s.d.querySelector('[data-act=save]').click();await tick();const saved=s.saved();
  assert(saved);assert.equal(saved.taskMode,'workflow');assert.equal(saved.time,'14:30');assert.equal(saved.newChat,false);
  assert.equal(saved.workflow.nodes.length,2);
  s.d.querySelector('[data-act=close]').click();await s.w.MentoraWorkflow.open(saved);
  assert.equal(s.d.querySelectorAll('[data-node]').length,2);assert.equal(s.d.querySelector('#wfTitle').value,'保存测试');
 }finally{s.w.close();}
});

test('node instructions and JSON persist on input before a run; invalid JSON blocks execution',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open();
  s.d.querySelector('[data-add=start]').click();
  const params=s.d.querySelector('[data-json]');params.value='{';params.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  s.d.querySelector('[data-act=run]').click();await tick();
  assert.equal(s.calls.filter(([u,o])=>u.endsWith('/workflows/runs')&&o.method==='POST').length,0);
  params.value='{"greeting":"你好"}';params.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  s.d.querySelector('[data-add=model]').click();
  const instruction=s.d.querySelector('[data-field=instruction]');instruction.value='只回复收到';
  instruction.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  s.d.querySelector('[data-act=run]').click();await tick();
  const body=JSON.parse(s.calls.find(([u,o])=>u.endsWith('/workflows/runs')&&o.method==='POST')[1].body);
  assert.equal(body.graph.nodes[0].arguments.greeting,'你好');assert.equal(body.graph.nodes[1].instruction,'只回复收到');
 }finally{s.w.close();}
});

test('unsaved workflow closes through a nonblocking confirmation and cancel retains edits',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open();s.d.querySelector('[data-add=start]').click();
  s.d.querySelector('[data-act=close]').click();assert(s.d.querySelector('.wfDiscard').open);
  s.d.querySelector('[data-discard=cancel]').click();assert(s.d.querySelector('.wfCanvas').open);assert.equal(s.d.querySelectorAll('[data-node]').length,1);
  s.d.querySelector('[data-act=close]').click();s.d.querySelector('[data-discard=close]').click();assert(!s.d.querySelector('.wfCanvas').open);
 }finally{s.w.close();}
});

test('workflow composer matches Widget keyboard, ready, multiline and stop states',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open();const input=s.d.querySelector('#wfBuildInput'),send=s.d.querySelector('.wfBuildSend');
  assert(send.disabled);input.value='构建输入到输出';input.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert(!send.disabled);assert(send.classList.contains('is-ready'));
  const shift=new s.w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});input.dispatchEvent(shift);assert(!shift.defaultPrevented);assert(!s.calls.some(([u])=>u.endsWith('/workflows/build')));
  input.value='第一行\n第二行';input.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert(input.closest('.composerBox').classList.contains('is-multiline'));
  input.dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();
  assert.equal(s.calls.filter(([u])=>u.endsWith('/workflows/build')).length,1);assert.equal(input.value,'');assert(!input.closest('.composerBox').classList.contains('is-multiline'));assert(s.d.querySelector('.wfBuildStop').hidden);
  s.d.querySelector('[data-act=schedule]').click();assert(s.d.querySelector('#dayAgentLabel').hidden);
 }finally{s.w.close();}
});
test('stopping a build preserves the original workflow',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph});
  const original=s.w.fetch;s.w.fetch=(url,options)=>url.endsWith('/workflows/build')?new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new s.w.DOMException('Stopped','AbortError')))):original(url,options);
  const input=s.d.querySelector('#wfBuildInput');input.value='修改工作流';input.dispatchEvent(new s.w.Event('input',{bubbles:true}));s.d.querySelector('#wfBuildForm').requestSubmit();await tick();
  assert(!s.d.querySelector('.wfBuildStop').hidden);assert(s.d.querySelector('.wfBuildSend').hidden);assert(s.d.querySelector('.wfBuildStop .wfExecutionRing'));assert(s.d.querySelector('.wfBuildStop .wfExecutionStop'));assert(s.d.querySelector('#wfNotice').classList.contains('is-thinking'));
  s.d.querySelector('[data-act=build-stop]').click();await tick();assert.equal(s.d.querySelectorAll('[data-node]').length,2);assert.match(s.d.querySelector('#wfNotice').textContent,/已停止/);
 }finally{s.w.close();}
});

test('canvas pans in both directions from edge paths and drag does not move nodes',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph});
  const vp=s.d.querySelector('#wfViewport'),world=s.d.querySelector('#wfWorld'),node=s.d.querySelector('[data-node]'),initialLeft=node.style.left;
  const pos=()=>world.style.transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/).slice(1).map(Number);
  const initial=pos();const fire=(target,type,x,y,extra={})=>target.dispatchEvent(new s.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y,...extra}));
  fire(s.d.querySelector('.wfEdgeLine'),'pointerdown',100,100);fire(vp,'pointermove',170,140);fire(vp,'pointerup',170,140);
  assert.equal(pos()[0],initial[0]+70);assert.equal(pos()[1],initial[1]+40);assert.equal(node.style.left,initialLeft);
  fire(vp,'pointerdown',100,100);fire(vp,'pointermove',-900,-900);fire(vp,'pointerup',-900,-900);
  assert.equal(pos()[0],initial[0]-930);assert.equal(pos()[1],initial[1]-960);
  const before=pos();fire(s.d.querySelector('.wfNode p'),'pointerdown',100,100);fire(vp,'pointermove',130,140);fire(vp,'pointerup',130,140);
  assert.deepEqual(pos(),before);assert.notEqual(s.d.querySelector('[data-node]').style.left,initialLeft);
  vp.dispatchEvent(new s.w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:30,deltaY:-40}));
  assert.equal(pos()[0],before[0]-30);assert.equal(pos()[1],before[1]+40);
 }finally{s.w.close();}
});

test('failed validation offers a repair that rebuilds without running the workflow',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph});
  const original=s.w.fetch;let rejected=true;
  s.w.fetch=async(url,options)=>url.endsWith('/workflows/runs')&&rejected?{ok:false,json:async()=>({detail:'节点「历史行情」参数不匹配：缺少 operation'})}:original(url,options);
  s.d.querySelector('[data-act=run]').click();await tick();
  assert(!s.d.querySelector('[data-act=repair]').hidden);
  s.d.querySelector('[data-act=repair]').click();await tick();
  const build=s.calls.find(([u])=>u.endsWith('/workflows/build'));assert(build);
  const payload=JSON.parse(build[1].body);assert.match(payload.message,/缺少 operation/);assert.equal(payload.graph.nodes.length,2);
  assert(s.d.querySelector('[data-act=repair]').hidden);
  assert.equal(s.calls.filter(([u])=>u.endsWith('/workflows/runs')).length,0);
 }finally{s.w.close();}
});
test('tool inspector preserves foreach and item references in the trial snapshot',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open();s.d.querySelector('[data-add=tool]').click();
  const foreach=s.d.querySelector('[data-field=foreach]');assert(foreach);
  foreach.value='{{watch}}';foreach.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  const args=s.d.querySelector('[data-json]');args.value='{"symbol":"{{item.symbol}}"}';args.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  s.d.querySelector('[data-act=run]').click();await tick();
  const payload=JSON.parse(s.calls.find(([u,o])=>u.endsWith('/workflows/runs')&&o.method==='POST')[1].body);
  assert.equal(payload.graph.nodes[0].foreach,'{{watch}}');assert.equal(payload.graph.nodes[0].arguments.symbol,'{{item.symbol}}');
 }finally{s.w.close();}
});

test('partial nodes stay visibly partial and preserve the read-only error policy',async()=>{
 const s=await setup();try{
  const instruction='长节点描述，需要严格限制为两行，完整说明保留在节点详情中。'.repeat(12);
  const workflow={version:1,nodes:[{id:'data',kind:'tool',title:'行情',tool:'portfolio-data',instruction,foreach:'{{watch}}',onItemError:'continue',arguments:{operation:'history',symbol:'{{item.symbol}}'}}],edges:[]};
  await s.w.MentoraWorkflow.open({workflow,lastTrial:{nodes:{data:{status:'partial',output:{items:[{symbol:'TLT'}],errors:[{symbol:'0700.HK',error:'未支持港股'}]}}}}});
  const card=s.d.querySelector('[data-node=data]');assert(card.classList.contains('is-partial'));
  assert.equal(card.querySelector('.wfNodeState').textContent,'部分完成');
  assert.equal(card.querySelector('p').title,instruction);assert.equal(card.querySelector('p').textContent,instruction);
  card.click();const policy=s.d.querySelector('[data-field=onItemError]');assert.equal(policy.value,'continue');
  policy.value='stop';policy.dispatchEvent(new s.w.Event('change',{bubbles:true}));
  s.d.querySelector('[data-act=run]').click();await tick();
  const request=JSON.parse(s.calls.find(([u,o])=>u.endsWith('/workflows/runs')&&o.method==='POST')[1].body);
  assert.equal(request.graph.nodes[0].onItemError,'stop');
 }finally{s.w.close();}
});

test('zoom resizes node layout and vector connections while the background stays fixed',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph});
  const world=s.d.querySelector('#wfWorld'),viewport=s.d.querySelector('#wfViewport');
  const before=s.d.querySelector('.wfEdgeLine').getAttribute('d');
  s.d.querySelector('[data-act=zoom-in]').click();
  const scale=Number(world.style.getPropertyValue('--wf-node-scale'));
  assert(scale>0);assert(!world.style.transform.includes('scale'));
  assert.equal(viewport.style.backgroundSize,'22px 22px');
  assert.equal(parseFloat(s.d.querySelector('[data-node=input]').style.left),90*scale);
  assert.notEqual(s.d.querySelector('.wfEdgeLine').getAttribute('d'),before);
  const css=readFileSync(new URL('../app/static/workflows.css',import.meta.url),'utf8');
  assert.match(css,/font-size:calc\(13px \* var\(--wf-node-scale\)\)/);
 }finally{s.w.close();}
});
test('saved trading nodes migrate to execution and observation actions when reopened',async()=>{
 const s=await setup();try{
  const old={version:1,nodes:[{id:'trade',kind:'tool',tool:'portfolio-order',title:'执行模拟交易',x:90,y:140},{id:'out',kind:'output',title:'输出回测决策与交易报告',x:440,y:140}],edges:[{source:'trade',target:'out',when:'always'}]};
  await s.w.MentoraWorkflow.open({workflow:old});
  assert.equal(s.d.querySelector('[data-node=trade] strong').textContent,'执行交易');
  assert.equal(s.d.querySelector('[data-node=out] strong').textContent,'更新观察列表');
  assert(s.d.querySelector('[data-add=watchlist_update]'));
  s.d.querySelector('[data-act=save]').click();await tick();
  assert.equal(s.saved().workflow.nodes[1].kind,'watchlist_update');
  assert.equal(old.nodes[1].kind,'output');
 }finally{s.w.close();}
});
