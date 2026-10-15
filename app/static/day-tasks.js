(() => {
  const $ = id => document.getElementById(id);
  const home = $('myDay'), workspace = $('taskWorkspace'), form = $('dayForm'), dialog = $('dayDialog');
  if (!home || !workspace) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages = {pre:'盘前机会',live:'盘中监控',post:'收盘回顾'};
  const assets = {stocks:'股票',etf:'ETF',index:'指数',sector:'行业板块',watchlist:'自选列表'};
  const names = {CN:'A股',HK:'港股',US:'美股'}, flags = {CN:'🇨🇳',HK:'🇭🇰',US:'🇺🇸'};
  const zones = {CN:'Asia/Shanghai',HK:'Asia/Hong_Kong',US:'America/New_York'};
  const cadences = {trading:'交易日',daily:'每天',weekly:'每周',monthly:'每月',once:'指定日期一次'};
  const el = name => form.elements.namedItem(name);
  const mobile = () => window.matchMedia('(max-width: 760px)').matches;
  let market = 'CN'; try { market = localStorage.getItem('veya-day-market') || 'CN'; } catch {}
  if (!names[market]) market = 'CN';
  let tasks = [], markets = [], publicKey = '', serverDelta = 0, busy = false, lastRefresh = 0;
  let selectedId = '', selectedRun = '', pinnedRun = false, sharedEntry = null, resultVersion = '', viewVersion = 0;
  let lastDetailState = '';
  const detailState = t => JSON.stringify([t.resultVersion,t.activeRun,t.lastRun?.status,t.enabled,t.nextAt]);
  let editing = null, suggestedQuestion = '', suggestedTitle = '', filter = 'all', internalNavigation = false;
  let wizardDraft = null, wizardStep = 0, saving = false;
  const initial = new URLSearchParams(location.search);
  let initialTask = initial.get('task') || initial.get('dayResult');
  const initialRun = initial.get('run') || '';
  const initialShare = initial.get('dayShare');
  const plainSummary = value => String(value || '').replace(/^#{1,6}\s+.*$/gm,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*|__|`/g,'').replace(/\s+/g,' ').trim();
  const dateText = (value, zone = 'Asia/Shanghai') => value ? new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) : '';
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+serverDelta));
  const zoneFor = task => task.timezone === 'market' ? zones[task.market] : (task.timezone || 'Asia/Shanghai');
  const selected = () => tasks.find(t => t.id === selectedId) || (sharedEntry?.task.id === selectedId ? sharedEntry.task : null);
  const editable = task => Boolean(task && tasks.some(t => t.id === task.id));
  function message(text, target) { const node=$(target || (dialog.open ? 'dayDialogMessage' : workspace.hidden ? 'dayMessage' : 'taskMessage'));node.textContent=text;node.classList.toggle('is-success',/^定时任务已创建|^任务已保存/.test(text)); }
  async function api(path, method = 'GET', data) {
    const response = await fetch('/api/day/' + path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Veya-Day':'1'},...(data === undefined ? {} : {body:JSON.stringify(data)})});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {const detail=Array.isArray(body.detail)?body.detail.map(x=>x.msg).join('；'):body.detail;throw new Error(typeof detail==='string'?detail:'请求失败，请稍后重试');}
    return body;
  }
  function completed(task) {return !task.activeRun && !!task.lastRun && (task.cadence==='once' && !task.enabled || !!task.endDate && !task.nextAt && task.enabled);}
  function status(task) {
    if(task.sharedReadOnly)return '分享结果';
    if (task.activeRun) return task.lastRun?.status==='running'?'正在运行':'排队中';
    if (task.lastRun?.status==='failed') return '运行失败';
    if (completed(task)) return '已完成';
    if (!task.enabled) return '已暂停';
    return '活动';
  }
  function schedule(task) {
    const repeat = task.cadence==='weekly' ? '每周'+'一二三四五六日'[(task.weekdays || [0])[0]] : task.cadence==='monthly' ? `每月 ${task.monthDay || 1} 日` : cadences[task.cadence];
    const timing = task.timeMode==='fixed' ? `${task.time}（${zoneFor(task)==='America/New_York'?'美东时间':'北京时间'}）` : `${task.timeMode==='open'?'开盘':'收盘'}${task.offset<0?'前':'后'} ${Math.abs(task.offset)} 分钟`;
    return `${task.cadence==='once'?task.date:repeat} · ${timing}`;
  }
  function template(stage = 'pre', type = 'stocks', selectedMarket = market) {
    const asset = type==='watchlist'?'股票':assets[type];
    const questions = {
      pre:`结合最新隔夜市场、公告与今日事件，梳理{{market}}中{{symbols}}的${asset}盘前关注机会。按催化剂、观察指标和风险列出要点，注明数据时间；没有指定标的时分析全市场。`,
      live:`检查{{market}}中{{symbols}}的${asset}盘中表现，汇总价格、成交量与板块异动，分析可能原因与需要继续观察的信号。注明行情时间和延迟，不具备实时数据时明确说明。`,
      post:`复盘{{market}}中{{symbols}}的${asset}今日表现，说明涨跌驱动、市场强弱和重要事件，并列出下一交易日的关注清单。区分已确认事实与推测，注明数据时间。`
    };
    return {title:`${names[selectedMarket]}${type==='stocks'?'':assets[type]} · ${stages[stage]}`,market:selectedMarket,stage,assetType:type,symbols:'',question:questions[stage],cadence:'trading',date:'',endDate:'',weekdays:[0],monthDay:1,timeMode:stage==='live'?'fixed':stage==='pre'?'open':'close',offset:stage==='post'?15:-30,time:selectedMarket==='US'?'09:00':'08:30',timezone:'market',enabled:true,newChat:true,browser:false,serverchan:false,feishu:false,wecom:false};
  }
  function renderHome() {
    const info=markets.find(m=>m.market===market), stage=info?.stage || 'pre';
    $('dayMarketSelect').value=market;
    $('dayClock').textContent=info ? `${stages[stage]} · ${info.status} · ${dateText(new Date(Date.now()+serverDelta).toISOString(),info.zone)}` : '正在同步市场时间…';
    const rows=tasks.filter(t=>t.market===market && t.stage===stage && t.resultVersion);
    $('dayPanel').innerHTML=rows.length ? `<div class="dayGrid">${rows.map(t=>`<button class="dayCard dayResultCard" type="button" data-task-open="${t.id}" data-task-run="${t.resultVersion}"><span class="dayCardTop"><span>${esc(stages[t.stage])}</span><span>${dateText(t.successAt,zoneFor(t)).split(' ').slice(-1)[0]}</span></span><h3>${esc(t.title)}</h3><p class="daySummary">${esc(plainSummary(t.summary))}</p><span class="dayResultFoot">查看任务与结果 <span aria-hidden="true">↗</span></span></button>`).join('')}</div>` : `<p class="dayHomeEmpty">${esc(stages[stage])}尚无生成结果，任务完成后会显示在这里。</p>`;
  }
  function visibleTasks() {
    const query=$('taskSearch').value.trim().toLowerCase();
    return tasks.filter(t=>(filter==='all'||filter==='active'&&t.enabled&&!completed(t)||filter==='paused'&&!t.enabled&&!completed(t)||filter==='completed'&&completed(t))&&(!query||`${t.title} ${t.question}`.toLowerCase().includes(query)));
  }
  function taskRows(rows, sidebar=false) {
    return rows.map(t=>`<button type="button" class="taskListItem ${selectedId===t.id?'is-selected':''}" data-task-open="${t.id}" ${selectedId===t.id?'aria-current="true"':''}><span class="taskListIcon" aria-hidden="true">◷</span><span><strong>${esc(t.title)}</strong><small>${esc(status(t))} · ${esc(sidebar?(t.nextAt?'下次 '+dateText(t.nextAt,zoneFor(t)):schedule(t)):schedule(t))}</small></span><span class="taskListArrow" aria-hidden="true">${completed(t)?'✓':'›'}</span></button>`).join('');
  }
  function renderLists() {
    const rows=visibleTasks();
    if(sharedEntry && selectedId===sharedEntry.task.id && !tasks.some(t=>t.id===selectedId))rows.push({...sharedEntry.task,sharedReadOnly:true});
    $('taskSidebarList').innerHTML=taskRows(rows,true)||'<p class="taskListEmpty">暂无符合条件的任务</p>';
    $('taskLandingList').innerHTML=taskRows(rows)||'<p class="taskListEmpty">暂无符合条件的任务</p>';
    $('taskFilter').value=$('taskSidebarFilter').value=filter;
    $('taskRecommendations').innerHTML=Object.entries(stages).map(([key,label])=>`<button type="button" class="taskRecommendation" data-template="${key}"><span class="taskTemplateIcon" aria-hidden="true">${key==='pre'?'☀':key==='live'?'◉':'☾'}</span><span><strong>${label}</strong><small>${key==='pre'?'开盘前梳理事件、催化与关注清单':key==='live'?'定时检查异动、成交量和板块变化':'收盘后复盘市场与自选标的'}</small></span><span aria-hidden="true">＋</span></button>`).join('');
  }
  function writeUrl(taskId='', replace=false, keepShare=false, runId='') {
    const url=new URL(location.href);
    ['case','dayResult'].forEach(key=>url.searchParams.delete(key));
    if (!keepShare) url.searchParams.delete('dayShare');
    url.searchParams.set('tab','tasks');
    if(taskId)url.searchParams.set('task',taskId);else url.searchParams.delete('task');
    if(runId)url.searchParams.set('run',runId);else url.searchParams.delete('run');
    history[replace?'replaceState':'pushState']({tab:'tasks',task:taskId},'',url);
  }
  function shellMode(active) {
    document.querySelector('.shell').classList.toggle('tasks-view',active);
    workspace.hidden=!active;
    $('taskSidebar').hidden=!active;
    document.querySelector('.historyBlock').hidden=active&&!mobile();
    $('navHome').classList.toggle('is-selected',!active);$('navTasks').classList.toggle('is-selected',active);
    for(const [id,current] of [['navHome',!active],['navTasks',active]]){if(current)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');}
    if (mobile() && typeof setSidebarCollapsed==='function') setSidebarCollapsed(true);
  }
  function enterWorkspace() {
    if (workspace.hidden) {
      const entryUrl=location.href;
      internalNavigation=true;
      try {if(typeof startNewChat==='function')startNewChat(false,false);} finally {internalNavigation=false;}
      history.replaceState(history.state,'',entryUrl);
      shellMode(true);
    }
    if(typeof closeActivityDrawer==='function')closeActivityDrawer();
  }
  function showLanding(updateUrl=true) {
    enterWorkspace();selectedId='';selectedRun='';resultVersion='';viewVersion++;
    $('taskLanding').hidden=false;$('taskDetail').hidden=true;$('taskWizard').hidden=true;$('taskBack').hidden=true;$('taskTopActions').hidden=true;
    $('taskPageTitle').textContent='定时任务';message('','taskMessage');renderLists();
    if(updateUrl)writeUrl();
  }
  function prepareDetail(task, canEdit) {
    enterWorkspace();$('taskLanding').hidden=true;$('taskWizard').hidden=true;$('taskDetail').hidden=false;
    $('taskBack').hidden=false;$('taskTopActions').hidden=false;$('taskPageTitle').textContent=task.title;
    $('taskRunNow').hidden=$('taskToggle').hidden=!canEdit;
    $('taskRunNow').disabled=!!task.activeRun;$('taskRunNow').textContent=task.activeRun?'运行中…':'立即运行';
    $('taskToggle').textContent=completed(task)?'重新安排':task.enabled?'暂停':'开启';
    $('taskScheduleSummary').textContent=`${flags[task.market]} ${names[task.market]} · ${schedule(task)}`;
    renderLists();
  }
  async function paintRun(data, task, version) {
    if(version!==viewVersion)return;
    const container=$('taskThread');
    container.querySelectorAll('.streamvizArtifactHost').forEach(host=>window.AimeStreamViz?.unmount?.(host));
    container.replaceChildren();
    const date=document.createElement('p');date.className='taskRunDate';date.textContent=dateText(data.cachedDate,zoneFor(task));container.append(date);
    const question=document.createElement('div');question.className='taskUserBubble';question.textContent=data.question || task.question;container.append(question);
    const article=document.createElement('article');article.className='message assistant scheduledAnswer';article.dataset.lang='zh-CN';
    const settings=document.createElement('button');settings.type='button';settings.className='taskSettingsLink';settings.dataset.editTask='1';settings.textContent=task.title+' ›';settings.setAttribute('aria-label','定时任务设置：'+task.title);article.append(settings);
    const report=document.createElement('div');report.className='mixedReport';article.append(report);container.append(article);
    if (data.answer) {
      const answer=structuredClone(data.answer);article.activitySources=answer.sources || [];
      if(typeof renderMixedReportFlow==='function')await renderMixedReportFlow(article,answer,report,()=>{});
      else report.textContent=answer.interpretation || '';
    } else {
      report.innerHTML=`<p class="taskResultEmpty">${esc(data.error || (data.status==='running'?'正在云端执行，完成后会自动显示结果。':data.status==='queued'?'任务正在排队。':data.status==='success'?'这条旧记录未保留完整内容。新运行会保留近期对话结果。':'本次执行没有生成结果。'))}</p>`;
    }
  }
  async function selectTask(id, {updateUrl=true, runId='', shared=false}={}) {
    const task=tasks.find(t=>t.id===id) || (sharedEntry?.task.id===id?sharedEntry.task:null);
    if(!task)throw new Error('任务不存在，或当前浏览器没有该任务的访问权限');
    selectedId=id;selectedRun=runId;pinnedRun=!!runId;resultVersion='';const version=++viewVersion;
    prepareDetail(task,editable(task));lastDetailState=detailState(task);
    $('taskThread').innerHTML='<p class="taskResultEmpty" role="status">正在读取任务运行记录…</p>';
    if(updateUrl)writeUrl(id,false,shared,runId);
    if(!editable(task) && sharedEntry) {
      $('taskRunSelect').hidden=true;$('taskRunState').textContent='分享的运行结果 · 可查看任务设置';
      await paintRun(sharedEntry,task,version);return;
    }
    const response=await api('tasks/'+id+'/runs');if(version!==viewVersion)return;
    const runs=response.runs;
    $('taskRunSelect').hidden=!runs.length;
    $('taskRunSelect').innerHTML=runs.map(r=>`<option value="${r.id}">${esc(dateText(r.finished||r.created,zoneFor(task)))} · ${({success:'已完成',failed:'失败',queued:'排队中',running:'运行中'})[r.status]}</option>`).join('');
    if(!runs.length) {
      $('taskThread').innerHTML=`<div class="taskAwaiting"><span aria-hidden="true">◷</span><h2>任务已设置</h2><p>${esc(task.question)}</p><p>${task.nextAt?'首次执行：'+esc(dateText(task.nextAt,zoneFor(task))):'暂无运行记录，可以开启任务或立即运行。'}</p><button type="button" class="taskSettingsLink" data-edit-task="1">${esc(task.title)} ›</button></div>`;
      $('taskRunState').textContent=task.enabled?'已开启 · 云端将按计划执行':'任务已暂停';
      resultVersion=task.resultVersion;return;
    }
    const run=runs.find(r=>r.id===runId) || runs[0];selectedRun=run.id;$('taskRunSelect').value=run.id;
    $('taskRunState').textContent=task.activeRun?'任务正在云端运行，关闭页面也会继续。':task.lastRun?.status==='failed'?'最近一次执行失败，可切换查看上次成功结果。':!task.enabled&&!completed(task)?'任务已暂停，可查看已保存的运行结果。':task.nextAt?'下次执行：'+dateText(task.nextAt,zoneFor(task)):'已完成本次安排';
    const data=await api('tasks/'+id+'/runs/'+run.id);if(version!==viewVersion)return;
    resultVersion=task.resultVersion;await paintRun(data,task,version);
  }
  async function openShared(token) {
    const data=await api('shared/'+encodeURIComponent(token));
    sharedEntry={...data,task:{...data.task,id:data.taskId,resultVersion:data.runId,successAt:data.cachedDate}};
    selectedId=data.taskId;initialTask=null;
    await selectTask(data.taskId,{updateUrl:false,shared:true});
  }
  async function refresh() {
    if(busy)return;busy=true;
    try {
      const data=await api('tasks');tasks=data.tasks;markets=data.markets;publicKey=data.pushPublicKey;serverDelta=new Date(data.serverTime).getTime()-Date.now();lastRefresh=Date.now();
      renderHome();renderLists();
      if(initialTask){const id=initialTask;initialTask=null;await selectTask(id,{updateUrl:false,runId:initialRun});}
      else if(!workspace.hidden && selectedId) {
        const task=selected();
        if(task && editable(task)) {
          prepareDetail(task,true);
          if(detailState(task)!==lastDetailState) await selectTask(task.id,{updateUrl:false,runId:pinnedRun?selectedRun:''});
        }
      }
    } catch(error){message(error.message);} finally{busy=false;}
  }
  function updateFields(event) {
    if(!editing && ['assetType','stage','market'].includes(event?.target?.name)) {
      const suggestion=template(el('stage').value,el('assetType').value,el('market').value);
      if(el('question').value===suggestedQuestion){el('question').value=suggestion.question;suggestedQuestion=suggestion.question;}
      if(el('title').value===suggestedTitle){el('title').value=suggestion.title;suggestedTitle=suggestion.title;}
    }
    if(event?.target===el('repeat'))el('cadence').value=el('repeat').checked?'daily':'once';
    if(event?.target===el('cadence'))el('repeat').checked=el('cadence').value!=='once';
    if(event?.target===el('cadence') && el('cadence').value==='daily')el('timeMode').value='fixed';
    if(event?.target===el('timeMode') && el('timeMode').value!=='fixed' && el('cadence').value==='daily')el('cadence').value='trading';
    const cadence=el('cadence').value, relative=el('timeMode').value!=='fixed';
    $('dayDateLabel').hidden=cadence!=='once';el('date').required=cadence==='once';
    $('dayWeekLabel').hidden=cadence!=='weekly';$('dayMonthLabel').hidden=cadence!=='monthly';
    $('dayTimeLabel').hidden=relative;$('dayOffsetLabel').hidden=!relative;
    $('dayEndModeLabel').hidden=cadence==='once';$('dayEndLabel').hidden=cadence==='once'||el('endMode').value!=='date';
    el('endDate').required=!$('dayEndLabel').hidden;
    for(const [channel,id] of [['serverchan','dayServerchanFields'],['feishu','dayFeishuFields'],['wecom','dayWecomFields']])$(id).hidden=!el(channel).checked;
    $('dayNextPreview').textContent=relative?'跟随市场实际开收盘时间，自动处理夏令时与提前收盘。':`按${el('timezone').value==='market'&&el('market').value==='US'?'美东时间':'北京时间'} ${el('time').value} 执行。`;
  }
  function edit(task, readOnly=false) {
    editing=task.id || null;suggestedQuestion=task.question;suggestedTitle=task.title;
    form.reset();form.querySelectorAll('input,select,textarea').forEach(e=>e.disabled=false);
    for(const [name,value] of Object.entries(task)){const field=el(name);if(!field)continue;if(field.type==='checkbox')field.checked=!!value;else field.value=value??'';}
    el('repeat').checked=task.cadence!=='once';el('weekday').value=(task.weekdays||[0])[0];el('monthDay').value=task.monthDay||1;
    el('endMode').value=task.endDate?'date':'never';
    for(const name of ['feishuUrl','feishuSecret','wecomUrl','serverchanKey']){el(name).value='';el(name).placeholder=task[name+'Configured']?'已保存（留空沿用）':name==='serverchanKey'?'SCT 开头的 SendKey':name==='feishuSecret'?'可选的签名密钥':'填写官方机器人 Webhook 地址';}
    $('dayDialogTitle').textContent=readOnly?'定时任务设置':editing?'编辑任务':'设置定时任务';
    $('daySave').textContent=editing?'保存':'创建';$('daySave').hidden=readOnly;$('dayDelete').hidden=!editing||readOnly;
    $('dayDelete').disabled=!!task.activeRun;$('dayAdvanced').open=readOnly;
    $('dayEnablePush').hidden=readOnly;
    updateFields();
    if(readOnly)form.querySelectorAll('input,select,textarea').forEach(e=>e.disabled=true);
    if(!dialog.open)dialog.showModal();
    message(readOnly?'这是分享的运行结果。请在创建任务的浏览器中编辑任务。':'','dayDialogMessage');
    if(!readOnly)requestAnimationFrame(()=>el('title').focus());
  }
  function payload() {
    const data=Object.fromEntries(new FormData(form));
    for(const name of ['enabled','newChat','browser','serverchan','feishu','wecom'])data[name]=el(name).checked;
    data.offset=Number(data.offset);data.monthDay=Number(data.monthDay)||1;data.weekdays=[Number(data.weekday)||0];
    if(data.endMode==='never')data.endDate='';if(!el('repeat').checked)data.cadence='once';if(data.cadence==='once')data.endDate='';
    if(data.timeMode!=='fixed')data.timezone='market';
    return data;
  }
  function beginWizard(question) {
    showLanding(false);$('taskLanding').hidden=true;$('taskWizard').hidden=false;$('taskPageTitle').textContent='新建任务';$('taskBack').hidden=false;
    wizardStep=0;wizardDraft=template();
    if(/美股|美东|纳斯达克|AAPL|NVDA/i.test(question))wizardDraft.market='US';else if(/港股|恒生/.test(question))wizardDraft.market='HK';
    wizardDraft.assetType=/ETF/i.test(question)?'etf':/指数/.test(question)?'index':/板块|行业/.test(question)?'sector':/自选/.test(question)?'watchlist':'stocks';
    wizardDraft.stage=/盘后|收盘|复盘/.test(question)?'post':/盘中|异动|监控/.test(question)?'live':'pre';
    wizardDraft.timeMode='fixed';wizardDraft.time=wizardDraft.market==='US'?'09:00':'08:30';
    wizardDraft.cadence=/每月/.test(question)?'monthly':/每周/.test(question)?'weekly':/每天|每日/.test(question)?'daily':'trading';
    wizardDraft.question=question;wizardDraft.title=question.replace(/\{\{[^}]+\}\}/g,'').slice(0,24)||'我的定时分析';
    const time=question.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);if(time)wizardDraft.time=time[1].padStart(2,'0')+':'+time[2];
    wizardDraft.date=today();
    $('taskWizardTranscript').innerHTML=`<div class="taskUserBubble">${esc(question)}</div><div class="taskWizardReply">我会按你设置的时间自动执行，并把结果保存在这个任务中。先确认分析范围和执行安排。</div>`;
    writeUrl();renderWizard();
  }
  function collectWizard() {
    if(!wizardDraft)return;
    if($('wizardSymbols'))wizardDraft.symbols=$('wizardSymbols').value;
    if($('wizardCadence'))wizardDraft.cadence=$('wizardCadence').value;
    if($('wizardWeekday'))wizardDraft.weekdays=[Number($('wizardWeekday').value)];
    if($('wizardMonthDay'))wizardDraft.monthDay=Number($('wizardMonthDay').value)||1;
    if($('wizardDate'))wizardDraft.date=$('wizardDate').value;
    if($('wizardTime'))wizardDraft.time=$('wizardTime').value;
    if($('wizardTimezone'))wizardDraft.timezone=$('wizardTimezone').value;
  }
  function renderWizard() {
    $('wizardProgress').textContent=`第 ${wizardStep+1} / 3 步`;$('wizardPrevious').disabled=wizardStep===0;$('wizardError').textContent='';
    const d=wizardDraft;let content='';
    if(wizardStep===0)content=`<h2>这份分析关注哪个市场？</h2><div class="wizardOptions">${Object.keys(names).map(m=>`<button type="button" data-wizard-market="${m}" aria-pressed="${m===d.market}">${flags[m]} ${names[m]}<span>${m===d.market?'✓':''}</span></button>`).join('')}</div><label class="wizardField">关注标的${d.assetType==='watchlist'?'（自选列表必填）':'（可选）'}<input id="wizardSymbols" maxlength="500" placeholder="如 AAPL, NVDA；留空关注全市场" value="${esc(d.symbols)}" /></label>`;
    if(wizardStep===1)content=`<h2>希望多长时间运行一次？</h2><label class="wizardField">重复频率<select id="wizardCadence">${Object.entries(cadences).map(([k,v])=>`<option value="${k}" ${k===d.cadence?'selected':''}>${v}</option>`).join('')}</select></label>${d.cadence==='weekly'?`<label class="wizardField">每周哪一天<select id="wizardWeekday">${[...'一二三四五六日'].map((v,i)=>`<option value="${i}" ${i===d.weekdays[0]?'selected':''}>星期${v}</option>`).join('')}</select></label>`:d.cadence==='monthly'?`<label class="wizardField">每月几日<input id="wizardMonthDay" type="number" min="1" max="31" value="${d.monthDay}" /></label>`:d.cadence==='once'?`<label class="wizardField">执行日期<input id="wizardDate" type="date" required value="${d.date}" /></label>`:''}`;
    if(wizardStep===2)content=`<h2>希望在什么时间收到？</h2><div class="wizardOptions wizardTimeOptions">${(d.market==='US'?['09:00','12:00','16:30']:['08:30','12:00','16:30']).map(time=>`<button type="button" data-wizard-time="${time}" aria-pressed="${time===d.time}">${time}<span>${time===d.time?'✓':''}</span></button>`).join('')}</div><div class="dayFieldRow"><label class="wizardField">具体时间<input id="wizardTime" type="time" required value="${d.time}" /></label><label class="wizardField">时区<select id="wizardTimezone"><option value="market" ${d.timezone==='market'?'selected':''}>${d.market==='US'?'美东时间':'北京时间'}</option><option value="Asia/Shanghai" ${d.timezone==='Asia/Shanghai'?'selected':''}>中国标准时间</option></select></label></div><p class="wizardSummary">${esc(names[d.market])} · ${esc(schedule(d))}</p>`;
    $('wizardQuestion').innerHTML=content+`<div class="wizardActions">${wizardStep===2?'<button class="dayTextButton" type="button" id="wizardAdvanced">更多设置</button>':''}<button type="button" class="dayButton dayPrimary" id="wizardNext">${wizardStep===2?'创建并启用':'下一步'}</button></div>`;
  }
  async function saveDraft(data) {
    if(saving)return;saving=true;
    try{const task=await api('tasks','POST',data);tasks.push(task);wizardDraft=null;renderHome();await selectTask(task.id);message('定时任务已创建并启用。','taskMessage');}
    finally{saving=false;}
  }
  async function enablePush() {
    if(!window.isSecureContext || !('serviceWorker'in navigator) || !('PushManager'in window))throw new Error('当前浏览器不支持推送，请使用 HTTPS 下的 Chrome');
    if(await Notification.requestPermission()!=='granted')throw new Error('请在浏览器网站设置中允许通知');
    const swUrl=new URL('/api/day/service-worker.js',location.origin),scope=swUrl.pathname.replace(/api\/day\/service-worker\.js$/,'');
    const registration=await navigator.serviceWorker.register(swUrl.href,{scope});await navigator.serviceWorker.ready;
    const padded=publicKey+'='.repeat((4-publicKey.length%4)%4),key=Uint8Array.from(atob(padded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await api('subscriptions','POST',subscription.toJSON());el('browser').checked=true;$('dayPushState').textContent='当前浏览器已订阅。保存后生效，电脑关机期间不会弹窗。';
  }
  async function toggleTask(task) {await api('tasks/'+task.id,'PUT',{...task,enabled:!task.enabled});await refresh();message(task.enabled?'已暂停后续执行，已有结果仍保留。':'任务已开启。','taskMessage');}
  function newTask() {enterWorkspace();if(mobile())beginWizard($('taskPrompt').value.trim()||template().question);else edit(template());}
  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    try {
      if(b.dataset.taskOpen){await selectTask(b.dataset.taskOpen,{runId:b.dataset.taskRun||''});return;}
      if(b.dataset.template){const d=template(b.dataset.template);if(mobile())beginWizard(d.question);else edit(d);return;}
      if(b.dataset.editTask){const task=selected();if(task)edit(task,!editable(task));return;}
      if(b.dataset.wizardMarket){collectWizard();wizardDraft.market=b.dataset.wizardMarket;renderWizard();return;}
      if(b.dataset.wizardTime){collectWizard();wizardDraft.time=b.dataset.wizardTime;renderWizard();return;}
      switch(b.id){
        case'navTasks':case'railTasks':showLanding();break;
        case'navHome':case'railHome':if(typeof startNewChat==='function')startNewChat(false,false);break;
        case'taskBack':case'wizardClose':showLanding();break;
        case'taskSidebarNew':case'taskOpenCreate':newTask();break;
        case'taskSettings':if(selected())edit(selected(),!editable(selected()));break;
        case'taskToggle':if(completed(selected())){edit(selected());break;}b.disabled=true;await toggleTask(selected());b.disabled=false;break;
        case'taskRunNow':b.disabled=true;await api('tasks/'+selectedId+'/run','POST');pinnedRun=false;await refresh();await selectTask(selectedId,{updateUrl:false});message('任务已提交到云端，关闭页面后仍会执行。','taskMessage');break;
        case'wizardPrevious':collectWizard();wizardStep=Math.max(0,wizardStep-1);renderWizard();break;
        case'wizardAdvanced':collectWizard();edit(wizardDraft);break;
        case'wizardNext':collectWizard();if(wizardStep===0&&wizardDraft.assetType==='watchlist'&&!wizardDraft.symbols.trim())throw new Error('请填写自选列表中的具体标的');if(wizardStep<2){wizardStep++;renderWizard();}else{if(!$('wizardTime').value)throw new Error('请选择执行时间');b.disabled=true;try{await saveDraft({...wizardDraft,enabled:true});}finally{b.disabled=false;}}break;
      }
    }catch(error){if(!workspace.hidden&& !$('taskWizard').hidden)$('wizardError').textContent=error.message;else message(error.message);b.disabled=false;}
  });
  $('taskPromptForm').addEventListener('submit',e=>{e.preventDefault();const question=$('taskPrompt').value.trim();if(question)beginWizard(question);});
  $('taskSearch').addEventListener('input',renderLists);
  for(const id of ['taskFilter','taskSidebarFilter'])$(id).addEventListener('change',e=>{filter=e.target.value;renderLists();});
  $('taskRunSelect').addEventListener('change',async e=>{try{await selectTask(selectedId,{runId:e.target.value});}catch(error){message(error.message);}});
  $('wizardQuestion').addEventListener('change',e=>{collectWizard();if(e.target.id==='wizardCadence')renderWizard();});
  $('dayMarketSelect').addEventListener('change',e=>{market=e.target.value;try{localStorage.setItem('veya-day-market',market);}catch{}renderHome();});
  $('dayClose').onclick=$('dayCancelEdit').onclick=()=>dialog.close();
  form.addEventListener('change',updateFields);
  $('dayEnablePush').onclick=async()=>{const b=$('dayEnablePush');b.disabled=true;try{await enablePush();}catch(error){$('dayPushState').textContent=error.message;}finally{b.disabled=false;}};
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(saving)return;saving=true;$('daySave').disabled=true;
    try{const task=await api('tasks'+(editing?'/'+editing:''),editing?'PUT':'POST',payload());tasks=tasks.filter(t=>t.id!==task.id);tasks.push(task);dialog.close();wizardDraft=null;renderHome();await selectTask(task.id);message(task.enabled?'任务已保存，云端会按时运行。':'任务已保存为暂停状态。','taskMessage');}
    catch(error){message(error.message,'dayDialogMessage');}finally{saving=false;$('daySave').disabled=false;}
  });
  $('dayDelete').onclick=async()=>{const b=$('dayDelete');b.disabled=true;try{await api('tasks/'+editing,'DELETE');tasks=tasks.filter(t=>t.id!==editing);dialog.close();showLanding();renderHome();message('任务已删除。','taskMessage');}catch(error){message(error.message,'dayDialogMessage');}finally{b.disabled=false;}};
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  window.addEventListener('veya:chat-navigate',()=>{if(internalNavigation)return;shellMode(false);viewVersion++;selectedId='';const url=new URL(location.href);['tab','task','run','dayResult','dayShare'].forEach(k=>url.searchParams.delete(k));history.replaceState(null,'',url);});
  window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);if(p.get('dayShare'))openShared(p.get('dayShare')).catch(e=>message(e.message));else if(p.get('tab')==='tasks'){if(p.get('task'))selectTask(p.get('task'),{updateUrl:false,runId:p.get('run')||''}).catch(e=>message(e.message));else showLanding(false);}else shellMode(false);});
  window.matchMedia('(max-width: 760px)').addEventListener?.('change',()=>{if(!workspace.hidden)shellMode(true);});
  if(initial.get('tab')==='tasks'||initialTask)showLanding(false);
  if(initialShare)openShared(initialShare).catch(error=>{showLanding(false);message(error.message,'taskMessage');});
  refresh();
  setInterval(()=>{if(!document.hidden&&Date.now()-lastRefresh>15000)refresh();},5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
