import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const script=readFileSync(new URL('../app/static/widget-recommendations.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(){const dom=new JSDOM('<section><div class="widgetSuggestions"></div><textarea></textarea></section>',{url:'https://example.com/mentora/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,timers=[],calls=[];w.setInterval=fn=>{timers.push(fn);return timers.length;};w.eval(script);const input=w.document.querySelector('textarea'),workspace=w.document.querySelector('section'),welcome=w.document.querySelector('.widgetSuggestions');return{dom,w,timers,calls,input,workspace,welcome};}
function context(symbol='NASDAQ:AAPL',interval='D'){return{board:{id:'b',title:'科技观察',cards:[{id:'c',title:symbol,component:'tv-advanced-chart',parameters:{symbols:[symbol],interval},w:12,h:18}]},selectedCardId:'c',history:[],visibleContent:''};}
test('completed home results are supplied with source times and welcome prompts retain their evidence-backed request',async()=>{
 const s=setup();s.w.fetch=async(url,options)=>{s.calls.push({url,options});if(url==='/api/day/tasks')return{ok:true,json:async()=>({tasks:[],sceneTasks:[{id:'task',title:'午后市场观察',successAt:'2026-10-16T05:00:00Z',resultVersion:'run',resultMarket:'CN'}]})};if(url.endsWith('/result'))return{ok:true,json:async()=>({question:'观察A股午后量能',answer:{interpretation:'指数反弹，但量能回落。'}})};return{ok:true,json:async()=>({suggestions:[{question:'午后反弹能获得量能支持吗？',prompt:'基于午后任务创建指数和量能对照看板',sourceTaskIds:['task']}]})};};
 const controller=new s.w.WidgetRecommendations({workspace:s.workspace,prompt:s.input,welcome:s.welcome,busy:()=>false}),ctx=context();ctx.board.cards=[];ctx.selectedCardId='';await controller.update(ctx);
 const payload=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/recommendations').options.body);assert.equal(payload.taskResults[0].interpretation,'指数反弹，但量能回落。');assert.equal(payload.taskResults[0].asOf,'2026-10-16T05:00:00Z');
 assert.equal(s.welcome.querySelector('button').dataset.widgetPrompt,'基于午后任务创建指数和量能对照看板');assert.match(s.welcome.querySelector('button').title,/午后市场观察/);assert.equal(s.input.placeholder,'输入看板需求');s.dom.window.close();
});
test('late card responses never overwrite a new selection and parameter changes invalidate recommendations',async()=>{
 const s=setup();let finish;const delayed=new Promise(r=>finish=r);
 s.w.fetch=async(url,options)=>{if(url==='/api/day/tasks')return{ok:true,json:async()=>({tasks:[],sceneTasks:[]})};const ctx=JSON.parse(options.body);s.calls.push(ctx);if(ctx.board.cards[0].parameters.symbols[0]==='NASDAQ:AAPL')await delayed;return{ok:true,json:async()=>({suggestions:[{question:ctx.board.cards[0].parameters.symbols[0]+' 可以看月线吗？',prompt:'切换月线',sourceTaskIds:[]}]})};};
 const controller=new s.w.WidgetRecommendations({workspace:s.workspace,prompt:s.input,welcome:s.welcome,busy:()=>false});const first=controller.update(context());await tick();await controller.update(context('NASDAQ:NVDA'));finish();await first;
 assert.match(s.input.placeholder,/NVDA/);assert.doesNotMatch(s.input.placeholder,/AAPL/);const count=s.calls.length;await controller.update(context('NASDAQ:NVDA'));assert.equal(s.calls.length,count);
 s.input.value='我的草稿';await controller.update(context('NASDAQ:NVDA','W'));assert.equal(s.calls.length,count+1);assert.equal(s.input.value,'我的草稿');s.dom.window.close();
});

test('local rotation and unchanged result refresh preserve recommendation nodes and their running animations',async()=>{
 const s=setup();let modelCalls=0;
 s.w.fetch=async(url)=>url==='/api/day/tasks'?{ok:true,json:async()=>({tasks:[],sceneTasks:[]})}:{ok:true,json:async()=>{modelCalls++;return{suggestions:[{question:'午后市场的反弹能持续吗？',prompt:'创建午后观察看板',sourceTaskIds:[]}]};}};
 const controller=new s.w.WidgetRecommendations({workspace:s.workspace,prompt:s.input,welcome:s.welcome,busy:()=>false}),ctx=context();ctx.board.cards=[];ctx.selectedCardId='';await controller.update(ctx);
 const button=s.welcome.firstElementChild;s.timers[0]();s.timers[0]();assert.equal(s.welcome.firstElementChild,button);
 await controller.update(ctx,true);assert.equal(s.welcome.firstElementChild,button);assert.equal(modelCalls,1);s.dom.window.close();
});

test('question replacement fades out before swapping and placeholder focus cancels a pending transition',async()=>{
 const s=setup(),animations=[];s.w.matchMedia=()=>({matches:false});
 s.w.HTMLElement.prototype.animate=function(frames,options){let finish;const finished=new Promise(r=>finish=r),animation={frames,options,finished,finish,cancel(){}};animations.push(animation);return animation;};
 const controller=new s.w.WidgetRecommendations({workspace:s.workspace,prompt:s.input,welcome:s.welcome,busy:()=>false});
 const old=s.w.document.createElement('button');old.textContent='旧问题';s.welcome.append(old);const next=s.w.document.createElement('button');next.textContent='新问题';
 controller.changeWelcome([next]);assert.equal(s.welcome.firstElementChild,old);assert.deepEqual(Array.from(animations[0].frames,f=>f.opacity),[1,0]);
 animations[0].finish();await tick();assert.equal(s.welcome.firstElementChild,next);assert.deepEqual(Array.from(animations[1].frames,f=>f.opacity),[0,1]);
 s.input.placeholder='旧提示';controller.changeHint('新提示');assert.equal(s.input.placeholder,'旧提示');assert.equal(s.input.classList.contains('is-hint-changing'),true);
 s.input.focus();assert.equal(s.input.classList.contains('is-hint-changing'),false);await new Promise(r=>setTimeout(r,210));assert.equal(s.input.placeholder,'旧提示');s.dom.window.close();
});

test('clicking an empty input sends the visible recommendation with its full context once',()=>{
 const s=setup(),form=s.w.document.createElement('form');s.workspace.append(form);form.append(s.input);let busy=false;const sent=[];
 form.addEventListener('submit',event=>{event.preventDefault();sent.push(s.input.value);busy=true;s.input.value='';});
 const controller=new s.w.WidgetRecommendations({workspace:s.workspace,prompt:s.input,welcome:s.welcome,busy:()=>busy});
 controller.items=[{question:'可以跟踪半导体链吗？',prompt:'根据台积电财报任务，创建半导体链行情列表。证据：任务结果。'},{question:'看看周线？',prompt:'切换为周线'}];
 controller.offset=1;s.input.placeholder=controller.items[0].question;
 s.input.click();s.input.click();assert.deepEqual(sent,[controller.items[0].prompt]);
 busy=false;s.input.value='我的草稿';s.input.click();assert.equal(sent.length,1);assert.equal(s.input.value,'我的草稿');
 s.input.value='';s.input.placeholder='输入看板需求';s.input.click();assert.equal(sent.length,1);
 s.input.placeholder=controller.items[1].question;s.input.disabled=true;s.input.dispatchEvent(new s.w.Event('click'));assert.equal(sent.length,1);s.dom.window.close();
});
