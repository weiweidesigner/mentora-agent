import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../app/static/workflows.js',import.meta.url),'utf8');
const day=readFileSync(new URL('../app/static/day-tasks.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,30));
const kinds=['start','watchlist','profile','model','condition','output'].map(id=>({id,label:id,description:id}));
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
  assert(s.d.querySelector('.wfCanvas').open);assert(s.d.querySelector('[data-add=watchlist]'));assert(s.d.querySelector('[data-add=profile]'));assert(s.d.querySelector('[data-add=tool]'));
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
