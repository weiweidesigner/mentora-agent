import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const editorSource=readFileSync(new URL('../app/static/task-editor.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/day-tasks.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
const base={title:'我的盘中分析',market:'CN',stage:'live',assetType:'stocks',symbols:'',question:'分析市场',cadence:'daily',date:'',endDate:'',time:'12:00',timeMode:'fixed',offset:0,timezone:'market',enabled:true,newChat:true,browser:false,serverchan:false,feishu:false,wecom:false,weekdays:[0],monthDay:1,notifications:[],lastRun:{status:'success'},successAt:'2026-10-15T04:00:00Z',resultVersion:'run-new',summary:'## 核心结论\n\n**已保存的结果**',nextAt:'2026-10-16T04:00:00Z'};
function setup({mobile=false,tasks=[{...base,id:'live'}],url='https://example.com/veya/'}={}) {
 const dom=new JSDOM(html,{url,runScripts:'outside-only'}),w=dom.window,requests=[],saves=[];
 w.matchMedia=()=>({matches:mobile});w.setInterval=()=>0;w.structuredClone=structuredClone;w.requestAnimationFrame=f=>f();
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.setSidebarCollapsed=()=>{};w.closeActivityDrawer=()=>{};w.startNewChat=()=>w.dispatchEvent(new w.Event('veya:chat-navigate'));
 w.renderMixedReportFlow=async (_article,answer,container)=>{container.textContent=answer.interpretation;};
 w.fetch=async (path,options={})=>{
  requests.push({path,method:options.method||'GET'});let data;
  if(options.method==='POST'&&path.endsWith('/tasks')){data={...base,...JSON.parse(options.body),id:'created',resultVersion:null,lastRun:null,nextAt:'2026-11-05T10:30:00Z'};saves.push(JSON.parse(options.body));tasks.push(data);}
  else if(path.endsWith('/tasks'))data={tasks,markets:[{market:'CN',name:'A股',zone:'Asia/Shanghai',stage:'live',status:'交易中'}],serverTime:'2026-10-15T04:00:00Z',pushPublicKey:''};
  else if(path.endsWith('/runs'))data={runs:path.includes('created')?[]:[{id:'run-new',status:'success',created:'2026-10-15T04:00:00Z',finished:'2026-10-15T04:00:00Z',available:true},{id:'run-old',status:'success',created:'2026-10-14T04:00:00Z',finished:'2026-10-14T04:00:00Z',available:true}]};
  else if(path.includes('/runs/'))data={question:'本次原始问句',cachedDate:'2026-10-15T04:00:00Z',answer:{interpretation:path.endsWith('run-old')?'上一次缓存内容':'最新缓存内容'}};
  else data={};
  return {ok:true,json:async()=>data};
 };
 w.eval(editorSource);w.eval(source);return {dom,w,requests,saves};
}

test('My Day shows only generated results for the current market phase and links to that task',async()=>{
 const h=setup({tasks:[{...base,id:'live'},{...base,id:'pre',stage:'pre'},{...base,id:'pending',resultVersion:null},{...base,id:'us',market:'US'}]});await tick();
 const cards=h.w.document.querySelectorAll('#dayPanel [data-task-open]');assert.equal(cards.length,1);assert.equal(cards[0].dataset.taskOpen,'live');assert.doesNotMatch(cards[0].textContent,/\*\*|##/);
 assert.equal(h.w.document.querySelectorAll('#myDay [role=tab],#myDay [data-template]').length,0);
 cards[0].click();await tick();assert.equal(h.w.document.querySelector('#taskWorkspace').hidden,false);assert.equal(new URL(h.w.location).searchParams.get('task'),'live');
 assert.match(h.w.document.querySelector('#taskThread').textContent,/最新缓存内容/);assert.equal(h.w.document.querySelectorAll('#taskThread .thinkingTrigger').length,0);
 h.w.document.querySelector('#taskThread [data-edit-task]').click();assert.equal(h.w.document.querySelector('#dayDialog').open,true);assert.equal(h.w.document.querySelector('#dayForm input[name=title]').value,base.title);
 assert.equal(h.w.document.querySelectorAll('#dayAdvanced [name=model],#dayAdvanced [name=strength]').length,0);h.dom.window.close();
});

test('history selection loads the saved run without triggering analysis',async()=>{
 const h=setup({url:'https://example.com/veya/?tab=tasks&task=live'});await tick();
 const selector=h.w.document.querySelector('#taskRunSelect');assert.equal(selector.options.length,2);selector.value='run-old';selector.dispatchEvent(new h.w.Event('change'));await tick();
 assert.match(h.w.document.querySelector('#taskThread').textContent,/上一次缓存内容/);
 assert.equal(h.requests.some(r=>r.method==='POST'||r.path.includes('/chat')),false);h.dom.window.close();
});

test('mobile clarification confirms market, monthly date and time before creating one real task',async()=>{
 const h=setup({mobile:true,tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();d.querySelector('#taskPrompt').value='每月为我复盘港股 ETF';d.querySelector('#taskPromptForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));
 assert.equal(h.saves.length,0);assert.match(d.querySelector('#wizardProgress').textContent,/1 \/ 3/);
 d.querySelector('#wizardNext').click();d.querySelector('#wizardMonthDay').value='5';d.querySelector('#wizardNext').click();d.querySelector('#wizardTime').value='18:30';d.querySelector('#wizardTimezone').value='Asia/Shanghai';
 assert.equal(h.saves.length,0);d.querySelector('#wizardNext').click();await tick();
 assert.equal(h.saves.length,1);assert.equal(h.saves[0].cadence,'monthly');assert.equal(h.saves[0].monthDay,5);assert.equal(h.saves[0].time,'18:30');assert.equal(h.saves[0].market,'HK');assert.equal(h.saves[0].assetType,'etf');
 assert.equal(h.saves[0].enabled,true);assert.match(d.querySelector('#taskThread').textContent,/首次执行/);assert.match(d.querySelector('#taskMessage').textContent,/已创建并启用/);h.dom.window.close();
});

test('scenario cards prefill distinct schedules and preserve the mobile task draft',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();const cards=[...d.querySelectorAll('[data-recommendation]')];assert.equal(cards.length,6);
 for(const [id,stage,type,time] of [['morning','pre','index','09:00'],['announcements','pre','watchlist','09:00'],['intraday','live','index','10:30'],['sectors','live','etf','14:00'],['closing','post','index','15:30'],['watchlist','post','watchlist','15:30']]){
  d.querySelector(`[data-recommendation="${id}"]`).click();const f=d.querySelector('#dayForm');assert.equal(f.elements.stage.value,stage);assert.equal(f.elements.assetType.value,type);assert.equal(f.elements.time.value,time);assert.equal(f.elements.timeMode.value,'fixed');assert.ok(f.elements.question.value.length>80);d.querySelector('#dayClose').click();
 }
 assert.equal(h.saves.length,0);h.dom.window.close();
 const m=setup({mobile:true,tasks:[]});await tick();const md=m.w.document;
 md.querySelector('#navTasks').click();md.querySelector('[data-recommendation="sectors"]').click();md.querySelector('#wizardNext').click();md.querySelector('#wizardNext').click();assert.equal(md.querySelector('#wizardTime').value,'14:00');assert.equal(m.saves.length,0);m.dom.window.close();
});

test('follow-up uses the selected cached answer and restores replies without rerunning analysis',async()=>{
 const h=setup({url:'https://example.com/veya/?tab=tasks&task=live'});await tick();const d=h.w.document,fetch=h.w.fetch;let payload;
 h.w.fetch=async(path,options)=>{if(path==='/api/chat/stream'){payload=JSON.parse(options.body);return {ok:true,body:{}};}return fetch(path,options);};
 h.w.readEventStream=async(_body,callback)=>callback('final',{interpretation:'这是基于缓存结果的追问回答'});
 assert.equal(d.querySelector('#taskChatForm').hidden,false);d.querySelector('#taskChatInput').value='进一步解释量能';d.querySelector('#taskChatForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(payload.question,'进一步解释量能');assert.equal(payload.history[1].text,'最新缓存内容');assert.match(d.querySelector('#taskFollowups').textContent,/追问回答/);
 const stored=JSON.parse(h.w.localStorage.getItem('veya-task-chat:live:run-new'));assert.equal(stored.length,2);
 d.querySelector('#taskBack').click();d.querySelector('#taskSidebarList [data-task-open]').click();await tick();assert.match(d.querySelector('#taskFollowups').textContent,/追问回答/);h.dom.window.close();
});

test('attachment plus previews, removes and sends images with the follow-up',async()=>{
 const h=setup({url:'https://example.com/veya/?tab=tasks&task=live'});await tick();const d=h.w.document,fetch=h.w.fetch;let payload;
 h.w.fetch=async(path,options)=>{if(path==='/api/chat/stream'){payload=JSON.parse(options.body);return {ok:true,body:{}};}return fetch(path,options);};h.w.readEventStream=async(_body,callback)=>callback('final',{interpretation:'附图已处理'});
 const file=new h.w.File(['image'], 'chart.png',{type:'image/png'}),input=d.querySelector('#taskImageInput');Object.defineProperty(input,'files',{value:[file]});
 input.dispatchEvent(new h.w.Event('change'));await tick();assert.equal(d.querySelectorAll('#taskAttachmentPreview img').length,1);
 d.querySelector('[data-remove-task-image]').click();assert.equal(d.querySelectorAll('#taskAttachmentPreview img').length,0);
 input.dispatchEvent(new h.w.Event('change'));await tick();d.querySelector('#taskChatForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(payload.images[0].name,'chart.png');assert.match(payload.images[0].dataUrl,/^data:image\/png;base64,/);assert.equal(d.querySelectorAll('#taskFollowups img').length,1);h.dom.window.close();
});

test('task editor hides tokens, preserves dynamic templates and saves custom days and time zone',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();const f=d.querySelector('#dayForm');
 assert.doesNotMatch(f.elements.question.value,/\{\{/);assert.match(f.elements.question.value,/A股/);
 d.querySelector('[data-editor-field="cadence"]').click();d.querySelector('[data-editor-value="custom"]').click();assert.equal(d.querySelector('#dayCustomLabel').hidden,false);d.querySelector('[data-editor-weekday="2"]').click();
 d.querySelector('[data-editor-field="timezone"]').click();d.querySelector('#editorZoneSearch').value='美国东部';d.querySelector('#editorZoneSearch').dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('#editorZoneList .editorOption').length,1);d.querySelector('[data-editor-value="America/New_York"]').click();
 d.querySelector('[data-editor-field="time"]').click();d.querySelector('[data-editor-value="09:15"]').click();
 assert.equal(d.querySelector('#dayServerchanFields').hidden,true);f.elements.serverchan.checked=true;f.elements.serverchan.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#dayServerchanFields').hidden,false);f.elements.serverchan.checked=false;
 f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(h.saves.length,1);assert.equal(h.saves[0].cadence,'custom');assert.deepEqual(h.saves[0].weekdays,[0,2]);assert.equal(h.saves[0].timezone,'America/New_York');assert.equal(h.saves[0].time,'09:15');assert.match(h.saves[0].question,/\{\{market\}\}/);h.dom.window.close();
});

test('calendar supports end date selection and turning repeat off schedules one date',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();const f=d.querySelector('#dayForm');
 d.querySelector('[data-editor-field="endMode"]').click();d.querySelector('[data-editor-value="date"]').click();assert.equal(d.querySelector('#dayEndLabel').hidden,false);
 d.querySelector('[data-editor-field="endDate"]').click();d.querySelector('[data-editor-month="1"]').click();const date=d.querySelector('[data-editor-date]');const expected=date.dataset.editorDate;date.click();assert.equal(f.elements.endDate.value,expected);
 f.elements.repeat.checked=false;f.elements.repeat.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#dayDateLabel').hidden,false);assert.equal(d.querySelector('#dayCadenceLabel').hidden,true);
 f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(h.saves[0].cadence,'once');assert.ok(h.saves[0].date);assert.equal(h.saves[0].endDate,'');h.dom.window.close();
});

test('advanced contains opt-in push settings and reopens collapsed with saved channels preserved',async()=>{
 const h=setup({tasks:[{...base,id:'live',serverchan:true,feishu:true,serverchanKeyConfigured:true,feishuUrlConfigured:true}]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();const f=d.querySelector('#dayForm'),advanced=d.querySelector('#dayAdvanced');
 assert.equal(advanced.open,false);assert.ok(advanced.contains(d.querySelector('.editorNotifications')));assert.equal(f.elements.serverchan.checked,false);assert.equal(f.elements.feishu.checked,false);assert.equal(d.querySelector('#dayDelete'),null);
 advanced.open=true;d.querySelector('#dayClose').click();d.querySelector('#taskSidebarList [data-task-open="live"]').click();await tick();d.querySelector('#taskThread [data-edit-task]').click();
 assert.equal(advanced.open,false);assert.equal(f.elements.serverchan.checked,true);assert.equal(f.elements.feishu.checked,true);assert.equal(f.elements.serverchanKey.value,'');assert.equal(f.elements.serverchanKey.placeholder,'输入 SCT 开头的 SendKey');assert.equal(f.elements.feishuUrl.placeholder,'输入飞书机器人 Webhook');assert.equal(d.querySelector('#dayDelete'),null);
 assert.equal(h.requests.some(r=>r.method==='DELETE'),false);h.dom.window.close();
});
