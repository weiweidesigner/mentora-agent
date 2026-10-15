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
function setup({sceneTasks=[],scene='live',mobile=false,tasks=[{...base,id:'live'}],url='https://example.com/veya/',shared=null}={}) {
 const dom=new JSDOM(html,{url,runScripts:'outside-only'}),w=dom.window,requests=[],saves=[];
 w.matchMedia=()=>({matches:mobile});w.setInterval=()=>0;w.structuredClone=structuredClone;w.requestAnimationFrame=f=>f();
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.setSidebarCollapsed=()=>{};w.closeActivityDrawer=()=>{};w.startNewChat=()=>w.dispatchEvent(new w.Event('veya:chat-navigate'));
 w.renderMixedReportFlow=async (_article,answer,container,onDone)=>{container.textContent=answer.interpretation;onDone?.();};
 w.fetch=async (path,options={})=>{
  requests.push({path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});let data;
  if(path.endsWith('/confirmation'))data={answer:'会按你确认的时间生成这份报告。'};
  else if(path.endsWith('/plan')){const p=JSON.parse(options.body);data={reply:'请确认何时收到这份报告。',draft:{...base,...p.draft},questions:p.answers.length?[]:[{field:'time',question:'你希望几点收到？',options:[],multiple:false}],ready:!!p.answers.length};if(p.answers.length)data.draft.time=p.answers.at(-1).value;}
  else if(options.method==='POST'&&path.endsWith('/tasks')){data={...base,...JSON.parse(options.body),id:'created',resultVersion:null,lastRun:null,nextAt:'2026-11-05T10:30:00Z'};saves.push(JSON.parse(options.body));tasks.push(data);}
  else if(path.includes('/shared/'))data=shared||{};
  else if(options.method==='PUT'){const id=path.split('/').at(-1),index=tasks.findIndex(t=>t.id===id);data={...tasks[index],...JSON.parse(options.body)};tasks[index]=data;}
  else if(options.method==='DELETE'){tasks=tasks.filter(t=>!path.endsWith('/'+t.id));data={ok:true};}
  else if(options.method==='POST'&&path.endsWith('/run')){const task=tasks.find(t=>path.includes('/'+t.id+'/'));task.activeRun='queued';task.lastRun={status:'queued'};data={runId:'queued'};}
  else if(path.endsWith('/tasks'))data={tasks,sceneTasks,markets:[{market:'CN',name:'A股',zone:'Asia/Shanghai',stage:scene,status:scene==='rest'?'今日休市':'交易中'}],serverTime:'2026-10-15T04:00:00Z',pushPublicKey:''};
  else if(path.endsWith('/runs'))data={runs:path.includes('created')?[]:[{id:'run-new',status:'success',created:'2026-10-15T04:00:00Z',finished:'2026-10-15T04:00:00Z',available:true},{id:'run-old',status:'success',created:'2026-10-14T04:00:00Z',finished:'2026-10-14T04:00:00Z',available:true}]};
  else if(path.includes('/runs/'))data={question:'本次原始问句',cachedDate:'2026-10-15T04:00:00Z',answer:{interpretation:path.endsWith('run-old')?'上一次缓存内容':'最新缓存内容'}};
  else data={};
  return {ok:true,json:async()=>data};
 };
 w.mergeSourcesByUrl=(sources)=>sources;w.sourcesFromInsightMarkdown=()=>[];w.detectLanguage=()=>"zh-CN";w.escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;');w.buildCapabilityBar=()=>'';w.buildResultActions=()=>'<button class=shareResultButton>分享</button>';w.refreshSavedToolStepTitles=()=>{};w.attachResultActionHandlers=()=>{};w.toggleActivityDrawer=article=>article.dataset.activityOpened='true';
 w.eval(savedAnswerSource);w.eval(editorSource);w.eval(source);return {dom,w,requests,saves};
}

async function openScenarioEditor(d,id){d.querySelector('#taskSidebarNew').click();}

test('My Day shows only generated results for the current market phase and links to that task',async()=>{
 const h=setup({tasks:[{...base,id:'live'},{...base,id:'pre',stage:'pre',time:'08:30'},{...base,id:'pending',resultVersion:null},{...base,id:'us',market:'US'}]});await tick();
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

test('new task opens the existing panel and task landing has no composer',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;d.querySelector('#navTasks').click();assert.equal(d.querySelector('#taskPromptForm'),null);d.querySelector('#taskSidebarNew').click();assert.equal(d.querySelector('#dayDialog').open,true);assert.equal(d.querySelector('#taskWizard').hidden,true);assert.equal(h.requests.some(r=>r.path.endsWith('/plan')),false);h.dom.window.close();
});

test('recommendations pass scenario parameters to the model without exposing a settings shortcut',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;d.querySelector('#navTasks').click();
 for(const [id,stage,type,time] of [['morning','pre','index','09:00'],['announcements','pre','watchlist','09:00'],['intraday','live','index','10:30'],['sectors','live','etf','14:00'],['closing','post','index','15:30'],['watchlist','post','watchlist','15:30']]){d.querySelector(`[data-recommendation="${id}"]`).click();await tick();const draft=h.requests.filter(r=>r.path.endsWith('/plan')).at(-1).body.draft;assert.equal(draft.stage,stage);assert.equal(draft.assetType,type);assert.equal(draft.time,time);assert.equal(d.querySelector('#wizardAdvanced'),null);d.querySelector('#wizardClose').click();}
 assert.equal(h.saves.length,0);h.dom.window.close();
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
 d.querySelector('#navTasks').click();await openScenarioEditor(d,'morning');const f=d.querySelector('#dayForm');
 assert.doesNotMatch(f.elements.question.value,/\{\{/);assert.match(f.elements.question.value,/A股/);
 d.querySelector('[data-editor-field="cadence"]').click();d.querySelector('[data-editor-value="custom"]').click();assert.equal(d.querySelector('#dayCustomLabel').hidden,false);d.querySelector('[data-editor-weekday="2"]').click();
 d.querySelector('[data-editor-field="timezone"]').click();d.querySelector('#editorZoneSearch').value='美国东部';d.querySelector('#editorZoneSearch').dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('#editorZoneList .editorOption').length,1);d.querySelector('[data-editor-value="America/New_York"]').click();
 d.querySelector('[data-editor-field="time"]').click();d.querySelector('[data-editor-value="09:15"]').click();
 assert.equal(d.querySelector('#dayServerchanFields').hidden,true);f.elements.serverchan.checked=true;f.elements.serverchan.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#dayServerchanFields').hidden,false);f.elements.serverchan.checked=false;
 f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(h.saves.length,1);assert.equal(h.saves[0].cadence,'custom');assert.deepEqual(h.saves[0].weekdays,[0,2]);assert.equal(h.saves[0].timezone,'America/New_York');assert.equal(h.saves[0].time,'09:15');assert.match(h.saves[0].question,/\{\{market\}\}/);h.dom.window.close();
});

test('calendar supports end date selection and turning repeat off schedules one date',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();await openScenarioEditor(d,'morning');const f=d.querySelector('#dayForm');
 d.querySelector('[data-editor-field="endMode"]').click();d.querySelector('[data-editor-value="date"]').click();assert.equal(d.querySelector('#dayEndLabel').hidden,false);
 d.querySelector('[data-editor-field="endDate"]').click();d.querySelector('[data-editor-month="1"]').click();const date=d.querySelector('[data-editor-date]');const expected=date.dataset.editorDate;date.click();assert.equal(f.elements.endDate.value,expected);
 f.elements.repeat.checked=false;f.elements.repeat.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#dayDateLabel').hidden,false);assert.equal(d.querySelector('#dayCadenceLabel').hidden,true);
 f.dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();assert.equal(h.saves[0].cadence,'once');assert.ok(h.saves[0].date);assert.equal(h.saves[0].endDate,'');h.dom.window.close();
});

test('push channels always open switched off, including tasks with saved delivery settings',async()=>{
 const h=setup({tasks:[{...base,id:'live',serverchan:true,feishu:true,serverchanKeyConfigured:true,feishuUrlConfigured:true}]});await tick();const d=h.w.document;
 d.querySelector('#navTasks').click();await openScenarioEditor(d,'morning');const f=d.querySelector('#dayForm'),advanced=d.querySelector('#dayAdvanced');
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

test('model questions drive dynamic controls and submitted answers generate the saved task',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document;d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="closing"]').click();await tick();
 assert.equal(d.querySelector('#wizardQuestionTitle').textContent,'你希望几点收到？');assert.equal(d.querySelector('#wizardProgress').textContent,'1 / 1');assert.equal(d.querySelector('[name=wizardFocus]'),null);assert.equal(h.saves.length,0);
 d.querySelector('#wizardAnswer').value='18:30';d.querySelector('#wizardNext').click();await tick();await tick();assert.equal(h.saves.length,1);assert.equal(h.saves[0].time,'18:30');assert.equal(h.saves[0].serverchan,false);assert.equal(h.requests.filter(r=>r.path.endsWith('/plan')).length,2);assert.match(d.querySelector('#taskThread').textContent,/你希望几点收到/);d.querySelector('#taskThread [data-edit-task]').click();assert.equal(d.querySelector('#dayDialog').open,true);h.dom.window.close();
});

test('model-generated multiple choice and date controls are not a fixed three-step wizard',async()=>{
 const h=setup({tasks:[],mobile:true});await tick();const d=h.w.document,original=h.w.fetch;h.w.fetch=async(path,options)=>{if(path.endsWith('/plan'))return {ok:true,json:async()=>({reply:'请确认内容与结束时间。',draft:{...base},ready:false,questions:[{field:'question',question:'本次希望覆盖哪些信息？',multiple:true,options:[{label:'财报',value:'财报'},{label:'公告',value:'公告'}]},{field:'endDate',question:'何时结束重复？',multiple:false,options:[]}]})};return original(path,options);};
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="announcements"]').click();await tick();assert.equal(d.querySelector('#wizardProgress').textContent,'1 / 2');assert.equal(d.querySelectorAll('[name=wizardAnswer][type=checkbox]').length,2);d.querySelector('[name=wizardAnswer]').checked=true;d.querySelector('#wizardNext').click();assert.equal(d.querySelector('#wizardAnswer').type,'date');d.querySelector('#wizardPrevious').click();assert.equal(d.querySelector('[name=wizardAnswer]').checked,true);assert.equal(h.saves.length,0);h.dom.window.close();
});

test('planning failure never falls back to canned questions or creates a task',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document,original=h.w.fetch;let fail=true;h.w.fetch=async(path,options)=>{if(path.endsWith('/plan')&&fail)throw new Error('模型暂不可用');return original(path,options);};d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();await tick();assert.match(d.querySelector('#wizardError').textContent,/模型暂不可用/);assert.equal(d.querySelector('#wizardNext'),null);assert.equal(h.saves.length,0);fail=false;d.querySelector('#wizardRetry').click();await tick();assert.equal(d.querySelector('#wizardQuestionTitle').textContent,'你希望几点收到？');h.dom.window.close();
});

test('leaving a pending model request never reopens the wizard',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document,original=h.w.fetch;let release;h.w.fetch=async(path,options)=>path.endsWith('/plan')?new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({reply:'配置已就绪',draft:{...base},questions:[],ready:true})});}):original(path,options);d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();d.querySelector('#navHome').click();release();await tick();assert.equal(d.querySelector('#taskWorkspace').hidden,true);assert.equal(h.saves.length,0);h.dom.window.close();
});

test('custom answers bypass preset values and native time validity and reach the model',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document,fetch=h.w.fetch;let answer;
 h.w.fetch=async(path,options)=>{if(path.endsWith('/plan')){const p=JSON.parse(options.body);if(!p.answers.length)return {ok:true,json:async()=>({reply:'请确认时间',draft:{...base},questions:[{field:'time',question:'几点收到？',multiple:false,options:[{label:'8点',value:'08:00'}]}],ready:false})};answer=p.answers.at(-1);return {ok:true,json:async()=>({reply:'已确认',draft:{...base,time:'08:45'},questions:[],ready:true})};}return fetch(path,options);};
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();await tick();d.querySelector('#wizardCustomAnswer').value='北京时间8:45，周末不要发送';d.querySelector('#wizardNext').click();await tick();await tick();assert.match(answer.value,/北京时间8:45/);assert.equal(h.saves[0].time,'08:45');assert.equal(d.querySelector('.taskCreatedSummary'),null);assert.equal(d.querySelector('.taskCreatedStatus'),null);assert.equal(d.querySelector('#taskMessage').textContent,'');assert.match(d.querySelector('.taskCreatedReply').textContent,/会按你确认/);h.dom.window.close();
});

test('planning progress is clickable and opens the existing activity drawer with actual steps',async()=>{
 const h=setup({tasks:[]});await tick();const d=h.w.document,fetch=h.w.fetch;let release;
 h.w.fetch=async(path,options)=>path.endsWith('/plan')?new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({reply:'请确认时间',draft:{...base},questions:[{field:'time',question:'几点收到？',options:[]}],ready:false})});}):fetch(path,options);
 d.querySelector('#navTasks').click();d.querySelector('[data-recommendation="morning"]').click();const article=d.querySelector('#taskWizardTranscript .message.assistant');article.querySelector('.thinkingTrigger').click();assert.equal(article.dataset.activityOpened,'true');assert.match(article.querySelector('.thinkingSteps').textContent,/请求任务配置模型/);release();await tick();assert.equal(d.querySelector('#taskWizardTranscript .message.assistant'),article);assert.match(article.querySelector('.thinkingSteps').textContent,/需要补充参数/);h.dom.window.close();
});

test('My Day removes market picker and subtitle, shows a scene clock and only today’s matching result cards',async()=>{
 const presets=['pre','live','post','rest'].map((stage,i)=>({...base,id:'preset-'+stage,title:'场景任务'+i,stage,time:['08:00','12:00','16:00','09:00'][i],systemPreset:true,resultScene:stage,resultDate:'2026-10-15',resultHeadline:'执行所得标题'+i,resultDescription:'执行所得正文'+i,emoji:'🌇'}));
 for(const scene of ['pre','live','post','rest']){const h=setup({tasks:[],scene,sceneTasks:[...presets,{...presets[0],id:'old',scene:'pre',resultScene:scene,resultDate:'2026-10-14'}]});await tick();const d=h.w.document;assert.equal(d.querySelector('#dayMarketSelect'),null);assert.equal(d.querySelector('.dayHeader p'),null);assert.match(d.querySelector('#dayClock').textContent,/2026年10月15日.*\d{2}:\d{2}:\d{2}/);assert.equal(d.querySelector('#daySceneArt').dataset.scene,scene);const cards=d.querySelectorAll('#dayPanel .caseCard');assert.equal(cards.length,scene==='pre'?2:1);if(scene==='pre'){assert.equal(cards[1].dataset.taskRun,'');assert.match(cards[1].textContent,/等待执行/);assert.doesNotMatch(cards[1].textContent,/执行所得标题/);}assert.equal(cards[0].dataset.taskOpen,'preset-'+scene);assert.match(cards[0].querySelector('h2').textContent,/执行所得标题/);assert.match(cards[0].querySelector('p').textContent,/执行所得正文/);assert.match(cards[0].querySelector('.caseCardTag').textContent,/场景任务/);h.dom.window.close();}
});

test('shared scene results open the normal saved conversation without allowing edits',async()=>{
 const t={...base,id:'public-result',systemPreset:true,resultScene:'live',resultDate:'2026-10-15',resultHeadline:'市场变化'};const h=setup({tasks:[],sceneTasks:[t]});await tick();const d=h.w.document;d.querySelector('#dayPanel [data-task-open]').click();await tick();assert.match(d.querySelector('#taskThread').textContent,/最新缓存内容/);assert.equal(d.querySelector('#taskRunNow').hidden,true);assert.equal(d.querySelector('#taskToggle').hidden,true);d.querySelector('#taskThread .thinkingTrigger').click();assert.equal(d.querySelector('#daySave').hidden,true);assert.equal(h.requests.some(r=>r.method==='POST'),false);h.dom.window.close();
});

test('already scheduled presets appear in task lists, separate recommendations create new plans',async()=>{
 const presets=['pre','live','post','rest'].flatMap(stage=>[1,2,3].map(i=>({...base,id:stage+i,title:'已创建-'+stage+i,stage,time:'09:00',systemPreset:true})));
 const h=setup({tasks:[],sceneTasks:presets});await tick();const d=h.w.document;d.querySelector('#navTasks').click();
 assert.equal(d.querySelectorAll('#taskLandingList [data-task-open]').length,12);assert.equal(d.querySelectorAll('[data-recommendation-scene]').length,4);
 for(const scene of ['pre','live','post','rest']){d.querySelector(`[data-recommendation-scene="${scene}"]`).click();const cards=d.querySelectorAll('[data-recommendation]');assert.equal(cards.length,2);assert.ok([...cards].every(e=>!e.textContent.includes('已创建-')));}
 d.querySelector('[data-recommendation]').click();await tick();assert.ok(h.requests.some(r=>r.path.endsWith('/plan')));assert.equal(h.saves.length,0);h.dom.window.close();
});

test('scene presets show scheduled, running and unread results and viewing clears only that result',async()=>{
 const t={...base,systemPreset:true,scene:'live',resultScene:'live',resultDate:'2026-10-15'};
 const h=setup({tasks:[],sceneTasks:[{...t,id:'waiting',resultVersion:null,lastRun:null},{...t,id:'running',activeRun:'run-active',lastRun:{status:'running'},livePreview:'正在核验最新成交量与行情时间'},{...t,id:'done'}]});await tick();const d=h.w.document;
 const cards=d.querySelectorAll('#dayPanel .caseCard');assert.equal(cards.length,3);
 assert.match(cards[0].textContent,/等待执行/);assert.match(cards[1].textContent,/正在运行任务/);assert.equal(cards[1].querySelector('p').textContent,base.question);assert.doesNotMatch(cards[1].textContent,/核验最新成交量/);assert.ok(cards[1].classList.contains('is-running'));assert.ok(cards[1].querySelector('.dayRunSpinner'));assert.equal(cards[1].dataset.taskRun,'run-active');
 assert.equal(cards[2].querySelector('.dayResultEmoji'),null);assert.ok(cards[2].querySelector('[aria-label="未读结果"]'));cards[2].click();await tick();assert.equal(d.querySelector('[data-task-open="done"] .dayUnreadDot'),null);assert.equal(JSON.parse(h.w.localStorage.getItem('mentora-task-seen')).done,'run-new');assert.equal(h.requests.some(r=>r.method==='POST'),false);h.dom.window.close();
});

test('running task replays real events into the normal live renderer and finishes with settings entry',async()=>{
 const t={...base,id:'active',activeRun:'run-active',lastRun:{status:'running'},systemPreset:true,scene:'live'};
 const h=setup({tasks:[],sceneTasks:[t]});await tick();const d=h.w.document,fetch=h.w.fetch;let send,completed=false;const events=[];
 h.w.createAssistantMessage=(question,{target,taskContext})=>{const a=d.createElement('article');a.className='message assistant';a.taskContext=taskContext;a.innerHTML='<button class="thinkingTrigger is-thinking"><span class="thinkingSummaryText">正在思考</span></button><div class="finalAnswer"></div>';target.append(a);return a;};
 h.w.handleStreamEvent=(article,event,data)=>{events.push(event);article.querySelector('.finalAnswer').textContent=data.text||data.interpretation||data.detail||'';};
 h.w.readEventStream=async(_body,onEvent)=>new Promise(resolve=>{send=(event,data)=>{onEvent(event,data);if(event==='run_state'){completed=true;resolve();}};});
 h.w.fetch=async(path,options)=>{if(path.includes('/events?'))return {ok:true,body:{}};if(path.endsWith('/runs'))return {ok:true,json:async()=>({runs:[{id:'run-active',status:completed?'success':'running',created:'2026-10-15T04:00:00Z'}]})};if(path.endsWith('/runs/run-active'))return {ok:true,json:async()=>({runId:'run-active',question:'实际运行问句',status:completed?'success':'running',answer:completed?{interpretation:'最终研究结论'}:null})};return fetch(path,options);};
 d.querySelector('[data-task-open="active"]').click();await tick();assert.equal(d.querySelector('#taskChatForm').hidden,true);send('tool_step',{_taskEventId:1,detail:'检索公开公告'});send('answer_text',{_taskEventId:2,text:'正在输出的研究结果'});assert.match(d.querySelector('#taskThread').textContent,/正在输出的研究结果/);assert.deepEqual(events,['tool_step','answer_text']);send('final',{_taskEventId:3,interpretation:'最终研究结论'});const trigger=d.querySelector('#taskThread .thinkingTrigger');assert.equal(trigger.textContent,t.title);trigger.click();assert.equal(d.querySelector('#dayDialog').open,true);send('run_state',{status:'success'});await tick();assert.equal(h.requests.some(r=>r.method==='POST'),false);h.dom.window.close();
});


test('polling preserves running cards and spinners rather than restarting their animations',async()=>{
 const running={...base,id:'running',systemPreset:true,scene:'live',activeRun:'active-run',lastRun:{status:'running'}};
 const h=setup({tasks:[],sceneTasks:[running]});await tick();const d=h.w.document,card=d.querySelector('#dayPanel [data-task-open="running"]'),spinner=card.querySelector('.dayRunSpinner');
 Object.defineProperty(d,'hidden',{value:false,configurable:true});
 d.dispatchEvent(new h.w.Event('visibilitychange'));await tick();
 assert.equal(d.querySelector('#dayPanel [data-task-open="running"]'),card);assert.equal(card.querySelector('.dayRunSpinner'),spinner);
 assert.equal(card.getAttribute('style'),null);
 running.title='更新后的任务名称';d.dispatchEvent(new h.w.Event('visibilitychange'));await tick();assert.equal(d.querySelector('#dayPanel [data-task-open="running"]'),card);assert.match(card.textContent,/更新后的任务名称/);
 running.activeRun=null;running.lastRun={status:'success'};d.dispatchEvent(new h.w.Event('visibilitychange'));await tick();assert.equal(card.classList.contains('is-running'),false);assert.equal(card.querySelector('.dayRunSpinner'),null);h.dom.window.close();
});
