(() => {
  const $ = id => document.getElementById(id);
  const home = $('myDay'), workspace = $('taskWorkspace'), form = $('dayForm'), dialog = $('dayDialog');
  if (!home || !workspace) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages = {pre:'盘前机会',live:'盘中监控',post:'收盘回顾',rest:'休市时光'};
  const assets = {stocks:'股票',etf:'ETF',index:'指数',sector:'行业板块',watchlist:'自选列表'};
  const names = {CN:'A股',HK:'港股',US:'美股'}, flags = {CN:'🇨🇳',HK:'🇭🇰',US:'🇺🇸'};
  const zones = {CN:'Asia/Shanghai',HK:'Asia/Hong_Kong',US:'America/New_York'};
  const cadences = {trading:'交易日',daily:'每天',weekdays:'工作日',weekly:'每周',monthly:'每月',custom:'自定义',once:'指定日期一次'};
  // Optional plans to create, separate from the already scheduled scene tasks.
  const recommendations = [
    {id:'morning',icon:'🗓️',title:'经济数据与政策日历',stage:'pre',type:'index',time:'09:00',description:'跟踪你关注的经济数据和政策日程，提前整理已确认的发布安排。',question:'在{{market}}开盘前整理用户关注的经济数据与政策日历，列出已确认的发布时间、前值、可靠预期与关注点。创建前澄清关注地区、事件范围及提醒时间；注明来源，区分已发布数据与待发布日程。'},
    {id:'announcements',icon:'📄',title:'自选股公告与财报提醒',stage:'pre',type:'watchlist',time:'09:00',description:'为你的自选股检查公告与财报日期，标出值得关注的新变化。',question:'每天开盘前检查{{market}}自选股{{symbols}}的公告、业绩预告、财报披露及已确认的未来七天财报日期。创建前先澄清自选股名单和提醒时间，不假设用户持仓。逐一注明时间和来源，没有新变化时简要说明。'},
    {id:'intraday',icon:'🔔',title:'关注标的价量异动观察',stage:'live',type:'index',time:'10:30',description:'按你指定的标的和观察条件，定时核验价格、量能与相关消息。',question:'盘中观察{{market}}用户指定标的{{symbols}}的价格、量能与相关消息。创建前澄清标的、观察时间和希望关注的变化条件。比较可靠历史同期口径，说明行情时间和延迟，仅提供研究观察，不下单，也不创建外部价格提醒。'},
    {id:'sectors',icon:'⚖️',title:'行业 ETF 相对强弱对照',stage:'live',type:'etf',time:'14:00',description:'选择几只行业 ETF，对照相对表现、量能和共同驱动因素。',question:'定时比较{{market}}中用户选择的ETF {{symbols}}，对照涨跌、量能与相对基准表现，梳理共同驱动与分歧。创建前澄清ETF名单、基准与执行时间。注明数据日期与来源，不将成交量直接解释为资金流入。'},
    {id:'closing',icon:'📒',title:'投资观察笔记回顾',stage:'post',type:'index',description:'回顾你在对话中记录的投资观察，整理已验证变化与待核实问题。',question:'收盘后回顾用户在对话中记录的{{market}}投资观察与{{symbols}}相关研究笔记，对照新证据，整理已验证变化、尚未解决的问题和后续观察清单。创建前澄清笔记来源、跟踪范围与时间。只使用用户实际提供的记录，不假设持仓、收益或交易。'},
    {id:'watchlist',icon:'💰',title:'自选股分红与派息日历',stage:'post',type:'watchlist',description:'跟踪自选股已公告的分红、除权除息和派息安排。',question:'定时检查{{market}}自选股{{symbols}}已公告的分红、股权登记、除权除息与派息安排，区分已确认事项和未确认预期。创建前澄清股票名单与执行时间。注明公告日期、来源及币种，不预测未公告的分红。'},
    {id:'weekend-research',icon:'🔎',title:'周末自选股研究',stage:'rest',type:'watchlist',time:'09:00',description:'利用休市时间梳理关注公司的业务变化、近期财报与研究问题。',question:'在{{market}}休市日研究用户选择的公司{{symbols}}，结合已披露财报、公告与可靠资料，梳理业务变化和待核实问题。创建前澄清公司名单、研究重点、重复频率与时间。明确数据截至日期，不把历史收盘数据作为实时行情。'},
    {id:'next-week-earnings',icon:'📅',title:'下周财报观察清单',stage:'rest',type:'index',time:'17:00',description:'为关注的公司整理下周已确认的财报日期与重点观察指标。',question:'在{{market}}休市日整理用户关注公司{{symbols}}下周已确认的财报日期、发布时段与观察指标，区分官方已确认日期和第三方预计日期。创建前澄清公司范围、执行日期与时间；注明来源，不编造一致预期或财报结果。'}
  ];
  function recommendedTask(item) {
    return {...template(item.stage,item.type),title:item.title,question:item.question,timeMode:'fixed',time:item.time||(market==='CN'?'15:30':'16:30'),timezone:'market'};
  }
  const el = name => form.elements.namedItem(name);
  const mobile = () => window.matchMedia('(max-width: 760px)').matches;
  let market = 'CN'; try { market = localStorage.getItem('veya-day-market') || 'CN'; } catch {}
  if (!names[market]) market = 'CN';
  let tasks = [], sceneTasks = [], recommendationScene = '', markets = [], publicKey = '', serverDelta = 0, busy = false, lastRefresh = 0;
  let selectedId = '', selectedRun = '', pinnedRun = false, sharedEntry = null, resultVersion = '', viewVersion = 0;
  let lastDetailState = '';
  let sidebarExpanded = false;
  let chatHistory = [], chatKey = '', chatController = null, runController = null;
  let seenRuns={};try{seenRuns=JSON.parse(localStorage.getItem('mentora-task-seen')||'{}')||{};}catch{}
  function markSeen(task,runId){if(!runId||document.visibilityState==='hidden')return;seenRuns[task.id]=runId;try{localStorage.setItem('mentora-task-seen',JSON.stringify(seenRuns));}catch{}renderHome();}
  function stopRun(){runController?.abort();runController=null;}
  let taskImages = [], answerSequence = 0;
  function renderTaskImages(){const preview=$('taskAttachmentPreview');preview.hidden=!taskImages.length;preview.innerHTML=taskImages.map((image,i)=>`<div class="attachmentThumb"><img src="${esc(image.dataUrl)}" alt="${esc(image.name)}"/><button type="button" class="attachmentRemove" data-remove-task-image="${i}" aria-label="移除图片">×</button></div>`).join('');preview.closest('.composerBox').classList.toggle('has-attachments',!!taskImages.length);updateChatComposer();}
  async function addTaskImages(files){try{for(const file of Array.from(files||[])){if(taskImages.length>=6)break;if(!file.type.startsWith('image/'))continue;if(file.size>8*1024*1024)throw new Error('单张图片不能超过 8 MB');const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file);});taskImages.push({name:file.name,mimeType:file.type,dataUrl});}renderTaskImages();}catch(error){$('taskChatError').textContent=error.message;}}
  function stopFollowup() {chatController?.abort();chatController=null;}
  function resetFollowup() {stopFollowup();stopRun();chatHistory=[];chatKey='';taskImages=[];renderTaskImages();$('taskFollowups').replaceChildren();$('taskChatError').textContent='';$('taskChatInput').value='';updateChatComposer();$('taskChatSend').disabled=true;}
  function renderTaskUser(text, images, target, task=null) {
    const article=document.createElement('article');target.append(article);
    if(typeof renderUserMessage==='function')renderUserMessage(article,text,images||[],{allowEdit:!!task&&editable(task),onEdit:()=>edit(task)});
    else {article.className='message user';const bubble=document.createElement('div');bubble.className='bubble userBubble';bubble.textContent=text;for(const image of images||[]){const img=document.createElement('img');img.src=image.dataUrl;img.alt=image.name||'附图';bubble.append(img);}article.append(bubble);}
    return article;
  }
  async function renderTaskAnswer(article, answer, question) {
    article.dataset.lang=typeof detectLanguage==='function'?detectLanguage(question):'zh-CN';
    article.shareSession={...answer,id:`task-${selectedId}-${selectedRun||'setup'}-${Date.now()}-${++answerSequence}`,title:selected()?.title||'定时任务',question,messages:[{role:'user',text:question}]};
    if(typeof renderSavedAssistantAnswer==='function')await renderSavedAssistantAnswer(article,answer,{question,thinkingElapsed:answer.thinkingElapsed,thinkingLabel:selected()?.title||'定时任务',thinkingAriaLabel:'打开任务设置：'+(selected()?.title||'定时任务'),onThinkingClick:()=>{const task=selected();if(task)edit(task,!editable(task));}});
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
    const liveArticle=typeof createAssistantMessage==='function'?createAssistantMessage(text,{target:$('taskFollowups'),taskContext:{id:`task-followup-${selectedId}-${Date.now()}`,title:selected()?.title||'定时任务',question:text}}):null;if(liveArticle)waiting.remove();
    let answer=null,streamError='';
    try {
      const response=await fetch('/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({question:text,images,history:prior,sessionTitle:selected()?.title||'定时任务追问',reasoningFramework:typeof DEFAULT_REASONING_FRAMEWORK==='string'?DEFAULT_REASONING_FRAMEWORK:'deepseek',inferenceModel:typeof DEFAULT_INFERENCE_MODEL==='string'?DEFAULT_INFERENCE_MODEL:'',themeMode:document.documentElement.dataset.theme==='dark'?'dark':'light'})});
      if(!response.ok||!response.body){const error=await response.json().catch(()=>({}));throw new Error(error.detail||'请求失败，请重试');}
      await readEventStream(response.body,(event,data)=>{if(controller.signal.aborted||version!==viewVersion)return;if(liveArticle)handleStreamEvent(liveArticle,event,data);if(event==='final')answer=data;if(event==='error')streamError=data.detail||data.message||'分析失败';});
      if(controller.signal.aborted||version!==viewVersion)return;
      if(!answer)throw new Error(streamError||'本次没有返回结果，请重试');
      waiting.remove();const turn={role:'assistant',text:answer.interpretation||'',answer};chatHistory.push(user,turn);if(liveArticle)finishRunThinking(liveArticle,selected());else await renderFollowup(turn);
      try{localStorage.setItem(key,JSON.stringify(chatHistory.slice(chatHistory[1]?.role==='assistant'?2:0).slice(-20)));}catch{$('taskChatError').textContent='当前浏览器无法保存追问记录，刷新后可能丢失。';}
    } catch(error) {if(!controller.signal.aborted&&version===viewVersion){waiting.remove();liveArticle?.remove();userNode.remove();$('taskChatError').textContent=error.message;$('taskChatInput').value=text;taskImages=images;renderTaskImages();}}
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
  const selected = () => [...tasks,...sceneTasks].find(t => t.id === selectedId) || (sharedEntry?.task.id === selectedId ? sharedEntry.task : null);
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
      rest:`在{{market}}休市期间回顾最近完整交易周，梳理已确认事件与下次开市的观察清单。明确历史数据日期，不编造今日交易行情。`,
      pre:`结合最新隔夜市场、公告与今日事件，梳理{{market}}中{{symbols}}的${asset}盘前关注机会。按催化剂、观察指标和风险列出要点，注明数据时间；没有指定标的时分析全市场。`,
      live:`检查{{market}}中{{symbols}}的${asset}盘中表现，汇总价格、成交量与板块异动，分析可能原因与需要继续观察的信号。注明行情时间和延迟，不具备实时数据时明确说明。`,
      post:`复盘{{market}}中{{symbols}}的${asset}今日表现，说明涨跌驱动、市场强弱和重要事件，并列出下一交易日的关注清单。区分已确认事实与推测，注明数据时间。`
    };
    return {title:`${names[selectedMarket]}${type==='stocks'?'':assets[type]} · ${stages[stage]}`,market:selectedMarket,stage,assetType:type,symbols:'',question:questions[stage],cadence:'trading',date:'',endDate:'',weekdays:[0],monthDay:1,timeMode:stage==='live'?'fixed':stage==='pre'?'open':'close',offset:stage==='post'?15:-30,time:selectedMarket==='US'?'09:00':'08:30',timezone:'market',enabled:true,newChat:true,browser:false,serverchan:false,feishu:false,wecom:false};
  }
  const sceneCopy={pre:{title:'新的一天，从容开场',label:'盘前',emoji:'🌅'},live:{title:'行情起伏，陪你看清',label:'盘中',emoji:'☀️'},post:{title:'收盘了，慢慢复盘',label:'盘后',emoji:'🌇'},rest:{title:'市场休息，也歇一歇',label:'休市',emoji:'🧳'}};
  function homeScene(){const info=markets.find(m=>m.market==='CN');if(!info||info.calendarError)return null;if(info.closed||info.stage==='rest')return 'rest';if(info.openAt&&info.closeAt){const now=Date.now()+serverDelta;return now<new Date(info.openAt).getTime()?'pre':now<new Date(info.closeAt).getTime()?'live':'post';}return info.stage;}
  function dayDate(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
  function sceneArt(scene){if(scene==='rest')return '<svg viewBox="0 0 48 48" aria-hidden="true"><g class="dayTravel"><path d="m8 28 14-5 1-13 5-2 3 13 9-2 3 4-12 4-8 12-4 1 3-11-10 3z" fill="currentColor"/></g><path d="M4 39h11m20-28h9" stroke="currentColor" opacity=".3"/></svg>';return '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="daySunClip"><path d="M0 0h48v34H0z"/></clipPath></defs><g clip-path="url(#daySunClip)"><g class="daySun"><circle cx="24" cy="24" r="8" fill="currentColor"/><g class="daySunRays" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M24 8v-3m0 38v-3M8 24H5m38 0h-3M13 13l-2-2m26 26-2-2M13 35l-2 2m26-26-2 2"/></g></g></g><path class="dayHorizon" d="M5 35h38M13 40h22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';}
  let displayedDayScene='';
  function updateDayHeader(){const scene=homeScene(),copy=sceneCopy[scene];$('myDayTitle').textContent=copy?.title||'陪你等一个清晰的方向';const now=new Date(Date.now()+serverDelta),parts=Object.fromEntries(new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));$('dayClock').dateTime=now.toISOString();$('dayClock').textContent=`${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}:${parts.second}`;if(displayedDayScene!==scene){displayedDayScene=scene;$('daySceneArt').dataset.scene=scene||'';$('daySceneArt').setAttribute('aria-label',copy?.label||'同步市场时间');$('daySceneArt').innerHTML=sceneArt(scene||'pre');return true;}return false;}
  function resultScene(t){if(t.resultScene)return t.resultScene;if(t.stage==='rest')return 'rest';if(t.timeMode==='open')return t.offset>0?'live':'pre';if(t.timeMode==='close')return t.offset<0?'live':'post';if(t.time){const close=t.market==='CN'?'15:00':'16:00';return t.time<'09:30'?'pre':t.time<close?'live':'post';}return t.stage;}
  function updateHomePanel(markup){
    const panel=$('dayPanel'),template=document.createElement('template');template.innerHTML=markup;
    const nextGrid=template.content.querySelector('.daySceneGrid'),grid=panel.querySelector('.daySceneGrid');
    if(!nextGrid||!grid){panel.replaceChildren(template.content);return;}
    // Keep running card elements mounted so polling cannot restart their edge animations.
    const existing=new Map(Array.from(grid.children).map(card=>[card.dataset.taskOpen,card]));
    Array.from(nextGrid.children).forEach((incoming,index)=>{
      const current=existing.get(incoming.dataset.taskOpen),card=current||incoming;
      if(current){
        existing.delete(incoming.dataset.taskOpen);
        if(current.className!==incoming.className)current.className=incoming.className;
        if(current.dataset.taskRun!==incoming.dataset.taskRun)current.dataset.taskRun=incoming.dataset.taskRun;
        if(current.innerHTML!==incoming.innerHTML)current.innerHTML=incoming.innerHTML;
      }
      if(grid.children[index]!==card)grid.insertBefore(card,grid.children[index]||null);
    });
    for(const card of existing.values())card.remove();
  }
  function renderHome(){updateDayHeader();const scene=homeScene(),date=dayDate(Date.now()+serverDelta);
    const ready=t=>t.resultVersion&&(t.resultDate||dayDate(t.successAt))===date&&resultScene(t)===scene;
    const rows=[...sceneTasks.filter(t=>t.market==='CN'&&(t.scene||resultScene(t))===scene),...tasks.filter(t=>(t.resultMarket||t.market)==='CN'&&((t.activeRun&&(t.scene||resultScene(t))===scene)||ready(t)))];
    updateHomePanel(rows.length?`<div class="daySceneGrid">${rows.map(t=>{
      const active=!!t.activeRun,done=!active&&ready(t),running=active&&t.lastRun?.status==='running',run=active?t.activeRun:done?t.resultVersion:'';
      const label=running?'正在运行任务':active?'等待运行':!t.enabled?'已暂停':t.lastRun?.status==='failed'?'执行未完成':'等待执行';
      const description=plainSummary(visibleQuestion(t).split(' 使用项目已有金融研究技能')[0]);
      return `<button class="caseCard daySceneCard ${done?'is-complete':'is-pending'} ${running?'is-running':''}" type="button" data-task-open="${esc(t.id)}" data-task-run="${esc(run)}">${done?`<div class="caseCardTop"><span class="caseCardTag">${esc(t.title)}</span>${seenRuns[t.id]!==t.resultVersion?'<span class="dayUnreadDot" role="img" aria-label="未读结果"></span>':''}</div><h2>${esc(t.resultHeadline||plainSummary(t.summary).split(/[。！？]/)[0].slice(0,64))}</h2><p>${esc(t.resultDescription||plainSummary(t.summary))}</p>`:`<div class="caseCardTop dayTaskStatus">${active?`<span class="dayRunSpinner ${running?'':'is-queued'}" aria-hidden="true"></span>`:''}<span>${esc(label)}</span></div><h2>${esc(t.title)}</h2><p class="dayTaskDescription">${esc(description)}</p>`}</button>`;
    }).join('')}</div>`:`<p class="dayHomeEmpty">${scene?'今天的这一时段暂无任务。':'正在同步交易日历…'}</p>`);
  }

  function visibleTasks() {
    const query=$('taskSearch').value.trim().toLowerCase();
    const presets=sceneTasks.slice().sort((a,b)=>Number((b.scene||b.stage)===homeScene())-Number((a.scene||a.stage)===homeScene())||Number(!!b.activeRun)-Number(!!a.activeRun)||String(a.nextAt||'').localeCompare(String(b.nextAt||'')));
    return [...tasks,...presets].filter(t=>(filter==='all'||filter==='active'&&t.enabled&&!completed(t)||filter==='paused'&&!t.enabled&&!completed(t)||filter==='completed'&&completed(t))&&(!query||`${t.title} ${t.question}`.toLowerCase().includes(query)));
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
    if(sharedEntry && selectedId===sharedEntry.task.id && !rows.some(t=>t.id===selectedId))rows.push({...sharedEntry.task,sharedReadOnly:true});
    $('taskSidebarList').innerHTML=taskRows(sidebarExpanded?rows:rows.slice(0,5),true)||'<p class="taskListEmpty">暂无符合条件的任务</p>';
    $('taskSidebarExpand').hidden=rows.length<=5;
    $('taskSidebarExpand').textContent=sidebarExpanded?'收起显示':'展开显示';
    $('taskSidebarSectionTitle').textContent={all:'即将执行',active:'活动任务',paused:'已暂停',completed:'已完成'}[filter];
    $('taskLandingList').innerHTML=taskRows(rows)||'<p class="taskListEmpty">暂无符合条件的任务</p>';
    $('taskFilter').value=$('taskSidebarFilter').value=filter;
    const hasPresets=sceneTasks.length>0;if(hasPresets&&!recommendationScene)recommendationScene=homeScene()||'pre';
    $('taskSceneTabs').hidden=!hasPresets;document.querySelector('.taskRecommendations').classList.toggle('has-scenes',hasPresets);
    $('taskSceneTabs').innerHTML=hasPresets?Object.entries(sceneCopy).map(([key,copy])=>`<button type="button" data-recommendation-scene="${key}" aria-pressed="${key===recommendationScene}">${copy.emoji} ${copy.label}</button>`).join(''):'';
    const items=hasPresets?recommendations.filter(t=>t.stage===recommendationScene):recommendations;
    $('taskRecommendations').innerHTML=items.map(item=>`<button type="button" class="taskRecommendation" data-recommendation="${item.id}"><span class="taskTemplateIcon" aria-hidden="true">${item.icon}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.description)}</small></span><span aria-hidden="true">＋</span></button>`).join('');
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
    if(!active){stopFollowup();stopRun();}
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
    $('taskInfoCard').hidden=true;
    $('taskRunNow').hidden=$('taskToggle').hidden=!canEdit;
    $('taskRunNow').disabled=!!task.activeRun;$('taskRunNow').textContent=task.activeRun?'运行中…':'立即运行';
    $('taskToggle').textContent=completed(task)?'重新安排':task.enabled?'暂停':'开启';
    $('taskScheduleSummary').textContent=`${flags[task.market]} ${names[task.market]} · ${schedule(task)}`;
    $('taskCardTitle').textContent=task.title+' ›';$('taskCardStatus').textContent=canEdit?status(task):task.systemPreset?'公共研究任务':'分享结果';$('taskChatForm').hidden=!!task.activeRun;
    renderLists();
  }
  function finishRunThinking(article,task){
    const trigger=article.querySelector('.thinkingTrigger');if(!trigger)return;
    const replacement=trigger.cloneNode(true);replacement.classList.remove('is-thinking');replacement.setAttribute('aria-label','打开任务设置：'+task.title);
    const text=replacement.querySelector('.thinkingSummaryText');if(text)text.textContent=task.title;
    replacement.onclick=()=>edit(selected()||task,!editable(selected()||task));trigger.replaceWith(replacement);
  }
  async function streamRun(data,task,version,container){
    if(typeof createAssistantMessage!=='function'||typeof readEventStream!=='function'){
      const p=document.createElement('p');p.className='taskResultEmpty';p.textContent=data.status==='queued'?'任务正在排队。':'正在运行任务';container.append(p);return;
    }
    const controller=new AbortController();runController=controller;$('taskChatForm').hidden=true;
    const article=createAssistantMessage(data.question||task.question,{target:container,taskContext:{id:`task-${task.id}-${data.runId}`,title:task.title,question:data.question||task.question}});
    if(data.cachedDate&&Number.isFinite(Date.parse(data.cachedDate)))article.dataset.startedAt=String(Date.parse(data.cachedDate));
    let cursor=0,terminal='',final=false;
    try{
      while(!controller.signal.aborted&&version===viewVersion){
        const response=await fetch('/api/day/tasks/'+encodeURIComponent(task.id)+'/runs/'+encodeURIComponent(data.runId)+'/events?after='+cursor,{signal:controller.signal});
        if(!response.ok||!response.body)throw new Error('暂时无法连接任务进度，请稍后重新打开。');
        await readEventStream(response.body,(event,payload)=>{
          if(controller.signal.aborted||version!==viewVersion)return;
          if(payload._taskEventId){if(payload._taskEventId<=cursor)return;cursor=payload._taskEventId;}
          if(event==='run_state'){terminal=payload.status;return;}
          handleStreamEvent(article,event,payload);
          if(event==='final'){final=true;finishRunThinking(article,task);}
        });
        if(terminal)break;
        await new Promise(resolve=>setTimeout(resolve,1200));
      }
      if(controller.signal.aborted||version!==viewVersion)return;
      if(terminal==='success'){
        if(!final){const saved=await api('tasks/'+task.id+'/runs/'+data.runId);if(version!==viewVersion)return;article.replaceChildren();await renderTaskAnswer(article,saved.answer,data.question||task.question);}
        markSeen(task,data.runId);
      }
      if(runController===controller)runController=null;
      lastDetailState='';await refresh();
    }catch(error){if(!controller.signal.aborted&&version===viewVersion){lastDetailState='';const p=document.createElement('p');p.className='taskResultEmpty';p.textContent=error.message;article.append(p);}}
    finally{if(runController===controller)runController=null;}
  }
  async function paintRun(data, task, version) {
    if(version!==viewVersion)return;
    $('taskInfoCard').hidden=true;
    const container=$('taskThread');
    container.querySelectorAll('.streamvizArtifactHost').forEach(host=>window.AimeStreamViz?.unmount?.(host));
    container.replaceChildren();
    renderTaskUser(task.systemPreset?task.question:(data.question||task.question),[],container,task);
    if(['queued','running'].includes(data.status)){void streamRun(data,task,version,container);return;}
    const article=document.createElement('article');article.className='message assistant';container.append(article);
    if(data.answer){await renderTaskAnswer(article,structuredClone(data.answer),data.question||task.question);if(version===viewVersion)markSeen(task,data.runId||selectedRun);}
    else {const text=document.createElement('p');text.className='taskResultEmpty';text.textContent=data.error||(data.status==='running'?'正在云端执行，完成后会自动显示结果。':data.status==='queued'?'任务正在排队。':data.status==='success'?'这条旧记录未保留完整内容。新运行会保留近期对话结果。':'本次执行没有生成结果。');article.append(text);}
    if(version===viewVersion)await loadFollowups(data,task,version);
  }
  async function selectTask(id, {updateUrl=true, runId='', shared=false}={}) {
    const task=[...tasks,...sceneTasks].find(t=>t.id===id) || (sharedEntry?.task.id===id?sharedEntry.task:null);
    if(!task)throw new Error('任务不存在，或当前浏览器没有该任务的访问权限');
    resetFollowup();selectedId=id;selectedRun=runId;pinnedRun=!!runId;resultVersion='';const version=++viewVersion;
    prepareDetail(task,editable(task));lastDetailState=detailState(task);
    $('taskThread').innerHTML='<p class="taskResultEmpty" role="status">正在读取任务运行记录…</p>';
    if(updateUrl)writeUrl(id,false,shared,runId);
    if(!editable(task) && sharedEntry?.task.id===task.id) {
      $('taskRunSelect').hidden=true;$('taskRunState').textContent='分享的运行结果 · 可查看任务设置';
      await paintRun(sharedEntry,task,version);return;
    }
    const response=await api('tasks/'+id+'/runs');if(version!==viewVersion)return;
    const runs=response.runs;
    $('taskRunSelect').hidden=!runs.length;
    $('taskRunSelect').innerHTML=runs.map(r=>`<option value="${r.id}">${esc(dateText(r.finished||r.created,zoneFor(task)))} · ${({success:'已完成',failed:'失败',queued:'排队中',running:'运行中'})[r.status]}</option>`).join('');
    if(!runs.length) {
      if(task.systemPreset || (task.enabled && task.nextAt)){
        const waiting=document.createElement('section');waiting.className='taskWaitingState';waiting.setAttribute('role','status');
        waiting.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><h2>等待执行</h2><p>任务开启时间</p><time></time>';
        const time=waiting.querySelector('time');time.textContent=task.nextAt?dateText(task.nextAt,zoneFor(task)):'暂无执行安排';if(task.nextAt)time.dateTime=task.nextAt;
        $('taskThread').replaceChildren(waiting);$('taskRunState').textContent='';$('taskChatForm').hidden=true;return;
      }
      renderCreatedTask(task);
      $('taskRunState').textContent=task.enabled?'已开启 · 云端将按计划执行':'任务已暂停';
      resultVersion=task.resultVersion;
      await loadFollowups({question:task.question,answer:{interpretation:`任务已${task.enabled?'创建并启用':'暂停'}：${task.title}。执行安排：${schedule(task)}。${task.nextAt?'首次执行：'+dateText(task.nextAt,zoneFor(task)):''}。任务内容：${task.question}`}},task,version);await loadTaskConfirmation(task,version);return;
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
      const data=await api('tasks');tasks=data.tasks;sceneTasks=data.sceneTasks||[];markets=data.markets;publicKey=data.pushPublicKey;serverDelta=new Date(data.serverTime).getTime()-Date.now();lastRefresh=Date.now();
      renderHome();renderLists();
      if(initialTask){const id=initialTask;initialTask=null;await selectTask(id,{updateUrl:false,runId:initialRun});}
      else if(!workspace.hidden && selectedId) {
        const task=selected();
        if(task && (editable(task)||task.systemPreset)) {
          if(!runController)prepareDetail(task,editable(task));
          if(!chatController&&!runController&&detailState(task)!==lastDetailState) await selectTask(task.id,{updateUrl:false,runId:pinnedRun?selectedRun:''});
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
    $('dayDialogTitle').textContent=readOnly?'定时任务设置':editing?'编辑任务':'新建任务';
    $('daySave').textContent=editing?'保存':'创建';$('daySave').hidden=readOnly;
    $('dayAdvanced').open=false;
    $('dayEnablePush').hidden=readOnly;
    updateFields();
    if(readOnly)form.querySelectorAll('input,select,textarea').forEach(e=>e.disabled=true);
    window.VeyaTaskEditor?.reset(task,readOnly);
    if(!dialog.open)dialog.showModal();
    dialog.querySelector('.dayDialogBody').scrollTop=0;
    message(readOnly?(task?.systemPreset?'这是按计划执行的公共预制任务，可查看任务参数。':'这是分享的运行结果。请在创建任务的浏览器中编辑任务。'):'','dayDialogMessage');
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
  function visibleQuestion(d){return String(d.question||'').replace(/\{\{market\}\}/g,names[d.market]).replace(/\{\{symbols\}\}/g,d.symbols||(d.assetType==='watchlist'?'待确认的自选股':'全市场')).replace(/\{\{date\}\}/g,'执行当天');}
  async function beginWizard(question,preset=null){
    showLanding(false);$('taskLanding').hidden=true;$('taskWizard').hidden=false;$('taskClarification').hidden=false;$('taskPageTitle').textContent='新建任务';$('taskBack').hidden=false;
    wizardStep=0;wizardDraft={...(preset||{}),question:preset?.question||question,originalQuestion:question,questions:[],answers:[],focus:[],scopeNote:'',reply:'正在理解任务并确认需要补充的参数…',ready:false,startedAt:Date.now(),activity:[{title:'收到任务问句',detail:question}]};
    renderWizardTranscript();await requestPlan();
  }
  function wizardAnswers(d){return (d.answers||[]).map(a=>({question:a.question,answer:a.answer}));}
  function renderWizardTranscript(submitting=false){
    const d=wizardDraft,target=$('taskWizardTranscript');target.replaceChildren();renderTaskUser(d.originalQuestion,[],target);
    for(const round of d.rounds||[]){const a=document.createElement('article');a.className='message assistant';const b=document.createElement('div');b.className='bubble assistantBubble';b.textContent=round.reply;a.append(b);target.append(a);renderTaskUser(round.answers.map(a=>`> ${a.question}\n${a.answer}`).join('\n\n'),[],target);}
    const article=d.activityArticle||document.createElement('article');d.activityArticle=article;article.className='message assistant';article.dataset.lang='zh-CN';article.dataset.startedAt=d.startedAt;article.dataset.thinkingState=d.planning||submitting?'active':'done';article.activityEnded=!(d.planning||submitting);article.activitySources=[];
    article.innerHTML=`<div class="bubble assistantBubble"><button type="button" class="thinkingTrigger ${d.planning||submitting?'is-thinking':'is-complete'}" aria-label="查看任务配置过程"><span class="thinkingSummaryText">${esc(submitting?'正在创建计划任务…':d.planning?d.reply:'查看任务配置过程')}</span><span class="thinkingChevron" aria-hidden="true"></span></button><ol class="thinkingSteps" hidden>${(d.activity||[]).map(a=>`<li class="is-done"><div class="activityStepTitle">${esc(a.title)}</div><div class="activityStepDetail">${esc(a.detail||'')}</div></li>`).join('')}</ol>${!d.planning&&!submitting?`<p class="wizardIntro">${esc(d.reply)}</p>`:''}</div>`;
    article.querySelector('.thinkingTrigger').onclick=()=>{if(typeof toggleActivityDrawer==='function')toggleActivityDrawer(article);};target.append(article);if(typeof syncActivityDrawer==='function')syncActivityDrawer(article);target.scrollTop=target.scrollHeight;
  }
  function collectWizard(){if(!wizardDraft)return;const q=wizardDraft.questions[wizardStep];if(!q)return;
    const control=$('wizardAnswer');let value;
    if(q.options.length){const chosen=[...document.querySelectorAll('[name=wizardAnswer]:checked')];value=q.multiple?chosen.map(e=>q.options[Number(e.value)].value):chosen.length?q.options[Number(chosen[0].value)].value:undefined;}
    else if(control){value=control.value;if(q.field==='monthDay')value=Number(value);if(q.field==='weekdays')value=String(value).split(',').filter(Boolean).map(Number);}
    q.selection=value;q.custom=$('wizardCustomAnswer')?.value||'';q.value=q.custom.trim()?[...(Array.isArray(value)?value:value===undefined||value===''?[]:[value]),q.custom.trim()].join('；'):value;if(!q.custom.trim()&&value!==undefined&&(value!==''||q.field==='endDate')&&q.field!=='question')wizardDraft[q.field]=value;
  }
  function answerLabel(q){if(q.custom?.trim())return String(q.value);if(q.options.length){const values=Array.isArray(q.value)?q.value:[q.value];return q.options.filter(o=>values.includes(o.value)).map(o=>o.label).join('、');}return q.field==='endDate'&&!q.value?'永不':String(q.value??'');}
  function renderWizard(){const d=wizardDraft;if(!d)return;
    $('taskClarification').hidden=false;$('wizardError').textContent='';$('wizardPrevious').disabled=wizardStep===0;$('wizardForward').disabled=wizardStep>=d.questions.length-1;
    $('wizardProgress').textContent=d.questions.length?`${wizardStep+1} / ${d.questions.length}`:'';
    const q=d.questions[wizardStep];$('wizardQuestionTitle').textContent=q?q.question:'确认任务安排';let content='';
    if(q){
      if(q.options.length){content=`<div class="wizardFocusOptions">${q.options.map((o,i)=>{const selected=q.selection??q.value,values=Array.isArray(selected)?selected:[selected];return `<label><input type="${q.multiple?'checkbox':'radio'}" name="wizardAnswer" value="${i}" ${values.includes(o.value)?'checked':''}/><span>${esc(o.label)}</span></label>`;}).join('')}</div>`;}
      else if(q.field==='timezone'){content=`<label class="wizardField">时区<select id="wizardAnswer">${[...el('timezone').options].map(o=>`<option value="${esc(o.value)}" ${o.value===(q.selection??q.value)?'selected':''}>${esc(o.textContent)}</option>`).join('')}</select></label>`;}
      else if(q.field==='cadence'){content=`<label class="wizardField">重复<select id="wizardAnswer"><option value="">请选择</option>${Object.entries(cadences).map(([v,label])=>`<option value="${v}" ${v===(q.selection??q.value)?'selected':''}>${label}</option>`).join('')}</select></label>`;}
      else {const type=q.field==='time'?'time':['date','endDate'].includes(q.field)?'date':q.field==='monthDay'?'number':'text';content=q.field==='question'?`<label class="wizardField">任务内容<textarea id="wizardAnswer" maxlength="6000" rows="4">${esc(q.value||'')}</textarea></label>`:`<label class="wizardField">${esc(q.question)}<input id="wizardAnswer" type="${type}" ${type==='number'?'min="1" max="31"':''} maxlength="6000" value="${esc(Array.isArray(q.selection??q.value)?(q.selection??q.value).join(','):q.selection??q.value??'')}"/></label>`;}
      if(q.options.length||!['title','question'].includes(q.field))content+=`<label class="wizardField wizardCustomField"><textarea id="wizardCustomAnswer" rows="2" maxlength="3000" aria-label="自定义回答" placeholder="输入你的回答或补充要求…">${esc(q.custom||'')}</textarea></label>`;
    }else content=`<div class="wizardSummary"><strong>${esc(d.title||'')}</strong><p>${esc(d.question||'')}</p><p>${esc(schedule(d))}</p>${d.endDate?`<p>结束日期：${esc(d.endDate)}</p>`:''}</div>`;
    $('wizardQuestion').innerHTML=content+`<div class="wizardActions"><button type="button" class="dayButton dayPrimary" id="wizardNext">${q?(wizardStep===d.questions.length-1?'发送回答并创建':'下一步'):'创建任务'}</button></div>`;
  }
  async function requestPlan(){const d=wizardDraft;if(!d||d.planning)return;d.planning=true;(d.activity||=[]).push({title:'请求任务配置模型',detail:'根据任务面板支持的参数生成草稿与澄清问题。'});renderWizardTranscript();$('taskClarification').hidden=true;const version=viewVersion;
    try{const plan=await api('plan','POST',{message:d.originalQuestion,draft:Object.fromEntries(['title','question','market','stage','assetType','symbols','cadence','date','endDate','weekdays','monthDay','time','timeMode','offset','timezone'].filter(k=>d[k]!==undefined).map(k=>[k,d[k]])),answers:(d.answers||[]).map(({field,question,value})=>({field,question,value}))});if(wizardDraft!==d||workspace.hidden||version!==viewVersion)return;
      Object.assign(d,plan.draft,{reply:plan.reply,questions:plan.questions,ready:plan.ready});d.planning=false;d.activity.push({title:plan.ready?'任务参数已确认':'需要补充参数',detail:plan.reply});wizardStep=0;renderWizardTranscript();renderWizard();
    }catch(error){if(wizardDraft!==d||workspace.hidden||version!==viewVersion)return;d.planning=false;d.reply='暂时未能生成任务配置，请重试。';d.activity.push({title:'配置请求失败',detail:error.message});renderWizardTranscript();$('taskClarification').hidden=false;$('wizardQuestionTitle').textContent='配置生成失败';$('wizardProgress').textContent='';$('wizardPrevious').disabled=$('wizardForward').disabled=true;$('wizardQuestion').innerHTML='<div class="wizardActions"><button type="button" class="dayButton dayPrimary" id="wizardRetry">重试</button></div>';$('wizardError').textContent=error.message;}
    finally{d.planning=false;}
  }
  async function advanceWizard(){if(saving||!wizardDraft||wizardDraft.planning)return;collectWizard();const d=wizardDraft,q=d.questions[wizardStep];
    if(q){if(q.field!=='endDate'&&(q.value===undefined||q.value===''||(Array.isArray(q.value)&&!q.value.length)))throw new Error('请先回答这个问题');
      const control=$('wizardAnswer');if(control&&!q.custom?.trim()&&!control.checkValidity())throw new Error('请填写有效的参数');
      if(wizardStep<d.questions.length-1){wizardStep++;renderWizard();return;}
      const answers=d.questions.map(q=>({field:q.field,question:q.question,value:q.value,answer:answerLabel(q)}));d.answers.push(...answers);d.activity.push({title:'收到澄清回答',detail:answers.map(a=>a.question+' '+a.answer).join('；')});(d.rounds||= []).push({reply:d.reply,answers});d.reply='正在根据你的回答生成任务配置…';renderWizardTranscript();await requestPlan();if(wizardDraft===d&&d.ready&&!d.questions.length)await saveDraft();return;
    }
    if(d.ready)await saveDraft();
  }
  async function saveDraft(){if(saving||!wizardDraft?.ready)return;saving=true;const d=wizardDraft,record={question:d.originalQuestion,answers:wizardAnswers(d),activity:d.activity||[]};
    const data={};for(const key of ['title','question','market','stage','assetType','symbols','cadence','date','endDate','weekdays','monthDay','time','timeMode','offset','timezone'])if(d[key]!==undefined)data[key]=d[key];data.enabled=true;data.browser=data.feishu=data.serverchan=data.wecom=false;
    d.activity.push({title:'保存任务',detail:schedule(d)});$('taskClarification').hidden=true;renderWizardTranscript(true);
    try{const task=await api('tasks','POST',data);tasks.push(task);rememberCreation(task.id,record);if(wizardDraft!==d||$('taskWizard').hidden||workspace.hidden){renderHome();renderLists();return;}wizardDraft=null;renderHome();try{await selectTask(task.id);}catch{prepareDetail(task,true);renderCreatedTask(task);writeUrl(task.id);await loadFollowups({question:task.question},task,viewVersion);await loadTaskConfirmation(task,viewVersion);}message('','taskMessage');}
    catch(error){if(wizardDraft!==d||workspace.hidden)return;renderWizard();$('wizardError').textContent=error.message;throw error;}finally{saving=false;}
  }
  function confirmationConfig(t){return JSON.stringify([t.title,t.question,t.cadence,t.time,t.timezone,t.weekdays,t.monthDay,t.date,t.endDate,t.enabled]);}
  function renderCreatedTask(task){const target=$('taskThread');target.replaceChildren();$('taskInfoCard').hidden=true;const record=creationRecord(task.id);
    renderTaskUser(record?.question||visibleQuestion(task),[],target,task);
    if(record?.answers?.length)renderTaskUser(record.answers.map(a=>`> ${a.question}\n${a.answer}`).join('\n\n'),[],target);
    const article=document.createElement('article');article.className='message assistant taskCreatedAnswer';article.dataset.lang='zh-CN';article.dataset.thinkingState='done';article.dataset.elapsedUnrecorded='true';article.activityEnded=true;article.activitySources=[];
    const reply=record?.confirmationConfig===confirmationConfig(task)?record.confirmation:'';
    article.innerHTML=`<div class="bubble assistantBubble"><button type="button" class="thinkingTrigger is-complete" aria-label="查看任务创建过程"><span class="thinkingSummaryText">查看任务创建过程</span><span class="thinkingChevron" aria-hidden="true"></span></button><ol class="thinkingSteps" hidden>${[...(record?.activity||[]),{title:'任务已保存',detail:task.title+' · '+schedule(task)}].map(a=>`<li class="is-done"><div class="activityStepTitle">${esc(a.title)}</div><div class="activityStepDetail">${esc(a.detail||'')}</div></li>`).join('')}</ol><div class="taskCreatedLink"><span class="taskCreatedClock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l-3 3"/></svg></span><div><strong>${esc(task.title)}</strong><small>${esc(schedule(task))}</small></div><button class="dayButton" type="button" data-edit-task="1">打开</button></div><div class="taskCreatedReply">${esc(reply||'')}</div></div>`;
    article.querySelector('.thinkingTrigger').onclick=()=>{if(typeof toggleActivityDrawer==='function')toggleActivityDrawer(article);};target.append(article);requestAnimationFrame(()=>article.scrollIntoView?.({block:'start'}));
  }
  async function loadTaskConfirmation(task,version){if(!editable(task))return;
    const config=confirmationConfig(task),record=creationRecord(task.id)||{},reply=$('taskThread').querySelector('.taskCreatedReply');if(!reply)return;
    if(record.confirmationConfig===config&&record.confirmation)return;
    reply.textContent='正在生成确认答复…';
    try{const result=await api('tasks/'+task.id+'/confirmation','POST');if(!result.answer)throw new Error('确认答复暂时未能生成');rememberCreation(task.id,{...record,confirmation:result.answer,confirmationConfig:config});if(version===viewVersion&&selectedId===task.id)reply.textContent=result.answer;}
    catch(error){if(version!==viewVersion||selectedId!==task.id)return;reply.innerHTML='<button type="button" class="dayTextButton" data-confirmation-retry="1">重新生成确认答复</button>';}
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
  function openTaskMenu(button){if(menuAnchor===button&&!taskMenu.hidden){closeTaskMenu();return;}closeTaskMenu();const task=[...tasks,...sceneTasks].find(t=>t.id===button.dataset.taskMore)||(sharedEntry?.task.id===button.dataset.taskMore?sharedEntry.task:null);if(!task)return;
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
  taskMenu.addEventListener('click',async event=>{const button=event.target.closest('[data-task-action]');if(!button||button.disabled)return;const task=[...tasks,...sceneTasks].find(t=>t.id===menuTaskId)||(sharedEntry?.task.id===menuTaskId?sharedEntry.task:null),action=button.dataset.taskAction;closeTaskMenu();if(!task)return;
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
  function newTask() {if(!$('taskWizard').hidden)showLanding();wizardDraft=null;edit(template());}
  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.taskMore){event.stopPropagation();openTaskMenu(b);return;}
    try {
      if(b.dataset.taskOpen){await selectTask(b.dataset.taskOpen,{runId:b.dataset.taskRun||''});return;}
      if(b.dataset.template){const d=template(b.dataset.template);beginWizard(visibleQuestion(d),d);return;}
      if(b.dataset.recommendationScene){recommendationScene=b.dataset.recommendationScene;renderLists();return;}
      if(b.dataset.recommendation){const item=recommendations.find(r=>r.id===b.dataset.recommendation);if(item){const d=recommendedTask(item);beginWizard(visibleQuestion(d),d);}return;}
      if(b.dataset.confirmationRetry){const task=selected();if(task)await loadTaskConfirmation(task,viewVersion);return;}
      if(b.dataset.editTask){const task=selected();if(task)edit(task,!editable(task));return;}


      switch(b.id){
        case'dayCustomizeTasks':case'navTasks':case'railTasks':showLanding();if(!mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(false);break;
        case'navHome':case'railHome':if(typeof startNewChat==='function')startNewChat(false,false);if(!mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(false);break;
        case'taskBack':case'wizardClose':showLanding();break;
        case'taskSidebarNew':case'taskOpenCreate':newTask();break;
        case'taskSearchToggle':{const field=$('taskSearchField');field.hidden=!field.hidden;b.setAttribute('aria-expanded',String(!field.hidden));if(!field.hidden)$('taskSearch').focus();else{$('taskSearch').value='';renderLists();}break;}
        case'taskSidebarExpand':sidebarExpanded=!sidebarExpanded;renderLists();break;
        case'taskSettings':if(selected())edit(selected(),!editable(selected()));break;
        case'taskToggle':if(completed(selected())){edit(selected());break;}b.disabled=true;await toggleTask(selected());b.disabled=false;break;
        case'taskRunNow':b.disabled=true;await api('tasks/'+selectedId+'/run','POST');pinnedRun=false;await refresh();await selectTask(selectedId,{updateUrl:false});message('任务已提交到云端，关闭页面后仍会执行。','taskMessage');break;
        case'wizardPrevious':collectWizard();wizardStep=Math.max(0,wizardStep-1);renderWizard();break;
                case'wizardRetry':await requestPlan();break;
        case'wizardNext':case'wizardForward':case'wizardSkip':await advanceWizard();break;
      }
    }catch(error){if(!workspace.hidden&& !$('taskWizard').hidden)$('wizardError').textContent=error.message;else message(error.message);b.disabled=false;}
  });
  $('taskChatForm').addEventListener('submit',sendFollowup);
  $('taskAttachButton').addEventListener('click',()=>$('taskImageInput').click());
  $('taskImageInput').addEventListener('change',async e=>{await addTaskImages(e.target.files);e.target.value='';});
  $('taskAttachmentPreview').addEventListener('click',e=>{const button=e.target.closest('[data-remove-task-image]');if(button){taskImages.splice(Number(button.dataset.removeTaskImage),1);renderTaskImages();}});
  document.addEventListener('paste',e=>{if(workspace.hidden||$('taskDetail').hidden)return;const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();addTaskImages(files);}});
  function updateChatComposer(){const input=$('taskChatInput');input.style.overflowY='hidden';input.style.height='40px';const height=Math.max(40,Math.min(120,input.scrollHeight));input.style.height=height+'px';input.style.overflowY=input.scrollHeight>height?'auto':'hidden';input.closest('.taskChatComposer').classList.toggle('is-multiline',height>44);$('taskChatSend').classList.toggle('is-ready',!!input.value.trim());}
  $('taskChatInput').addEventListener('input',updateChatComposer);
  $('taskChatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('taskChatForm').requestSubmit();}});
  $('taskSearch').addEventListener('input',renderLists);
  for(const id of ['taskFilter','taskSidebarFilter'])$(id).addEventListener('change',e=>{filter=e.target.value;renderLists();});
  $('taskRunSelect').addEventListener('change',async e=>{try{await selectTask(selectedId,{runId:e.target.value});}catch(error){message(error.message);}});
  $('wizardQuestion').addEventListener('change',collectWizard);
  setInterval(()=>{if(updateDayHeader())renderHome();},1000);
  $('dayClose').onclick=$('dayCancelEdit').onclick=()=>dialog.close();
  form.addEventListener('change',updateFields);
  $('dayEnablePush').onclick=async()=>{const b=$('dayEnablePush');b.disabled=true;try{await enablePush();}catch(error){$('dayPushState').textContent=error.message;}finally{b.disabled=false;}};
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(saving)return;saving=true;$('daySave').disabled=true;
    try{const data=payload(),draft=wizardDraft&&!editing?{...wizardDraft,...data}:null;const task=await api('tasks'+(editing?'/'+editing:''),editing?'PUT':'POST',data);tasks=tasks.filter(t=>t.id!==task.id);tasks.push(task);if(draft)rememberCreation(task.id,{question:draft.originalQuestion,answers:wizardAnswers(draft),focus:[task.question]});dialog.close();wizardDraft=null;renderHome();await selectTask(task.id);message(editing?(task.enabled?'任务已保存，云端会按时运行。':'任务已保存为暂停状态。'):'','taskMessage');}
    catch(error){message(error.message,'dayDialogMessage');}finally{saving=false;$('daySave').disabled=false;}
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  window.addEventListener('veya:chat-navigate',()=>{closeTaskMenu();if(internalNavigation)return;shellMode(false);viewVersion++;selectedId='';const url=new URL(location.href);['tab','task','run','dayResult','dayShare'].forEach(k=>url.searchParams.delete(k));history.replaceState(null,'',url);});
  window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);if(p.get('dayShare'))openShared(p.get('dayShare')).catch(e=>message(e.message));else if(p.get('tab')==='tasks'){if(p.get('task'))selectTask(p.get('task'),{updateUrl:false,runId:p.get('run')||''}).catch(e=>message(e.message));else showLanding(false);}else shellMode(false);});
  window.matchMedia('(max-width: 760px)').addEventListener?.('change',()=>{if(!workspace.hidden)shellMode(true);});
  if(initial.get('tab')==='tasks'||initialTask)showLanding(false);
  if(initialShare)openShared(initialShare).catch(error=>{showLanding(false);message(error.message,'taskMessage');});
  refresh();
  setInterval(()=>{if(!document.hidden&&Date.now()-lastRefresh>([...tasks,...sceneTasks].some(t=>t.activeRun)?1500:15000))refresh();},2000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){const task=selected();if(!workspace.hidden&&task&&selectedRun===task.resultVersion&&document.querySelector('#taskThread .thinkingTrigger'))markSeen(task,selectedRun);refresh();}});
})();
