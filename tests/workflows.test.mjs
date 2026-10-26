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
async function setup(extraTools=[]){
 const dom=new JSDOM(html,{url:'https://example.com/mentora/?tab=tasks',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];let saved=null,buildError=false;
 const timers=[];w.matchMedia=()=>({matches:false,addEventListener(){}});w.setInterval=fn=>{timers.push(fn);return timers.length;};w.structuredClone=structuredClone;w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.fetch=async(url,options={})=>{
  calls.push([url,options]);const body=options.body?JSON.parse(options.body):{};
  if(url.includes('/workflows/catalog'))return{ok:true,json:async()=>({kinds,tools:[{id:'search',label:'搜索',description:'工具',group:'Agent 工具'},...extraTools],model:'deepseek-flash'})};
  if(url.endsWith('/workflows/build'))return{ok:!buildError,json:async()=>buildError?{detail:'模型返回了无效流程'}:{title:'AI 流程',graph}};
  if(url.endsWith('/workflows/runs')&&options.method==='POST')return{ok:true,json:async()=>({id:'trial',status:'queued'})};
  if(url.endsWith('/workflows/runs/trial'))return{ok:true,json:async()=>({id:'trial',status:'success',nodes:Object.fromEntries(body.graph?.nodes?.map(n=>[n.id,{status:'success'}])||[]),result:{interpretation:'真实结果'}})};
  if(url.endsWith('/api/day/tasks')&&options.method==='POST'){saved={...body,id:'saved-wf',nextAt:'2026-11-01T06:30:00Z'};return{ok:true,json:async()=>saved};}
  return{ok:true,json:async()=>({tasks:saved?[saved]:[],sceneTasks:[],markets:[],serverTime:new Date().toISOString()})};
 };
 w.eval(day);w.eval(code);await tick();
 return{dom,w,d:w.document,calls,error:()=>{buildError=true;},saved:()=>saved,tickTimers:()=>timers.filter(fn=>fn.name==='refreshTimings').forEach(fn=>fn())};
}
test('news count is optional, validates positive integers and round-trips with JSON and saved task',async()=>{
 const s=await setup([{id:'internal-search',label:'资讯搜索',description:'直接获取新闻',defaultArguments:{source:'homepage'}}]);try{
  await s.w.MentoraWorkflow.open({workflow:graph});s.d.querySelector('[data-add=tool][data-tool=internal-search]').click();
  const id=s.d.querySelector('.wfNode.is-selected').dataset.node,limit=s.d.querySelector('[data-news-limit]'),json=s.d.querySelector('[data-json]');
  assert.equal(limit.value,'');assert.equal(JSON.parse(json.value).limit,undefined);
  limit.value='25';limit.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert.equal(JSON.parse(json.value).limit,25);
  limit.value='0';limit.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert.equal(limit.checkValidity(),false);
  s.d.querySelector('[data-act=save]').click();await tick();assert.equal(s.saved(),null);
  limit.value='40';limit.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert.equal(limit.checkValidity(),true);assert.equal(json.checkValidity(),true);
  json.value='{"source":"homepage","limit":75,"workers":2}';json.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert.equal(limit.value,'75');
  limit.value='';limit.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert.deepEqual(JSON.parse(json.value),{source:'homepage',workers:2});
  limit.value='30';limit.dispatchEvent(new s.w.Event('input',{bubbles:true}));s.d.querySelector('[data-act=save]').click();await tick();
  assert.equal(s.saved().workflow.nodes.find(n=>n.id===id).arguments.limit,30);
  s.d.querySelector('.wfCanvas').close();await s.w.MentoraWorkflow.open(s.saved());s.d.querySelector('[data-node="'+id+'"]').click();assert.equal(s.d.querySelector('[data-news-limit]').value,'30');
  assert(!s.calls.some(([url])=>url.endsWith('/workflows/runs')));
 }finally{s.w.close();}
});

test('node panel highlights JSON safely, copies full output and renames through more menu',async()=>{
 const s=await setup();try{
  const output={items:[{title:'<img src=x onerror=alert(1)>',score:3,ok:true,missing:null}],interpretation:'真实结果'};let copied='';
  Object.defineProperty(s.w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  await s.w.MentoraWorkflow.open({workflow:graph,lastTrial:{id:'source',status:'success',nodes:{input:{status:'success',output}}}});
  s.d.querySelector('[data-node=input]').click();
  assert.equal(s.d.querySelector('[data-field=title]').value,'输入');assert(s.d.querySelector('[data-act=node-run]'));
  assert(s.d.querySelector('#wfRunResult .wfJSON-key'));assert(s.d.querySelector('#wfRunResult .wfJSON-string'));assert(s.d.querySelector('#wfRunResult .wfJSON-number'));assert(s.d.querySelector('#wfRunResult .wfJSON-boolean'));
  assert.equal(s.d.querySelector('#wfRunResult img'),null);assert.deepEqual(JSON.parse(s.d.querySelector('#wfRunResult pre').textContent),output);
  s.d.querySelector('[data-act=copy-output]').click();await tick();assert.equal(copied,JSON.stringify(output,null,2));
  s.d.querySelector('[data-act=node-more]').click();assert.equal(s.d.querySelector('#wfNodeMenu').hidden,false);
  s.d.querySelector('[data-act=node-rename]').click();const title=s.d.querySelector('[data-field=title]');assert.equal(title.readOnly,false);
  title.value='新的输入';title.dispatchEvent(new s.w.Event('input',{bubbles:true}));title.blur();assert.equal(title.readOnly,true);assert.match(s.d.querySelector('[data-node=input]').textContent,/新的输入/);
  s.d.querySelector('[data-act=inspector]').click();assert(!s.d.querySelector('.wfCanvas').classList.contains('wfHasInspector'));assert(s.d.querySelector('.wfCanvas').open);
 }finally{s.w.close();}
});

test('node run sends an explicit isolated preview request, never a full-graph execution',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph,lastTrial:{id:'previous',status:'success',nodes:{input:{status:'success',output:{score:3}}}}});
  s.d.querySelector('[data-node=out]').click();s.d.querySelector('[data-act=node-run]').click();await tick();
  const requests=s.calls.filter(([url,o])=>url.endsWith('/workflows/runs')&&o.method==='POST');assert.equal(requests.length,1);
  const body=JSON.parse(requests[0][1].body);assert.equal(body.nodeId,'out');assert.equal(body.sourceRunId,'previous');assert.equal(body.executionMode,'preview');
 }finally{s.w.close();}
});

test('runtime ticks locally while completed durations stay frozen and progress stays hidden',async()=>{
 const s=await setup();try{
  const now=Date.parse('2026-10-26T05:00:00Z');let clock=now;s.w.Date.now=()=>clock;
  await s.w.MentoraWorkflow.open({workflow:graph,lastTrial:{status:'running',createdAt:new Date(now-65000).toISOString(),serverTime:new Date(now).toISOString(),nodes:{input:{status:'success',started:new Date(now-65000).toISOString(),durationMs:5000},out:{status:'running',started:new Date(now-10000).toISOString(),progress:'正在进行 JEV 决策'}}}});
  assert.equal(s.d.querySelector('#wfElapsed').textContent,'运行时间 01:05');
  assert.equal(s.d.querySelector('[data-node=input] .wfNodeTime').textContent,'耗时 00:05');
  assert.equal(s.d.querySelector('[data-node=out] .wfNodeTime').textContent,'耗时 00:10');
  assert(s.d.querySelector('[data-node=out] header .wfNodeTime'));
  assert.doesNotMatch(s.d.querySelector('[data-node=out] header').textContent,/运行中|✓/);
  assert.equal(s.d.querySelector('[data-node=out] .wfNodeRuntime .wfNodeTime'),null);
  assert.equal(s.d.querySelector('.wfNodeProgress'),null);
  assert.doesNotMatch(s.d.querySelector('[data-node=out]').textContent,/正在进行 JEV 决策/);
  assert.equal(s.d.querySelector('[data-node=out] .wfNodeTime').title,'');
  const card=s.d.querySelector('[data-node=out]');clock+=3000;s.tickTimers();
  assert.equal(s.d.querySelector('#wfElapsed').textContent,'运行时间 01:08');
  assert.equal(card.querySelector('.wfNodeTime').textContent,'耗时 00:13');
  assert.equal(s.d.querySelector('[data-node=input] .wfNodeTime').textContent,'耗时 00:05');
  assert.equal(s.d.querySelector('[data-node=out]'),card);
 }finally{s.w.close();}
});
test('interrupted trials show incomplete timing, and terminal totals do not keep increasing',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph,lastTrial:{status:'failed',createdAt:'2026-10-26T04:16:00Z',finishedAt:'2026-10-26T05:00:00Z',nodes:{out:{status:'failed',timingIncomplete:true}}}});
  assert.equal(s.d.querySelector('#wfElapsed').textContent,'已中断 · 耗时记录不完整');
  assert.equal(s.d.querySelector('[data-node=out] .wfNodeTime').textContent,'—');
  assert.equal(s.d.querySelector('[data-node=out] .wfNodeTime').title,'耗时记录不完整');
  s.d.querySelector('.wfCanvas').close();
  await s.w.MentoraWorkflow.open({workflow:graph,lastTrial:{status:'success',createdAt:'2026-10-26T04:16:00Z',finishedAt:'2026-10-26T04:17:02Z',nodes:{}}});
  assert.equal(s.d.querySelector('#wfElapsed').textContent,'总耗时 01:02');
  s.tickTimers();assert.equal(s.d.querySelector('#wfElapsed').textContent,'总耗时 01:02');
 }finally{s.w.close();}
});
test('new task chooser preserves Agent editor and opens full-screen workflow canvas',async()=>{
 const s=await setup();try{
  s.d.querySelector('#taskSidebarNew').click();assert(s.d.querySelector('.wfChooser').open);
  s.d.querySelector('[data-choice=agent]').click();assert(s.d.querySelector('#dayDialog').open);
  s.d.querySelector('#dayDialog').close();s.d.querySelector('#taskSidebarNew').click();s.d.querySelector('[data-choice=workflow]').click();await tick();
  assert(s.d.querySelector('.wfCanvas').open);assert.equal(s.d.querySelector('#wfAgent'),null);assert(s.d.querySelector('.wfCanvas svg'));assert(s.d.querySelector('[data-add=watchlist]'));assert(s.d.querySelector('[data-add=profile]'));assert(s.d.querySelector('[data-add=tool]'));
 }finally{s.w.close();}
});

test('text opportunity node can be added, connected, edited as text or JSON and saved without executing',async()=>{
 const s=await setup([{id:'text-opportunities',label:'文本机会提取',description:'本地 JEV 机会筛选',instructions:'给定文本或上游引用，输出 items 候选，不下单',group:'数据与搜索',defaultArguments:{text:''},schema:{type:'object',required:['text']}}]);try{
  await s.w.MentoraWorkflow.open({workflow:graph});s.d.querySelector('[data-add=tool][data-tool=text-opportunities]').click();
  const id=s.d.querySelector('.wfNode.is-selected').dataset.node,text=s.d.querySelector('[data-field=opportunityText]');assert(text);
  text.value='测试材料 AAPL';text.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  assert.equal(JSON.parse(s.d.querySelector('[data-json]').value).text,'测试材料 AAPL');
  const json=s.d.querySelector('[data-json]');json.value=JSON.stringify({text:'{{input.question}}',minimumConfidence:.7});json.dispatchEvent(new s.w.Event('input',{bubbles:true}));assert.equal(text.value,'{{input.question}}');
  s.d.querySelector('[data-out=input]').click();s.d.querySelector('[data-in="'+id+'"]').click();
  s.d.querySelector('[data-act=save]').click();await tick();const node=s.saved().workflow.nodes.find(n=>n.id===id);
  assert.equal(node.tool,'text-opportunities');assert.equal(node.arguments.text,'{{input.question}}');assert.equal(node.arguments.minimumConfidence,.7);
  assert(s.saved().workflow.edges.some(e=>e.source==='input'&&e.target===id));assert(!s.calls.some(([url])=>url.endsWith('/workflows/runs')));
 }finally{s.w.close();}
});

test('workflow delivery drafts survive reopening settings and saved secrets remain masked',async()=>{
 const s=await setup();try{
  const original=s.w.fetch;s.w.fetch=async(url,options={})=>{const response=await original(url,options);if(url.endsWith('/api/day/tasks')&&options.method==='POST'){const data=await response.json();return{...response,json:async()=>{const value={...data,feishuUrlConfigured:!!data.feishuUrl};delete value.feishuUrl;return value;}};}return response;};
  await s.w.MentoraWorkflow.open({workflow:graph});s.d.querySelector('[data-act=schedule]').click();
  const f=s.d.querySelector('#dayForm');f.elements.feishu.checked=true;f.elements.feishuUrl.value='https://open.feishu.cn/open-apis/bot/v2/hook/test-workflow';
  f.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  s.d.querySelector('[data-act=schedule]').click();assert.equal(f.elements.feishu.checked,true);assert.equal(f.elements.feishuUrl.value,'');assert.equal(f.elements.feishuUrl.placeholder,'已保存，留空保持不变');
  f.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await tick();s.d.querySelector('[data-act=save]').click();await tick();
  assert.equal(s.saved().feishu,true);
  s.d.querySelector('[data-act=schedule]').click();assert.equal(f.elements.feishu.checked,true);assert.equal(f.elements.feishuUrl.value,'');assert.equal(f.elements.feishuUrl.placeholder,'已保存，留空保持不变');
 }finally{s.w.close();}
});

test('top backdrop closes like X and preserves the unsaved-change guard',async()=>{
 const s=await setup();try{
  const clickBackdrop=()=>{const c=s.d.querySelector('.wfCanvas');c.dispatchEvent(new s.w.MouseEvent('pointerdown',{clientX:120,clientY:20,bubbles:true}));c.dispatchEvent(new s.w.MouseEvent('click',{clientX:120,clientY:20,bubbles:true}));};
  await s.w.MentoraWorkflow.open({title:'已保存',workflow:graph});clickBackdrop();assert.equal(s.d.querySelector('.wfCanvas').open,false);
  await s.w.MentoraWorkflow.open({title:'已保存',workflow:graph});
  s.d.querySelector('#wfTitle').value='未保存';s.d.querySelector('#wfTitle').dispatchEvent(new s.w.Event('input',{bubbles:true}));
  clickBackdrop();assert.equal(s.d.querySelector('.wfCanvas').open,true);assert.equal(s.d.querySelector('.wfDiscard').open,true);
  s.d.querySelector('[data-discard=cancel]').click();assert.equal(s.d.querySelector('.wfCanvas').open,true);
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
  assert.equal(body.executionMode,'execute');
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
  assert.equal(form.elements.enabled.closest('label').textContent,'启用定时任务');
  form.requestSubmit();await tick();const saved=s.saved();
  assert(saved);assert.equal(saved.taskMode,'workflow');assert.equal(saved.time,'14:30');assert.equal(saved.newChat,false);assert.equal(saved.enabled,false);
  assert.equal(saved.workflow.nodes.length,2);
  s.d.querySelector('[data-act=close]').click();await s.w.MentoraWorkflow.open(saved);
  assert.equal(s.d.querySelectorAll('[data-node]').length,2);assert.equal(s.d.querySelector('#wfTitle').value,'保存测试');
 }finally{s.w.close();}
});

test('schedule save failure stays open, retains interval and toggle, and retries without executing',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph});
  const original=s.w.fetch;let fail=true;
  s.w.fetch=async(url,options={})=>url.endsWith('/api/day/tasks')&&options.method==='POST'&&fail?{ok:false,json:async()=>({detail:'测试保存失败'})}:original(url,options);
  s.d.querySelector('[data-act=schedule]').click();const f=s.d.querySelector('#dayForm');
  f.elements.enabled.checked=false;f.elements.frequency.value='interval';f.elements.frequency.dispatchEvent(new s.w.Event('change',{bubbles:true}));
  f.elements.windowStart.value='09:30';f.elements.windowEnd.value='22:30';f.elements.windowIntervalUnit.value='hours';f.elements.windowIntervalUnit.dispatchEvent(new s.w.Event('change',{bubbles:true}));f.elements.windowIntervalAmount.value='1';
  f.requestSubmit();await tick();assert(s.d.querySelector('#dayDialog').open);assert.match(s.d.querySelector('#dayDialogMessage').textContent,/测试保存失败/);assert.equal(f.elements.enabled.checked,false);
  fail=false;f.requestSubmit();await tick();assert.equal(s.d.querySelector('#dayDialog').open,false);assert.equal(s.saved().intervalMinutes,60);assert.equal(s.saved().windowEnd,'22:30');assert.equal(s.saved().enabled,false);
  assert.equal(s.calls.filter(([u,o])=>u.endsWith('/workflows/runs')&&o.method==='POST').length,0);
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
  assert.equal(card.querySelector('.wfNodeState').textContent,'');
  assert.equal(card.querySelector('p').title,instruction);assert.equal(card.querySelector('p').textContent,instruction);
  card.click();const policy=s.d.querySelector('[data-field=onItemError]');assert.equal(policy.value,'continue');
  policy.value='stop';policy.dispatchEvent(new s.w.Event('change',{bubbles:true}));
  s.d.querySelector('[data-act=run]').click();await tick();
  const request=JSON.parse(s.calls.find(([u,o])=>u.endsWith('/workflows/runs')&&o.method==='POST')[1].body);
  assert.equal(request.graph.nodes[0].onItemError,'stop');
 }finally{s.w.close();}
});

test('only active upstream-to-running-node edges animate and terminal records never animate',async()=>{
 for(const status of ['running','stopping','success','failed','cancelled']){
  const s=await setup();try{
   await s.w.MentoraWorkflow.open({workflow:graph,lastTrial:{status,nodes:{input:{status:'partial'},out:{status:'running'}}}});
   assert.equal(s.d.querySelectorAll('.wfEdgeFlow').length,['running','stopping'].includes(status)?1:0);
   if(['running','stopping'].includes(status)){
    const edge=s.d.querySelector('.is-flowing');assert.equal(edge.dataset.edgeSource,'input');assert.equal(edge.dataset.edgeTarget,'out');
   }
  }finally{s.w.close();}
 }
});

test('flow respects a condition result instead of animating both branches',async()=>{
 const s=await setup();try{
  const branching={version:1,nodes:[{id:'gate',kind:'condition',title:'判断',x:90,y:140},{id:'yes',kind:'output',title:'是',x:440,y:140},{id:'no',kind:'output',title:'否',x:440,y:330}],edges:[{source:'gate',target:'yes',when:'true'},{source:'gate',target:'no',when:'false'}]};
  await s.w.MentoraWorkflow.open({workflow:branching,lastTrial:{status:'running',nodes:{gate:{status:'success',output:{value:true}},yes:{status:'running'},no:{status:'running'}}}});
  assert.equal(s.d.querySelectorAll('.wfEdgeFlow').length,1);
  assert.equal(s.d.querySelector('.is-flowing').dataset.edgeTarget,'yes');
 }finally{s.w.close();}
});

test('saved scheduled progress is refreshed and stops edge motion when the run finishes',async()=>{
 const s=await setup();try{
  const fetch=s.w.fetch;let done=false;
  s.w.fetch=async(url,options)=>url.endsWith('/workflows/tasks/saved/latest')?{ok:true,json:async()=>({id:'scheduled-run',status:done?'success':'running',nodes:{input:{status:'success'},out:{status:done?'success':'running'}}})}:fetch(url,options);
  await s.w.MentoraWorkflow.open({id:'saved',workflow:graph});
  assert.equal(s.d.querySelectorAll('.wfEdgeFlow').length,1);
  done=true;await new Promise(r=>setTimeout(r,1500));
  assert.equal(s.d.querySelectorAll('.wfEdgeFlow').length,0);
  assert.equal(s.d.querySelector('[data-node=out] .wfNodeState').textContent,'');
 }finally{s.w.close();}
});

test('zoom resizes node layout and vector connections while the background stays fixed',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph});
  const world=s.d.querySelector('#wfWorld'),viewport=s.d.querySelector('#wfViewport');
  const before=s.d.querySelector('.wfEdgeLine').getAttribute('d');
  s.d.querySelector('[data-act=zoom-in]').click();
  const scale=Number(world.style.getPropertyValue('--wf-node-scale'));
  const marker=s.d.querySelector('#wfArrow');
  assert.equal(marker.getAttribute('markerUnits'),'userSpaceOnUse');
  assert.equal(Number(marker.getAttribute('markerWidth')),12*scale);
  s.d.querySelector('[data-act=zoom-out]').click();
  assert(Number(s.d.querySelector('#wfArrow').getAttribute('markerWidth'))<12*scale);
  s.d.querySelector('[data-act=zoom-in]').click();
  assert(scale>0);assert(!world.style.transform.includes('scale'));
  assert.equal(viewport.style.backgroundSize,'22px 22px');
  assert.equal(parseFloat(s.d.querySelector('[data-node=input]').style.left),90*scale);
  assert.notEqual(s.d.querySelector('.wfEdgeLine').getAttribute('d'),before);
  const css=readFileSync(new URL('../app/static/workflows.css',import.meta.url),'utf8');
  assert.match(css,/font-size:calc\(13px \* var\(--wf-node-scale\)\)/);
 }finally{s.w.close();}
});
test('model hint is absent and animated edges hide the static line and marker',async()=>{
 const s=await setup();try{
  await s.w.MentoraWorkflow.open({workflow:graph,lastTrial:{status:'running',nodes:{input:{status:'success'},out:{status:'running'}}}});
  assert.equal(s.d.querySelector('#wfModelHint'),null);
  assert.doesNotMatch(s.d.querySelector('#wfBuildForm').textContent,/默认模型/);
  assert(s.d.querySelector('.wfEdge.is-flowing .wfEdgeFlow'));
  const css=readFileSync(new URL('../app/static/workflows.css',import.meta.url),'utf8');
  assert.match(css,/\.wfEdge\.is-flowing \.wfEdgeLine\{display:none\}/);
 }finally{s.w.close();}
});

test('workflow titles use available header width and node statuses stay horizontal',()=>{
 const css=readFileSync(new URL('../app/static/workflows.css',import.meta.url),'utf8');
 assert.match(css,/\.wfHeading\{flex:1;min-width:0;max-width:none\}/);
 assert.match(css,/\.wfNode header>span:nth-child\(2\)\{min-width:0;flex:1\}/);
 assert.match(css,/\.wfNodeState\{[^}]*flex:none[^}]*white-space:nowrap[^}]*word-break:keep-all[^}]*writing-mode:horizontal-tb/);
});
test('tool nodes display the actual catalogue name and fall back to their tool id',async()=>{
 const s=await setup();try{
  const nodes=[{id:'data',kind:'tool',tool:'search',title:'逐标的获取真实历史行情',x:90,y:140},{id:'unknown',kind:'tool',tool:'custom-data-reader',title:'读取数据',x:440,y:140}];
  await s.w.MentoraWorkflow.open({workflow:{version:1,nodes,edges:[]}});
  const label=s.d.querySelector('[data-node=data] header small');
  assert.equal(label.textContent,'搜索');assert.equal(label.title,'搜索');
  assert.equal(s.d.querySelector('[data-node=unknown] header small').textContent,'custom-data-reader');
  assert.equal(s.d.querySelector('[data-node=data] strong').textContent,'逐标的获取真实历史行情');
 }finally{s.w.close();}
});
test('saved trading nodes migrate to execution and observation actions when reopened',async()=>{
 const s=await setup();try{
  const old={version:1,nodes:[{id:'trade',kind:'tool',tool:'portfolio-order',title:'执行模拟交易',instruction:'读取模拟账户并提交模拟订单',x:90,y:140},{id:'out',kind:'output',title:'输出回测决策与交易报告',x:440,y:140}],edges:[{source:'trade',target:'out',when:'always'}]};
  await s.w.MentoraWorkflow.open({workflow:old,lastTrial:{nodes:{trade:{status:'failed',error:'执行模拟交易失败：模拟账户缺少决策'}}}});
  assert.equal(s.d.querySelector('[data-node=trade] strong').textContent,'执行交易');
  assert.doesNotMatch(s.d.querySelector('[data-node=trade] p').textContent,/模拟/);
  s.d.querySelector('[data-node=trade]').click();
  assert.doesNotMatch(s.d.querySelector('#wfRunResult').textContent,/模拟/);
  assert.match(s.d.querySelector('#wfRunResult').textContent,/执行交易失败：交易账户缺少决策/);
  assert.equal(s.d.querySelector('[data-node=out] strong').textContent,'更新观察列表');
  assert(s.d.querySelector('[data-add=watchlist_update]'));
  s.d.querySelector('[data-act=save]').click();await tick();
  assert.equal(s.saved().workflow.nodes[1].kind,'watchlist_update');
  assert.equal(old.nodes[1].kind,'output');
 }finally{s.w.close();}
});
