import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../app/static/index.html', import.meta.url), 'utf8');
const daySource = readFileSync(new URL('../app/static/day-tasks.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 25));

for (const width of [390, 760, 1280]) {
  test(`initial shell is correct before external scripts load at ${width}px`, () => {
    const dom = new JSDOM(html, {url:'https://example.com/veya/', runScripts:'dangerously', beforeParse(w) {
      w.matchMedia = query => ({matches:query.includes('min-width') ? width >= 761 : width <= 760});
    }});
    const shell = dom.window.document.querySelector('.shell');
    assert.equal(shell.classList.contains('sidebar-open'), width >= 761);
    assert.equal(shell.classList.contains('sidebar-collapsed'), width <= 760);
    dom.window.close();
  });
}

test('notification opens a read-only task conversation despite blocked storage and personal API failure', async () => {
  const dom = new JSDOM(html, {url:'https://example.com/veya/?dayShare=read-only-test-token',runScripts:'outside-only'});
  const w = dom.window, requests = [];
  Object.defineProperty(w, 'localStorage', {get() {throw new w.DOMException('storage disabled','SecurityError');}});
  w.setInterval = () => 0;
  w.matchMedia = () => ({matches:false});
  w.structuredClone = structuredClone;
  w.fetch = async url => {
    requests.push(url);
    if (url.endsWith('tasks')) return {ok:false,json:async()=>({detail:'personal API unavailable'})};
    return {ok:true,json:async()=>({taskId:'shared-task',runId:'shared-run',task:{id:'shared-task',title:'缓存分析',question:'原始问句',market:'CN',stage:'pre',cadence:'daily',time:'09:00',timeMode:'fixed',timezone:'market'},title:'缓存分析',question:'原始问句',cachedDate:'2026-10-15T04:00:00Z',answer:{interpretation:'保存的答案'}})};
  };
  w.eval(daySource);
  await tick();
  assert.equal(w.document.querySelector('#taskWorkspace').hidden,false);
  assert.match(w.document.querySelector('#taskThread').textContent,/原始问句/);
  assert.match(w.document.querySelector('#taskThread').textContent,/保存的答案/);
  assert.equal(w.document.querySelector('#taskRunNow').hidden,true);
  assert.equal(w.document.querySelectorAll('#taskThread .thinkingTrigger').length,0);
  assert.equal(requests[0], '/api/day/shared/read-only-test-token');
  assert.equal(w.location.search, '?dayShare=read-only-test-token');
  dom.window.close();
});

test('nginx canonical redirect preserves old notification parameters', () => {
  const nginx = readFileSync(new URL('../deploy/nginx-veya.conf',import.meta.url),'utf8');
  const canonical = readFileSync(new URL('../deploy/nginx-mentora.conf',import.meta.url),'utf8');
  assert.match(canonical,/location \/mentora\/ \{/);
  assert.match(nginx,/location = \/veya \{ return 302 \/mentora\/\$is_args\$args; \}/);
});

test('waiting task opens directly without a landing flash or run fetch and stays composer-free after polling', async () => {
  const dom=new JSDOM(html,{url:'https://example.com/mentora/?task=waiting-task',runScripts:'outside-only'});
  const w=dom.window,requests=[],timers=[];
  w.matchMedia=()=>({matches:false});w.setInterval=fn=>{timers.push(fn);return timers.length;};
  const task={id:'waiting-task',title:'开盘观察',question:'开盘前帮我看看市场',systemPreset:true,market:'CN',stage:'pre',assetType:'index',enabled:true,cadence:'trading',time:'09:00',timeMode:'fixed',timezone:'Asia/Shanghai',nextAt:'2026-10-16T01:00:00Z',lastRun:null,activeRun:null};
  let release;
  w.fetch=async url=>{requests.push(url);await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>({tasks:[],sceneTasks:[task],markets:[{id:'CN',zone:'Asia/Shanghai'}],serverTime:new Date().toISOString()})};};
  w.eval(daySource);
  assert.equal(w.document.querySelector('#taskLanding').hidden,true);
  assert.equal(w.document.querySelector('#taskWorkspace').dataset.taskView,'loading');
  release();await tick();
  assert.equal(w.document.querySelector('#taskWorkspace').dataset.taskView,'waiting',w.document.querySelector('#taskMessage').textContent);
  assert.equal(w.document.querySelector('#taskChatForm').hidden,true);
  assert.equal(w.document.querySelectorAll('#taskThread .message').length,0);
  assert.match(w.document.querySelector('#taskThread').textContent,/任务开启时间/);
  w.Date.now=()=>Date.now()+20000;timers.at(-1)();await tick();release();await tick();
  assert.equal(w.document.querySelector('#taskWorkspace').dataset.taskView,'waiting',w.document.querySelector('#taskMessage').textContent);
  assert.equal(w.document.querySelector('#taskChatForm').hidden,true);
  assert(requests.every(url=>url==='/api/day/tasks'));
  w.close();
});

test('editing a legacy relative task uses its next clock time and submits fixed time without a basis picker',async()=>{
 const dom=new JSDOM(html,{url:'https://example.com/mentora/?task=legacy-relative',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,calls=[];
 w.matchMedia=()=>({matches:false});w.setInterval=()=>0;w.structuredClone=structuredClone;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const task={id:'legacy-relative',title:'盘后观察',question:'复盘市场',market:'US',stage:'post',assetType:'index',symbols:'',enabled:true,cadence:'trading',time:'09:00',timeMode:'close',offset:15,timezone:'market',nextAt:'2026-11-27T18:15:00Z',lastRun:null,activeRun:null};
 w.fetch=async(url,options)=>{calls.push([url,options]);if(options?.method==='PUT')return{ok:true,json:async()=>({...task,...JSON.parse(options.body)})};return{ok:true,json:async()=>({tasks:[task],sceneTasks:[],markets:[],serverTime:new Date().toISOString()})};};
 w.eval(daySource);await tick();d.querySelector('#taskSettings').click();await tick();
 const form=d.querySelector('#dayForm');
 assert.equal(d.querySelector('#dayTimeModeLabel'),null);assert.equal(d.querySelector('#dayOffsetLabel'),null);
 assert.equal(form.elements.timeMode.type,'hidden');assert.equal(form.elements.timeMode.value,'fixed');
 assert.equal(form.elements.time.value,'13:15');assert.equal(form.elements.timezone.value,'America/New_York');
 form.requestSubmit();await tick();
 const saved=JSON.parse(calls.find(([,o])=>o?.method==='PUT')[1].body);
 assert.equal(saved.timeMode,'fixed');assert.equal(saved.offset,0);assert.equal(saved.time,'13:15');
 assert.equal(saved.timezone,'America/New_York');assert.equal(saved.cadence,'trading');w.close();
});
