(() => {
  const $ = id => document.getElementById(id);
  const home = $('myDay'), workspace = $('taskWorkspace'), form = $('dayForm'), dialog = $('dayDialog');
  if (!home || !workspace) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages = {pre:'盘前机会',live:'盘中监控',post:'收盘回顾'};
  const assets = {stocks:'股票',etf:'ETF',index:'指数',sector:'行业板块',watchlist:'自选列表'};
  const names = {CN:'A股',HK:'港股',US:'美股'}, flags = {CN:'🇨🇳',HK:'🇭🇰',US:'🇺🇸'};
  const zones = {CN:'Asia/Shanghai',HK:'Asia/Hong_Kong',US:'America/New_York'};
  const cadences = {trading:'交易日',daily:'每天',weekdays:'工作日',weekly:'每周',monthly:'每月',custom:'自定义',once:'指定日期一次'};
  const recommendations = [
    {id:'morning',icon:'🌅',title:'隔夜市场与今日大事',stage:'pre',type:'index',time:'09:00',description:'开盘前汇总隔夜欧美市场、宏观日历和重要催化，列出今日观察清单。',question:'在交易日开盘前，整理{{market}}隔夜市场简报：对比欧美主要指数与重要宏观事件，梳理今日经济数据、政策与行业催化，列出需要观察的指标和风险。关注{{symbols}}，未指定时覆盖主要指数。注明来源与数据时间，区分事实与推测。'},
    {id:'announcements',icon:'🗓️',title:'自选股公告与财报提醒',stage:'pre',type:'watchlist',time:'09:00',description:'每天开盘前检查自选股公告、财报日期与重大新闻，标出值得关注的变化。',question:'在每个交易日开盘前，检查{{market}}自选股{{symbols}}自上一交易日收盘以来的公告、财报披露、业绩预告与重大新闻，并列出未来七天已确认的财报日期。逐一注明事件时间、来源、潜在影响与待核实事项；没有新变化时简要说明，不编造事件。'},
    {id:'intraday',icon:'📊',title:'上午指数与量能观察',stage:'live',type:'index',time:'10:30',description:'交易日 10:30 检查主要指数、成交量和市场涨跌分布，解释盘中异动。',question:'每个交易日当地时间10:30，检查{{market}}主要指数及{{symbols}}的盘中表现，比较涨跌幅、成交量与历史同期水平，观察上涨下跌家数、领涨领跌方向和异常变化。区分数据事实与可能原因，列出后续观察信号；明确行情时间、延迟和缺失信息。'},
    {id:'sectors',icon:'🔎',title:'午后行业与 ETF 强弱追踪',stage:'live',type:'etf',time:'14:00',description:'交易日 14:00 对比行业与 ETF 的涨跌、量能和相对强弱，跟踪热点变化。',question:'每个交易日当地时间14:00，比较{{market}}行业与ETF的盘中涨跌、量能和相对大盘强弱，优先覆盖{{symbols}}，未指定时选取有可靠行情的代表性行业ETF。梳理强弱方向、热点轮动和可能催化，说明筛选口径、行情时间与数据限制，不将成交量直接当作资金净流入。'},
    {id:'closing',icon:'🌇',title:'收盘复盘与明日关注',stage:'post',type:'index',description:'收盘后复盘指数、市场广度和行业表现，整理下一交易日的事件与风险。',question:'在{{market}}收盘后生成一份复盘：覆盖主要指数、市场广度、成交量、行业强弱与重要新闻，关注{{symbols}}，未指定时覆盖全市场。解释今日变化并区分已确认驱动与推测，整理下一交易日已确认事件、观察指标和风险。注明行情日期与数据时间，尚无收盘数据时明确说明。'},
    {id:'watchlist',icon:'📋',title:'自选股每日跟踪',stage:'post',type:'watchlist',description:'收盘后逐只回顾自选股的价格、量能与新闻变化，形成持续跟踪记录。',question:'每个交易日收盘后，逐只跟踪{{market}}自选股{{symbols}}的收盘价、当日涨跌、成交量变化、公告和可靠新闻。用简洁表格对比，解释值得关注的变化，列出后续事件与风险；明确数据时间及缺失项。不把本次记录当作实时行情，也不预设用户的持仓与交易意图。'}
  ];
  function recommendedTask(item) {
    return {...template(item.stage,item.type),title:item.title,question:item.question,timeMode:'fixed',time:item.time||(market==='CN'?'15:30':'16:30'),timezone:'market'};
  }
  const el = name => form.elements.namedItem(name);
  const mobile = () => window.matchMedia('(max-width: 760px)').matches;
  let market = 'CN'; try { market = localStorage.getItem('veya-day-market') || 'CN'; } catch {}
  if (!names[market]) market = 'CN';
  let tasks = [], markets = [], publicKey = '', serverDelta = 0, busy = false, lastRefresh = 0;
  let selectedId = '', selectedRun = '', pinnedRun = false, sharedEntry = null, resultVersion = '', viewVersion = 0;
  let lastDetailState = '';
  let sidebarExpanded = false;
  let chatHistory = [], chatKey = '', chatController = null;
  let taskImages = [], answerSequence = 0;
  function renderTaskImages(){const preview=$('taskAttachmentPreview');preview.hidden=!taskImages.length;preview.innerHTML=taskImages.map((image,i)=>`<div class="attachmentThumb"><img src="${esc(image.dataUrl)}" alt="${esc(image.name)}"/><button type="button" class="attachmentRemove" data-remove-task-image="${i}" aria-label="移除图片">×</button></div>`).join('');preview.closest('.composerBox').classList.toggle('has-attachments',!!taskImages.length);updateChatComposer();}
  async function addTaskImages(files){try{for(const file of Array.from(files||[])){if(taskImages.length>=6)break;if(!file.type.startsWith('image/'))continue;if(file.size>8*1024*1024)throw new Error('单张图片不能超过 8 MB');const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file);});taskImages.push({name:file.name,mimeType:file.type,dataUrl});}renderTaskImages();}catch(error){$('taskChatError').textContent=error.message;}}
  function stopFollowup() {chatController?.abort();chatController=null;}
  function resetFollowup() {stopFollowup();chatHistory=[];chatKey='';taskImages=[];renderTaskImages();$('taskFollowups').replaceChildren();$('taskChatError').textContent='';$('taskChatInput').value='';updateChatComposer();$('taskChatSend').disabled=true;}
  function renderTaskUser(text, images, target, task=null) {
    const article=document.createElement('article');target.append(article);
    if(typeof renderUserMessage==='function')renderUserMessage(article,text,images||[],{allowEdit:!!task&&editable(task),onEdit:()=>edit(task)});
    else {article.className='message user';const bubble=document.createElement('div');bubble.className='bubble userBubble';bubble.textContent=text;for(const image of images||[]){const img=document.createElement('img');img.src=image.dataUrl;img.alt=image.name||'附图';bubble.append(img);}article.append(bubble);}
    return article;
  }
  async function renderTaskAnswer(article, answer, question) {
    article.dataset.lang=typeof detectLanguage==='function'?detectLanguage(question):'zh-CN';
    article.shareSession={...answer,id:`task-${selectedId}-${selectedRun||'setup'}-${Date.now()}-${++answerSequence}`,title:selected()?.title||'定时任务',question,messages:[{role:'user',text:question}]};
    if(typeof renderSavedAssistantAnswer==='function')await renderSavedAssistantAnswer(article,answer,{question,thinkingElapsed:answer.thinkingElapsed,thinkingLabel:answer.thinkingElapsed>0?'已思考 '+formatDuration(answer.thinkingElapsed):'查看执行记录'});
    else {const bubble=document.createElement('div');bubble.className='bubble assistantBubble';const report=document.createElement('div');report.className='mixedReport';bubble.append(report);article.append(bubble);if(typeof renderMixedReportFlow==='function')await renderMixedReportFlow(article,answer,report,()=>{});else report.textContent=answer.interpretation||'';}
  }
  async function renderFollowup(turn, target=$('taskFollowups')) {
    if(turn.role==='user')return renderTaskUser(turn.text,turn.images,target);
    const article=document.createElement('article');article.className='message assistant taskChatAnswer';target.append(article);
    await renderTaskAnswer(article,structuredClone(turn.answer||{interpretation:turn.text}),chatHistory.filter(t=>t.role==='user').at(-1)?.text||'');
    return article;
  }
  async function loadFollowups(data, task, version) {
    const initialText=String(data.answer?.interpretation||'');
    chatHistory=[{role:'user',text:data.question||task.question},{role:'assistant',text:initialText||`任务已设置：${task.title}，${schedule(task)}。`}];
    chatKey=`veya-task-chat:${task.id}:${selectedRun||data.runId||task.resultVersion||'setup'}`;
    let turns=[];try{turns=JSON.parse(localStorage.getItem(chatKey)||'[]');if(!Array.isArray(turns))turns=[];}catch{}
    for(const turn of turns.slice(-20)){if(version!==viewVersion)return;if(!['user','assistant'].includes(turn.role)||typeof turn.text!=='string')continue;chatHistory.push(turn);await renderFollowup(turn);}
    $('taskChatSend').disabled=false;
  }
  async function sendFollowup(event) {
    event.preventDefault();const text=$('taskChatInput').value.trim()||(taskImages.length?'请结合图片继续分析':'');if(!text||chatController||!selectedId||!chatKey)return;
    const images=taskImages.slice();taskImages=[];renderTaskImages();
    const controller=new AbortController(),version=viewVersion,key=chatKey,prior=chatHistory.slice(-10).map(({role,text,images})=>({role,text,...(images?.length?{images}:{})}));chatController=controller;
    $('taskChatInput').value='';updateChatComposer();$('taskChatSend').disabled=true;$('taskChatError').textContent='';
    const user={role:'user',text,...(images.length?{images}:{})},userNode=await renderFollowup(user);const waiting=document.createElement('p');waiting.className='taskResultEmpty';waiting.textContent='正在分析…';$('taskFollowups').append(waiting);waiting.scrollIntoView?.({block:'nearest'});
    let answer=null,streamError='';
    try {
      const response=await fetch('/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({question:text,images,history:prior,sessionTitle:selected()?.title||'定时任务追问',reasoningFramework:typeof DEFAULT_REASONING_FRAMEWORK==='string'?DEFAULT_REASONING_FRAMEWORK:'deepseek',inferenceModel:typeof DEFAULT_INFERENCE_MODEL==='string'?DEFAULT_INFERENCE_MODEL:'',themeMode:document.documentElement.dataset.theme==='dark'?'dark':'light'})});
      if(!response.ok||!response.body){const error=await response.json().catch(()=>({}));throw new Error(error.detail||'请求失败，请重试');}
      await readEventStream(response.body,(event,data)=>{if(event==='final')answer=data;if(event==='error')streamError=data.detail||data.message||'分析失败';});
      if(controller.signal.aborted||version!==viewVersion)return;
      if(!answer)throw new Error(streamError||'本次没有返回结果，请重试');
      waiting.remove();const turn={role:'assistant',text:answer.interpretation||'',answer};chatHistory.push(user,turn);await renderFollowup(turn);
      try{localStorage.setItem(key,JSON.stringify(chatHistory.slice(chatHistory[1]?.role==='assistant'?2:0).slice(-20)));}catch{$('taskChatError').textContent='当前浏览器无法保存追问记录，刷新后可能丢失。';}
    } catch(error) {if(!controller.signal.aborted&&version===viewVersion){waiting.remove();userNode.remove();$('taskChatError').textContent=error.message;$('taskChatInput').value=text;taskImages=images;renderTaskImages();}}
    finally{if(chatController===controller){chatController=null;$('taskChatSend').disabled=false;}}
  }
  const detailState = t => JSON.stringify([t.resultVersion,t.activeRun,t.lastRun?.status,t.enabled,t.nextAt,t.title,t.question,t.cadence,t.time,t.timezone,t.weekdays,t.monthDay]);
  let editing = null, suggestedQuestion = '', suggestedTitle = '', filter = 'all', internalNavigation = false;
  let originalQuestionTemplate = '', originalVisibleQuestion = '';
  let wizardDraft = null, wizardStep = 0, saving = false;
  const creationRecords=new Map();
  function creationRecord(id){if(creationRecords.has(id))return creationRecords.get(id);try{const record=JSON.parse(localStorage.getItem('veya-task-created:'+id)||'null');if(record&&Array.isArray(record.answers)){creationRecords.set(id,record);return record;}}catch{}return null;}
  function rememberCreation(id,record){creationRecords.set(id,record);try{localStorage.setItem('veya-task-created:'+id,JSON.stringify(record));}catch{}}
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
  function completed(task) {return !task.activeRun && task.lastRun?.status==='success' && (task.cadence==='once' && !task.enabled || !!task.endDate && !task.nextAt && task.enabled);}
  function status(task) {
    if(task.sharedReadOnly)return '分享结果';
    if (task.activeRun) return task.lastRun?.status==='running'?'正在运行':'排队中';
    if (task.lastRun?.status==='failed') return '运行失败';
    if (completed(task)) return '已完成';
    if (!task.enabled) return '已暂停';
    return '活动';
  }
  function schedule(task) {
    const repeat = task.cadence==='custom' ? '每周'+(task.weekdays||[0]).map(d=>'一二三四五六日'[d]).join('、') : task.cadence==='weekly' ? '每周'+'一二三四五六日'[(task.weekdays || [0])[0]] : task.cadence==='monthly' ? `每月 ${task.monthDay || 1} 日` : cadences[task.cadence];
    const zone=zoneFor(task),zoneName=zone==='America/New_York'?'美东时间':['Asia/Shanghai','Asia/Hong_Kong'].includes(zone)?'北京时间':zone;
    const timing = task.timeMode==='fixed' ? `${task.time}（${zoneName}）` : `${task.timeMode==='open'?'开盘':'收盘'}${task.offset<0?'前':'后'} ${Math.abs(task.offset)} 分钟`;
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
  function sidebarDate(value, task, includeTime=true, relative=true) {
    if(!value||!Number.isFinite(new Date(value).getTime()))return '';
    const zone=zoneFor(task),parts=date=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
    const d=parts(new Date(value)),now=parts(new Date(Date.now()+serverDelta));
    const day=n=>Date.UTC(Number(n.year),Number(n.month)-1,Number(n.day));
    const delta=Math.round((day(d)-day(now))/86400000);
    const label=includeTime&&relative&&delta===0?'今天':includeTime&&relative&&delta===1?'明天':`${d.year!==now.year?d.year+'年':''}${Number(d.month)}月${Number(d.day)}日`;
    const clock=relative?`${Number(d.hour)}${Number(d.minute)?':'+d.minute:'时'}`:`${String(d.hour).padStart(2,'0')}:${d.minute}`;
    return includeTime?`${label} ${clock}`:label;
  }
  function compactSchedule(task) {
    const time=task.timeMode==='fixed'?String(task.time||'').replace(/^0/,''): `${task.timeMode==='open'?'开盘':'收盘'}${task.offset<0?'前':'后'}${Math.abs(task.offset)}分钟`;
    const repeat=task.cadence==='weekly'?'每周'+'一二三四五六日'[(task.weekdays||[0])[0]]:task.cadence==='custom'?'每周'+(task.weekdays||[0]).map(d=>'一二三四五六日'[d]).join('、'):cadences[task.cadence]||'';
    return task.cadence==='once'?'仅一次':`${repeat}${time?' '+time:''}`;
  }
  function taskSubtitle(task) {
    if(task.sharedReadOnly)return '分享结果 · '+compactSchedule(task);
    if(task.activeRun)return task.lastRun?.status==='running'?(task.stage==='live'?'监控中':'正在运行'):'排队中';
    if(completed(task))return '已完成'+(task.lastRun?.finished||task.successAt?' · '+sidebarDate(task.lastRun?.finished||task.successAt,task,true,false):'');
    if(task.cadence==='once'&&task.lastRun?.status==='failed')return '运行失败'+(task.lastRun.finished?' · '+sidebarDate(task.lastRun.finished,task,true,false):'');
    if(!task.enabled)return '已暂停 · '+compactSchedule(task);
    const next=sidebarDate(task.nextAt,task,!['monthly','weekly','custom'].includes(task.cadence));
    const repeat=task.cadence==='monthly'?'每月':task.cadence==='once'?'仅一次':compactSchedule(task);
    const timing=next?`${next} · ${repeat}`:'等待执行 · '+repeat;
    return (task.lastRun?.status==='failed'?'运行失败 · ':'')+timing;
  }
  function taskRows(rows, sidebar=false) {
    return rows.map(t=>`<div class="taskListRow"><button type="button" class="taskListItem ${selectedId===t.id?'is-selected':''} ${completed(t)?'is-completed':!t.enabled?'is-paused':''}" data-task-open="${t.id}" ${selectedId===t.id?'aria-current="true"':''}><span class="taskListIcon" aria-hidden="true">◷</span><span><strong>${esc(t.title)}</strong><small>${esc(taskSubtitle(t))}</small></span>${completed(t)?'<span class="taskListComplete" aria-label="已完成"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg></span>':'<span class="taskListArrow" aria-hidden="true">›</span>'}</button><button type="button" class="taskMoreButton" data-task-more="${esc(t.id)}" aria-label="更多：${esc(t.title)}" aria-haspopup="menu" aria-expanded="false" aria-controls="taskMoreMenu"><svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M288 512a74.666667 74.666667 0 1 1-149.333333 0 74.666667 74.666667 0 0 1 149.333333 0zM512 437.333333a74.666667 74.666667 0 1 1 0 149.333334 74.666667 74.666667 0 0 1 0-149.333334zM885.333333 512a74.666667 74.666667 0 1 0-149.333333 0 74.666667 74.666667 0 0 0 149.333333 0z"/></svg></button></div>`).join('');
  }
  function renderLists() {
    closeTaskMenu();
    const rows=visibleTasks();
    if(sharedEntry && selectedId===sharedEntry.task.id && !tasks.some(t=>t.id===selectedId))rows.push({...sharedEntry.task,sharedReadOnly:true});
    $('taskSidebarList').innerHTML=taskRows(sidebarExpanded?rows:rows.slice(0,5),true)||'<p class="taskListEmpty">暂无符合条件的任务</p>';
    $('taskSidebarExpand').hidden=rows.length<=5;
    $('taskSidebarExpand').textContent=sidebarExpanded?'收起显示':'展开显示';
    $('taskSidebarSectionTitle').textContent={all:'即将执行',active:'活动任务',paused:'已暂停',completed:'已完成'}[filter];
    $('taskLandingList').innerHTML=taskRows(rows)||'<p class="taskListEmpty">暂无符合条件的任务</p>';
    $('taskFilter').value=$('taskSidebarFilter').value=filter;
    $('taskRecommendations').innerHTML=recommendations.map(item=>`<button type="button" class="taskRecommendation" data-recommendation="${item.id}"><span class="taskTemplateIcon" aria-hidden="true">${item.icon}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.description)}</small></span><span aria-hidden="true">＋</span></button>`).join('');
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
    if(!active)stopFollowup();
    document.querySelector('.shell').classList.toggle('tasks-view',active);
    workspace.hidden=!active;
    $('taskSidebar').hidden=!active;
    document.querySelector('.historyBlock').hidden=active&&!mobile();
    $('navHome').classList.toggle('is-selected',!active);$('navTasks').classList.toggle('is-selected',active);
    $('railHome').classList.toggle('is-active',!active);$('railTasks').classList.toggle('is-active',active);
    for(const [id,current] of [['navHome',!active],['navTasks',active],['railHome',!active],['railTasks',active]]){if(current)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');}
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
    resetFollowup();$('taskChatForm').hidden=true;
    enterWorkspace();selectedId='';selectedRun='';resultVersion='';viewVersion++;
    $('taskLanding').hidden=false;$('taskDetail').hidden=true;$('taskWizard').hidden=true;$('taskBack').hidden=true;$('taskTopActions').hidden=true;
    $('taskPageTitle').textContent='定时任务';message('','taskMessage');renderLists();
    if(updateUrl)writeUrl();
  }
  function prepareDetail(task, canEdit) {
    enterWorkspace();$('taskLanding').hidden=true;$('taskWizard').hidden=true;$('taskDetail').hidden=false;
    $('taskBack').hidden=false;$('taskTopActions').hidden=false;$('taskPageTitle').textContent=task.title;
    $('taskInfoCard').hidden=!task.lastRun&&!task.resultVersion;
    $('taskRunNow').hidden=$('taskToggle').hidden=!canEdit;
    $('taskRunNow').disabled=!!task.activeRun;$('taskRunNow').textContent=task.activeRun?'运行中…':'立即运行';
    $('taskToggle').textContent=completed(task)?'重新安排':task.enabled?'暂停':'开启';
    $('taskScheduleSummary').textContent=`${flags[task.market]} ${names[task.market]} · ${schedule(task)}`;
    $('taskCardTitle').textContent=task.title+' ›';$('taskCardStatus').textContent=canEdit?status(task):'分享结果';$('taskChatForm').hidden=false;
    renderLists();
  }
  async function paintRun(data, task, version) {
    if(version!==viewVersion)return;
    $('taskInfoCard').hidden=false;
    const container=$('taskThread');
    container.querySelectorAll('.streamvizArtifactHost').forEach(host=>window.AimeStreamViz?.unmount?.(host));
    container.replaceChildren();
    renderTaskUser(data.question||task.question,[],container,task);
    const article=document.createElement('article');article.className='message assistant';container.append(article);
    if(data.answer)await renderTaskAnswer(article,structuredClone(data.answer),data.question||task.question);
    else {const text=document.createElement('p');text.className='taskResultEmpty';text.textContent=data.error||(data.status==='running'?'正在云端执行，完成后会自动显示结果。':data.status==='queued'?'任务正在排队。':data.status==='success'?'这条旧记录未保留完整内容。新运行会保留近期对话结果。':'本次执行没有生成结果。');article.append(text);}
    if(version===viewVersion)await loadFollowups(data,task,version);
  }
  async function selectTask(id, {updateUrl=true, runId='', shared=false}={}) {
    const task=tasks.find(t=>t.id===id) || (sharedEntry?.task.id===id?sharedEntry.task:null);
    if(!task)throw new Error('任务不存在，或当前浏览器没有该任务的访问权限');
    resetFollowup();selectedId=id;selectedRun=runId;pinnedRun=!!runId;resultVersion='';const version=++viewVersion;
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
      renderCreatedTask(task);
      $('taskRunState').textContent=task.enabled?'已开启 · 云端将按计划执行':'任务已暂停';
      resultVersion=task.resultVersion;
      await loadFollowups({question:task.question,answer:{interpretation:`任务已${task.enabled?'创建并启用':'暂停'}：${task.title}。执行安排：${schedule(task)}。${task.nextAt?'首次执行：'+dateText(task.nextAt,zoneFor(task)):''}。任务内容：${task.question}`}},task,version);return;
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
    if(busy||!taskMenu.hidden)return;busy=true;
    try {
      const data=await api('tasks');tasks=data.tasks;markets=data.markets;publicKey=data.pushPublicKey;serverDelta=new Date(data.serverTime).getTime()-Date.now();lastRefresh=Date.now();
      renderHome();renderLists();
      if(initialTask){const id=initialTask;initialTask=null;await selectTask(id,{updateUrl:false,runId:initialRun});}
      else if(!workspace.hidden && selectedId) {
        const task=selected();
        if(task && editable(task)) {
          prepareDetail(task,true);
          if(!chatController&&detailState(task)!==lastDetailState) await selectTask(task.id,{updateUrl:false,runId:pinnedRun?selectedRun:''});
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
    if(event?.target===el('cadence'))el('timeMode').value='fixed';
    if(event?.target===el('timeMode') && el('timeMode').value!=='fixed' && el('cadence').value==='daily')el('cadence').value='trading';
    const cadence=el('cadence').value, relative=el('timeMode').value!=='fixed';
    $('dayCadenceLabel').hidden=!el('repeat').checked;
    $('dayDateLabel').hidden=el('repeat').checked;el('date').required=!el('repeat').checked;
    $('dayCustomLabel').hidden=cadence!=='custom';
    $('dayWeekLabel').hidden=cadence!=='weekly';$('dayMonthLabel').hidden=cadence!=='monthly';
    $('dayTimeLabel').hidden=false;$('dayOffsetLabel').hidden=true;
    $('dayEndModeLabel').hidden=cadence==='once';$('dayEndLabel').hidden=cadence==='once'||el('endMode').value!=='date';
    el('endDate').required=!$('dayEndLabel').hidden;
    for(const [channel,id] of [['serverchan','dayServerchanFields'],['feishu','dayFeishuFields'],['wecom','dayWecomFields']])$(id).hidden=!el(channel).checked;
    $('dayNextPreview').textContent=relative?'跟随市场实际开收盘时间，自动处理夏令时与提前收盘。':`按${el('timezone').value==='market'&&el('market').value==='US'?'美东时间':'北京时间'} ${el('time').value} 执行。`;
    window.VeyaTaskEditor?.sync();
  }
  function edit(task, readOnly=false) {
    editing=task.id || null;suggestedQuestion=task.question;suggestedTitle=task.title;
    form.reset();form.querySelectorAll('input,select,textarea').forEach(e=>e.disabled=false);
    for(const [name,value] of Object.entries(task)){const field=el(name);if(!field)continue;if(field.type==='checkbox')field.checked=!!value;else field.value=value??'';}
    originalQuestionTemplate=task.question;
    originalVisibleQuestion=String(task.question).replace(/\{\{market\}\}/g,names[task.market]||'所选市场').replace(/\{\{symbols\}\}/g,task.symbols||'全市场').replace(/\{\{date\}\}/g,'执行当天');
    el('question').value=originalVisibleQuestion;
    if(task.timeMode!=='fixed'&&task.nextAt)el('time').value=new Intl.DateTimeFormat('en-GB',{timeZone:zoneFor(task),hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(task.nextAt));
    el('timeMode').value='fixed';el('date').value=task.date||today();
    for(const channel of ['serverchan','feishu','wecom'])el(channel).checked=false;
    el('repeat').checked=task.cadence!=='once';el('weekday').value=(task.weekdays||[0])[0];el('monthDay').value=task.monthDay||1;
    el('endMode').value=task.endDate?'date':'never';
    for(const name of ['feishuUrl','feishuSecret','wecomUrl','serverchanKey']){el(name).value='';el(name).placeholder=name==='serverchanKey'?'输入 SCT 开头的 SendKey':name==='feishuSecret'?'可选的签名密钥':'输入飞书机器人 Webhook';}
    $('dayDialogTitle').textContent=readOnly?'定时任务设置':editing?'编辑任务':'设置定时任务';
    $('daySave').textContent=editing?'保存':'创建';$('daySave').hidden=readOnly;
    $('dayAdvanced').open=false;
    $('dayEnablePush').hidden=readOnly;
    updateFields();
    if(readOnly)form.querySelectorAll('input,select,textarea').forEach(e=>e.disabled=true);
    window.VeyaTaskEditor?.reset(task,readOnly);
    if(!dialog.open)dialog.showModal();
    dialog.querySelector('.dayDialogBody').scrollTop=0;
    message(readOnly?'这是分享的运行结果。请在创建任务的浏览器中编辑任务。':'','dayDialogMessage');
    if(!readOnly)requestAnimationFrame(()=>el('title').focus({preventScroll:true}));
  }
  function payload() {
    const data=Object.fromEntries(new FormData(form));
    for(const name of ['enabled','newChat','browser','serverchan','feishu','wecom'])data[name]=el(name).checked;
    data.offset=Number(data.offset);data.monthDay=Number(data.monthDay)||1;data.weekdays=data.cadence==='custom'?(window.VeyaTaskEditor?.weekdays()||[0]):[Number(data.weekday)||0];
    if(!data.weekdays.length)throw new Error('请至少选择一个重复日期');
    if(data.question===originalVisibleQuestion)data.question=originalQuestionTemplate;
    if(data.assetType==='watchlist'&&!data.symbols.trim())data.assetType='stocks';
    if(data.endMode==='never')data.endDate='';if(!el('repeat').checked)data.cadence='once';if(data.cadence==='once')data.endDate='';
    if(data.timeMode!=='fixed')data.timezone='market';
    return data;
  }
  function visibleQuestion(d){return String(d.question||'').replace(/\{\{market\}\}/g,names[d.market]).replace(/\{\{symbols\}\}/g,d.symbols||'全市场').replace(/\{\{date\}\}/g,'执行当天');}
  function focusChoices(d){
    if(d.assetType==='watchlist')return ['价格与成交量变化','公告与重大新闻','财报日期与后续事件','风险与待核实事项'];
    if(d.stage==='live')return ['指数与市场涨跌分布','成交量与异常变化','行业及 ETF 强弱','可能催化与后续观察'];
    if(d.stage==='post')return ['主要指数与市场广度','行业强弱与量能变化','今日重要新闻','下一交易日事件与风险'];
    return ['隔夜市场与宏观日历','重要新闻与行业催化','公告及财报安排','今日观察清单与风险'];
  }
  function beginWizard(question,preset=null){
    showLanding(false);$('taskLanding').hidden=true;$('taskWizard').hidden=false;$('taskClarification').hidden=false;$('taskPageTitle').textContent='新建任务';$('taskBack').hidden=false;
    wizardStep=0;wizardDraft=template();
    if(/美股|美东|纳斯达克|AAPL|NVDA/i.test(question))wizardDraft.market='US';else if(/港股|恒生/.test(question))wizardDraft.market='HK';
    wizardDraft.assetType=/ETF/i.test(question)?'etf':/指数/.test(question)?'index':/板块|行业/.test(question)?'sector':/自选/.test(question)?'watchlist':'stocks';
    wizardDraft.stage=/盘后|收盘|复盘/.test(question)?'post':/盘中|异动|监控/.test(question)?'live':'pre';
    wizardDraft.timeMode='fixed';wizardDraft.time=wizardDraft.market==='US'?'09:00':'08:30';
    wizardDraft.cadence=/每月/.test(question)?'monthly':/每周|每星期/.test(question)?'weekly':/工作日/.test(question)?'weekdays':/每天|每日/.test(question)?'daily':/仅一次|只执行一次/.test(question)?'once':'trading';
    wizardDraft.question=question;wizardDraft.title=question.replace(/\{\{[^}]+\}\}/g,'').slice(0,24)||'我的定时分析';
    const time=question.match(/(上午|下午|晚上|中午)?\s*([01]?\d|2[0-3])(?:[:：]([0-5]\d)|[点时](?:([0-5]?\d)分?)?)/);if(time){let hour=Number(time[2]);if(/下午|晚上|中午/.test(time[1]||'')&&hour<12)hour+=12;wizardDraft.time=String(hour).padStart(2,'0')+':'+String(time[3]||time[4]||'00').padStart(2,'0');}
    const weekday=question.match(/(?:每周|星期|周)([一二三四五六日天])/);if(weekday)wizardDraft.weekdays=['一二三四五六日'.indexOf(weekday[1]==='天'?'日':weekday[1])];
    const day=question.match(/每月\s*(\d{1,2})[日号]/);if(day)wizardDraft.monthDay=Math.max(1,Math.min(31,Number(day[1])));
    wizardDraft.date=today();if(preset)wizardDraft={...wizardDraft,...preset,date:today()};
    wizardDraft.focus=focusChoices(wizardDraft).slice(0,3);wizardDraft.scopeNote='';wizardDraft.originalQuestion=visibleQuestion(wizardDraft);
    renderWizardTranscript();writeUrl();renderWizard();
  }
  function renderWizardTranscript(submitting=false){
    const target=$('taskWizardTranscript');target.replaceChildren();renderTaskUser(wizardDraft.originalQuestion,[],target);
    const article=document.createElement('article');article.className='message assistant';article.innerHTML='<div class="bubble assistantBubble"><p class="wizardIntro">可以，我会按计划完成这项任务，并把结果保存在对话里。创建前，先确认关注内容、执行频率和时间。</p><p class="wizardWaiting">正在等待你的回答</p></div>';target.append(article);
    if(submitting){article.querySelector('.wizardWaiting').remove();renderTaskUser(wizardAnswers(wizardDraft).map(a=>`> ${a.question}\n${a.answer}`).join('\n\n'),[],target);const waiting=document.createElement('p');waiting.className='wizardCreating';waiting.textContent='正在创建计划任务…';target.append(waiting);target.scrollTop=target.scrollHeight;}
  }
  function collectWizard(){if(!wizardDraft)return;
    for(const [id,key] of [['wizardSymbols','symbols'],['wizardCadence','cadence'],['wizardDate','date'],['wizardTime','time'],['wizardTimezone','timezone'],['wizardScopeNote','scopeNote'],['wizardTitle','title']])if($(id))wizardDraft[key]=$(id).value;
    if($('wizardWeekday'))wizardDraft.weekdays=[Number($('wizardWeekday').value)];
    if($('wizardMonthDay'))wizardDraft.monthDay=Number($('wizardMonthDay').value)||1;
    if($('wizardFocusOptions'))wizardDraft.focus=[...document.querySelectorAll('[name=wizardFocus]:checked')].map(e=>e.value);
    if($('wizardCustomDays'))wizardDraft.weekdays=[...document.querySelectorAll('[name=wizardCustomDay]:checked')].map(e=>Number(e.value));
  }
  function wizardAnswers(d){return [{question:'这份任务重点关注哪些内容？',answer:`${names[d.market]} · ${assets[d.assetType]}${d.symbols?' · '+d.symbols:' · 全市场'}；${d.focus.join('、')||'按原始问句完成'}${d.scopeNote?'；'+d.scopeNote:''}`},{question:'希望多长时间运行一次？',answer:d.cadence==='monthly'?`每月 ${d.monthDay} 日`:d.cadence==='weekly'||d.cadence==='custom'?'每周'+d.weekdays.map(i=>'一二三四五六日'[i]).join('、'):d.cadence==='once'?`仅一次 · ${d.date}`:cadences[d.cadence]},{question:'希望在什么时间收到？',answer:`${d.time} · ${d.timezone==='market'?names[d.market]+'当地时间':el('timezone').querySelector(`option[value="${d.timezone}"]`)?.textContent||d.timezone}`}];}
  function renderWizard(){
    const d=wizardDraft;$('wizardProgress').textContent=`${wizardStep+1} / 3`;$('wizardPrevious').disabled=wizardStep===0;$('wizardForward').disabled=wizardStep===2;$('wizardError').textContent='';
    $('wizardQuestionTitle').textContent=['1. 这份任务重点关注哪些内容？','2. 希望多长时间运行一次？','3. 希望在什么时间收到？'][wizardStep];
    let content='';
    if(wizardStep===0)content=`<div class="wizardMarketOptions" aria-label="分析市场">${Object.keys(names).map(m=>`<button type="button" data-wizard-market="${m}" aria-pressed="${m===d.market}">${flags[m]} ${names[m]}</button>`).join('')}</div><div id="wizardFocusOptions" class="wizardFocusOptions">${focusChoices(d).map(f=>`<label><input type="checkbox" name="wizardFocus" value="${esc(f)}" ${d.focus.includes(f)?'checked':''}/><span>${esc(f)}</span></label>`).join('')}</div><label class="wizardField">关注标的${d.assetType==='watchlist'?'（必填）':'（可选）'}<input id="wizardSymbols" maxlength="500" placeholder="如 AAPL, NVDA；留空关注全市场" value="${esc(d.symbols)}" /></label><label class="wizardField wizardNote"><span>补充要求（可选）</span><input id="wizardScopeNote" maxlength="500" placeholder="补充你想关注的内容…" value="${esc(d.scopeNote)}" /></label>`;
    if(wizardStep===1)content=`<label class="wizardField">重复频率<select id="wizardCadence">${Object.entries(cadences).map(([k,v])=>`<option value="${k}" ${k===d.cadence?'selected':''}>${v}</option>`).join('')}</select></label>${d.cadence==='weekly'?`<label class="wizardField">每周哪一天<select id="wizardWeekday">${[...'一二三四五六日'].map((v,i)=>`<option value="${i}" ${i===d.weekdays[0]?'selected':''}>星期${v}</option>`).join('')}</select></label>`:d.cadence==='monthly'?`<label class="wizardField">每月几日<input id="wizardMonthDay" type="number" min="1" max="31" value="${d.monthDay}" /></label>`:d.cadence==='once'?`<label class="wizardField">执行日期<input id="wizardDate" type="date" required value="${d.date}" /></label>`:d.cadence==='custom'?`<fieldset id="wizardCustomDays" class="wizardCustomDays"><legend>执行星期</legend>${[...'一二三四五六日'].map((v,i)=>`<label><input type="checkbox" name="wizardCustomDay" value="${i}" ${d.weekdays.includes(i)?'checked':''}/><span>${v}</span></label>`).join('')}</fieldset>`:''}<p class="wizardHint">时间安排会以这里确认的设置为准。</p>`;
    if(wizardStep===2)content=`<div class="wizardOptions wizardTimeOptions">${[...new Set([d.time,'08:30','12:00','16:30'])].map(time=>`<button type="button" data-wizard-time="${time}" aria-pressed="${time===d.time}">${time}<span>${time===d.time?'✓':''}</span></button>`).join('')}</div><div class="dayFieldRow"><label class="wizardField">具体时间<input id="wizardTime" type="time" required value="${d.time}" /></label><label class="wizardField">时区<select id="wizardTimezone">${[...el('timezone').options].map(o=>`<option value="${o.value}" ${o.value===d.timezone?'selected':''}>${esc(o.value==='market'?names[d.market]+'当地时间':o.textContent)}</option>`).join('')}</select></label></div><label class="wizardField">任务名称<input id="wizardTitle" maxlength="80" required value="${esc(d.title)}" /></label><p class="wizardSummary">${esc(names[d.market])} · ${esc(schedule(d))}</p><p class="wizardHint">确认后会发送你的回答，并创建启用中的任务。微信和飞书推送默认关闭。</p>`;
    $('wizardQuestion').innerHTML=content+`<div class="wizardActions">${wizardStep===0?'<button class="dayTextButton" type="button" id="wizardSkip">按默认范围继续</button>':''}${wizardStep===2?'<button class="dayTextButton" type="button" id="wizardAdvanced">高级设置</button>':''}<button type="button" class="dayButton dayPrimary" id="wizardNext">${wizardStep===2?'发送并创建':'下一步'}</button></div>`;
  }
  async function advanceWizard(){if(saving)return;collectWizard();
    if(wizardStep===0&&wizardDraft.assetType==='watchlist'&&!wizardDraft.symbols.trim())throw new Error('请填写自选列表中的具体标的');
    if(wizardStep===1){if(wizardDraft.cadence==='custom'&&!wizardDraft.weekdays.length)throw new Error('请选择至少一个执行星期');if(wizardDraft.cadence==='monthly'&&(!Number.isInteger(wizardDraft.monthDay)||wizardDraft.monthDay<1||wizardDraft.monthDay>31))throw new Error('每月日期应为 1 至 31');if(wizardDraft.cadence==='once'&&!wizardDraft.date)throw new Error('请选择执行日期');}
    if(wizardStep<2){wizardStep++;renderWizard();return;}
    if(!$('wizardTime').checkValidity()||!wizardDraft.time)throw new Error('请选择有效的执行时间');if(!wizardDraft.title.trim())throw new Error('请填写任务名称');
    await saveDraft();
  }
  async function saveDraft(){if(saving)return;saving=true;const d=wizardDraft,record={question:d.originalQuestion,answers:wizardAnswers(d),focus:d.focus.slice(),note:d.scopeNote};
    const {focus,scopeNote,originalQuestion,...data}=d;data.question=d.question+(focus.length?'\n\n重点关注：'+focus.join('、')+'。':'')+(scopeNote?'\n补充要求：'+scopeNote:'');data.weekdays=data.cadence==='custom'?d.weekdays:data.cadence==='weekly'?[d.weekdays[0]??0]:[0];data.enabled=true;data.browser=data.feishu=data.serverchan=data.wecom=false;
    $('taskClarification').hidden=true;renderWizardTranscript(true);
    try{const task=await api('tasks','POST',data);tasks.push(task);rememberCreation(task.id,record);if(wizardDraft!==d||$('taskWizard').hidden||workspace.hidden){renderHome();renderLists();return;}wizardDraft=null;renderHome();try{await selectTask(task.id);}catch{prepareDetail(task,true);renderCreatedTask(task);writeUrl(task.id);await loadFollowups({question:task.question},task,viewVersion);}message('定时任务已创建并启用。','taskMessage');}
    catch(error){if(wizardDraft!==d||workspace.hidden)return;$('taskClarification').hidden=false;renderWizard();$('wizardError').textContent=error.message;const waiting=$('taskWizardTranscript').querySelector('.wizardCreating');if(waiting)waiting.textContent='创建未完成，请检查设置后重试。';throw error;}
    finally{saving=false;}
  }
  function renderCreatedTask(task){const target=$('taskThread');target.replaceChildren();$('taskInfoCard').hidden=true;const record=creationRecord(task.id);
    renderTaskUser(record?.question||visibleQuestion(task),[],target,task);
    if(record?.answers?.length){const intro=document.createElement('article');intro.className='message assistant';intro.innerHTML='<div class="bubble assistantBubble"><p>创建前，我们确认了任务范围和执行安排。</p></div>';target.append(intro);renderTaskUser(record.answers.map(a=>`> ${a.question}\n${a.answer}`).join('\n\n'),[],target);}
    const article=document.createElement('article');article.className='message assistant taskCreatedAnswer';const zone=zoneFor(task),focus=Array.isArray(record?.focus)&&record.focus.length?record.focus:['按任务问句完成分析并注明数据时间','区分可靠事实、判断与缺失信息'];
    article.innerHTML=`<div class="bubble assistantBubble"><div class="taskCreatedLink"><span class="taskCreatedClock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l-3 3"/></svg></span><div><strong>${esc(task.title)}</strong><small>${esc(schedule(task))}</small></div><button class="dayButton" type="button" data-edit-task="1">打开</button></div><span class="taskCreatedStatus ${task.enabled?'':'is-paused'}">${task.enabled?'✓ 已创建并启用':'已暂停'}</span><p>你的<strong>${esc(task.title)}</strong>定时任务已设置${task.enabled?'成功':''}。</p><section class="taskCreatedSummary"><header><strong>${esc(task.title)}</strong><span aria-hidden="true"><svg class="taskCreatedCalendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-12 6 3 3 5-6"/></svg></span></header><h2>${esc(compactSchedule(task))}</h2><p>${esc(zone==='Asia/Shanghai'?'北京时间':zone==='Asia/Hong_Kong'?'香港时间':zone==='America/New_York'?'美国东部时间':el('timezone').querySelector(`option[value="${zone}"]`)?.textContent||zone)}（${esc(zone)}）</p><div class="taskCreatedFirst">首次执行：${task.nextAt?esc(dateText(task.nextAt,zone)):'暂无未来执行时间'}</div><p>分析范围：${esc(names[task.market])}${task.symbols?' · '+esc(task.symbols):' · 全市场'}</p></section><p>每次报告将包含：</p><ol class="taskCreatedFocus">${focus.map(item=>`<li>${esc(item)}</li>`).join('')}</ol><p class="taskCreatedNote">任务会在计划时间查询可用的市场数据、公告和新闻，注明数据截至时间，并区分事实与判断。缺少可靠数据时会明确说明。</p></div>`;target.append(article);requestAnimationFrame(()=>article.scrollIntoView?.({block:'start'}));
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
  const taskMenu=document.createElement('div');taskMenu.id='taskMoreMenu';taskMenu.className='taskMoreMenu';taskMenu.setAttribute('popover','manual');taskMenu.setAttribute('role','menu');taskMenu.hidden=true;document.body.append(taskMenu);
  let menuAnchor=null,menuTaskId='',deleteTaskId='';
  const menuIcon=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  function closeTaskMenu(restoreFocus=false){const anchor=menuAnchor;if(anchor)anchor.setAttribute('aria-expanded','false');if(taskMenu.hidePopover&&taskMenu.matches(':popover-open'))taskMenu.hidePopover();taskMenu.hidden=true;menuAnchor=null;menuTaskId='';if(restoreFocus)anchor?.focus();}
  function openTaskMenu(button){if(menuAnchor===button&&!taskMenu.hidden){closeTaskMenu();return;}closeTaskMenu();const task=tasks.find(t=>t.id===button.dataset.taskMore)||(sharedEntry?.task.id===button.dataset.taskMore?sharedEntry.task:null);if(!task)return;
    menuAnchor=button;menuTaskId=task.id;taskMenu.setAttribute('aria-label','任务操作：'+task.title);button.setAttribute('aria-expanded','true');
    const action=(id,label,icon,disabled=false,danger=false)=>`<button type="button" role="menuitem" data-task-action="${id}" class="${danger?'is-danger':''}" ${disabled?'disabled':''}>${menuIcon(icon)}<span>${label}</span></button>`;
    const toggle=completed(task)?'重新安排':task.enabled?'暂停':'开启';
    taskMenu.innerHTML=(editable(task)?action('toggle',toggle,task.enabled?'<circle cx="12" cy="12" r="9"/><path d="M10 9v6m4-6v6"/>':'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>')+action('run','立即运行','<path d="M20 10a8 8 0 1 0 0 5M20 4v6h-6"/>',!!task.activeRun):'')+action('edit',editable(task)?'编辑':'查看设置','<path d="m4 16-1 5 5-1L20 8l-4-4ZM14 6l4 4"/>')+action('share','分享','<path d="m10 14 4-4m-6 2-2 2a4 4 0 0 0 6 6l2-2m-4-12 2-2a4 4 0 0 1 6 6l-2 2"/>',!task.resultVersion)+(editable(task)?'<hr role="separator">'+action('delete','删除','<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',!!task.activeRun,true):'');
    taskMenu.hidden=false;if(taskMenu.showPopover)taskMenu.showPopover();const r=button.getBoundingClientRect(),width=Math.min(224,innerWidth-24);taskMenu.style.width=width+'px';taskMenu.style.left=Math.max(12,Math.min(r.right-width,innerWidth-width-12))+'px';const height=taskMenu.scrollHeight;taskMenu.style.top=(r.bottom+height+12<innerHeight?r.bottom+6:Math.max(12,r.top-height-6))+'px';taskMenu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  async function shareTask(task){
    let article=selectedId===task.id?$('taskThread').querySelector('.message.assistant'):null;
    if(!article?.shareSession){await selectTask(task.id,{runId:task.resultVersion});article=$('taskThread').querySelector('.message.assistant');}
    if(!article?.shareSession)throw new Error('任务生成结果后才可以分享');
    if(typeof openShareDialog!=='function')throw new Error('分享面板暂时不可用，请刷新重试');
    openShareDialog(article);
  }
  taskMenu.addEventListener('click',async event=>{const button=event.target.closest('[data-task-action]');if(!button||button.disabled)return;const task=tasks.find(t=>t.id===menuTaskId)||(sharedEntry?.task.id===menuTaskId?sharedEntry.task:null),action=button.dataset.taskAction;closeTaskMenu();if(!task)return;
    try{if(action==='share'){await shareTask(task);return;}if(action==='edit'){edit(task,!editable(task));return;}if(!editable(task))return;
      if(action==='toggle'){if(completed(task))edit(task);else await toggleTask(task);}
      if(action==='run'){await api('tasks/'+task.id+'/run','POST');await refresh();await selectTask(task.id);message('任务已提交到云端，关闭页面后仍会执行。','taskMessage');}
      if(action==='delete'){deleteTaskId=task.id;$('taskDeleteName').textContent=task.title;$('taskDeleteMessage').textContent='';$('taskDeleteConfirm').disabled=false;$('taskDeleteDialog').showModal();}
    }catch(error){message(error.message,'taskMessage');}
  });
  document.addEventListener('click',event=>{if(menuAnchor&&!event.target.closest('[data-task-more],#taskMoreMenu'))closeTaskMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&event.target.closest('[data-task-more]')){event.preventDefault();openTaskMenu(event.target.closest('[data-task-more]'));return;}if(taskMenu.hidden)return;if(event.key==='Escape'){event.preventDefault();closeTaskMenu(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...taskMenu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}else if(event.key==='Tab')closeTaskMenu();});
  window.addEventListener('resize',()=>closeTaskMenu());$('taskSidebarList').addEventListener('scroll',()=>closeTaskMenu());
  $('taskDeleteCancel').onclick=()=>$('taskDeleteDialog').close();
  $('taskDeleteConfirm').onclick=async()=>{const task=tasks.find(t=>t.id===deleteTaskId);if(!task||task.activeRun)return;const button=$('taskDeleteConfirm');button.disabled=true;try{await api('tasks/'+task.id,'DELETE');tasks=tasks.filter(t=>t.id!==task.id);$('taskDeleteDialog').close();if(selectedId===task.id)showLanding();else renderLists();renderHome();message('任务已删除。','taskMessage');}catch(error){$('taskDeleteMessage').textContent=error.message;}finally{button.disabled=false;}};
  async function toggleTask(task) {await api('tasks/'+task.id,'PUT',{...task,enabled:!task.enabled});await refresh();message(task.enabled?'已暂停后续执行，已有结果仍保留。':'任务已开启。','taskMessage');}
  function newTask() {showLanding();$('taskPrompt').value='';$('taskPrompt').focus();}
  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.taskMore){event.stopPropagation();openTaskMenu(b);return;}
    try {
      if(b.dataset.taskOpen){await selectTask(b.dataset.taskOpen,{runId:b.dataset.taskRun||''});return;}
      if(b.dataset.template){const d=template(b.dataset.template);beginWizard(visibleQuestion(d),d);return;}
      if(b.dataset.recommendation){const item=recommendations.find(r=>r.id===b.dataset.recommendation);if(item){const d=recommendedTask(item);beginWizard(visibleQuestion(d),d);}return;}
      if(b.dataset.editTask){const task=selected();if(task)edit(task,!editable(task));return;}
      if(b.dataset.wizardMarket){collectWizard();wizardDraft.market=b.dataset.wizardMarket;renderWizard();return;}
      if(b.dataset.wizardTime){collectWizard();wizardDraft.time=b.dataset.wizardTime;renderWizard();return;}
      switch(b.id){
        case'navTasks':case'railTasks':showLanding();if(!mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(false);break;
        case'navHome':case'railHome':if(typeof startNewChat==='function')startNewChat(false,false);if(!mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(false);break;
        case'taskBack':case'wizardClose':showLanding();break;
        case'taskSidebarNew':case'taskOpenCreate':newTask();break;
        case'taskSearchToggle':{const field=$('taskSearchField');field.hidden=!field.hidden;b.setAttribute('aria-expanded',String(!field.hidden));if(!field.hidden)$('taskSearch').focus();else{$('taskSearch').value='';renderLists();}break;}
        case'taskSidebarExpand':sidebarExpanded=!sidebarExpanded;renderLists();break;
        case'taskSettings':if(selected())edit(selected(),!editable(selected()));break;
        case'taskToggle':if(completed(selected())){edit(selected());break;}b.disabled=true;await toggleTask(selected());b.disabled=false;break;
        case'taskRunNow':b.disabled=true;await api('tasks/'+selectedId+'/run','POST');pinnedRun=false;await refresh();await selectTask(selectedId,{updateUrl:false});message('任务已提交到云端，关闭页面后仍会执行。','taskMessage');break;
        case'wizardPrevious':collectWizard();wizardStep=Math.max(0,wizardStep-1);renderWizard();break;
        case'wizardAdvanced':collectWizard();edit({...wizardDraft,question:wizardDraft.question+(wizardDraft.focus.length?'\n\n重点关注：'+wizardDraft.focus.join('、'):'')+(wizardDraft.scopeNote?'\n补充要求：'+wizardDraft.scopeNote:'')});break;
        case'wizardNext':case'wizardForward':case'wizardSkip':await advanceWizard();break;
      }
    }catch(error){if(!workspace.hidden&& !$('taskWizard').hidden)$('wizardError').textContent=error.message;else message(error.message);b.disabled=false;}
  });
  $('taskPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('taskPromptForm').requestSubmit();}});
  $('taskPromptForm').addEventListener('submit',e=>{e.preventDefault();const question=$('taskPrompt').value.trim();if(question)beginWizard(question);});
  $('taskChatForm').addEventListener('submit',sendFollowup);
  $('taskAttachButton').addEventListener('click',()=>$('taskImageInput').click());
  $('taskImageInput').addEventListener('change',async e=>{await addTaskImages(e.target.files);e.target.value='';});
  $('taskAttachmentPreview').addEventListener('click',e=>{const button=e.target.closest('[data-remove-task-image]');if(button){taskImages.splice(Number(button.dataset.removeTaskImage),1);renderTaskImages();}});
  document.addEventListener('paste',e=>{if(workspace.hidden||$('taskDetail').hidden)return;const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();addTaskImages(files);}});
  function updateChatComposer(){const input=$('taskChatInput');input.style.height='40px';const height=Math.max(40,Math.min(120,input.scrollHeight));input.style.height=height+'px';input.closest('.taskChatComposer').classList.toggle('is-multiline',height>44);$('taskChatSend').classList.toggle('is-ready',!!input.value.trim());}
  $('taskChatInput').addEventListener('input',updateChatComposer);
  $('taskChatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('taskChatForm').requestSubmit();}});
  $('taskSearch').addEventListener('input',renderLists);
  for(const id of ['taskFilter','taskSidebarFilter'])$(id).addEventListener('change',e=>{filter=e.target.value;renderLists();});
  $('taskRunSelect').addEventListener('change',async e=>{try{await selectTask(selectedId,{runId:e.target.value});}catch(error){message(error.message);}});
  function syncWizardTime(){if(!wizardDraft)return;document.querySelectorAll('[data-wizard-time]').forEach(button=>{const active=button.dataset.wizardTime===wizardDraft.time;button.setAttribute('aria-pressed',String(active));button.querySelector('span').textContent=active?'✓':'';});const summary=$('wizardQuestion').querySelector('.wizardSummary');if(summary)summary.textContent=names[wizardDraft.market]+' · '+schedule(wizardDraft);}
  $('wizardQuestion').addEventListener('change',e=>{collectWizard();if(e.target.id==='wizardCadence')renderWizard();else syncWizardTime();});
  $('wizardQuestion').addEventListener('input',e=>{if(e.target.id==='wizardTime'){collectWizard();syncWizardTime();}});
  $('dayMarketSelect').addEventListener('change',e=>{market=e.target.value;try{localStorage.setItem('veya-day-market',market);}catch{}renderHome();});
  $('dayClose').onclick=$('dayCancelEdit').onclick=()=>dialog.close();
  form.addEventListener('change',updateFields);
  $('dayEnablePush').onclick=async()=>{const b=$('dayEnablePush');b.disabled=true;try{await enablePush();}catch(error){$('dayPushState').textContent=error.message;}finally{b.disabled=false;}};
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(saving)return;saving=true;$('daySave').disabled=true;
    try{const data=payload(),draft=wizardDraft&&!editing?{...wizardDraft,...data}:null;const task=await api('tasks'+(editing?'/'+editing:''),editing?'PUT':'POST',data);tasks=tasks.filter(t=>t.id!==task.id);tasks.push(task);if(draft)rememberCreation(task.id,{question:draft.originalQuestion,answers:wizardAnswers(draft),focus:draft.focus.slice(),note:draft.scopeNote});dialog.close();wizardDraft=null;renderHome();await selectTask(task.id);message(task.enabled?'任务已保存，云端会按时运行。':'任务已保存为暂停状态。','taskMessage');}
    catch(error){message(error.message,'dayDialogMessage');}finally{saving=false;$('daySave').disabled=false;}
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  window.addEventListener('veya:chat-navigate',()=>{closeTaskMenu();if(internalNavigation)return;shellMode(false);viewVersion++;selectedId='';const url=new URL(location.href);['tab','task','run','dayResult','dayShare'].forEach(k=>url.searchParams.delete(k));history.replaceState(null,'',url);});
  window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);if(p.get('dayShare'))openShared(p.get('dayShare')).catch(e=>message(e.message));else if(p.get('tab')==='tasks'){if(p.get('task'))selectTask(p.get('task'),{updateUrl:false,runId:p.get('run')||''}).catch(e=>message(e.message));else showLanding(false);}else shellMode(false);});
  window.matchMedia('(max-width: 760px)').addEventListener?.('change',()=>{if(!workspace.hidden)shellMode(true);});
  if(initial.get('tab')==='tasks'||initialTask)showLanding(false);
  if(initialShare)openShared(initialShare).catch(error=>{showLanding(false);message(error.message,'taskMessage');});
  refresh();
  setInterval(()=>{if(!document.hidden&&Date.now()-lastRefresh>15000)refresh();},5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
