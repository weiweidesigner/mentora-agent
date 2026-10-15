import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const editorSource=readFileSync(new URL('../app/static/task-editor.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const savedAnswerSource=appSource.slice(appSource.indexOf('async function renderSavedAssistantAnswer('),appSource.indexOf('function restoreSession(sessionId)'));
const source=readFileSync(new URL('../app/static/day-tasks.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
const base={title:'我的盘中分析',market:'CN',stage:'live',assetType:'stocks',symbols:'',question:'分析市场',cadence:'daily',date:'',endDate:'',time:'12:00',timeMode:'fixed',offset:0,timezone:'market',enabled:true,newChat:true,browser:false,serverchan:false,feishu:false,wecom:false,weekdays:[0],monthDay:1,notifications:[],lastRun:{status:'success'},successAt:'2026-10-15T04:00:00Z',resultVersion:'run-new',summary:'## 核心结论\n\n**已保存的结果**',nextAt:'2026-10-16T04:00:00Z'};
function setup({mobile=false,tasks=[{...base,id:'live'}],url='https://example.com/veya/',shared=null}={}) {
 const dom=new JSDOM(html,{url,runScripts:'outside-only'}),w=dom.window,requests=[],saves=[];
 w.matchMedia=()=>({matches:mobile});w.setInterval=()=>0;w.structuredClone=structuredClone;w.requestAnimationFrame=f=>f();
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.setSidebarCollapsed=()=>{};w.closeActivityDrawer=()=>{};w.startNewChat=()=>w.dispatchEvent(new w.Event('veya:chat-navigate'));
 w.renderMixedReportFlow=async (_article,answer,container,onDone)=>{container.textContent=answer.interpretation;onDone?.();};
 w.fetch=async (path,options={})=>{
  requests.push({path,method:options.method||'GET'});let data;
  if(options.method==='POST'&&path.endsWith('/tasks')){data={...base,...JSON.parse(options.body),id:'created',resultVersion:null,lastRun:null,nextAt:'2026-11-05T10:30:00Z'};saves.push(JSON.parse(options.body));tasks.push(data);}
  else if(path.includes('/shared/'))data=shared||{};
  else if(options.method==='PUT'){const id=path.split('/').at(-1),index=tasks.findIndex(t=>t.id===id);data={...tasks[index],...JSON.parse(options.body)};tasks[index]=data;}
  else if(options.method==='DELETE'){tasks=tasks.filter(t=>!path.endsWith('/'+t.id));data={ok:true};}
  else if(options.method==='POST'&&path.endsWith('/run')){const task=tasks.find(t=>path.includes('/'+t.id+'/'));task.activeRun='queued';task.lastRun={status:'queued'};data={runId:'queued'};}
  else if(path.endsWith('/tasks'))data={tasks,markets:[{market:'CN',name:'A股',zone:'Asia/Shanghai',stage:'live',status:'交易中'}],serverTime:'2026-10-15T04:00:00Z',pushPublicKey:''};
  else if(path.endsWith('/runs'))data={runs:path.includes('created')?[]:[{id:'run-new',status:'success',created:'2026-10-15T04:00:00Z',finished:'2026-10-15T04:00:00Z',available:true},{id:'run-old',status:'success',created:'2026-10-14T04:00:00Z',finished:'2026-10-14T04:00:00Z',available:true}]};
  else if(path.includes('/runs/'))data={question:'本次原始问句',cachedDate:'2026-10-15T04:00:00Z',answer:{interpretation:path.endsWith('run-old')?'上一次缓存内容':'最新缓存内容'}};
  else data={};
  return {ok:true,json:async()=>data};
 };
 w.mergeSourcesByUrl=(sources)=>sources;w.sourcesFromInsightMarkdown=()=>[];w.detectLanguage=()=>"zh-CN";w.escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;');w.buildCapabilityBar=()=>'';w.buildResultActions=()=>'<button class=shareResultButton>分享</button>';w.refreshSavedToolStepTitles=()=>{};w.attachResultActionHandlers=()=>{};w.toggleActivityDrawer=article=>article.dataset.activityOpened='true';
 w.eval(savedAnswerSource);w.eval(editorSource);w.eval(source);return {dom,w,requests,saves};
}

function openScenarioEditor(d,id){
 d.querySelector(`[data-recommendation="${id}"]`).click();
 if(['announcements','watchlist'].includes(id))d.querySelector('#wizardSymbols').value='600519.SH';
 d.querySelector('#wizardNext').click();d.querySelector('#wizardNext').click();d.querySelector('#wizardAdvanced').click();
}

test('My Day shows only generated results for the current market phase and links to that task',async()=>{
 const h=setup({tasks:[{...base,id:'live'},{...base,id:'pre',stage:'pre'},{...base,id:'pending',resultVersion:null},{...base,id:'us',market:'US'}]});await tick();
 const cards=h.w.document.querySelectorAll('#dayPanel [data-task-open]');assert.equal(cards.length,1);assert.equal(cards[0].dataset.taskOpen,'live');assert.doesNotMatch(cards[0].textContent,/\*\*|##/);
 assert.equal(h.w.document.querySelectorAll('#myDay [role=tab],#myDay [data-template]').length,0);
 cards[0].click();await tick();assert.equal(h.w.document.querySelector('#taskWorkspace').hidden,false);assert.equal(new URL(h.w.location).searchParams.get('task'),'live');
 assert.match(h.w.document.querySelector('#taskThread').textContent,/最新缓存内容/);assert.equal(h.w.document.querySelectorAll('#taskThread .thinkingTrigger').length,1);
 h.w.document.querySelector('#taskCardTitle').click();assert.equal(h.w.document.querySelector('#dayDialog').open,true);assert.equal(h.w.document.querySelector('#dayForm input[name=title]').value,base.title);
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
  openScenarioEditor(d,id);const f=d.querySelector('#dayForm');assert.equal(f.elements.stage.value,stage);assert.equal(f.elements.assetType.value,type);assert.equal(f.elements.time.value,time);assert.equal(f.elements.timeMode.value,'fixed');assert.ok(f.elements.question.value.length>80);d.querySelector('#dayClose').click();d.querySelector('#wizardClose').click();
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
 d.querySelector('#navTasks').click();openScenarioEditor(d,'morning');const f=d.querySelector('#dayForm');
 assert.doesNotMatch(f.elements.question.value,/\{\{/);assert.match(f.elements.question.value,/A股/);
 d.querySelector('[data-editor-field="cadence"]').click();d.querySelector('[data-editor-value="custom"]').click();assert.equal(d.querySelector('#dayCustomLabel').hidden,false);d.querySelector('[data-editor-weekday="2"]').click();
 d.querySelector('[data-editor-field="timezone"]').click();d.querySelector('#editorZoneSearch').value='美国东部';d.querySelector('#editorZoneSearch').dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('#editorZoneList .editorOption').length,1);d.querySelector('[data-editor-value="America/New_York"]').click();
 d.querySelector('[data-editor-field="time"]').click();d.querySelector('[data-editor-value="09:15"]').click();
 assert.equal(d.querySelector('#dayServerchanFields').hidden,true);f.elements.serverchan.checked=true;f.elements.serverchan.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#dayServerchanFields').hidden,false);f.elements.serverchan.checked=false;
 f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(h.saves.length,1);assert.equal(h.saves[0].cadence,'custom');assert.deepEqual(h.saves[0].weekdays,[0,2]);assert.equal(h.saves[0].timezone,'America/New_York');assert.equal(h.saves[0].time,'09:15');assert.match(h.saves[0].question,/\{\{market\}\}/);h.dom.window.close();
});

test('calendar supports end date selection and turning repeat off schedules one date',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();openScenarioEditor(d,'morning');const f=d.querySelector('#dayForm');
 d.querySelector('[data-editor-field="endMode"]').click();d.querySelector('[data-editor-value="date"]').click();assert.equal(d.querySelector('#dayEndLabel').hidden,false);
 d.querySelector('[data-editor-field="endDate"]').click();d.querySelector('[data-editor-month="1"]').click();const date=d.querySelector('[data-editor-date]');const expected=date.dataset.editorDate;date.click();assert.equal(f.elements.endDate.value,expected);
 f.elements.repeat.checked=false;f.elements.repeat.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#dayDateLabel').hidden,false);assert.equal(d.querySelector('#dayCadenceLabel').hidden,true);
 f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(h.saves[0].cadence,'once');assert.ok(h.saves[0].date);assert.equal(h.saves[0].endDate,'');h.dom.window.close();
});

test('push channels always open switched off, including tasks with saved delivery settings',async()=>{
 const h=setup({tasks:[{...base,id:'live',serverchan:true,feishu:true,serverchanKeyConfigured:true,feishuUrlConfigured:true}]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();openScenarioEditor(d,'morning');const f=d.querySelector('#dayForm'),advanced=d.querySelector('#dayAdvanced');
 assert.equal(advanced.open,false);assert.ok(advanced.contains(d.querySelector('.editorNotifications')));assert.equal(f.elements.serverchan.checked,false);assert.equal(f.elements.feishu.checked,false);assert.equal(d.querySelector('#dayDelete'),null);
 advanced.open=true;d.querySelector('#dayClose').click();d.querySelector('#taskSidebarList [data-task-open="live"]').click();await tick();d.querySelector('#taskCardTitle').click();
 assert.equal(advanced.open,false);assert.equal(f.elements.serverchan.checked,false);assert.equal(f.elements.feishu.checked,false);assert.equal(d.querySelector('#dayServerchanFields').hidden,true);assert.equal(d.querySelector('#dayFeishuFields').hidden,true);assert.equal(f.elements.serverchanKey.value,'');assert.equal(f.elements.serverchanKey.placeholder,'输入 SCT 开头的 SendKey');assert.equal(f.elements.feishuUrl.placeholder,'输入飞书机器人 Webhook');assert.equal(d.querySelector('#dayDelete'),null);
 assert.equal(h.requests.some(r=>r.method==='DELETE'),false);h.dom.window.close();
});

test('scheduled output uses the saved history answer shell without inventing execution duration',async()=>{
 const h=setup({url:'https://example.com/veya/?tab=tasks&task=live'});await tick();const d=h.w.document;
 assert.ok(d.querySelector('#taskThread .message.user .bubble.userBubble'));
 const article=d.querySelector('#taskThread .message.assistant');assert.ok(article.querySelector('.bubble.assistantBubble .finalAnswer .mixedReport'));
 assert.equal(article.querySelector('.thinkingSummaryText').textContent,base.title);assert.equal(article.dataset.elapsedUnrecorded,'true');
 article.querySelector('.thinkingTrigger').click();assert.equal(d.querySelector('#dayDialog').open,true);assert.equal(d.querySelector('#dayForm input[name=title]').value,base.title);assert.equal(article.dataset.activityOpened,undefined);assert.equal(article.querySelector('.deferredActions').hidden,false);assert.ok(article.querySelector('.shareResultButton'));assert.equal(article.querySelector('[data-edit-task]'),null);
 assert.equal(h.requests.some(r=>r.method==='POST'||r.path.includes('/chat')),false);h.dom.window.close();
});

test('ordinary history still restores through the same saved answer renderer',async()=>{
 const h=setup({tasks:[]});await tick();const w=h.w,d=w.document;
 w.loadSessions=()=>[{id:'saved',question:'历史问句',interpretation:'原始历史答案',thinkingElapsed:42000,sources:[],messages:[]}];
 w.recoverLegacySessionArtifacts=()=>false;w.DEFAULT_INFERENCE_MODEL='model';w.DEFAULT_REASONING_FRAMEWORK='deepseek';w.messages=d.querySelector('#messages');w.conversation=d.querySelector('.conversation');
 w.addUserMessage=text=>{const article=d.createElement('article');article.className='message user';article.textContent=text;w.messages.append(article);};w.appendMessage=article=>w.messages.append(article);w.copyFor=()=> '已思考';w.formatDuration=ms=>`${ms/1000}s`;w.closeActivityDrawer=()=>{};w.renderHistory=()=>{};
 w.eval(appSource.slice(appSource.indexOf('function restoreSession(sessionId)'),appSource.indexOf('async function restoreSharedSessionFromUrl()')));
 w.restoreSession('saved');await tick();assert.match(w.messages.textContent,/历史问句/);assert.match(w.messages.textContent,/原始历史答案/);assert.match(w.messages.querySelector('.thinkingSummaryText').textContent,/42s/);assert.equal(w.messages.querySelector('.message.assistant').dataset.elapsedUnrecorded,'false');assert.equal(w.messages.querySelector('.deferredActions').hidden,false);h.dom.window.close();
});

test('sidebar summarizes upcoming, monitoring, monthly, paused and completed task states',async()=>{
 const h=setup({tasks:[{...base,id:'daily',time:'08:00',nextAt:'2026-10-16T00:00:00Z'},{...base,id:'monitor',activeRun:'running',lastRun:{status:'running'}},{...base,id:'monthly',cadence:'monthly',monthDay:1,nextAt:'2026-11-01T00:00:00Z'},{...base,id:'paused',enabled:false},{...base,id:'done',cadence:'once',enabled:false,nextAt:null,lastRun:{status:'success',finished:'2026-05-15T02:00:00Z'}}]});await tick();const d=h.w.document;
 const row=id=>d.querySelector(`#taskSidebarList [data-task-open="${id}"]`),subtitle=id=>row(id).querySelector('small').textContent;
 assert.equal(subtitle('daily'),'明天 8时 · 每天 8:00');assert.equal(subtitle('monitor'),'监控中');assert.equal(subtitle('monthly'),'11月1日 · 每月');assert.equal(subtitle('paused'),'已暂停 · 每天 12:00');assert.equal(subtitle('done'),'已完成 · 5月15日 10:00');assert.ok(row('done').querySelector('.taskListComplete svg'));assert.ok(row('paused').classList.contains('is-paused'));
 d.querySelector('#taskSidebarFilter').value='completed';d.querySelector('#taskSidebarFilter').dispatchEvent(new h.w.Event('change'));assert.equal(d.querySelectorAll('#taskSidebarList [data-task-open]').length,1);assert.ok(row('done'));h.dom.window.close();
});

test('sidebar dates use the task time zone and failed or queued runs never get a completion mark',async()=>{
 const h=setup({tasks:[{...base,id:'us',market:'US',timezone:'America/New_York',time:'08:00',nextAt:'2026-10-15T12:00:00Z'},{...base,id:'queued',activeRun:'queued',lastRun:{status:'queued'}},{...base,id:'failed',cadence:'once',enabled:false,nextAt:null,lastRun:{status:'failed'}}]});await tick();const d=h.w.document;
 assert.equal(d.querySelector('[data-task-open="us"] small').textContent,'今天 8时 · 每天 8:00');assert.equal(d.querySelector('[data-task-open="queued"] small').textContent,'排队中');assert.equal(d.querySelector('[data-task-open="failed"] small').textContent,'运行失败');assert.equal(d.querySelector('[data-task-open="failed"] .taskListComplete'),null);h.dom.window.close();
});

test('more menu opens separately from the task and exposes pause, run, edit, share and delete',async()=>{
 const h=setup({url:'https://example.com/veya/?tab=tasks'});await tick();const d=h.w.document;
 d.querySelector('[data-task-more="live"]').click();assert.equal(d.querySelector('#taskMoreMenu').hidden,false);assert.equal(d.querySelector('#taskDetail').hidden,true);assert.equal(new URL(h.w.location).searchParams.get('task'),null);assert.deepEqual([...d.querySelectorAll('#taskMoreMenu [data-task-action]')].map(b=>b.dataset.taskAction),['toggle','run','edit','share','delete']);
 d.querySelector('[data-task-action="toggle"]').click();await tick();assert.ok(h.requests.some(r=>r.method==='PUT'));assert.match(d.querySelector('#taskSidebarList small').textContent,/已暂停/);
 d.querySelector('[data-task-more="live"]').click();assert.match(d.querySelector('[data-task-action="toggle"]').textContent,/开启/);d.querySelector('[data-task-action="edit"]').click();assert.equal(d.querySelector('#dayDialog').open,true);assert.equal(d.querySelector('#dayForm').elements.title.value,base.title);d.querySelector('#dayClose').click();
 d.querySelector('[data-task-more="live"]').click();d.querySelector('[data-task-action="run"]').click();await tick();assert.equal(h.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/run')).length,1);d.querySelector('[data-task-more="live"]').click();assert.equal(d.querySelector('[data-task-action="run"]').disabled,true);assert.equal(d.querySelector('[data-task-action="delete"]').disabled,true);
 d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.querySelector('#taskMoreMenu').hidden,true);h.dom.window.close();
});

test('delete menu requires confirmation; cancelling never deletes and confirmation removes only that task',async()=>{
 const h=setup({url:'https://example.com/veya/?tab=tasks&task=live'});await tick();const d=h.w.document;
 d.querySelector('[data-task-more="live"]').click();d.querySelector('[data-task-action="delete"]').click();assert.equal(d.querySelector('#taskDeleteDialog').open,true);assert.equal(h.requests.some(r=>r.method==='DELETE'),false);d.querySelector('#taskDeleteCancel').click();assert.equal(d.querySelector('#taskDeleteDialog').open,false);assert.equal(h.requests.some(r=>r.method==='DELETE'),false);
 d.querySelector('[data-task-more="live"]').click();d.querySelector('[data-task-action="delete"]').click();d.querySelector('#taskDeleteConfirm').click();await tick();assert.equal(h.requests.filter(r=>r.method==='DELETE').length,1);assert.equal(d.querySelector('[data-task-open="live"]'),null);assert.equal(d.querySelector('#taskDeleteDialog').open,false);h.dom.window.close();
});

test('share menu passes the selected cached conversation to the shared preview without new analysis',async()=>{
 const h=setup({url:'https://example.com/veya/?tab=tasks&task=live'});await tick();const d=h.w.document;let snapshot;
 h.w.openShareDialog=article=>snapshot=structuredClone(article.shareSession);
 d.querySelector('#taskRunSelect').value='run-old';d.querySelector('#taskRunSelect').dispatchEvent(new h.w.Event('change'));await tick();d.querySelector('[data-task-more="live"]').click();d.querySelector('[data-task-action="share"]').click();await tick();
 assert.equal(snapshot.question,'本次原始问句');assert.equal(snapshot.interpretation,'上一次缓存内容');assert.equal(h.requests.some(r=>r.method==='POST'||r.path.includes('/chat')),false);h.dom.window.close();
});

test('shared task menu exposes no owner mutations and tasks without results cannot share',async()=>{
 const shared={taskId:'shared',runId:'run',task:{...base,id:'shared'},question:'分享问句',answer:{interpretation:'缓存内容'},cachedDate:base.successAt};
 const h=setup({tasks:[],shared,url:'https://example.com/veya/?dayShare=read-only'});await tick();const d=h.w.document;d.querySelector('[data-task-more="shared"]').click();assert.equal(d.querySelector('[data-task-action="toggle"]'),null);assert.equal(d.querySelector('[data-task-action="run"]'),null);assert.equal(d.querySelector('[data-task-action="delete"]'),null);assert.match(d.querySelector('[data-task-action="edit"]').textContent,/查看设置/);h.dom.window.close();
 const pending=setup({tasks:[{...base,id:'pending',resultVersion:null}],url:'https://example.com/veya/?tab=tasks'});await tick();pending.w.document.querySelector('[data-task-more="pending"]').click();assert.equal(pending.w.document.querySelector('[data-task-action="share"]').disabled,true);pending.dom.window.close();
});

test('desktop recommendations create a real task only after interactive answers are sent, then Open edits it',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="closing"]').click();
 assert.equal(d.querySelector('#dayDialog').open,false);assert.equal(d.querySelector('#taskWizard').hidden,false);assert.doesNotMatch(d.querySelector('#taskWizardTranscript').textContent,/\{\{/);assert.equal(d.querySelectorAll('[name=wizardFocus]').length,4);
 d.querySelector('[name=wizardFocus]').checked=false;d.querySelector('#wizardScopeNote').value='重点比较上周变化';d.querySelector('#wizardNext').click();
 d.querySelector('#wizardCadence').value='weekly';d.querySelector('#wizardCadence').dispatchEvent(new h.w.Event('change',{bubbles:true}));d.querySelector('#wizardWeekday').value='6';d.querySelector('#wizardPrevious').click();assert.equal(d.querySelector('#wizardScopeNote').value,'重点比较上周变化');assert.equal(d.querySelector('[name=wizardFocus]').checked,false);d.querySelector('#wizardNext').click();assert.equal(d.querySelector('#wizardWeekday').value,'6');d.querySelector('#wizardNext').click();
 d.querySelector('#wizardTime').value='09:00';d.querySelector('#wizardTimezone').value='Asia/Shanghai';d.querySelector('#wizardTitle').value='每周市场复盘';assert.equal(h.saves.length,0);
 d.querySelector('#wizardNext').click();await tick();assert.equal(h.saves.length,1);assert.equal(h.saves[0].cadence,'weekly');assert.deepEqual(h.saves[0].weekdays,[6]);assert.equal(h.saves[0].time,'09:00');assert.equal(h.saves[0].timezone,'Asia/Shanghai');assert.match(h.saves[0].question,/重点比较上周变化/);assert.equal(h.saves[0].serverchan,false);assert.equal(h.saves[0].feishu,false);
 assert.equal(d.querySelectorAll('#taskThread .message.user').length,2);assert.match(d.querySelector('#taskThread').textContent,/已创建并启用/);assert.match(d.querySelector('.taskCreatedSummary').textContent,/每周日 9:00|每周日 09:00/);assert.equal(d.querySelector('#taskInfoCard').hidden,true);
 d.querySelector('.taskCreatedLink [data-edit-task]').click();assert.equal(d.querySelector('#dayDialog').open,true);assert.equal(d.querySelector('#dayForm').elements.title.value,'每周市场复盘');assert.equal(d.querySelector('#dayForm').elements.cadence.value,'weekly');assert.equal(d.querySelector('#dayForm').elements.weekday.value,'6');
 const record=h.w.localStorage.getItem('veya-task-created:created');assert.ok(record);const task={...base,...h.saves[0],id:'created',lastRun:null,resultVersion:null,nextAt:'2026-11-05T10:30:00Z'};h.dom.window.close();
 const restored=setup({tasks:[task],url:'https://example.com/veya/?tab=tasks&task=created'});restored.w.localStorage.setItem('veya-task-created:created',record);await tick();assert.equal(restored.w.document.querySelectorAll('#taskThread .message.user').length,2);assert.match(restored.w.document.querySelector('#taskThread').textContent,/重点比较上周变化/);assert.equal(restored.saves.length,0);restored.dom.window.close();
});

test('creation validates custom days and retries a failed save without claiming success or duplicating tasks',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="intraday"]').click();d.querySelector('#wizardNext').click();d.querySelector('#wizardCadence').value='custom';d.querySelector('#wizardCadence').dispatchEvent(new h.w.Event('change',{bubbles:true}));d.querySelectorAll('[name=wizardCustomDay]').forEach(e=>e.checked=false);d.querySelector('#wizardNext').click();await tick();assert.match(d.querySelector('#wizardError').textContent,/至少一个执行星期/);assert.equal(h.saves.length,0);
 d.querySelector('[name=wizardCustomDay][value="2"]').checked=true;d.querySelector('#wizardNext').click();const original=h.w.fetch;let fail=true;h.w.fetch=async(path,options)=>{if(fail&&options?.method==='POST'&&path.endsWith('/tasks')){fail=false;throw new Error('网络暂时不可用');}return original(path,options);};d.querySelector('#wizardNext').click();await tick();assert.equal(h.saves.length,0);assert.equal(d.querySelector('#taskClarification').hidden,false);assert.match(d.querySelector('#wizardError').textContent,/网络暂时不可用/);assert.equal(d.querySelector('.taskCreatedStatus'),null);
 d.querySelector('#wizardNext').click();d.querySelector('#wizardNext')?.click();await tick();assert.equal(h.saves.length,1);assert.deepEqual(h.saves[0].weekdays,[2]);assert.equal(d.querySelectorAll('#taskThread .taskCreatedAnswer').length,1);h.dom.window.close();
});

test('new-task composer accepts a natural-language schedule before opening clarification',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;d.querySelector('#navTasks').click();d.querySelector('#taskSidebarNew').click();assert.equal(d.activeElement.id,'taskPrompt');
 d.querySelector('#taskPrompt').value='每周日 上午9点复盘美股指数';d.querySelector('#taskPromptForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));assert.match(d.querySelector('#taskWizardTranscript').textContent,/每周日 上午9点复盘美股指数/);d.querySelector('#wizardNext').click();assert.equal(d.querySelector('#wizardCadence').value,'weekly');assert.equal(d.querySelector('#wizardWeekday').value,'6');d.querySelector('#wizardNext').click();assert.equal(d.querySelector('#wizardTime').value,'09:00');assert.equal(h.saves.length,0);h.dom.window.close();
});

test('a saved task is confirmed even if fetching its empty run history temporarily fails',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document,original=h.w.fetch;
 h.w.fetch=async(path,options)=>{if(path.endsWith('/runs'))throw new Error('记录暂不可用');return original(path,options);};d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();d.querySelector('#wizardNext').click();d.querySelector('#wizardNext').click();d.querySelector('#wizardNext').click();await tick();assert.equal(h.saves.length,1);assert.match(d.querySelector('.taskCreatedStatus').textContent,/已创建并启用/);assert.equal(d.querySelector('#taskWizard').hidden,true);assert.ok(d.querySelector('.taskCreatedLink [data-edit-task]'));h.dom.window.close();
});

test('finishing a submitted creation does not pull the user back after they navigate home',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document,original=h.w.fetch;let finish;
 h.w.fetch=(path,options)=>options?.method==='POST'&&path.endsWith('/tasks')?new Promise(resolve=>{finish=async()=>resolve(await original(path,options));}):original(path,options);
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();d.querySelector('#wizardNext').click();d.querySelector('#wizardNext').click();d.querySelector('#wizardNext').click();d.querySelector('#navHome').click();await finish();await tick();assert.equal(h.saves.length,1);assert.equal(d.querySelector('#taskWorkspace').hidden,true);assert.ok(h.w.localStorage.getItem('veya-task-created:created'));h.dom.window.close();
});
